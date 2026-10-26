import json
import time
from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import signing
from django.core.cache import cache
from django.test import Client, TestCase, override_settings

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.mobile_identity.tokens import ACCESS_SALT
from apps.personel.domain.models import Personel, PersonelAktiviteLog, PersonelGorevlendirme
from apps.roller.models import Role
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()

TOKEN_URL = '/api/mobile/auth/token/'
REFRESH_URL = '/api/mobile/auth/token/refresh/'
LOGOUT_URL = '/api/mobile/auth/logout/'
ME_URL = '/api/mobile/me/'
TEACHER_ME_URL = '/api/teacher/me/'
WEB_LOGIN_URL = '/auth/api/login/'
WEB_ME_URL = '/auth/api/me/'


class MobileIdentityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Mobil Kurum', kod='MOBK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MOB-A')
        self.other_sube = Sube.objects.create(kurum=self.kurum, ad='Diğer', kod='MOB-B')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.other_year = EgitimYili.objects.create(baslangic_yil=2024, bitis_yil=2025, aktif_mi=False)
        self.teacher_role, _ = Role.objects.get_or_create(
            code='ogretmen',
            defaults={'name': 'Öğretmen', 'is_system_role': True},
        )
        self.coach_role, _ = Role.objects.get_or_create(
            code='koc',
            defaults={'name': 'Koç', 'is_system_role': True},
        )
        self.user = User.objects.create_user(username='ogretmen.mobil', password='Pass1234!')
        self.personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Yılmaz',
            user=self.user,
            aktif_mi=True,
        )
        self.assignment = PersonelGorevlendirme.objects.create(
            personel=self.personel,
            egitim_yili=self.year,
            rol=self.teacher_role,
            gorev_sube=self.sube,
            kurum=self.kurum,
            aktif_mi=True,
        )

    def _token(self, username='ogretmen.mobil', password='Pass1234!', device='telefon-1'):
        return self.client.post(
            TOKEN_URL,
            data=json.dumps({'username': username, 'password': password, 'device_id': device}),
            content_type='application/json',
        )

    def _auth(self, access, **headers):
        base = {'HTTP_AUTHORIZATION': f'Bearer {access}'}
        base.update(headers)
        return base

    def _teacher_headers(self, access, sube=None, year=None):
        return self._auth(
            access,
            HTTP_X_PORTAL='teacher',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str((sube or self.sube).id),
            HTTP_X_EGITIMYILI_ID=str((year or self.year).id),
        )

    def test_login_issues_tokens_without_tenant_claims_or_web_session(self):
        response = self._token()
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['token_type'], 'Bearer')
        self.assertEqual(body['expires_in'], 900)
        claims = signing.loads(body['access'], salt=ACCESS_SALT, max_age=900)
        self.assertEqual(set(claims), {'uid', 'sid', 'typ'})
        self.assertNotIn('kurum', json.dumps(claims))
        web = self.client.get(WEB_ME_URL)
        self.assertFalse(web.json()['authenticated'])

    def test_web_login_contract_unchanged(self):
        from django.conf import settings

        self.assertEqual(
            settings.REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES'],
            [
                'rest_framework.authentication.SessionAuthentication',
                'rest_framework.authentication.BasicAuthentication',
            ],
        )
        response = self.client.post(
            WEB_LOGIN_URL,
            data=json.dumps({'username': 'ogretmen.mobil', 'password': 'Pass1234!'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body['success'])
        self.assertNotIn('access', body)
        self.assertNotIn('refresh', body)
        self.assertTrue(self.client.get(WEB_ME_URL).json()['authenticated'])

    def test_refresh_rotation_rejects_reuse_and_kills_the_new_token(self):
        first = self._token().json()
        rotated = self.client.post(
            REFRESH_URL,
            data=json.dumps({'refresh': first['refresh']}),
            content_type='application/json',
        )
        self.assertEqual(rotated.status_code, 200)
        newer = rotated.json()['refresh']
        self.assertNotEqual(newer, first['refresh'])
        reuse = self.client.post(
            REFRESH_URL,
            data=json.dumps({'refresh': first['refresh']}),
            content_type='application/json',
        )
        self.assertEqual(reuse.status_code, 401)
        self.assertEqual(reuse.json()['code'], 'unauthenticated')
        follow = self.client.post(
            REFRESH_URL,
            data=json.dumps({'refresh': newer}),
            content_type='application/json',
        )
        self.assertEqual(follow.status_code, 401)

    def test_logout_revokes_only_that_device(self):
        phone = self._token(device='telefon').json()
        tablet = self._token(device='tablet').json()
        gone = self.client.post(
            LOGOUT_URL,
            data=json.dumps({'refresh': phone['refresh']}),
            content_type='application/json',
        )
        self.assertEqual(gone.status_code, 200)
        phone_me = self.client.get(ME_URL, **self._auth(phone['access']))
        self.assertEqual(phone_me.status_code, 401)
        tablet_me = self.client.get(ME_URL, **self._auth(tablet['access']))
        self.assertEqual(tablet_me.status_code, 200)
        self.assertEqual(tablet_me.json()['account']['ad'], 'Ayşe')

    def test_mobile_me_lists_teacher_as_only_enterable_portal(self):
        PersonelGorevlendirme.objects.create(
            personel=self.personel,
            egitim_yili=self.year,
            rol=self.coach_role,
            gorev_sube=self.sube,
            kurum=self.kurum,
            aktif_mi=True,
        )
        access = self._token().json()['access']
        response = self.client.get(ME_URL, **self._auth(access))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['account']['soyad'], 'Yılmaz')
        self.assertNotIn('email', body['account'])
        self.assertNotIn('telefon', json.dumps(body))
        enterable = [item['code'] for item in body['portals'] if item['enterable']]
        self.assertEqual(enterable, ['teacher'])
        self.assertIn('coach', [item['code'] for item in body['portals']])

    def test_teacher_me_requires_portal_and_assignment(self):
        access = self._token().json()['access']
        missing = self.client.get(
            TEACHER_ME_URL,
            **self._auth(
                access,
                HTTP_X_KURUM_ID=str(self.kurum.id),
                HTTP_X_SUBE_ID=str(self.sube.id),
                HTTP_X_EGITIMYILI_ID=str(self.year.id),
            ),
        )
        self.assertEqual(missing.status_code, 403)
        self.assertEqual(missing.json()['code'], 'portal_unavailable')

        coach_portal = self.client.get(
            TEACHER_ME_URL,
            **self._auth(
                access,
                HTTP_X_PORTAL='coach',
                HTTP_X_KURUM_ID=str(self.kurum.id),
                HTTP_X_SUBE_ID=str(self.sube.id),
                HTTP_X_EGITIMYILI_ID=str(self.year.id),
            ),
        )
        self.assertEqual(coach_portal.status_code, 403)
        self.assertEqual(coach_portal.json()['code'], 'portal_unavailable')

        other = self.client.get(TEACHER_ME_URL, **self._teacher_headers(access, sube=self.other_sube))
        self.assertEqual(other.status_code, 403)
        self.assertEqual(other.json()['code'], 'teacher_not_assigned')

        ok = self.client.get(TEACHER_ME_URL, **self._teacher_headers(access))
        self.assertEqual(ok.status_code, 200)
        body = ok.json()
        self.assertEqual(body['personel_id'], self.personel.id)
        self.assertEqual(body['permissions'], ['schedule.read', 'classes.read'])
        self.assertNotIn('communication.read', body['permissions'])

    def test_topics_write_follows_primary_plan_only(self):
        seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='12. Sınıf', kod='12M', aktif_mi=True,
        )
        ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MATM', aktif_mi=True,
        )
        sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year, ad='12-A', aktif_mi=True,
        )
        term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            name='Güz',
            code='GUZM',
            start_date=date(2025, 9, 1),
            end_date=date(2026, 1, 31),
            is_active=True,
        )
        plan = ClassLessonPlan.objects.create(
            egitim_yili=self.year,
            term=term,
            sinif=sinif,
            ders=ders,
            weekly_hours=4,
            ogretmen=self.personel,
        )
        del seviye
        access = self._token().json()['access']
        ok = self.client.get(TEACHER_ME_URL, **self._teacher_headers(access))
        self.assertIn('topics.write', ok.json()['permissions'])
        plan.ogretmen = None
        plan.save(update_fields=['ogretmen'])
        again = self.client.get(TEACHER_ME_URL, **self._teacher_headers(access))
        self.assertNotIn('topics.write', again.json()['permissions'])

    def test_removed_assignment_closes_teacher_me(self):
        access = self._token().json()['access']
        self.assignment.aktif_mi = False
        self.assignment.save(update_fields=['aktif_mi'])
        response = self.client.get(TEACHER_ME_URL, **self._teacher_headers(access))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'teacher_not_assigned')

    def test_coach_only_cannot_enter_teacher_portal(self):
        coach_user = User.objects.create_user(username='sadece.koc', password='Pass1234!')
        coach = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Kerem', soyad='Koç', user=coach_user, aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            personel=coach,
            egitim_yili=self.year,
            rol=self.coach_role,
            gorev_sube=self.sube,
            kurum=self.kurum,
            aktif_mi=True,
        )
        access = self._token(username='sadece.koc').json()['access']
        me = self.client.get(ME_URL, **self._auth(access))
        self.assertEqual(
            [item['code'] for item in me.json()['portals'] if item['enterable']],
            [],
        )
        response = self.client.get(TEACHER_ME_URL, **self._teacher_headers(access))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'teacher_not_assigned')

    def test_inactive_personel_cannot_take_a_token(self):
        self.personel.aktif_mi = False
        self.personel.save(update_fields=['aktif_mi'])
        response = self._token()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'forbidden')

    def test_expired_access_is_rejected(self):
        access = self._token().json()['access']
        with patch('django.core.signing.time.time', return_value=time.time() + 1000):
            response = self.client.get(ME_URL, **self._auth(access))
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['code'], 'unauthenticated')

    def test_login_is_rate_limited_without_logging_the_secret(self):
        for _ in range(10):
            failed = self._token(password='yanlis-sifre')
            self.assertEqual(failed.status_code, 401)
        blocked = self._token()
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json()['code'], 'rate_limited')
        logged = PersonelAktiviteLog.objects.filter(personel=self.personel)
        blob = ' '.join(logged.values_list('detay', flat=True))
        self.assertNotIn('Pass1234!', blob)
        self.assertNotIn('yanlis-sifre', blob)

    def test_context_lists_only_teacher_assignments(self):
        PersonelGorevlendirme.objects.create(
            personel=self.personel,
            egitim_yili=self.year,
            rol=self.coach_role,
            gorev_sube=self.other_sube,
            kurum=self.kurum,
            aktif_mi=True,
        )
        access = self._token().json()['access']
        response = self.client.get('/api/mobile/context/', **self._auth(access))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual([row['id'] for row in body['subeler']], [self.sube.id])
        self.assertEqual(body['yillar'][0]['ad'], '2025-2026')
        self.assertNotIn('email', json.dumps(body))

    def test_mobile_password_change_revokes_tokens_without_web_session(self):
        issued = self._token().json()
        response = self.client.post(
            '/api/mobile/auth/change-password/',
            data=json.dumps({
                'current_password': 'Pass1234!',
                'new_password': 'NewPass456!',
                'new_password_confirm': 'NewPass456!',
            }),
            content_type='application/json',
            **self._auth(issued['access']),
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['code'], 'ok')
        self.assertFalse(self.client.get('/auth/api/me/').json()['authenticated'])
        again = self.client.get('/api/mobile/me/', **self._auth(issued['access']))
        self.assertEqual(again.status_code, 401)

    @override_settings(MOBILE_IDENTITY_ENABLED=False)
    def test_flag_off_hides_the_endpoints(self):
        response = self._token()
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['code'], 'not_found')
