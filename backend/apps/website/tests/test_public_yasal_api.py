"""Public yasal metin API — JSON 404 (Http404 exception yok, log gürültüsü azaltılır)."""
from django.test import Client, TestCase

from apps.kurum.domain.models import Kurum
from apps.website.models import YasalMetin
from apps.website.yasal_defaults import is_published_yasal_html

API = '/website/api/public'


class PublicYasalDetailAPITest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Yasal Test Kurum', kod='YASAL')
        self.metin = YasalMetin.objects.create(
            kurum=self.kurum,
            tur='kvkk',
            baslik='KVKK Metni',
            icerik='<p>Test içerik</p>',
            aktif=True,
        )

    def test_missing_yasal_auto_seeds_full_html(self):
        res = self.client.get(f'{API}/{self.kurum.kod}/yasal/cerez/')
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        self.assertTrue(is_published_yasal_html(body['data']['icerik']))

    def test_legacy_snippet_auto_upgrades_on_read(self):
        YasalMetin.objects.create(
            kurum=self.kurum,
            tur='gizlilik',
            baslik='Gizlilik Politikası',
            icerik='<p>Gizlilik politikası metni.</p>',
            aktif=True,
        )
        res = self.client.get(f'{API}/{self.kurum.kod}/yasal/gizlilik/')
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        self.assertTrue(is_published_yasal_html(body['data']['icerik']))

    def test_inactive_yasal_returns_json_404(self):
        self.metin.aktif = False
        self.metin.save(update_fields=['aktif'])
        res = self.client.get(f'{API}/{self.kurum.kod}/yasal/kvkk/')
        self.assertEqual(res.status_code, 404)
        self.assertFalse(res.json()['success'])

    def test_existing_yasal_upgrades_placeholder(self):
        res = self.client.get(f'{API}/{self.kurum.kod}/yasal/kvkk/')
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        self.assertEqual(body['data']['tur'], 'kvkk')
        self.assertTrue(is_published_yasal_html(body['data']['icerik']))

    def test_wrong_method_returns_405(self):
        res = self.client.post(f'{API}/{self.kurum.kod}/yasal/kvkk/')
        self.assertEqual(res.status_code, 405)
        self.assertFalse(res.json()['success'])
