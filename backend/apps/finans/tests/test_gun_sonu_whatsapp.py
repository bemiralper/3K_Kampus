from datetime import date, datetime, time
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.communication.application.notification_schedule_service import (
    GUN_SONU_EVENT,
    due_schedules,
    get_schedule,
    upsert_schedule,
)
from apps.communication.application.staff_recipient_service import replace_staff_recipients
from apps.finans.application.gun_sonu_whatsapp_service import GunSonuWhatsappService
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.mali_hesap_yetkilisi import MaliHesapYetkilisi
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel
from apps.roller.models import Role, UserRole
from apps.roller.seed import ensure_default_roles
from apps.sube.domain.models import Sube

User = get_user_model()


class GunSonuWhatsappTests(TestCase):
    def setUp(self):
        ensure_default_roles()
        self.kurum = Kurum.objects.create(ad='GS WA', kod='GSWA')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='GSWA-M')
        user = User.objects.create_user(username='gs_yon', password='x')
        UserRole.objects.create(
            user=user,
            role=Role.objects.get(code='kurum_yoneticisi'),
            kurum=self.kurum,
            must_change_password=False,
        )
        self.yonetici = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Yönetici',
            tc_kimlik_no='11111111110',
            user=user,
            cep_telefon='05321110000',
        )

    def test_preview_auto_blocks_only_selected_kind(self):
        upsert_schedule(
            self.kurum.id, GUN_SONU_EVENT, is_enabled=True, send_time='18:00',
            report_kinds='ozet',
        )
        ozet = GunSonuWhatsappService.preview(
            self.kurum.id, self.sube.id, rapor_tipi='ozet',
        )
        detay = GunSonuWhatsappService.preview(
            self.kurum.id, self.sube.id, rapor_tipi='detay',
        )
        self.assertTrue(ozet['auto_enabled'])
        self.assertTrue(ozet['auto_blocks'])
        self.assertTrue(detay['auto_enabled'])
        self.assertFalse(detay['auto_blocks'])
        self.assertEqual(ozet['report_kinds'], 'ozet')

    def test_preview_lists_managers_without_prior_save(self):
        preview = GunSonuWhatsappService.preview(self.kurum.id, self.sube.id)
        self.assertEqual(preview['count'], 1)
        self.assertEqual(preview['recipients'][0]['id'], self.yonetici.id)
        self.assertEqual(preview['recipients'][0]['telefon'], '05321110000')
        self.assertFalse(preview['auto_enabled'])
        self.assertFalse(preview['auto_blocks'])
        self.assertEqual(preview['report_kinds'], 'ozet')

    def test_preview_includes_kurum_mali_hesap_yetkilisi(self):
        hesap = MaliHesap.objects.create(sube=self.sube, ad='Kasa')
        yetkili = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Berk',
            soyad='Yetkili',
            tc_kimlik_no='11111111112',
            cep_telefon='05321110002',
        )
        MaliHesapYetkilisi.objects.create(
            kurum=self.kurum,
            mali_hesap=None,
            personel=yetkili,
            ad_soyad='Berk Yetkili',
            telefon='05321110002',
            rol='Muhasebe',
        )
        preview = GunSonuWhatsappService.preview(self.kurum.id, self.sube.id)
        phones = {row['telefon'] for row in preview['recipients']}
        self.assertIn('05321110000', phones)
        self.assertIn('05321110002', phones)
        self.assertTrue(
            any(row.get('mali_hesap_ad') == 'Tüm mali hesaplar' for row in preview['recipients']),
        )
        self.assertEqual(
            MaliHesapYetkilisi.objects.filter(kurum=self.kurum, mali_hesap__isnull=True).count(),
            1,
        )
        self.assertEqual(hesap.yetkililer.count(), 0)

    def test_preview_lists_muhasebe_staff(self):
        user = User.objects.create_user(username='gs_muh', password='x')
        UserRole.objects.create(
            user=user,
            role=Role.objects.get(code='muhasebe'),
            kurum=self.kurum,
            must_change_password=False,
        )
        muhasebe = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Can',
            soyad='Muhasebe',
            tc_kimlik_no='11111111111',
            user=user,
            cep_telefon='05321110001',
        )
        preview = GunSonuWhatsappService.preview(self.kurum.id, self.sube.id)
        ids = {row['id'] for row in preview['recipients']}
        self.assertIn(self.yonetici.id, ids)
        self.assertIn(muhasebe.id, ids)

    def _ozet_payload(self):
        return {
            'ozet_rapor': {
                'meta': {
                    'tarih': '23.08.2026',
                    'tarih_iso': '2026-08-23',
                    'sube': 'Merkez',
                    'sube_id': self.sube.id,
                },
                'gunluk_ozet': {
                    'toplam_alinan': 1500,
                    'toplam_tahsilat': 1200,
                    'toplam_gider': 200,
                    'toplam_iade': 50,
                },
            },
        }

    def test_manual_send_blocked_when_auto_enabled_for_that_report(self):
        replace_staff_recipients(self.kurum.id, GUN_SONU_EVENT, [self.yonetici.id])
        upsert_schedule(
            self.kurum.id, GUN_SONU_EVENT, is_enabled=True, send_time='18:00',
            report_kinds='ozet',
        )
        result = GunSonuWhatsappService.send(
            self.kurum.id, gun=date(2026, 8, 23), sube_id=self.sube.id,
            rapor_tipi='ozet',
        )
        self.assertFalse(result['success'])
        self.assertTrue(result['auto_enabled'])
        self.assertIn('otomatik gönderim', result['errors'][0].lower())

    @patch('apps.finans.application.gun_sonu_whatsapp_service.dispatch_event')
    @patch(
        'apps.finans.application.gun_sonu_whatsapp_service.GunSonuDetayExportService.render_pdf_bytes',
        return_value=b'%PDF-detay',
    )
    @patch(
        'apps.finans.application.gun_sonu_whatsapp_service.GunSonuExportService.render_pdf_bytes',
        return_value=b'%PDF-ozet',
    )
    @patch('apps.finans.application.gun_sonu_whatsapp_service.GunSonuDetayReportService.build_detay_rapor')
    @patch('apps.finans.application.gun_sonu_whatsapp_service.GunSonuReportService.build_ozet_rapor')
    def test_manual_detay_allowed_when_auto_is_ozet(
        self, mock_ozet, mock_detay, _pdf1, _pdf2, mock_dispatch,
    ):
        replace_staff_recipients(self.kurum.id, GUN_SONU_EVENT, [self.yonetici.id])
        upsert_schedule(
            self.kurum.id, GUN_SONU_EVENT, is_enabled=True, send_time='18:00',
            report_kinds='ozet',
        )
        mock_ozet.return_value = self._ozet_payload()
        mock_detay.return_value = {'detay_rapor': {'meta': {'tarih_iso': '2026-08-23'}}}
        mock_dispatch.return_value = type('R', (), {'success': True, 'errors': []})()

        result = GunSonuWhatsappService.send(
            self.kurum.id, gun=date(2026, 8, 23), sube_id=self.sube.id,
            rapor_tipi='detay',
        )
        self.assertTrue(result['success'])
        self.assertEqual(mock_dispatch.call_count, 1)
        self.assertEqual(
            mock_dispatch.call_args.kwargs['context']['rapor_ad'],
            'Gün Sonu Detay Raporu',
        )

    @patch('apps.finans.application.gun_sonu_whatsapp_service.dispatch_event')
    @patch(
        'apps.finans.application.gun_sonu_whatsapp_service.GunSonuExportService.render_pdf_bytes',
        return_value=b'%PDF-ozet',
    )
    @patch('apps.finans.application.gun_sonu_whatsapp_service.GunSonuDetayReportService.build_detay_rapor')
    @patch('apps.finans.application.gun_sonu_whatsapp_service.GunSonuReportService.build_ozet_rapor')
    def test_send_ozet_dispatches_one_message(
        self, mock_ozet, mock_detay, _pdf, mock_dispatch,
    ):
        replace_staff_recipients(self.kurum.id, GUN_SONU_EVENT, [self.yonetici.id])
        mock_ozet.return_value = self._ozet_payload()
        mock_dispatch.return_value = type('R', (), {'success': True, 'errors': []})()

        result = GunSonuWhatsappService.send(
            self.kurum.id, gun=date(2026, 8, 23), sube_id=self.sube.id,
            rapor_tipi='ozet',
        )
        self.assertTrue(result['success'])
        self.assertEqual(result['sent'], 1)
        self.assertEqual(mock_dispatch.call_count, 1)
        mock_detay.assert_not_called()
        call = mock_dispatch.call_args
        self.assertEqual(call.args[1], GUN_SONU_EVENT)
        self.assertEqual(call.kwargs['context']['rapor_ad'], 'Gün Sonu Raporu')
        self.assertIn('{{rapor_ad}}', call.kwargs['fallback_body'])
        self.assertIn('{{tarih}}', call.kwargs['fallback_body'])
        self.assertIn('{{toplam_giren}}', call.kwargs['fallback_body'])
        self.assertIn('{{toplam_cikan}}', call.kwargs['fallback_body'])
        self.assertEqual(call.kwargs['context']['toplam_giren'], '1.500')
        self.assertEqual(call.kwargs['context']['toplam_cikan'], '250')
        self.assertIn(':ozet:', call.kwargs['source'].ref_id)

    @patch('apps.finans.application.gun_sonu_whatsapp_service.dispatch_event')
    @patch(
        'apps.finans.application.gun_sonu_whatsapp_service.GunSonuDetayExportService.render_pdf_bytes',
        return_value=b'%PDF-detay',
    )
    @patch('apps.finans.application.gun_sonu_whatsapp_service.GunSonuDetayReportService.build_detay_rapor')
    @patch('apps.finans.application.gun_sonu_whatsapp_service.GunSonuReportService.build_ozet_rapor')
    def test_send_detay_dispatches_one_message(
        self, mock_ozet, mock_detay, _pdf, mock_dispatch,
    ):
        replace_staff_recipients(self.kurum.id, GUN_SONU_EVENT, [self.yonetici.id])
        mock_ozet.return_value = self._ozet_payload()
        mock_detay.return_value = {'detay_rapor': {'meta': {'tarih_iso': '2026-08-23'}}}
        mock_dispatch.return_value = type('R', (), {'success': True, 'errors': []})()

        result = GunSonuWhatsappService.send(
            self.kurum.id, gun=date(2026, 8, 23), sube_id=self.sube.id,
            rapor_tipi='detay',
        )
        self.assertTrue(result['success'])
        self.assertEqual(result['sent'], 1)
        self.assertEqual(mock_dispatch.call_count, 1)
        mock_detay.assert_called_once()
        call = mock_dispatch.call_args
        self.assertEqual(call.kwargs['context']['rapor_ad'], 'Gün Sonu Detay Raporu')
        self.assertIn(':detay:', call.kwargs['source'].ref_id)

    @patch.object(GunSonuWhatsappService, 'send')
    def test_send_for_schedule_uses_selected_kinds(self, mock_send):
        mock_send.return_value = {'sent': 1, 'errors': []}
        upsert_schedule(
            self.kurum.id, GUN_SONU_EVENT, is_enabled=True, send_time='18:00',
            report_kinds='ikisi',
        )
        from apps.communication.domain.models import NotificationAutoSchedule
        row = NotificationAutoSchedule.objects.get(
            kurum_id=self.kurum.id, event_key=GUN_SONU_EVENT,
        )
        GunSonuWhatsappService.send_for_schedule(row, gun=date(2026, 8, 23))
        kinds = [call.kwargs['rapor_tipi'] for call in mock_send.call_args_list]
        self.assertEqual(kinds, ['ozet', 'detay'])

    def test_schedule_due_after_send_time(self):
        upsert_schedule(self.kurum.id, GUN_SONU_EVENT, is_enabled=True, send_time='18:00')
        now = datetime(2026, 8, 23, 18, 1, tzinfo=ZoneInfo('Europe/Istanbul'))
        rows = list(due_schedules(now=now))
        self.assertEqual(len(rows), 1)

        now_early = datetime(2026, 8, 23, 17, 50, tzinfo=ZoneInfo('Europe/Istanbul'))
        self.assertEqual(list(due_schedules(now=now_early)), [])

    def test_schedule_not_due_twice_same_day(self):
        payload = upsert_schedule(
            self.kurum.id, GUN_SONU_EVENT, is_enabled=True, send_time='09:00',
        )
        self.assertEqual(payload['send_time'], '09:00')
        row = list(due_schedules(now=timezone.make_aware(
            datetime(2026, 8, 23, 10, 0), ZoneInfo('Europe/Istanbul'),
        )))[0]
        from apps.communication.application.notification_schedule_service import mark_sent
        mark_sent(row, date(2026, 8, 23))
        later = datetime(2026, 8, 23, 22, 0, tzinfo=ZoneInfo('Europe/Istanbul'))
        self.assertEqual(list(due_schedules(now=later)), [])

    def test_get_schedule_defaults(self):
        data = get_schedule(self.kurum.id, GUN_SONU_EVENT)
        self.assertFalse(data['is_enabled'])
        self.assertEqual(data['send_time'], '18:00')
        self.assertEqual(data['report_kinds'], 'ozet')

    def test_schedule_persists_report_kinds(self):
        payload = upsert_schedule(
            self.kurum.id, GUN_SONU_EVENT, is_enabled=True, send_time='18:00',
            report_kinds='detay',
        )
        self.assertEqual(payload['report_kinds'], 'detay')
        self.assertEqual(get_schedule(self.kurum.id, GUN_SONU_EVENT)['report_kinds'], 'detay')

        payload = upsert_schedule(
            self.kurum.id, GUN_SONU_EVENT, is_enabled=True, send_time='18:00',
            report_kinds='ikisi',
        )
        self.assertEqual(payload['report_kinds'], 'ikisi')
        self.assertEqual(get_schedule(self.kurum.id, GUN_SONU_EVENT)['report_kinds'], 'ikisi')
