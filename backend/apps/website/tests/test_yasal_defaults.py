"""Yasal metin seed / bootstrap testleri."""
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.website.models import SiteFooterLink, YasalMetin
from apps.website.seed_defaults import seed_website_defaults
from apps.website.yasal_defaults import (
    ensure_yasal_metinler,
    is_placeholder_yasal_content,
    is_published_yasal_html,
    load_yasal_metin_defaults,
)


class EnsureYasalMetinlerTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='YASAL2')

    def test_creates_all_four_types_with_structured_json(self):
        stats = ensure_yasal_metinler(self.kurum)
        self.assertEqual(stats['created'], 4)
        self.assertEqual(
            set(YasalMetin.objects.filter(kurum=self.kurum).values_list('tur', flat=True)),
            set(load_yasal_metin_defaults().keys()),
        )
        sample = YasalMetin.objects.get(kurum=self.kurum, tur='kvkk')
        self.assertTrue(sample.icerik.strip().startswith('<section'))
        self.assertIn('yasal-section', sample.icerik)
        self.assertFalse(is_placeholder_yasal_content(sample.icerik))

    def test_upgrades_legacy_gizlilik_snippet(self):
        YasalMetin.objects.create(
            kurum=self.kurum,
            tur='gizlilik',
            baslik='Gizlilik Politikası',
            icerik='<p>Gizlilik politikası metni.</p>',
            aktif=True,
        )
        stats = ensure_yasal_metinler(self.kurum, upgrade_placeholders=True)
        self.assertEqual(stats['upgraded'], 1)
        metin = YasalMetin.objects.get(kurum=self.kurum, tur='gizlilik')
        self.assertTrue(is_published_yasal_html(metin.icerik))


class SeedWebsiteDefaultsYasalTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Seed Kurum', kod='SEEDYASAL')

    def test_seed_includes_cerez_and_footer_links(self):
        seed_website_defaults(self.kurum)
        self.assertTrue(YasalMetin.objects.filter(kurum=self.kurum, tur='cerez').exists())
        footer = SiteFooterLink.objects.filter(kurum=self.kurum, kolon='yasal')
        urls = set(footer.values_list('url', flat=True))
        self.assertIn('/yasal/kullanim', urls)
        self.assertIn('/yasal/cerez', urls)
