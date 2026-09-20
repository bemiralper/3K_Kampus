"""Yoklama sonrası koç bildirimi, eşik ve Risk Merkezi."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.academic.domain.class_period_attendance import (
    ClassPeriodAttendanceRecord,
    ClassPeriodAttendanceSession,
    ClassPeriodCode,
)
from apps.academic.domain.lesson_attendance import StudentAttendanceStatus
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.coaching.models import (
    AttendanceThresholdSetting,
    CoachProfile,
    CoachStudentAssignment,
    CoachingEvent,
)
from apps.coaching.services.attendance_followup import (
    followup_payload_for_students,
    followup_roster_student_ids,
    process_library_attendance_followup,
    process_period_attendance_followup,
    student_history_payload,
)
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.kutuphane.domain.models import (
    AssignmentStatus,
    AttendanceRecord,
    AttendanceSession,
    AttendanceStatus,
    Library,
    Seat,
    SeatAssignment,
    SessionCode,
)
from apps.ogrenci.domain.models import OgrenciEgitimPaketi
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel
from apps.roller.models import Role, UserRole
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.takvim.domain.models import AppNotification
from apps.term.domain.models import Term

User = get_user_model()


class AttendanceFollowupServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Yoklama Kurum', kod='YOK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='YOK-M')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            name='Güz',
            code='YOK-G',
            start_date=date(2025, 9, 1),
            end_date=date(2026, 1, 31),
            is_active=True,
        )
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='9', kod='Y9', aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            ad='9-A',
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        self.coach_user = User.objects.create_user(username='koc.yoklama@test.local', password='test')
        coach_personel = Personel.objects.create(
            user=self.coach_user,
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
            soyad='Koç',
            tc_kimlik_no='55555555551',
            aktif_mi=True,
        )
        self.coach = CoachProfile.objects.create(
            teacher=coach_personel, is_coach=True, is_active=True,
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Demir', aktif_mi=True,
        )
        self.other = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Can', soyad='Yılmaz', aktif_mi=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            start_date=date(2025, 9, 1),
            is_primary=True,
        )
        self.day = date(2025, 9, 15)

    def _session(self, day, period=ClassPeriodCode.MORNING):
        return ClassPeriodAttendanceSession.objects.create(
            egitim_yili=self.year,
            term=self.term,
            sinif=self.sinif,
            session_date=day,
            period=period,
        )

    def _mark(self, session, student, status):
        return ClassPeriodAttendanceRecord.objects.create(
            session=session,
            student=student,
            status=status,
        )

    def test_daily_notify_without_risk_on_first_absence(self):
        session = self._session(self.day)
        self._mark(session, self.student, StudentAttendanceStatus.ABSENT)
        self._mark(session, self.other, StudentAttendanceStatus.PRESENT)

        result = process_period_attendance_followup(session.id)
        self.assertTrue(result['ok'])

        notes = AppNotification.objects.filter(user_id=self.coach_user.id)
        self.assertEqual(notes.count(), 1)
        n = notes.first()
        self.assertIn('Ayşe', n.mesaj)
        self.assertEqual(n.url, f'/coach/gorevler?tab=yoklama&date={self.day.isoformat()}')
        self.assertEqual(
            CoachingEvent.objects.filter(student=self.student, event_source='auto_attendance').count(),
            0,
        )

    def test_same_session_does_not_duplicate_notification(self):
        session = self._session(self.day)
        self._mark(session, self.student, StudentAttendanceStatus.ABSENT)
        process_period_attendance_followup(session.id)
        process_period_attendance_followup(session.id)
        self.assertEqual(AppNotification.objects.filter(user_id=self.coach_user.id).count(), 1)

    def test_morning_and_afternoon_count_as_one_day(self):
        morning = self._session(self.day, ClassPeriodCode.MORNING)
        afternoon = self._session(self.day, ClassPeriodCode.AFTERNOON)
        self._mark(morning, self.student, StudentAttendanceStatus.ABSENT)
        self._mark(afternoon, self.student, StudentAttendanceStatus.ABSENT)
        process_period_attendance_followup(morning.id)
        process_period_attendance_followup(afternoon.id)
        self.assertEqual(
            CoachingEvent.objects.filter(student=self.student, event_source='auto_attendance').count(),
            0,
        )

    def test_present_in_one_period_is_not_absent_day(self):
        morning = self._session(self.day, ClassPeriodCode.MORNING)
        afternoon = self._session(self.day, ClassPeriodCode.AFTERNOON)
        self._mark(morning, self.student, StudentAttendanceStatus.ABSENT)
        self._mark(afternoon, self.student, StudentAttendanceStatus.PRESENT)
        process_period_attendance_followup(morning.id)
        self.assertEqual(
            CoachingEvent.objects.filter(student=self.student, event_source='auto_attendance').count(),
            0,
        )

    def test_consecutive_two_days_creates_alarm_risk(self):
        first = self._session(self.day)
        second = self._session(self.day + timedelta(days=1))
        self._mark(first, self.student, StudentAttendanceStatus.ABSENT)
        process_period_attendance_followup(first.id)
        self._mark(second, self.student, StudentAttendanceStatus.ABSENT)
        process_period_attendance_followup(second.id)

        events = CoachingEvent.objects.filter(
            student=self.student, event_type='RISK', event_source='auto_attendance',
        )
        self.assertEqual(events.count(), 1)
        event = events.first()
        self.assertEqual(event.status, 'pending')
        self.assertIn('Alarm', event.title)
        meta = event.metadata['attendance']
        self.assertEqual(meta['severity'], 'alarm')
        self.assertEqual(meta['consecutive_absent'], 2)
        self.assertEqual(meta['absent_days'], 2)
        self.assertEqual(meta['recommended_action'], 'Öğrenciyle görüş')

    def test_second_save_updates_open_risk_instead_of_creating_another(self):
        first = self._session(self.day)
        second = self._session(self.day + timedelta(days=1))
        third = self._session(self.day + timedelta(days=2))
        self._mark(first, self.student, StudentAttendanceStatus.ABSENT)
        process_period_attendance_followup(first.id)
        self._mark(second, self.student, StudentAttendanceStatus.ABSENT)
        process_period_attendance_followup(second.id)
        self._mark(third, self.student, StudentAttendanceStatus.ABSENT)
        process_period_attendance_followup(third.id)
        self.assertEqual(
            CoachingEvent.objects.filter(student=self.student, event_source='auto_attendance').count(),
            1,
        )
        event = CoachingEvent.objects.get(student=self.student, event_source='auto_attendance')
        self.assertEqual(event.metadata['attendance']['absent_days'], 3)

    def test_attention_threshold_without_consecutive(self):
        AttendanceThresholdSetting.objects.create(
            kurum=self.kurum,
            consecutive_absent_alarm=10,
            absence_attention=3,
            absence_alarm=5,
        )
        days = [self.day, self.day + timedelta(days=2), self.day + timedelta(days=4)]
        for day in days:
            session = self._session(day)
            self._mark(session, self.student, StudentAttendanceStatus.ABSENT)
            # Ara gün gelmiş sayılsın — ardışık olmasın
            present_day = day + timedelta(days=1)
            present = self._session(present_day)
            self._mark(present, self.student, StudentAttendanceStatus.PRESENT)
            process_period_attendance_followup(session.id)

        event = CoachingEvent.objects.get(student=self.student, event_source='auto_attendance')
        self.assertIn('Dikkat', event.title)
        self.assertEqual(event.metadata['attendance']['severity'], 'attention')
        self.assertEqual(event.metadata['attendance']['absent_days'], 3)

    def _place(self, student, classroom, term=None):
        return StudentClassPlacement.objects.create(
            academic_year=self.year,
            term=term or self.term,
            student=student,
            classroom=classroom,
            is_active=True,
        )

    def _payload(self, day=None):
        return followup_payload_for_students(
            [self.student, self.other],
            on_date=day or self.day,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            egitim_yili_id=self.year.id,
        )

    def test_inactive_class_is_hidden_from_filters(self):
        self.sinif.term = self.term
        self.sinif.save(update_fields=['term'])
        deleted = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            term=self.term,
            ad='9-Silinmiş',
            sinif_seviyesi=self.seviye,
            aktif_mi=False,
        )
        self._place(self.student, deleted)
        self._place(self.other, self.sinif)
        payload = self._payload()
        class_names = [item['name'] for item in payload['filters']['classes']]
        self.assertIn('9-A', class_names)
        self.assertNotIn('9-Silinmiş', class_names)
        by_id = {row['student_id']: row for row in payload['students']}
        self.assertEqual(by_id[self.student.id]['sinif_name'], '')
        self.assertEqual(by_id[self.other.id]['sinif_name'], '9-A')

    def test_old_term_absence_is_ignored(self):
        old_term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            name='Bahar',
            code='YOK-B',
            start_date=date(2025, 2, 1),
            end_date=date(2025, 6, 30),
            is_active=False,
        )
        old_session = ClassPeriodAttendanceSession.objects.create(
            egitim_yili=self.year,
            term=old_term,
            sinif=self.sinif,
            session_date=date(2025, 3, 10),
            period=ClassPeriodCode.MORNING,
        )
        self._mark(old_session, self.student, StudentAttendanceStatus.ABSENT)
        payload = self._payload()
        row = next(item for item in payload['students'] if item['student_id'] == self.student.id)
        self.assertEqual(row['absent_days'], 0)
        self.assertFalse(row['today_absent'])

    def test_library_absence_in_active_term_is_counted(self):
        library = Library.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            ad='Sessiz Salon',
            kod='YOK-LIB',
            kapasite=20,
        )
        session = AttendanceSession.objects.create(
            library=library,
            tarih=self.day,
            acan_id=1,
        )
        AttendanceRecord.objects.create(
            attendance_session=session,
            ogrenci_id=self.student.id,
            durum=AttendanceStatus.ABSENT,
            kaydeden_id=1,
        )
        payload = self._payload()
        row = next(item for item in payload['students'] if item['student_id'] == self.student.id)
        self.assertTrue(row['today_absent'])
        self.assertEqual(row['absent_days'], 1)
        self.assertEqual(payload['day_counts']['absent'], 1)

        result = process_library_attendance_followup(session.id)
        self.assertTrue(result['ok'])
        self.assertEqual(AppNotification.objects.filter(user_id=self.coach_user.id).count(), 1)

    def test_history_marks_class_and_library_slots(self):
        self._mark(self._session(self.day), self.student, StudentAttendanceStatus.LATE)
        library = Library.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            ad='Akşam Salon',
            kod='YOK-EVE',
            kapasite=20,
        )
        evening = AttendanceSession.objects.create(
            library=library,
            tarih=self.day,
            periyot_kodu=SessionCode.EVENING,
            acan_id=1,
        )
        AttendanceRecord.objects.create(
            attendance_session=evening,
            ogrenci_id=self.student.id,
            durum=AttendanceStatus.ABSENT,
            kaydeden_id=1,
        )
        history = student_history_payload(
            self.student,
            on_date=self.day,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            egitim_yili_id=self.year.id,
        )
        day = next(row for row in history['days'] if row['date'] == self.day.isoformat())
        marks = {(item['source'], item['period'], item['status'], item['period_label']) for item in day['marks']}
        self.assertIn(('class', '', 'late', ''), marks)
        self.assertIn(('library', 'evening', 'absent', 'Akşam'), marks)

    def test_library_absence_outside_active_term_is_ignored(self):
        library = Library.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            ad='Eski Salon',
            kod='YOK-OLD',
            kapasite=20,
        )
        session = AttendanceSession.objects.create(
            library=library,
            tarih=date(2025, 3, 10),
            acan_id=1,
        )
        AttendanceRecord.objects.create(
            attendance_session=session,
            ogrenci_id=self.student.id,
            durum=AttendanceStatus.ABSENT,
            kaydeden_id=1,
        )
        payload = self._payload()
        row = next(item for item in payload['students'] if item['student_id'] == self.student.id)
        self.assertEqual(row['absent_days'], 0)
        self.assertFalse(row['today_absent'])

    def _roster_ids(self):
        return followup_roster_student_ids(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            on_date=self.day,
            egitim_yili_id=self.year.id,
        )

    def test_roster_includes_class_and_library_box_excludes_ozel_and_deneme(self):
        self.sinif.term = self.term
        self.sinif.save(update_fields=['term'])
        self._place(self.student, self.sinif)

        boxed = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Box', soyad='Öğrenci', aktif_mi=True,
        )
        library = Library.objects.create(
            kurum_id=self.kurum.id, sube_id=self.sube.id, ad='Salon Box', kod='BOX1', kapasite=10,
        )
        seat = Seat.objects.create(library=library, masa_no='B-1')
        SeatAssignment.objects.create(
            library=library,
            seat=seat,
            ogrenci_id=boxed.id,
            baslangic_tarihi=self.day,
            durum=AssignmentStatus.ACTIVE,
        )

        ozel = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Özel', soyad='Ders', aktif_mi=True,
        )
        OgrenciEgitimPaketi.objects.create(
            ogrenci=ozel, paket_turu='ozel_ders', paket_id=1, paket_adi='Birebir', aktif_mi=True,
        )
        boxed_ozel = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Özel Box', soyad='Ders', aktif_mi=True,
        )
        OgrenciEgitimPaketi.objects.create(
            ogrenci=boxed_ozel, paket_turu='ozel_ders', paket_id=2, paket_adi='Birebir', aktif_mi=True,
        )
        ozel_seat = Seat.objects.create(library=library, masa_no='B-2')
        SeatAssignment.objects.create(
            library=library,
            seat=ozel_seat,
            ogrenci_id=boxed_ozel.id,
            baslangic_tarihi=self.day,
            durum=AssignmentStatus.ACTIVE,
        )

        deneme = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Deneme', soyad='Kulüp',
            aktif_mi=True, kayit_turu='deneme_kulubu',
        )
        self._place(deneme, self.sinif)

        ids = self._roster_ids()
        self.assertIn(self.student.id, ids)
        self.assertIn(boxed.id, ids)
        self.assertNotIn(ozel.id, ids)
        self.assertNotIn(boxed_ozel.id, ids)
        self.assertNotIn(deneme.id, ids)
        self.assertNotIn(self.other.id, ids)


class AttendanceFollowupApiTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='API Yoklama', kod='APY')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='APY-M')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            name='Güz',
            code='APY-G',
            start_date=date(2025, 9, 1),
            end_date=date(2026, 1, 31),
            is_active=True,
        )
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='10', kod='A10', aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            ad='10-A',
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        role, _ = Role.objects.get_or_create(
            code='admin', defaults={'name': 'Admin', 'silindi_mi': False},
        )
        self.admin = User.objects.create_user(username='admin.yoklama@test.local', password='test')
        UserRole.objects.create(user=self.admin, role=role)
        Personel.objects.create(
            user=self.admin,
            kurum=self.kurum,
            sube=self.sube,
            ad='Admin',
            soyad='Yönetici',
            tc_kimlik_no='55555555552',
            aktif_mi=True,
        )
        self.coach_user = User.objects.create_user(username='koc.api@test.local', password='test')
        coach_personel = Personel.objects.create(
            user=self.coach_user,
            kurum=self.kurum,
            sube=self.sube,
            ad='Koç',
            soyad='Api',
            tc_kimlik_no='55555555553',
            aktif_mi=True,
        )
        self.coach = CoachProfile.objects.create(
            teacher=coach_personel, is_coach=True, is_active=True,
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Elif', soyad='Kara', aktif_mi=True,
        )
        StudentClassPlacement.objects.create(
            academic_year=self.year,
            term=self.term,
            student=self.student,
            classroom=self.sinif,
            is_active=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            start_date=date(2025, 9, 1),
            is_primary=True,
        )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.day = date(2025, 9, 16)
        session = ClassPeriodAttendanceSession.objects.create(
            egitim_yili=self.year,
            term=self.term,
            sinif=self.sinif,
            session_date=self.day,
            period=ClassPeriodCode.MORNING,
        )
        ClassPeriodAttendanceRecord.objects.create(
            session=session,
            student=self.student,
            status=StudentAttendanceStatus.LATE,
        )

    def test_coach_followup_lists_totals(self):
        self.client.force_authenticate(user=self.coach_user)
        res = self.client.get(
            f'/api/coaching/attendance-followup/?date={self.day.isoformat()}',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()['data']
        self.assertEqual(data['day_counts']['total_students'], 1)
        self.assertEqual(data['day_counts']['late'], 1)
        row = data['students'][0]
        self.assertEqual(row['student_name'], 'Elif Kara')
        self.assertEqual(row['late_days'], 1)
        self.assertTrue(row['today_late'])
        self.assertEqual(row['coach_name'], 'Koç Api')

    def test_admin_can_list_all_and_open_student_history(self):
        self.client.force_authenticate(user=self.admin)
        listed = self.client.get(
            f'/api/coaching/attendance-followup/?date={self.day.isoformat()}',
            **self.headers,
        )
        self.assertEqual(listed.status_code, 200, listed.content)
        self.assertEqual(listed.json()['data']['day_counts']['total_students'], 1)

        history = self.client.get(
            f'/api/coaching/attendance-followup/students/{self.student.id}/?date={self.day.isoformat()}',
            **self.headers,
        )
        self.assertEqual(history.status_code, 200, history.content)
        body = history.json()['data']
        self.assertEqual(body['student_name'], 'Elif Kara')
        self.assertEqual(body['late_days'], 1)
        late_day = next(row for row in body['days'] if row['late'])
        self.assertTrue(any(
            mark['source'] == 'class' and mark['status'] == 'late'
            for mark in late_day.get('marks') or []
        ))

        analysis = self.client.get(
            f'/api/coaching/attendance-followup/analysis/?date={self.day.isoformat()}',
            **self.headers,
        )
        self.assertEqual(analysis.status_code, 200, analysis.content)
        kpis = analysis.json()['data']['kpis']
        self.assertEqual(kpis['total_students'], 1)
        self.assertEqual(kpis['today_late'], 1)

    def test_admin_can_update_thresholds(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.put(
            '/api/coaching/attendance-thresholds/',
            {
                'absence_attention': 2,
                'absence_alarm': 4,
                'late_attention': 2,
                'late_alarm': 4,
                'consecutive_absent_alarm': 3,
                'recommended_action_attention': 'Ara not bırak',
                'recommended_action_alarm': 'Öğrenciyle görüş',
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        setting = AttendanceThresholdSetting.objects.get(kurum=self.kurum)
        self.assertEqual(setting.absence_alarm, 4)
        self.assertEqual(setting.consecutive_absent_alarm, 3)
        self.assertEqual(setting.recommended_action_attention, 'Ara not bırak')
