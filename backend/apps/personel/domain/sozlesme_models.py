"""
Personel Sözleşmeleri — Domain Modelleri

Varlıklar:
  1. PersonelSozlesme — Ana sözleşme kaydı (eğitim yılı bazlı)
  2. DersUcretTanim  — Sözleşmeye bağlı ders ücreti konfigürasyonu
  3. AylikHakedis    — Aylık puantaj / hakediş hesaplaması
"""
from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal


# ═══════════════════════════════════════════════════════════════
#  ENUM / CHOICES
# ═══════════════════════════════════════════════════════════════

class SozlesmeTuru(models.TextChoices):
    TAM_ZAMANLI = 'TAM_ZAMANLI', 'Tam Zamanlı (Maaşlı)'
    DERS_UCRETLI = 'DERS_UCRETLI', 'Ders Ücretli'
    KARMA = 'KARMA', 'Karma (Maaş + Ders Ücreti)'


class SozlesmeDurumu(models.TextChoices):
    TASLAK = 'TASLAK', 'Taslak'
    AKTIF = 'AKTIF', 'Aktif'
    ASKIDA = 'ASKIDA', 'Askıda'
    SONA_ERDI = 'SONA_ERDI', 'Sona Erdi'
    FESHEDILDI = 'FESHEDILDI', 'Feshedildi'


class UcretTipi(models.TextChoices):
    SAAT_BASI = 'SAAT_BASI', 'Saat Başı'
    DERS_BASI = 'DERS_BASI', 'Ders Başı'
    AYLIK_PAKET = 'AYLIK_PAKET', 'Aylık Paket'


class HakedisDurumu(models.TextChoices):
    HESAPLANDI = 'HESAPLANDI', 'Hesaplandı'
    ONAYLANDI = 'ONAYLANDI', 'Onaylandı'
    ODENDI = 'ODENDI', 'Ödendi'
    IPTAL = 'IPTAL', 'İptal'


# ═══════════════════════════════════════════════════════════════
#  1) PERSONEL SÖZLEŞME
# ═══════════════════════════════════════════════════════════════

class PersonelSozlesme(models.Model):
    """
    Her personel için eğitim yılı bazlı sözleşme kaydı.

    İş kuralları:
    - Bir personelin aynı eğitim yılında en fazla 1 aktif sözleşmesi olabilir.
    - Ders Ücretli türde brüt maaş 0 olabilir.
    - Karma türde hem brüt maaş hem ders ücreti tanımı olur.
    """

    # ─── İlişkiler ───
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='personel_sozlesmeleri',
        verbose_name='Kurum',
    )
    personel = models.ForeignKey(
        'personel.Personel',
        on_delete=models.CASCADE,
        related_name='sozlesmeler',
        verbose_name='Personel',
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='personel_sozlesmeleri',
        verbose_name='Eğitim Yılı',
    )

    # ─── Sözleşme Bilgileri ───
    sozlesme_turu = models.CharField(
        'Sözleşme Türü',
        max_length=20,
        choices=SozlesmeTuru.choices,
        default=SozlesmeTuru.TAM_ZAMANLI,
    )
    durum = models.CharField(
        'Durum',
        max_length=20,
        choices=SozlesmeDurumu.choices,
        default=SozlesmeDurumu.TASLAK,
    )
    baslangic_tarihi = models.DateField('Sözleşme Başlangıcı')
    bitis_tarihi = models.DateField('Sözleşme Bitişi')

    # ─── Maaş Bilgileri ───
    brut_maas = models.DecimalField(
        'Brüt Maaş (₺)',
        max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    net_maas = models.DecimalField(
        'Net Maaş (₺)',
        max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    sgk_gun = models.PositiveSmallIntegerField(
        'SGK Gün Sayısı',
        default=30,
        help_text='Aylık SGK gün sayısı (0-30)',
    )

    # ─── Ders Ücreti Bayrağı ───
    ders_ucreti_aktif = models.BooleanField(
        'Ders Ücreti Aktif mi?',
        default=False,
        help_text='Sözleşmede ek ders ücreti var mı?',
    )

    # ─── Dosya Eki ───
    sozlesme_dosya = models.FileField(
        'Sözleşme Dosyası',
        upload_to='personel/sozlesmeler/%Y/',
        null=True, blank=True,
        help_text='Sözleşme PDF / taranmış belge',
    )

    # ─── Fesih Bilgileri ───
    fesih_tarihi = models.DateField(
        'Fesih Tarihi',
        null=True, blank=True,
        help_text='Sözleşmenin feshedildiği tarih',
    )
    fesih_sebebi = models.TextField(
        'Fesih Sebebi',
        blank=True,
        help_text='Fesih gerekçesi / açıklaması',
    )

    # ─── Notlar ───
    notlar = models.TextField('Notlar', blank=True)

    # ─── Zaman ───
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'personel_sozlesme'
        verbose_name = 'Personel Sözleşme'
        verbose_name_plural = 'Personel Sözleşmeleri'
        ordering = ['-egitim_yili__baslangic_yil', 'personel__soyad']
        constraints = [
            models.UniqueConstraint(
                fields=['personel', 'egitim_yili'],
                condition=models.Q(durum__in=['TASLAK', 'AKTIF', 'ASKIDA']),
                name='unique_aktif_sozlesme_per_yil',
            )
        ]
        indexes = [
            models.Index(fields=['kurum', 'egitim_yili', 'durum']),
            models.Index(fields=['personel', 'egitim_yili']),
        ]

    def __str__(self):
        return f"{self.personel.tam_ad} — {self.get_sozlesme_turu_display()} ({self.egitim_yili})"

    def save(self, *args, **kwargs):
        if not self.kurum_id:
            self.kurum_id = self.personel.kurum_id
        # Ders Ücretli türde brüt maaş kontrolü
        if self.sozlesme_turu == SozlesmeTuru.DERS_UCRETLI:
            self.ders_ucreti_aktif = True
        elif self.sozlesme_turu == SozlesmeTuru.KARMA:
            self.ders_ucreti_aktif = True
        super().save(*args, **kwargs)


# ═══════════════════════════════════════════════════════════════
#  2) ÜCRET DÖNEMİ (Dönemsel Ücretlendirme)
# ═══════════════════════════════════════════════════════════════

class UcretDonemi(models.Model):
    """
    Sözleşme içinde dönemsel maaş tanımı.
    Örn: İlk 3 ay 30.000₺, sonraki aylar 40.000₺
    Eğer sözleşmenin dönemleri varsa, o aya denk gelen dönemin maaşı kullanılır.
    Dönem yoksa sözleşmedeki sabit brut_maas/net_maas kullanılır.
    """

    sozlesme = models.ForeignKey(
        PersonelSozlesme,
        on_delete=models.CASCADE,
        related_name='ucret_donemleri',
        verbose_name='Sözleşme',
    )

    baslangic_ay = models.PositiveSmallIntegerField(
        'Başlangıç Ayı',
        help_text='Sözleşmenin kaçıncı ayından itibaren (1-based). Ör: 1',
    )
    bitis_ay = models.PositiveSmallIntegerField(
        'Bitiş Ayı',
        help_text='Sözleşmenin kaçıncı ayına kadar (dahil). Ör: 3. 0=sonsuza kadar',
    )

    brut_maas = models.DecimalField(
        'Brüt Maaş (₺)',
        max_digits=12, decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    net_maas = models.DecimalField(
        'Net Maaş (₺)',
        max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
    )

    aciklama = models.CharField(
        'Açıklama',
        max_length=255,
        blank=True,
        help_text='Ör: Deneme süresi, Zam sonrası dönem vb.',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'personel_ucret_donemi'
        verbose_name = 'Ücret Dönemi'
        verbose_name_plural = 'Ücret Dönemleri'
        ordering = ['sozlesme', 'baslangic_ay']
        indexes = [
            models.Index(fields=['sozlesme', 'baslangic_ay']),
        ]

    def __str__(self):
        bitis = f"{self.bitis_ay}. ay" if self.bitis_ay else 'sonsuza kadar'
        return f"{self.baslangic_ay}. ay – {bitis}: {self.brut_maas}₺"


# ═══════════════════════════════════════════════════════════════
#  3) DERS ÜCRETİ TANIMI
# ═══════════════════════════════════════════════════════════════

class DersUcretTanim(models.Model):
    """
    Sözleşmeye bağlı ders ücreti konfigürasyonu.
    Birden fazla branş/ders için farklı ücret tanımlanabilir.
    """

    sozlesme = models.ForeignKey(
        PersonelSozlesme,
        on_delete=models.CASCADE,
        related_name='ders_ucretleri',
        verbose_name='Sözleşme',
    )
    brans = models.ForeignKey(
        'egitim_tanimlari.Brans',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='ders_ucret_tanimlari',
        verbose_name='Branş / Ders',
    )

    ucret_tipi = models.CharField(
        'Ücret Tipi',
        max_length=20,
        choices=UcretTipi.choices,
        default=UcretTipi.SAAT_BASI,
    )
    birim_ucret = models.DecimalField(
        'Birim Ücret (₺)',
        max_digits=10, decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    haftalik_saat = models.DecimalField(
        'Haftalık Planlanan Saat',
        max_digits=5, decimal_places=1,
        default=Decimal('0.0'),
    )
    min_saat = models.DecimalField(
        'Aylık Min Saat',
        max_digits=5, decimal_places=1,
        null=True, blank=True,
        help_text='Garanti edilen minimum aylık saat',
    )
    max_saat = models.DecimalField(
        'Aylık Max Saat',
        max_digits=5, decimal_places=1,
        null=True, blank=True,
    )
    notlar = models.CharField('Not', max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'personel_ders_ucret_tanim'
        verbose_name = 'Ders Ücreti Tanımı'
        verbose_name_plural = 'Ders Ücreti Tanımları'
        ordering = ['sozlesme', 'brans__ad']

    def __str__(self):
        brans_ad = self.brans.ad if self.brans else 'Genel'
        return f"{brans_ad} — {self.birim_ucret}₺/{self.get_ucret_tipi_display()}"


# ═══════════════════════════════════════════════════════════════
#  4) AYLIK HAKEDİŞ
# ═══════════════════════════════════════════════════════════════

class AylikHakedis(models.Model):
    """
    Her ay için hesaplanan personel hakediş / bordro kaydı.

    İş kuralları:
    - Bir sözleşme + ay kombinasyonu benzersiz olmalı.
    - Onaylanmış hakediş değiştirilemez (sadece iptal + yeni oluştur).
    - Ödendi olarak işaretlendiğinde ödeme tarihi zorunlu.
    """

    sozlesme = models.ForeignKey(
        PersonelSozlesme,
        on_delete=models.CASCADE,
        related_name='hakedisler',
        verbose_name='Sözleşme',
    )

    # ─── Dönem ───
    yil = models.PositiveSmallIntegerField('Yıl', help_text='Ör: 2026')
    ay = models.PositiveSmallIntegerField('Ay', help_text='1-12')

    # ─── Kalemler ───
    sabit_maas = models.DecimalField(
        'Aylık Maaş (₺)',
        max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
    )
    toplam_ders_saati = models.DecimalField(
        'Toplam Ders Saati',
        max_digits=7, decimal_places=1,
        default=Decimal('0.0'),
    )
    ders_basi_ucret = models.DecimalField(
        'Ders Başı Birim Ücret (₺)',
        max_digits=10, decimal_places=2,
        default=Decimal('0.00'),
        help_text='Sözleşmeden otomatik gelir',
    )
    ders_ucreti_toplam = models.DecimalField(
        'Ders Ücreti Toplamı (₺)',
        max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
    )
    prim = models.DecimalField(
        'Prim (₺)',
        max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
        help_text='Performans primi, hedef primi vb.',
    )
    fazla_mesai = models.DecimalField(
        'Fazla Mesai (₺)',
        max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
    )
    ek_odeme = models.DecimalField(
        'Ek Ödemeler (₺)',
        max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
        help_text='İkramiye, yol yardımı vb.',
    )
    avans = models.DecimalField(
        'Avans / Ön Ödeme (₺)',
        max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
        help_text='Daha önce yapılan ön ödeme',
    )
    kesintiler = models.DecimalField(
        'Diğer Kesintiler (₺)',
        max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
        help_text='SGK, vergi, ceza vb.',
    )

    # ─── Toplamlar ───
    brut_toplam = models.DecimalField(
        'Brüt Toplam (₺)',
        max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
    )
    net_hakedis = models.DecimalField(
        'Net Hakediş (₺)',
        max_digits=12, decimal_places=2,
        default=Decimal('0.00'),
    )

    # ─── Durum ───
    durum = models.CharField(
        'Durum',
        max_length=20,
        choices=HakedisDurumu.choices,
        default=HakedisDurumu.HESAPLANDI,
    )
    odeme_tarihi = models.DateField(
        'Ödeme Tarihi',
        null=True, blank=True,
    )
    notlar = models.TextField('Notlar', blank=True)

    # ─── Zaman ───
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'personel_aylik_hakedis'
        verbose_name = 'Aylık Hakediş'
        verbose_name_plural = 'Aylık Hakedişler'
        ordering = ['-yil', '-ay']
        constraints = [
            models.UniqueConstraint(
                fields=['sozlesme', 'yil', 'ay'],
                name='unique_hakedis_sozlesme_ay',
            )
        ]
        indexes = [
            models.Index(fields=['sozlesme', 'yil', 'ay']),
            models.Index(fields=['durum']),
        ]

    def __str__(self):
        return f"{self.sozlesme.personel.tam_ad} — {self.ay}/{self.yil} ({self.get_durum_display()})"

    def hesapla(self):
        """
        Brüt toplam ve net hakediş hesapla.
        ders_ucreti_toplam = ders_basi_ucret × toplam_ders_saati (otomatik)
        brüt = maaş + ders_ücreti + prim + fazla_mesai + ek_ödeme
        net  = brüt - avans - kesintiler
        """
        self.ders_ucreti_toplam = self.ders_basi_ucret * self.toplam_ders_saati
        self.brut_toplam = (
            self.sabit_maas
            + self.ders_ucreti_toplam
            + self.prim
            + self.fazla_mesai
            + self.ek_odeme
        )
        self.net_hakedis = self.brut_toplam - self.avans - self.kesintiler
        return self


# ═══════════════════════════════════════════════════════════════
#  5) AVANS KAYDI
# ═══════════════════════════════════════════════════════════════

class AvansKaydi(models.Model):
    """
    Personele yapılan avans/ön ödeme kayıtları.
    Bordrodaki 'avans' alanı bu kayıtlardan otomatik toplanır.
    """

    sozlesme = models.ForeignKey(
        PersonelSozlesme,
        on_delete=models.CASCADE,
        related_name='avans_kayitlari',
        verbose_name='Sözleşme',
    )

    tarih = models.DateField('Avans Tarihi')
    tutar = models.DecimalField(
        'Tutar (₺)',
        max_digits=12, decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    aciklama = models.CharField(
        'Açıklama',
        max_length=500,
        blank=True,
        help_text='Avansın nedeni / açıklaması',
    )

    # Hangi aya mahsup edileceği
    mahsup_yil = models.PositiveSmallIntegerField('Mahsup Yılı', help_text='Hangi yılın bordrosundan düşülecek')
    mahsup_ay = models.PositiveSmallIntegerField('Mahsup Ayı', help_text='Hangi ayın bordrosundan düşülecek (1-12)')

    olusturan = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='olusturulan_avanslar',
        verbose_name='Oluşturan',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'personel_avans_kaydi'
        verbose_name = 'Avans Kaydı'
        verbose_name_plural = 'Avans Kayıtları'
        ordering = ['-tarih']
        indexes = [
            models.Index(fields=['sozlesme', 'mahsup_yil', 'mahsup_ay']),
        ]

    def __str__(self):
        return f"{self.sozlesme.personel.tam_ad} — {self.tarih} — {self.tutar}₺"
