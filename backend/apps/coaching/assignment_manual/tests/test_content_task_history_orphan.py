"""content SET_NULL sonrası Ödev Ver geçmişinin YAPILDI göstermesi."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.content_resolve import (
    remap_orphan_assignment_contents,
    resolve_content_for_orphan_task,
)
from apps.coaching.assignment_manual.models import (
    AssignmentLesson,
    AssignmentTask,
    ManualAssignment,
)
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.models import (
    BookType,
    ResourceBook,
    ResourceContent,
    ResourceTopic,
    ResourceUnit,
)
from apps.sube.domain.models import Sube

User = get_user_model()

HISTORY_URL = '/api/coaching/manual-assignments/assignments/content_task_history/'


class ContentTaskHistoryOrphanTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Hist Kurum', kod='HST')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Veli', aktif_mi=True,
        )
        self.coach = User.objects.create_superuser(
            username='hist_coach', email='hist@test.com', password='testpass123',
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Biyoloji', kod='BIO',
        )
        self.sinif = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mezun', kod='MZN', sira=13,
        )
        self.book_type = BookType.objects.create(kod='SB_H', ad='Soru Bankası')
        self.book = ResourceBook.objects.create(
            sube=self.sube, ad='Biyotik TYT', kod='BIO-TYT',
            kurum=self.kurum, book_type=self.book_type, ders=self.ders,
            sinif_seviyesi=self.sinif, aktif_mi=True,
        )
        self.unit = ResourceUnit.objects.create(book=self.book, ad='Ünite 1', kod='U1', sira=1)
        self.topic = ResourceTopic.objects.create(
            unit=self.unit, ad='▶ Yaşam Bilmi Biyoloji', kod='T1', sira=1,
        )
        self.content = ResourceContent.objects.create(
            topic=self.topic, ad='Analiz-11', content_type='TEST_SET',
            sira=11, question_count=9, aktif_mi=True,
        )

        self.assignment = ManualAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            title='Biyoloji ödev',
            status=ManualAssignment.Status.COMPLETED,
            due_date=timezone.now() + timezone.timedelta(days=1),
            is_active=True,
        )
        self.lesson = AssignmentLesson.objects.create(
            assignment=self.assignment,
            lesson=self.ders,
            resource_book=self.book,
            topic_name='Yaşam Bilmi Biyoloji',
            order=0,
        )
        # Eski içerik silinmiş gibi — title Test-11, content null, DONE
        self.task = AssignmentTask.objects.create(
            lesson_block=self.lesson,
            content=None,
            task_type=AssignmentTask.TaskType.SOLVE_TEST,
            title='Test-11',
            question_count=9,
            order=0,
            completion_status=AssignmentTask.CompletionStatus.DONE,
            task_completion_percent=100,
            evaluated_at=timezone.now(),
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.coach)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_resolve_maps_test_n_to_analiz_n(self):
        resolved = resolve_content_for_orphan_task(self.task)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.id, self.content.id)

    def test_history_shows_done_for_remapped_content(self):
        response = self.client.get(HISTORY_URL, {'student_id': self.student.id})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        row = response.data['data'].get(str(self.content.id)) or response.data['data'].get(self.content.id)
        self.assertIsNotNone(row)
        self.assertEqual(row['completion_status'], 'DONE')

    def test_remap_command_persists_fk(self):
        result = remap_orphan_assignment_contents(book_id=self.book.id, dry_run=False)
        self.assertEqual(result['remapped'], 1)
        self.task.refresh_from_db()
        self.assertEqual(self.task.content_id, self.content.id)
