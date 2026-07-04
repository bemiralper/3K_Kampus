"""Website serialization helpers."""
from apps.kurum.branding import serialize_kurum_branding


def _media_url(request, field):
    if not field:
        return None
    try:
        url = field.url
        if isinstance(url, str) and url.startswith('/'):
            return url
        return request.build_absolute_uri(url)
    except Exception:
        return None


def serialize_site_settings(settings, request):
    if not settings:
        return None
    return {
        'telefon': settings.telefon,
        'whatsapp': settings.whatsapp,
        'eposta': settings.eposta,
        'adres': settings.adres,
        'calisma_saatleri': settings.calisma_saatleri,
        'hero_baslik': settings.hero_baslik,
        'hero_alt_baslik': settings.hero_alt_baslik,
        'hero_slogan': settings.hero_slogan,
        'hero_maddeler': settings.hero_maddeler or [],
        'tanitim_baslik': settings.tanitim_baslik,
        'tanitim_icerik': settings.tanitim_icerik,
        'youtube_video_id': settings.youtube_video_id,
        'harita_embed_url': settings.harita_embed_url,
        'footer_copyright': settings.footer_copyright,
        'seo_baslik': settings.seo_baslik,
        'seo_aciklama': settings.seo_aciklama,
    }


def serialize_social_link(link):
    return {
        'id': link.id,
        'platform': link.platform,
        'url': link.url,
        'sira': link.sira,
        'aktif': link.aktif,
    }


def serialize_footer_link(link):
    return {
        'id': link.id,
        'kolon': link.kolon,
        'etiket': link.etiket,
        'url': link.url,
        'sira': link.sira,
        'aktif': link.aktif,
    }


def serialize_hero_slide(slide, request):
    return {
        'id': slide.id,
        'gorsel_url': _media_url(request, slide.gorsel),
        'sira': slide.sira,
        'aktif': slide.aktif,
    }


def serialize_duyuru(duyuru, request, include_content=False):
    data = {
        'id': duyuru.id,
        'baslik': duyuru.baslik,
        'slug': duyuru.slug,
        'ozet': duyuru.ozet,
        'kapak_gorseli_url': _media_url(request, duyuru.kapak_gorseli),
        'yayin_tarihi': duyuru.yayin_tarihi.isoformat() if duyuru.yayin_tarihi else None,
        'sira': duyuru.sira,
    }
    if include_content:
        data['icerik'] = duyuru.icerik
    return data


def serialize_sinav(sinav, request):
    tarih = sinav.tarih
    if tarih is not None and hasattr(tarih, 'isoformat'):
        tarih = tarih.isoformat()
    saat = sinav.saat
    if saat is not None and hasattr(saat, 'strftime'):
        saat = saat.strftime('%H:%M')
    return {
        'id': sinav.id,
        'tur': sinav.tur,
        'tarih': tarih,
        'saat': saat,
        'kapsam': sinav.kapsam,
        'baslik': sinav.baslik,
        'yayin_adi': sinav.yayin_adi or '',
        'aciklama': sinav.aciklama,
        'gorsel_url': _media_url(request, sinav.gorsel),
    }


def serialize_neden_kart(kart):
    return {
        'id': kart.id,
        'ikon': kart.ikon,
        'baslik': kart.baslik,
        'aciklama': kart.aciklama,
        'sira': kart.sira,
    }


def serialize_basari(stat):
    return {
        'id': stat.id,
        'etiket': stat.etiket,
        'deger': stat.deger,
        'sira': stat.sira,
    }


def serialize_yorum(yorum):
    return {
        'id': yorum.id,
        'ad': yorum.ad,
        'rol': yorum.rol,
        'puan': yorum.puan,
        'yorum': yorum.yorum,
        'sira': yorum.sira,
    }


def serialize_sss(sss):
    return {
        'id': sss.id,
        'soru': sss.soru,
        'cevap': sss.cevap,
        'sira': sss.sira,
    }


def serialize_yasal(metin):
    return {
        'id': metin.id,
        'tur': metin.tur,
        'baslik': metin.baslik,
        'icerik': metin.icerik,
        'updated_at': metin.updated_at.isoformat(),
    }


def serialize_iletisim_mesaji(msg):
    return {
        'id': msg.id,
        'ad_soyad': msg.ad_soyad,
        'telefon': msg.telefon,
        'mesaj': msg.mesaj,
        'okundu': msg.okundu,
        'created_at': msg.created_at.isoformat(),
    }


def build_landing_payload(kurum, request):
    settings = getattr(kurum, 'site_settings', None)
    try:
        settings_obj = kurum.site_settings
    except Exception:
        settings_obj = None

    return {
        'kurum': serialize_kurum_branding(kurum, request),
        'settings': serialize_site_settings(settings_obj, request),
        'social_links': [
            serialize_social_link(l) for l in kurum.site_social_links.filter(aktif=True)
        ],
        'footer_links': [
            serialize_footer_link(l) for l in kurum.site_footer_links.filter(aktif=True)
        ],
        'hero_slides': [
            serialize_hero_slide(s, request) for s in kurum.hero_slides.filter(aktif=True)
        ],
        'duyurular': [
            serialize_duyuru(d, request) for d in kurum.duyurular.filter(aktif=True)[:6]
        ],
        'sinav_takvimi': [
            serialize_sinav(s, request) for s in kurum.sinav_takvim.filter(aktif=True)
        ],
        'neden_kartlari': [
            serialize_neden_kart(k) for k in kurum.neden_kartlari.filter(aktif=True)
        ],
        'basari_istatistikleri': [
            serialize_basari(b) for b in kurum.basari_istatistikleri.filter(aktif=True)
        ],
        'ogrenci_yorumlari': [
            serialize_yorum(y) for y in kurum.ogrenci_yorumlari.filter(aktif=True)
        ],
        'sss': [serialize_sss(s) for s in kurum.sss_listesi.filter(aktif=True)],
        'yasal_metinler': [
            {'tur': y.tur, 'baslik': y.baslik} for y in kurum.yasal_metinler.filter(aktif=True)
        ],
    }
