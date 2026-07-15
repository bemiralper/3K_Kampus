"""Kurumsal site içerik bootstrap — anasayfa, ek sayfalar, menü, örnek metinler."""
from __future__ import annotations

from django.utils import timezone

from apps.kurum.domain.models import Kurum
from apps.website.application.health_service import ensure_website_health
from apps.website.blocks.registry import new_block
from apps.website.cms_models import (
    FormDefinition,
    NavItem,
    NavMenu,
    SiteTheme,
    WebPage,
    WebPageVersion,
)
from apps.website.models import SiteSettings, YasalMetin

# Public static assets (frontend/public/cms/)
IMG_HERO = '/cms/hero-campus.jpg'
IMG_STUDY = '/cms/study-desk.jpg'
IMG_ACCENT = '/cms/accent-abstract.jpg'


def _publish_page(
    kurum_id: int,
    *,
    slug: str,
    title: str,
    blocks: list[dict],
    is_homepage: bool = False,
    show_in_menu: bool = True,
    meta_title: str = '',
    meta_description: str = '',
    label: str = 'Bootstrap içerik',
    force: bool = False,
    is_system_default: bool = True,
) -> tuple[WebPage, bool]:
    """Sayfa yoksa oluşturur; force ise blokları yeniler. Dönüş: (page, created_or_updated)."""
    page = WebPage.objects.filter(kurum_id=kurum_id, locale='tr', slug=slug).first()
    created = False
    if not page:
        page = WebPage.objects.create(
            kurum_id=kurum_id,
            title=title[:200],
            slug=slug,
            status=WebPage.STATUS_PUBLISHED,
            is_homepage=is_homepage,
            is_system_default=is_system_default,
            show_in_menu=show_in_menu,
            meta_title=(meta_title or title)[:70],
            meta_description=(meta_description or '')[:320],
            sitemap_include=True,
            publish_at=timezone.now(),
            published_version=1,
        )
        created = True
    elif not force and page.versions.exists():
        return page, False
    else:
        page.title = title[:200]
        page.status = WebPage.STATUS_PUBLISHED
        page.is_homepage = is_homepage
        page.show_in_menu = show_in_menu
        if meta_title:
            page.meta_title = meta_title[:70]
        if meta_description:
            page.meta_description = meta_description[:320]
        page.sitemap_include = True
        page.is_system_default = is_system_default or page.is_system_default
        page.save()

    next_ver = (page.versions.count() or 0) + 1
    WebPageVersion.objects.create(
        page=page,
        version=next_ver,
        label=label,
        blocks=blocks,
        is_autosave=False,
    )
    page.published_version = next_ver
    page.save(update_fields=['published_version', 'updated_at'])
    return page, True


def build_homepage_blocks(kurum: Kurum, settings: SiteSettings | None) -> list[dict]:
    ad = kurum.gorunen_ad or kurum.ad or '3K Kampüs'
    telefon = (settings.telefon if settings else '') or getattr(kurum, 'telefon_sabit', '') or ''
    eposta = (settings.eposta if settings else '') or 'info@3kkampus.com'

    return [
        new_block('hero', {
            'kicker': 'Eğitim Merkezi',
            'title': f'{ad} ile becerini yükselt, hayatını yükselt',
            'highlightWord': 'yükselt',
            'subtitle': 'LGS · YKS · Okul Destek Programları',
            'description': (
                'Akademik takip, bireysel koçluk ve deneme analizleriyle '
                'öğrenciyi hedefe taşıyan dijital eğitim sistemi.'
            ),
            'imageUrl': IMG_HERO,
            'proof': 'Bugün yüzlerce öğrenci 3K Kampüs ile öğreniyor.',
            'checks': [
                {'label': 'Akademik takip'},
                {'label': 'Bireysel koçluk'},
                {'label': 'Deneme analizleri'},
                {'label': 'Veli bilgilendirme'},
            ],
            'button1': {'label': 'Hemen Başla', 'url': '/login'},
            'button2': {'label': '3K Sistemini Tanıyın', 'url': '/3k-sistemi'},
        }),
        new_block('iconBoxes', {
            'eyebrow': 'Öne çıkanlar',
            'title': 'Sertifikalar, analiz ve kişiselleştirilmiş öğrenme',
            'lead': 'Edly tarzı akıcı geçişlerle; 3K renkleriyle kurumsal bir deneyim.',
            'columns': 4,
            'items': [
                {
                    'icon': 'cert',
                    'title': 'Ölçülebilir ilerleme',
                    'description': 'Deneme ve konu analizleriyle net gelişim tablosu.',
                    'linkLabel': 'Keşfet',
                    'linkUrl': '/3k-sistemi',
                },
                {
                    'icon': 'target',
                    'title': 'Hedef odaklı plan',
                    'description': 'Öğrenci seviyesine göre haftalık çalışma programı.',
                    'linkLabel': 'Keşfet',
                    'linkUrl': '/sayfa/programlar',
                },
                {
                    'icon': 'user',
                    'title': 'Bireysel koçluk',
                    'description': 'Motivasyon ve ders disiplini için düzenli görüşmeler.',
                    'linkLabel': 'Keşfet',
                    'linkUrl': '/3k-sistemi',
                },
                {
                    'icon': 'bell',
                    'title': 'Veli paneli',
                    'description': 'Devamsızlık, ödev ve sonuçları anlık takip.',
                    'linkLabel': 'Keşfet',
                    'linkUrl': '/login',
                },
            ],
        }),
        new_block('cards', {
            'eyebrow': 'Popüler Programlar',
            'title': 'Size uygun mükemmel programı keşfedin',
            'lead': 'LGS, YKS ve okul destek programlarıyla uçtan uca hazırlık.',
            'footerText': 'Üst düzey öğrenme yöntemleriyle bir sonraki seviyeye geçin.',
            'footerLinkLabel': 'Ücretsiz kayıt için yazın!',
            'footerLinkUrl': '/sayfa/iletisim',
            'items': [
                {
                    'title': 'LGS Hazırlık',
                    'description': '8. sınıf müfredatı, deneme serileri ve branş destekleri.',
                    'imageUrl': IMG_STUDY,
                    'linkUrl': '/sayfa/programlar',
                },
                {
                    'title': 'YKS (TYT–AYT)',
                    'description': 'Alan seçimine göre yoğun konu tekrarı ve soru bankası.',
                    'imageUrl': IMG_ACCENT,
                    'linkUrl': '/sayfa/programlar',
                },
                {
                    'title': 'Okul Destek',
                    'description': 'Dönem içi takviye, ödev takibi ve sınav hazırlığı.',
                    'imageUrl': IMG_HERO,
                    'linkUrl': '/sayfa/programlar',
                },
            ],
        }),
        new_block('counter', {
            'eyebrow': 'Yolculuğunu başlat',
            'title': 'Hedefine giden yol burada başlar',
            'items': [
                {'label': 'Kayıtlı öğrenci', 'value': '1200+'},
                {'label': 'Tamamlanan deneme', 'value': '48'},
                {'label': 'Veli memnuniyeti', 'value': '96%'},
                {'label': 'Branş öğretmeni', 'value': '40+'},
            ],
        }),
        new_block('testimonials', {
            'eyebrow': 'Yorumlar',
            'title': 'Veliler ne diyor?',
            'items': [
                {
                    'name': 'Ayşe Y.',
                    'role': 'LGS velisi',
                    'text': 'Deneme analizleri sayesinde hangi konulara ağırlık vermemiz gerektiğini net gördük.',
                },
                {
                    'name': 'Mehmet K.',
                    'role': 'YKS öğrencisi',
                    'text': 'Koçum her hafta planımı güncelledi; motivasyonum hiç düşmedi.',
                },
                {
                    'name': 'Zeynep A.',
                    'role': 'Okul destek velisi',
                    'text': 'Ödev ve devam bilgilerini panelden takip etmek çok rahat.',
                },
            ],
        }),
        new_block('faq', {
            'eyebrow': 'SSS',
            'title': 'Sık sorulan sorular',
            'items': [
                {
                    'question': 'Kayıt için ne yapmalıyım?',
                    'answer': 'İletişim sayfasından form doldurun veya bizi arayın; ücretsiz seviye tespiti planlarız.',
                },
                {
                    'question': 'Denemeler nasıl takip ediliyor?',
                    'answer': 'Her deneme sonrası öğrenci ve veli paneline konu bazlı analiz düşer.',
                },
                {
                    'question': 'Özel ders / grup ders farkı nedir?',
                    'answer': 'Grup dersleri sınıf temposunda ilerler; özel ders bireysel hedefe göre planlanır.',
                },
            ],
        }),
        new_block('cta', {
            'title': 'Hedefine birlikte yürüyelim',
            'description': (
                f'Tanışma görüşmesi için arayın'
                + (f': {telefon}' if telefon else '')
                + (f' · {eposta}' if eposta else '')
            ),
            'buttonLabel': 'İletişime geç',
            'buttonUrl': '/sayfa/iletisim',
        }),
        new_block('map', {
            'title': 'Bizi ziyaret edin',
            'embedUrl': (settings.harita_embed_url if settings else '') or '',
        }) if settings and settings.harita_embed_url else new_block('spacer', {'height': 8}),
    ]


def build_hakkimizda_blocks(kurum: Kurum) -> list[dict]:
    ad = kurum.gorunen_ad or kurum.ad or '3K Kampüs'
    return [
        new_block('hero', {
            'kicker': 'Kurumsal',
            'title': 'Hakkımızda',
            'subtitle': ad,
            'description': 'Ölçülebilir akademik başarı ve şeffaf veli iletişimiyle büyüyen bir eğitim ailesi.',
            'imageUrl': IMG_ACCENT,
            'button1': {'label': 'Programlar', 'url': '/sayfa/programlar'},
            'button2': {'label': '3K Sistemi', 'url': '/3k-sistemi'},
        }),
        new_block('richText', {
            'html': (
                f'<h2>Biz kimiz?</h2>'
                f'<p>{ad}, LGS ve YKS hazırlık süreçlerinde öğrenciyi yalnızca derse değil; '
                f'planlamaya, ölçmeye ve motive olmaya da odaklar. Dijital takip sistemi sayesinde '
                f'öğretmen, öğrenci ve veli aynı tabloyu görür.</p>'
                f'<h3>Değerlerimiz</h3>'
                f'<ul><li>Şeffaflık — her ilerleme görünür</li>'
                f'<li>Disiplin — düzenli çalışma alışkanlığı</li>'
                f'<li>Empati — öğrenci temposuna saygı</li></ul>'
            ),
        }),
        new_block('cta', {
            'title': 'Kampüsümüzü yakından tanıyın',
            'description': 'Ücretsiz tanışma görüşmesi planlayalım.',
            'buttonLabel': 'Randevu al',
            'buttonUrl': '/sayfa/iletisim',
        }),
    ]


def build_sistem_blocks() -> list[dict]:
    """CMS yedek sayfa — asıl deneyim /3k-sistemi rotasındadır."""
    return [
        new_block('hero', {
            'kicker': '3K Kampüs',
            'title': 'Tek sistem. Uçtan uca takip.',
            'subtitle': 'Eğitim · Ölçme · Koçluk',
            'description': (
                'Kurumsal eğitim operasyonunu tek panelde yöneten dijital altyapı. '
                'Detaylı tanıtım için 3K Sistemi sayfasını ziyaret edin.'
            ),
            'imageUrl': IMG_HERO,
            'button1': {'label': '3K Sistemi sayfası', 'url': '/3k-sistemi'},
            'button2': {'label': 'Demo iste', 'url': '/sayfa/iletisim'},
        }),
        new_block('iconBoxes', {
            'eyebrow': 'Modüller',
            'title': 'Neler sunuyoruz?',
            'lead': 'Akademik planlamadan veli iletişimine kadar tek çatı.',
            'columns': 3,
            'items': [
                {'icon': 'book', 'title': 'Akademik planlama', 'description': 'Ders saatleri, öğretmen uygunluğu ve sınıf yerleşimi.'},
                {'icon': 'chart', 'title': 'Ölçme & değerlendirme', 'description': 'Deneme sonuçları, konu analizleri, gelişim grafikleri.'},
                {'icon': 'chat', 'title': 'İletişim', 'description': 'Veli bilgilendirme, WhatsApp/SMS hatırlatmaları.'},
            ],
        }),
        new_block('cta', {
            'title': 'Sistemi yakından görün',
            'description': 'Tam özellik listesi ve bölümler 3K Sistemi sayfasında.',
            'buttonLabel': '3K Sistemine git',
            'buttonUrl': '/3k-sistemi',
        }),
    ]


def build_duyurular_blocks() -> list[dict]:
    return [
        new_block('heading', {'text': 'Duyurular', 'level': 1, 'align': 'center'}),
        new_block('richText', {
            'html': (
                '<p style="text-align:center;color:#475569">'
                'Kurum duyuru ve haberleri. Asıl liste '
                '<a href="/duyurular">/duyurular</a> sayfasında gösterilir.'
                '</p>'
            ),
        }),
        new_block('duyurularList', {'limit': 24, 'kind': 'duyuru'}),
    ]


def build_programlar_blocks() -> list[dict]:
    return [
        new_block('hero', {
            'kicker': 'Programlar',
            'title': 'Hedefine uygun yol',
            'subtitle': 'LGS · YKS · Okul Destek',
            'description': 'Seviyene ve hedefine uygun programı birlikte seçelim.',
            'imageUrl': IMG_STUDY,
            'button1': {'label': 'Başvur', 'url': '/sayfa/iletisim'},
            'button2': {'label': 'Hakkımızda', 'url': '/hakkimizda'},
        }),
        new_block('cards', {
            'eyebrow': 'Seçenekler',
            'title': 'Eğitim programlarımız',
            'items': [
                {
                    'title': 'LGS Hazırlık',
                    'description': 'Branş dersleri, haftalık deneme ve veli raporları.',
                    'imageUrl': IMG_STUDY,
                },
                {
                    'title': 'YKS Hazırlık',
                    'description': 'TYT–AYT odaklı konu tarama ve soru maratonları.',
                    'imageUrl': IMG_ACCENT,
                },
                {
                    'title': 'Okul Destek',
                    'description': 'Dönem içi takviye, ödev takibi, ara sınav hazırlığı.',
                    'imageUrl': IMG_HERO,
                },
            ],
        }),
        new_block('cta', {
            'title': 'Hangi program size uygun?',
            'description': 'Ücretsiz seviye tespiti ile birlikte karar verelim.',
            'buttonLabel': 'İletişime geç',
            'buttonUrl': '/sayfa/iletisim',
        }),
    ]


def build_iletisim_blocks(kurum: Kurum, settings: SiteSettings | None, form_slug: str) -> list[dict]:
    telefon = (settings.telefon if settings else '') or getattr(kurum, 'telefon_sabit', '') or ''
    eposta = (settings.eposta if settings else '') or 'info@3kkampus.com'
    adres = (settings.adres if settings else '') or getattr(kurum, 'adres', '') or ''
    return [
        new_block('heading', {'text': 'İletişim', 'level': 1, 'align': 'center'}),
        new_block('richText', {
            'html': (
                f'<p style="text-align:center;color:#475569">Bize yazın veya arayın — '
                f'en kısa sürede dönüş yapalım.</p>'
                f'<p style="text-align:center"><strong>Telefon:</strong> {telefon or "—"}<br/>'
                f'<strong>E-posta:</strong> {eposta}<br/>'
                f'<strong>Adres:</strong> {adres or "—"}</p>'
            ),
        }),
        new_block('form', {
            'formSlug': form_slug,
            'title': 'Başvuru / Mesaj formu',
        }),
        new_block('map', {
            'embedUrl': (settings.harita_embed_url if settings else '') or '',
        }) if settings and settings.harita_embed_url else new_block('spacer', {'height': 8}),
    ]


def _ensure_contact_form(kurum_id: int) -> str:
    form, _ = FormDefinition.objects.get_or_create(
        kurum_id=kurum_id,
        slug='iletisim',
        defaults={
            'name': 'İletişim Formu',
            'description': 'Web sitesi başvuru / mesaj formu',
            'aktif': True,
            'fields': [
                {'name': 'ad_soyad', 'label': 'Ad Soyad', 'type': 'text', 'required': True},
                {'name': 'telefon', 'label': 'Telefon', 'type': 'tel', 'required': True},
                {'name': 'eposta', 'label': 'E-posta', 'type': 'email', 'required': False},
                {'name': 'mesaj', 'label': 'Mesajınız', 'type': 'textarea', 'required': True},
            ],
            'settings': {'successMessage': 'Mesajınız alındı. En kısa sürede dönüş yapacağız.'},
        },
    )
    return form.slug


def _ensure_menus(kurum_id: int) -> None:
    header, _ = NavMenu.objects.get_or_create(
        kurum_id=kurum_id,
        location=NavMenu.LOCATION_HEADER,
        name='Ana Menü',
        defaults={'aktif': True},
    )
    header_items = [
        ('Anasayfa', '/'),
        ('Programlar', '/sayfa/programlar'),
        ('Hakkımızda', '/hakkimizda'),
        ('3K Sistemi', '/3k-sistemi'),
        ('Duyurular', '/duyurular'),
        ('İletişim', '/sayfa/iletisim'),
    ]
    # Eski CMS slug linklerini düzelt
    for item in header.items.all():
        if item.url in ('/sayfa/hakkimizda', '/sayfa/3k-sistemi'):
            item.url = '/hakkimizda' if 'hakkimizda' in item.url else '/3k-sistemi'
            item.save(update_fields=['url'])
        if item.label == 'Hakkımızda' and item.url != '/hakkimizda':
            item.url = '/hakkimizda'
            item.save(update_fields=['url'])
        if item.label == '3K Sistemi' and item.url != '/3k-sistemi':
            item.url = '/3k-sistemi'
            item.save(update_fields=['url'])
    if not header.items.exists():
        for i, (label, url) in enumerate(header_items):
            NavItem.objects.create(menu=header, label=label, url=url, sira=i, aktif=True)
    else:
        existing_urls = set(header.items.values_list('url', flat=True))
        sira = header.items.count()
        for label, url in header_items:
            if url not in existing_urls and not header.items.filter(label=label).exists():
                NavItem.objects.create(menu=header, label=label, url=url, sira=sira, aktif=True)
                sira += 1

    footer, _ = NavMenu.objects.get_or_create(
        kurum_id=kurum_id,
        location=NavMenu.LOCATION_FOOTER,
        name='Footer',
        defaults={'aktif': True},
    )
    footer_items = [
        ('Hakkımızda', '/hakkimizda'),
        ('Programlar', '/sayfa/programlar'),
        ('3K Sistemi', '/3k-sistemi'),
        ('KVKK', '/yasal/kvkk'),
        ('Gizlilik', '/yasal/gizlilik'),
        ('Çerez Politikası', '/yasal/cerez'),
        ('Kullanım Koşulları', '/yasal/kullanim'),
        ('İletişim', '/sayfa/iletisim'),
    ]
    for item in footer.items.all():
        if item.url == '/sayfa/hakkimizda':
            item.url = '/hakkimizda'
            item.save(update_fields=['url'])
        if item.url == '/sayfa/3k-sistemi':
            item.url = '/3k-sistemi'
            item.save(update_fields=['url'])
    if not footer.items.exists():
        for i, (label, url) in enumerate(footer_items):
            NavItem.objects.create(menu=footer, label=label, url=url, sira=i, aktif=True)


def _ensure_legal_pages(kurum_id: int, force: bool) -> int:
    count = 0
    defaults = {
        'kvkk': (
            'KVKK Aydınlatma Metni',
            '<h2>Kişisel Verilerin Korunması</h2>'
            '<p>Bu metin örnek bir KVKK aydınlatma metnidir. Kurumunuza özel metni buraya yapıştırın '
            'veya hukuki danışmanınızdan aldığınız metinle değiştirin.</p>'
            '<p><strong>Veri sorumlusu:</strong> Kurum unvanı · <strong>İletişim:</strong> info@3kkampus.com</p>'
            '<ul><li>İşlenen veriler: kimlik, iletişim, eğitim bilgileri</li>'
            '<li>Amaç: eğitim hizmeti sunumu ve veli bilgilendirme</li>'
            '<li>Haklarınız: erişim, düzeltme, silme, itiraz</li></ul>',
        ),
        'gizlilik': (
            'Gizlilik Politikası',
            '<h2>Gizlilik Politikası</h2>'
            '<p>Web sitemizi ziyaret ettiğinizde toplanan bilgiler, hizmet kalitesini artırmak '
            've yasal yükümlülükleri yerine getirmek amacıyla kullanılır. Bu metni kurum politikalarınızla güncelleyin.</p>',
        ),
        'kullanim': (
            'Kullanım Koşulları',
            '<h2>Kullanım Koşulları</h2>'
            '<p>Siteye erişerek bu koşulları kabul etmiş sayılırsınız. İçeriklerin izinsiz kopyalanması yasaktır. '
            'Örnek metindir — kendi koşullarınızla değiştirin.</p>',
        ),
        'cerez': (
            'Çerez Politikası',
            '<h2>Çerez Politikası</h2>'
            '<p>Sitemiz, deneyimi iyileştirmek için zorunlu ve analitik çerezler kullanabilir. '
            'GA4 / reklam çerezlerini Entegrasyonlar üzerinden yönetebilirsiniz. Bu metni güncelleyin.</p>',
        ),
    }
    for slug, (title, html) in defaults.items():
        yasal = YasalMetin.objects.filter(kurum_id=kurum_id, tur=slug).first()
        body = (yasal.icerik if yasal and yasal.icerik else html)
        title_use = (yasal.baslik if yasal and yasal.baslik else title)
        _, changed = _publish_page(
            kurum_id,
            slug=slug,
            title=title_use,
            blocks=[new_block('richText', {'html': body})],
            is_homepage=False,
            show_in_menu=False,
            meta_title=title_use,
            meta_description=f'{title_use} — yasal bilgilendirme sayfası.',
            label='Yasal sayfa bootstrap',
            force=force or not WebPage.objects.filter(kurum_id=kurum_id, slug=slug).exists(),
        )
        if changed:
            count += 1
    return count


def bootstrap_website_content(kurum_id: int, *, force_home: bool = True) -> dict:
    """
    Anasayfa yerleşimi, ek sayfalar, menü, form, yasal sayfalar ve sağlık alanları.
    force_home=True: anasayfa bloklarını yeniden yazar (kullanıcı isteği).
    """
    kurum = Kurum.objects.filter(pk=kurum_id).first()
    if not kurum:
        return {'ok': False, 'error': 'Kurum bulunamadı'}

    settings = SiteSettings.objects.filter(kurum_id=kurum_id).first()
    form_slug = _ensure_contact_form(kurum_id)
    _ensure_menus(kurum_id)

    home, home_changed = _publish_page(
        kurum_id,
        slug='home',
        title='Anasayfa',
        blocks=build_homepage_blocks(kurum, settings),
        is_homepage=True,
        show_in_menu=True,
        meta_title=f'{(kurum.gorunen_ad or kurum.ad)} — LGS & YKS Eğitim Merkezi',
        meta_description=(
            (settings.seo_aciklama if settings and settings.seo_aciklama else None)
            or 'LGS, YKS ve okul destek programları. Akademik takip, koçluk ve deneme analizleri.'
        ),
        label='Anasayfa yerleşim v2',
        force=force_home,
    )
    # Tek homepage
    WebPage.objects.filter(kurum_id=kurum_id, is_homepage=True).exclude(pk=home.pk).update(is_homepage=False)

    pages_changed = []
    for slug, title, builder, meta_desc in [
        ('hakkimizda', 'Hakkımızda', lambda: build_hakkimizda_blocks(kurum), 'Kurum hakkında bilgi.'),
        ('3k-sistemi', '3K Sistemi', build_sistem_blocks, '3K dijital eğitim sistemi.'),
        ('programlar', 'Programlar', build_programlar_blocks, 'LGS, YKS ve okul destek programları.'),
        (
            'duyurular',
            'Duyurular',
            build_duyurular_blocks,
            'Güncel duyuru ve haberler.',
        ),
        (
            'iletisim',
            'İletişim',
            lambda: build_iletisim_blocks(kurum, settings, form_slug),
            'İletişim bilgileri ve başvuru formu.',
        ),
    ]:
        force = not WebPage.objects.filter(kurum_id=kurum_id, slug=slug).exists()
        _, changed = _publish_page(
            kurum_id,
            slug=slug,
            title=title,
            blocks=builder(),
            show_in_menu=True,
            meta_title=title,
            meta_description=meta_desc,
            label=f'{title} bootstrap',
            force=force or force_home and slug in ('hakkimizda', 'programlar', 'iletisim', '3k-sistemi'),
        )
        if changed:
            pages_changed.append(slug)

    legal_n = _ensure_legal_pages(kurum_id, force=False)

    # Tema: kurum logosunu çek + örnek footer
    theme, _ = SiteTheme.objects.get_or_create(kurum_id=kurum_id)
    footer = dict(theme.footer_config or {})
    footer.setdefault('copyright', f'© {timezone.now().year} {kurum.gorunen_ad or kurum.ad}')
    footer.setdefault('title', kurum.gorunen_ad or kurum.ad)
    footer.setdefault(
        'description',
        'LGS, YKS ve okul destek programları ile başarıya giden yolda dijital eğitim partneriniz.',
    )
    if settings:
        footer.setdefault('telefon', settings.telefon or '')
        footer.setdefault('whatsapp', settings.whatsapp or '')
        footer.setdefault('eposta', settings.eposta or '')
        footer.setdefault('adres', settings.adres or '')
    theme.footer_config = footer
    if not (theme.custom_css or '').strip() or 'cms-public-page{font-family' in (theme.custom_css or ''):
        theme.custom_css = ''
    theme.save()

    health = ensure_website_health(kurum_id)

    return {
        'ok': True,
        'homepage_id': home.id,
        'homepage_updated': home_changed,
        'pages_updated': pages_changed,
        'legal_pages': legal_n,
        'form_slug': form_slug,
        'health': health,
    }
