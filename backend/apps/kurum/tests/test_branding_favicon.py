from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import RequestFactory, TestCase

from apps.kurum.branding import serialize_kurum_branding, serialize_sube_branding
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.sube.serialize import apply_sube_fields


def _png() -> SimpleUploadedFile:
    return SimpleUploadedFile(
        'favicon.png',
        b'\x89PNG\r\n\x1a\n' + b'\x00' * 16,
        content_type='image/png',
    )


class KurumBrandingFaviconTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='3K Kampüs', kod='3K', aktif_mi=True)
        self.merkez = Sube.objects.create(
            kurum=self.kurum, ad='Merkez Şube', kod='MRK', aktif_mi=True,
            gorunen_ad='Merkez Şube',
        )
        self.kampus = Sube.objects.create(
            kurum=self.kurum, ad='3K Kampüs', kod='KMP', aktif_mi=True,
            gorunen_ad='Merkez Şube',
        )
        self.request = RequestFactory().get('/')

    def test_kurum_does_not_inherit_another_sube_favicon(self):
        self.merkez.favicon = _png()
        self.merkez.save(update_fields=['favicon'])

        data = serialize_kurum_branding(self.kurum, self.request)
        self.assertFalse(data.get('favicon_url'))

        kampus = serialize_sube_branding(self.kampus, self.request)
        self.assertFalse(kampus.get('favicon_url'))
        merkez = serialize_sube_branding(self.merkez, self.request)
        self.assertTrue(merkez.get('favicon_url'))

    def test_rename_sube_syncs_stale_matching_gorunen_ad(self):
        apply_sube_fields(self.merkez, {'ad': '3K Kampüs'})
        self.assertEqual(self.merkez.ad, '3K Kampüs')
        self.assertEqual(self.merkez.gorunen_ad, '3K Kampüs')

    def test_explicit_gorunen_ad_is_kept_on_rename(self):
        apply_sube_fields(self.kampus, {'ad': 'Kampüs Yeni', 'gorunen_ad': '3K Marka'})
        self.assertEqual(self.kampus.gorunen_ad, '3K Marka')
