"""
Ogrenci Views
DDD Pattern - Interfaces
"""
import json
import logging
import re
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.db import models
from datetime import datetime

from apps.ogrenci.application.services import OgrenciService
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli
from apps.egitim_yili.domain.models import EgitimYili

logger = logging.getLogger(__name__)


def _json_str(data: dict, key: str, default: str = '') -> str:
    value = data.get(key, default)
    if value is None:
        return default
    return str(value).strip()


VELI_SMS_CATEGORIES = frozenset({'duyuru', 'devamsizlik', 'odeme'})


def _sync_term_placement_from_kayit(ogrenci, sinif_id):
    """Öğrenci detay sayfasından yapılan sınıf değişikliğini aktif döneme
    ait StudentClassPlacement kaydına da yansıtır.

    Eğitim Tanımları > Sınıflar sekmesindeki "Öğrenci" ataması dönem bazlı
    yerleşim (StudentClassPlacement) üzerinden çalışır; buradan (öğrenci
    detay sayfası) yapılan sınıf değişikliği de aynı tabloya yazılmazsa iki
    ekran arasında tutarsızlık oluşur. Bu senkron en iyi çaba (best-effort)
    prensibiyle çalışır — başarısız olsa da öğrenci güncellemesini bloklamaz.
    """
    if not ogrenci.kurum_id or not ogrenci.sube_id:
        return
    try:
        from apps.academic.services.active_term import get_active_term_or_none
        from apps.sinif.application.placement_helpers import (
            assign_students_to_sinif,
            remove_students_from_sinif,
            get_student_term_classroom,
        )
        from apps.sinif.domain.models import Sinif

        aktif_donem = get_active_term_or_none(kurum_id=ogrenci.kurum_id, sube_id=ogrenci.sube_id)
        if not aktif_donem:
            return

        if sinif_id:
            try:
                sinif = Sinif.objects.get(id=sinif_id)
            except Sinif.DoesNotExist:
                return
            assign_students_to_sinif(sinif=sinif, term_id=aktif_donem.id, student_ids=[ogrenci.id])
        else:
            mevcut_sinif = get_student_term_classroom(student_id=ogrenci.id, term_id=aktif_donem.id)
            if mevcut_sinif:
                remove_students_from_sinif(
                    sinif=mevcut_sinif, term_id=aktif_donem.id, student_ids=[ogrenci.id],
                )
    except Exception:
        logger.exception(
            'Öğrenci #%s için dönem bazlı sınıf yerleşimi senkronize edilemedi', ogrenci.id,
        )


def _normalize_sms_bildirimleri(raw, *, default_on_create: bool = False) -> list[str]:
    if raw is None:
        return ['duyuru', 'devamsizlik'] if default_on_create else []
    if not isinstance(raw, list):
        return ['duyuru']
    return [
        code for code in (str(c).strip().lower() for c in raw)
        if code in VELI_SMS_CATEGORIES
    ]


def _veli_api_dict(veli: OgrenciVeli) -> dict:
    from apps.ogrenci.application.veli_telefon import (
        ensure_telefonlar_populated,
        normalize_telefonlar,
    )
    if ensure_telefonlar_populated(veli):
        try:
            veli.save(update_fields=['telefonlar'])
        except Exception:
            pass
    telefonlar = normalize_telefonlar(
        getattr(veli, 'telefonlar', None),
        fallback_telefon=veli.telefon or '',
    )
    return {
        'id': veli.id,
        'veli_turu': veli.veli_turu,
        'veli_turu_display': dict(OgrenciVeli.VELI_TURU_CHOICES).get(veli.veli_turu, veli.veli_turu),
        'tc_kimlik_no': veli.tc_kimlik_no or '',
        'ad': veli.ad,
        'soyad': veli.soyad,
        'tam_ad': f"{veli.ad} {veli.soyad}".strip(),
        'telefon': veli.telefon or '',
        'telefonlar': telefonlar,
        'email': veli.email or '',
        'meslek': veli.meslek or '',
        'varsayilan': veli.varsayilan,
        'sms_bildirimleri': veli.sms_bildirimleri or [],
    }


def get_current_context(request):
    """
    Mevcut kurum, şube ve eğitim yılı bilgisini al.
    
    Öncelik sırası:
    1. HTTP Headers (X-Kurum-ID, X-Sube-ID, X-EgitimYili-ID) - Frontend Topbar seçimi
    2. Session
    3. Varsayılan (ilk aktif kayıt)
    """
    # Önce Header'lardan oku (Frontend seçimi)
    kurum_id = request.headers.get('X-Kurum-ID') or request.session.get('active_kurum_id')
    sube_id = request.headers.get('X-Sube-ID') or request.session.get('active_sube_id')
    egitim_yili_id = request.headers.get('X-EgitimYili-ID') or request.session.get('active_egitim_yili_id')
    
    # String'den int'e çevir
    kurum_id = int(kurum_id) if kurum_id else None
    sube_id = int(sube_id) if sube_id else None
    egitim_yili_id = int(egitim_yili_id) if egitim_yili_id else None
    
    # Eğer kurum/şube yoksa varsayılan olanları al
    if not kurum_id:
        from apps.kurum.domain.models import Kurum
        kurum = Kurum.objects.filter(aktif_mi=True).first()
        kurum_id = kurum.id if kurum else None
    
    if not sube_id:
        from apps.sube.domain.models import Sube
        sube = Sube.objects.filter(aktif_mi=True).first()
        sube_id = sube.id if sube else None
    
    # Eğitim yılı
    egitim_yili = None
    if egitim_yili_id:
        try:
            egitim_yili = EgitimYili.objects.get(id=egitim_yili_id)
        except EgitimYili.DoesNotExist:
            egitim_yili = None
            egitim_yili_id = None
    
    if not egitim_yili:
        from apps.egitim_yili.application.defaults import pick_default_egitim_yili
        egitim_yili = pick_default_egitim_yili()
        egitim_yili_id = egitim_yili.id if egitim_yili else None
    
    return {
        'kurum_id': kurum_id,
        'sube_id': sube_id,
        'egitim_yili_id': egitim_yili_id,
        'egitim_yili': egitim_yili,
    }


@login_required
def ogrenci_listesi(request):
    """Öğrenci listesi sayfası"""
    ctx = get_current_context(request)
    service = OgrenciService()
    
    search_query = request.GET.get('q', '')
    
    if search_query:
        ogrenciler = service.search(search_query, ctx['kurum_id'], ctx['sube_id'])
    else:
        ogrenciler = service.get_all(ctx['kurum_id'], ctx['sube_id'])
    
    toplam_ogrenci = service.get_count(ctx['kurum_id'], ctx['sube_id'])
    aktif_ogrenci = service.get_count(ctx['kurum_id'], ctx['sube_id'], aktif_only=True)
    
    context = {
        'ogrenciler': ogrenciler,
        'egitim_yili': ctx['egitim_yili'],
        'toplam_ogrenci': toplam_ogrenci,
        'aktif_ogrenci': aktif_ogrenci,
        'search_query': search_query,
    }
    
    return render(request, 'ogrenci/ogrenci_listesi.html', context)


def ogrenci_list_api(request):
    """
    Öğrenci listesi API — filtre, sayfalama ve akıllı arama.
    """
    from apps.ogrenci.interfaces.list_helpers import (
        parse_list_params,
        build_kayit_queryset,
        serialize_kayit_row,
        paginate_queryset,
        compute_filter_counts,
        build_ogrenci_kalemler_map,
    )
    from apps.ogrenci.interfaces.sube_context import mandatory_ogrenci_context

    ctx, err = mandatory_ogrenci_context(request)
    if err:
        return err
    params = parse_list_params(request)

    base_qs, use_all_years = build_kayit_queryset(ctx, params, apply_durum=False)
    filter_counts = compute_filter_counts(base_qs)

    qs, _ = build_kayit_queryset(ctx, params, apply_durum=True)
    items, pagination = paginate_queryset(qs, params['page'], params['page_size'])

    filter_kalemler = list(params.get('kalemler') or [])

    kalemler_map = build_ogrenci_kalemler_map(items, filter_kalemler=filter_kalemler or None)

    if use_all_years and ctx.get('egitim_yili_id') and params['all_years']:
        filter_mode = 'tum_yillar'
    elif ctx.get('egitim_yili_id') and not use_all_years:
        filter_mode = 'yillik'
    else:
        filter_mode = 'tum'

    response_data = {
        'success': True,
        'ogrenciler': [
            serialize_kayit_row(
                k,
                include_egitim_yili=use_all_years,
                egitim_kalemleri=kalemler_map.get(k.id, []),
            ) for k in items
        ],
        'egitim_yili': (
            {
                'id': ctx['egitim_yili'].id,
                'yil_str': ctx['egitim_yili'].yil_str,
            }
            if ctx.get('egitim_yili') and not use_all_years
            else None
        ),
        'toplam_ogrenci': pagination['total_count'],
        'aktif_ogrenci': filter_counts['aktif'],
        'search_query': params['q'],
        'filter_mode': filter_mode,
        **pagination,
        'filter_counts': filter_counts,
    }

    if (
        params['q']
        and pagination['total_count'] == 0
        and ctx.get('egitim_yili_id')
        and not params['all_years']
    ):
        all_years_params = {**params, 'all_years': True}
        all_years_qs, _ = build_kayit_queryset(ctx, all_years_params, apply_durum=True)
        response_data['all_years_count'] = all_years_qs.count()

    return JsonResponse(response_data)


def ogrenci_list_export_api(request):
    """CSV export — aynı filtreler, max 5000 satır."""
    from apps.ogrenci.interfaces.list_helpers import (
        parse_list_params,
        parse_int_list_param,
        build_kayit_queryset,
        serialize_kayit_row,
        build_csv_response,
        build_excel_response,
        build_export_meta,
        build_json_export_response,
        build_ogrenci_kalemler_map,
        build_primary_coach_name_map,
        MAX_EXPORT_ROWS,
    )

    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    from apps.ogrenci.interfaces.sube_context import mandatory_ogrenci_context

    ctx, err = mandatory_ogrenci_context(request)
    if err:
        return err
    params = parse_list_params(request)
    qs, _ = build_kayit_queryset(ctx, params, apply_durum=True)

    ids = parse_int_list_param(request.GET.get('ids') or '')
    if ids:
        qs = qs.filter(ogrenci_id__in=ids)

    kayitlar = list(qs[:MAX_EXPORT_ROWS])

    filter_kalemler = list(params.get('kalemler') or [])

    kalemler_map = build_ogrenci_kalemler_map(
        kayitlar, filter_kalemler=filter_kalemler or None,
    )
    coach_map = build_primary_coach_name_map([k.ogrenci_id for k in kayitlar])
    column_keys = [c.strip() for c in request.GET.get('columns', '').split(',') if c.strip()]
    rows = [
        serialize_kayit_row(
            k,
            include_egitim_yili=True,
            egitim_kalemleri=kalemler_map.get(k.id, []),
            koc_adi=coach_map.get(k.ogrenci_id, ''),
        )
        for k in kayitlar
    ]
    export_format = (request.GET.get('format') or 'csv').lower()
    if export_format == 'json':
        return build_json_export_response(rows, column_keys)

    report_title = (request.GET.get('report_title') or '').strip() or 'ÖĞRENCİ LİSTESİ'
    if len(report_title) > 120:
        report_title = report_title[:120]
    meta = build_export_meta(request, ctx, report_title=report_title)
    if export_format == 'xlsx':
        return build_excel_response(rows, column_keys, meta=meta)
    return build_csv_response(rows, column_keys, meta=meta)


def ogrenci_filter_options_api(request):
    """Filtre drawer seçenekleri."""
    from apps.ogrenci.interfaces.list_helpers import build_kalem_gruplari
    from apps.egitim_tanimlari.models import SinifSeviyesi
    from apps.kurum.services.kayit_tanimlari_service import list_registration_types
    from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
    from apps.sinif.domain.models import Sinif

    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    from apps.ogrenci.interfaces.sube_context import mandatory_ogrenci_context

    ctx, err = mandatory_ogrenci_context(request)
    if err:
        return err

    sinif_seviyeleri = [
        {'id': s.id, 'ad': s.ad, 'kod': s.kod, 'sira': s.sira}
        for s in SinifSeviyesi.objects.filter(
            aktif_mi=True,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        ).order_by('sira', 'ad')
    ]
    giris_turu = [
        {'value': key, 'label': label}
        for key, label in OgrenciKayit.GIRIS_TURU_CHOICES
    ]
    cinsiyet = [
        {'value': key, 'label': label}
        for key, label in Ogrenci.CINSIYET_CHOICES
    ]
    kayit_turleri = [
        {'value': opt.code, 'label': opt.label}
        for opt in list_registration_types()
    ]
    kalem_gruplari = build_kalem_gruplari(ctx)
    egitim_kalemleri = []
    for grup in kalem_gruplari:
        for kalem in grup['kalemler']:
            egitim_kalemleri.append({
                'kalem_turu': grup['tur'],
                'kalem_id': kalem['kalem_id'],
                'kalem_adi': kalem['kalem_adi'],
            })

    sinif_qs = Sinif.objects.filter(
        kurum_id=ctx['kurum_id'],
        sube_id=ctx['sube_id'],
        aktif_mi=True,
    ).select_related('sinif_seviyesi')
    if ctx.get('egitim_yili_id'):
        sinif_qs = sinif_qs.filter(egitim_yili_id=ctx['egitim_yili_id'])

    siniflar = [
        {
            'id': s.id,
            'ad': s.ad,
            'sinif_seviyesi_id': s.sinif_seviyesi_id,
        }
        for s in sinif_qs.order_by('ad')
    ]

    from apps.okul.models import Okul
    from apps.egitim_tanimlari.models import Alan

    okullar = [
        {
            'id': o.id,
            'ad': o.ad,
            'okul_turu': o.okul_turu or '',
        }
        for o in Okul.objects.filter(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            aktif_mi=True,
        ).order_by('ad')
    ]

    alanlar = [
        {'id': a.id, 'ad': a.ad, 'kod': a.kod}
        for a in Alan.objects.filter(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            aktif_mi=True,
        ).order_by('sira', 'ad')
    ]

    from django.db.models import Q
    from apps.coaching.models import CoachProfile, CoachStudentAssignment
    from apps.personel.domain.models import PersonelGorevlendirme

    coach_ids_in_sube = CoachStudentAssignment.objects.filter(
        end_date__isnull=True,
        student__kurum_id=ctx['kurum_id'],
        student__sube_id=ctx['sube_id'],
    ).values_list('coach_id', flat=True)
    personel_ids = PersonelGorevlendirme.objects.filter(
        kurum_id=ctx['kurum_id'],
        gorev_sube_id=ctx['sube_id'],
        aktif_mi=True,
    ).values_list('personel_id', flat=True)
    rehberler = [
        {'id': c.id, 'ad': c.teacher.tam_ad}
        for c in CoachProfile.objects.filter(is_active=True)
        .filter(Q(id__in=coach_ids_in_sube) | Q(teacher_id__in=personel_ids))
        .select_related('teacher')
        .order_by('teacher__ad', 'teacher__soyad')
    ]

    return JsonResponse({
        'success': True,
        'sinif_seviyeleri': sinif_seviyeleri,
        'giris_turu': giris_turu,
        'kayit_turleri': kayit_turleri,
        'cinsiyet': cinsiyet,
        'kalem_gruplari': kalem_gruplari,
        'egitim_kalemleri': egitim_kalemleri,
        'siniflar': siniflar,
        'okullar': okullar,
        'alanlar': alanlar,
        'rehberler': rehberler,
    })


def _format_date_short(value):
    return value.strftime('%d.%m.%Y') if value else ''


def _ogrenci_sube_gate(request, ogrenci):
    """Aktif şube bağlamının öğrenci kaydıyla eşleştiğini doğrular."""
    from apps.ogrenci.interfaces.sube_context import assert_ogrenci_record_sube_access
    return assert_ogrenci_record_sube_access(request, ogrenci.kurum_id, ogrenci.sube_id)


def ogrenci_akademik_api(request, pk):
    """Öğrenci akademik geçmiş — kayıtlar, sözleşme kalemleri ve ek hizmetler."""
    from apps.ogrenci.domain.models import OgrenciEkHizmet
    from apps.ogrenci.interfaces.list_helpers import (
        FILTER_KALEM_TURLERI,
        _catalog_kalem_adi,
        resolve_kalem_filter_turu,
        resolve_sinif_seviyesi_ad,
    )
    from apps.odeme_takip.domain.models import Sozlesme
    from apps.odeme_takip.domain.enums import SozlesmeDurum

    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    service = OgrenciService()
    ogrenci = service.get_by_id(pk)
    if not ogrenci:
        return JsonResponse({'error': 'Öğrenci bulunamadı'}, status=404)

    gate = _ogrenci_sube_gate(request, ogrenci)
    if gate:
        return gate

    kayitlar = OgrenciKayit.objects.filter(
        ogrenci=ogrenci
    ).select_related(
        'sinif', 'sinif__sinif_seviyesi', 'sinif_seviyesi', 'egitim_yili', 'sube', 'school'
    ).order_by('-egitim_yili__baslangic_yil', '-id')

    cancelled = [SozlesmeDurum.IPTAL, SozlesmeDurum.FESHEDILMIS]
    kalem_turu_labels = dict(FILTER_KALEM_TURLERI)

    kayit_list = []
    for kayit in kayitlar:
        sozlesmeler = Sozlesme.objects.filter(
            ogrenci=ogrenci,
            egitim_yili_id=kayit.egitim_yili_id,
        ).exclude(durum__in=cancelled).prefetch_related('kalemler').order_by('-created_at')

        kalemler = []
        seen_kalem = set()
        for sozlesme in sozlesmeler:
            for kalem in sozlesme.kalemler.all():
                resolved_tur = resolve_kalem_filter_turu(kalem, sozlesme)
                if not resolved_tur:
                    continue
                dedupe = (resolved_tur, kalem.kalem_id, sozlesme.id)
                if dedupe in seen_kalem:
                    continue
                seen_kalem.add(dedupe)
                kalem_adi = _catalog_kalem_adi(resolved_tur, kalem.kalem_id) or kalem.kalem_adi
                kalemler.append({
                    'kalem_turu': resolved_tur,
                    'kalem_turu_display': kalem_turu_labels.get(resolved_tur, resolved_tur),
                    'kalem_adi': kalem_adi,
                    'sozlesme_no': sozlesme.sozlesme_no,
                    'durum': sozlesme.durum,
                })

        ek_hizmetler = [
            {
                'ad': eh.ek_hizmet.ad,
                'aktif_mi': eh.aktif_mi,
            }
            for eh in OgrenciEkHizmet.objects.filter(
                ogrenci=ogrenci,
                egitim_yili_id=kayit.egitim_yili_id,
            ).select_related('ek_hizmet')
        ]

        kayit_list.append({
            'id': kayit.id,
            'egitim_yili': kayit.egitim_yili.yil_str if kayit.egitim_yili else '',
            'egitim_yili_id': kayit.egitim_yili_id,
            'sinif_ad': kayit.sinif.ad if kayit.sinif else '',
            'sinif_seviyesi': resolve_sinif_seviyesi_ad(kayit),
            'sube_ad': kayit.sube.ad if kayit.sube else '',
            'okul_no': kayit.okul_no or '',
            'kayit_tarihi': _format_date_short(kayit.kayit_tarihi),
            'giris_turu': kayit.giris_turu,
            'giris_turu_display': dict(OgrenciKayit.GIRIS_TURU_CHOICES).get(
                kayit.giris_turu, kayit.giris_turu
            ),
            'giris_tarihi': _format_date_short(kayit.giris_tarihi),
            'school_id': kayit.school_id,
            'school_ad': kayit.school.ad if kayit.school else '',
            'geldigi_okul': kayit.school.ad if kayit.school else (kayit.geldigi_okul or ''),
            'aktif_mi': kayit.aktif_mi,
            'kalemler': kalemler,
            'ek_hizmetler': ek_hizmetler,
        })

    return JsonResponse({
        'success': True,
        'kayitlar': kayit_list,
    })


@login_required
def ogrenci_detay(request, pk):
    """Öğrenci detay sayfası"""
    ogrenci = get_object_or_404(Ogrenci, pk=pk)
    
    context = {
        'ogrenci': ogrenci,
    }
    
    return render(request, 'ogrenci/ogrenci_detay.html', context)


@login_required
def ogrenci_duzenle(request, pk):
    """Öğrenci düzenleme sayfası"""
    ctx = get_current_context(request)
    ogrenci = get_object_or_404(Ogrenci, pk=pk)
    
    if request.method == 'POST':
        service = OgrenciService()
        
        dogum_tarihi = request.POST.get('dogum_tarihi')
        if dogum_tarihi:
            try:
                dogum_tarihi = datetime.strptime(dogum_tarihi, '%Y-%m-%d').date()
            except:
                dogum_tarihi = None
        
        data = {
            'tc_kimlik_no': request.POST.get('tc_kimlik_no') or None,
            'ad': request.POST.get('ad'),
            'soyad': request.POST.get('soyad'),
            'dogum_tarihi': dogum_tarihi,
            'cinsiyet': request.POST.get('cinsiyet') or None,
            'telefon': request.POST.get('telefon', ''),
            'email': request.POST.get('email', ''),
            'adres': request.POST.get('adres', ''),
            'veli_ad_soyad': request.POST.get('veli_ad_soyad', ''),
            'veli_telefon': request.POST.get('veli_telefon', ''),
            'aktif_mi': request.POST.get('aktif_mi') == 'on',
        }
        
        ogrenci, errors = service.update(pk, data)
        
        if errors:
            messages.error(request, f'Hata: {errors}')
        else:
            messages.success(request, f'{ogrenci.tam_ad} başarıyla güncellendi.')
            return redirect('ogrenci:ogrenci_listesi')
    
    context = {
        'ogrenci': ogrenci,
    }
    
    return render(request, 'ogrenci/ogrenci_duzenle.html', context)


@login_required
@require_POST
def ogrenci_delete(request, pk):
    """Öğrenci sil (pasife al)"""
    service = OgrenciService()
    ogrenci = service.get_by_id(pk)
    
    if ogrenci:
        success, errors = service.delete(pk)
        if errors:
            messages.error(request, f'Hata: {errors}')
        else:
            messages.success(request, f'{ogrenci.tam_ad} pasife alındı.')
    else:
        messages.error(request, 'Öğrenci bulunamadı.')
    
    return redirect('ogrenci:ogrenci_listesi')


@csrf_exempt
def ogrenci_api(request, pk):
    """
    Öğrenci API - GET: Detay, PUT: Güncelle
    Public endpoint for frontend
    """
    from apps.ogrenci.domain.models import OgrenciKayit, OgrenciAdres, OgrenciVeli
    
    service = OgrenciService()
    ogrenci = service.get_by_id(pk)
    
    if not ogrenci:
        return JsonResponse({'error': 'Öğrenci bulunamadı'}, status=404)

    gate = _ogrenci_sube_gate(request, ogrenci)
    if gate:
        return gate
    
    # PUT: Öğrenci güncelle
    if request.method == 'PUT':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Geçersiz JSON'}, status=400)
        
        # Tarih dönüşümü
        if data.get('dogum_tarihi'):
            try:
                from datetime import datetime
                data['dogum_tarihi'] = datetime.strptime(data['dogum_tarihi'], '%Y-%m-%d').date()
            except:
                data['dogum_tarihi'] = None
        
        # Update için gerekli alanları hazırla
        update_data = {}
        allowed_fields = ['ad', 'soyad', 'tc_kimlik_no', 'dogum_tarihi', 'cinsiyet', 
                         'telefon', 'email', 'adres', 'veli_ad_soyad', 'veli_telefon', 
                         'kayit_turu', 'aktif_mi']
        
        # String alanlar için boş string kabul eden alanlar (null olamaz)
        string_fields_no_null = ['email', 'telefon', 'adres', 'veli_ad_soyad', 'veli_telefon']
        
        for field in allowed_fields:
            if field in data:
                value = data[field]
                # Boş string veya None kontrolü
                if value == '' or value is None:
                    # Bu alanlar null olamaz, boş string olmalı
                    if field in string_fields_no_null:
                        update_data[field] = ''
                    else:
                        update_data[field] = None
                else:
                    update_data[field] = value
        
        # Güncelle
        updated_ogrenci, errors = service.update(pk, update_data)
        
        if errors:
            return JsonResponse({'success': False, 'errors': errors}, status=400)

        # Yıllık kayıt — sınıf / seviye / okul güncellemesi
        kayit_updates = {}
        if 'sinif_id' in data:
            sinif_val = data.get('sinif_id')
            kayit_updates['sinif_id'] = int(sinif_val) if sinif_val not in (None, '', 0) else None
        if 'sinif_seviyesi_id' in data:
            seviye_val = data.get('sinif_seviyesi_id')
            kayit_updates['sinif_seviyesi_id'] = int(seviye_val) if seviye_val not in (None, '', 0) else None
        if 'alan_id' in data:
            alan_val = data.get('alan_id')
            kayit_updates['alan_id'] = int(alan_val) if alan_val not in (None, '', 0) else None

        school_requested = 'school_id' in data
        if school_requested:
            from apps.okul.application.enrollment import resolve_school_for_enrollment

            school_val = data.get('school_id')
            if school_val in (None, '', 0, '0'):
                kayit_updates['school_id'] = None
            else:
                okul, school_err = resolve_school_for_enrollment(
                    school_val, ogrenci.kurum_id, ogrenci.sube_id,
                )
                if school_err:
                    return JsonResponse({'success': False, 'errors': {'school_id': school_err}}, status=400)
                kayit_updates['school_id'] = okul.id if okul else None

        if kayit_updates:
            aktif_kayit = OgrenciKayit.objects.filter(
                ogrenci_id=pk, aktif_mi=True,
            ).order_by('-egitim_yili__baslangic_yil', '-created_at').first()
            if aktif_kayit:
                update_fields = []
                if 'sinif_id' in kayit_updates:
                    aktif_kayit.sinif_id = kayit_updates['sinif_id']
                    update_fields.append('sinif_id')
                if 'sinif_seviyesi_id' in kayit_updates:
                    aktif_kayit.sinif_seviyesi_id = kayit_updates['sinif_seviyesi_id']
                    update_fields.append('sinif_seviyesi_id')
                if 'alan_id' in kayit_updates:
                    aktif_kayit.alan_id = kayit_updates['alan_id']
                    update_fields.append('alan_id')
                if 'school_id' in kayit_updates:
                    aktif_kayit.school_id = kayit_updates['school_id']
                    aktif_kayit.geldigi_okul = ''
                    update_fields.extend(['school_id', 'geldigi_okul'])
                if update_fields:
                    aktif_kayit.save(update_fields=update_fields)

                if 'sinif_id' in kayit_updates:
                    _sync_term_placement_from_kayit(ogrenci, kayit_updates['sinif_id'])

        return JsonResponse({
            'success': True,
            'message': f'{updated_ogrenci.tam_ad} başarıyla güncellendi',
            'ogrenci': {
                'id': updated_ogrenci.id,
                'ad': updated_ogrenci.ad,
                'soyad': updated_ogrenci.soyad,
                'tam_ad': updated_ogrenci.tam_ad,
            }
        })
    
    # GET: Öğrenci detay
    # Format dates
    def format_date(value, format_str='%d.%m.%Y'):
        return value.strftime(format_str) if value else ''
    
    # Aktif kayıt bilgisini al (en güncel yıl kaydı)
    aktif_kayit = OgrenciKayit.objects.filter(
        ogrenci=ogrenci,
        aktif_mi=True,
    ).select_related(
        'sinif', 'sinif__sinif_seviyesi', 'sinif_seviyesi', 'egitim_yili', 'alan', 'school'
    ).order_by('-egitim_yili__baslangic_yil', '-created_at').first()
    
    # Sınıf ve eğitim yılı bilgileri
    sinif_bilgi = None
    egitim_yili_bilgi = None
    sinif_seviyesi_bilgi = None
    alan_bilgi = None
    okul_no = ''
    school_id = None
    school_ad = ''
    geldigi_okul = ''
    
    kayit_tarihi = ''
    if aktif_kayit:
        okul_no = aktif_kayit.okul_no or ''
        school_id = aktif_kayit.school_id
        school_ad = aktif_kayit.school.ad if aktif_kayit.school else ''
        geldigi_okul = school_ad or (aktif_kayit.geldigi_okul or '')
        kayit_tarihi = format_date(aktif_kayit.kayit_tarihi) if aktif_kayit.kayit_tarihi else ''
        if aktif_kayit.sinif:
            sinif_bilgi = {
                'id': aktif_kayit.sinif.id,
                'ad': aktif_kayit.sinif.ad,
            }
        seviye_obj = aktif_kayit.sinif_seviyesi or (
            aktif_kayit.sinif.sinif_seviyesi if aktif_kayit.sinif else None
        )
        if seviye_obj:
            sinif_seviyesi_bilgi = {
                'id': seviye_obj.id,
                'ad': seviye_obj.ad,
                'kod': getattr(seviye_obj, 'kod', '') or '',
                'seviye': seviye_obj.seviye if hasattr(seviye_obj, 'seviye') else None,
            }
        if aktif_kayit.alan_id:
            alan_bilgi = {
                'id': aktif_kayit.alan_id,
                'ad': aktif_kayit.alan.ad,
                'kod': aktif_kayit.alan.kod,
            }
        if aktif_kayit.egitim_yili:
            egitim_yili_bilgi = {
                'id': aktif_kayit.egitim_yili.id,
                'ad': aktif_kayit.egitim_yili.yil_str,
            }

    donem_sinif_bilgi = None
    aktif_donem_bilgi = None
    if ogrenci.kurum_id and ogrenci.sube_id:
        from apps.academic.services.active_term import get_active_term_or_none, term_to_dict
        from apps.sinif.application.placement_helpers import get_student_term_classroom

        aktif_donem = get_active_term_or_none(kurum_id=ogrenci.kurum_id, sube_id=ogrenci.sube_id)
        if aktif_donem:
            aktif_donem_bilgi = term_to_dict(aktif_donem)
            donem_sinif = get_student_term_classroom(
                student_id=ogrenci.id,
                term_id=aktif_donem.id,
            )
            if donem_sinif:
                donem_sinif_bilgi = {'id': donem_sinif.id, 'ad': donem_sinif.ad}
    
    # Adres bilgileri - OgrenciAdres tablosundan
    adresler = []
    for adres in OgrenciAdres.objects.filter(ogrenci=ogrenci).order_by('-varsayilan', '-id'):
        adresler.append({
            'id': adres.id,
            'adres_turu': adres.adres_turu,
            'adres_turu_display': dict(OgrenciAdres.ADRES_TURU_CHOICES).get(adres.adres_turu, adres.adres_turu),
            'adres': adres.adres,
            'il': adres.il,
            'ilce': adres.ilce,
            'posta_kodu': adres.posta_kodu or '',
            'varsayilan': adres.varsayilan,
        })
    
    # Varsayılan adres
    varsayilan_adres = adresler[0] if adresler else None
    adres_text = ''
    if varsayilan_adres:
        adres_parts = [varsayilan_adres['adres']]
        if varsayilan_adres['ilce']:
            adres_parts.append(varsayilan_adres['ilce'])
        if varsayilan_adres['il']:
            adres_parts.append(varsayilan_adres['il'])
        adres_text = ', '.join(filter(None, adres_parts))
    
    # Veli bilgileri - OgrenciVeli tablosundan
    veliler = []
    for veli in OgrenciVeli.objects.filter(ogrenci=ogrenci).order_by('-varsayilan', '-id'):
        veliler.append(_veli_api_dict(veli))
    
    # Varsayılan veli (eski model uyumluluğu için)
    varsayilan_veli = veliler[0] if veliler else None
    
    # Ek hizmet bilgileri
    from apps.ogrenci.domain.models import OgrenciEkHizmet
    from apps.kurum.services.kayit_tanimlari_service import list_registration_types

    kayit_turu_code = ogrenci.kayit_turu or 'asil'
    kayit_turu_labels = {opt.code: opt.label for opt in list_registration_types()}
    kayit_turu_display = (
        kayit_turu_labels.get(kayit_turu_code)
        or dict(ogrenci.KAYIT_TURU_CHOICES).get(kayit_turu_code)
        or kayit_turu_code
    )

    ek_hizmetler = []
    for eh in OgrenciEkHizmet.objects.filter(
        ogrenci=ogrenci, aktif_mi=True
    ).select_related('ek_hizmet'):
        ek_hizmetler.append({
            'id': eh.id,
            'ek_hizmet_id': eh.ek_hizmet_id,
            'ad': eh.ek_hizmet.ad,
            'hizmet_turu': eh.ek_hizmet.hizmet_turu,
            'hizmet_turu_display': eh.ek_hizmet.get_hizmet_turu_display(),
            'fiyat': float(eh.fiyat),
            'dahil_mi': eh.dahil_mi,
            'kaynak_paket_turu': eh.kaynak_paket_turu or '',
            'baslangic_tarihi': format_date(eh.baslangic_tarihi) if eh.baslangic_tarihi else '',
            'bitis_tarihi': format_date(eh.bitis_tarihi) if eh.bitis_tarihi else '',
        })
    
    return JsonResponse({
        'id': ogrenci.id,
        'tc_kimlik_no': ogrenci.tc_kimlik_no or '',
        'ad': ogrenci.ad,
        'soyad': ogrenci.soyad,
        'tam_ad': ogrenci.tam_ad,
        'dogum_tarihi': format_date(ogrenci.dogum_tarihi),
        'dogum_tarihi_iso': ogrenci.dogum_tarihi.isoformat() if ogrenci.dogum_tarihi else '',
        'cinsiyet': ogrenci.cinsiyet or '',
        'cinsiyet_display': dict(ogrenci.CINSIYET_CHOICES).get(ogrenci.cinsiyet, '-'),
        'kayit_turu': kayit_turu_code,
        'kayit_turu_display': kayit_turu_display,
        'telefon': ogrenci.telefon or '',
        'email': ogrenci.email or '',
        # Eski model uyumluluğu
        'adres': adres_text or ogrenci.adres or '',
        'veli_ad_soyad': varsayilan_veli['tam_ad'] if varsayilan_veli else (ogrenci.veli_ad_soyad or ''),
        'veli_telefon': (
            (varsayilan_veli['telefon'] or ogrenci.veli_telefon or '')
            if varsayilan_veli else (ogrenci.veli_telefon or '')
        ),
        # Yeni detaylı bilgiler
        'adresler': adresler,
        'veliler': veliler,
        'aktif_mi': ogrenci.aktif_mi,
        'created_at': format_date(ogrenci.created_at),
        'updated_at': format_date(ogrenci.updated_at),
        'kurum': {
            'id': ogrenci.kurum_id,
            'ad': ogrenci.kurum.ad if ogrenci.kurum else '',
        } if ogrenci.kurum_id else None,
        'sube': {
            'id': ogrenci.sube_id,
            'ad': ogrenci.sube.ad if ogrenci.sube else '',
        } if ogrenci.sube_id else None,
        # Yeni alanlar
        'okul_no': okul_no,
        'school_id': school_id,
        'school_ad': school_ad,
        'geldigi_okul': geldigi_okul,
        'sinif': sinif_bilgi,
        'donem_sinif': donem_sinif_bilgi,
        'aktif_donem': aktif_donem_bilgi,
        'sinif_seviyesi': sinif_seviyesi_bilgi,
        'alan': alan_bilgi,
        'egitim_yili': egitim_yili_bilgi,
        'kayit_tarihi': kayit_tarihi,
        'profil_foto': ogrenci.profil_foto.url if ogrenci.profil_foto else None,
        'ek_hizmetler': ek_hizmetler,
    })


@login_required
def ogrenci_search_api(request):
    """Öğrenci arama API — aktif eğitim yılı kaydına göre (sözleşme / seçici ekranları)."""
    from apps.ogrenci.domain.models import OgrenciKayit
    from apps.ogrenci.interfaces.list_helpers import apply_smart_search
    from apps.ogrenci.interfaces.sube_context import mandatory_ogrenci_context

    ctx, err = mandatory_ogrenci_context(request)
    if err:
        return err

    query = request.GET.get('q', '').strip()
    if len(query) < 2:
        return JsonResponse({'ogrenciler': []})

    qs = OgrenciKayit.objects.filter(
        kurum_id=ctx['kurum_id'],
        sube_id=ctx['sube_id'],
        aktif_mi=True,
    ).select_related('ogrenci', 'sinif', 'sinif__sinif_seviyesi')

    if ctx.get('egitim_yili_id'):
        qs = qs.filter(egitim_yili_id=ctx['egitim_yili_id'])

    qs = apply_smart_search(qs, query, prefix='ogrenci__')
    kayitlar = qs.order_by('ogrenci__soyad', 'ogrenci__ad')[:20]

    return JsonResponse({
        'ogrenciler': [
            {
                'id': k.ogrenci.id,
                'ad': k.ogrenci.ad,
                'soyad': k.ogrenci.soyad,
                'tam_ad': k.ogrenci.tam_ad,
                'tc_kimlik_no': k.ogrenci.tc_kimlik_no or '',
                'telefon': k.ogrenci.telefon,
                'ogrenci_no': k.okul_no or '',
                'sinif': k.sinif.ad if k.sinif else '',
            }
            for k in kayitlar
        ]
    })


# ==================== VELİ CRUD API ====================


@csrf_exempt
def ogrenci_veliler_api(request, pk):
    """
    Öğrenci velileri API - GET: Liste, POST: Yeni veli ekle
    """
    from apps.ogrenci.domain.models import OgrenciVeli
    
    service = OgrenciService()
    ogrenci = service.get_by_id(pk)
    
    if not ogrenci:
        return JsonResponse({'error': 'Öğrenci bulunamadı'}, status=404)

    gate = _ogrenci_sube_gate(request, ogrenci)
    if gate:
        return gate
    
    if request.method == 'GET':
        veliler = [_veli_api_dict(v) for v in OgrenciVeli.objects.filter(ogrenci=ogrenci).order_by('-varsayilan', '-id')]
        return JsonResponse({'veliler': veliler})
    
    elif request.method == 'POST':
        # Yeni veli ekle
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Geçersiz JSON'}, status=400)
        
        # Gerekli alanları kontrol et
        ad = data.get('ad', '').strip()
        soyad = data.get('soyad', '').strip()
        veli_turu = data.get('veli_turu', 'diger')
        
        if not ad or not soyad:
            return JsonResponse({'error': 'Ad ve soyad zorunludur'}, status=400)
        
        # Eğer varsayılan seçildiyse, diğer velilerin varsayılanını kaldır
        varsayilan = data.get('varsayilan', False)
        if varsayilan:
            OgrenciVeli.objects.filter(ogrenci=ogrenci, varsayilan=True).update(varsayilan=False)
        
        sms_bildirimleri = _normalize_sms_bildirimleri(
            data.get('sms_bildirimleri'),
            default_on_create=True,
        )

        # Veli oluştur
        from apps.ogrenci.application.veli_telefon import apply_telefonlar
        veli = OgrenciVeli(
            ogrenci=ogrenci,
            veli_turu=veli_turu,
            tc_kimlik_no=_json_str(data, 'tc_kimlik_no'),
            ad=ad,
            soyad=soyad,
            email=_json_str(data, 'email'),
            meslek=_json_str(data, 'meslek'),
            sms_bildirimleri=sms_bildirimleri,
            varsayilan=varsayilan,
        )
        apply_telefonlar(
            veli,
            telefonlar=data.get('telefonlar'),
            telefon=_json_str(data, 'telefon'),
        )
        veli.save()

        from apps.kimlik.application.kisi_service import KisiService
        from apps.kimlik.domain.models import Kisi
        from apps.kimlik.exceptions import KimlikConflictError
        try:
            kisi_id = data.get('kisi_id')
            if kisi_id:
                kisi = Kisi.objects.filter(id=kisi_id, kurum_id=ogrenci.kurum_id).first()
                if kisi:
                    KisiService.link_veli(veli, kisi)
                else:
                    KisiService.link_veli(veli)
            elif veli.tc_kimlik_no:
                existing_kisi = Kisi.objects.filter(
                    kurum_id=ogrenci.kurum_id,
                    tc_kimlik_no=veli.tc_kimlik_no,
                ).first()
                KisiService.link_veli(veli, existing_kisi)
            else:
                KisiService.link_veli(veli)
        except KimlikConflictError as e:
            veli.delete()
            return JsonResponse(e.as_dict(), status=409)

        return JsonResponse({
            'success': True,
            'veli': _veli_api_dict(veli),
        }, status=201)
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def ogrenci_veli_detail_api(request, pk, veli_id):
    """
    Veli detay API - GET: Detay, PUT: Güncelle, DELETE: Sil
    """
    from apps.ogrenci.domain.models import OgrenciVeli
    
    service = OgrenciService()
    ogrenci = service.get_by_id(pk)
    
    if not ogrenci:
        return JsonResponse({'error': 'Öğrenci bulunamadı'}, status=404)

    gate = _ogrenci_sube_gate(request, ogrenci)
    if gate:
        return gate
    
    try:
        veli = OgrenciVeli.objects.get(id=veli_id, ogrenci=ogrenci)
    except OgrenciVeli.DoesNotExist:
        return JsonResponse({'error': 'Veli bulunamadı'}, status=404)
    
    if request.method == 'GET':
        return JsonResponse(_veli_api_dict(veli))
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Geçersiz JSON'}, status=400)
        
        # Güncelle
        if 'veli_turu' in data:
            veli.veli_turu = data['veli_turu']
        if 'tc_kimlik_no' in data:
            veli.tc_kimlik_no = _json_str(data, 'tc_kimlik_no')
        if 'ad' in data:
            veli.ad = _json_str(data, 'ad')
        if 'soyad' in data:
            veli.soyad = _json_str(data, 'soyad')
        if 'telefon' in data or 'telefonlar' in data:
            from apps.ogrenci.application.veli_telefon import apply_telefonlar
            apply_telefonlar(
                veli,
                telefonlar=data.get('telefonlar') if 'telefonlar' in data else None,
                telefon=_json_str(data, 'telefon') if 'telefon' in data else None,
            )
        if 'email' in data:
            veli.email = _json_str(data, 'email')
        if 'meslek' in data:
            veli.meslek = _json_str(data, 'meslek')
        if 'sms_bildirimleri' in data:
            veli.sms_bildirimleri = _normalize_sms_bildirimleri(data.get('sms_bildirimleri'))
        
        # Varsayılan kontrolü
        if data.get('varsayilan', False):
            OgrenciVeli.objects.filter(ogrenci=ogrenci, varsayilan=True).exclude(id=veli.id).update(varsayilan=False)
            veli.varsayilan = True
        else:
            veli.varsayilan = data.get('varsayilan', veli.varsayilan)
        
        try:
            veli.save()
        except Exception as exc:
            return JsonResponse({'error': str(exc)}, status=400)

        return JsonResponse({
            'success': True,
            'veli': _veli_api_dict(veli),
        })
    
    elif request.method == 'DELETE':
        veli.delete()
        return JsonResponse({'success': True, 'message': 'Veli silindi'})
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)


# ==================== ADRES CRUD API ====================

@csrf_exempt
def ogrenci_adresler_api(request, pk):
    """
    Öğrenci adresleri API - GET: Liste, POST: Yeni adres ekle
    """
    from apps.ogrenci.domain.models import OgrenciAdres
    
    service = OgrenciService()
    ogrenci = service.get_by_id(pk)
    
    if not ogrenci:
        return JsonResponse({'error': 'Öğrenci bulunamadı'}, status=404)

    gate = _ogrenci_sube_gate(request, ogrenci)
    if gate:
        return gate
    
    if request.method == 'GET':
        adresler = []
        for adres in OgrenciAdres.objects.filter(ogrenci=ogrenci).order_by('-varsayilan', '-id'):
            adresler.append({
                'id': adres.id,
                'adres_turu': adres.adres_turu,
                'adres_turu_display': dict(OgrenciAdres.ADRES_TURU_CHOICES).get(adres.adres_turu, adres.adres_turu),
                'adres': adres.adres,
                'il': adres.il,
                'ilce': adres.ilce,
                'posta_kodu': adres.posta_kodu or '',
                'varsayilan': adres.varsayilan,
            })
        return JsonResponse({'adresler': adresler})
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Geçersiz JSON'}, status=400)
        
        adres_text = data.get('adres', '').strip()
        if not adres_text:
            return JsonResponse({'error': 'Adres zorunludur'}, status=400)
        
        varsayilan = data.get('varsayilan', False)
        if varsayilan:
            OgrenciAdres.objects.filter(ogrenci=ogrenci, varsayilan=True).update(varsayilan=False)
        
        adres = OgrenciAdres.objects.create(
            ogrenci=ogrenci,
            adres_turu=data.get('adres_turu', 'ev'),
            adres=adres_text,
            il=data.get('il', '').strip(),
            ilce=data.get('ilce', '').strip(),
            posta_kodu=data.get('posta_kodu', '').strip() or None,
            varsayilan=varsayilan,
        )
        
        return JsonResponse({
            'success': True,
            'adres': {
                'id': adres.id,
                'adres_turu': adres.adres_turu,
                'adres_turu_display': dict(OgrenciAdres.ADRES_TURU_CHOICES).get(adres.adres_turu, adres.adres_turu),
                'adres': adres.adres,
                'il': adres.il,
                'ilce': adres.ilce,
                'posta_kodu': adres.posta_kodu or '',
                'varsayilan': adres.varsayilan,
            }
        }, status=201)
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def ogrenci_adres_detail_api(request, pk, adres_id):
    """
    Adres detay API - GET: Detay, PUT: Güncelle, DELETE: Sil
    """
    from apps.ogrenci.domain.models import OgrenciAdres
    
    service = OgrenciService()
    ogrenci = service.get_by_id(pk)
    
    if not ogrenci:
        return JsonResponse({'error': 'Öğrenci bulunamadı'}, status=404)

    gate = _ogrenci_sube_gate(request, ogrenci)
    if gate:
        return gate
    
    try:
        adres = OgrenciAdres.objects.get(id=adres_id, ogrenci=ogrenci)
    except OgrenciAdres.DoesNotExist:
        return JsonResponse({'error': 'Adres bulunamadı'}, status=404)
    
    if request.method == 'GET':
        return JsonResponse({
            'id': adres.id,
            'adres_turu': adres.adres_turu,
            'adres_turu_display': dict(OgrenciAdres.ADRES_TURU_CHOICES).get(adres.adres_turu, adres.adres_turu),
            'adres': adres.adres,
            'il': adres.il,
            'ilce': adres.ilce,
            'posta_kodu': adres.posta_kodu or '',
            'varsayilan': adres.varsayilan,
        })
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Geçersiz JSON'}, status=400)
        
        if 'adres_turu' in data:
            adres.adres_turu = data['adres_turu']
        if 'adres' in data:
            adres.adres = data['adres'].strip()
        if 'il' in data:
            adres.il = data['il'].strip()
        if 'ilce' in data:
            adres.ilce = data['ilce'].strip()
        if 'posta_kodu' in data:
            adres.posta_kodu = data['posta_kodu'].strip() or None
        
        if data.get('varsayilan', False):
            OgrenciAdres.objects.filter(ogrenci=ogrenci, varsayilan=True).exclude(id=adres.id).update(varsayilan=False)
            adres.varsayilan = True
        else:
            adres.varsayilan = data.get('varsayilan', adres.varsayilan)
        
        adres.save()
        
        return JsonResponse({
            'success': True,
            'adres': {
                'id': adres.id,
                'adres_turu': adres.adres_turu,
                'adres_turu_display': dict(OgrenciAdres.ADRES_TURU_CHOICES).get(adres.adres_turu, adres.adres_turu),
                'adres': adres.adres,
                'il': adres.il,
                'ilce': adres.ilce,
                'posta_kodu': adres.posta_kodu or '',
                'varsayilan': adres.varsayilan,
            }
        })
    
    elif request.method == 'DELETE':
        adres.delete()
        return JsonResponse({'success': True, 'message': 'Adres silindi'})
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)


def kayit_turleri_api(request):
    """Kayıt türleri — Kurum Yönetimi lookup tanımlarından."""
    from apps.kurum.services.kayit_tanimlari_service import list_registration_types

    kayit_turleri = [
        {'value': opt.code, 'label': opt.label}
        for opt in list_registration_types()
    ]

    return JsonResponse({
        'success': True,
        'kayit_turleri': kayit_turleri,
    })


def cinsiyet_secenekleri_api(request):
    """Cinsiyet seçenekleri API (login gerektirmez)"""
    from apps.ogrenci.domain.models import Ogrenci
    
    cinsiyetler = [
        {'value': key, 'label': label}
        for key, label in Ogrenci.CINSIYET_CHOICES
    ]
    
    return JsonResponse({
        'success': True,
        'cinsiyetler': cinsiyetler
    })


@csrf_exempt
def ogrenci_profil_foto_api(request, pk):
    """
    Öğrenci profil fotoğrafı API
    POST: Fotoğraf yükle
    DELETE: Fotoğrafı sil

    Şube gate sonrası: aktif koç yalnızca erişebildiği öğrencinin fotosunu
    değiştirebilir; admin / kaynak admin için mevcut şube davranışı korunur.
    """
    from apps.ogrenci.domain.models import Ogrenci
    import os
    from django.conf import settings
    from apps.coaching.services.coach_access import get_coach_profile, user_can_access_student
    
    try:
        ogrenci = Ogrenci.objects.get(pk=pk)
    except Ogrenci.DoesNotExist:
        return JsonResponse({'error': 'Öğrenci bulunamadı'}, status=404)

    gate = _ogrenci_sube_gate(request, ogrenci)
    if gate:
        return gate

    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False) and get_coach_profile(user) is not None:
        if not user_can_access_student(user, pk):
            return JsonResponse(
                {'error': 'Bu öğrencinin profil fotoğrafını değiştirme yetkiniz yok.'},
                status=403,
            )
    
    if request.method == 'POST':
        if 'foto' not in request.FILES:
            return JsonResponse({'error': 'Fotoğraf dosyası bulunamadı'}, status=400)
        
        foto = request.FILES['foto']
        
        # Dosya boyutu kontrolü (max 5MB)
        if foto.size > 5 * 1024 * 1024:
            return JsonResponse({'error': 'Dosya boyutu 5MB\'dan büyük olamaz'}, status=400)
        
        # Dosya tipi kontrolü
        allowed_types = ['image/jpeg', 'image/png', 'image/webp']
        if foto.content_type not in allowed_types:
            return JsonResponse({'error': 'Sadece JPEG, PNG ve WebP formatları desteklenir'}, status=400)
        
        # Eski fotoğrafı sil
        if ogrenci.profil_foto:
            old_path = ogrenci.profil_foto.path
            if os.path.exists(old_path):
                os.remove(old_path)
        
        # Yeni fotoğrafı kaydet
        ogrenci.profil_foto = foto
        ogrenci.save()
        
        return JsonResponse({
            'success': True,
            'message': 'Profil fotoğrafı güncellendi',
            'profil_foto': ogrenci.profil_foto.url if ogrenci.profil_foto else None
        })
    
    elif request.method == 'DELETE':
        if ogrenci.profil_foto:
            old_path = ogrenci.profil_foto.path
            if os.path.exists(old_path):
                os.remove(old_path)
            ogrenci.profil_foto = None
            ogrenci.save()
        
        return JsonResponse({
            'success': True,
            'message': 'Profil fotoğrafı silindi'
        })
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def ogrenci_delete_api(request, pk):
    """
    Öğrenci Silme API (soft delete - pasife alma)
    DELETE /ogrenciler/api/<pk>/delete/
    
    Aktif sözleşmesi olan öğrenci silinemez.
    """
    if request.method != 'DELETE':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    service = OgrenciService()
    ogrenci = service.get_by_id(pk)
    
    if not ogrenci:
        return JsonResponse({'error': 'Öğrenci bulunamadı'}, status=404)

    gate = _ogrenci_sube_gate(request, ogrenci)
    if gate:
        return gate
    
    # Aktif sözleşme kontrolü
    try:
        from apps.odeme_takip.domain.models import Sozlesme
        from apps.odeme_takip.domain.enums import SozlesmeDurum
        
        aktif_sozlesmeler = Sozlesme.objects.filter(
            ogrenci=ogrenci,
            durum=SozlesmeDurum.AKTIF
        )
        
        if aktif_sozlesmeler.exists():
            sozlesme = aktif_sozlesmeler.first()
            return JsonResponse({
                'error': 'Bu öğrencinin aktif sözleşmesi bulunmaktadır. Silme işlemi yapılamaz.',
                'sozlesme_no': sozlesme.sozlesme_no,
                'code': 'AKTIF_SOZLESME'
            }, status=400)
    except ImportError:
        pass  # odeme_takip modülü yoksa kontrolü atla
    
    # Soft delete (pasife alma)
    success, errors = service.delete(pk)
    
    if success:
        return JsonResponse({
            'success': True,
            'message': f'{ogrenci.tam_ad} başarıyla pasife alındı.'
        })
    else:
        return JsonResponse({
            'error': 'Silme işlemi başarısız.',
            'details': errors
        }, status=500)


@csrf_exempt
def ogrenci_finans_ozet_api(request, pk):
    """
    Öğrenci Finans Özet API
    GET /ogrenciler/api/<pk>/finans-ozet/
    
    Tek çağrıda öğrencinin tüm finansal bilgilerini döner:
    - Sözleşmeler (özet + detay)
    - Taksitler
    - Son tahsilatlar
    - Genel istatistikler
    """
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    service = OgrenciService()
    ogrenci = service.get_by_id(pk)
    
    if not ogrenci:
        return JsonResponse({'error': 'Öğrenci bulunamadı'}, status=404)

    gate = _ogrenci_sube_gate(request, ogrenci)
    if gate:
        return gate
    
    try:
        from apps.odeme_takip.domain.models import Sozlesme, Taksit, Tahsilat
        from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum, TahsilatDurum, TahsilatTuru
        from django.db.models import Sum, Q
        from decimal import Decimal
        
        # Tüm sözleşmeleri al
        sozlesmeler = Sozlesme.objects.select_related(
            'egitim_yili', 'odeme_yontemi', 'veli'
        ).filter(ogrenci=ogrenci).order_by('-created_at')
        
        sozlesme_list = []
        toplam_net_tutar = Decimal('0')
        toplam_odenen = Decimal('0')
        toplam_kalan = Decimal('0')
        vadesi_gecen_toplam = Decimal('0')
        vadesi_gecen_sayisi = 0
        
        for s in sozlesmeler:
            # Taksitler
            taksitler = Taksit.objects.filter(sozlesme=s).order_by('taksit_no')
            taksit_list = []
            for t in taksitler:
                taksit_list.append({
                    'id': t.id,
                    'taksit_no': t.taksit_no,
                    'vade_tarihi': str(t.vade_tarihi) if t.vade_tarihi else None,
                    'tutar': float(t.tutar or 0),
                    'odenen_tutar': float(t.odenen_tutar or 0),
                    'kalan_tutar': float(t.kalan_tutar or 0),
                    'durum': t.durum,
                })
            
            # Vadesi geçenler
            from django.utils import timezone
            bugun = timezone.now().date()
            vadesi_gecenler = taksitler.filter(
                vade_tarihi__lt=bugun,
                durum__in=[TaksitDurum.BEKLEMEDE, TaksitDurum.KISMI_ODENDI, TaksitDurum.GECIKTI]
            )
            
            s_vadesi_gecen = float(vadesi_gecenler.aggregate(
                toplam=Sum('kalan_tutar')
            )['toplam'] or 0)
            s_vadesi_gecen_sayisi = vadesi_gecenler.count()
            
            # Tahsilatlar
            tahsilatlar = Tahsilat.objects.select_related(
                'taksit', 'odeme_yontemi'
            ).filter(sozlesme=s).order_by('-tahsilat_tarihi', '-created_at')
            
            tahsilat_list = []
            for th in tahsilatlar:
                tahsilat_list.append({
                    'id': th.id,
                    'taksit_no': th.taksit.taksit_no if th.taksit else None,
                    'tutar': float(th.tutar or 0),
                    'tahsilat_tarihi': str(th.tahsilat_tarihi) if th.tahsilat_tarihi else None,
                    'tahsilat_turu': th.tahsilat_turu,
                    'odeme_yontemi_ad': th.odeme_yontemi.ad if th.odeme_yontemi else '',
                    'referans_no': th.referans_no or '',
                    'durum': th.durum,
                    'iptal_nedeni': th.iptal_nedeni or '',
                    'aciklama': th.aciklama or '',
                })
            
            s_odenen = float(s.toplam_odenen)
            s_kalan = float(s.kalan_borc)
            
            sozlesme_data = {
                'id': s.id,
                'sozlesme_no': s.sozlesme_no,
                'durum': s.durum,
                'paket_adi': s.paket_adi,
                'paket_turu': s.paket_turu,
                'egitim_turu': s.egitim_turu,
                'egitim_yili': str(s.egitim_yili) if s.egitim_yili else '',
                'baslangic_tarihi': str(s.baslangic_tarihi) if s.baslangic_tarihi else None,
                'bitis_tarihi': str(s.bitis_tarihi) if s.bitis_tarihi else None,
                'brut_tutar': float(s.brut_tutar or 0),
                'kdv_orani': float(s.kdv_orani or 0),
                'kdv_tutari': float(s.kdv_tutari or 0),
                'kdv_dahil_tutar': float(s.kdv_dahil_tutar or 0),
                'toplam_indirim_tutari': float(s.toplam_indirim_tutari or 0),
                'net_tutar': float(s.net_tutar or 0),
                'toplam_odenen': s_odenen,
                'kalan_borc': s_kalan,
                'odeme_yuzdesi': float(s.odeme_yuzdesi),
                'odeme_turu': s.odeme_turu,
                'taksit_sayisi': s.taksit_sayisi,
                'taksit_periyodu': s.taksit_periyodu if hasattr(s, 'taksit_periyodu') else '',
                'veli_adi': f'{s.veli.ad} {s.veli.soyad}' if s.veli else '',
                'odeme_yontemi_ad': s.odeme_yontemi.ad if s.odeme_yontemi else '',
                'created_at': str(s.created_at) if s.created_at else None,
                'vadesi_gecen_toplam': s_vadesi_gecen,
                'vadesi_gecen_sayisi': s_vadesi_gecen_sayisi,
                'taksitler': taksit_list,
                'tahsilatlar': tahsilat_list,
            }
            
            # Fesih bilgisi
            fesih = getattr(s, 'fesih', None)
            try:
                fesih_obj = s.fesih
                if fesih_obj:
                    sozlesme_data['fesih'] = {
                        'fesih_tarihi': str(fesih_obj.fesih_tarihi),
                        'fesih_nedeni': fesih_obj.get_fesih_nedeni_display(),
                        'iade_tutari': float(fesih_obj.iade_tutari or 0),
                        'iade_yapildi_mi': fesih_obj.iade_yapildi_mi,
                    }
            except Exception:
                pass
            
            sozlesme_list.append(sozlesme_data)
            
            # Genel toplamlar (sadece iptal/feshedilmemiş sözleşmeler)
            if s.durum not in [SozlesmeDurum.IPTAL, SozlesmeDurum.FESHEDILMIS]:
                toplam_net_tutar += s.net_tutar or Decimal('0')
                toplam_odenen += s.toplam_odenen
                toplam_kalan += s.kalan_borc
                vadesi_gecen_toplam += Decimal(str(s_vadesi_gecen))
                vadesi_gecen_sayisi += s_vadesi_gecen_sayisi
        
        # Ödeme yüzdesi
        odeme_yuzdesi = 0
        if toplam_net_tutar > 0:
            odeme_yuzdesi = float((toplam_odenen / toplam_net_tutar * 100).quantize(Decimal('0.1')))
        
        return JsonResponse({
            'success': True,
            'ozet': {
                'toplam_sozlesme': len(sozlesme_list),
                'toplam_net_tutar': float(toplam_net_tutar),
                'toplam_odenen': float(toplam_odenen),
                'toplam_kalan': float(toplam_kalan),
                'odeme_yuzdesi': odeme_yuzdesi,
                'vadesi_gecen_toplam': float(vadesi_gecen_toplam),
                'vadesi_gecen_sayisi': vadesi_gecen_sayisi,
            },
            'sozlesmeler': sozlesme_list,
        })
        
    except ImportError:
        return JsonResponse({
            'success': True,
            'ozet': {
                'toplam_sozlesme': 0,
                'toplam_net_tutar': 0,
                'toplam_odenen': 0,
                'toplam_kalan': 0,
                'odeme_yuzdesi': 0,
                'vadesi_gecen_toplam': 0,
                'vadesi_gecen_sayisi': 0,
            },
            'sozlesmeler': [],
        })
    except Exception as e:
        return JsonResponse({
            'error': f'Finans bilgileri alınırken hata oluştu: {str(e)}'
        }, status=500)