"""Kurumsal site hazır sayfa tanımları — döngüsel import olmadan paylaşılır."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SystemDefaultPageSpec:
    slug: str
    title: str
    public_path: str
    meta_description: str
    is_homepage: bool = False
    show_in_menu: bool = True


SYSTEM_DEFAULT_PAGE_SPECS: tuple[SystemDefaultPageSpec, ...] = (
    SystemDefaultPageSpec(
        slug='home',
        title='Anasayfa',
        public_path='/',
        is_homepage=True,
        meta_description='LGS, YKS ve okul destek programları. Akademik takip, koçluk ve deneme analizleri.',
    ),
    SystemDefaultPageSpec(
        slug='hakkimizda',
        title='Hakkımızda',
        public_path='/hakkimizda',
        meta_description='Kurum hakkında bilgi.',
    ),
    SystemDefaultPageSpec(
        slug='3k-sistemi',
        title='3K Sistemi',
        public_path='/3k-sistemi',
        meta_description='3K dijital eğitim sistemi.',
    ),
    SystemDefaultPageSpec(
        slug='programlar',
        title='Programlar',
        public_path='/sayfa/programlar',
        meta_description='LGS, YKS ve okul destek programları.',
    ),
    SystemDefaultPageSpec(
        slug='iletisim',
        title='İletişim',
        public_path='/iletisim',
        meta_description='İletişim bilgileri ve başvuru formu.',
    ),
    SystemDefaultPageSpec(
        slug='duyurular',
        title='Duyurular',
        public_path='/duyurular',
        meta_description='Güncel duyuru ve haberler.',
    ),
    SystemDefaultPageSpec(
        slug='kvkk',
        title='KVKK Aydınlatma Metni',
        public_path='/yasal/kvkk',
        show_in_menu=False,
        meta_description='KVKK aydınlatma metni.',
    ),
    SystemDefaultPageSpec(
        slug='gizlilik',
        title='Gizlilik Politikası',
        public_path='/yasal/gizlilik',
        show_in_menu=False,
        meta_description='Gizlilik politikası.',
    ),
    SystemDefaultPageSpec(
        slug='kullanim',
        title='Kullanım Koşulları',
        public_path='/yasal/kullanim',
        show_in_menu=False,
        meta_description='Site kullanım koşulları.',
    ),
    SystemDefaultPageSpec(
        slug='cerez',
        title='Çerez Politikası',
        public_path='/yasal/cerez',
        show_in_menu=False,
        meta_description='Çerez politikası.',
    ),
)

SYSTEM_DEFAULT_SLUGS: frozenset[str] = frozenset(s.slug for s in SYSTEM_DEFAULT_PAGE_SPECS)
SYSTEM_DEFAULT_ORDER: dict[str, int] = {s.slug: i for i, s in enumerate(SYSTEM_DEFAULT_PAGE_SPECS)}


def public_path_for_slug(slug: str) -> str | None:
    for spec in SYSTEM_DEFAULT_PAGE_SPECS:
        if spec.slug == slug:
            return spec.public_path
    return None
