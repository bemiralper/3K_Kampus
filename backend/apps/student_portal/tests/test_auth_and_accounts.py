import json
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term
from apps.student_portal.models import StudentPortalAccount

User = get_user_model()


class StudentPortalAuthTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='3K Kampüs', kod='3KK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Kadıköy', kod='KDK')
        self.year = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            name='2026-2027 Güz',
            code='GUZ',
            start_date=date(2026, 9, 1),
            end_date=date(2027, 1, 31),
            is_active=True,
        )

        self.staff_role, _ = Role.objects.get_or_create(
            code='yonetici',
            defaults={'name': 'Yönetici', 'level': 50, 'is_system_role': True},
        )
        for perm_code, ptype in [
            ('ogrenci.read', 'read'),
            ('ogrenci.write', 'write'),
            ('ogrenci.manage', 'manage'),
        ]:
            perm, _ = Permission.objects.get_or_create(
                code=perm_code,
                defaults={'name': perm_code, 'module': 'ogrenci', 'permission_type': ptype},
            )
            RolePermission.objects.get_or_create(role=self.staff_role, permission=perm)

        self.staff_user = User.objects.create_user(
            username='mudur1', password='StaffPassword123!', is_staff=True,
        )
        UserRole.objects.create(
            user=self.staff_user,
            role=self.staff_role,
            kurum=self.kurum,
            must_change_password=False,
        )

        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Arda',
            soyad='Yayla',
            tc_kimlik_no='43154112786',
            aktif_mi=True,
        )
        self.kayit = OgrenciKayit.objects.create(
            ogrenci=self.ogrenci,
            egitim_yili=self.year,
            kurum=self.kurum,
            sube=self.sube,
            okul_no='00064',
            aktif_mi=True,
        )

    def _staff_headers(self):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }

    def test_staff_create_account_and_student_first_password_flow(self):
        self.client.force_login(self.staff_user)
        res = self.client.post(
            f'/ogrenciler/api/{self.ogrenci.id}/portal-account/',
            data=json.dumps({'action': 'create'}),
            content_type='application/json',
            **self._staff_headers(),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()['data']
        self.assertTrue(body['has_account'])
        self.assertTrue(body['must_change_password'])
        temp_password = body['temp_password']
        username = body['username']
        self.client.logout()

        # Okul numarası ile giriş yapabilmeli
        login_res = self.client.post(
            '/auth/api/login/',
            data=json.dumps({'username': '00064', 'password': temp_password}),
            content_type='application/json',
        )
        self.assertEqual(login_res.status_code, 200)
        self.assertEqual(login_res.json()['user']['role_code'], 'ogrenci')
        self.assertTrue(login_res.json()['user']['must_change_password'])

        # Şifre değiştirmeden me/ ucu kilitli olmalı, bootstrap/ açık olmalı
        me_locked = self.client.get('/api/student/me/')
        self.assertEqual(me_locked.status_code, 403)
        self.assertEqual(me_locked.json()['code'], 'must_change_password')

        boot = self.client.get('/api/student/bootstrap/')
        self.assertEqual(boot.status_code, 200)
        self.assertTrue(boot.json()['data']['must_change_password'])

        # İlk şifre değişimi
        pw_res = self.client.post(
            '/api/student/password/',
            data=json.dumps({
                'new_password': 'YeniGucluSifre2026!',
                'new_password_confirm': 'YeniGucluSifre2026!',
            }),
            content_type='application/json',
        )
        self.assertEqual(pw_res.status_code, 200)
        self.assertFalse(pw_res.json()['data']['must_change_password'])

        # Artık me/ açılmalı ve TC ile de giriş yapılabilmeli
        me_ok = self.client.get('/api/student/me/')
        self.assertEqual(me_ok.status_code, 200)
        self.assertEqual(me_ok.json()['data']['student']['full_name'], 'Arda Yayla')
        self.assertEqual(username, '43154112786')

    def test_inactive_student_and_disabled_portal_blocked(self):
        self.client.force_login(self.staff_user)
        res = self.client.post(
            f'/ogrenciler/api/{self.ogrenci.id}/portal-account/',
            data=json.dumps({'action': 'create'}),
            content_type='application/json',
            **self._staff_headers(),
        )
        temp_password = res.json()['data']['temp_password']
        account = StudentPortalAccount.objects.get(ogrenci=self.ogrenci)
        ur = account.user.user_role
        ur.must_change_password = False
        ur.save(update_fields=['must_change_password'])
        self.client.logout()

        # Öğrenci pasife alınırsa giriş reddedilir
        self.ogrenci.aktif_mi = False
        self.ogrenci.save(update_fields=['aktif_mi'])

        blocked = self.client.post(
            '/auth/api/login/',
            data=json.dumps({'username': account.user.username, 'password': temp_password}),
            content_type='application/json',
        )
        self.assertEqual(blocked.status_code, 403)

        # Tekrar aktifleştir, fakat portal erişimini kapat
        self.ogrenci.aktif_mi = True
        self.ogrenci.save(update_fields=['aktif_mi'])
        account.is_enabled = False
        account.save(update_fields=['is_enabled'])

        blocked_portal = self.client.post(
            '/auth/api/login/',
            data=json.dumps({'username': account.user.username, 'password': temp_password}),
            content_type='application/json',
        )
        self.assertEqual(blocked_portal.status_code, 403)

    def test_staff_cannot_open_student_portal_endpoints(self):
        self.client.force_login(self.staff_user)
        res = self.client.get('/api/student/me/')
        self.assertEqual(res.status_code, 403)

    @override_settings(STUDENT_PORTAL_ENABLED=False)
    def test_feature_flag_disables_student_portal(self):
        self.client.force_login(self.staff_user)
        res = self.client.get('/api/student/bootstrap/')
        self.assertEqual(res.status_code, 404)
