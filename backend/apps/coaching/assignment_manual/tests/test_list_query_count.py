"""
Ödev Kontrol liste endpoint'i için N+1 sorgu regresyon testi.

`ManualAssignmentListSerializer` içindeki lesson/task sayaçları (`lesson_count`,
`task_count`, `pending_task_count`, `evaluated_task_count`, `is_control_locked`)
önceden her satır için ayrı DB sorguları çalıştırıyordu (satır sayısı arttıkça
sorgu sayısı da artıyordu — klasik N+1). Artık `get_queryset()`'teki
`prefetch_related` cache'i kullanılıyor; bu test satır sayısı 1'den 6'ya
çıkarken toplam sorgu sayısının SABİT kalmasını (artmamasını) doğrular.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import (
    AssignmentLesson,
    AssignmentTask,
    ManualAssignment,
)
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()

ASSIGNMENTS_URL = '/api/coaching/manual-assignments/assignments/'


class AssignmentListQueryCountTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sorgu Kurum', kod='SRG')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.coach = User.objects.create_superuser(
            username='coach_query', email='coach_query@test.com', password='testpass123',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.coach)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Yılmaz', aktif_mi=True,
        )

    def _create_assignment_with_tasks(self, title, n_lessons=2, n_tasks_per_lesson=2):
        assignment = ManualAssignment.objects.create(
            coach=self.coach, student=self.student, title=title,
            due_date=timezone.now() + timezone.timedelta(days=3),
            status=ManualAssignment.Status.ASSIGNED, is_active=True,
        )
        for li in range(n_lessons):
            lesson = AssignmentLesson.objects.create(assignment=assignment, order=li)
            for ti in range(n_tasks_per_lesson):
                AssignmentTask.objects.create(
                    lesson_block=lesson,
                    task_type=AssignmentTask.TaskType.SOLVE_TEST,
                    title=f'Görev {li}-{ti}',
                    order=ti,
                    completion_status=(
                        AssignmentTask.CompletionStatus.DONE if ti == 0
                        else AssignmentTask.CompletionStatus.PENDING
                    ),
                )
        return assignment

    def _query_count_for_list(self):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(ASSIGNMENTS_URL)
        self.assertEqual(response.status_code, 200)
        return len(ctx.captured_queries), response

    def test_query_count_does_not_grow_with_row_count(self):
        self._create_assignment_with_tasks('Ödev 1')
        queries_for_one, response_one = self._query_count_for_list()
        self.assertEqual(len(response_one.data['data']), 1)

        for i in range(2, 7):
            self._create_assignment_with_tasks(f'Ödev {i}')

        queries_for_six, response_six = self._query_count_for_list()
        self.assertEqual(len(response_six.data['data']), 6)

        # Sorgu sayısı satır sayısından (yaklaşık olarak) bağımsız kalmalı —
        # N+1 varsa 5 ekstra satır başına en az 5*4=20 ekstra sorgu eklerdi.
        # Küçük sabit farklara (örn. count/pagination) tolerans veriyoruz.
        self.assertLessEqual(
            queries_for_six, queries_for_one + 3,
            f"Satır sayısı 1'den 6'ya çıkınca sorgu sayısı {queries_for_one} -> "
            f"{queries_for_six} oldu; N+1 regresyonu şüphesi.",
        )

    def test_computed_fields_match_prefetched_data(self):
        assignment = self._create_assignment_with_tasks('Ödev Detay', n_lessons=2, n_tasks_per_lesson=2)
        response = self.client.get(ASSIGNMENTS_URL)
        row = next(r for r in response.data['data'] if r['id'] == assignment.id)
        self.assertEqual(row['lesson_count'], 2)
        self.assertEqual(row['task_count'], 4)
        self.assertEqual(row['pending_task_count'], 2)
        self.assertEqual(row['evaluated_task_count'], 2)
