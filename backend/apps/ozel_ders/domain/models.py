"""
Özel Ders / Birebir operasyon modelleri.

Sınıf ProgramGridCell / LessonSession akışından bağımsızdır.
"""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class ProgramDurumu(models.TextChoices):
    AKTIF = 'AKTIF', 'Aktif'
    PASIF = 'PASIF', 'Pasif'


class OturumTuru(models.TextChoices):
    OZEL = 'OZEL', 'Özel Ders'
    TELAFI = 'TELAFI', 'Telafi'
    EK = 'EK', 'Ek Ders'
    ETUT = 'ETUT', 'Etüt'


class OturumDurumu(models.TextChoices):
    PLANLANDI = 'PLANLANDI', 'Planlandı'
    ISLENDI = 'ISLENDI', 'İşlendi'
    IPTAL = 'IPTAL', 'İptal'
    TELAFI_EDILECEK = 'TELAFI_EDILECEK', 'Telafi Edilecek'
    OGRENCI_GELMEDI = 'OGRENCI_GELMEDI', 'Öğrenci Gelmedi'
    OGRETMEN_GELMEDI = 'OGRETMEN_GELMEDI', 'Öğretmen Gelmedi'
    ONLINE = 'ONLINE', 'Online'


class HakedisDurumu(models.TextChoices):
    TASLAK = 'TASLAK', 'Taslak'
    ONAYLANDI = 'ONAYLANDI', 'Onaylandı'
    BORDOYA_ISLENDI = 'BORDOYA_ISLENDI', 'Bordroya İşlendi'
    IPTAL = 'IPTAL', 'İptal'


class MesaiModu(models.TextChoices):
    MESAI_DISI_SADECE = 'MESAI_DISI_SADECE', 'Sadece mesai dışı'
    HER_ZAMAN = 'HER_ZAMAN', 'Her zaman ücretlendir'
    HICBIR_ZAMAN = 'HICBIR_ZAMAN', 'Hiçbir zaman ücretlendirme'


class BirebirOgrenciProgrami(models.Model):
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='birebir_programlar',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='birebir_programlar',
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='birebir_programlar',
    )
    term = models.ForeignKey(
        'term.Term',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='birebir_programlar',
    )
    ogrenci = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='birebir_programlar',
    )
    ogrenci_egitim_paketi = models.ForeignKey(
        'ogrenci.OgrenciEgitimPaketi',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='birebir_programlar',
    )
    premium_paket = models.ForeignKey(
        'egitim_paketleri.PremiumPaket',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='birebir_programlar',
    )
    ozel_ders_paket = models.ForeignKey(
        'egitim_paketleri.OzelDers',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='birebir_programlar',
    )
    baslangic_tarihi = models.DateField()
    bitis_tarihi = models.DateField(null=True, blank=True)
    durum = models.CharField(
        max_length=16,
        choices=ProgramDurumu.choices,
        default=ProgramDurumu.AKTIF,
        db_index=True,
    )
    notlar = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_birebir_programlar',
    )

    class Meta:
        db_table = 'ozel_ders_birebir_program'
        verbose_name = 'Birebir Öğrenci Programı'
        verbose_name_plural = 'Birebir Öğrenci Programları'
        ordering = ['-baslangic_tarihi', '-id']
        indexes = [
            models.Index(fields=['kurum', 'sube', 'egitim_yili', 'durum']),
            models.Index(fields=['ogrenci', 'durum']),
        ]

    def __str__(self):
        return f'{self.ogrenci_id} program #{self.pk}'


class BirebirHaftalikSlot(models.Model):
    program = models.ForeignKey(
        BirebirOgrenciProgrami,
        on_delete=models.CASCADE,
        related_name='slots',
    )
    gun = models.PositiveSmallIntegerField(help_text='1=Pazartesi … 7=Pazar')
    baslangic = models.TimeField()
    bitis = models.TimeField()
    sure_dk = models.PositiveIntegerField(default=0)
    ders = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.PROTECT,
        related_name='birebir_slots',
    )
    ogretmen = models.ForeignKey(
        'personel.Personel',
        on_delete=models.PROTECT,
        related_name='birebir_slots',
    )
    oda = models.ForeignKey(
        'oda.Oda',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='birebir_slots',
    )
    aktif = models.BooleanField(default=True)
    baslangic_tarihi = models.DateField(
        null=True,
        blank=True,
        help_text='Boşsa program başlangıcı kullanılır',
    )
    bitis_tarihi = models.DateField(
        null=True,
        blank=True,
        help_text='Boşsa program bitişi kullanılır',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ozel_ders_birebir_slot'
        verbose_name = 'Birebir Haftalık Slot'
        verbose_name_plural = 'Birebir Haftalık Slotlar'
        ordering = ['gun', 'baslangic', 'id']
        indexes = [
            models.Index(fields=['program', 'gun', 'aktif']),
            models.Index(fields=['ogretmen', 'gun']),
        ]

    def __str__(self):
        return f'Gün {self.gun} {self.baslangic}-{self.bitis} ders={self.ders_id}'

    def resolved_sure_dk(self) -> int:
        if self.sure_dk:
            return self.sure_dk
        from datetime import date, datetime
        start = datetime.combine(date.today(), self.baslangic)
        end = datetime.combine(date.today(), self.bitis)
        return max(int((end - start).total_seconds() // 60), 0)


class BirebirDersOturumu(models.Model):
    program = models.ForeignKey(
        BirebirOgrenciProgrami,
        on_delete=models.CASCADE,
        related_name='oturumlar',
        null=True,
        blank=True,
    )
    source_slot = models.ForeignKey(
        BirebirHaftalikSlot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='oturumlar',
    )
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='birebir_oturumlar',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='birebir_oturumlar',
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='birebir_oturumlar',
    )
    session_date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    ogrenci = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='birebir_oturumlar',
    )
    ders = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.PROTECT,
        related_name='birebir_oturumlar',
    )
    ogretmen = models.ForeignKey(
        'personel.Personel',
        on_delete=models.PROTECT,
        related_name='birebir_oturumlar',
    )
    oda = models.ForeignKey(
        'oda.Oda',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='birebir_oturumlar',
    )
    oturum_turu = models.CharField(
        max_length=16,
        choices=OturumTuru.choices,
        default=OturumTuru.OZEL,
        db_index=True,
    )
    durum = models.CharField(
        max_length=24,
        choices=OturumDurumu.choices,
        default=OturumDurumu.PLANLANDI,
        db_index=True,
    )
    replaces_oturum = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='telafi_oturumlari',
    )
    notes = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_birebir_oturumlar',
    )

    class Meta:
        db_table = 'ozel_ders_birebir_oturum'
        verbose_name = 'Birebir Ders Oturumu'
        verbose_name_plural = 'Birebir Ders Oturumları'
        ordering = ['session_date', 'start_time', 'id']
        indexes = [
            models.Index(fields=['session_date', 'durum']),
            models.Index(fields=['ogretmen', 'session_date']),
            models.Index(fields=['ogrenci', 'session_date']),
            models.Index(fields=['kurum', 'sube', 'session_date']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['source_slot', 'session_date'],
                condition=models.Q(is_active=True, source_slot__isnull=False),
                name='unique_active_slot_session_date',
            ),
        ]

    def __str__(self):
        return f'{self.session_date} {self.start_time} {self.ders_id}'

    def duration_minutes(self) -> int:
        from datetime import date, datetime
        start = datetime.combine(date.today(), self.start_time)
        end = datetime.combine(date.today(), self.end_time)
        return max(int((end - start).total_seconds() // 60), 0)


class BirebirHakedis(models.Model):
    oturum = models.OneToOneField(
        BirebirDersOturumu,
        on_delete=models.CASCADE,
        related_name='hakedis',
    )
    ogretmen = models.ForeignKey(
        'personel.Personel',
        on_delete=models.PROTECT,
        related_name='birebir_hakedisler',
    )
    ders = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.PROTECT,
        related_name='birebir_hakedisler',
    )
    tarih = models.DateField(db_index=True)
    sure_dk = models.PositiveIntegerField(default=0)
    birim_ucret = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    tutar = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    aciklama = models.CharField(max_length=255, blank=True, default='')
    durum = models.CharField(
        max_length=20,
        choices=HakedisDurumu.choices,
        default=HakedisDurumu.TASLAK,
        db_index=True,
    )
    aylik_hakedis = models.ForeignKey(
        'personel.AylikHakedis',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='birebir_hakedisler',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ozel_ders_birebir_hakedis'
        verbose_name = 'Birebir Hakediş'
        verbose_name_plural = 'Birebir Hakedişler'
        ordering = ['-tarih', '-id']
        indexes = [
            models.Index(fields=['ogretmen', 'tarih', 'durum']),
            models.Index(fields=['durum', 'tarih']),
        ]

    def __str__(self):
        return f'{self.ogretmen_id} {self.tarih} {self.tutar}'


class UcretKurali(models.Model):
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='ozel_ders_ucret_kurallari',
        help_text='Boş = global varsayılan',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='ozel_ders_ucret_kurallari',
    )
    oturum_turu = models.CharField(max_length=16, choices=OturumTuru.choices)
    sozlesme_turu = models.CharField(
        max_length=20,
        help_text='TAM_ZAMANLI / DERS_UCRETLI / KARMA',
    )
    mesai_modu = models.CharField(max_length=24, choices=MesaiModu.choices)
    online_ucretlendir = models.BooleanField(
        default=True,
        help_text='ONLINE durumundaki oturumlar ücretlendirilsin mi',
    )
    aktif = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ozel_ders_ucret_kurali'
        verbose_name = 'Ücret Kuralı'
        verbose_name_plural = 'Ücret Kuralları'
        ordering = ['kurum_id', 'sube_id', 'oturum_turu', 'sozlesme_turu']
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'oturum_turu', 'sozlesme_turu'],
                name='unique_ucret_kurali_scope',
            ),
        ]

    def __str__(self):
        return f'{self.oturum_turu}/{self.sozlesme_turu} → {self.mesai_modu}'


class OzelDersTatilKarari(models.Model):
    """
    Resmi tatil gününde özel dersin tatil mi devam mı olacağı.
    Varsayılan (kayıt yok): tatil → oturum üretilmez.
    ozel_ders_aktif=True → takvimde tatil görünür, özel ders devam eder.
    """
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='ozel_ders_tatil_kararlari',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='ozel_ders_tatil_kararlari',
    )
    holiday_key = models.CharField(max_length=64, db_index=True)
    tarih = models.DateField(db_index=True)
    ozel_ders_aktif = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ozel_ders_tatil_karari'
        verbose_name = 'Özel Ders Tatil Kararı'
        verbose_name_plural = 'Özel Ders Tatil Kararları'
        ordering = ['tarih', 'holiday_key']
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'holiday_key', 'tarih'],
                name='unique_ozel_ders_tatil_karari',
            ),
        ]

    def __str__(self):
        return f'{self.holiday_key}@{self.tarih} aktif={self.ozel_ders_aktif}'


class PremiumPaketDersKota(models.Model):
    premium_paket = models.ForeignKey(
        'egitim_paketleri.PremiumPaket',
        on_delete=models.CASCADE,
        related_name='ders_kotalari',
    )
    ders = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.CASCADE,
        related_name='premium_ders_kotalari',
    )
    haftalik_adet = models.PositiveSmallIntegerField(default=1)
    varsayilan_sure_dk = models.PositiveIntegerField(default=60)

    class Meta:
        db_table = 'ozel_ders_premium_ders_kota'
        verbose_name = 'Premium Paket Ders Kotası'
        verbose_name_plural = 'Premium Paket Ders Kotaları'
        ordering = ['premium_paket_id', 'ders_id']
        constraints = [
            models.UniqueConstraint(
                fields=['premium_paket', 'ders'],
                name='unique_premium_paket_ders_kota',
            ),
        ]

    def __str__(self):
        return f'{self.premium_paket_id}: {self.ders_id} x{self.haftalik_adet}'
