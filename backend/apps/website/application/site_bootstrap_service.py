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
from apps.website.yasal_defaults import cms_preview_html, ensure_yasal_metinler, load_yasal_metin_defaults

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
        }) if (
            settings
            and getattr(settings, 'harita_goster', True)
            and settings.harita_embed_url
        ) else new_block('spacer', {'height': 8}),
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
                '3K Kampüs duyuru ve haberleri: sınav takvimleri, kayıt dönemleri, '
                'etkinlikler ve kampüs gelişmeleri. Güncel içerikler aşağıda listelenir; '
                'tüm arşive <a href="/duyurular">duyurular sayfasından</a> da ulaşabilirsiniz.'
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
    from apps.website.company_defaults import DEFAULT_COMPANY_INFO

    telefon = (
        (settings.telefon if settings else '')
        or getattr(kurum, 'telefon_sabit', '')
        or DEFAULT_COMPANY_INFO['telefon']
    )
    eposta = (settings.eposta if settings else '') or 'info@3kkampus.com'
    adres = (
        (settings.adres if settings else '')
        or getattr(kurum, 'adres', '')
        or DEFAULT_COMPANY_INFO['adres']
    )
    ticari = (settings.ticari_unvan if settings else '') or DEFAULT_COMPANY_INFO['ticari_unvan']
    mersis = (settings.mersis_no if settings else '') or DEFAULT_COMPANY_INFO['mersis_no']
    vergi = (settings.vergi_no if settings else '') or DEFAULT_COMPANY_INFO['vergi_no']
    sicil = (settings.ticaret_sicil_no if settings else '') or DEFAULT_COMPANY_INFO['ticaret_sicil_no']
    return [
        new_block('heading', {'text': 'İletişim', 'level': 1, 'align': 'center'}),
        new_block('richText', {
            'html': (
                f'<p style="text-align:center;color:#475569">Bize yazın veya arayın — '
                f'en kısa sürede dönüş yapalım.</p>'
                f'<p style="text-align:center"><strong>Telefon:</strong> {telefon}<br/>'
                f'<strong>E-posta:</strong> {eposta}<br/>'
                f'<strong>Adres:</strong> {adres}</p>'
                f'<h3 style="margin-top:1.5rem">Şirket Bilgileri</h3>'
                f'<ul>'
                f'<li><strong>Ticari unvan:</strong> {ticari}</li>'
                f'<li><strong>MERSİS No:</strong> {mersis}</li>'
                f'<li><strong>Vergi No:</strong> {vergi}</li>'
                f'<li><strong>Ticaret Sicil No:</strong> {sicil}</li>'
                f'<li><strong>Açık adres:</strong> {adres}</li>'
                f'<li><strong>Telefon:</strong> {telefon}</li>'
                f'</ul>'
            ),
        }),
        new_block('form', {
            'formSlug': form_slug,
            'title': 'Başvuru / Mesaj formu',
        }),
        new_block('map', {
            'embedUrl': (settings.harita_embed_url if settings else '') or '',
        }) if (
            settings
            and getattr(settings, 'harita_goster', True)
            and settings.harita_embed_url
        ) else new_block('spacer', {'height': 8}),
    ]


def build_veri_silme_blocks(kurum: Kurum, settings: SiteSettings | None, form_slug: str) -> list[dict]:
    ad = kurum.gorunen_ad or kurum.ad or '3K Kampüs'
    eposta = (settings.eposta if settings else '') or 'info@3kkampus.com'
    telefon = (settings.telefon if settings else '') or getattr(kurum, 'telefon_sabit', '') or ''
    return [
        new_block('hero', {
            'kicker': 'Yasal',
            'title': 'Veri Silme Talebi',
            'subtitle': 'Kişisel Verilerinizin Silinmesini Talep Edin',
            'description': (
                '6698 sayılı KVKK kapsamında işlenen kişisel verilerinizin silinmesi, '
                'yok edilmesi veya anonim hâle getirilmesi için başvuru süreciniz.'
            ),
            'imageUrl': IMG_ACCENT,
            'button1': {'label': 'KVKK Aydınlatma Metni', 'url': '/yasal/kvkk'},
            'button2': {'label': 'Gizlilik Politikası', 'url': '/yasal/gizlilik'},
        }),
        new_block('richText', {
            'html': (
                '<h2>Veri Silme Talebinde Bulunma Hakkınız</h2>'
                f'<p>6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, {ad} '
                'tarafından işlenen kişisel verilerinizin silinmesini, yok edilmesini veya anonim '
                'hâle getirilmesini her zaman talep edebilirsiniz.</p>'
                '<h3>Talebinizi Nasıl İletebilirsiniz?</h3>'
                '<ul>'
                '<li>Bu sayfanın altındaki başvuru formunu doldurarak,</li>'
                f'<li><strong>E-posta:</strong> <a href="mailto:{eposta}">{eposta}</a> adresine '
                '"Veri Silme Talebi" konu başlığıyla yazarak,</li>'
                + (f'<li><strong>Telefon:</strong> {telefon}</li>' if telefon else '')
                + '</ul>'
                '<p>Başvurunuzda kimliğinizi doğrulayabilmemiz için ad-soyad, T.C. kimlik numarası '
                '(veya öğrenci/veli kaydınıza ait bilgi) ve size dönüş yapabileceğimiz bir iletişim '
                'bilgisi paylaşmanızı rica ederiz.</p>'
                '<h3>Hangi Veriler Silinir?</h3>'
                '<p>Talebiniz üzerine; iletişim bilgileriniz (telefon, e-posta, WhatsApp mesaj '
                'geçmişi), platform kullanım kayıtlarınız ve sistemde tuttuğumuz diğer kişisel '
                'verileriniz silinir veya anonim hâle getirilir.</p>'
                '<h3>Saklanması Gereken Veriler</h3>'
                '<p>Türk Ticaret Kanunu, Vergi Usul Kanunu ve ilgili mevzuat gereği; fatura, '
                'tahsilat ve muhasebe kayıtları gibi belgeler yasal saklama süreleri boyunca '
                '(genellikle 10 yıl) saklanmak zorundadır. Bu nitelikteki veriler, yasal süre '
                'dolmadan silinemez; bu veriler için talebiniz "işlemenin durdurulması / erişimin '
                'kısıtlanması" şeklinde uygulanır.</p>'
                '<h3>Talebiniz Ne Kadar Sürede Sonuçlanır?</h3>'
                '<p>Başvurunuz, KVKK\'nın 13. maddesi uyarınca en kısa sürede ve en geç '
                '<strong>30 gün</strong> içinde ücretsiz olarak sonuçlandırılır. İşlemin ayrıca bir '
                'maliyet gerektirmesi hâlinde, Kişisel Verileri Koruma Kurulu tarafından belirlenen '
                'tarifedeki ücret talep edilebilir.</p>'
                '<p>Detaylı bilgi için <a href="/yasal/kvkk">KVKK Aydınlatma Metni</a>\'ni '
                'inceleyebilirsiniz.</p>'
            ),
        }),
        new_block('form', {
            'formSlug': form_slug,
            'title': 'Veri Silme Başvuru Formu',
        }),
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
        ('Veri Silme Talebi', '/veri-silme'),
        ('İletişim', '/sayfa/iletisim'),
    ]
    for item in footer.items.all():
        if item.url == '/sayfa/hakkimizda':
            item.url = '/hakkimizda'
            item.save(update_fields=['url'])
        if item.url == '/sayfa/3k-sistemi':
            item.url = '/3k-sistemi'
            item.save(update_fields=['url'])
        if item.url == '/sayfa/veri-silme':
            item.url = '/veri-silme'
            item.save(update_fields=['url'])
    if not footer.items.exists():
        for i, (label, url) in enumerate(footer_items):
            NavItem.objects.create(menu=footer, label=label, url=url, sira=i, aktif=True)
    else:
        existing_urls = set(footer.items.values_list('url', flat=True))
        sira = footer.items.count()
        for label, url in footer_items:
            if url not in existing_urls and not footer.items.filter(label=label).exists():
                NavItem.objects.create(menu=footer, label=label, url=url, sira=sira, aktif=True)
                sira += 1
                existing_urls.add(url)


def _ensure_legal_pages(kurum_id: int, force: bool) -> dict:
    from apps.website.application.system_default_specs import SPECS_BY_SLUG

    kurum = Kurum.objects.filter(pk=kurum_id).first()
    yasal_stats = ensure_yasal_metinler(kurum, upgrade_placeholders=True) if kurum else {'created': 0, 'upgraded': 0}
    yasal_created = yasal_stats['created'] + yasal_stats['upgraded']
    count = 0
    defaults = load_yasal_metin_defaults()
    for slug, payload in defaults.items():
        title = str(payload.get('baslik') or '')
        default_body = str(payload.get('icerik') or '')
        yasal = YasalMetin.objects.filter(kurum_id=kurum_id, tur=slug).first()
        body = (yasal.icerik if yasal and yasal.icerik else default_body)
        title_use = (yasal.baslik if yasal and yasal.baslik else title)
        cms_html = cms_preview_html(body, title_use)
        spec = SPECS_BY_SLUG.get(slug)
        _, changed = _publish_page(
            kurum_id,
            slug=slug,
            title=title_use,
            blocks=[new_block('richText', {'html': cms_html})],
            is_homepage=False,
            show_in_menu=False,
            meta_title=(spec.meta_title if spec else title_use),
            meta_description=(
                spec.meta_description
                if spec
                else f'{title_use} — 3K Kampüs yasal bilgilendirme sayfası. Güncel metin ve iletişim bilgileri.'
            ),
            label='Yasal sayfa bootstrap',
            force=force or not WebPage.objects.filter(kurum_id=kurum_id, slug=slug).exists(),
        )
        if changed:
            count += 1
    return {'pages': count, 'yasal_metinler_created': yasal_created}


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

    from apps.website.application.system_default_specs import SPECS_BY_SLUG

    home_spec = SPECS_BY_SLUG['home']
    home_meta_title = f'{(kurum.gorunen_ad or kurum.ad)} | LGS ve YKS Eğitim Merkezi'
    if len(home_meta_title) < 30 or len(home_meta_title) > 60:
        home_meta_title = home_spec.meta_title
    home_meta_desc = (
        (settings.seo_aciklama if settings and settings.seo_aciklama else '') or home_spec.meta_description
    )
    if len(home_meta_desc.strip()) < 70:
        home_meta_desc = home_spec.meta_description

    home, home_changed = _publish_page(
        kurum_id,
        slug='home',
        title='Anasayfa',
        blocks=build_homepage_blocks(kurum, settings),
        is_homepage=True,
        show_in_menu=True,
        meta_title=home_meta_title,
        meta_description=home_meta_desc,
        label='Anasayfa yerleşim v2',
        force=force_home,
    )
    # Tek homepage
    WebPage.objects.filter(kurum_id=kurum_id, is_homepage=True).exclude(pk=home.pk).update(is_homepage=False)

    pages_changed = []
    page_builders = {
        'hakkimizda': lambda: build_hakkimizda_blocks(kurum),
        '3k-sistemi': build_sistem_blocks,
        'programlar': build_programlar_blocks,
        'duyurular': build_duyurular_blocks,
        'iletisim': lambda: build_iletisim_blocks(kurum, settings, form_slug),
    }
    for slug, builder in page_builders.items():
        spec = SPECS_BY_SLUG[slug]
        force = not WebPage.objects.filter(kurum_id=kurum_id, slug=slug).exists()
        _, changed = _publish_page(
            kurum_id,
            slug=slug,
            title=spec.title,
            blocks=builder(),
            show_in_menu=True,
            meta_title=spec.meta_title,
            meta_description=spec.meta_description,
            label=f'{spec.title} bootstrap',
            force=force or force_home and slug in ('hakkimizda', 'programlar', 'iletisim', '3k-sistemi'),
        )
        if changed:
            pages_changed.append(slug)

    veri_silme_force = not WebPage.objects.filter(kurum_id=kurum_id, slug='veri-silme').exists()
    _, veri_silme_changed = _publish_page(
        kurum_id,
        slug='veri-silme',
        title='Veri Silme Talebi',
        blocks=build_veri_silme_blocks(kurum, settings, form_slug),
        show_in_menu=False,
        meta_title='Veri Silme Talebi | 3K Kampüs KVKK',
        meta_description=(
            'Kişisel verilerinizin silinmesini 3K Kampüs üzerinden nasıl talep edebileceğinizi '
            'açıklayan başvuru sayfası.'
        ),
        label='Veri silme talebi sayfası bootstrap',
        force=veri_silme_force,
    )
    if veri_silme_changed:
        pages_changed.append('veri-silme')

    legal = _ensure_legal_pages(kurum_id, force=False)

    # Tema: kurum logosunu çek + örnek footer
    theme, _ = SiteTheme.objects.get_or_create(kurum_id=kurum_id)
    from apps.website.company_defaults import DEFAULT_COMPANY_INFO, apply_company_defaults

    if settings:
        company_changed = apply_company_defaults(settings)
        if company_changed:
            settings.save(update_fields=[*company_changed, 'updated_at'])

    footer = dict(theme.footer_config or {})
    footer.setdefault('copyright', f'© {timezone.now().year} {kurum.gorunen_ad or kurum.ad}')
    footer.setdefault('title', kurum.gorunen_ad or kurum.ad)
    footer.setdefault(
        'description',
        'LGS, YKS ve okul destek programları ile başarıya giden yolda dijital eğitim partneriniz.',
    )
    if settings:
        footer['telefon'] = settings.telefon or DEFAULT_COMPANY_INFO['telefon']
        footer['whatsapp'] = settings.whatsapp or ''
        footer['eposta'] = settings.eposta or DEFAULT_COMPANY_INFO['eposta']
        footer['adres'] = settings.adres or DEFAULT_COMPANY_INFO['adres']
        footer['ticari_unvan'] = settings.ticari_unvan or DEFAULT_COMPANY_INFO['ticari_unvan']
        footer['mersis_no'] = settings.mersis_no or DEFAULT_COMPANY_INFO['mersis_no']
        footer['vergi_no'] = settings.vergi_no or DEFAULT_COMPANY_INFO['vergi_no']
        footer['ticaret_sicil_no'] = settings.ticaret_sicil_no or DEFAULT_COMPANY_INFO['ticaret_sicil_no']
    else:
        footer.update({
            'telefon': DEFAULT_COMPANY_INFO['telefon'],
            'adres': DEFAULT_COMPANY_INFO['adres'],
            **{k: DEFAULT_COMPANY_INFO[k] for k in (
                'ticari_unvan', 'mersis_no', 'vergi_no', 'ticaret_sicil_no',
            )},
        })
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
        'legal_pages': legal.get('pages', 0),
        'yasal_metinler_created': legal.get('yasal_metinler_created', 0),
        'form_slug': form_slug,
        'health': health,
    }
