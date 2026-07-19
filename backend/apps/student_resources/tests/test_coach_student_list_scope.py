"""Kaynak havuzu: koç yalnızca kendi öğrencilerini görür; düzenleme şube bağlamında çalışır."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube
from apps.student_resources.models import StudentResourceAssignment

User = get_user_model()

STUDENT_LIST_URL = '/api/student-resources/assignments/student_list/'
ASSIGNMENTS_URL = '/api/student-resources/assignments/'


class CoachStudentResourceScopeTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Havuz Scope Kurum', kod='HSK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='HSK-M')

        self.coach_user = User.objects.create_user(
            username='havuz.koc@test.local',
            password='test',
            is_staff=True,  # is_staff olsa bile koç kapsamı uygulanmalı
        )
        self.personel = Personel.objects.create(
            user=self.coach_user,
            kurum=self.kurum,
            sube=self.sube,
            ad='Koç',
            soyad='Test',
            tc_kimlik_no='22222222222',
        )
        self.coach_profile = CoachProfile.objects.create(
            teacher=self.personel,
            is_coach=True,
            is_active=True,
        )

        self.mine = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Benim', soyad='Ogrenci', aktif_mi=True,
        )
        self.other = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Baska', soyad='Ogrenci', aktif_mi=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach_profile,
            student=self.mine,
            start_date=timezone.now().date(),
        )

        self.ders = Ders.objects.create(
            sube=self.sube, kurum=self.kurum, ad='Matematik', kod='MAT-HSK',
        )
        self.sinif = SinifSeviyesi.objects.create(
            sube=self.sube, kurum=self.kurum, ad='11', kod='S11', sira=11,
        )
        self.book_type = BookType.objects.create(kod='SB_HSK', ad='Soru Bankası')
        self.book = ResourceBook.objects.create(
            sube=self.sube,
            kurum=self.kurum,
            ad='Test Kitap',
            kod='HSK-TK',
            ders=self.ders,
            sinif_seviyesi=self.sinif,
            book_type=self.book_type,
        )
        self.assignment = StudentResourceAssignment.objects.create(
            student=self.mine,
            resource_book=self.book,
            lesson=self.ders,
            coach=self.coach_user,
            assigned_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.coach_user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_student_list_only_assigned_students(self):
        res = self.client.get(STUDENT_LIST_URL, **self.headers)
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()['data']}
        self.assertIn(self.mine.id, ids)
        self.assertNotIn(self.other.id, ids)

    def test_student_list_requires_sube(self):
        res = self.client.get(
            STUDENT_LIST_URL,
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)

    def test_patch_and_delete_own_assignment(self):
        patch = self.client.patch(
            f'{ASSIGNMENTS_URL}{self.assignment.id}/',
            {'status': 'IN_PROGRESS', 'progress_percent': 40},
            format='json',
            **self.headers,
        )
        self.assertEqual(patch.status_code, 200, patch.content)
        self.assertTrue(patch.json().get('success'))

        delete = self.client.delete(
            f'{ASSIGNMENTS_URL}{self.assignment.id}/',
            **self.headers,
        )
        self.assertEqual(delete.status_code, 200, delete.content)
        self.assignment.refresh_from_db()
        self.assertFalse(self.assignment.is_active)
