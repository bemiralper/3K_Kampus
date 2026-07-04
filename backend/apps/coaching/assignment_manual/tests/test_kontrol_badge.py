from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()

KONTROL_BADGE_URL = '/api/coaching/manual-assignments/assignments/kontrol_badge/'


class KontrolBadgeTest(TestCase):
    """Ödev Kontrol sidebar badge endpoint sayım mantığı."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Badge Kurum', kod='BDG')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Yılmaz',
            aktif_mi=True,
        )
        self.coach = User.objects.create_superuser(
            username='coach_badge',
            email='coach_badge@test.com',
            password='testpass123',
        )
        self.other_coach = User.objects.create_user(
            username='other_coach',
            email='other_coach@test.com',
            password='testpass123',
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.coach)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)

        self.due_future = timezone.now() + timezone.timedelta(days=3)
        self.due_past = timezone.now() - timezone.timedelta(days=1)

    def _create_assignment(self, **kwargs):
        defaults = {
            'coach': self.coach,
            'student': self.student,
            'title': 'Test Ödev',
            'due_date': self.due_future,
            'is_active': True,
        }
        defaults.update(kwargs)
        return ManualAssignment.objects.create(**defaults)

    def test_kontrol_badge_counts_by_status(self):
        self._create_assignment(status=ManualAssignment.Status.ASSIGNED)
        self._create_assignment(status=ManualAssignment.Status.IN_PROGRESS)
        self._create_assignment(status=ManualAssignment.Status.OVERDUE, due_date=self.due_past)
        self._create_assignment(status=ManualAssignment.Status.DRAFT)
        self._create_assignment(status=ManualAssignment.Status.COMPLETED)
        self._create_assignment(status=ManualAssignment.Status.CANCELLED)
        self._create_assignment(
            status=ManualAssignment.Status.ASSIGNED,
            is_active=False,
        )

        response = self.client.get(KONTROL_BADGE_URL)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        data = response.data['data']
        self.assertEqual(data['count'], 3)
        self.assertEqual(data['overdue'], 1)
        self.assertEqual(data['pending'], 2)

    def test_kontrol_badge_scoped_to_coach(self):
        other_student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
            soyad='Demir',
            aktif_mi=True,
        )
        self._create_assignment(status=ManualAssignment.Status.ASSIGNED)
        self._create_assignment(
            coach=self.other_coach,
            student=other_student,
            status=ManualAssignment.Status.ASSIGNED,
            title='Başka koç ödevi',
        )

        self.client.force_authenticate(user=self.other_coach)
        response = self.client.get(KONTROL_BADGE_URL)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['data']['count'], 1)

        self.client.force_authenticate(user=self.coach)
        admin_response = self.client.get(KONTROL_BADGE_URL)
        self.assertEqual(admin_response.data['data']['count'], 2)
