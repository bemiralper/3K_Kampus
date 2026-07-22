"""Anasayfa footer link varsayılanları."""
from __future__ import annotations

from apps.kurum.domain.models import Kurum
from apps.website.models import SiteFooterLink

DEFAULT_FOOTER_LINKS: tuple[tuple[str, str, str, int], ...] = (
    ('kurumsal', 'Hakkımızda', '/hakkimizda', 0),
    ('kurumsal', '3K Sistemi', '/3k-sistemi', 1),
    ('hizli', 'Duyurular', '#duyurular', 0),
    ('hizli', 'Sınav Takvimi', '#sinav-takvimi', 1),
    ('hizli', 'İletişim', '/iletisim', 2),
    ('yasal', 'KVKK', '/yasal/kvkk', 0),
    ('yasal', 'Gizlilik Politikası', '/yasal/gizlilik', 1),
    ('yasal', 'Kullanım Koşulları', '/yasal/kullanim', 2),
    ('yasal', 'Çerez Politikası', '/yasal/cerez', 3),
)

REQUIRED_YASAL_URLS = frozenset(
    url for kolon, _etiket, url, _sira in DEFAULT_FOOTER_LINKS if kolon == 'yasal'
)


def ensure_site_footer_links(kurum: Kurum) -> int:
    """Eksik footer linklerini ekler / günceller; mevcut özel linkleri silmez."""
    changed = 0
    for kolon, etiket, url, sira in DEFAULT_FOOTER_LINKS:
        _obj, created = SiteFooterLink.objects.update_or_create(
            kurum=kurum,
            kolon=kolon,
            etiket=etiket,
            defaults={'url': url, 'sira': sira, 'aktif': True},
        )
        if created:
            changed += 1
    return changed
