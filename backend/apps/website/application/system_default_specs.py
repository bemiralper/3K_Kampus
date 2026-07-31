"""Kurumsal site hazır sayfa tanımları — döngüsel import olmadan paylaşılır."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SystemDefaultPageSpec:
    slug: str
    title: str
    public_path: str
    meta_title: str
    meta_description: str
    is_homepage: bool = False
    show_in_menu: bool = True


SYSTEM_DEFAULT_PAGE_SPECS: tuple[SystemDefaultPageSpec, ...] = (
    SystemDefaultPageSpec(
        slug='home',
        title='Anasayfa',
        public_path='/',
        is_homepage=True,
        meta_title='3K Kampüs | LGS ve YKS Eğitim Merkezi',
        meta_description=(
            'LGS, YKS ve okul destek programları. Akademik takip, bireysel koçluk '
            've deneme analizleriyle hedefe birlikte yürüyün.'
        ),
    ),
    SystemDefaultPageSpec(
        slug='hakkimizda',
        title='Hakkımızda',
        public_path='/hakkimizda',
        meta_title='Hakkımızda | 3K Kampüs Eğitim Merkezi',
        meta_description=(
            '3K Kampüs hakkında: vizyonumuz, eğitim yaklaşımımız ve Erzurum’daki '
            'kampüsümüz. LGS ve YKS’de ölçülebilir başarı.'
        ),
    ),
    SystemDefaultPageSpec(
        slug='3k-sistemi',
        title='3K Sistemi',
        public_path='/3k-sistemi',
        meta_title='3K Sistemi | Dijital Eğitim Altyapısı',
        meta_description=(
            'Tek panelde akademik planlama, ölçme-değerlendirme ve veli iletişimi. '
            '3K Kampüs dijital eğitim sistemi.'
        ),
    ),
    SystemDefaultPageSpec(
        slug='programlar',
        title='Programlar',
        public_path='/sayfa/programlar',
        meta_title='Programlar | LGS, YKS ve Okul Destek',
        meta_description=(
            'LGS, YKS ve okul destek programları. Seviyenize uygun yol haritası '
            've ücretsiz tanışma görüşmesi için başvurun.'
        ),
    ),
    SystemDefaultPageSpec(
        slug='iletisim',
        title='İletişim',
        public_path='/iletisim',
        meta_title='İletişim | 3K Kampüs · Erzurum',
        meta_description=(
            '3K Kampüs iletişim: adres, telefon ve form. Erzurum’da LGS ve YKS için bize ulaşın.'
        ),
    ),
    SystemDefaultPageSpec(
        slug='duyurular',
        title='Duyurular',
        public_path='/duyurular',
        meta_title='Duyurular | 3K Kampüs Haberler',
        meta_description=(
            '3K Kampüs’ten güncel duyuru, haber ve etkinlikler. '
            'Kampüs gelişmelerini buradan takip edin.'
        ),
    ),
    SystemDefaultPageSpec(
        slug='kvkk',
        title='KVKK Aydınlatma Metni',
        public_path='/yasal/kvkk',
        show_in_menu=False,
        meta_title='KVKK Aydınlatma Metni | 3K Kampüs',
        meta_description=(
            '6698 sayılı KVKK kapsamında 3K Kampüs kişisel veri aydınlatma metni. '
            'Veri sorumlusu bilgileri ve haklarınız.'
        ),
    ),
    SystemDefaultPageSpec(
        slug='gizlilik',
        title='Gizlilik Politikası',
        public_path='/yasal/gizlilik',
        show_in_menu=False,
        meta_title='Gizlilik Politikası | 3K Kampüs',
        meta_description=(
            '3K Kampüs gizlilik politikası: kişisel bilgilerinizin nasıl toplandığı, '
            'kullanıldığı ve korunduğu hakkında bilgi.'
        ),
    ),
    SystemDefaultPageSpec(
        slug='kullanim',
        title='Kullanım Koşulları',
        public_path='/yasal/kullanim',
        show_in_menu=False,
        meta_title='Kullanım Koşulları | 3K Kampüs',
        meta_description=(
            '3K Kampüs internet sitesi ve dijital eğitim platformunun kullanımına '
            'ilişkin koşullar ve kullanıcı yükümlülükleri.'
        ),
    ),
    SystemDefaultPageSpec(
        slug='cerez',
        title='Çerez Politikası',
        public_path='/yasal/cerez',
        show_in_menu=False,
        meta_title='Çerez Politikası | 3K Kampüs Sitesi',
        meta_description=(
            '3K Kampüs çerez politikası: sitemizde kullanılan çerez türleri, '
            'amaçları ve tercihlerinizi nasıl yöneteceğiniz.'
        ),
    ),
    SystemDefaultPageSpec(
        slug='veri-silme',
        title='Veri Silme Talebi',
        public_path='/veri-silme',
        show_in_menu=False,
        meta_title='Veri Silme Talebi | 3K Kampüs KVKK',
        meta_description=(
            'Kişisel verilerinizin silinmesini 3K Kampüs üzerinden nasıl talep '
            'edebileceğinizi açıklayan başvuru sayfası.'
        ),
    ),
)

SYSTEM_DEFAULT_SLUGS: frozenset[str] = frozenset(s.slug for s in SYSTEM_DEFAULT_PAGE_SPECS)
SYSTEM_DEFAULT_ORDER: dict[str, int] = {s.slug: i for i, s in enumerate(SYSTEM_DEFAULT_PAGE_SPECS)}
SPECS_BY_SLUG: dict[str, SystemDefaultPageSpec] = {s.slug: s for s in SYSTEM_DEFAULT_PAGE_SPECS}


def public_path_for_slug(slug: str) -> str | None:
    spec = SPECS_BY_SLUG.get(slug)
    return spec.public_path if spec else None


def spec_for_slug(slug: str) -> SystemDefaultPageSpec | None:
    return SPECS_BY_SLUG.get(slug)
