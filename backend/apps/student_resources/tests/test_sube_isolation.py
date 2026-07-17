"""
Şube zorunluluğu — öğrenci kaynak havuzu endpoint'leri.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube
from apps.student_resources.models import StudentResourceAssignment

User = get_user_model()

ASSIGNMENTS_URL = '/api/student-resources/assignments/'


class StudentResourcesSubeIsolationAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Kaynak Iso Kurum', kod='RISO')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='RISO-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='RISO-B')
        self.user = User.objects.create_user(username='kaynakiso', password='test', is_staff=True)
        self.client.force_authenticate(user=self.user)
        self.ders = Ders.objects.create(
            sube=self.sube_a,
            kurum=self.kurum, ad='Matematik', kod='MAT')
        self.sinif_seviyesi = SinifSeviyesi.objects.create(
            sube=self.sube_a,
            kurum=self.kurum, ad='10. Sınıf', kod='S10', sira=10)
        self.book_type = BookType.objects.create(kod='SORU_BANKASI', ad='Soru Bankası')

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
        self.book = ResourceBook.objects.create(
            sube=self.sube_a,
            kurum=self.kurum,
            ad='Test Kitap',
            kod='TK-1',
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi,
            book_type=self.book_type,
        )
        self.assignment_a = StudentResourceAssignment.objects.create(
            student=self.student_a,
            resource_book=self.book,
            lesson=self.ders,
            coach=self.user,
            assigned_at=timezone.now(),
        )
        self.assignment_b = StudentResourceAssignment.objects.create(
            student=self.student_b,
            resource_book=self.book,
            lesson=self.ders,
            coach=self.user,
            assigned_at=timezone.now(),
        )

    def test_assignment_list_requires_sube_context(self):
        res = self.client.get(
            ASSIGNMENTS_URL,
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)

    def test_assignment_list_scoped_to_active_sube(self):
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
