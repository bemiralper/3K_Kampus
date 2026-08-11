"""Öğrenci API yazma uçları — ogrenci.write gerektirir."""
import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.roller.models import Role, RolePermission, UserRole
from apps.roller.seed import ensure_default_roles
from apps.sube.domain.models import Sube

User = get_user_model()


class OgrenciApiPermissionTests(TestCase):
    def setUp(self):
        ensure_default_roles()
        self.kurum = Kurum.objects.create(ad='Perm Kurum', kod='PRM')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PRM-M')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Eski', soyad='Ad', aktif_mi=True,
        )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.client = Client()

    def _login_as(self, role_code: str):
        user = User.objects.create_user(username=f'u_{role_code}', password='x', is_staff=True)
        role = Role.objects.get(code=role_code)
        UserRole.objects.create(user=user, role=role, kurum=self.kurum, must_change_password=False)
        self.client.force_login(user)
        return user

    def test_meta_reviewer_cannot_update_name(self):
        self._login_as('meta_wa_reviewer')
        res = self.client.put(
            f'/ogrenciler/api/{self.ogrenci.id}/',
            data=json.dumps({'ad': 'Yeni', 'soyad': 'Ad'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)
        self.ogrenci.refresh_from_db()
        self.assertEqual(self.ogrenci.ad, 'Eski')

    def test_meta_reviewer_can_read_detail(self):
        self._login_as('meta_wa_reviewer')
        res = self.client.get(f'/ogrenciler/api/{self.ogrenci.id}/', **self.headers)
        self.assertEqual(res.status_code, 200)

    def test_koc_can_update_name(self):
        self._login_as('koc')
        res = self.client.put(
            f'/ogrenciler/api/{self.ogrenci.id}/',
            data=json.dumps({'ad': 'Yeni', 'soyad': 'Ad'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.ogrenci.refresh_from_db()
        self.assertEqual(self.ogrenci.ad, 'Yeni')
