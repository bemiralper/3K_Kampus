from datetime import date, timedelta
import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.coaching.models import CoachProfile, CoachStudentAssignment, GorusmeKaydi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.personel.domain.models import Personel
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()

ME_STATS_URL = '/api/coaching/coaches/me/stats/'


class CoachMeStatsTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Stats Kurum', kod='STK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025,
            bitis_yil=2026,
            aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            ad='12-A',
            kod='12A',
            aktif_mi=True,
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Yılmaz',
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.student,
            sinif=self.sinif,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            okul_no='100',
            aktif_mi=True,
        )

        self.coach_user = User.objects.create_user(
            username='stats_coach',
            email='stats_coach@test.com',
            password='testpass123',
        )
        self.coach_personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
            soyad='Koç',
            tc_kimlik_no='22222222222',
            user=self.coach_user,
        )
        self.coach_profile = CoachProfile.objects.create(
            teacher=self.coach_personel,
            capacity=20,
            is_active=True,
            is_coach=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach_profile,
            student=self.student,
            start_date=date(2026, 1, 1),
            is_primary=True,
        )

        today = date.today()
        ManualAssignment.objects.create(
            coach=self.coach_user,
            student=self.student,
            title='Tamamlanan Ödev',
            due_date=timezone.now() + timedelta(days=3),
            assigned_date=timezone.now(),
            status=ManualAssignment.Status.COMPLETED,
            is_active=True,
        )
        ManualAssignment.objects.create(
            coach=self.coach_user,
            student=self.student,
            title='Geciken Ödev',
            due_date=timezone.now() - timedelta(days=2),
            assigned_date=timezone.now(),
            status=ManualAssignment.Status.OVERDUE,
            is_active=True,
        )

        GorusmeKaydi.objects.create(
            kurum=self.kurum,
            ogrenci=self.student,
            koc=self.coach_profile,
            olusturan=self.coach_user,
            gorusme_turu='ogrenci',
            gorusme_tarihi=today,
            durum='tamamlandi',
            yontem='yuz_yuze',
            konu='Öğrenci görüşmesi',
        )
        GorusmeKaydi.objects.create(
            kurum=self.kurum,
            ogrenci=self.student,
            koc=self.coach_profile,
            olusturan=self.coach_user,
            gorusme_turu='veli',
            gorusme_tarihi=today,
            durum='tamamlandi',
            yontem='telefon',
            konu='Veli görüşmesi',
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.coach_user)

    def test_me_stats_returns_coach_metrics(self):
        response = self.client.get(ME_STATS_URL)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body['success'])
        data = body['data']

        self.assertEqual(data['ogrenciler']['aktif_ogrenci'], 1)
        self.assertEqual(data['ogrenciler']['kapasite'], 20)
        self.assertEqual(data['odevler']['verilen']['toplam'], 2)
        self.assertEqual(data['odevler']['tamamlanan'], 1)
        self.assertEqual(data['odevler']['geciken'], 1)
        self.assertEqual(data['gorusmeler']['ogrenci']['toplam'], 1)
        self.assertEqual(data['gorusmeler']['veli']['toplam'], 1)
        self.assertEqual(data['gorusmeler']['tamamlanan_toplam'], 2)

    def test_me_stats_requires_coach_profile(self):
        plain_user = User.objects.create_user(username='plain', password='testpass123')
        client = APIClient()
        client.force_authenticate(user=plain_user)
        response = client.get(ME_STATS_URL)
        self.assertEqual(response.status_code, 404)


CHANGE_PASSWORD_URL = '/auth/api/change-password/'


class ChangePasswordApiTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='pw_user',
            email='pw_user@test.com',
            password='OldPass123!',
        )
        self.client = Client()
        self.client.force_login(self.user)

    def test_change_password_success(self):
        response = self.client.post(
            CHANGE_PASSWORD_URL,
            data=json.dumps({
                'current_password': 'OldPass123!',
                'new_password': 'NewPass456!',
                'new_password_confirm': 'NewPass456!',
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body['success'])
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewPass456!'))

    def test_change_password_wrong_current(self):
        response = self.client.post(
            CHANGE_PASSWORD_URL,
            data=json.dumps({
                'current_password': 'wrong',
                'new_password': 'NewPass456!',
                'new_password_confirm': 'NewPass456!',
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()['success'])
