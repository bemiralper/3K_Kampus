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
from apps.takvim.domain.models import Event

User = get_user_model()

ASSIGNMENTS_URL = '/api/coaching/manual-assignments/assignments/'


class AssignmentCalendarSyncKurumTest(TestCase):
    """Takvim senkronu kurum çözümlemesi: session ve varsayılan fallback."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Takvim Kurum', kod='TKV')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Demir',
            aktif_mi=True,
        )
        self.coach = User.objects.create_superuser(
            username='coach_calendar',
            email='coach_calendar@test.com',
            password='testpass123',
        )
        self.ders = Ders.objects.create(ad='Matematik', kod='MAT')
        self.sinif = SinifSeviyesi.objects.create(ad='12. Sınıf', kod='S12', sira=12)
        self.book_type = BookType.objects.create(kod='SB_TKV', ad='Soru Bankası')
        self.resource_book = ResourceBook.objects.create(
            ad='Mat Soru Bankası',
            kod='MSB-TKV',
            kurum=self.kurum,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif,
            aktif_mi=True,
        )
        self.due_date = (timezone.now() + timezone.timedelta(days=5)).isoformat()

    def _create_assignment_payload(self):
        return {
            'student': self.student.id,
            'title': 'Takvim Test Ödevi',
            'description': 'Takvim senkron testi',
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
                            'title': 'Test 1',
                            'question_count': 10,
                            'order': 0,
                        },
                    ],
                },
            ],
        }

    def _assert_calendar_event_for_assignment(self, assignment_id):
        event = Event.objects.get(
            kaynak_modul='odev',
            kaynak_id=str(assignment_id),
            is_deleted=False,
        )
        self.assertEqual(event.kurum_id, self.kurum.id)
        return event

    def test_calendar_sync_uses_session_active_kurum_without_header(self):
        """X-Kurum-ID olmadan session active_kurum_id ile takvim event'i oluşur."""
        client = APIClient()
        client.force_authenticate(user=self.coach)
        session = client.session
        session['active_kurum_id'] = self.kurum.id
        session.save()

        response = client.post(
            ASSIGNMENTS_URL,
            self._create_assignment_payload(),
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        assignment_id = response.data['data']['id']
        self._assert_calendar_event_for_assignment(assignment_id)

    def test_calendar_sync_uses_default_kurum_fallback(self):
        """Header ve session yokken ilk aktif kurum ile takvim event'i oluşur."""
        client = APIClient()
        client.force_authenticate(user=self.coach)

        response = client.post(
            ASSIGNMENTS_URL,
            self._create_assignment_payload(),
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        assignment_id = response.data['data']['id']
        self.assertTrue(ManualAssignment.objects.filter(pk=assignment_id).exists())
        self._assert_calendar_event_for_assignment(assignment_id)
