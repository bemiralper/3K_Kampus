"""
Egitim Paketleri Domain Models
Enterprise DDD Pattern

FİYAT MİMARİSİ (Integer-Only):
- Tüm fiyatlar KDV DAHİL (brüt) olarak girilir
- brut_fiyat: KDV dahil fiyat, 100 TL'nin katı olmak ZORUNDA
- kdv_orani: Tam sayı yüzde (0, 10, 20)
- net_fiyat: KDV hariç fiyat = round((brut / (1 + kdv_orani/100)) / 100) * 100
- kdv_tutari: KDV tutarı = brut_fiyat - net_fiyat
- Decimal KULLANILMAZ. Tüm parasal alanlar IntegerField.
"""
from django.db import models
from django.core.exceptions import ValidationError
from apps.egitim_tanimlari.models import SinifSeviyesi, Alan, Ders
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube


def hesapla_kdv(brut_fiyat, kdv_orani):
    """
    KDV dahil brüt fiyattan net fiyat ve KDV tutarını hesaplar.
    
    Formül:
        net = round((brut / (1 + kdv_orani/100)) / 100) * 100
        kdv = brut - net
    
    Örnek (brüt=55000, kdv=%10):
        net = round((55000 / 1.10) / 100) * 100 = round(500.0) * 100 = 50000
        kdv = 55000 - 50000 = 5000
    """
    from decimal import Decimal
    if brut_fiyat == 0:
        return 0, 0
    if kdv_orani == 0:
        return brut_fiyat, 0
    # Decimal uyumluluğu: DB'den gelen Decimal değerlerle float aritmetiği çakışmasın
    brut = Decimal(str(brut_fiyat))
    oran = Decimal(str(kdv_orani))
    net_fiyat = int(round(brut / (1 + oran / Decimal('100')) / Decimal('100'))) * 100
    kdv_tutari = int(brut) - net_fiyat
    return net_fiyat, kdv_tutari


class EkHizmet(models.Model):
    """
    Ek Hizmet Tanımı — Kütüphane, Koçluk, Deneme vb.
    """
    
    HIZMET_TURU_CHOICES = [
        ('kutuphane', 'Kütüphane'),
        ('kocluk', 'Koçluk'),
        ('deneme', 'Deneme'),
    ]
    
    ad = models.CharField('Hizmet Adı', max_length=200)
    kod = models.CharField('Kod', max_length=50)
    hizmet_turu = models.CharField(
        'Hizmet Türü', max_length=20, choices=HIZMET_TURU_CHOICES,
        help_text='Bu hizmetin türü — modül entegrasyonları için kullanılır'
    )
    
    kurum = models.ForeignKey(
        Kurum, on_delete=models.CASCADE, related_name='ek_hizmetler',
        verbose_name='Kurum', null=True, blank=True
    )
    sube = models.ForeignKey(
        Sube, on_delete=models.CASCADE, related_name='ek_hizmetler',
        verbose_name='Şube', null=True, blank=True
    )
    egitim_yili = models.ForeignKey(
        EgitimYili, on_delete=models.PROTECT, related_name='ek_hizmetler',
        verbose_name='Eğitim Yılı'
    )
    sinif_seviyeleri = models.ManyToManyField(
        SinifSeviyesi, related_name='ek_hizmetler',
        verbose_name='Sınıf Seviyeleri',
        help_text='Bu hizmet hangi sınıf seviyelerine uygulanır?', blank=True
    )
    deneme_paketi = models.ForeignKey(
        'Deneme', on_delete=models.SET_NULL, related_name='iliskili_ek_hizmetler',
        verbose_name='İlişkili Deneme Paketi', null=True, blank=True,
        help_text='Hizmet türü "Deneme" ise ilişkili deneme paketini seçin'
    )
    
    # Fiyat — Integer-Only
    brut_fiyat = models.IntegerField('Brüt Fiyat (KDV Dahil)', default=0,
        help_text='KDV dahil fiyat (TL). 100 TL\'nin katı olmalıdır.')
    kdv_orani = models.IntegerField('KDV Oranı (%)', default=10,
        help_text='KDV oranı yüzde olarak (0, 10, 20)')
    net_fiyat = models.IntegerField('Net Fiyat (KDV Hariç)', default=0,
        help_text='Otomatik hesaplanır.')
    kdv_tutari = models.IntegerField('KDV Tutarı', default=0,
        help_text='Otomatik hesaplanır.')

    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    @property
    def fiyat(self):
        """Geriye uyumluluk: brut_fiyat döner"""
        return self.brut_fiyat

    @property
    def kdv_dahil_fiyat(self):
        """Geriye uyumluluk: brut_fiyat zaten KDV dahil"""
        return self.brut_fiyat

    def clean(self):
        super().clean()
        if self.brut_fiyat < 0:
            raise ValidationError({'brut_fiyat': 'Fiyat negatif olamaz'})
        if self.brut_fiyat % 100 != 0:
            raise ValidationError({'brut_fiyat': 'Brüt fiyat 100 TL\'nin katı olmalıdır'})
        if self.kdv_orani not in (0, 10, 20):
            raise ValidationError({'kdv_orani': 'KDV oranı 0, 10 veya 20 olmalıdır'})

    def save(self, *args, **kwargs):
        self.net_fiyat, self.kdv_tutari = hesapla_kdv(self.brut_fiyat, self.kdv_orani)
        super().save(*args, **kwargs)
    
    class Meta:
        db_table = 'ek_hizmet'
        verbose_name = 'Ek Hizmet'
        verbose_name_plural = 'Ek Hizmetler'
        ordering = ['hizmet_turu', 'ad']
        constraints = [
            models.UniqueConstraint(fields=['kod', 'sube', 'egitim_yili'], name='unique_ek_hizmet_kod_sube_yil')
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'egitim_yili']),
            models.Index(fields=['hizmet_turu', 'aktif_mi']),
        ]
    
    def __str__(self):
        return f"{self.ad} ({self.get_hizmet_turu_display()}) [{self.egitim_yili}]"


class GrupDersi(models.Model):
    """Grup Dersi Paketi - Sınıf bazlı grup dersleri"""
    ad = models.CharField('Paket Adı', max_length=200)
    kod = models.CharField('Kod', max_length=50)
    kurum = models.ForeignKey(Kurum, on_delete=models.CASCADE, related_name='grup_dersleri', verbose_name='Kurum', null=True, blank=True)
    sube = models.ForeignKey(Sube, on_delete=models.CASCADE, related_name='grup_dersleri', verbose_name='Şube', null=True, blank=True)
    egitim_yili = models.ForeignKey(EgitimYili, on_delete=models.PROTECT, related_name='grup_dersleri', verbose_name='Eğitim Yılı')
    sinif_seviyeleri = models.ManyToManyField(SinifSeviyesi, related_name='grup_dersleri', verbose_name='Sınıf Seviyeleri', help_text='Bu pakete dahil sınıf seviyeleri', blank=True)
    alan = models.ForeignKey(Alan, on_delete=models.PROTECT, related_name='grup_dersleri', verbose_name='Alan', null=True, blank=True, help_text='Opsiyonel - belirli bir alana ait ise seçin')
    dersler = models.ManyToManyField(Ders, related_name='grup_dersi_paketleri', verbose_name='Dersler', help_text='Bu pakete dahil dersler')
    aciklama = models.TextField('Açıklama', blank=True)

    brut_fiyat = models.IntegerField('Brüt Fiyat (KDV Dahil)', default=0, help_text='KDV dahil fiyat (TL). 100 TL\'nin katı olmalıdır.')
    kdv_orani = models.IntegerField('KDV Oranı (%)', default=10, help_text='KDV oranı yüzde olarak (0, 10, 20)')
    net_fiyat = models.IntegerField('Net Fiyat (KDV Hariç)', default=0, help_text='Otomatik hesaplanır.')
    kdv_tutari = models.IntegerField('KDV Tutarı', default=0, help_text='Otomatik hesaplanır.')

    aktif_mi = models.BooleanField('Aktif', default=True)
    dahil_ek_hizmetler = models.ManyToManyField(EkHizmet, related_name='dahil_oldugu_grup_dersleri', verbose_name='Dahil Ek Hizmetler', help_text='Bu grup dersine ücretsiz dahil olan ek hizmetler', blank=True)
    dahil_denemeler = models.ManyToManyField('Deneme', related_name='dahil_oldugu_grup_dersleri', verbose_name='Dahil Deneme Paketleri', help_text='Bu grup dersine ücretsiz dahil olan deneme paketleri', blank=True)
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    @property
    def fiyat(self):
        return self.brut_fiyat

    @property
    def kdv_dahil_fiyat(self):
        return self.brut_fiyat

    def clean(self):
        super().clean()
        if self.brut_fiyat < 0:
            raise ValidationError({'brut_fiyat': 'Fiyat negatif olamaz'})
        if self.brut_fiyat % 100 != 0:
            raise ValidationError({'brut_fiyat': 'Brüt fiyat 100 TL\'nin katı olmalıdır'})
        if self.kdv_orani not in (0, 10, 20):
            raise ValidationError({'kdv_orani': 'KDV oranı 0, 10 veya 20 olmalıdır'})

    def save(self, *args, **kwargs):
        self.net_fiyat, self.kdv_tutari = hesapla_kdv(self.brut_fiyat, self.kdv_orani)
        super().save(*args, **kwargs)
    
    class Meta:
        db_table = 'grup_dersi'
        verbose_name = 'Grup Dersi'
        verbose_name_plural = 'Grup Dersleri'
        ordering = ['ad']
        constraints = [
            models.UniqueConstraint(fields=['kod', 'sube', 'egitim_yili'], name='unique_grup_dersi_kod_sube_yil')
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'egitim_yili']),
        ]
        
    def __str__(self):
        seviyeler = ", ".join([s.ad for s in self.sinif_seviyeleri.all()[:3]])
        if self.alan:
            return f"{self.ad} ({seviyeler} - {self.alan}) [{self.egitim_yili}]"
        return f"{self.ad} ({seviyeler}) [{self.egitim_yili}]"


class OzelDers(models.Model):
    """Özel Ders Paketi - Bireysel dersler"""
    ad = models.CharField('Paket Adı', max_length=200)
    kod = models.CharField('Kod', max_length=50)
    kurum = models.ForeignKey(Kurum, on_delete=models.CASCADE, related_name='ozel_dersler', verbose_name='Kurum', null=True, blank=True)
    sube = models.ForeignKey(Sube, on_delete=models.CASCADE, related_name='ozel_dersler', verbose_name='Şube', null=True, blank=True)
    egitim_yili = models.ForeignKey(EgitimYili, on_delete=models.PROTECT, related_name='ozel_dersler', verbose_name='Eğitim Yılı')
    sinif_seviyeleri = models.ManyToManyField(SinifSeviyesi, related_name='ozel_dersler', verbose_name='Sınıf Seviyeleri', help_text='Bu pakete dahil sınıf seviyeleri')
    alan = models.ForeignKey(Alan, on_delete=models.PROTECT, related_name='ozel_dersler', verbose_name='Alan', null=True, blank=True, help_text='Opsiyonel - belirli bir alana ait ise seçin')
    dersler = models.ManyToManyField(Ders, related_name='ozel_ders_paketleri', verbose_name='Dersler', help_text='Bu pakete dahil dersler')

    brut_fiyat = models.IntegerField('Brüt Fiyat (KDV Dahil)', default=0, help_text='KDV dahil fiyat (TL). 100 TL\'nin katı olmalıdır.')
    kdv_orani = models.IntegerField('KDV Oranı (%)', default=10, help_text='KDV oranı yüzde olarak (0, 10, 20)')
    net_fiyat = models.IntegerField('Net Fiyat (KDV Hariç)', default=0, help_text='Otomatik hesaplanır.')
    kdv_tutari = models.IntegerField('KDV Tutarı', default=0, help_text='Otomatik hesaplanır.')

    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    @property
    def fiyat(self):
        return self.brut_fiyat

    @property
    def kdv_dahil_fiyat(self):
        return self.brut_fiyat

    def clean(self):
        super().clean()
        if self.brut_fiyat < 0:
            raise ValidationError({'brut_fiyat': 'Fiyat negatif olamaz'})
        if self.brut_fiyat % 100 != 0:
            raise ValidationError({'brut_fiyat': 'Brüt fiyat 100 TL\'nin katı olmalıdır'})
        if self.kdv_orani not in (0, 10, 20):
            raise ValidationError({'kdv_orani': 'KDV oranı 0, 10 veya 20 olmalıdır'})

    def save(self, *args, **kwargs):
        self.net_fiyat, self.kdv_tutari = hesapla_kdv(self.brut_fiyat, self.kdv_orani)
        super().save(*args, **kwargs)
    
    class Meta:
        db_table = 'ozel_ders'
        verbose_name = 'Özel Ders'
        verbose_name_plural = 'Özel Dersler'
        ordering = ['ad']
        constraints = [
            models.UniqueConstraint(fields=['kod', 'sube', 'egitim_yili'], name='unique_ozel_ders_kod_sube_yil')
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'egitim_yili']),
        ]
        
    def __str__(self):
        seviyeler = ", ".join([str(s) for s in self.sinif_seviyeleri.all()[:2]])
        if self.sinif_seviyeleri.count() > 2:
            seviyeler += "..."
        if self.alan:
            return f"{self.ad} ({seviyeler} - {self.alan}) [{self.egitim_yili}]"
        return f"{self.ad} ({seviyeler}) [{self.egitim_yili}]"


class Deneme(models.Model):
    """Deneme Sınavı Paketi"""
    ad = models.CharField('Deneme Adı', max_length=200)
    kod = models.CharField('Kod', max_length=50)
    kurum = models.ForeignKey(Kurum, on_delete=models.CASCADE, related_name='denemeler', verbose_name='Kurum', null=True, blank=True)
    sube = models.ForeignKey(Sube, on_delete=models.CASCADE, related_name='denemeler', verbose_name='Şube', null=True, blank=True)
    egitim_yili = models.ForeignKey(EgitimYili, on_delete=models.PROTECT, related_name='denemeler', verbose_name='Eğitim Yılı')
    deneme_sayisi = models.PositiveIntegerField('Deneme Sayısı', default=1)
    sinif_seviyeleri = models.ManyToManyField(SinifSeviyesi, related_name='denemeler', verbose_name='Sınıf Seviyeleri', help_text='Bu deneme hangi sınıf seviyelerine uygulanır?')

    brut_fiyat = models.IntegerField('Brüt Fiyat (KDV Dahil)', default=0, help_text='KDV dahil fiyat (TL). 100 TL\'nin katı olmalıdır.')
    kdv_orani = models.IntegerField('KDV Oranı (%)', default=10, help_text='KDV oranı yüzde olarak (0, 10, 20)')
    net_fiyat = models.IntegerField('Net Fiyat (KDV Hariç)', default=0, help_text='Otomatik hesaplanır.')
    kdv_tutari = models.IntegerField('KDV Tutarı', default=0, help_text='Otomatik hesaplanır.')

    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)
    dahil_ek_hizmetler = models.ManyToManyField(EkHizmet, related_name='dahil_oldugu_denemeler', verbose_name='Dahil Ek Hizmetler', help_text='Bu deneme paketine ücretsiz dahil olan ek hizmetler', blank=True)
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    @property
    def fiyat(self):
        return self.brut_fiyat

    @property
    def kdv_dahil_fiyat(self):
        return self.brut_fiyat

    def clean(self):
        super().clean()
        if self.brut_fiyat < 0:
            raise ValidationError({'brut_fiyat': 'Fiyat negatif olamaz'})
        if self.brut_fiyat % 100 != 0:
            raise ValidationError({'brut_fiyat': 'Brüt fiyat 100 TL\'nin katı olmalıdır'})
        if self.kdv_orani not in (0, 10, 20):
            raise ValidationError({'kdv_orani': 'KDV oranı 0, 10 veya 20 olmalıdır'})

    def save(self, *args, **kwargs):
        self.net_fiyat, self.kdv_tutari = hesapla_kdv(self.brut_fiyat, self.kdv_orani)
        super().save(*args, **kwargs)
    
    class Meta:
        db_table = 'deneme'
        verbose_name = 'Deneme'
        verbose_name_plural = 'Denemeler'
        ordering = ['ad']
        constraints = [
            models.UniqueConstraint(fields=['kod', 'sube', 'egitim_yili'], name='unique_deneme_kod_sube_yil')
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'egitim_yili']),
        ]
        
    def __str__(self):
        return f"{self.ad} ({self.deneme_sayisi} deneme) [{self.egitim_yili}]"


class DavranisPaketi(models.Model):
    """Davranış Paketi"""
    ad = models.CharField('Paket Adı', max_length=200)
    kod = models.CharField('Kod', max_length=50)
    kurum = models.ForeignKey(Kurum, on_delete=models.CASCADE, related_name='davranis_paketleri', verbose_name='Kurum', null=True, blank=True)
    sube = models.ForeignKey(Sube, on_delete=models.CASCADE, related_name='davranis_paketleri', verbose_name='Şube', null=True, blank=True)
    egitim_yili = models.ForeignKey(EgitimYili, on_delete=models.PROTECT, related_name='davranis_paketleri', verbose_name='Eğitim Yılı')
    sinif_seviyeleri = models.ManyToManyField(SinifSeviyesi, related_name='davranis_paketleri', verbose_name='Sınıf Seviyeleri', help_text='Bu paket hangi sınıf seviyelerine uygulanır?')

    brut_fiyat = models.IntegerField('Brüt Fiyat (KDV Dahil)', default=0, help_text='KDV dahil fiyat (TL). 100 TL\'nin katı olmalıdır.')
    kdv_orani = models.IntegerField('KDV Oranı (%)', default=10, help_text='KDV oranı yüzde olarak (0, 10, 20)')
    net_fiyat = models.IntegerField('Net Fiyat (KDV Hariç)', default=0, help_text='Otomatik hesaplanır.')
    kdv_tutari = models.IntegerField('KDV Tutarı', default=0, help_text='Otomatik hesaplanır.')

    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    @property
    def fiyat(self):
        return self.brut_fiyat

    @property
    def kdv_dahil_fiyat(self):
        return self.brut_fiyat

    def clean(self):
        super().clean()
        if self.brut_fiyat < 0:
            raise ValidationError({'brut_fiyat': 'Fiyat negatif olamaz'})
        if self.brut_fiyat % 100 != 0:
            raise ValidationError({'brut_fiyat': 'Brüt fiyat 100 TL\'nin katı olmalıdır'})
        if self.kdv_orani not in (0, 10, 20):
            raise ValidationError({'kdv_orani': 'KDV oranı 0, 10 veya 20 olmalıdır'})

    def save(self, *args, **kwargs):
        self.net_fiyat, self.kdv_tutari = hesapla_kdv(self.brut_fiyat, self.kdv_orani)
        super().save(*args, **kwargs)

    class Meta:
        db_table = 'davranis_paketi'
        verbose_name = 'Davranış Paketi'
        verbose_name_plural = 'Davranış Paketleri'
        ordering = ['ad']
        constraints = [
            models.UniqueConstraint(fields=['kod', 'sube', 'egitim_yili'], name='unique_davranis_kod_sube_yil')
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'egitim_yili']),
        ]

    def __str__(self):
        return f"{self.ad} [{self.egitim_yili}]"
