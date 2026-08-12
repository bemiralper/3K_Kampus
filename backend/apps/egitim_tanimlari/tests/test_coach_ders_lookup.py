"""Koç profili olan kullanıcılar ders listesini GET ile okuyabilmeli."""

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.coaching.models import CoachProfile
from apps.egitim_tanimlari.models import Ders
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube

User = get_user_model()


class CoachDersLookupTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Coach Ders Kurum', kod='CDK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Biyoloji-1', kod='BIO1', aktif_mi=True,
        )
        self.user = User.objects.create_user(
            username='coach_ders', email='coach_ders@test.com', password='testpass123',
        )
        self.personel = Personel.objects.create(
            user=self.user,
            kurum=self.kurum,
            sube=self.sube,
            ad='Başak',
            soyad='Test',
            tc_kimlik_no='11111111111',
            aktif_mi=True,
        )
        CoachProfile.objects.create(
            teacher=self.personel,
            capacity=20,
            is_active=True,
            is_coach=True,
        )
        self.client = Client()
        self.client.force_login(self.user)

    def test_coach_can_get_ders_list_without_role_permission(self):
        response = self.client.get(
            '/egitim-tanimlari/api/ders/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertTrue(payload.get('success'))
        ids = {item['id'] for item in payload.get('data') or []}
        self.assertIn(self.ders.id, ids)

    def test_coach_cannot_create_ders(self):
        response = self.client.post(
            '/egitim-tanimlari/api/ders/',
            data='{"ad":"Yeni","kod":"YNI"}',
            content_type='application/json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(response.status_code, 403)
