from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.coaching.models import CoachProfile, CoachStudentAssignment, CoachingEvent, GorusmeKaydi
from apps.coaching.study_program.models import WeeklyProgram
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciAdres, OgrenciKayit, OgrenciVeli
from apps.personel.domain.models import Personel
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()

STUDENTS_URL = '/api/coaching/students/'
PROFILE_URL = '/api/coaching/students/{}/profile/'
RISK_REPORT_URL = '/api/coaching/students/{}/risk-report/'
GORUSME_DETAIL_URL = '/api/coaching/gorusmeler/{}/'
PROGRAMS_URL = '/api/coaching/study-program/programs/'
EXAMS_URL = '/api/coaching/olcme-degerlendirme/student-exams/{}/'


class CoachStudentApiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Koç Portal Kurum', kod='KPC')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025,
            bitis_yil=2026,
            aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            ad='12-A',
            kod='12A',
            aktif_mi=True,
        )

        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Yılmaz',
            tc_kimlik_no='12345678901',
            dogum_tarihi=date(2010, 5, 15),
            cinsiyet='E',
            telefon='05559876543',
            email='ali@test.com',
            aktif_mi=True,
        )
        self.other_student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Demir',
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.student,
            sinif=self.sinif,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            okul_no='12345',
            aktif_mi=True,
        )
        OgrenciAdres.objects.create(
            ogrenci=self.student,
            adres_turu='ev',
            adres='Atatürk Cad. No:1',
            il='İstanbul',
            ilce='Kadıköy',
            varsayilan=True,
        )
        OgrenciVeli.objects.create(
            ogrenci=self.student,
            veli_turu='anne',
            ad='Fatma',
            soyad='Yılmaz',
            telefon='05551234567',
        )

        self.coach_user = User.objects.create_user(
            username='coach_portal',
            email='coach_portal@test.com',
            password='testpass123',
        )
        self.other_user = User.objects.create_user(
            username='other_coach',
            email='other_coach@test.com',
            password='testpass123',
        )
        self.admin_user = User.objects.create_superuser(
            username='admin_portal',
            email='admin_portal@test.com',
            password='testpass123',
        )

        self.coach_personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
            soyad='Koç',
            tc_kimlik_no='11111111111',
            user=self.coach_user,
        )
        self.coach_profile = CoachProfile.objects.create(
            teacher=self.coach_personel,
            capacity=20,
            is_active=True,
            is_coach=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach_profile,
            student=self.student,
            start_date=date(2026, 1, 1),
            is_primary=True,
        )

        self.client = APIClient()
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

        self.due_past = timezone.now() - timedelta(days=2)
        ManualAssignment.objects.create(
            coach=self.coach_user,
            student=self.student,
            title='Gecikmiş Ödev',
            due_date=self.due_past,
            status=ManualAssignment.Status.OVERDUE,
            is_active=True,
            coach_notes='TYT net hedefi: 85',
        )

        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        WeeklyProgram.objects.create(
            student=self.student,
            coach=self.coach_user,
            week_start=week_start,
            week_end=week_end,
            coach_note='Haftalık program notu',
            completion_percent=40,
        )

        self.gorusme = GorusmeKaydi.objects.create(
            kurum=self.kurum,
            ogrenci=self.student,
            koc=self.coach_profile,
            olusturan=self.coach_user,
            gorusme_turu='ogrenci',
            durum='tamamlandi',
            gorusme_tarihi=date(2026, 6, 1),
            konu='Motivasyon görüşmesi',
        )

    def test_coach_student_list_scoped(self):
        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get(STUDENTS_URL)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['count'], 1)
        row = response.data['data'][0]
        self.assertEqual(row['id'], self.student.id)
        self.assertEqual(row['ad'], 'Ali')
        self.assertEqual(row['okul_no'], '12345')
        self.assertEqual(row['sinif'], '12-A')
        self.assertEqual(row['overdue_homework_count'], 1)
        self.assertEqual(row['last_meeting_date'], '2026-06-01')
        self.assertIn('risk_score', row)
        self.assertIn('risk_label', row)
        self.assertEqual(row['veli_telefon'], '05551234567')
        self.assertEqual(row['meeting_today_count'], 0)
        self.assertTrue(row['needs_meeting'])
        self.assertIn('profil_foto', row)

    def test_coach_student_list_meeting_today_count(self):
        GorusmeKaydi.objects.create(
            kurum=self.kurum,
            ogrenci=self.student,
            koc=self.coach_profile,
            olusturan=self.coach_user,
            gorusme_turu='ogrenci',
            durum='planlandi',
            gorusme_tarihi=date.today(),
            konu='Bugünkü görüşme',
        )
        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get(STUDENTS_URL)
        row = response.data['data'][0]
        self.assertEqual(row['meeting_today_count'], 1)

    def test_admin_sees_all_kurum_students(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(STUDENTS_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 2)
        ids = {row['id'] for row in response.data['data']}
        self.assertEqual(ids, {self.student.id, self.other_student.id})

    def test_coach_profile_bff(self):
        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get(PROFILE_URL.format(self.student.id))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        data = response.data['data']

        self.assertEqual(data['student']['ad'], 'Ali')
        self.assertEqual(data['student']['tam_ad'], 'Ali Yılmaz')
        self.assertEqual(data['student']['full_name'], 'Ali Yılmaz')
        self.assertEqual(data['student']['okul_no'], '12345')
        self.assertEqual(data['student']['tc_kimlik_no'], '12345678901')
        self.assertEqual(data['student']['dogum_tarihi'], '15.05.2010')
        self.assertEqual(data['student']['cinsiyet_display'], 'Erkek')
        self.assertEqual(data['student']['telefon'], '05559876543')
        self.assertEqual(data['student']['email'], 'ali@test.com')
        self.assertIn('Kadıköy', data['student']['adres'])
        self.assertEqual(data['student']['kurum']['ad'], 'Koç Portal Kurum')
        self.assertEqual(data['student']['sube']['ad'], 'Merkez')
        self.assertEqual(data['student']['sinif']['ad'], '12-A')
        self.assertEqual(data['student']['egitim_yili']['ad'], '2025-2026')
        self.assertTrue(data['student']['kayit_tarihi'])
        self.assertTrue(data['student']['aktif_mi'])
        self.assertNotIn('ek_hizmetler', data['student'])
        self.assertEqual(data['student']['veli']['telefon'], '05551234567')
        self.assertEqual(data['student']['veli']['veli_turu_display'], 'Anne')
        self.assertTrue(data['student']['veli']['tel_link'].startswith('tel:'))
        self.assertEqual(data['student']['veli_adi'], 'Fatma Yılmaz')
        self.assertEqual(data['student']['veli_telefon'], '05551234567')

        self.assertTrue(data['coach_context']['is_coach'])
        self.assertTrue(data['coach_context']['is_primary_coach'])
        self.assertEqual(data['coach_context']['total_meeting_count'], 1)

        self.assertEqual(data['overview']['hedef']['source'], 'manual_assignment')
        self.assertIn('TYT net hedefi', data['overview']['hedef']['text'])

        self.assertEqual(data['quick_stats']['overdue_homework_count'], 1)
        self.assertEqual(data['quick_stats']['last_meeting_date'], '2026-06-01')
        self.assertEqual(data['quick_stats']['program_completion_percent'], 40)

        self.assertEqual(len(data['overview']['recent_meetings']), 1)
        self.assertTrue(data['overview']['recent_meetings'][0]['can_edit'])

    def test_profile_forbidden_for_unassigned_student(self):
        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get(PROFILE_URL.format(self.other_student.id))

        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.data['success'])

    def test_gorusme_detail_requires_student_access(self):
        self.client.force_authenticate(user=self.other_user)
        response = self.client.get(GORUSME_DETAIL_URL.format(self.gorusme.id))
        self.assertEqual(response.status_code, 403)

        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get(GORUSME_DETAIL_URL.format(self.gorusme.id))
        self.assertEqual(response.status_code, 200)

    def test_study_program_list_requires_student_access(self):
        self.client.force_authenticate(user=self.other_user)
        response = self.client.get(
            PROGRAMS_URL,
            {'student_id': self.student.id},
        )
        self.assertEqual(response.status_code, 403)

        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get(
            PROGRAMS_URL,
            {'student_id': self.student.id},
        )
        self.assertEqual(response.status_code, 200)

    def test_student_exams_requires_access(self):
        self.client.force_authenticate(user=self.other_user)
        response = self.client.get(EXAMS_URL.format(self.student.id))
        self.assertEqual(response.status_code, 403)

        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get(EXAMS_URL.format(self.student.id))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['exams'], [])

    def test_hedef_falls_back_to_weekly_program(self):
        ManualAssignment.objects.filter(student=self.student).update(coach_notes='')

        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get(PROFILE_URL.format(self.student.id))

        self.assertEqual(response.status_code, 200)
        hedef = response.data['data']['overview']['hedef']
        self.assertEqual(hedef['source'], 'weekly_program')
        self.assertEqual(hedef['text'], 'Haftalık program notu')

    def test_risk_report_creates_coaching_event(self):
        self.client.force_authenticate(user=self.coach_user)
        response = self.client.post(
            RISK_REPORT_URL.format(self.student.id),
            {
                'reason': 'Motivasyon kaybı',
                'notes': 'Son iki hafta ödev teslim etmedi.',
                'create_meeting_draft': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['success'])
        self.assertIn('event_id', response.data['data'])
        self.assertIn('meeting_draft_id', response.data['data'])

        event = CoachingEvent.objects.get(pk=response.data['data']['event_id'])
        self.assertEqual(event.event_type, 'RISK')
        self.assertEqual(event.event_source, 'risk_report')
        self.assertEqual(event.student_id, self.student.id)
        self.assertEqual(event.coach_id, self.coach_profile.id)
        self.assertIn('Motivasyon kaybı', event.title)

        meeting = GorusmeKaydi.objects.get(pk=response.data['data']['meeting_draft_id'])
        self.assertEqual(meeting.durum, 'planlandi')
        self.assertEqual(meeting.koc_id, self.coach_profile.id)

    def test_risk_report_forbidden_for_unassigned_student(self):
        self.client.force_authenticate(user=self.coach_user)
        response = self.client.post(
            RISK_REPORT_URL.format(self.other_student.id),
            {'reason': 'Test'},
            format='json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.data['success'])
        self.assertEqual(CoachingEvent.objects.filter(event_source='risk_report').count(), 0)
