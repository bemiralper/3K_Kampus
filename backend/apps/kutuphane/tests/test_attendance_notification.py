"""Yoklama veli bildirimi testleri."""
from datetime import date, time
from unittest.mock import MagicMock

from django.test import TestCase

from apps.communication.application.notification_events import get_event
from apps.communication.application.variable_resolver import build_attendance_context, resolve_variables
from apps.kutuphane.application.attendance_template_seed import DEFAULT_TEMPLATES
from apps.kutuphane.application.notification_service import AttendanceNotificationService
from apps.kutuphane.domain.models import AttendanceNotificationEventType, AttendanceStatus
from apps.communication.domain.enums import TemplateCategory


class BuildAttendanceContextTest(TestCase):
    def _ctx(self, *, giris=time(9, 42), cikis=time(17, 30)):
        class _Session:
            tarih = date(2026, 6, 28)
            ders_no = 2
            library = MagicMock(ad='Salon A')

            def get_periyot_kodu_display(self):
                return 'Sabah'

        class _Record:
            giris_saati = giris
            cikis_saati = cikis

        class _Veli:
            tam_ad = 'Ayşe Hanım'

        class _Ogrenci:
            id = None
            ad = 'Mehmet'
            soyad = 'Yılmaz'
            sube_id = None

        return build_attendance_context(
            session=_Session(),
            record=_Record(),
            ogrenci=_Ogrenci(),
            veli=_Veli(),
            kurum=MagicMock(ad='3K Kampüs'),
        )

    def test_resolves_oturum_and_times(self):
        ctx = self._ctx()
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

    def test_tarih_saat_aliases_match_lms_fields(self):
        ctx = self._ctx()
        self.assertEqual(ctx['yoklama_tarihi'], '28.06.2026')
        self.assertEqual(ctx['tarih'], '28.06.2026')
        self.assertEqual(ctx['giris_saati'], '09:42')
        self.assertEqual(ctx['cikis_saati'], '17:30')
        self.assertEqual(ctx['saat'], '09:42')
        self.assertEqual(ctx['oturum_ad'], 'Sabah')
        self.assertEqual(ctx['salon_ad'], 'Salon A')
        self.assertEqual(ctx['ders_no'], '2')
        self.assertEqual(ctx['kurum_ad'], '3K Kampüs')

    def test_saat_falls_back_to_cikis_when_giris_empty(self):
        ctx = self._ctx(giris=None, cikis=time(17, 30))
        self.assertEqual(ctx['giris_saati'], '')
        self.assertEqual(ctx['saat'], '17:30')

    def test_default_lms_templates_fully_resolve(self):
        ctx = self._ctx()
        for category, (_name, body) in DEFAULT_TEMPLATES.items():
            rendered = resolve_variables(body, ctx)
            self.assertNotIn('{{', rendered, msg=f'{category} unresolved: {rendered}')
            self.assertIn('Mehmet Yılmaz', rendered)
            self.assertIn('28.06.2026', rendered)
            self.assertIn('Sabah', rendered)
            self.assertIn('Salon A', rendered)
            self.assertIn('3K Kampüs', rendered)
            if category == TemplateCategory.YOKLAMA_GEC:
                self.assertIn('09:42', rendered)
            if category == TemplateCategory.YOKLAMA_CIKIS:
                self.assertIn('17:30', rendered)

    def test_catalog_default_bodies_use_tarih_saat(self):
        ctx = self._ctx()
        for key in ('yoklama.gelmedi', 'yoklama.gec', 'yoklama.cikis'):
            event = get_event(key)
            body = event.default_bodies['VELI']
            rendered = resolve_variables(body, ctx)
            self.assertNotIn('{{', rendered, msg=f'{key} unresolved: {rendered}')
            self.assertIn('28.06.2026', rendered)
            if key == 'yoklama.gec':
                self.assertIn('09:42', rendered)
            if key == 'yoklama.cikis':
                self.assertIn('17:30', rendered)


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


class AttendanceNotifyPreviewSendableTest(TestCase):
    """24s pencere uyarısı '0 veliye gönder' üretmemeli."""

    def setUp(self):
        from datetime import date

        from apps.kurum.domain.models import Kurum
        from apps.kutuphane.domain.models import AttendanceRecord, AttendanceSession, Library
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
        from apps.sube.domain.models import Sube

        self.kurum = Kurum.objects.create(ad='Yoklama Preview', kod='YPREV')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='YPREV-M')
        self.library = Library.objects.create(
            kurum_id=self.kurum.id, sube_id=self.sube.id, ad='Salon', kod='YP-1', kapasite=20,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Yılmaz', aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            veli_turu='anne',
            ad='Ayşe',
            soyad='Yılmaz',
            telefon='05551234567',
            varsayilan=True,
            sms_bildirimleri=['duyuru', 'devamsizlik'],
        )
        self.session = AttendanceSession.objects.create(
            library=self.library,
            tarih=date(2026, 8, 21),
            acan_id=1,
        )
        AttendanceRecord.objects.create(
            attendance_session=self.session,
            ogrenci_id=self.ogrenci.id,
            durum=AttendanceStatus.ABSENT,
            kaydeden_id=1,
        )
        self.service = AttendanceNotificationService()

    def test_closed_window_warning_keeps_recipient_sendable(self):
        preview = self.service.preview(
            self.kurum.id,
            self.session.id,
            AttendanceNotificationEventType.ABSENT,
        )
        self.assertEqual(preview.eligible_count, 1)
        self.assertEqual(preview.pending_count, 1)
        self.assertEqual(len(preview.recipients), 1)
        item = preview.recipients[0]
        self.assertEqual(item.veli_id, self.veli.id)
        self.assertFalse(item.skip_reason)
        self.assertTrue(item.body)
