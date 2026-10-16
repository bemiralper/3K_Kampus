from datetime import date, datetime, time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.coaching.models import CoachProfile, GorusmeKaydi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube

User = get_user_model()

WEEK_URL = '/api/coaching/haftalik-program/'
PDF_URL = '/api/coaching/haftalik-program/pdf/'
MONDAY = date(2026, 10, 12)


class HaftalikProgramTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Hafta Kurum', kod='HFT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.other_sube = Sube.objects.create(kurum=self.kurum, ad='Diğer', kod='DGR')

        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Yılmaz', aktif_mi=True,
        )
        self.other_student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.other_sube, ad='Veli', soyad='Dış', aktif_mi=True,
        )

        self.coach_user = User.objects.create_user(username='hafta_koc', password='testpass123')
        self.personel = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mehmet', soyad='Koç',
            tc_kimlik_no='33333333333', user=self.coach_user,
        )
        self.coach = CoachProfile.objects.create(
            teacher=self.personel, capacity=20, is_active=True, is_coach=True,
        )

        self.other_user = User.objects.create_user(username='hafta_diger', password='testpass123')
        other_personel = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Diğer',
            tc_kimlik_no='44444444444', user=self.other_user,
        )
        self.other_coach = CoachProfile.objects.create(
            teacher=other_personel, capacity=10, is_active=True, is_coach=True,
        )

        self.admin = User.objects.create_superuser(
            username='hafta_admin', email='hafta_admin@test.com', password='testpass123',
        )

        due = timezone.make_aware(datetime(2026, 10, 12, 23, 59))
        ManualAssignment.objects.create(
            coach=self.coach_user, student=self.student, title='Paragraf seti',
            due_date=due, assigned_date=due, status=ManualAssignment.Status.ASSIGNED, is_active=True,
        )
        ManualAssignment.objects.create(
            coach=self.coach_user, student=self.student, title='Problem seti',
            due_date=due, assigned_date=due, status=ManualAssignment.Status.OVERDUE, is_active=True,
        )
        ManualAssignment.objects.create(
            coach=self.coach_user, student=self.student, title='Taslak',
            due_date=due, assigned_date=due, status=ManualAssignment.Status.DRAFT, is_active=True,
        )
        ManualAssignment.objects.create(
            coach=self.other_user, student=self.student, title='Başka koç',
            due_date=due, assigned_date=due, status=ManualAssignment.Status.ASSIGNED, is_active=True,
        )
        ManualAssignment.objects.create(
            coach=self.coach_user, student=self.other_student, title='Başka şube',
            due_date=due, assigned_date=due, status=ManualAssignment.Status.ASSIGNED, is_active=True,
        )

        GorusmeKaydi.objects.create(
            kurum=self.kurum, ogrenci=self.student, koc=self.coach,
            gorusme_turu='ogrenci', durum='planlandi', yontem='yuz_yuze',
            gorusme_tarihi=MONDAY, gorusme_saati=time(10, 30), sure_dakika=20,
            konu='Haftalık takip',
        )
        GorusmeKaydi.objects.create(
            kurum=self.kurum, ogrenci=self.student, koc=self.coach,
            gorusme_turu='veli', durum='iptal', yontem='telefon',
            gorusme_tarihi=MONDAY, gorusme_saati=time(11, 0), konu='İptal edilen',
        )

        self.client = APIClient()
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_coach_sees_own_week_grouped(self):
        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get(WEEK_URL, {'week': '2026-10-14', 'coach_id': self.other_coach.id})
        self.assertEqual(response.status_code, 200)
        data = response.json()['data']
        self.assertFalse(data['can_pick_coach'])
        self.assertEqual(data['coach_id'], self.coach.id)
        self.assertEqual(data['week_start'], '2026-10-12')
        monday = data['days'][0]
        self.assertEqual(len(monday['items']), 2)
        self.assertEqual(monday['items'][0]['kind'], 'gorusme')
        self.assertEqual(monday['items'][0]['time'], '10:30')
        self.assertEqual(monday['items'][0]['title'], 'Haftalık takip')
        homework = monday['items'][1]
        self.assertEqual(homework['kind'], 'odev')
        self.assertEqual(homework['title'], '2 ödev kontrol')
        self.assertEqual(homework['status_label'], 'Gecikti')
        self.assertIn('Paragraf seti', homework['detail'])
        self.assertEqual(data['counts'], {'odev': 1, 'gorusme': 1})

    def test_admin_can_pick_coach(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(WEEK_URL, {'week': '2026-10-12', 'coach_id': self.other_coach.id})
        self.assertEqual(response.status_code, 200)
        data = response.json()['data']
        self.assertTrue(data['can_pick_coach'])
        self.assertEqual(data['coach_id'], self.other_coach.id)
        self.assertEqual(data['counts'], {'odev': 1, 'gorusme': 0})
        self.assertGreaterEqual(len(data['coaches']), 2)

    def test_invalid_week(self):
        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get(WEEK_URL, {'week': 'salı'})
        self.assertEqual(response.status_code, 400)

    @patch('apps.communication.application.html_to_pdf.render_html_to_pdf', return_value=b'%PDF-1.4 test')
    def test_pdf_download(self, _render):
        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get(PDF_URL, {'week': '2026-10-12'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertIn('Mehmet-Koc-2026-10-12.pdf', response['Content-Disposition'])
        self.assertTrue(response.content.startswith(b'%PDF'))
