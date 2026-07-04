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
    
    data = [{
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
    } for sinif in siniflar]
    
    return JsonResponse({'siniflar': data})



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
    
    # Sınıfa kayıtlı öğrenci var mı kontrol et
    try:
        ogrenci_count = sinif.kayitlar.filter(aktif_mi=True).count() if hasattr(sinif, 'kayitlar') else 0
    except Exception:
        ogrenci_count = 0
    
    if ogrenci_count > 0:
        return JsonResponse({
            'error': f'Bu sınıfta {ogrenci_count} öğrenci kayıtlı. Önce öğrencileri başka sınıfa taşıyın.'
        }, status=400)
    
    sinif_ad = sinif.ad
    sinif.delete()
    
    return JsonResponse({
        'success': True,
        'message': f'"{sinif_ad}" sınıfı başarıyla silindi'
    })
