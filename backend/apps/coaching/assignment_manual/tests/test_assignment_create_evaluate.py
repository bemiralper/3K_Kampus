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
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MAT',
        )
        self.sinif = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='12. Sınıf', kod='S12', sira=12,
        )
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
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

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

        self.assertEqual(response.status_code, 201, response.data)
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

    def test_create_rejects_missing_resource_content(self):
        """Silinmiş content_id ile 500 yerine 400 + anlaşılır mesaj."""
        payload = self._create_assignment_payload()
        payload['lessons'][0]['tasks'][0]['content_id'] = 3434
        payload['lessons'][0]['tasks'][0]['title'] = 'Silinmiş Test'

        before = ManualAssignment.objects.count()
        response = self.client.post(ASSIGNMENTS_URL, payload, format='json')

        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(ManualAssignment.objects.count(), before)
        err = response.data
        # DRF ValidationError: {lessons: [...]} veya success envelope
        text = str(err)
        self.assertIn('3434', text)
        self.assertTrue(
            'içerik' in text.lower() or 'content' in text.lower() or 'lessons' in err,
        )

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

    def test_update_task_status_blocked_for_other_kurum(self):
        """Başka kurumun görev ID'si ile kontrol yapılamaz."""
        from apps.coaching.assignment_manual.models import AssignmentLesson, AssignmentTask

        other_kurum = Kurum.objects.create(ad='Diğer Kurum', kod='ASG2')
        other_sube = Sube.objects.create(kurum=other_kurum, ad='Diğer', kod='DGR')
        other_student = Ogrenci.objects.create(
            kurum=other_kurum, sube=other_sube, ad='Ayşe', soyad='Demir', aktif_mi=True,
        )
        other_assignment = ManualAssignment.objects.create(
            coach=self.coach,
            student=other_student,
            title='Yabancı Kurum Ödevi',
            status=ManualAssignment.Status.ASSIGNED,
            due_date=timezone.now() + timezone.timedelta(days=3),
        )
        other_lesson = AssignmentLesson.objects.create(
            assignment=other_assignment, topic_name='Yabancı', order=0,
        )
        other_task = AssignmentTask.objects.create(
            lesson_block=other_lesson,
            task_type=AssignmentTask.TaskType.SOLVE_TEST,
            title='Yabancı Görev',
            question_count=10,
        )

        response = self._update_task_status(other_task.id, completion_status='DONE')
        self.assertIn(response.status_code, (403, 404))
        other_task.refresh_from_db()
        self.assertEqual(other_task.completion_status, AssignmentTask.CompletionStatus.PENDING)

        preview = self.client.get(
            f'{ASSIGNMENTS_URL}{other_assignment.id}/notify-preview/?type=plan',
        )
        self.assertIn(preview.status_code, (403, 404))

    def test_create_persists_k3_mode_on_lesson(self):
        payload = self._create_assignment_payload()
        payload['lessons'][0]['k3_mode'] = 'OGREN'
        payload['lessons'][0]['k3_target_minutes'] = 25
        payload['lessons'][0]['topic_name'] = 'Problemler'

        response = self.client.post(ASSIGNMENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        lesson = response.data['data']['lessons'][0]
        self.assertEqual(lesson['k3_mode'], 'OGREN')
        self.assertEqual(lesson['k3_mode_display'], 'ÖĞREN')
        self.assertIsNone(lesson['k3_target_minutes'])

        block = ManualAssignment.objects.get(pk=response.data['data']['id']).lessons.first()
        self.assertEqual(block.k3_mode, 'OGREN')
        self.assertIsNone(block.k3_target_minutes)

    def test_create_hizlan_keeps_target_minutes(self):
        payload = self._create_assignment_payload()
        payload['lessons'][0]['k3_mode'] = 'HIZLAN'
        payload['lessons'][0]['k3_target_minutes'] = 25

        response = self.client.post(ASSIGNMENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        lesson = response.data['data']['lessons'][0]
        self.assertEqual(lesson['k3_mode'], 'HIZLAN')
        self.assertEqual(lesson['k3_target_minutes'], 25)

    def test_create_rejects_invalid_k3_mode(self):
        payload = self._create_assignment_payload()
        payload['lessons'][0]['k3_mode'] = 'FOO'
        before = ManualAssignment.objects.count()
        response = self.client.post(ASSIGNMENTS_URL, payload, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(ManualAssignment.objects.count(), before)
        self.assertIn('3K', str(response.data))

    def test_draft_update_replaces_lessons(self):
        payload = self._create_assignment_payload()
        payload['status'] = 'DRAFT'
        created = self.client.post(ASSIGNMENTS_URL, payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        assignment_id = created.data['data']['id']
        self.assertEqual(len(created.data['data']['lessons'][0]['tasks']), 2)

        payload['title'] = 'Güncel Taslak'
        payload['lessons'] = [
            {
                'order': 0,
                'lesson': self.ders.id,
                'resource_book': self.resource_book.id,
                'topic_name': 'Türev',
                'k3_mode': 'PEKISTIR',
                'tasks': [
                    {
                        'task_type': 'SOLVE_TEST',
                        'title': 'Türev Test 1',
                        'question_count': 12,
                        'page_count': 4,
                        'order': 0,
                    },
                ],
            },
        ]
        response = self.client.put(
            f'{ASSIGNMENTS_URL}{assignment_id}/',
            payload,
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data['data']
        self.assertEqual(data['title'], 'Güncel Taslak')
        self.assertEqual(data['status'], 'DRAFT')
        self.assertEqual(len(data['lessons']), 1)
        self.assertEqual(len(data['lessons'][0]['tasks']), 1)
        self.assertEqual(data['lessons'][0]['tasks'][0]['title'], 'Türev Test 1')
        self.assertEqual(data['lessons'][0]['k3_mode'], 'PEKISTIR')

        assignment = ManualAssignment.objects.get(pk=assignment_id)
        self.assertEqual(assignment.lessons.count(), 1)
        self.assertEqual(assignment.lessons.first().tasks.count(), 1)

    def test_assigned_update_rejects_lesson_replace(self):
        payload = self._create_assignment_payload()
        created = self.client.post(ASSIGNMENTS_URL, payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        assignment_id = created.data['data']['id']

        payload['lessons'][0]['tasks'] = [
            {
                'task_type': 'SOLVE_TEST',
                'title': 'Değiştirilemez',
                'question_count': 5,
                'order': 0,
            },
        ]
        response = self.client.put(
            f'{ASSIGNMENTS_URL}{assignment_id}/',
            payload,
            format='json',
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('taslak', str(response.data).lower())
        assignment = ManualAssignment.objects.get(pk=assignment_id)
        self.assertEqual(assignment.lessons.first().tasks.count(), 2)

    def test_assigned_patch_title_without_lessons(self):
        payload = self._create_assignment_payload()
        created = self.client.post(ASSIGNMENTS_URL, payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        assignment_id = created.data['data']['id']

        response = self.client.patch(
            f'{ASSIGNMENTS_URL}{assignment_id}/',
            {'title': 'Yalnızca başlık'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['title'], 'Yalnızca başlık')
        self.assertEqual(len(response.data['data']['lessons'][0]['tasks']), 2)
