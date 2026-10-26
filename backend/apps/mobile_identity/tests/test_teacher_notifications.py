import json
from datetime import date, time

from apps.academic.domain.class_schedule_notify_log import (
    ClassScheduleNotifyLog,
    ClassScheduleNotifyStatus,
    ScheduleNotifyTarget,
)
from apps.mobile_identity.tests.test_teacher_read import TeacherReadTests
from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    OturumDurumu,
    TelafiDurumu,
)
from apps.website.models import Duyuru


class TeacherNotificationTests(TeacherReadTests):
    def test_inbox_keeps_teacher_targets_and_drops_parent_sends(self):
        Duyuru.objects.create(
            kurum=self.kurum, baslik='Okul duyurusu', ozet='Yarın törene bekleriz',
            aktif=True, yayin_tarihi=date(2026, 10, 18),
        )
        Duyuru.objects.create(
            kurum=self.kurum, baslik='Kapalı duyuru', ozet='Görünmez', aktif=False,
            yayin_tarihi=date(2026, 10, 1),
        )
        other_kurum_announcement = Duyuru.objects.create(
            kurum=self.kurum, baslik='Gelecek', ozet='Henüz yok', aktif=True,
            yayin_tarihi=date(2026, 12, 1),
        )
        ClassScheduleNotifyLog.objects.create(
            kurum=self.kurum, term=self.term, sinif=self.sinif,
            target_kind=ScheduleNotifyTarget.TEACHER,
            status=ClassScheduleNotifyStatus.SENT,
            veli_count=12,
            detail={
                'title': 'Ayşe Öğretmen',
                'recipients': [{
                    'kind': 'ogretmen',
                    'id': self.personel.id,
                    'name': 'Ayşe Öğretmen',
                    'phone': '5559998877',
                    'status': 'sent',
                }],
            },
        )
        ClassScheduleNotifyLog.objects.create(
            kurum=self.kurum, term=self.term, sinif=self.sinif,
            target_kind=ScheduleNotifyTarget.CLASS,
            status=ClassScheduleNotifyStatus.SENT,
            veli_count=40,
            detail={
                'recipients': [{
                    'kind': 'veli',
                    'id': 9,
                    'phone': '5551112233',
                    'status': 'sent',
                }],
            },
        )
        ClassScheduleNotifyLog.objects.create(
            kurum=self.kurum, term=self.term,
            target_kind=ScheduleNotifyTarget.TEACHER,
            status=ClassScheduleNotifyStatus.SENT,
            detail={
                'recipients': [{
                    'kind': 'ogretmen',
                    'id': self.other.id,
                    'phone': '5550001122',
                    'status': 'sent',
                }],
            },
        )
        BirebirDersOturumu.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            session_date=date(2026, 10, 18), start_time=time(16, 0), end_time=time(16, 40),
            ogrenci=self.private_student, ders=self.ders, ogretmen=self.personel,
            durum=OturumDurumu.IPTAL, telafi_durumu=TelafiDurumu.PLANLANDI,
            notes='Veli aradı 5554443322', sebep_aciklama='Hastalık',
        )
        BirebirDersOturumu.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            session_date=date(2026, 10, 20), start_time=time(17, 0), end_time=time(17, 40),
            ogrenci=self.private_student, ders=self.ders, ogretmen=self.other,
            durum=OturumDurumu.IPTAL,
        )

        response = self._get('/api/teacher/notifications/')
        self.assertEqual(response.status_code, 200, response.content)
        raw = response.content.decode()
        body = response.json()
        self.assertEqual(
            [row['code'] for row in body['categories']],
            ['announcement', 'schedule', 'private'],
        )
        titles = [row['title'] for row in body['results']]
        self.assertIn('Okul duyurusu', titles)
        self.assertIn('Ders programınız', titles)
        self.assertTrue(any(title.startswith('Telafi · Ece') for title in titles))
        self.assertNotIn('Kapalı duyuru', titles)
        self.assertNotIn('Gelecek', titles)
        self.assertEqual(sum(1 for title in titles if title == 'Ders programınız'), 1)
        self.assertNotIn('5559998877', raw)
        self.assertNotIn('5551112233', raw)
        self.assertNotIn('5550001122', raw)
        self.assertNotIn('5554443322', raw)
        self.assertNotIn('recipients', raw)
        self.assertNotIn('veli_count', raw)
        self.assertNotIn('hakedis', raw)
        self.assertNotIn('Hastalık', raw)

    def test_closed_category_is_rejected_and_post_is_absent(self):
        closed = self._get('/api/teacher/notifications/?category=academic')
        self.assertEqual(closed.status_code, 400)
        self.assertEqual(closed.json()['code'], 'validation_error')
        posted = self.client.post(
            '/api/teacher/notifications/',
            data=json.dumps({'title': 'Yazılmaz'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(posted.status_code, 405)
