"""Public yasal metin API — JSON 404 (Http404 exception yok, log gürültüsü azaltılır)."""
from django.test import Client, TestCase

from apps.kurum.domain.models import Kurum
from apps.website.models import YasalMetin

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

    def test_missing_yasal_returns_json_not_exception(self):
        res = self.client.get(f'{API}/{self.kurum.kod}/yasal/cerez/')
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res['Content-Type'], 'application/json')
        body = res.json()
        self.assertFalse(body['success'])
        self.assertIn('bulunamadı', body['error'].lower())

    def test_inactive_yasal_returns_json_404(self):
        self.metin.aktif = False
        self.metin.save(update_fields=['aktif'])
        res = self.client.get(f'{API}/{self.kurum.kod}/yasal/kvkk/')
        self.assertEqual(res.status_code, 404)
        self.assertFalse(res.json()['success'])

    def test_existing_yasal_returns_data(self):
        res = self.client.get(f'{API}/{self.kurum.kod}/yasal/kvkk/')
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        self.assertEqual(body['data']['baslik'], 'KVKK Metni')
        self.assertEqual(body['data']['tur'], 'kvkk')

    def test_wrong_method_returns_405(self):
        res = self.client.post(f'{API}/{self.kurum.kod}/yasal/kvkk/')
        self.assertEqual(res.status_code, 405)
        self.assertFalse(res.json()['success'])
