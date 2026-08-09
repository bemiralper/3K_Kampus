from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()

ASSIGNMENTS_URL = '/api/coaching/manual-assignments/assignments/'
STATS_URL = '/api/coaching/manual-assignments/assignments/stats/'


class AssignmentListSearchPaginationTest(TestCase):
    """Ödev Kontrol listesi — arama (`q`), sayfalama ve `stats` özeti."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Liste Kurum', kod='LST')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.coach = User.objects.create_superuser(
            username='coach_list',
            email='coach_list@test.com',
            password='testpass123',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.coach)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

        self.ayse = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Yılmaz', aktif_mi=True,
        )
        self.mehmet = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mehmet', soyad='Demir', aktif_mi=True,
        )
        due = timezone.now() + timezone.timedelta(days=3)
        for i in range(3):
            ManualAssignment.objects.create(
                coach=self.coach, student=self.ayse, title=f'Ayşe Ödev {i}',
                due_date=due, status=ManualAssignment.Status.ASSIGNED, is_active=True,
            )
        ManualAssignment.objects.create(
            coach=self.coach, student=self.mehmet, title='Mehmet Ödevi',
            due_date=due, status=ManualAssignment.Status.COMPLETED, is_active=True,
        )
        ManualAssignment.objects.create(
            coach=self.coach, student=self.mehmet, title='Taslak Ödev',
            due_date=due, status=ManualAssignment.Status.DRAFT, is_active=True,
        )

    def test_list_without_pagination_params_returns_plain_array(self):
        """page/page_size verilmezse geriye dönük uyumluluk için tam liste döner."""
        response = self.client.get(ASSIGNMENTS_URL)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(len(response.data['data']), 5)
        self.assertNotIn('count', response.data)

    def test_search_filters_by_student_name(self):
        response = self.client.get(ASSIGNMENTS_URL, {'q': 'Ayşe'})
        self.assertEqual(response.status_code, 200)
        data = response.data['data']
        self.assertEqual(len(data), 3)
        self.assertTrue(all(a['student_name'] == 'Ayşe Yılmaz' for a in data))

    def test_search_filters_by_title(self):
        response = self.client.get(ASSIGNMENTS_URL, {'q': 'Taslak'})
        data = response.data['data']
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['title'], 'Taslak Ödev')

    def test_pagination_returns_wrapped_page(self):
        response = self.client.get(ASSIGNMENTS_URL, {'page': 1, 'page_size': 2})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(len(response.data['data']), 2)
        self.assertEqual(response.data['count'], 5)
        self.assertIsNotNone(response.data['next'])

        response2 = self.client.get(ASSIGNMENTS_URL, {'page': 3, 'page_size': 2})
        self.assertEqual(len(response2.data['data']), 1)
        self.assertIsNone(response2.data['next'])

    def test_stats_ignores_status_filter_and_returns_totals(self):
        response = self.client.get(STATS_URL, {'status': 'DRAFT'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        stats = response.data['data']
        self.assertEqual(stats['total'], 5)
        self.assertEqual(stats['draft'], 1)
        self.assertEqual(stats['assigned'], 3)
        self.assertEqual(stats['completed'], 1)
