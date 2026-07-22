"""
Sinif API Views
CRUD operations for Classroom management
"""
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

import json

from apps.sinif.domain.models import Sinif
from apps.oda.domain.models import Oda
from apps.egitim_yili.domain.models import EgitimYili
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.academic.services.active_term import (
    ActiveTermError,
    get_active_term,
    get_active_term_or_none,
    term_to_dict,
)
from apps.sinif.application.placement_helpers import (
    assign_students_to_sinif,
    list_roster_students,
    placement_counts_for_term,
    remove_students_from_sinif,
)
from shared.context import get_secili_kurum_id, require_mandatory_sube_id
from shared.sube_context import assert_record_sube_access, resolve_mandatory_sube


def get_kurum_id(request):
    """
    Kurum ID'yi al.
    Öncelik sırası:
    1. HTTP Header (X-Kurum-ID) - Frontend Topbar seçimi
    2. Session (active_kurum_id)
    3. User attribute (kurum_id)
    4. Varsayılan aktif kurum
    """
    # Header'dan kontrol et
    kurum_id = request.headers.get('X-Kurum-ID')
    
    # Session'dan kontrol et
    if not kurum_id:
        kurum_id = request.session.get('active_kurum_id')
    
    # User attribute'dan kontrol et
    if not kurum_id:
        kurum_id = getattr(request.user, 'kurum_id', None)
    
    # Varsayılan kurum
    if not kurum_id:
        from apps.kurum.domain.models import Kurum
        kurum = Kurum.objects.filter(aktif_mi=True).first()
        kurum_id = kurum.id if kurum else None
    
    # String'den int'e çevir
    if kurum_id:
        kurum_id = int(kurum_id)
    
    return kurum_id


def get_sube_id(request):
    """
    Şube ID'yi al.
    """
    # Header'dan kontrol et
    sube_id = request.headers.get('X-Sube-ID')
    
    # Session'dan kontrol et
    if not sube_id:
        sube_id = request.session.get('active_sube_id')
    
    # User attribute'dan kontrol et
    if not sube_id:
        sube_id = getattr(request.user, 'sube_id', None)
    
    # String'den int'e çevir
    if sube_id:
        sube_id = int(sube_id)
    
    return sube_id


def get_egitim_yili_id(request):
    """
    Eğitim Yılı ID'yi al.
    Öncelik sırası:
    1. Query param (egitim_yili_id)
    2. HTTP Header (X-EgitimYili-ID) - Frontend Topbar seçimi
    3. Session (active_egitim_yili_id)
    4. Varsayılan aktif eğitim yılı
    """
    # Query param'dan kontrol et
    egitim_yili_id = request.GET.get('egitim_yili_id')
    
    # Header'dan kontrol et
    if not egitim_yili_id:
        egitim_yili_id = request.headers.get('X-EgitimYili-ID')
    
    # Session'dan kontrol et
    if not egitim_yili_id:
        egitim_yili_id = request.session.get('active_egitim_yili_id')
    
    # Varsayılan aktif eğitim yılı
    if not egitim_yili_id:
        egitim_yili = EgitimYili.objects.filter(aktif_mi=True).first()
        egitim_yili_id = egitim_yili.id if egitim_yili else None
    
    # String'den int'e çevir
    if egitim_yili_id:
        egitim_yili_id = int(egitim_yili_id)
    
    return egitim_yili_id


def _resolve_term_for_request(request, kurum_id: int, sube_id: int):
    """Query param term_id veya aktif dönem."""
    term_id_raw = request.GET.get('term_id')
    if term_id_raw:
        from apps.term.domain.models import Term
        try:
            term = Term.objects.get(
                id=int(term_id_raw),
                kurum_id=kurum_id,
                sube_id=sube_id,
            )
            return term, None
        except (ValueError, Term.DoesNotExist):
            return None, JsonResponse({'error': 'Geçersiz dönem'}, status=400)
    try:
        return get_active_term(kurum_id=kurum_id, sube_id=sube_id), None
    except ActiveTermError as exc:
        return None, None  # dönem yok — eski mevcutluk davranışı


def _serialize_sinif_row(sinif, mevcutluk: int) -> dict:
    doluluk = round((mevcutluk / sinif.kapasite * 100), 1) if sinif.kapasite else 0
    return {
        'id': sinif.id,
        'ad': sinif.ad,
        'kod': sinif.kod,
        'kapasite': sinif.kapasite,
        'mevcutluk': mevcutluk,
        'doluluk_orani': doluluk,
        'aktif_mi': sinif.aktif_mi,
        'egitim_yili': {
            'id': sinif.egitim_yili.id,
            'ad': sinif.egitim_yili.yil_str,
        },
        'sube': {
            'id': sinif.sube.id,
            'ad': sinif.sube.ad,
        },
        'oda': {
            'id': sinif.oda.id,
            'ad': sinif.oda.ad,
        } if sinif.oda else None,
        'sinif_seviyesi': {
            'id': sinif.sinif_seviyesi.id,
            'ad': sinif.sinif_seviyesi.ad,
        } if sinif.sinif_seviyesi else None,
        'created_at': sinif.created_at.isoformat() if sinif.created_at else None,
    }


@require_http_methods(["GET"])
def sinif_list_api(request):
    """
    Sınıf listesi
    GET /siniflar/api/
    
    Eğitim yılına göre filtreleme yapılır.
    Eğitim yılı: Header (X-EgitimYili-ID) veya query param (egitim_yili_id) ile belirlenir.
    """
    kurum_id = get_kurum_id(request)
    
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)

    sube_id, sube_err = resolve_mandatory_sube(request, kurum_id)
    if sube_err:
        return JsonResponse({'error': sube_err['error']}, status=sube_err['status'])
    
    # Filtreleme
    siniflar = Sinif.objects.filter(kurum_id=kurum_id, sube_id=sube_id).select_related(
        'sube', 'egitim_yili', 'oda', 'sinif_seviyesi'
    )
    
    # Eğitim yılı filtresi - Header veya query param'dan al
    egitim_yili_id = get_egitim_yili_id(request)
    if egitim_yili_id:
        siniflar = siniflar.filter(egitim_yili_id=egitim_yili_id)
    
    # Aktif filtresi
    aktif = request.GET.get('aktif')
    if aktif == 'true':
        siniflar = siniflar.filter(aktif_mi=True)
    elif aktif == 'false':
        siniflar = siniflar.filter(aktif_mi=False)

    sinif_list = list(siniflar)
    term, term_err = _resolve_term_for_request(request, kurum_id, sube_id)
    if term_err:
        return term_err

    if term:
        counts = placement_counts_for_term(term.id, [s.id for s in sinif_list])
        data = [_serialize_sinif_row(s, counts.get(s.id, 0)) for s in sinif_list]
        return JsonResponse({
            'siniflar': data,
            'aktif_donem': term_to_dict(term),
        })

    data = [_serialize_sinif_row(s, s.mevcutluk) for s in sinif_list]
    return JsonResponse({'siniflar': data})


@require_http_methods(["GET"])
def sinif_list_export_api(request):
    """Sınıf/Şube listesi — kurumsal Excel/CSV/JSON dışa aktarma."""
    from apps.sinif.application.export import (
        EXPORT_COLUMNS,
        MAX_EXPORT_ROWS,
        build_export_columns,
        build_export_meta,
        build_export_rows,
        build_export_stats,
        parse_column_keys,
    )
    from shared.export import CsvExportService, ExcelExportService

    kurum_id = get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)

    sube_id, sube_err = resolve_mandatory_sube(request, kurum_id)
    if sube_err:
        return JsonResponse({'error': sube_err['error']}, status=sube_err['status'])

    siniflar = Sinif.objects.filter(kurum_id=kurum_id, sube_id=sube_id).select_related(
        'sube', 'egitim_yili', 'oda', 'sinif_seviyesi',
    )

    egitim_yili_id = get_egitim_yili_id(request)
    egitim_yili = None
    if egitim_yili_id:
        siniflar = siniflar.filter(egitim_yili_id=egitim_yili_id)
        egitim_yili = EgitimYili.objects.filter(id=egitim_yili_id).first()

    aktif = request.GET.get('aktif')
    if aktif == 'true':
        siniflar = siniflar.filter(aktif_mi=True)
    elif aktif == 'false':
        siniflar = siniflar.filter(aktif_mi=False)

    column_keys = parse_column_keys(request.GET.get('columns'))
    sinif_list = list(siniflar.order_by('ad')[:MAX_EXPORT_ROWS])

    term, term_err = _resolve_term_for_request(request, kurum_id, sube_id)
    if term_err:
        return term_err
    mevcutluk_map = {}
    if term:
        from apps.sinif.application.roster_export import mevcutluk_map_for_siniflar
        mevcutluk_map = mevcutluk_map_for_siniflar(sinif_list, term.id)

    rows = build_export_rows(sinif_list, column_keys, mevcutluk_map=mevcutluk_map)
    export_format = (request.GET.get('format') or 'csv').lower()

    if export_format == 'json':
        return JsonResponse({
            'success': True,
            'columns': column_keys,
            'column_labels': [EXPORT_COLUMNS[k] for k in column_keys],
            'rows': rows,
            'total': len(rows),
        })

    columns = build_export_columns(column_keys)
    meta = build_export_meta(
        request, kurum_id=kurum_id, sube_id=sube_id, egitim_yili=egitim_yili,
    )

    if export_format == 'xlsx':
        stats = build_export_stats(sinif_list, mevcutluk_map=mevcutluk_map)
        return ExcelExportService.export(
            rows, columns, meta=meta, stats=stats, filename='sinif_listesi',
        )
    return CsvExportService.export(rows, columns, meta=meta, filename='sinif_listesi')


@require_http_methods(["GET"])
def sinif_detail_api(request, sinif_id):
    """
    Sınıf detay
    GET /siniflar/api/<sinif_id>/
    """
    kurum_id = get_kurum_id(request)
    
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)
    
    try:
        sinif = Sinif.objects.select_related(
            'sube', 'egitim_yili', 'oda', 'sinif_seviyesi'
        ).get(id=sinif_id, kurum_id=kurum_id)
    except Sinif.DoesNotExist:
        return JsonResponse({'error': 'Sınıf bulunamadı'}, status=404)

    gate = assert_record_sube_access(request, kurum_id, sinif.sube_id)
    if gate:
        return JsonResponse({'error': gate['error']}, status=gate['status'])
    
    data = {
        'id': sinif.id,
        'ad': sinif.ad,
        'kod': sinif.kod,
        'kapasite': sinif.kapasite,
        'mevcutluk': sinif.mevcutluk,
        'doluluk_orani': round(sinif.doluluk_orani, 1),
        'aktif_mi': sinif.aktif_mi,
        'egitim_yili': {
            'id': sinif.egitim_yili.id,
            'ad': sinif.egitim_yili.yil_str
        },
        'sube': {
            'id': sinif.sube.id,
            'ad': sinif.sube.ad
        },
        'oda': {
            'id': sinif.oda.id,
            'ad': sinif.oda.ad
        } if sinif.oda else None,
        'sinif_seviyesi': {
            'id': sinif.sinif_seviyesi.id,
            'ad': sinif.sinif_seviyesi.ad
        } if sinif.sinif_seviyesi else None,
        'created_at': sinif.created_at.isoformat() if sinif.created_at else None,
        'updated_at': sinif.updated_at.isoformat() if sinif.updated_at else None,
    }
    
    return JsonResponse(data)


@csrf_exempt

@require_http_methods(["POST"])
def sinif_create_api(request):
    """
    Yeni sınıf oluştur
    POST /siniflar/api/create/
    """
    kurum_id = get_kurum_id(request)
    
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)

    sube_id, sube_err = resolve_mandatory_sube(request, kurum_id)
    if sube_err:
        return JsonResponse({'error': sube_err['error']}, status=sube_err['status'])
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Geçersiz JSON'}, status=400)
    
    # Zorunlu alanlar
    egitim_yili_id = data.get('egitim_yili_id')
    ad = data.get('ad', '').strip()
    
    if not egitim_yili_id:
        return JsonResponse({'error': 'Eğitim yılı seçimi zorunludur'}, status=400)
    if not ad:
        return JsonResponse({'error': 'Sınıf adı zorunludur'}, status=400)
    
    # Eğitim yılı kontrolü (EgitimYili global tablodur, kurum_id yok)
    try:
        egitim_yili = EgitimYili.objects.get(id=egitim_yili_id)
    except EgitimYili.DoesNotExist:
        return JsonResponse({'error': 'Geçersiz eğitim yılı'}, status=400)
    
    # Şube — zorunlu bağlam
    request_sube_id = sube_id
    
    # Aynı yıl+şube'de aynı isimde sınıf var mı?
    if Sinif.objects.filter(
        kurum_id=kurum_id, 
        sube_id=request_sube_id,
        egitim_yili=egitim_yili, 
        ad=ad
    ).exists():
        return JsonResponse({'error': 'Bu eğitim yılında aynı isimde sınıf zaten var'}, status=400)
    
    # Oda kontrolü (opsiyonel)
    oda = None
    oda_id = data.get('oda_id')
    if oda_id:
        try:
            oda = Oda.objects.get(id=oda_id, kurum_id=kurum_id)
        except Oda.DoesNotExist:
            return JsonResponse({'error': 'Geçersiz oda'}, status=400)
    
    # Seviye kontrolü (opsiyonel - SinifSeviyesi genel tanım tablosu, kurum bazlı değil)
    sinif_seviyesi = None
    seviye_id = data.get('sinif_seviyesi_id')
    if seviye_id:
        try:
            sinif_seviyesi = SinifSeviyesi.objects.get(
                id=seviye_id, sube_id=request_sube_id, aktif_mi=True,
            )
        except SinifSeviyesi.DoesNotExist:
            return JsonResponse({'error': 'Geçersiz sınıf seviyesi'}, status=400)
    
    # Sınıf oluştur
    sinif = Sinif.objects.create(
        kurum_id=kurum_id,
        sube_id=request_sube_id,
        egitim_yili=egitim_yili,
        ad=ad,
        kod=data.get('kod', ''),
        kapasite=data.get('kapasite', 30),
        oda=oda,
        sinif_seviyesi=sinif_seviyesi,
        aktif_mi=data.get('aktif_mi', True)
    )
    
    return JsonResponse({
        'success': True,
        'message': 'Sınıf başarıyla oluşturuldu',
        'sinif': {
            'id': sinif.id,
            'ad': sinif.ad,
            'egitim_yili': {
                'id': sinif.egitim_yili.id,
                'ad': sinif.egitim_yili.yil_str
            },
            'oda': {
                'id': sinif.oda.id,
                'ad': sinif.oda.ad
            } if sinif.oda else None
        }
    }, status=201)


@csrf_exempt

@require_http_methods(["PUT", "PATCH"])
def sinif_update_api(request, sinif_id):
    """
    Sınıf güncelle
    PUT/PATCH /siniflar/api/<sinif_id>/update/
    """
    kurum_id = get_kurum_id(request)
    
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)
    
    try:
        sinif = Sinif.objects.get(id=sinif_id, kurum_id=kurum_id)
    except Sinif.DoesNotExist:
        return JsonResponse({'error': 'Sınıf bulunamadı'}, status=404)

    gate = assert_record_sube_access(request, kurum_id, sinif.sube_id)
    if gate:
        return JsonResponse({'error': gate['error']}, status=gate['status'])
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Geçersiz JSON'}, status=400)
    
    # Güncellenebilir alanlar
    
    # Şube değiştirme — aktif bağlam dışına taşınmaz
    if 'sube_id' in data and data['sube_id']:
        active_sube_id, sube_err = resolve_mandatory_sube(request, kurum_id)
        if sube_err:
            return JsonResponse({'error': sube_err['error']}, status=sube_err['status'])
        if int(data['sube_id']) != int(active_sube_id):
            return JsonResponse({'error': 'Sınıf başka şubeye taşınamaz'}, status=400)
    
    # Eğitim yılı değiştirme
    if 'egitim_yili_id' in data and data['egitim_yili_id']:
        try:
            sinif.egitim_yili = EgitimYili.objects.get(id=data['egitim_yili_id'])
        except EgitimYili.DoesNotExist:
            return JsonResponse({'error': 'Geçersiz eğitim yılı'}, status=400)
    
    if 'ad' in data:
        new_ad = data['ad'].strip()
        if new_ad:
            # Aynı yılda aynı isimde başka sınıf var mı?
            if Sinif.objects.filter(
                kurum_id=kurum_id,
                sube=sinif.sube,
                egitim_yili=sinif.egitim_yili,
                ad=new_ad
            ).exclude(id=sinif_id).exists():
                return JsonResponse({'error': 'Bu eğitim yılında aynı isimde sınıf zaten var'}, status=400)
            sinif.ad = new_ad
    
    if 'kod' in data:
        sinif.kod = data['kod']
    
    if 'kapasite' in data:
        sinif.kapasite = data['kapasite']
    
    if 'aktif_mi' in data:
        sinif.aktif_mi = data['aktif_mi']
    
    # Oda değiştirme
    if 'oda_id' in data:
        if data['oda_id']:
            try:
                sinif.oda = Oda.objects.get(id=data['oda_id'], kurum_id=kurum_id)
            except Oda.DoesNotExist:
                return JsonResponse({'error': 'Geçersiz oda'}, status=400)
        else:
            sinif.oda = None
    
    # Seviye değiştirme (SinifSeviyesi genel tanım tablosu, kurum bazlı değil)
    if 'sinif_seviyesi_id' in data:
        if data['sinif_seviyesi_id']:
            try:
                sinif.sinif_seviyesi = SinifSeviyesi.objects.get(
                    id=data['sinif_seviyesi_id'], aktif_mi=True
                )
            except SinifSeviyesi.DoesNotExist:
                return JsonResponse({'error': 'Geçersiz sınıf seviyesi'}, status=400)
        else:
            sinif.sinif_seviyesi = None
    
    sinif.save()
    
    return JsonResponse({
        'success': True,
        'message': 'Sınıf başarıyla güncellendi',
        'sinif': {
            'id': sinif.id,
            'ad': sinif.ad,
            'kapasite': sinif.kapasite,
            'oda': {
                'id': sinif.oda.id,
                'ad': sinif.oda.ad
            } if sinif.oda else None
        }
    })


@csrf_exempt

@require_http_methods(["DELETE"])
def sinif_delete_api(request, sinif_id):
    """
    Sınıf sil
    DELETE /siniflar/api/<sinif_id>/delete/
    """
    kurum_id = get_kurum_id(request)
    
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)
    
    try:
        sinif = Sinif.objects.get(id=sinif_id, kurum_id=kurum_id)
    except Sinif.DoesNotExist:
        return JsonResponse({'error': 'Sınıf bulunamadı'}, status=404)

    gate = assert_record_sube_access(request, kurum_id, sinif.sube_id)
    if gate:
        return JsonResponse({'error': gate['error']}, status=gate['status'])
    
    # Sınıfa kayıtlı öğrenci var mı kontrol et (dönem yerleşimi + yıllık kayıt)
    from apps.academic.domain.student_class_placement import StudentClassPlacement
    from apps.academic.services.active_academic_year import get_active_academic_year

    placement_count = 0
    try:
        active_year = get_active_academic_year()
        placement_count = StudentClassPlacement.objects.filter(
            academic_year=active_year,
            classroom_id=sinif.id,
            is_active=True,
        ).count()
    except Exception:
        placement_count = 0

    try:
        ogrenci_count = sinif.kayitlar.filter(aktif_mi=True).count() if hasattr(sinif, 'kayitlar') else 0
    except Exception:
        ogrenci_count = 0

    block_count = max(placement_count, ogrenci_count)
    if block_count > 0:
        return JsonResponse({
            'error': (
                f'Bu sınıfta {block_count} öğrenci yerleşimi/kaydı var. '
                'Önce öğrencileri başka sınıfa taşıyın.'
            ),
        }, status=400)
    
    sinif_ad = sinif.ad
    sinif.delete()
    
    return JsonResponse({
        'success': True,
        'message': f'"{sinif_ad}" sınıfı başarıyla silindi'
    })


@require_http_methods(["GET"])
def sinif_aktif_donem_api(request):
    """GET /siniflar/api/aktif-donem/ — aktif eğitim dönemi."""
    kurum_id = get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)

    sube_id, sube_err = resolve_mandatory_sube(request, kurum_id)
    if sube_err:
        return JsonResponse({'error': sube_err['error']}, status=sube_err['status'])

    term = get_active_term_or_none(kurum_id=kurum_id, sube_id=sube_id)
    if not term:
        return JsonResponse({'aktif_donem': None})

    return JsonResponse({'aktif_donem': term_to_dict(term)})


@require_http_methods(["GET"])
def sinif_atanmamis_ogrenciler_api(request, sinif_id):
    """GET /siniflar/api/<id>/atanmamis-ogrenciler/?term_id= — seviye öğrenci roster'ı."""
    kurum_id = get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)

    sube_id, sube_err = resolve_mandatory_sube(request, kurum_id)
    if sube_err:
        return JsonResponse({'error': sube_err['error']}, status=sube_err['status'])

    try:
        sinif = Sinif.objects.select_related('sinif_seviyesi').get(id=sinif_id, kurum_id=kurum_id)
    except Sinif.DoesNotExist:
        return JsonResponse({'error': 'Sınıf bulunamadı'}, status=404)

    gate = assert_record_sube_access(request, kurum_id, sinif.sube_id)
    if gate:
        return JsonResponse({'error': gate['error']}, status=gate['status'])

    term, term_err = _resolve_term_for_request(request, kurum_id, sube_id)
    if term_err:
        return term_err
    if not term:
        return JsonResponse({'error': 'Aktif dönem bulunamadı'}, status=400)

    seviye_id = sinif.sinif_seviyesi_id
    if not seviye_id:
        return JsonResponse({'error': 'Sınıf seviyesi tanımlı değil'}, status=400)

    ogrenciler = list_roster_students(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili_id=sinif.egitim_yili_id,
        sinif_seviyesi_id=seviye_id,
        term_id=term.id,
        target_sinif_id=sinif.id,
    )
    mevcutluk = placement_counts_for_term(term.id, [sinif.id]).get(sinif.id, 0)
    return JsonResponse({
        'ogrenciler': ogrenciler,
        'aktif_donem': term_to_dict(term),
        'sinif': {
            'id': sinif.id,
            'ad': sinif.ad,
            'kapasite': sinif.kapasite,
            'mevcutluk': mevcutluk,
        },
    })


@csrf_exempt
@require_http_methods(["POST"])
def sinif_ogrenci_ata_api(request, sinif_id):
    """POST /siniflar/api/<id>/ogrenci-ata/ — dönem bazlı toplu atama."""
    kurum_id = get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)

    sube_id, sube_err = resolve_mandatory_sube(request, kurum_id)
    if sube_err:
        return JsonResponse({'error': sube_err['error']}, status=sube_err['status'])

    try:
        sinif = Sinif.objects.get(id=sinif_id, kurum_id=kurum_id)
    except Sinif.DoesNotExist:
        return JsonResponse({'error': 'Sınıf bulunamadı'}, status=404)

    gate = assert_record_sube_access(request, kurum_id, sinif.sube_id)
    if gate:
        return JsonResponse({'error': gate['error']}, status=gate['status'])

    try:
        data = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Geçersiz JSON'}, status=400)

    term_id = data.get('term_id')
    student_ids = data.get('student_ids') or []
    if not isinstance(student_ids, list) or not student_ids:
        return JsonResponse({'error': 'Öğrenci listesi zorunludur'}, status=400)

    if not term_id:
        term = get_active_term_or_none(kurum_id=kurum_id, sube_id=sube_id)
        if not term:
            return JsonResponse({'error': 'Aktif dönem bulunamadı'}, status=400)
        term_id = term.id

    try:
        student_ids = [int(sid) for sid in student_ids]
    except (TypeError, ValueError):
        return JsonResponse({'error': 'Geçersiz öğrenci ID listesi'}, status=400)

    result = assign_students_to_sinif(
        sinif=sinif,
        term_id=int(term_id),
        student_ids=student_ids,
    )
    mevcutluk = placement_counts_for_term(int(term_id), [sinif.id]).get(sinif.id, 0)

    return JsonResponse({
        'success': True,
        'message': 'Öğrenci ataması tamamlandı',
        'result': result,
        'mevcutluk': mevcutluk,
    })


@csrf_exempt
@require_http_methods(["POST"])
def sinif_ogrenci_cikar_api(request, sinif_id):
    """POST /siniflar/api/<id>/ogrenci-cikar/ — öğrenciyi bu sınıftan çıkar."""
    kurum_id = get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)

    sube_id, sube_err = resolve_mandatory_sube(request, kurum_id)
    if sube_err:
        return JsonResponse({'error': sube_err['error']}, status=sube_err['status'])

    try:
        sinif = Sinif.objects.get(id=sinif_id, kurum_id=kurum_id)
    except Sinif.DoesNotExist:
        return JsonResponse({'error': 'Sınıf bulunamadı'}, status=404)

    gate = assert_record_sube_access(request, kurum_id, sinif.sube_id)
    if gate:
        return JsonResponse({'error': gate['error']}, status=gate['status'])

    try:
        data = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Geçersiz JSON'}, status=400)

    term_id = data.get('term_id')
    student_ids = data.get('student_ids') or []
    if not isinstance(student_ids, list) or not student_ids:
        return JsonResponse({'error': 'Öğrenci listesi zorunludur'}, status=400)

    if not term_id:
        term = get_active_term_or_none(kurum_id=kurum_id, sube_id=sube_id)
        if not term:
            return JsonResponse({'error': 'Aktif dönem bulunamadı'}, status=400)
        term_id = term.id

    try:
        student_ids = [int(sid) for sid in student_ids]
    except (TypeError, ValueError):
        return JsonResponse({'error': 'Geçersiz öğrenci ID listesi'}, status=400)

    result = remove_students_from_sinif(
        sinif=sinif,
        term_id=int(term_id),
        student_ids=student_ids,
    )

    return JsonResponse({
        'success': True,
        'message': 'Öğrenci sınıftan çıkarıldı',
        'result': result,
        'mevcutluk': result['mevcutluk'],
    })


@require_http_methods(["GET"])
def sinif_roster_export_api(request):
    """GET /siniflar/api/roster-export/ — dönem bazlı sınıf öğrenci listeleri."""
    from apps.sinif.application.roster_export import (
        ROSTER_EXPORT_COLUMNS,
        DEFAULT_ROSTER_KEYS,
        build_roster_export_meta,
        build_roster_export_stats,
        build_roster_groups,
        export_grouped_csv_response,
        export_grouped_xlsx_response,
        parse_roster_column_keys,
        parse_sinif_ids_param,
        resolve_siniflar_for_scope,
        scope_display_label,
    )

    kurum_id = get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)

    sube_id, sube_err = resolve_mandatory_sube(request, kurum_id)
    if sube_err:
        return JsonResponse({'error': sube_err['error']}, status=sube_err['status'])

    scope = (request.GET.get('scope') or 'sinif').lower()
    if scope not in ('sinif', 'seviye', 'all', 'custom'):
        return JsonResponse({'error': 'Geçersiz scope'}, status=400)

    egitim_yili_id = get_egitim_yili_id(request)
    egitim_yili = None
    if egitim_yili_id:
        egitim_yili = EgitimYili.objects.filter(id=egitim_yili_id).first()

    sinif_id_raw = request.GET.get('sinif_id')
    sinif_id = int(sinif_id_raw) if sinif_id_raw else None
    seviye_raw = request.GET.get('sinif_seviyesi_id')
    sinif_seviyesi_id = int(seviye_raw) if seviye_raw else None
    sinif_ids = parse_sinif_ids_param(request.GET.get('sinif_ids'))

    term, term_err = _resolve_term_for_request(request, kurum_id, sube_id)
    if term_err:
        return term_err
    if not term:
        return JsonResponse({'error': 'Aktif dönem bulunamadı'}, status=400)

    try:
        siniflar = resolve_siniflar_for_scope(
            kurum_id=kurum_id,
            sube_id=sube_id,
            scope=scope,
            egitim_yili_id=egitim_yili_id,
            sinif_id=sinif_id,
            sinif_seviyesi_id=sinif_seviyesi_id,
            sinif_ids=sinif_ids,
        )
    except ValueError as exc:
        return JsonResponse({'error': str(exc)}, status=400)

    if not siniflar:
        return JsonResponse({'error': 'Seçilen kriterlere uygun sınıf bulunamadı'}, status=404)

    groups = build_roster_groups(siniflar, term.id)
    column_keys = parse_roster_column_keys(request.GET.get('columns'))
    export_format = (request.GET.get('format') or 'csv').lower()

    sinif_ad = siniflar[0].ad if scope == 'sinif' and len(siniflar) == 1 else ''
    seviye_ad = ''
    if scope == 'seviye' and siniflar and siniflar[0].sinif_seviyesi:
        seviye_ad = siniflar[0].sinif_seviyesi.ad
    scope_label = scope_display_label(scope, sinif_ad=sinif_ad, seviye_ad=seviye_ad)

    if export_format == 'json':
        from apps.ogrenci.interfaces.list_helpers import format_export_row

        keys = [k for k in column_keys if k in ROSTER_EXPORT_COLUMNS] or list(DEFAULT_ROSTER_KEYS)
        formatted_groups = []
        for group in groups:
            formatted_groups.append({
                **group,
                'rows': [format_export_row(row, keys) for row in group['rows']],
            })
        return JsonResponse({
            'success': True,
            'scope': scope,
            'scope_label': scope_label,
            'aktif_donem': term_to_dict(term),
            'columns': keys,
            'column_labels': [ROSTER_EXPORT_COLUMNS[k] for k in keys],
            'groups': formatted_groups,
            'total_students': sum(g['ogrenci_sayisi'] for g in groups),
        })

    meta = build_roster_export_meta(
        request,
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili=egitim_yili,
        term_name=term.name,
        scope_label=scope_label,
    )

    if export_format == 'xlsx':
        stats = build_roster_export_stats(groups)
        return export_grouped_xlsx_response(
            groups,
            column_keys,
            meta,
            stats,
            filename='sinif_ogrenci_listesi',
        )
    return export_grouped_csv_response(
        groups,
        column_keys,
        meta,
        filename='sinif_ogrenci_listesi',
    )
