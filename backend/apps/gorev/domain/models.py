import uuid

from django.db import models
from django.utils import timezone

from .enums import GorevDurum, GorevOncelik, HedefTipi, TekrarTipi


class GorevTipi(models.Model):
    """Kurum bazlı görev tipleri — renk ve ikon ile."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField(verbose_name='Kurum ID')

    kod = models.CharField(max_length=30, verbose_name='Kod')
    ad = models.CharField(max_length=100, verbose_name='Ad')
    renk = models.CharField(max_length=7, default='#3B82F6', verbose_name='Renk')
    ikon = models.CharField(max_length=10, default='📋', verbose_name='İkon')
    is_system = models.BooleanField(default=False, verbose_name='Sistem Tipi')
    is_active = models.BooleanField(default=True, verbose_name='Aktif')
    sira = models.PositiveIntegerField(default=0, verbose_name='Sıralama')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'gorev_tipi'
        ordering = ['sira', 'ad']
        verbose_name = 'Görev Tipi'
        verbose_name_plural = 'Görev Tipleri'
        constraints = [
            models.UniqueConstraint(
                fields=['kurum_id', 'kod'],
                condition=models.Q(is_deleted=False),
                name='unique_gorev_tipi_per_kurum',
            ),
        ]

    def __str__(self):
        return f"{self.ikon} {self.ad}"


class Gorev(models.Model):
    """Ana görev kaydı — takvim görünümü Event sync ile türetilir."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField(verbose_name='Kurum ID')
    sube_id = models.IntegerField(null=True, blank=True, verbose_name='Şube ID')
    egitim_yili_id = models.IntegerField(null=True, blank=True, verbose_name='Eğitim Yılı ID')
    donem_id = models.IntegerField(null=True, blank=True, verbose_name='Dönem ID')

    gorev_tipi = models.ForeignKey(
        GorevTipi,
        on_delete=models.PROTECT,
        related_name='gorevler',
        verbose_name='Görev Tipi',
    )

    baslik = models.CharField(max_length=255, verbose_name='Başlık')
    aciklama = models.TextField(blank=True, default='', verbose_name='Açıklama')
    oncelik = models.CharField(
        max_length=10,
        choices=GorevOncelik.choices,
        default=GorevOncelik.NORMAL,
        verbose_name='Öncelik',
    )

    son_tarih = models.DateTimeField(verbose_name='Son Tarih')
    tahmini_sure_dk = models.PositiveIntegerField(default=30, verbose_name='Tahmini Süre (dk)')
    tum_gun = models.BooleanField(default=False, verbose_name='Tüm Gün')

    hedef_tipi = models.CharField(
        max_length=20,
        choices=HedefTipi.choices,
        default=HedefTipi.KULLANICI,
        verbose_name='Hedef Tipi',
    )
    hedef_rol_kodu = models.CharField(max_length=50, blank=True, default='', verbose_name='Hedef Rol Kodu')
    hedef_user_ids = models.JSONField(default=list, blank=True, verbose_name='Hedef Kullanıcı ID listesi')
    hedef_grup_id = models.UUIDField(null=True, blank=True, verbose_name='Hedef Grup ID')

    kaynak_modul = models.CharField(max_length=50, blank=True, default='', verbose_name='Kaynak Modül')
    kaynak_id = models.CharField(max_length=100, blank=True, default='', verbose_name='Kaynak ID')
    aksiyon_url = models.CharField(max_length=500, blank=True, default='', verbose_name='Aksiyon URL')
    ekran_mesaji = models.BooleanField(
        default=False,
        verbose_name='Ekran Mesajı',
        help_text='Atanan kişiye girişte tam ekran bildirim göster',
    )

    olusturan_id = models.IntegerField(null=True, blank=True, verbose_name='Oluşturan')
    updated_by = models.IntegerField(null=True, blank=True, verbose_name='Güncelleyen')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'gorev'
        ordering = ['son_tarih']
        verbose_name = 'Görev'
        verbose_name_plural = 'Görevler'
        indexes = [
            models.Index(fields=['kurum_id', 'son_tarih'], name='idx_gorev_kurum_tarih'),
            models.Index(fields=['kurum_id', 'oncelik'], name='idx_gorev_kurum_oncelik'),
            models.Index(fields=['kaynak_modul', 'kaynak_id'], name='idx_gorev_kaynak'),
        ]

    def __str__(self):
        return self.baslik

    @property
    def gorev_renk(self):
        if self.oncelik == GorevOncelik.KRITIK:
            return '#DC2626'
        return self.gorev_tipi.renk if self.gorev_tipi_id else '#3B82F6'


class GorevAtama(models.Model):
    """Kişi başı görev takibi — analitik ve tamamlanma durumu burada."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    gorev = models.ForeignKey(
        Gorev,
        on_delete=models.CASCADE,
        related_name='atamalar',
        verbose_name='Görev',
    )
    atanan_user_id = models.IntegerField(verbose_name='Atanan Kullanıcı ID')

    durum = models.CharField(
        max_length=20,
        choices=GorevDurum.choices,
        default=GorevDurum.BEKLIYOR,
        verbose_name='Durum',
    )
    ilk_acilma_at = models.DateTimeField(null=True, blank=True, verbose_name='İlk Açılma')
    baslama_at = models.DateTimeField(null=True, blank=True, verbose_name='Başlama')
    tamamlanma_at = models.DateTimeField(null=True, blank=True, verbose_name='Tamamlanma')
    notlar = models.TextField(blank=True, default='', verbose_name='Notlar')
    gorusuldu = models.BooleanField(default=False, verbose_name='Görüşüldü')
    gecikme_bildirildi_at = models.DateTimeField(
        null=True, blank=True, verbose_name='Gecikme Bildirimi Gönderildi',
    )
    son_hatirlatma_at = models.DateTimeField(
        null=True, blank=True, verbose_name='Son Hatırlatma Bildirimi',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gorev_atama'
        ordering = ['created_at']
        verbose_name = 'Görev Ataması'
        verbose_name_plural = 'Görev Atamaları'
        constraints = [
            models.UniqueConstraint(
                fields=['gorev', 'atanan_user_id'],
                name='unique_gorev_atama_per_user',
            ),
        ]
        indexes = [
            models.Index(fields=['atanan_user_id', 'durum'], name='idx_gorev_atama_user_durum'),
        ]

    def __str__(self):
        return f"{self.gorev.baslik} → user:{self.atanan_user_id}"

    @property
    def gecikme_gun(self) -> int:
        if self.durum in (GorevDurum.TAMAMLANDI, GorevDurum.TAMAMLANMADI, GorevDurum.IPTAL):
            return 0
        if not self.gorev.son_tarih:
            return 0
        delta = timezone.now().date() - self.gorev.son_tarih.date()
        return max(0, delta.days)

    @property
    def gecikti_mi(self) -> bool:
        if self.durum in (GorevDurum.TAMAMLANDI, GorevDurum.TAMAMLANMADI, GorevDurum.IPTAL):
            return False
        return self.gecikme_gun > 0


class GorevTekrarSablonu(models.Model):
    """Tekrarlayan görev şablonu — cron ile Gorev üretir."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField(verbose_name='Kurum ID')
    sube_id = models.IntegerField(null=True, blank=True, verbose_name='Şube ID')

    baslik = models.CharField(max_length=255, verbose_name='Başlık')
    aciklama = models.TextField(blank=True, default='', verbose_name='Açıklama')
    gorev_tipi = models.ForeignKey(
        GorevTipi,
        on_delete=models.PROTECT,
        related_name='tekrar_sablonlari',
        verbose_name='Görev Tipi',
    )
    oncelik = models.CharField(
        max_length=10,
        choices=GorevOncelik.choices,
        default=GorevOncelik.NORMAL,
        verbose_name='Öncelik',
    )
    tahmini_sure_dk = models.PositiveIntegerField(default=30, verbose_name='Tahmini Süre (dk)')
    tum_gun = models.BooleanField(default=False, verbose_name='Tüm Gün')

    hedef_tipi = models.CharField(
        max_length=20,
        choices=HedefTipi.choices,
        default=HedefTipi.ROL,
        verbose_name='Hedef Tipi',
    )
    hedef_rol_kodu = models.CharField(max_length=50, blank=True, default='', verbose_name='Hedef Rol Kodu')
    hedef_user_ids = models.JSONField(default=list, blank=True, verbose_name='Hedef Kullanıcı ID listesi')

    tekrar_tipi = models.CharField(
        max_length=30,
        choices=TekrarTipi.choices,
        default=TekrarTipi.GUNLUK,
        verbose_name='Tekrar Tipi',
    )
    tekrar_gun = models.PositiveSmallIntegerField(
        null=True, blank=True,
        verbose_name='Tekrar Günü',
        help_text='Haftalık: 0=Pazartesi; Aylık: ayın günü (1-28)',
    )
    sonraki_uretim_tarihi = models.DateField(verbose_name='Sonraki Üretim Tarihi')
    aktif = models.BooleanField(default=True, verbose_name='Aktif')

    olusturan_id = models.IntegerField(null=True, blank=True, verbose_name='Oluşturan')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        db_table = 'gorev_tekrar_sablonu'
        ordering = ['baslik']
        verbose_name = 'Görev Tekrar Şablonu'
        verbose_name_plural = 'Görev Tekrar Şablonları'

    def __str__(self):
        return self.baslik
