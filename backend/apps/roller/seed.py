"""
Varsayılan sistem yetkileri ve rolleri.

Management command ve uygulama başlangıcında idempotent olarak çalışır.
"""
from apps.roller.models import Permission, Role, RolePermission

PERMISSIONS_DATA = [
    {'code': 'ogrenci.read', 'name': 'Öğrenci Görüntüleme', 'module': 'ogrenci', 'permission_type': 'read', 'description': 'Öğrenci listesi ve detaylarını görüntüleyebilir'},
    {'code': 'ogrenci.write', 'name': 'Öğrenci Düzenleme', 'module': 'ogrenci', 'permission_type': 'write', 'description': 'Öğrenci bilgilerini ekleyebilir ve düzenleyebilir'},
    {'code': 'ogrenci.delete', 'name': 'Öğrenci Silme', 'module': 'ogrenci', 'permission_type': 'delete', 'description': 'Öğrenci kayıtlarını silebilir'},
    {'code': 'ogrenci.manage', 'name': 'Öğrenci Yönetimi', 'module': 'ogrenci', 'permission_type': 'manage', 'description': 'Öğrenci modülünün tüm yetkilerine sahip'},
    {'code': 'personel.read', 'name': 'Personel Görüntüleme', 'module': 'personel', 'permission_type': 'read', 'description': 'Personel listesi ve detaylarını görüntüleyebilir'},
    {'code': 'personel.write', 'name': 'Personel Düzenleme', 'module': 'personel', 'permission_type': 'write', 'description': 'Personel bilgilerini ekleyebilir ve düzenleyebilir'},
    {'code': 'personel.delete', 'name': 'Personel Silme', 'module': 'personel', 'permission_type': 'delete', 'description': 'Personel kayıtlarını silebilir'},
    {'code': 'personel.manage', 'name': 'Personel Yönetimi', 'module': 'personel', 'permission_type': 'manage', 'description': 'Personel modülünün tüm yetkilerine sahip'},
    {'code': 'finans.read', 'name': 'Finans Görüntüleme', 'module': 'finans', 'permission_type': 'read', 'description': 'Finansal verileri görüntüleyebilir'},
    {'code': 'finans.write', 'name': 'Finans Düzenleme', 'module': 'finans', 'permission_type': 'write', 'description': 'Finansal verileri ekleyebilir ve düzenleyebilir'},
    {'code': 'finans.delete', 'name': 'Finans Silme', 'module': 'finans', 'permission_type': 'delete', 'description': 'Finansal kayıtları silebilir'},
    {'code': 'finans.manage', 'name': 'Finans Yönetimi', 'module': 'finans', 'permission_type': 'manage', 'description': 'Finans modülünün tüm yetkilerine sahip'},
    {'code': 'kurum.read', 'name': 'Kurum Görüntüleme', 'module': 'kurum', 'permission_type': 'read', 'description': 'Kurum bilgilerini görüntüleyebilir'},
    {'code': 'kurum.write', 'name': 'Kurum Düzenleme', 'module': 'kurum', 'permission_type': 'write', 'description': 'Kurum bilgilerini düzenleyebilir'},
    {'code': 'kurum.manage', 'name': 'Kurum Yönetimi', 'module': 'kurum', 'permission_type': 'manage', 'description': 'Kurum modülünün tüm yetkilerine sahip'},
    {'code': 'sube.read', 'name': 'Şube Görüntüleme', 'module': 'sube', 'permission_type': 'read', 'description': 'Şube bilgilerini görüntüleyebilir'},
    {'code': 'sube.write', 'name': 'Şube Düzenleme', 'module': 'sube', 'permission_type': 'write', 'description': 'Şube bilgilerini düzenleyebilir'},
    {'code': 'sube.manage', 'name': 'Şube Yönetimi', 'module': 'sube', 'permission_type': 'manage', 'description': 'Şube modülünün tüm yetkilerine sahip'},
    {'code': 'egitim_tanimlari.read', 'name': 'Eğitim Tanımları Görüntüleme', 'module': 'egitim_tanimlari', 'permission_type': 'read', 'description': 'Eğitim tanımlarını görüntüleyebilir'},
    {'code': 'egitim_tanimlari.write', 'name': 'Eğitim Tanımları Düzenleme', 'module': 'egitim_tanimlari', 'permission_type': 'write', 'description': 'Eğitim tanımlarını düzenleyebilir'},
    {'code': 'egitim_tanimlari.manage', 'name': 'Eğitim Tanımları Yönetimi', 'module': 'egitim_tanimlari', 'permission_type': 'manage', 'description': 'Eğitim tanımları modülünün tüm yetkilerine sahip'},
    {'code': 'egitim_paketleri.read', 'name': 'Eğitim Paketleri Görüntüleme', 'module': 'egitim_paketleri', 'permission_type': 'read', 'description': 'Eğitim paketlerini görüntüleyebilir'},
    {'code': 'egitim_paketleri.write', 'name': 'Eğitim Paketleri Düzenleme', 'module': 'egitim_paketleri', 'permission_type': 'write', 'description': 'Eğitim paketlerini düzenleyebilir'},
    {'code': 'egitim_paketleri.manage', 'name': 'Eğitim Paketleri Yönetimi', 'module': 'egitim_paketleri', 'permission_type': 'manage', 'description': 'Eğitim paketleri modülünün tüm yetkilerine sahip'},
    {'code': 'sinif.read', 'name': 'Sınıf Görüntüleme', 'module': 'sinif', 'permission_type': 'read', 'description': 'Sınıf listesi ve detaylarını görüntüleyebilir'},
    {'code': 'sinif.write', 'name': 'Sınıf Düzenleme', 'module': 'sinif', 'permission_type': 'write', 'description': 'Sınıf bilgilerini düzenleyebilir'},
    {'code': 'sinif.manage', 'name': 'Sınıf Yönetimi', 'module': 'sinif', 'permission_type': 'manage', 'description': 'Sınıf modülünün tüm yetkilerine sahip'},
    {'code': 'rapor.read', 'name': 'Rapor Görüntüleme', 'module': 'rapor', 'permission_type': 'read', 'description': 'Raporları görüntüleyebilir'},
    {'code': 'rapor.export', 'name': 'Rapor Dışa Aktarma', 'module': 'rapor', 'permission_type': 'write', 'description': 'Raporları dışa aktarabilir'},
    {'code': 'rapor.manage', 'name': 'Rapor Yönetimi', 'module': 'rapor', 'permission_type': 'manage', 'description': 'Rapor modülünün tüm yetkilerine sahip'},
    {'code': 'roller.read', 'name': 'Rol Görüntüleme', 'module': 'roller', 'permission_type': 'read', 'description': 'Rolleri görüntüleyebilir'},
    {'code': 'roller.write', 'name': 'Rol Düzenleme', 'module': 'roller', 'permission_type': 'write', 'description': 'Rolleri düzenleyebilir'},
    {'code': 'roller.manage', 'name': 'Rol Yönetimi', 'module': 'roller', 'permission_type': 'manage', 'description': 'Rol modülünün tüm yetkilerine sahip'},
    {'code': 'sistem.admin', 'name': 'Sistem Yöneticisi', 'module': 'sistem', 'permission_type': 'admin', 'description': 'Tüm sistem ayarlarına erişebilir'},
    {'code': 'sistem.settings', 'name': 'Ayarlar', 'module': 'sistem', 'permission_type': 'manage', 'description': 'Sistem ayarlarını düzenleyebilir'},
    {'code': 'communication.read', 'name': 'İletişim Görüntüleme', 'module': 'communication', 'permission_type': 'read', 'description': 'Konuşma ve mesajları görüntüleyebilir'},
    {'code': 'communication.write', 'name': 'İletişim Gönderme', 'module': 'communication', 'permission_type': 'write', 'description': 'Mesaj gönderebilir'},
    {'code': 'communication.manage', 'name': 'İletişim Yönetimi', 'module': 'communication', 'permission_type': 'manage', 'description': 'Tüm kurum konuşmaları ve logları yönetebilir'},
    {'code': 'communication.config', 'name': 'İletişim Yapılandırma', 'module': 'communication', 'permission_type': 'manage', 'description': 'WhatsApp / kanal yapılandırmasını düzenleyebilir'},
    {'code': 'communication.bulk', 'name': 'Toplu İletişim', 'module': 'communication', 'permission_type': 'write', 'description': 'Toplu mesaj gönderimi yapabilir'},
    {'code': 'gorev.read', 'name': 'Görev Görüntüleme', 'module': 'gorev', 'permission_type': 'read', 'description': 'Görevleri görüntüleyebilir'},
    {'code': 'gorev.write', 'name': 'Görev Düzenleme', 'module': 'gorev', 'permission_type': 'write', 'description': 'Görev oluşturabilir ve güncelleyebilir'},
    {'code': 'gorev.manage', 'name': 'Görev Yönetimi', 'module': 'gorev', 'permission_type': 'manage', 'description': 'Tüm görevleri yönetebilir, atama yapabilir'},
    {'code': 'gorev.analytics', 'name': 'Görev Analitiği', 'module': 'gorev', 'permission_type': 'read', 'description': 'Görev performans analitiğini görüntüleyebilir'},
    {'code': 'yedekleme.read', 'name': 'Yedek Görüntüleme', 'module': 'yedekleme', 'permission_type': 'read', 'description': 'Platform yedeklerini görüntüleyebilir'},
    {'code': 'yedekleme.create', 'name': 'Yedek Oluşturma', 'module': 'yedekleme', 'permission_type': 'write', 'description': 'Manuel platform yedeği oluşturabilir'},
    {'code': 'yedekleme.restore', 'name': 'Geri Yükleme', 'module': 'yedekleme', 'permission_type': 'write', 'description': 'Platform yedeğinden geri yükleme yapabilir'},
    {'code': 'yedekleme.manage', 'name': 'Yedekleme Yönetimi', 'module': 'yedekleme', 'permission_type': 'manage', 'description': 'Yedekleme zamanlaması, silme ve tüm yedek işlemleri'},
    {'code': 'demo.read', 'name': 'Demo Görüntüleme', 'module': 'demo', 'permission_type': 'read', 'description': 'Demo veri durumunu görüntüleyebilir'},
    {'code': 'demo.manage', 'name': 'Demo Yönetimi', 'module': 'demo', 'permission_type': 'manage', 'description': 'Demo veri oluşturma, temizleme ve operasyonel sıfırlama'},
]

ROLES_DATA = [
    {
        'code': 'super_admin',
        'name': 'Süper Yönetici',
        'description': 'Sistemin tüm yetkilerine sahip en üst düzey yönetici',
        'level': 0,
        'is_system_role': True,
        'permissions': ['sistem.admin'],
    },
    {
        'code': 'kurum_yoneticisi',
        'name': 'Yönetici',
        'description': 'Kurumun genel yönetiminden sorumlu',
        'level': 10,
        'is_system_role': True,
        'permissions': [
            'kurum.manage', 'sube.manage', 'personel.manage',
            'ogrenci.manage', 'finans.manage', 'egitim_tanimlari.manage',
            'egitim_paketleri.manage', 'sinif.manage', 'rapor.manage',
            'communication.manage', 'communication.config', 'communication.bulk',
            'gorev.manage', 'gorev.analytics',
            'demo.manage', 'yedekleme.read', 'yedekleme.create', 'yedekleme.manage',
        ],
    },
    {
        'code': 'sube_yoneticisi',
        'name': 'Müdür',
        'description': 'Şube / kampüs yönetiminden sorumlu',
        'level': 20,
        'is_system_role': True,
        'permissions': [
            'sube.read', 'personel.manage', 'ogrenci.manage',
            'finans.read', 'egitim_tanimlari.read', 'egitim_paketleri.read',
            'sinif.manage', 'rapor.read',
            'gorev.manage', 'gorev.analytics',
        ],
    },
    {
        'code': 'egitim_yoneticisi',
        'name': 'Eğitim Yöneticisi',
        'description': 'Eğitim süreçlerini ve tanımlarını yönetir',
        'level': 30,
        'is_system_role': True,
        'permissions': [
            'egitim_tanimlari.manage', 'egitim_paketleri.manage',
            'sinif.manage', 'ogrenci.read', 'personel.read', 'rapor.read',
        ],
    },
    {
        'code': 'ogretmen',
        'name': 'Öğretmen',
        'description': 'Ders ve sınıf süreçlerini yürütür',
        'level': 100,
        'is_system_role': True,
        'permissions': [
            'ogrenci.read', 'sinif.read', 'egitim_tanimlari.read',
            'egitim_paketleri.read', 'rapor.read',
        ],
    },
    {
        'code': 'koc',
        'name': 'Koç',
        'description': 'Öğrenci koçluğu ve takibi yapar',
        'level': 100,
        'is_system_role': True,
        'permissions': [
            'ogrenci.read', 'ogrenci.write', 'sinif.read', 'rapor.read',
            'communication.read', 'communication.write', 'communication.bulk',
            'gorev.read', 'gorev.write',
        ],
    },
    {
        'code': 'muhasebe',
        'name': 'Muhasebe',
        'description': 'Finans ve tahsilat işlemlerini yönetir',
        'level': 50,
        'is_system_role': True,
        'permissions': [
            'finans.manage', 'ogrenci.read', 'ogrenci.write',
            'personel.read', 'personel.write',
            'egitim_tanimlari.read', 'egitim_tanimlari.write',
            'egitim_paketleri.read', 'egitim_paketleri.write',
            'communication.read', 'communication.write',
            'rapor.read', 'rapor.export',
            'gorev.read', 'gorev.write',
        ],
    },
    {
        'code': 'ik',
        'name': 'İnsan Kaynakları',
        'description': 'Personel işlemlerini yönetir',
        'level': 50,
        'is_system_role': True,
        'permissions': ['personel.manage', 'rapor.read'],
    },
    {
        'code': 'bilgi_islem',
        'name': 'Bilgi İşlem',
        'description': 'Teknik destek ve sistem ayarları',
        'level': 40,
        'is_system_role': True,
        'permissions': [
            'sistem.settings', 'roller.read', 'personel.read',
            'ogrenci.read', 'rapor.read',
        ],
    },
    {
        'code': 'temizlik_personeli',
        'name': 'Temizlik Personeli',
        'description': 'Destek hizmetleri — sınırlı sistem erişimi',
        'level': 300,
        'is_system_role': True,
        'permissions': [],
    },
    {
        'code': 'destek_personeli',
        'name': 'Destek Personeli',
        'description': 'Genel idari destek hizmetleri',
        'level': 200,
        'is_system_role': True,
        'permissions': ['ogrenci.read', 'personel.read'],
    },
    {
        'code': 'ogrenci',
        'name': 'Öğrenci',
        'description': 'Öğrenci portalı — sınırlı erişim',
        'level': 1000,
        'is_system_role': True,
        'permissions': [],
    },
    {
        'code': 'okuyucu',
        'name': 'Okuyucu',
        'description': 'Salt okunur görüntüleme yetkisi',
        'level': 500,
        'is_system_role': True,
        'permissions': [
            'ogrenci.read', 'personel.read', 'sinif.read',
            'egitim_tanimlari.read', 'rapor.read',
        ],
    },
]


def ensure_permissions(*, verbose: bool = False, stdout=None):
    for perm_data in PERMISSIONS_DATA:
        perm, created = Permission.objects.update_or_create(
            code=perm_data['code'],
            defaults=perm_data,
        )
        if verbose and stdout:
            label = 'oluşturuldu' if created else 'güncellendi'
            stdout.write(f'  {"✓" if created else "-"} Yetki {label}: {perm.code}')


def ensure_system_roles(*, verbose: bool = False, stdout=None):
    for role_data in ROLES_DATA:
        data = dict(role_data)
        permission_codes = data.pop('permissions', [])

        role, created = Role.all_objects.update_or_create(
            code=data['code'],
            defaults={
                **data,
                'silindi_mi': False,
                'silinme_tarihi': None,
                'is_active': True,
            },
        )

        if verbose and stdout:
            label = 'oluşturuldu' if created else 'güncellendi'
            stdout.write(f'  {"✓" if created else "-"} Rol {label}: {role.name}')

        if permission_codes:
            if role.code == 'super_admin':
                permissions = Permission.objects.filter(is_active=True)
            else:
                permissions = Permission.objects.filter(
                    code__in=permission_codes,
                    is_active=True,
                )

            RolePermission.objects.filter(role=role).delete()
            for perm in permissions:
                RolePermission.objects.create(role=role, permission=perm)

            if verbose and stdout:
                stdout.write(f'    → {permissions.count()} yetki atandı')


def ensure_default_roles(*, verbose: bool = False, stdout=None):
    """Varsayılan yetki ve rol tanımlarını oluşturur / günceller."""
    ensure_permissions(verbose=verbose, stdout=stdout)
    ensure_system_roles(verbose=verbose, stdout=stdout)
