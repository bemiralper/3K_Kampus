"""Kurumsal site (landing) varsayılan içerik seed."""
from datetime import date, time

from apps.kurum.domain.models import Kurum
from apps.website.models import (
    SiteSettings, SiteSocialLink, SiteFooterLink, HeroSlide, Duyuru,
    SinavTakvim, NedenKart, BasariIstatistik, OgrenciYorumu, SSS, YasalMetin,
)

LANDING_KURUM_KOD = '3K'


def resolve_landing_kurum(kod: str | None = None) -> Kurum | None:
    """Mevcut kurumu bul — istek sırasında otomatik kurum oluşturma."""
    lookup = (kod or LANDING_KURUM_KOD or '').strip()
    if lookup:
        kurum = Kurum.objects.filter(kod__iexact=lookup, aktif_mi=True).first()
        if kurum:
            return kurum
    return Kurum.objects.filter(aktif_mi=True).order_by('id').first()


def get_or_create_landing_kurum() -> tuple[Kurum, bool]:
    """Yalnızca seed komutu için — canlı isteklerde kullanılmaz."""
    kurum, created = Kurum.objects.get_or_create(
        kod=LANDING_KURUM_KOD,
        defaults={
            'ad': '3K Kampüs',
            'gorunen_ad': '3K Kampüs',
            'slogan': 'Yeni Nesil Eğitim Merkezi',
            'telefon_sabit': '0212 555 00 00',
            'telefon_cep': '0532 555 00 00',
            'adres': 'İstanbul, Türkiye',
            'aktif_mi': True,
        },
    )
    if not kurum.aktif_mi:
        kurum.aktif_mi = True
        kurum.save(update_fields=['aktif_mi'])
    return kurum, created


def seed_website_defaults(kurum: Kurum | None = None, *, overwrite_settings: bool = False) -> dict:
    """Anasayfa içeriklerini doldurur. Mevcut kayıtları silmez; eksikleri ekler."""
    if kurum is None:
        kurum, _ = get_or_create_landing_kurum()

    settings, created_settings = SiteSettings.objects.get_or_create(kurum=kurum)
    if created_settings or overwrite_settings:
        settings.telefon = '0212 555 00 00'
        settings.whatsapp = '905325550000'
        settings.eposta = 'info@3kkampus.com'
        settings.adres = 'Ataşehir, İstanbul'
        settings.calisma_saatleri = 'Pazartesi – Cumartesi: 09:00 – 19:00\nPazar: Kapalı'
        settings.hero_baslik = '3K Kampüs'
        settings.hero_alt_baslik = 'LGS • YKS • Okul Destek Programları'
        settings.hero_slogan = 'Başarıya Giden Yolun Dijital Takip Sistemi'
        settings.hero_maddeler = [
            'Akademik Takip',
            'Bireysel Koçluk',
            'Deneme Analizleri',
            'Veli Bilgilendirme',
        ]
        settings.tanitim_baslik = '3K Kampüs Farkı'
        settings.tanitim_icerik = (
            '3K Kampüs, LGS ve YKS hazırlık süreçlerinde öğrencilerimize bireysel koçluk, '
            'deneme analizleri ve veli bilgilendirme sistemleriyle uçtan uca destek sunar.'
        )
        settings.footer_copyright = '© 2026 3K Kampüs'
        settings.footer_marka_metni = '3K Kampüs, Özgün Sınav Öğretim Eğitim A.Ş. markasıdır.'
        settings.seo_baslik = '3K Kampüs — LGS & YKS Eğitim Merkezi'
        settings.seo_aciklama = '3K Kampüs ile akademik takip, bireysel koçluk ve deneme analizleri.'
        settings.seo_anahtar_kelimeler = '3K Kampüs, LGS, YKS, eğitim merkezi, deneme sınavı, İstanbul'
        settings.seo_robots_index = True
        if not settings.harita_embed_url:
            settings.harita_embed_url = (
                'https://maps.google.com/maps?q=Ata%C5%9Fehir%2C%20%C4%B0stanbul'
                '&t=&z=15&ie=UTF8&iwloc=&output=embed'
            )
        settings.save()

    counts = {'settings': 1 if settings else 0}

    for platform, url, sira in [
        ('instagram', 'https://instagram.com/3kkampus', 0),
        ('facebook', 'https://facebook.com/3kkampus', 1),
    ]:
        SiteSocialLink.objects.get_or_create(
            kurum=kurum, platform=platform,
            defaults={'url': url, 'sira': sira, 'aktif': True},
        )
    counts['social_links'] = SiteSocialLink.objects.filter(kurum=kurum).count()

    for kolon, etiket, url, sira in [
        ('kurumsal', 'Hakkımızda', '/hakkimizda', 0),
        ('kurumsal', '3K Sistemi', '/3k-sistemi', 1),
        ('hizli', 'Duyurular', '#duyurular', 0),
        ('hizli', 'Sınav Takvimi', '#sinav-takvimi', 1),
        ('hizli', 'İletişim', '#iletisim', 2),
        ('yasal', 'KVKK', '/yasal/kvkk', 0),
        ('yasal', 'Gizlilik Politikası', '/yasal/gizlilik', 1),
    ]:
        SiteFooterLink.objects.update_or_create(
            kurum=kurum, kolon=kolon, etiket=etiket,
            defaults={'url': url, 'sira': sira, 'aktif': True},
        )
    counts['footer_links'] = SiteFooterLink.objects.filter(kurum=kurum).count()

    if not HeroSlide.objects.filter(kurum=kurum).exists():
        HeroSlide.objects.create(kurum=kurum, sira=0, aktif=True)
    counts['hero_slides'] = HeroSlide.objects.filter(kurum=kurum).count()

    for baslik, slug, ozet in [
        ('2026 LGS Kayıtları Başladı', 'lgs-kayit-2026', 'Erken kayıt avantajlarından yararlanın.'),
        ('Deneme Sınavı Sonuçları Açıklandı', 'deneme-sonuclari', 'Son deneme sınavı sonuçları sisteme yüklendi.'),
        ('Veli Toplantısı Duyurusu', 'veli-toplantisi', 'Veli bilgilendirme toplantısı yakında.'),
    ]:
        Duyuru.objects.get_or_create(
            kurum=kurum, slug=slug,
            defaults={
                'baslik': baslik, 'ozet': ozet, 'icerik': f'<p>{ozet}</p>',
                'yayin_tarihi': date.today(), 'aktif': True,
            },
        )
    counts['duyurular'] = Duyuru.objects.filter(kurum=kurum).count()

    for tur, tarih, saat, saat_bitis, baslik, kapsam in [
        ('LGS', date(2026, 6, 7), time(10, 0), time(13, 0), 'LGS 2026', 'turkiye_geneli'),
        ('TYT', date(2026, 6, 20), time(10, 15), time(13, 45), 'TYT 2026', 'turkiye_geneli'),
        ('AYT', date(2026, 6, 21), time(10, 15), time(13, 45), 'AYT 2026', 'turkiye_geneli'),
        ('LGS', date(2026, 5, 15), time(10, 0), time(12, 30), '3K Deneme LGS', 'yerel'),
    ]:
        SinavTakvim.objects.get_or_create(
            kurum=kurum, tur=tur, tarih=tarih, baslik=baslik,
            defaults={'saat': saat, 'saat_bitis': saat_bitis, 'kapsam': kapsam, 'aciklama': baslik, 'aktif': True},
        )
    counts['sinav_takvim'] = SinavTakvim.objects.filter(kurum=kurum).count()

    for i, (ikon, baslik, aciklama) in enumerate([
        ('🎯', 'Akademik Takip', 'Öğrenci gelişimi anlık raporlanır.'),
        ('📚', 'Bireysel Koçluk', 'Her öğrenciye özel koç desteği.'),
        ('📱', 'Deneme Analizleri', 'Detaylı sınav performans analizi.'),
        ('🔔', 'Veli Bilgilendirme', 'Veliler anlık bilgilendirilir.'),
    ]):
        NedenKart.objects.get_or_create(
            kurum=kurum, baslik=baslik,
            defaults={'ikon': ikon, 'aciklama': aciklama, 'sira': i, 'aktif': True},
        )
    counts['neden_kartlari'] = NedenKart.objects.filter(kurum=kurum).count()

    for etiket, deger, sira in [
        ('LGS Başarı Oranı', '%92', 0),
        ('YKS Yerleşme', '%87', 1),
        ('Mutlu Öğrenci', '1500+', 2),
        ('Deneyim', '15 Yıl', 3),
    ]:
        BasariIstatistik.objects.get_or_create(
            kurum=kurum, etiket=etiket,
            defaults={'deger': deger, 'sira': sira, 'aktif': True},
        )
    counts['basari'] = BasariIstatistik.objects.filter(kurum=kurum).count()

    for i, (ad, rol, puan, yorum) in enumerate([
        ('Ayşe K.', 'LGS Mezunu', 5, '3K Kampüs sayesinde hedef liseye yerleştim.'),
        ('Mehmet T.', 'YKS Mezunu', 5, 'Koçluk sistemi gerçekten fark yarattı.'),
        ('Zeynep A.', 'Veli', 5, 'Çocuğumun gelişimini anlık takip edebiliyorum.'),
    ]):
        OgrenciYorumu.objects.get_or_create(
            kurum=kurum, ad=ad, yorum=yorum,
            defaults={'rol': rol, 'puan': puan, 'sira': i, 'aktif': True},
        )
    counts['yorumlar'] = OgrenciYorumu.objects.filter(kurum=kurum).count()

    for i, (soru, cevap) in enumerate([
        ('Kayıt nasıl yapılır?', 'Web sitemizden veya kurumumuza gelerek kayıt yaptırabilirsiniz.'),
        ('Deneme sınavları ücretsiz mi?', 'Belirli dönemlerde ücretsiz deneme sınavları düzenlenmektedir.'),
        ('Koçluk hizmeti var mı?', 'Evet, tüm öğrencilerimize bireysel koçluk desteği sunulmaktadır.'),
        ('Veli bilgilendirme nasıl yapılır?', 'Veli portalı ve WhatsApp bildirimleri ile anlık bilgilendirme yapılır.'),
    ]):
        SSS.objects.get_or_create(
            kurum=kurum, soru=soru,
            defaults={'cevap': cevap, 'sira': i, 'aktif': True},
        )
    counts['sss'] = SSS.objects.filter(kurum=kurum).count()

    for tur, baslik, icerik in [
        ('kvkk', 'Kişisel Verilerin Korunması Aydınlatma Metni', '<p>KVKK aydınlatma metni.</p>'),
        ('gizlilik', 'Gizlilik Politikası', '<p>Gizlilik politikası metni.</p>'),
        ('kullanim', 'Kullanım Koşulları', '<p>Platform kullanım koşulları.</p>'),
    ]:
        YasalMetin.objects.get_or_create(
            kurum=kurum, tur=tur,
            defaults={'baslik': baslik, 'icerik': icerik, 'aktif': True},
        )
    counts['yasal'] = YasalMetin.objects.filter(kurum=kurum).count()

    return {'kurum_id': kurum.id, 'kurum_kod': kurum.kod, 'counts': counts}


def landing_content_is_empty(kurum: Kurum) -> bool:
    """Anasayfa bölümlerinden en az biri boşsa varsayılan seed gerekir."""
    if not SiteSettings.objects.filter(kurum=kurum).exists():
        return True
    settings = SiteSettings.objects.filter(kurum=kurum).first()
    if settings and not (settings.telefon or '').strip():
        return True
    if Duyuru.objects.filter(kurum=kurum).count() == 0:
        return True
    if SSS.objects.filter(kurum=kurum).count() == 0:
        return True
    if NedenKart.objects.filter(kurum=kurum).count() == 0:
        return True
    if BasariIstatistik.objects.filter(kurum=kurum).count() == 0:
        return True
    if OgrenciYorumu.objects.filter(kurum=kurum).count() == 0:
        return True
    if SinavTakvim.objects.filter(kurum=kurum).count() == 0:
        return True
    return False


def ensure_website_defaults(kurum: Kurum | None = None) -> dict | None:
    """Eksik site içeriklerini otomatik doldurur (idempotent)."""
    if kurum is None:
        kurum = resolve_landing_kurum()
    if kurum is None or not landing_content_is_empty(kurum):
        return None
    settings = SiteSettings.objects.filter(kurum=kurum).first()
    overwrite = settings is None or not (settings.telefon or '').strip()
    return seed_website_defaults(kurum, overwrite_settings=overwrite)
