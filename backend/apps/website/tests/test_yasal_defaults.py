"""Yasal metin seed / bootstrap testleri."""
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.website.models import SiteFooterLink, YasalMetin
from apps.website.seed_defaults import seed_website_defaults
from apps.website.yasal_defaults import YASAL_METIN_DEFAULTS, ensure_yasal_metinler


class EnsureYasalMetinlerTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='YASAL2')

    def test_creates_all_four_types(self):
        created = ensure_yasal_metinler(self.kurum)
        self.assertEqual(created, 4)
        self.assertEqual(
            set(YasalMetin.objects.filter(kurum=self.kurum).values_list('tur', flat=True)),
            set(YASAL_METIN_DEFAULTS.keys()),
        )

    def test_idempotent_does_not_overwrite(self):
        ensure_yasal_metinler(self.kurum)
        metin = YasalMetin.objects.get(kurum=self.kurum, tur='cerez')
        metin.icerik = '<p>Özel çerez metni</p>'
        metin.save(update_fields=['icerik'])

        created = ensure_yasal_metinler(self.kurum)
        self.assertEqual(created, 0)
        metin.refresh_from_db()
        self.assertEqual(metin.icerik, '<p>Özel çerez metni</p>')


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
