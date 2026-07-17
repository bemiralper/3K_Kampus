from datetime import date

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
from apps.student_resources.serializers import StudentResourceAssignmentWriteSerializer

User = get_user_model()


class StudentResourceAssignmentSoftDeleteTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='SR001')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Veli',
            aktif_mi=True,
        )
        self.sinif_seviyesi = SinifSeviyesi.objects.create(
            sube=self.sube,
            kurum=self.kurum,
            ad='9. Sınıf',
            kod='S9',
            sira=9,
        )
        self.ders = Ders.objects.create(
            sube=self.sube,
            kurum=self.kurum, ad='Matematik', kod='MAT')
        self.book_type, _ = BookType.objects.get_or_create(
            kod='TEST_BOOK',
            defaults={'ad': 'Test Kitabı'},
        )
        self.resource_book = ResourceBook.objects.create(
            sube=self.sube,
            ad='Test Kaynak',
            kod='TK001',
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi,
            kurum=self.kurum,
            aktif_mi=True,
        )
        self.admin = User.objects.create_superuser(
            username='admin',
            email='admin@test.com',
            password='testpass123',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def _create_assignment(self, **kwargs):
        defaults = {
            'student': self.student,
            'lesson': self.ders,
            'resource_book': self.resource_book,
        }
        defaults.update(kwargs)
        return StudentResourceAssignment.objects.create(**defaults)

    def test_soft_delete_allows_reassignment(self):
        assignment = self._create_assignment(
            status=StudentResourceAssignment.Status.COMPLETED,
            progress_percent=100,
            notes='Eski not',
        )
        assignment.is_active = False
        assignment.deleted_at = timezone.now()
        assignment.save()

        serializer = StudentResourceAssignmentWriteSerializer(data={
            'student': self.student.id,
            'lesson': self.ders.id,
            'resource_book': self.resource_book.id,
            'notes': 'Yeni atama',
            'due_date': '2026-03-01',
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        reactivated = serializer.save(coach=self.admin)

        self.assertEqual(reactivated.id, assignment.id)
        self.assertTrue(reactivated.is_active)
        self.assertIsNone(reactivated.deleted_at)
        self.assertEqual(reactivated.status, StudentResourceAssignment.Status.ASSIGNED)
        self.assertEqual(reactivated.progress_percent, 0)
        self.assertEqual(reactivated.notes, 'Yeni atama')
        self.assertEqual(
            StudentResourceAssignment.objects.filter(
                student=self.student,
                resource_book=self.resource_book,
            ).count(),
            1,
        )

    def test_active_duplicate_still_blocked(self):
        self._create_assignment()

        serializer = StudentResourceAssignmentWriteSerializer(data={
            'student': self.student.id,
            'lesson': self.ders.id,
            'resource_book': self.resource_book.id,
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('resource_book', serializer.errors)

    def test_bulk_assign_reactivates_inactive(self):
        assignment = self._create_assignment(
            status=StudentResourceAssignment.Status.IN_PROGRESS,
            progress_percent=50,
            notes='Silinen atama',
        )
        assignment.is_active = False
        assignment.deleted_at = timezone.now()
        assignment.save()

        response = self.client.post(
            '/api/student-resources/assignments/bulk_assign/',
            {
                'student_ids': [self.student.id],
                'resource_book_ids': [self.resource_book.id],
                'due_date': '2026-04-01',
                'notes': 'Toplu yeniden atama',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['data']['created'], 1)
        self.assertEqual(response.data['data']['skipped'], 0)

        assignment.refresh_from_db()
        self.assertTrue(assignment.is_active)
        self.assertIsNone(assignment.deleted_at)
        self.assertEqual(assignment.status, StudentResourceAssignment.Status.ASSIGNED)
        self.assertEqual(assignment.progress_percent, 0)
        self.assertEqual(assignment.notes, 'Toplu yeniden atama')
        self.assertEqual(assignment.due_date, date(2026, 4, 1))
