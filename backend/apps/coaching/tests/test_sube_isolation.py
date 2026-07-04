"""
Şube zorunluluğu — koçluk modülü endpoint'leri.
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.models import CoachProfile, CoachStudentAssignment, GorusmeKaydi
from apps.coaching.study_program.models import WeeklyProgram
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube

User = get_user_model()

ASSIGNMENTS_URL = '/api/coaching/assignments/'
STUDENTS_URL = '/api/coaching/students/'
GORUSME_URL = '/api/coaching/gorusmeler/'
PROGRAMS_URL = '/api/coaching/study-program/programs/'


class CoachingSubeIsolationAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Koç Iso Kurum', kod='KISO')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='KISO-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='KISO-B')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025,
            bitis_yil=2026,
            aktif_mi=True,
        )
        self.user = User.objects.create_user(username='kociso', password='test')
        self.client.force_authenticate(user=self.user)

        self.student_a = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Ali',
            soyad='A',
            aktif_mi=True,
        )
        self.student_b = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            ad='Veli',
            soyad='B',
            aktif_mi=True,
        )
        personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Koç',
            soyad='Test',
            tc_kimlik_no='11111111111',
            aktif_mi=True,
        )
        self.coach = CoachProfile.objects.create(teacher=personel, capacity=20)

        self.assignment_a = CoachStudentAssignment.objects.create(
            coach=self.coach,
            student=self.student_a,
            start_date=date.today(),
            is_primary=True,
        )
        self.assignment_b = CoachStudentAssignment.objects.create(
            coach=self.coach,
            student=self.student_b,
            start_date=date.today(),
            is_primary=True,
        )

    def test_assignments_list_requires_sube_context(self):
        res = self.client.get(
            ASSIGNMENTS_URL,
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)

    def test_assignments_list_scoped_to_active_sube(self):
        res = self.client.get(
            ASSIGNMENTS_URL,
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()['data']}
        self.assertIn(self.assignment_a.id, ids)
        self.assertNotIn(self.assignment_b.id, ids)

    def test_assignment_detail_forbidden_wrong_sube(self):
        res = self.client.get(
            f'{ASSIGNMENTS_URL}{self.assignment_b.id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 403)

    def test_students_list_requires_sube_context(self):
        res = self.client.get(
            STUDENTS_URL,
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)

    def test_gorusme_list_scoped_to_active_sube(self):
        gorusme_a = GorusmeKaydi.objects.create(
            kurum_id=self.kurum.id,
            ogrenci=self.student_a,
            koc=self.coach,
            gorusme_turu='ogrenci',
            konu='A görüşmesi',
            gorusme_tarihi=date.today(),
            olusturan=self.user,
        )
        GorusmeKaydi.objects.create(
            kurum_id=self.kurum.id,
            ogrenci=self.student_b,
            koc=self.coach,
            gorusme_turu='ogrenci',
            konu='B görüşmesi',
            gorusme_tarihi=date.today(),
            olusturan=self.user,
        )

        res = self.client.get(
            GORUSME_URL,
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()}
        self.assertIn(gorusme_a.id, ids)
        self.assertEqual(len(ids), 1)

    def test_study_program_list_scoped_to_active_sube(self):
        program_a = WeeklyProgram.objects.create(
            student=self.student_a,
            coach=self.user,
            week_start=date(2026, 3, 2),
            week_end=date(2026, 3, 8),
        )
        WeeklyProgram.objects.create(
            student=self.student_b,
            coach=self.user,
            week_start=date(2026, 3, 2),
            week_end=date(2026, 3, 8),
        )

        res = self.client.get(
            PROGRAMS_URL,
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()}
        self.assertIn(program_a.id, ids)
        self.assertEqual(len(ids), 1)
