"""
Kurum bazlı Uyumsoft e-belge bağlantısı.

Her kurumun kendi web servis kullanıcısı vardır. Portal şifresi burada tutulmaz;
onay Uyumsoft portalında kalır. Web servis şifresi şifreli saklanır ve API yanıtına yazılmaz.
"""
from django.conf import settings
from django.db import models


class UyumsoftAyar(models.Model):
    kurum = models.OneToOneField(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='uyumsoft_ayar',
        verbose_name='Kurum',
    )
    web_servis_url = models.URLField(
        'Web servis adresi',
        max_length=300,
        default='https://edonusumapi.uyum.com.tr/Services/Integration',
    )
    portal_url = models.URLField(
        'Portal adresi',
        max_length=300,
        default='https://edonusum.uyum.com.tr',
        help_text='Fatura onayı bu adreste yapılır. Uygulama bu adrese bağlanmaz.',
    )
    kullanici_adi = models.CharField('Web servis kullanıcısı', max_length=120)
    sifre_encrypted = models.TextField('Web servis şifresi', blank=True, default='')
    vkn = models.CharField('VKN / TCKN', max_length=11)
    gonderici_birim = models.CharField('Gönderici birim', max_length=200)
    posta_kutusu = models.CharField('Posta kutusu', max_length=200)
    aktif = models.BooleanField('Aktif', default=True)
    son_test_at = models.DateTimeField('Son bağlantı denemesi', null=True, blank=True)
    son_test_basarili = models.BooleanField('Son deneme başarılı', null=True, blank=True)
    son_test_mesaji = models.TextField('Son deneme mesajı', blank=True, default='')
    son_test_ozet = models.JSONField('Son deneme özeti', default=dict, blank=True)
    guncelleyen = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='guncelledigi_uyumsoft_ayarlari',
        verbose_name='Güncelleyen',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'finans_uyumsoft_ayar'
        verbose_name = 'Uyumsoft ayarı'
        verbose_name_plural = 'Uyumsoft ayarları'

    def __str__(self):
        return f'{self.kurum_id} — {self.kullanici_adi}'
