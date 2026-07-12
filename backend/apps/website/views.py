"""Website views — public + admin CRUD."""
import json
from django.db.utils import OperationalError, ProgrammingError
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.kurum.domain.models import Kurum
from apps.kurum.branding import normalize_map_embed_url, build_map_embed_from_address
from apps.website.seed_defaults import (
    LANDING_KURUM_KOD,
    seed_website_defaults,
    ensure_website_defaults,
    resolve_landing_kurum,
)
from apps.website.models import (
    SiteSettings, SiteSocialLink, SiteFooterLink, HeroSlide, Duyuru,
    SinavTakvim, NedenKart, BasariIstatistik, OgrenciYorumu, SSS,
    YasalMetin, IletisimMesaji,
)
from apps.website.serializers import (
    build_landing_payload, serialize_duyuru, serialize_yasal,
    serialize_iletisim_mesaji, serialize_site_settings,
    serialize_social_link, serialize_footer_link, serialize_hero_slide,
    serialize_sinav, serialize_neden_kart, serialize_basari,
    serialize_yorum, serialize_sss,
)


def _get_kurum_by_kod(kod):
    return Kurum.objects.filter(kod__iexact=kod.strip(), aktif_mi=True).first()


def _parse_json(request):
    try:
        return json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return None


def _schema_migration_error_response(exc: Exception):
    """Eksik migration durumunda HTML 500 yerine anlaşılır JSON döndür."""
    if not isinstance(exc, (ProgrammingError, OperationalError)):
        return None
    msg = str(exc).lower()
    if 'column' not in msg and 'relation' not in msg and 'does not exist' not in msg:
        return None
    return JsonResponse({
        'success': False,
        'error': (
            'Veritabanı şeması güncel değil. '
            'Sunucuda migration çalıştırın: python manage.py migrate '
            '(Docker: docker compose -f docker-compose.dev.yml exec backend python manage.py migrate)'
        ),
    }, status=503)


def _require_auth(request):
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'error': 'Yetkilendirme gerekli'}, status=401)
    return None


def _upload_image(request, instance, field_name, file_key, max_mb=5):
    if file_key not in request.FILES:
        return JsonResponse({'success': False, 'error': 'Dosya bulunamadı'}, status=400)
    uploaded = request.FILES[file_key]
    if uploaded.size > max_mb * 1024 * 1024:
        return JsonResponse({'success': False, 'error': f'Dosya boyutu {max_mb}MB\'dan küçük olmalıdır'}, status=400)
    content_type = (uploaded.content_type or '').lower()
    if content_type not in {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}:
        return JsonResponse({'success': False, 'error': 'Geçersiz dosya tipi'}, status=400)
    old = getattr(instance, field_name)
    if old:
        old.delete(save=False)
    setattr(instance, field_name, uploaded)
    instance.save()
    return None


# ── Public API ──

@csrf_exempt
def api_public_landing(request, kod):
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    kurum = _get_kurum_by_kod(kod) or resolve_landing_kurum(kod)
    if not kurum:
        return JsonResponse({'success': False, 'error': 'Kurum bulunamadı'}, status=404)
    ensure_website_defaults(kurum)
    return JsonResponse({'success': True, 'data': build_landing_payload(kurum, request)})


@csrf_exempt
def api_public_duyuru_detail(request, kod, slug):
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    kurum = _get_kurum_by_kod(kod)
    if not kurum:
        return JsonResponse({'success': False, 'error': 'Kurum bulunamadı'}, status=404)
    duyuru = Duyuru.objects.filter(kurum=kurum, slug=slug, aktif=True).first()
    if not duyuru:
        return JsonResponse({'success': False, 'error': 'Duyuru bulunamadı'}, status=404)
    return JsonResponse({'success': True, 'data': serialize_duyuru(duyuru, request, include_content=True)})


@csrf_exempt
def api_public_yasal_detail(request, kod, tur):
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    kurum = _get_kurum_by_kod(kod)
    if not kurum:
        return JsonResponse({'success': False, 'error': 'Kurum bulunamadı'}, status=404)
    metin = get_object_or_404(YasalMetin, kurum=kurum, tur=tur, aktif=True)
    return JsonResponse({'success': True, 'data': serialize_yasal(metin)})


@csrf_exempt
def api_public_iletisim(request, kod):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    kurum = _get_kurum_by_kod(kod)
    if not kurum:
        return JsonResponse({'success': False, 'error': 'Kurum bulunamadı'}, status=404)
    data = _parse_json(request)
    if data is None:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
    ad_soyad = (data.get('ad_soyad') or '').strip()
    telefon = (data.get('telefon') or '').strip()
    mesaj = (data.get('mesaj') or '').strip()
    if not ad_soyad or not telefon:
        return JsonResponse({'success': False, 'error': 'Ad soyad ve telefon zorunludur'}, status=400)
    if not mesaj:
        mesaj = '—'
    msg = IletisimMesaji.objects.create(
        kurum=kurum, ad_soyad=ad_soyad, telefon=telefon, mesaj=mesaj,
    )
    return JsonResponse({'success': True, 'message': 'Mesajınız alındı', 'data': serialize_iletisim_mesaji(msg)})


# ── Admin helpers ──

def _admin_kurum(request):
    """Kurumsal site yönetimi — oturumdaki veya mevcut kurum; otomatik oluşturma yok."""
    err = _require_auth(request)
    if err:
        return None, err

    from shared.context import get_secili_kurum_id

    kurum_id = get_secili_kurum_id(request)
    if kurum_id:
        kurum = Kurum.objects.filter(id=kurum_id, aktif_mi=True).first()
        if kurum:
            return kurum, None

    kurum_kod = (request.GET.get('kurum_kod') or '').strip()
    if kurum_kod:
        kurum = _get_kurum_by_kod(kurum_kod)
        if kurum:
            return kurum, None

    kurum = resolve_landing_kurum(LANDING_KURUM_KOD)
    if kurum:
        return kurum, None

    return None, JsonResponse({
        'success': False,
        'error': 'Kurum bulunamadı. Önce Kurum Yönetimi üzerinden kurum tanımlayın.',
    }, status=404)


def _apply_model_update(obj, data, updatable_fields):
    """JSON string değerlerini model alan tiplerine dönüştürür (tarih/saat vb.)."""
    for f in updatable_fields:
        if f not in data:
            continue
        raw = data[f]
        field = obj._meta.get_field(f)
        if raw is None or raw == '':
            if getattr(field, 'null', False) or getattr(field, 'blank', False):
                setattr(obj, f, None)
            continue
        setattr(obj, f, field.to_python(raw))


def _generic_list_create(request, model, serializer_fn, kurum, extra_fields=None):
    if request.method == 'GET':
        qs = model.objects.filter(kurum=kurum)
        return JsonResponse({'success': True, 'data': [serializer_fn(obj, request) if 'request' in serializer_fn.__code__.co_varnames else serializer_fn(obj) for obj in qs]})
    if request.method == 'POST':
        data = _parse_json(request)
        if data is None:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        fields = {k: data[k] for k in (extra_fields or data.keys()) if k in data and k not in ('id', 'kurum')}
        obj = model.objects.create(kurum=kurum, **fields)
        ser = serializer_fn(obj, request) if 'request' in serializer_fn.__code__.co_varnames else serializer_fn(obj)
        return JsonResponse({'success': True, 'data': ser}, status=201)
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def _generic_detail(request, model, serializer_fn, pk, kurum, updatable_fields):
    obj = get_object_or_404(model, pk=pk, kurum=kurum)
    if request.method == 'GET':
        ser = serializer_fn(obj, request) if 'request' in serializer_fn.__code__.co_varnames else serializer_fn(obj)
        return JsonResponse({'success': True, 'data': ser})
    if request.method in ('PUT', 'PATCH'):
        data = _parse_json(request)
        if data is None:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        _apply_model_update(obj, data, updatable_fields)
        obj.save()
        obj.refresh_from_db()
        ser = serializer_fn(obj, request) if 'request' in serializer_fn.__code__.co_varnames else serializer_fn(obj)
        return JsonResponse({'success': True, 'data': ser})
    if request.method == 'DELETE':
        obj.delete()
        return JsonResponse({'success': True, 'message': 'Silindi'})
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_admin_landing_data(request):
    try:
        kurum, err = _admin_kurum(request)
        if err:
            return err
        if request.method != 'GET':
            return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
        ensure_website_defaults(kurum)
        return JsonResponse({
            'success': True,
            'data': build_landing_payload(kurum, request),
            'kurum_id': kurum.id,
            'kurum_kod': kurum.kod,
            'kurum_ad': kurum.ad,
        })
    except Exception as exc:
        schema_err = _schema_migration_error_response(exc)
        if schema_err:
            return schema_err
        raise


@csrf_exempt
def api_admin_seed_defaults(request):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    overwrite = request.GET.get('overwrite') == '1'
    result = seed_website_defaults(kurum, overwrite_settings=overwrite)
    return JsonResponse({
        'success': True,
        'message': 'Varsayılan site içerikleri yüklendi',
        'data': build_landing_payload(kurum, request),
        'seed': result,
    })


@csrf_exempt
def api_admin_settings(request):
    try:
        kurum, err = _admin_kurum(request)
        if err:
            return err
        settings, _ = SiteSettings.objects.get_or_create(kurum=kurum)
        ensure_website_defaults(kurum)
        settings.refresh_from_db()
        if request.method == 'GET':
            return JsonResponse({'success': True, 'data': serialize_site_settings(settings, request)})
        if request.method in ('PUT', 'PATCH'):
            data = _parse_json(request)
            if data is None:
                return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
            for f in [
                'telefon', 'whatsapp', 'eposta', 'adres', 'calisma_saatleri',
                'hero_baslik', 'hero_alt_baslik', 'hero_slogan', 'hero_maddeler',
                'hero_rotating_words', 'hero_gallery',
                'neden_baslik', 'neden_alt_baslik', 'ders_formatlari_config', 'landing_bolumleri',
                'landing_section_order',
                'landing_sections_hidden',
                'yorumlar_goster', 'sss_goster',
                'tanitim_baslik', 'tanitim_icerik', 'youtube_video_id',
                'harita_embed_url', 'footer_copyright', 'footer_baslik', 'footer_aciklama',
                'footer_marka_metni', 'seo_baslik', 'seo_aciklama',
                'seo_anahtar_kelimeler', 'seo_canonical_url', 'google_site_verification',
                'google_analytics_id', 'seo_robots_index',
            ]:
                if f in data:
                    setattr(settings, f, data[f])
            if 'harita_embed_url' in data:
                settings.harita_embed_url = normalize_map_embed_url(settings.harita_embed_url)
            elif 'adres' in data and (settings.harita_embed_url or '').strip() == '' and (settings.adres or '').strip():
                settings.harita_embed_url = build_map_embed_from_address(settings.adres)
            if 'landing_sections_hidden' in data:
                hidden = settings.landing_sections_hidden or []
                settings.yorumlar_goster = 'yorumlar' not in hidden
                settings.sss_goster = 'sss' not in hidden
            elif 'yorumlar_goster' in data or 'sss_goster' in data:
                hidden = list(settings.landing_sections_hidden or [])
                if not settings.yorumlar_goster and 'yorumlar' not in hidden:
                    hidden.append('yorumlar')
                elif settings.yorumlar_goster and 'yorumlar' in hidden:
                    hidden.remove('yorumlar')
                if not settings.sss_goster and 'sss' not in hidden:
                    hidden.append('sss')
                elif settings.sss_goster and 'sss' in hidden:
                    hidden.remove('sss')
                settings.landing_sections_hidden = hidden
            settings.save()
            return JsonResponse({'success': True, 'data': serialize_site_settings(settings, request)})
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    except Exception as exc:
        schema_err = _schema_migration_error_response(exc)
        if schema_err:
            return schema_err
        raise


@csrf_exempt
def api_admin_social_links(request):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_list_create(
        request, SiteSocialLink, serialize_social_link, kurum,
        extra_fields=['platform', 'url', 'sira', 'aktif'],
    )


@csrf_exempt
def api_admin_social_link_detail(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_detail(request, SiteSocialLink, serialize_social_link, pk, kurum, ['platform', 'url', 'sira', 'aktif'])


@csrf_exempt
def api_admin_footer_links(request):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_list_create(
        request, SiteFooterLink, serialize_footer_link, kurum,
        extra_fields=['kolon', 'etiket', 'url', 'sira', 'aktif'],
    )


@csrf_exempt
def api_admin_footer_link_detail(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_detail(request, SiteFooterLink, serialize_footer_link, pk, kurum, ['kolon', 'etiket', 'url', 'sira', 'aktif'])


@csrf_exempt
def api_admin_hero_slides(request):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    if request.method == 'GET':
        data = [serialize_hero_slide(s, request) for s in HeroSlide.objects.filter(kurum=kurum)]
        return JsonResponse({'success': True, 'data': data})
    if request.method == 'POST':
        sira = HeroSlide.objects.filter(kurum=kurum).count()
        slide = HeroSlide.objects.create(kurum=kurum, sira=sira)
        return JsonResponse({'success': True, 'data': serialize_hero_slide(slide, request)}, status=201)
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_admin_hero_slide_detail(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    slide = get_object_or_404(HeroSlide, pk=pk, kurum=kurum)
    if request.method == 'GET':
        return JsonResponse({'success': True, 'data': serialize_hero_slide(slide, request)})
    if request.method in ('PUT', 'PATCH'):
        data = _parse_json(request)
        if data is None:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        for f in ['sira', 'aktif']:
            if f in data:
                setattr(slide, f, data[f])
        slide.save()
        return JsonResponse({'success': True, 'data': serialize_hero_slide(slide, request)})
    if request.method == 'DELETE':
        slide.delete()
        return JsonResponse({'success': True, 'message': 'Silindi'})
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_admin_hero_slide_upload(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    slide = get_object_or_404(HeroSlide, pk=pk, kurum=kurum)
    upload_err = _upload_image(request, slide, 'gorsel', 'gorsel')
    if upload_err:
        return upload_err
    return JsonResponse({'success': True, 'data': serialize_hero_slide(slide, request)})


@csrf_exempt
def api_admin_duyurular(request):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    if request.method == 'GET':
        data = [serialize_duyuru(d, request, include_content=True) for d in Duyuru.objects.filter(kurum=kurum)]
        return JsonResponse({'success': True, 'data': data})
    if request.method == 'POST':
        data = _parse_json(request)
        if data is None:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        d = Duyuru.objects.create(
            kurum=kurum,
            baslik=data.get('baslik', 'Yeni Duyuru'),
            ozet=data.get('ozet', ''),
            icerik=data.get('icerik', ''),
            yayin_tarihi=data.get('yayin_tarihi') or None,
            aktif=data.get('aktif', True),
            sira=data.get('sira', 0),
        )
        return JsonResponse({'success': True, 'data': serialize_duyuru(d, request, include_content=True)}, status=201)
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_admin_duyuru_detail(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    d = get_object_or_404(Duyuru, pk=pk, kurum=kurum)
    if request.method == 'GET':
        return JsonResponse({'success': True, 'data': serialize_duyuru(d, request, include_content=True)})
    if request.method in ('PUT', 'PATCH'):
        data = _parse_json(request)
        if data is None:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        for f in ['baslik', 'ozet', 'icerik', 'yayin_tarihi', 'aktif', 'sira', 'slug']:
            if f in data:
                val = data[f]
                if f == 'yayin_tarihi' and val in ('', None):
                    val = None
                elif f == 'yayin_tarihi' and val:
                    val = Duyuru._meta.get_field('yayin_tarihi').to_python(val)
                setattr(d, f, val)
        d.save()
        d.refresh_from_db()
        return JsonResponse({'success': True, 'data': serialize_duyuru(d, request, include_content=True)})
    if request.method == 'DELETE':
        d.delete()
        return JsonResponse({'success': True, 'message': 'Silindi'})
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_admin_duyuru_upload(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    d = get_object_or_404(Duyuru, pk=pk, kurum=kurum)
    upload_err = _upload_image(request, d, 'kapak_gorseli', 'kapak_gorseli')
    if upload_err:
        return upload_err
    return JsonResponse({'success': True, 'data': serialize_duyuru(d, request, include_content=True)})


@csrf_exempt
def api_admin_sinav_takvim(request):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    if request.method == 'GET':
        data = [serialize_sinav(s, request) for s in SinavTakvim.objects.filter(kurum=kurum)]
        return JsonResponse({'success': True, 'data': data})
    if request.method == 'POST':
        data = _parse_json(request)
        if data is None:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        if not data.get('tarih'):
            return JsonResponse({'success': False, 'error': 'Tarih zorunludur'}, status=400)
        try:
            s = SinavTakvim(
                kurum=kurum,
                tur=data.get('tur', 'LGS'),
                tarih=SinavTakvim._meta.get_field('tarih').to_python(data['tarih']),
                saat=SinavTakvim._meta.get_field('saat').to_python(data['saat']) if data.get('saat') else None,
                saat_bitis=SinavTakvim._meta.get_field('saat_bitis').to_python(data['saat_bitis']) if data.get('saat_bitis') else None,
                kapsam=data.get('kapsam', 'turkiye_geneli'),
                baslik=data.get('baslik') or f"{data.get('yayin_adi') or data.get('tur', 'LGS')} Deneme Sınavı",
                yayin_adi=data.get('yayin_adi', ''),
                aciklama=data.get('aciklama', ''),
                aktif=data.get('aktif', True),
            )
            s.full_clean()
            s.save()
        except Exception as exc:
            return JsonResponse({'success': False, 'error': str(exc)}, status=400)
        return JsonResponse({'success': True, 'data': serialize_sinav(s, request)}, status=201)
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_admin_sinav_detail(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_detail(
        request, SinavTakvim, serialize_sinav, pk, kurum,
        ['tur', 'tarih', 'saat', 'saat_bitis', 'kapsam', 'baslik', 'yayin_adi', 'aciklama', 'aktif'],
    )


@csrf_exempt
def api_admin_sinav_upload(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    s = get_object_or_404(SinavTakvim, pk=pk, kurum=kurum)
    upload_err = _upload_image(request, s, 'gorsel', 'gorsel')
    if upload_err:
        return upload_err
    return JsonResponse({'success': True, 'data': serialize_sinav(s, request)})


@csrf_exempt
def api_admin_neden_kartlari(request):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_list_create(
        request, NedenKart, serialize_neden_kart, kurum,
        extra_fields=['ikon', 'baslik', 'aciklama', 'sira', 'aktif'],
    )


@csrf_exempt
def api_admin_neden_kart_detail(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_detail(request, NedenKart, serialize_neden_kart, pk, kurum, ['ikon', 'baslik', 'aciklama', 'sira', 'aktif'])


@csrf_exempt
def api_admin_basari_istatistikleri(request):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_list_create(
        request, BasariIstatistik, serialize_basari, kurum,
        extra_fields=['etiket', 'deger', 'sira', 'aktif'],
    )


@csrf_exempt
def api_admin_basari_detail(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_detail(request, BasariIstatistik, serialize_basari, pk, kurum, ['etiket', 'deger', 'sira', 'aktif'])


@csrf_exempt
def api_admin_yorumlar(request):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_list_create(
        request, OgrenciYorumu, serialize_yorum, kurum,
        extra_fields=['ad', 'rol', 'puan', 'yorum', 'sira', 'aktif'],
    )


@csrf_exempt
def api_admin_yorum_detail(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_detail(request, OgrenciYorumu, serialize_yorum, pk, kurum, ['ad', 'rol', 'puan', 'yorum', 'sira', 'aktif'])


@csrf_exempt
def api_admin_sss(request):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_list_create(
        request, SSS, serialize_sss, kurum,
        extra_fields=['soru', 'cevap', 'sira', 'aktif'],
    )


@csrf_exempt
def api_admin_sss_detail(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_detail(request, SSS, serialize_sss, pk, kurum, ['soru', 'cevap', 'sira', 'aktif'])


@csrf_exempt
def api_admin_yasal_metinler(request):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    if request.method == 'GET':
        data = [serialize_yasal(y) for y in YasalMetin.objects.filter(kurum=kurum)]
        return JsonResponse({'success': True, 'data': data})
    if request.method == 'POST':
        data = _parse_json(request)
        if data is None:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        y, created = YasalMetin.objects.update_or_create(
            kurum=kurum, tur=data.get('tur'),
            defaults={
                'baslik': data.get('baslik', ''),
                'icerik': data.get('icerik', ''),
                'aktif': data.get('aktif', True),
            },
        )
        return JsonResponse({'success': True, 'data': serialize_yasal(y)}, status=201 if created else 200)
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_admin_yasal_detail(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    return _generic_detail(request, YasalMetin, serialize_yasal, pk, kurum, ['tur', 'baslik', 'icerik', 'aktif'])


@csrf_exempt
def api_admin_iletisim_mesajlari(request):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    if request.method == 'GET':
        data = [serialize_iletisim_mesaji(m) for m in IletisimMesaji.objects.filter(kurum=kurum)]
        return JsonResponse({'success': True, 'data': data})
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_admin_iletisim_mesaj_detail(request, pk):
    kurum, err = _admin_kurum(request)
    if err:
        return err
    msg = get_object_or_404(IletisimMesaji, pk=pk, kurum=kurum)
    if request.method in ('PUT', 'PATCH'):
        data = _parse_json(request)
        if data is None:
            return JsonResponse({'success': False, 'error': 'Geçersiz JSON'}, status=400)
        if 'okundu' in data:
            msg.okundu = data['okundu']
            msg.save()
        return JsonResponse({'success': True, 'data': serialize_iletisim_mesaji(msg)})
    if request.method == 'DELETE':
        msg.delete()
        return JsonResponse({'success': True, 'message': 'Silindi'})
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
