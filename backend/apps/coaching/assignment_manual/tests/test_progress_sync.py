from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import (
    AssignmentLesson,
    AssignmentTask,
    ManualAssignment,
)
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube
from apps.student_resources.models import StudentResourceAssignment

User = get_user_model()


class ProgressSyncTest(TestCase):
    """Manuel ödev tamamlanınca source_assignment progress_percent güncellenir."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sync Kurum', kod='SYN')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Veli',
            aktif_mi=True,
        )
        self.coach = User.objects.create_superuser(
            username='coach_sync',
            email='coach_sync@test.com',
            password='testpass123',
        )
        self.ders = Ders.objects.create(ad='Matematik', kod='MAT')
        self.sinif = SinifSeviyesi.objects.create(ad='10. Sınıf', kod='S10', sira=10)
        self.book_type = BookType.objects.create(kod='SB', ad='Soru Bankası')
        self.resource_book = ResourceBook.objects.create(
            ad='Mat Soru Bankası',
            kod='MSB001',
            kurum=self.kurum,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif,
            aktif_mi=True,
        )
        self.source = StudentResourceAssignment.objects.create(
            student=self.student,
            lesson=self.ders,
            resource_book=self.resource_book,
            coach=self.coach,
            progress_percent=0,
            status=StudentResourceAssignment.Status.ASSIGNED,
        )
        self.assignment = ManualAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            title='Kaynak Ödevi',
            status=ManualAssignment.Status.ASSIGNED,
            due_date=timezone.now() + timezone.timedelta(days=7),
            source_assignment=self.source,
        )
        self.lesson = AssignmentLesson.objects.create(
            assignment=self.assignment,
            order=0,
        )
        self.task_a = AssignmentTask.objects.create(
            lesson_block=self.lesson,
            task_type=AssignmentTask.TaskType.SOLVE_TEST,
            title='Görev A',
            question_count=20,
            order=0,
        )
        self.task_b = AssignmentTask.objects.create(
            lesson_block=self.lesson,
            task_type=AssignmentTask.TaskType.SOLVE_TEST,
            title='Görev B',
            question_count=30,
            order=1,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.coach)

    def test_completing_homework_updates_source_progress(self):
        response_a = self.client.post(
            f'/api/coaching/manual-assignments/tasks/{self.task_a.id}/update_task_status/',
            {'completion_status': 'DONE'},
            format='json',
        )
        self.assertEqual(response_a.status_code, 200)

        self.source.refresh_from_db()
        self.assertEqual(self.source.progress_percent, 50)
        self.assertEqual(self.source.status, StudentResourceAssignment.Status.IN_PROGRESS)

        response_b = self.client.post(
            f'/api/coaching/manual-assignments/tasks/{self.task_b.id}/update_task_status/',
            {'completion_status': 'DONE'},
            format='json',
        )
        self.assertEqual(response_b.status_code, 200)

        self.source.refresh_from_db()
        self.assertEqual(self.source.progress_percent, 100)
        self.assertEqual(self.source.status, StudentResourceAssignment.Status.COMPLETED)
        self.assertIsNotNone(self.source.completed_at)
