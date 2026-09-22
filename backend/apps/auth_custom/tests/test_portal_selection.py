"""Bir personelin birden fazla paneli: seçim oturum yetkisini o panele daraltır."""
import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()

ME_URL = '/auth/api/me/'
PORTAL_URL = '/auth/api/portal/'


def _role(code, name, level):
    role, _ = Role.objects.get_or_create(
        code=code,
        defaults={'name': name, 'level': level, 'is_system_role': True},
    )
    return role


def _grant(role, code):
    perm, _ = Permission.objects.get_or_create(
        code=code,
        defaults={'name': code, 'module': 'portaltest', 'permission_type': 'read'},
    )
    RolePermission.objects.get_or_create(role=role, permission=perm)
    return perm


class PortalSelectionTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Portal Kurum', kod='PRTL')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PRTL-M')
        self.yil, _ = EgitimYili.objects.get_or_create(
            baslangic_yil=2025,
            bitis_yil=2026,
            defaults={'aktif_mi': True},
        )
        self.koc = _role('koc', 'Koç', 100)
        self.ogretmen = _role('ogretmen', 'Öğretmen', 100)
        _grant(self.koc, 'portaltest.coach')
        _grant(self.ogretmen, 'portaltest.admin')

        self.user = User.objects.create_user('coklu.gorev', 'coklu@test.com', 'Pass1234!')
        self.personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Coklu',
            soyad='Gorev',
            user=self.user,
            aktif_mi=True,
        )
        UserRole.objects.create(user=self.user, role=self.koc, kurum=self.kurum)
        PersonelGorevlendirme.objects.create(
            kurum=self.kurum,
            personel=self.personel,
            egitim_yili=self.yil,
            gorev_sube=self.sube,
            rol=self.koc,
            aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            kurum=self.kurum,
            personel=self.personel,
            egitim_yili=self.yil,
            gorev_sube=self.sube,
            rol=self.ogretmen,
            aktif_mi=True,
        )
        self.client.force_login(self.user)

    def test_me_lists_coach_and_admin_portals(self):
        data = self.client.get(ME_URL).json()
        codes = [item['code'] for item in data['user']['portals']]
        self.assertEqual(codes, ['admin', 'coach'])
        self.assertIsNone(data['user']['active_portal'])
        self.assertEqual(data['user']['role_code'], 'koc')

    def test_selecting_admin_uses_teacher_permissions_only(self):
        response = self.client.post(
            PORTAL_URL,
            data=json.dumps({'portal': 'admin'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        user = response.json()['user']
        self.assertEqual(user['active_portal'], 'admin')
        self.assertEqual(user['role_code'], 'ogretmen')
        self.assertIn('portaltest.admin', user['permissions'])
        self.assertNotIn('portaltest.coach', user['permissions'])

        follow = self.client.get(ME_URL).json()['user']
        self.assertEqual(follow['role_code'], 'ogretmen')
        self.assertNotIn('portaltest.coach', follow['permissions'])

    def test_selecting_coach_drops_admin_permissions(self):
        self.client.post(
            PORTAL_URL,
            data=json.dumps({'portal': 'admin'}),
            content_type='application/json',
        )
        response = self.client.post(
            PORTAL_URL,
            data=json.dumps({'portal': 'coach'}),
            content_type='application/json',
        )
        user = response.json()['user']
        self.assertEqual(user['role_code'], 'koc')
        self.assertIn('portaltest.coach', user['permissions'])
        self.assertNotIn('portaltest.admin', user['permissions'])

    def test_unknown_portal_is_rejected(self):
        response = self.client.post(
            PORTAL_URL,
            data=json.dumps({'portal': 'muhasebe'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 403)

    def test_inactive_assignment_does_not_open_a_portal(self):
        PersonelGorevlendirme.objects.filter(rol=self.ogretmen).update(aktif_mi=False)
        data = self.client.get(ME_URL).json()
        codes = [item['code'] for item in data['user']['portals']]
        self.assertEqual(codes, ['coach'])
        response = self.client.post(
            PORTAL_URL,
            data=json.dumps({'portal': 'admin'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 403)
