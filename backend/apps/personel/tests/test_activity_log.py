import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.kurum.domain.models import Kurum
from apps.personel.application.activity_log import log_personel_activity
from apps.personel.domain.models import Personel, PersonelAktiviteLog
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()

LOGIN_URL = '/auth/api/login/'
LOGOUT_URL = '/auth/api/logout/'


def _assign_personel_read(user, kurum):
    role, _ = Role.objects.get_or_create(
        code='personel_activity_test',
        defaults={'name': 'Personel Activity Test', 'level': 100, 'is_system_role': True},
    )
    perm, _ = Permission.objects.get_or_create(
        code='personel.read',
        defaults={'name': 'personel.read', 'module': 'personel', 'permission_type': 'read'},
    )
    RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role, 'kurum': kurum})


class PersonelActivityLogTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Aktivite Kurum', kod='AKT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='AKT-M')
        self.user = User.objects.create_user(
            username='aktivite.personel',
            email='aktivite.personel@test.com',
            password='Pass1234!',
        )
        self.personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Aktivite',
            soyad='Personel',
            email='aktivite.personel@test.com',
            user=self.user,
        )
        self.admin = User.objects.create_user(
            username='aktivite.admin',
            password='Admin1234!',
            is_superuser=True,
            is_staff=True,
        )
        _assign_personel_read(self.admin, self.kurum)

    def _ctx(self):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_helper_writes_log(self):
        log = log_personel_activity(
            personel=self.personel,
            eylem='LOGIN',
            detay='Manuel test',
        )
        self.assertIsNotNone(log)
        self.assertEqual(PersonelAktiviteLog.objects.filter(personel=self.personel, eylem='LOGIN').count(), 1)

    def test_login_creates_activity_log(self):
        response = self.client.post(
            LOGIN_URL,
            data=json.dumps({'username': 'aktivite.personel', 'password': 'Pass1234!'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        log = PersonelAktiviteLog.objects.filter(personel=self.personel, eylem='LOGIN').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.detay, 'Sisteme giriş yapıldı')

    def test_failed_login_creates_activity_log(self):
        response = self.client.post(
            LOGIN_URL,
            data=json.dumps({'username': 'aktivite.personel', 'password': 'WrongPass!'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 401)
        log = PersonelAktiviteLog.objects.filter(personel=self.personel, eylem='LOGIN_FAILED').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.detay, 'Hatalı şifre')

    def test_logout_creates_activity_log(self):
        self.client.force_login(self.user)
        response = self.client.post(LOGOUT_URL)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            PersonelAktiviteLog.objects.filter(personel=self.personel, eylem='LOGOUT').exists()
        )

    def test_full_detail_returns_activity_and_stats(self):
        log_personel_activity(personel=self.personel, eylem='LOGIN', detay='Sisteme giriş yapıldı')
        log_personel_activity(personel=self.personel, eylem='LOGOUT', detay='Sistemden çıkış yapıldı')
        self.client.force_login(self.admin)

        response = self.client.get(f'/personel/api/{self.personel.id}/full/', **self._ctx())
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertEqual(len(data['aktivite_loglari']), 2)
        self.assertEqual(data['aktivite_loglari'][0]['eylem'], 'LOGOUT')
        self.assertEqual(data['aktivite_loglari'][0]['eylem_display'], 'Çıkış')
        self.assertTrue(data['aktivite_loglari'][0]['created_at'])
        self.assertEqual(data['stats']['toplam_giris'], 1)
        self.assertEqual(data['stats']['bu_hafta_giris'], 1)
        self.assertIsNotNone(data['stats']['son_giris'])

    def test_full_detail_can_filter_by_eylem(self):
        log_personel_activity(personel=self.personel, eylem='LOGIN', detay='Giriş')
        log_personel_activity(personel=self.personel, eylem='LOGOUT', detay='Çıkış')
        self.client.force_login(self.admin)

        response = self.client.get(
            f'/personel/api/{self.personel.id}/full/?aktivite_eylem=LOGIN',
            **self._ctx(),
        )
        self.assertEqual(response.status_code, 200)
        logs = response.json()['aktivite_loglari']
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]['eylem'], 'LOGIN')
