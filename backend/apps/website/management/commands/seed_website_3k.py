"""3K Kampüs kurumsal site örnek verisi."""
from datetime import date, time
from django.core.management.base import BaseCommand
from apps.kurum.domain.models import Kurum
from apps.website.models import (
    SiteSettings, SiteSocialLink, SiteFooterLink, HeroSlide, Duyuru,
    SinavTakvim, NedenKart, BasariIstatistik, OgrenciYorumu, SSS, YasalMetin,
)


class Command(BaseCommand):
    help = '3K Kampüs kurumsal web sitesi için örnek veri oluşturur'

    def handle(self, *args, **options):
        kurum, created = Kurum.objects.get_or_create(
            kod='3K',
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
        if created:
            self.stdout.write(self.style.SUCCESS(f'Kurum oluşturuldu: {kurum.ad}'))

        settings, _ = SiteSettings.objects.get_or_create(kurum=kurum)
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
            'deneme analizleri ve veli bilgilendirme sistemleriyle uçtan uca destek sunar. '
            'Modern dijital altyapımız sayesinde akademik gelişim anlık takip edilir.'
        )
        settings.youtube_video_id = 'dQw4w9WgXcQ'
        settings.harita_embed_url = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3010.278!2d29.0!3d41.0!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDHCsDAwJzAwLjAiTiAyOcKwMDAnMDAuMCJF!5e0!3m2!1str!2str!4v1'
        settings.footer_copyright = '© 2026 3K Kampüs'
        settings.seo_baslik = '3K Kampüs — LGS & YKS Eğitim Merkezi'
        settings.seo_aciklama = '3K Kampüs ile akademik takip, bireysel koçluk ve deneme analizleri.'
        settings.save()

        social_defaults = [
            ('instagram', 'https://instagram.com/3kkampus', 0),
            ('facebook', 'https://facebook.com/3kkampus', 1),
        ]
        for platform, url, sira in social_defaults:
            SiteSocialLink.objects.get_or_create(
                kurum=kurum, platform=platform,
                defaults={'url': url, 'sira': sira, 'aktif': True},
            )
        SiteSocialLink.objects.filter(kurum=kurum, platform='youtube').update(aktif=False)

        footer_defaults = [
            ('kurumsal', 'Hakkımızda', '/hakkimizda', 0),
            ('kurumsal', '3K Sistemi', '/3k-sistemi', 1),
            ('hizli', 'Duyurular', '#duyurular', 0),
            ('hizli', 'Sınav Takvimi', '#sinav-takvimi', 1),
            ('hizli', 'İletişim', '#iletisim', 2),
            ('yasal', 'KVKK', '/yasal/kvkk', 0),
            ('yasal', 'Gizlilik Politikası', '/yasal/gizlilik', 1),
        ]
        for kolon, etiket, url, sira in footer_defaults:
            SiteFooterLink.objects.update_or_create(
                kurum=kurum, kolon=kolon, etiket=etiket,
                defaults={'url': url, 'sira': sira, 'aktif': True},
            )
        SiteFooterLink.objects.filter(
            kurum=kurum, url__icontains='basarilarimiz',
        ).update(aktif=False)
        SiteFooterLink.objects.filter(
            kurum=kurum, etiket='Hakkımızda', url='/kurumumuz',
        ).update(url='/hakkimizda')
        SiteFooterLink.objects.filter(
            kurum=kurum, etiket='Kurumumuz',
        ).update(etiket='3K Sistemi', url='/3k-sistemi')
        SiteFooterLink.objects.filter(
            kurum=kurum, url='/kurumumuz',
        ).update(url='/3k-sistemi')

        if not HeroSlide.objects.filter(kurum=kurum).exists():
            HeroSlide.objects.create(kurum=kurum, sira=0, aktif=True)

        duyuru_samples = [
            ('2026 LGS Kayıtları Başladı', 'lgs-kayit-2026', 'Erken kayıt avantajlarından yararlanın.'),
            ('Deneme Sınavı Sonuçları Açıklandı', 'deneme-sonuclari', 'Son deneme sınavı sonuçları sisteme yüklendi.'),
            ('Veli Toplantısı Duyurusu', 'veli-toplantisi', 'Veli bilgilendirme toplantısı 15 Temmuz\'da.'),
        ]
        for baslik, slug, ozet in duyuru_samples:
            Duyuru.objects.get_or_create(
                kurum=kurum, slug=slug,
                defaults={'baslik': baslik, 'ozet': ozet, 'icerik': f'<p>{ozet}</p>', 'yayin_tarihi': date.today(), 'aktif': True},
            )

        sinav_samples = [
            ('LGS', date(2026, 6, 7), time(10, 0), 'LGS 2026', 'turkiye_geneli'),
            ('TYT', date(2026, 6, 20), time(10, 15), 'TYT 2026', 'turkiye_geneli'),
            ('AYT', date(2026, 6, 21), time(10, 15), 'AYT 2026', 'turkiye_geneli'),
            ('LGS', date(2026, 5, 15), time(10, 0), '3K Deneme LGS', 'yerel'),
        ]
        for tur, tarih, saat, baslik, kapsam in sinav_samples:
            SinavTakvim.objects.get_or_create(
                kurum=kurum, tur=tur, tarih=tarih, baslik=baslik,
                defaults={'saat': saat, 'kapsam': kapsam, 'aciklama': baslik, 'aktif': True},
            )

        neden_defaults = [
            ('chart', 'Akademik Takip', 'Öğrenci gelişimi anlık raporlanır.'),
            ('user', 'Bireysel Koçluk', 'Her öğrenciye özel koç desteği.'),
            ('target', 'Deneme Analizleri', 'Detaylı sınav performans analizi.'),
            ('bell', 'Veli Bilgilendirme', 'Veliler anlık bilgilendirilir.'),
        ]
        for i, (ikon, baslik, aciklama) in enumerate(neden_defaults):
            NedenKart.objects.get_or_create(
                kurum=kurum, baslik=baslik,
                defaults={'ikon': ikon, 'aciklama': aciklama, 'sira': i, 'aktif': True},
            )

        basari_defaults = [
            ('LGS Başarı Oranı', '%92', 0),
            ('YKS Yerleşme', '%87', 1),
            ('Mutlu Öğrenci', '1500+', 2),
            ('Deneyim', '15 Yıl', 3),
        ]
        for etiket, deger, sira in basari_defaults:
            BasariIstatistik.objects.get_or_create(
                kurum=kurum, etiket=etiket,
                defaults={'deger': deger, 'sira': sira, 'aktif': True},
            )

        yorum_defaults = [
            ('Ayşe K.', 'LGS Mezunu', 5, '3K Kampüs sayesinde hedef liseye yerleştim.'),
            ('Mehmet T.', 'YKS Mezunu', 5, 'Koçluk sistemi gerçekten fark yarattı.'),
            ('Zeynep A.', 'Veli', 5, 'Çocuğumun gelişimini anlık takip edebiliyorum.'),
            ('Can B.', '11. Sınıf', 4, 'Deneme analizleri çok detaylı.'),
            ('Elif S.', 'YKS Mezunu', 5, 'Tüm süreç boyunca destek aldım.'),
        ]
        for i, (ad, rol, puan, yorum) in enumerate(yorum_defaults):
            OgrenciYorumu.objects.get_or_create(
                kurum=kurum, ad=ad, yorum=yorum,
                defaults={'rol': rol, 'puan': puan, 'sira': i, 'aktif': True},
            )

        sss_defaults = [
            ('Kayıt nasıl yapılır?', 'Web sitemizden veya kurumumuza gelerek kayıt yaptırabilirsiniz.'),
            ('Deneme sınavları ücretsiz mi?', 'Belirli dönemlerde ücretsiz deneme sınavları düzenlenmektedir.'),
            ('Koçluk hizmeti var mı?', 'Evet, tüm öğrencilerimize bireysel koçluk desteği sunulmaktadır.'),
            ('Veli bilgilendirme nasıl yapılır?', 'Veli portalı ve WhatsApp bildirimleri ile anlık bilgilendirme yapılır.'),
        ]
        for i, (soru, cevap) in enumerate(sss_defaults):
            SSS.objects.get_or_create(
                kurum=kurum, soru=soru,
                defaults={'cevap': cevap, 'sira': i, 'aktif': True},
            )

        yasal_defaults = [
            ('kvkk', 'Kişisel Verilerin Korunması Aydınlatma Metni', '<p>Güncel metin /yasal/kvkk sayfasında yayımlanmaktadır.</p>'),
            ('gizlilik', 'Gizlilik Politikası', '<p>Güncel metin /yasal/gizlilik sayfasında yayımlanmaktadır.</p>'),
            ('kullanim', 'Kullanım Koşulları', '<p>Platform kullanım koşulları.</p>'),
        ]
        for tur, baslik, icerik in yasal_defaults:
            YasalMetin.objects.get_or_create(
                kurum=kurum, tur=tur,
                defaults={'baslik': baslik, 'icerik': icerik, 'aktif': True},
            )

        self.stdout.write(self.style.SUCCESS('3K Kampüs site verisi hazır.'))
