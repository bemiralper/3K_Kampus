"""Risk Bildir → admin AppNotification + Risk Merkezi listesi."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.models import CoachProfile, CoachStudentAssignment, CoachingEvent
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel
from apps.roller.models import Role, UserRole
from apps.sube.domain.models import Sube
from apps.takvim.domain.models import AppNotification

User = get_user_model()

RISK_REPORT_URL = '/api/coaching/students/{}/risk-report/'
RISK_LIST_URL = '/api/coaching/risk-reports/'


class RiskReportNotificationTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Risk Bildirim Kurum', kod='RBK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='RBK-M')

        self.mudur_role, _ = Role.objects.get_or_create(
            code='sube_yoneticisi',
            defaults={'name': 'Müdür', 'silindi_mi': False},
        )
        self.mudur_user = User.objects.create_user(
            username='mudur.risk@test.local', password='test',
        )
        UserRole.objects.create(user=self.mudur_user, role=self.mudur_role)
        Personel.objects.create(
            user=self.mudur_user,
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Müdür',
            tc_kimlik_no='33333333333',
            aktif_mi=True,
        )

        self.coach_user = User.objects.create_user(
            username='koc.risk@test.local', password='test',
        )
        coach_personel = Personel.objects.create(
            user=self.coach_user,
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
            soyad='Koç',
            tc_kimlik_no='44444444444',
            aktif_mi=True,
        )
        self.coach_profile = CoachProfile.objects.create(
            teacher=coach_personel, is_coach=True, is_active=True,
        )

        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Riskli',
            aktif_mi=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach_profile,
            student=self.student,
            start_date=date.today(),
            is_primary=True,
        )

        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_risk_report_notifies_mudur(self):
        self.client.force_authenticate(user=self.coach_user)
        before = AppNotification.objects.filter(user_id=self.mudur_user.id).count()

        res = self.client.post(
            RISK_REPORT_URL.format(self.student.id),
            {'reason': 'Motivasyon kaybı', 'notes': 'Ödev yok'},
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content)

        after = AppNotification.objects.filter(user_id=self.mudur_user.id)
        self.assertEqual(after.count(), before + 1)
        n = after.order_by('-created_at').first()
        self.assertIn('Ali', n.baslik)
        self.assertEqual(n.url, f'/admin/coaching/risk?event={res.json()["data"]["event_id"]}')
        self.assertFalse(n.is_read)

    def test_admin_can_list_and_update_status(self):
        event = CoachingEvent.objects.create(
            student=self.student,
            coach=self.coach_profile,
            event_type='RISK',
            title='Risk Bildirimi — Test',
            description='Neden: Test',
            event_date=timezone.now(),
            status='pending',
            event_source='risk_report',
            metadata={'reason': 'Test', 'notes': ''},
        )

        self.client.force_authenticate(user=self.mudur_user)
        listed = self.client.get(RISK_LIST_URL, **self.headers)
        self.assertEqual(listed.status_code, 200, listed.content)
        ids = {row['id'] for row in listed.json()['data']}
        self.assertIn(event.id, ids)

        patched = self.client.patch(
            f'{RISK_LIST_URL}{event.id}/',
            {'status': 'completed'},
            format='json',
            **self.headers,
        )
        self.assertEqual(patched.status_code, 200, patched.content)
        event.refresh_from_db()
        self.assertEqual(event.status, 'completed')

    def test_coach_cannot_list_risk_reports(self):
        self.client.force_authenticate(user=self.coach_user)
        res = self.client.get(RISK_LIST_URL, **self.headers)
        self.assertEqual(res.status_code, 403)
