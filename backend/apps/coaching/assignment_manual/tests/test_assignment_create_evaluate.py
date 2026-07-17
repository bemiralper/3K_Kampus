from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube

User = get_user_model()

ASSIGNMENTS_URL = '/api/coaching/manual-assignments/assignments/'


class AssignmentCreateEvaluateTest(TestCase):
    """Ödev oluşturma (nested lessons/tasks) ve görev değerlendirme API akışı."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Ödev Kurum', kod='ASG')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
            soyad='Kaya',
            aktif_mi=True,
        )
        self.coach = User.objects.create_superuser(
            username='coach_create',
            email='coach_create@test.com',
            password='testpass123',
        )
        self.ders = Ders.objects.create(ad='Matematik', kod='MAT')
        self.sinif = SinifSeviyesi.objects.create(ad='12. Sınıf', kod='S12', sira=12)
        self.book_type = BookType.objects.create(kod='SB_ASG', ad='Soru Bankası')
        self.resource_book = ResourceBook.objects.create(
            sube=self.sube,
            ad='Mat Soru Bankası',
            kod='MSB-ASG',
            kurum=self.kurum,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif,
            aktif_mi=True,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.coach)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)

        self.due_date = (timezone.now() + timezone.timedelta(days=5)).isoformat()

    def _create_assignment_payload(self):
        return {
            'student': self.student.id,
            'title': 'Haftalık Matematik Ödevi',
            'description': 'Trigonometri testleri',
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
                            'title': 'Trigonometri Test 1',
                            'question_count': 20,
                            'page_count': 10,
                            'order': 0,
                        },
                        {
                            'task_type': 'SOLVE_TEST',
                            'title': 'Trigonometri Test 2',
                            'question_count': 15,
                            'page_count': 8,
                            'order': 1,
                        },
                    ],
                },
            ],
        }

    def _update_task_status(self, task_id, **payload):
        return self.client.post(
            f'/api/coaching/manual-assignments/tasks/{task_id}/update_task_status/',
            payload,
            format='json',
        )

    def test_create_assignment_with_nested_lessons_and_tasks(self):
        response = self.client.post(
            ASSIGNMENTS_URL,
            self._create_assignment_payload(),
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['success'])
        data = response.data['data']
        self.assertEqual(data['title'], 'Haftalık Matematik Ödevi')
        self.assertEqual(data['student'], self.student.id)
        self.assertEqual(len(data['lessons']), 1)
        self.assertEqual(len(data['lessons'][0]['tasks']), 2)
        self.assertEqual(data['lessons'][0]['resource_book_name'], 'Mat Soru Bankası')
        self.assertEqual(data['completion_percent'], 0)

        assignment = ManualAssignment.objects.get(pk=data['id'])
        self.assertEqual(assignment.coach, self.coach)
        self.assertEqual(assignment.lessons.count(), 1)
        self.assertEqual(assignment.lessons.first().tasks.count(), 2)

    def test_evaluate_all_tasks_reaches_full_completion(self):
        create_response = self.client.post(
            ASSIGNMENTS_URL,
            self._create_assignment_payload(),
            format='json',
        )
        self.assertEqual(create_response.status_code, 201)

        assignment_id = create_response.data['data']['id']
        task_ids = [
            task['id']
            for task in create_response.data['data']['lessons'][0]['tasks']
        ]

        for task_id in task_ids:
            status_response = self._update_task_status(task_id, completion_status='DONE')
            self.assertEqual(status_response.status_code, 200)
            self.assertEqual(status_response.data['data']['completion_status'], 'DONE')
            self.assertEqual(status_response.data['data']['task_completion_percent'], 100)

        detail_response = self.client.get(f'{ASSIGNMENTS_URL}{assignment_id}/')
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.data['completion_percent'], 100)

        assignment = ManualAssignment.objects.get(pk=assignment_id)
        self.assertEqual(assignment.completion_percent, 100)
