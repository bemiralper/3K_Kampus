"""Yoklama veli bildirimi testleri."""
from datetime import time
from unittest.mock import MagicMock

from django.test import TestCase

from apps.communication.application.variable_resolver import build_attendance_context, resolve_variables
from apps.kutuphane.application.notification_service import AttendanceNotificationService
from apps.kutuphane.domain.models import AttendanceNotificationEventType, AttendanceStatus


class BuildAttendanceContextTest(TestCase):
    def test_resolves_oturum_and_times(self):
        class _Session:
            tarih = __import__('datetime').date(2026, 6, 28)
            ders_no = 2
            library = MagicMock(ad='Salon A')

            def get_periyot_kodu_display(self):
                return 'Sabah'

        class _Record:
            giris_saati = time(9, 42)
            cikis_saati = time(17, 30)

        class _Veli:
            tam_ad = 'Ayşe Hanım'

        class _Ogrenci:
            ad = 'Mehmet'
            soyad = 'Yılmaz'
            sube_id = None

        ctx = build_attendance_context(
            session=_Session(),
            record=_Record(),
            ogrenci=_Ogrenci(),
            veli=_Veli(),
            kurum=MagicMock(ad='3K Kampüs'),
        )
        body = resolve_variables(
            'Sayın {{veli_ad}}, {{ogrenci_ad}} {{oturum_ad}} {{giris_saati}} {{cikis_saati}} {{salon_ad}}',
            ctx,
        )
        self.assertIn('Ayşe Hanım', body)
        self.assertIn('Mehmet Yılmaz', body)
        self.assertIn('Sabah', body)
        self.assertIn('09:42', body)
        self.assertIn('17:30', body)
        self.assertIn('Salon A', body)


class AttendanceNotificationServiceTest(TestCase):
    def setUp(self):
        self.service = AttendanceNotificationService()

    def test_record_qualifies(self):
        record = MagicMock()
        record.izinli_mi = False
        record.durum = AttendanceStatus.ABSENT
        record.giris_saati = None
        record.cikis_saati = None
        self.assertTrue(
            self.service._record_qualifies(record, AttendanceNotificationEventType.ABSENT)
        )

        record.durum = AttendanceStatus.LATE
        record.giris_saati = time(10, 0)
        self.assertTrue(
            self.service._record_qualifies(record, AttendanceNotificationEventType.LATE)
        )

        record.durum = AttendanceStatus.PRESENT
        record.cikis_saati = time(18, 0)
        self.assertTrue(
            self.service._record_qualifies(record, AttendanceNotificationEventType.EXIT)
        )

    def test_detect_pending_after_late_change(self):
        old = MagicMock()
        old.durum = AttendanceStatus.ABSENT
        old.giris_saati = None
        old.cikis_saati = None

        new = MagicMock()
        new.ogrenci_id = 1
        new.izinli_mi = False
        new.durum = AttendanceStatus.LATE
        new.giris_saati = time(9, 30)
        new.cikis_saati = None

        service = AttendanceNotificationService()
        service._sent_veli_ids = MagicMock(return_value=set())

        pending = service.detect_pending_after_save(
            'session-id',
            {1: old},
            [new],
        )
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]['event_type'], AttendanceNotificationEventType.LATE)
