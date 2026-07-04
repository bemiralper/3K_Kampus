"""
Rol Yönetimi Domain Models

Bu modeller, sistem yetkilerini yönetir.
Birimlerden (departman) tamamen bağımsızdır.

Birim ≠ Rol
- Birim: Organizasyonel görev alanı (nerede çalışır)
- Rol: Sistem yetkisi (ne yapabilir)
"""
from django.db import models
from django.db.models import Q
from django.contrib.auth.models import User


class ActiveRoleManager(models.Manager):
    """Silinmemiş rolleri döndürür."""

    def get_queryset(self):
        return super().get_queryset().filter(silindi_mi=False)


class Permission(models.Model):
    """
    Sistem Yetkisi
    
    Rol tabanlı erişim kontrolü için yetki tanımları.
    Modül bazlı okuma/yazma/silme/yönetme yetkileri.
    """
    # Yetki kodu - benzersiz tanımlayıcı
    code = models.CharField(
        'Yetki Kodu',
        max_length=100,
        unique=True,
        help_text='Benzersiz yetki kodu, örn: ogrenci.read'
    )
    
    # Görünen ad
    name = models.CharField(
        'Yetki Adı',
        max_length=200,
        help_text='Kullanıcı arayüzünde görünen ad'
    )
    
    # Açıklama
    description = models.TextField(
        'Açıklama',
        blank=True,
        help_text='Yetkinin ne yaptığını açıklar'
    )
    
    # Modül grubu
    module = models.CharField(
        'Modül',
        max_length=50,
        help_text='Yetkinin ait olduğu modül, örn: ogrenci, personel, finans'
    )
    
    # Yetki türü
    PERMISSION_TYPES = [
        ('read', 'Okuma'),
        ('write', 'Yazma'),
        ('delete', 'Silme'),
        ('manage', 'Yönetme'),
        ('admin', 'Tam Yetki'),
    ]
    permission_type = models.CharField(
        'Yetki Türü',
        max_length=20,
        choices=PERMISSION_TYPES,
        default='read'
    )
    
    # Durum
    is_active = models.BooleanField('Aktif', default=True)
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'system_permission'
        verbose_name = 'Yetki'
        verbose_name_plural = 'Yetkiler'
        ordering = ['module', 'permission_type', 'code']
        indexes = [
            models.Index(fields=['module']),
            models.Index(fields=['permission_type']),
            models.Index(fields=['is_active']),
        ]
    
    def __str__(self):
        return f"{self.module}.{self.permission_type} - {self.name}"


class Role(models.Model):
    """
    Sistem Rolü
    
    Kullanıcılara atanan rol tanımları.
    Her rol, bir dizi yetkiye sahiptir.
    
    ÖNEMLİ: Bu model Birim (departman) ile karıştırılmamalıdır!
    - Rol: Sistem yetkisi (ne yapabilir)
    - Birim: Organizasyonel alan (nerede çalışır)
    """
    # Rol kodu - silinmemiş kayıtlar arasında benzersiz
    code = models.CharField(
        'Rol Kodu',
        max_length=50,
        help_text='Benzersiz rol kodu, örn: super_admin, ogretmen'
    )
    
    # Görünen ad
    name = models.CharField(
        'Rol Adı',
        max_length=100,
        help_text='Kullanıcı arayüzünde görünen ad'
    )
    
    # Açıklama
    description = models.TextField(
        'Açıklama',
        blank=True,
        help_text='Rolün ne yaptığını ve hangi yetkilere sahip olduğunu açıklar'
    )
    
    # Rol yetkiler ilişkisi
    permissions = models.ManyToManyField(
        Permission,
        through='RolePermission',
        related_name='roles',
        verbose_name='Yetkiler',
        blank=True
    )
    
    # Sistem rolü mü?
    is_system_role = models.BooleanField(
        'Sistem Rolü',
        default=False,
        help_text='Sistem rolleri silinemez ve kodu değiştirilemez'
    )
    
    # Rol seviyesi (öncelik sırası için)
    level = models.IntegerField(
        'Seviye',
        default=100,
        help_text='Düşük değer = yüksek öncelik. super_admin=0, ogrenci=1000'
    )
    
    # Durum
    is_active = models.BooleanField('Aktif', default=True)

    silindi_mi = models.BooleanField('Silindi', default=False, db_index=True)
    silinme_tarihi = models.DateTimeField('Silinme Tarihi', null=True, blank=True)
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    objects = ActiveRoleManager()
    all_objects = models.Manager()
    
    class Meta:
        db_table = 'system_role'
        verbose_name = 'Rol'
        verbose_name_plural = 'Roller'
        ordering = ['level', 'name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['is_system_role']),
            models.Index(fields=['is_active']),
            models.Index(fields=['level']),
            models.Index(fields=['silindi_mi']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['code'],
                condition=Q(silindi_mi=False),
                name='unique_active_role_code',
            ),
        ]
    
    def __str__(self):
        return self.name
    
    def has_permission(self, permission_code: str) -> bool:
        """Rolün belirtilen yetkiye sahip olup olmadığını kontrol eder"""
        return self.permissions.filter(code=permission_code, is_active=True).exists()
    
    def get_all_permissions(self):
        """Rolün tüm aktif yetkilerini döndürür"""
        return self.permissions.filter(is_active=True)


class RolePermission(models.Model):
    """
    Rol-Yetki İlişki Tablosu
    
    Hangi rolün hangi yetkiye sahip olduğunu tanımlar.
    """
    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name='role_permissions',
        verbose_name='Rol'
    )
    
    permission = models.ForeignKey(
        Permission,
        on_delete=models.CASCADE,
        related_name='permission_roles',
        verbose_name='Yetki'
    )
    
    # Ek bilgiler
    granted_at = models.DateTimeField('Verilme Tarihi', auto_now_add=True)
    granted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='granted_permissions',
        verbose_name='Veren'
    )
    
    class Meta:
        db_table = 'system_role_permission'
        verbose_name = 'Rol Yetkisi'
        verbose_name_plural = 'Rol Yetkileri'
        unique_together = ['role', 'permission']
        ordering = ['role', 'permission']
    
    def __str__(self):
        return f"{self.role.code} → {self.permission.code}"


class UserRole(models.Model):
    """
    Kullanıcı-Rol İlişkisi
    
    Hangi kullanıcının hangi role sahip olduğunu tanımlar.
    Şu an için bir kullanıcı tek rol alabilir.
    İleride çoklu rol desteği eklenebilir.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='user_role',
        verbose_name='Kullanıcı'
    )
    
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name='user_roles',
        verbose_name='Rol'
    )
    
    # Kurum bazlı rol atama (multi-tenant için)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='user_roles',
        verbose_name='Kurum',
        null=True,
        blank=True,
        help_text='Boş ise global rol'
    )
    
    # İlk giriş şifre değiştirme zorunluluğu
    must_change_password = models.BooleanField(
        'Şifre Değişikliği Zorunlu',
        default=True,
        help_text='Kullanıcının ilk girişte şifre değiştirmesi gerekiyor mu?'
    )
    
    # Zaman damgaları
    assigned_at = models.DateTimeField('Atanma Tarihi', auto_now_add=True)
    assigned_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_roles',
        verbose_name='Atayan'
    )
    
    class Meta:
        db_table = 'system_user_role'
        verbose_name = 'Kullanıcı Rolü'
        verbose_name_plural = 'Kullanıcı Rolleri'
        indexes = [
            models.Index(fields=['kurum']),
        ]
    
    def __str__(self):
        return f"{self.user.username} → {self.role.name}"
