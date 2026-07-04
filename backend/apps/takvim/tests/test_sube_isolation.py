"""
Şube zorunluluğu — takvim etkinlik endpoint'leri.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.takvim.domain.models import Event, EventType

User = get_user_model()


class TakvimSubeIsolationAPITest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Takvim Iso Kurum', kod='TISO')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='TISO-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='TISO-B')
        self.user = User.objects.create_user(username='takvimiso', password='test')
        self.client.force_login(self.user)

        self.event_type = EventType.objects.create(
            kurum_id=self.kurum.id,
            ad='Genel',
            kategori='diger',
        )
        now = timezone.now()
        self.event_a = Event.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube_a.id,
            event_type=self.event_type,
            baslik='Etkinlik A',
            baslangic=now,
            bitis=now + timedelta(hours=1),
        )
        self.event_b = Event.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube_b.id,
            event_type=self.event_type,
            baslik='Etkinlik B',
            baslangic=now,
            bitis=now + timedelta(hours=1),
        )

    def test_event_list_requires_sube_context(self):
        res = self.client.get(
            '/takvim/api/etkinlikler/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('sube_id', res.json().get('error', '').lower())

    def test_event_list_scoped_to_active_sube(self):
        res = self.client.get(
            '/takvim/api/etkinlikler/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body.get('success'))
        ids = {row['id'] for row in body.get('data', [])}
        self.assertIn(str(self.event_a.id), ids)
        self.assertNotIn(str(self.event_b.id), ids)

    def test_event_detail_forbidden_wrong_sube(self):
        res = self.client.get(
            f'/takvim/api/etkinlikler/{self.event_b.id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 403)

        res_ok = self.client.get(
            f'/takvim/api/etkinlikler/{self.event_b.id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_b.id),
        )
        self.assertEqual(res_ok.status_code, 200)
        self.assertEqual(res_ok.json()['data']['baslik'], 'Etkinlik B')

    def test_event_create_assigns_active_sube(self):
        now = timezone.now()
        res = self.client.post(
            '/takvim/api/etkinlikler/',
            data={
                'event_type_id': str(self.event_type.id),
                'baslik': 'Yeni Etkinlik',
                'baslangic': now.isoformat(),
                'bitis': (now + timedelta(hours=1)).isoformat(),
            },
            content_type='application/json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['data']['sube_id'], self.sube_a.id)
