"""Footer link seed testleri."""
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.website.footer_defaults import REQUIRED_YASAL_URLS, ensure_site_footer_links
from apps.website.models import SiteFooterLink


class EnsureSiteFooterLinksTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Footer Kurum', kod='FOOTER')

    def test_adds_all_yasal_links_when_empty(self):
        created = ensure_site_footer_links(self.kurum)
        self.assertGreaterEqual(created, 4)
        urls = set(
            SiteFooterLink.objects.filter(kurum=self.kurum, kolon='yasal', aktif=True)
            .values_list('url', flat=True)
        )
        self.assertTrue(REQUIRED_YASAL_URLS.issubset(urls))

    def test_adds_missing_kullanim_and_cerez(self):
        SiteFooterLink.objects.create(
            kurum=self.kurum, kolon='yasal', etiket='KVKK', url='/yasal/kvkk', sira=0, aktif=True,
        )
        SiteFooterLink.objects.create(
            kurum=self.kurum,
            kolon='yasal',
            etiket='Gizlilik Politikası',
            url='/yasal/gizlilik',
            sira=1,
            aktif=True,
        )
        ensure_site_footer_links(self.kurum)
        urls = set(
            SiteFooterLink.objects.filter(kurum=self.kurum, kolon='yasal').values_list('url', flat=True)
        )
        self.assertIn('/yasal/kullanim', urls)
        self.assertIn('/yasal/cerez', urls)
