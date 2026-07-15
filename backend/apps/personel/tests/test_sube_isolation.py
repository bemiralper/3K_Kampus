"""
Şube zorunluluğu — personel list/detail endpoint'leri.
"""
import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_personel_read(user, kurum):
    role, _ = Role.objects.get_or_create(
        code='personel_sube_test',
        defaults={'name': 'Personel Sube Test', 'level': 100, 'is_system_role': True},
    )
    perm, _ = Permission.objects.get_or_create(
        code='personel.read',
        defaults={'name': 'personel.read', 'module': 'personel', 'permission_type': 'read'},
    )
    RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role, 'kurum': kurum})


def _assign_personel_manage(user, kurum):
    role, _ = Role.objects.get_or_create(
        code='personel_sube_manage_test',
        defaults={'name': 'Personel Sube Manage Test', 'level': 100, 'is_system_role': True},
    )
    perm, _ = Permission.objects.get_or_create(
        code='personel.manage',
        defaults={'name': 'personel.manage', 'module': 'personel', 'permission_type': 'manage'},
    )
    RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role, 'kurum': kurum})


class PersonelSubeIsolationAPITest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Per Sube Kurum', kod='PSK')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='PSK-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='PSK-B')
        self.yil = EgitimYili.objects.create(
            baslangic_yil=2025,
            bitis_yil=2026,
            aktif_mi=True,
        )
        self.gorev_rol, _ = Role.objects.get_or_create(
            code='ogretmen',
            defaults={'name': 'Öğretmen', 'level': 50, 'is_system_role': True},
        )

        self.personel_home_a = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Ana',
            soyad='SubeA',
            aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            kurum=self.kurum,
            personel=self.personel_home_a,
            egitim_yili=self.yil,
            gorev_sube=self.sube_a,
            rol=self.gorev_rol,
            aktif_mi=True,
        )

        self.personel_cross = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Gorev',
            soyad='SubeB',
            aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            kurum=self.kurum,
            personel=self.personel_cross,
            egitim_yili=self.yil,
            gorev_sube=self.sube_b,
            rol=self.gorev_rol,
            aktif_mi=True,
        )

        self.user = User.objects.create_user(username='personeliso', password='test')
        _assign_personel_read(self.user, self.kurum)
        self.client.force_login(self.user)

    def test_list_requires_sube_context(self):
        res = self.client.get(
            '/personel/api/list/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('sube_id', res.json().get('error', '').lower())

    def test_list_scoped_to_gorev_sube(self):
        res = self.client.get(
            '/personel/api/list/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
            HTTP_X_EGITIMYILI_ID=str(self.yil.id),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body.get('success'))
        ids = {row['id'] for row in body.get('personeller', [])}
        self.assertIn(self.personel_home_a.id, ids)
        # Ana şubesi A olan personel, B görevlendirmesi olsa da A listesinde kalır
        self.assertIn(self.personel_cross.id, ids)

    def test_list_includes_cross_sube_gorevlendirme(self):
        res = self.client.get(
            '/personel/api/list/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_b.id),
            HTTP_X_EGITIMYILI_ID=str(self.yil.id),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json().get('personeller', [])}
        self.assertIn(self.personel_cross.id, ids)
        self.assertNotIn(self.personel_home_a.id, ids)

    def test_detail_ok_home_sube_with_gorev_elsewhere(self):
        res = self.client.get(
            f'/personel/api/{self.personel_cross.id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
            HTTP_X_EGITIMYILI_ID=str(self.yil.id),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get('personel', {}).get('id'), self.personel_cross.id)

    def test_detail_ok_matching_gorev_sube(self):
        res = self.client.get(
            f'/personel/api/{self.personel_cross.id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_b.id),
            HTTP_X_EGITIMYILI_ID=str(self.yil.id),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get('personel', {}).get('id'), self.personel_cross.id)

    def test_gorevlendirme_create_keeps_home_sube_visibility(self):
        """Şube B'ye görevlendirme eklemek ana şube A görünürlüğünü kaldırmamalı."""
        manage_user = User.objects.create_user(username='personeliso_manage', password='test')
        _assign_personel_manage(manage_user, self.kurum)
        self.client.force_login(manage_user)

        personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Yeni',
            soyad='CokSube',
            aktif_mi=True,
        )
        res = self.client.post(
            '/personel/api/gorevlendirme/create/',
            data=json.dumps({
                'personel_id': personel.id,
                'egitim_yili_id': self.yil.id,
                'gorev_sube_id': self.sube_b.id,
                'rol_id': self.gorev_rol.id,
                'aktif_mi': True,
            }),
            content_type='application/json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_b.id),
            HTTP_X_EGITIMYILI_ID=str(self.yil.id),
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json().get('success'))

        list_a = self.client.get(
            '/personel/api/list/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
            HTTP_X_EGITIMYILI_ID=str(self.yil.id),
        )
        list_b = self.client.get(
            '/personel/api/list/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_b.id),
            HTTP_X_EGITIMYILI_ID=str(self.yil.id),
        )
        ids_a = {row['id'] for row in list_a.json().get('personeller', [])}
        ids_b = {row['id'] for row in list_b.json().get('personeller', [])}
        self.assertIn(personel.id, ids_a)
        self.assertIn(personel.id, ids_b)

    def test_gorevlendirme_list_requires_sube(self):
        res = self.client.get(
            '/personel/api/gorevlendirmeler/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)

    def test_stats_requires_sube(self):
        res = self.client.get(
            '/personel/api/stats/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)
