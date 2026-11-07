"""Two connections cannot overfill a coach through single-create requests."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connections
from django.test import TransactionTestCase
from rest_framework.test import APIClient
from . import test_coach_change as fixtures
from apps.coaching.models import CoachStudentAssignment
from apps.ogrenci.domain.models import Ogrenci
from django.utils import timezone


class CoachCapacityConcurrencyTests(TransactionTestCase):
    setUp = fixtures.CoachChangeServiceTest.setUp

    def test_parallel_single_assignments_cannot_exceed_capacity(self):
        self.assignment.end_date = timezone.localdate()
        self.assignment.save(update_fields=['end_date'])
        self.new_coach.capacity = 1
        self.new_coach.save(update_fields=['capacity'])
        other = Ogrenci.objects.create(kurum=self.kurum, sube=self.sube, ad='Other', soyad='Student')
        actor = get_user_model().objects.create_superuser(username='concurrent_admin', email='x@test.com', password='x')
        barrier = Barrier(2)

        def assign(student_id):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=actor)
                barrier.wait(timeout=10)
                response = client.post('/api/coaching/assignments/', {
                    'student': student_id, 'coach': self.new_coach.pk, 'is_primary': True,
                }, format='json', HTTP_X_KURUM_ID=str(self.kurum.pk), HTTP_X_SUBE_ID=str(self.sube.pk))
                return response.status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(assign, [self.ogrenci.pk, other.pk]))
        self.assertEqual(sorted(statuses), [201, 400])
        self.assertEqual(CoachStudentAssignment.objects.filter(coach=self.new_coach,
            is_primary=True, end_date__isnull=True).count(), 1)
