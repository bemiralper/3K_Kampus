import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.auth_custom.interfaces.views import INACTIVE_PERSONEL_LOGIN_ERROR
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube

User = get_user_model()

LOGIN_URL = '/auth/api/login/'
ME_URL = '/auth/api/me/'


class InactivePersonelLoginTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='TSTLGN')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.user = User.objects.create_user(
            username='pasif.personel',
            email='pasif.personel@test.com',
            password='Pass1234!',
        )
        self.personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Pasif',
            soyad='Personel',
            email='pasif.personel@test.com',
            user=self.user,
            aktif_mi=True,
        )

    def _login(self, username='pasif.personel', password='Pass1234!'):
        return self.client.post(
            LOGIN_URL,
            data=json.dumps({'username': username, 'password': password}),
            content_type='application/json',
        )

    def test_active_personel_can_login(self):
        response = self._login()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['user']['username'], 'pasif.personel')

    def test_passive_personel_cannot_login(self):
        self.personel.aktif_mi = False
        self.personel.save(update_fields=['aktif_mi'])

        response = self._login()
        self.assertEqual(response.status_code, 403)
        data = response.json()
        self.assertFalse(data['success'])
        self.assertEqual(data['error'], INACTIVE_PERSONEL_LOGIN_ERROR)

    def test_passive_personel_is_blocked_even_if_user_still_active(self):
        self.personel.aktif_mi = False
        self.personel.save(update_fields=['aktif_mi'])
        self.user.refresh_from_db()
        self.user.is_active = True
        self.user.save(update_fields=['is_active'])

        response = self._login()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['error'], INACTIVE_PERSONEL_LOGIN_ERROR)

    def test_reactivated_personel_can_login_again(self):
        self.personel.aktif_mi = False
        self.personel.save(update_fields=['aktif_mi'])
        self.personel.aktif_mi = True
        self.personel.save(update_fields=['aktif_mi'])

        response = self._login()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['success'])

    def test_me_api_logs_out_passive_personel(self):
        self.client.force_login(self.user)
        self.personel.aktif_mi = False
        self.personel.save(update_fields=['aktif_mi'])
        self.user.is_active = True
        self.user.save(update_fields=['is_active'])

        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertFalse(data['authenticated'])
        self.assertIsNone(data['user'])
