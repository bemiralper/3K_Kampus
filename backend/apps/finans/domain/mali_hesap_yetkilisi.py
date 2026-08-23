"""
Mali Hesap Yetkilisi Domain Model
Kurumdaki tüm mali hesaplardan sorumlu/bilgilendirilecek kişilerin kaydı.

Not: Bu kayıt SADECE bilgilendirme amaçlıdır — herhangi bir yetki/erişim
kontrolüne bağlı DEĞİLDİR. Sistemdeki tüm kullanıcılar mevcut izinlerine
göre işlem yapmaya devam eder; burası yalnızca "mali hesaplardan kim sorumlu"
sorusuna cevap vermek için bir kişi rehberidir.
"""
from django.db import models


class MaliHesapYetkilisi(models.Model):
    """Kurumdaki tüm mali hesaplardan sorumlu, bilgilendirme amaçlı kişi."""

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='mali_hesap_yetkilileri',
        verbose_name='Kurum',
        null=True,
        blank=True,
    )
    mali_hesap = models.ForeignKey(
        'finans.MaliHesap',
        on_delete=models.CASCADE,
        related_name='yetkililer',
        verbose_name='Mali Hesap',
        null=True,
        blank=True,
        help_text='Boşsa yetkili tüm mali hesaplardan sorumludur.',
    )
    personel = models.ForeignKey(
        'personel.Personel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mali_hesap_yetkilikleri',
        verbose_name='Personel',
        help_text='Sistemdeki bir personel ile ilişkilendirmek isterseniz seçin (opsiyonel)',
    )
    ad_soyad = models.CharField(
        'Ad Soyad',
        max_length=200,
        blank=True,
        default='',
        help_text='Personel seçilmediyse serbest metin olarak isim girilebilir',
    )
    rol = models.CharField(
        'Rol / Görev',
        max_length=100,
        blank=True,
        default='',
        help_text='Örn: Şube Müdürü, Muhasebe Sorumlusu',
    )
    telefon = models.CharField('Telefon', max_length=20, blank=True, default='')
    email = models.EmailField('E-posta', blank=True, default='')
    notlar = models.TextField('Notlar', blank=True, default='')
    siralama = models.PositiveIntegerField('Sıralama', default=0)

    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'finans_mali_hesap_yetkilisi'
        verbose_name = 'Mali Hesap Yetkilisi'
        verbose_name_plural = 'Mali Hesap Yetkilileri'
        ordering = ['siralama', 'ad_soyad']
        indexes = [
            models.Index(fields=['kurum'], name='finans_mh_yetkili_kurum_idx'),
        ]

    def __str__(self):
        return self.gorunen_ad

    @property
    def gorunen_ad(self):
        if self.ad_soyad:
            return self.ad_soyad
        if self.personel_id:
            return f'{self.personel.ad} {self.personel.soyad}'.strip()
        return 'İsimsiz Yetkili'
