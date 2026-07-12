"""Website CMS — yedekleme kaynak tanımları (legacy + v2)."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='website.content',
        name='Kurumsal Site İçeriği (Legacy)',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Site ayarları, slider, duyuru ve diğer section CMS kayıtları.',
        config={
            'models': [
                'website.SiteSettings',
                'website.SiteSocialLink',
                'website.SiteFooterLink',
                'website.HeroSlide',
                'website.Duyuru',
                'website.SinavTakvim',
                'website.NedenKart',
                'website.BasariIstatistik',
                'website.OgrenciYorumu',
                'website.SSS',
                'website.YasalMetin',
                'website.IletisimMesaji',
            ],
        },
        is_default=False,
        priority=110,
    ),
    ResourceSpec(
        code='website.cms_v2',
        name='Kurumsal Site CMS v2 (Page Builder)',
        resource_type=ResourceType.DATABASE_TABLE,
        description=(
            'Sayfalar, versiyonlar, medya, menü, tema, yönlendirme, '
            'içerik, formlar ve entegrasyon ayarları.'
        ),
        config={
            'models': [
                'website.WebPage',
                'website.WebPageVersion',
                'website.MediaFolder',
                'website.MediaAsset',
                'website.MediaVariant',
                'website.NavMenu',
                'website.NavItem',
                'website.SiteTheme',
                'website.RedirectRule',
                'website.SlugHistory',
                'website.ContentCategory',
                'website.ContentEntry',
                'website.FormDefinition',
                'website.FormSubmission',
                'website.IntegrationSettings',
                'website.NotFoundHit',
            ],
        },
        is_default=True,
        priority=111,
    ),
    ResourceSpec(
        code='website.media_files',
        name='Kurumsal Site Medya Dosyaları',
        resource_type=ResourceType.MEDIA,
        description='website/ altındaki yüklenen görseller ve medya türevleri.',
        handler_key='file_directory',
        config={'relative_to': 'media', 'path': 'website'},
        is_default=False,
        compress=True,
        priority=112,
    ),
]
