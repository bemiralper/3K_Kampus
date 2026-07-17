"""Ödev Kontrol v2: görev sıfırlama ve silme arşivi testleri."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import (
    AssignmentTask,
    ManualAssignment,
)
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube

User = get_user_model()

ASSIGNMENTS_URL = '/api/coaching/manual-assignments/assignments/'


class TaskResetAndDeleteArchiveTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kontrol Kurum', kod='KTR')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Veli',
            aktif_mi=True,
        )
        self.admin = User.objects.create_superuser(
            username='admin_kontrol',
            email='admin_kontrol@test.com',
            password='testpass123',
        )
        self.coach = User.objects.create_user(
            username='coach_kontrol',
            email='coach_kontrol@test.com',
            password='testpass123',
        )
        self.ders = Ders.objects.create(ad='Fizik', kod='FIZ')
        self.sinif = SinifSeviyesi.objects.create(ad='11. Sınıf', kod='S11', sira=11)
        self.book_type = BookType.objects.create(kod='SB_KTR', ad='Soru Bankası')
        self.resource_book = ResourceBook.objects.create(
            sube=self.sube,
            ad='Fiz Soru Bankası',
            kod='FSB-KTR',
            kurum=self.kurum,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif,
            aktif_mi=True,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)

        self.due_date = (timezone.now() + timezone.timedelta(days=5)).isoformat()

    def _create_assignment(self):
        payload = {
            'student': self.student.id,
            'title': 'Kontrol Ödevi',
            'description': 'Test',
            'status': 'ASSIGNED',
            'due_date': self.due_date,
            'lessons': [
                {
                    'order': 0,
                    'lesson': self.ders.id,
                    'resource_book': self.resource_book.id,
                    'tasks': [
                        {
                            'task_type': 'SOLVE_TEST',
                            'title': 'Görev 1',
                            'question_count': 10,
                            'order': 0,
                        },
                        {
                            'task_type': 'SOLVE_TEST',
                            'title': 'Görev 2',
                            'question_count': 8,
                            'order': 1,
                        },
                    ],
                },
            ],
        }
        response = self.client.post(ASSIGNMENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 201)
        return response.data['data']

    def _task_url(self, task_id, action):
        return f'/api/coaching/manual-assignments/tasks/{task_id}/{action}/'

    def test_reset_task_status_clears_evaluation_and_reverts_assignment(self):
        data = self._create_assignment()
        assignment_id = data['id']
        task_ids = [t['id'] for t in data['lessons'][0]['tasks']]

        for task_id in task_ids:
            done = self.client.post(
                self._task_url(task_id, 'update_task_status'),
                {'completion_status': 'DONE'},
                format='json',
            )
            self.assertEqual(done.status_code, 200)

        assignment = ManualAssignment.objects.get(pk=assignment_id)
        self.assertEqual(assignment.status, ManualAssignment.Status.COMPLETED)
        self.assertIsNotNone(assignment.completed_date)

        reset = self.client.post(self._task_url(task_ids[0], 'reset_task_status'), {}, format='json')
        self.assertEqual(reset.status_code, 200)
        self.assertEqual(reset.data['data']['completion_status'], 'PENDING')
        self.assertEqual(reset.data['data']['task_completion_percent'], 0)
        self.assertIsNone(reset.data['data']['evaluated_at'])
        self.assertIsNone(reset.data['data']['completed_at'])

        task = AssignmentTask.objects.get(pk=task_ids[0])
        self.assertEqual(task.status, AssignmentTask.TaskStatus.NOT_STARTED)
        self.assertEqual(task.completed_question_count, 0)
        self.assertEqual(task.completed_page_count, 0)

        assignment.refresh_from_db()
        self.assertEqual(assignment.status, ManualAssignment.Status.IN_PROGRESS)
        self.assertIsNone(assignment.completed_date)

    def test_reset_pending_task_returns_error(self):
        data = self._create_assignment()
        task_id = data['lessons'][0]['tasks'][0]['id']
        response = self.client.post(self._task_url(task_id, 'reset_task_status'), {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_destroy_requires_deletion_reason(self):
        data = self._create_assignment()
        assignment_id = data['id']

        short = self.client.delete(f'{ASSIGNMENTS_URL}{assignment_id}/', {'deletion_reason': 'kısa'}, format='json')
        self.assertEqual(short.status_code, 400)

        ok = self.client.delete(
            f'{ASSIGNMENTS_URL}{assignment_id}/',
            {'deletion_reason': 'Yanlış öğrenciye atanmış, yeniden oluşturulacak.'},
            format='json',
        )
        self.assertEqual(ok.status_code, 200)

        assignment = ManualAssignment.objects.get(pk=assignment_id)
        self.assertFalse(assignment.is_active)
        self.assertIsNotNone(assignment.deleted_at)
        self.assertEqual(assignment.deleted_by, self.admin)
        self.assertIn('Yanlış öğrenciye', assignment.deletion_reason)

    def test_deleted_assignments_admin_only(self):
        data = self._create_assignment()
        assignment_id = data['id']
        self.client.delete(
            f'{ASSIGNMENTS_URL}{assignment_id}/',
            {'deletion_reason': 'Test amaçlı silme kaydı oluşturuldu.'},
            format='json',
        )

        coach_client = APIClient()
        coach_client.force_authenticate(user=self.coach)
        coach_client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        forbidden = coach_client.get(f'{ASSIGNMENTS_URL}deleted_assignments/')
        self.assertEqual(forbidden.status_code, 403)

        listing = self.client.get(f'{ASSIGNMENTS_URL}deleted_assignments/')
        self.assertEqual(listing.status_code, 200)
        self.assertTrue(listing.data['success'])
        self.assertEqual(listing.data['count'], 1)
        row = listing.data['data'][0]
        self.assertEqual(row['id'], assignment_id)
        self.assertEqual(row['title'], 'Kontrol Ödevi')
        self.assertEqual(row['student_name'], 'Ali Veli')
        self.assertIn('Test amaçlı', row['deletion_reason'])

    def test_update_evaluation_note_on_pending_task(self):
        data = self._create_assignment()
        task_id = data['lessons'][0]['tasks'][0]['id']

        response = self.client.post(
            self._task_url(task_id, 'evaluation_note'),
            {'coach_evaluation_note': 'İyi çalışmış'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['data']['coach_evaluation_note'], 'İyi çalışmış')
        self.assertEqual(response.data['data']['completion_status'], 'PENDING')

        task = AssignmentTask.objects.get(pk=task_id)
        self.assertEqual(task.coach_evaluation_note, 'İyi çalışmış')
        self.assertEqual(task.completion_status, 'PENDING')

        cleared = self.client.patch(
            self._task_url(task_id, 'evaluation_note'),
            {'coach_evaluation_note': ''},
            format='json',
        )
        self.assertEqual(cleared.status_code, 200)
        task.refresh_from_db()
        self.assertEqual(task.coach_evaluation_note, '')

    def test_reset_all_tasks(self):
        data = self._create_assignment()
        assignment_id = data['id']
        task_ids = [t['id'] for t in data['lessons'][0]['tasks']]

        for task_id in task_ids:
            done = self.client.post(
                self._task_url(task_id, 'update_task_status'),
                {'completion_status': 'DONE'},
                format='json',
            )
            self.assertEqual(done.status_code, 200)

        assignment = ManualAssignment.objects.get(pk=assignment_id)
        self.assertEqual(assignment.status, ManualAssignment.Status.COMPLETED)

        mark_all = self.client.post(
            f'{ASSIGNMENTS_URL}{assignment_id}/mark_all_not_done/',
            {'reason': 'NOT_BROUGHT', 'note': 'Getirmedi'},
            format='json',
        )
        self.assertEqual(mark_all.status_code, 200)

        assignment.refresh_from_db()
        self.assertEqual(assignment.non_submission_reason, 'NOT_BROUGHT')
        self.assertEqual(assignment.non_submission_note, 'Getirmedi')

        reset_all = self.client.post(
            f'{ASSIGNMENTS_URL}{assignment_id}/reset_all_tasks/',
            {},
            format='json',
        )
        self.assertEqual(reset_all.status_code, 200)
        self.assertTrue(reset_all.data['success'])
        self.assertEqual(reset_all.data['reset_count'], 2)

        for task_id in task_ids:
            task = AssignmentTask.objects.get(pk=task_id)
            self.assertEqual(task.completion_status, 'PENDING')
            self.assertEqual(task.task_completion_percent, 0)

        assignment.refresh_from_db()
        self.assertEqual(assignment.non_submission_reason, '')
        self.assertEqual(assignment.non_submission_note, '')
        self.assertEqual(assignment.status, ManualAssignment.Status.ASSIGNED)
        self.assertIsNone(assignment.completed_date)
