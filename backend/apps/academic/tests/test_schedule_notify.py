"""Sınıf ders programı bildirimi — fingerprint, preview, send skip/force."""
from datetime import date, time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.application.schedule_notify_service import (
    EVENT_KEY,
    compute_grid_fingerprint,
    preview_classes,
    send_class_schedules,
)
from apps.academic.domain.class_schedule_notify_log import (
    ClassScheduleNotifyLog,
    ClassScheduleNotifyStatus,
)
from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.academic.domain.timeslot import SlotType, TimeSlot
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.domain.weekly_day import DayOfWeek, WeeklyDay
from apps.communication.application.academic_schedule_template_seed import (
    list_academic_schedule_template_drafts,
)
from apps.communication.application.communication_service import SendResult
from apps.communication.application.notification_events import get_event
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()


class ScheduleNotifyUnitTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='SN Kurum', kod='SNK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube', kod='SNK-A')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.template = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube, name='Şablon',
        )
        self.cycle = WeeklyCycle.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            schedule_template=self.template,
            name='Takvim',
            is_active=True,
        )
        self.day = WeeklyDay.objects.create(
            weekly_cycle=self.cycle,
            day_of_week=DayOfWeek.MONDAY,
            name='Pazartesi',
            order=1,
            is_active=True,
        )
        self.slot = TimeSlot.objects.create(
            schedule_template=self.template,
            name='1. Ders',
            start_time=time(8, 0),
            end_time=time(8, 40),
            order=1,
            slot_type=SlotType.LESSON,
            is_active=True,
        )
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='9', kod='9', aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MAT', aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            ad='9-A',
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        self.term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            name='Güz',
            code='GUZ',
            start_date=date(2025, 9, 1),
            end_date=date(2026, 1, 31),
            is_active=True,
        )
        self.version = ScheduleVersion.objects.create(
            egitim_yili=self.year,
            term=self.term,
            schedule_template=self.template,
            weekly_cycle=self.cycle,
            name='Aktif',
            is_active=True,
        )
        self.cell = ProgramGridCell.objects.create(
            schedule_template=self.template,
            weekly_cycle=self.cycle,
            schedule_version=self.version,
            weekly_day=self.day,
            timeslot=self.slot,
            sinif=self.sinif,
            ders=self.ders,
            status=CellStatus.FILLED,
            is_active=True,
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Yılmaz',
            aktif_mi=True,
            telefon='05551234567',
        )
        StudentClassPlacement.objects.create(
            academic_year=self.year,
            term=self.term,
            student=self.student,
            classroom=self.sinif,
            is_active=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.student,
            ad='Mehmet',
            soyad='Yılmaz',
            telefon='05557654321',
        )

    def test_event_catalog_and_seed_drafts(self):
        event = get_event(EVENT_KEY)
        self.assertIsNotNone(event)
        self.assertTrue(event.has_document)
        self.assertEqual(event.suggested_meta_name('VELI'), 'sinif_programi_veli')
        self.assertEqual(event.suggested_meta_name('OGRENCI'), 'sinif_programi_ogrenci')
        drafts = list_academic_schedule_template_drafts()
        self.assertEqual(len(drafts), 2)
        names = {d.meta_name for d in drafts}
        self.assertEqual(names, {'sinif_programi_veli', 'sinif_programi_ogrenci'})

    def test_fingerprint_changes_when_cell_updates(self):
        fp1 = compute_grid_fingerprint(self.version.id, self.sinif.id)
        self.cell.status = CellStatus.EMPTY
        self.cell.ders = None
        self.cell.save(update_fields=['status', 'ders', 'updated_at'])
        fp2 = compute_grid_fingerprint(self.version.id, self.sinif.id)
        self.assertNotEqual(fp1, fp2)

    def test_preview_first_send_has_changes(self):
        preview = preview_classes(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            term_id=self.term.id,
            version_id=self.version.id,
            sinif_ids=[self.sinif.id],
        )
        row = preview['classes'][0]
        self.assertTrue(row['has_changes'])
        self.assertFalse(row['empty_grid'])
        self.assertEqual(row['student_count'], 1)
        self.assertEqual(row['veli_count'], 1)
        self.assertTrue(row['default_selected'])

    def test_preview_warns_when_unchanged_after_send(self):
        fp = compute_grid_fingerprint(self.version.id, self.sinif.id)
        ClassScheduleNotifyLog.objects.create(
            kurum=self.kurum,
            term=self.term,
            schedule_version=self.version,
            sinif=self.sinif,
            grid_fingerprint=fp,
            veli_count=1,
            ogrenci_count=1,
            status=ClassScheduleNotifyStatus.SENT,
        )
        preview = preview_classes(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            term_id=self.term.id,
            version_id=self.version.id,
            sinif_ids=[self.sinif.id],
        )
        row = preview['classes'][0]
        self.assertFalse(row['has_changes'])
        self.assertIn('değişiklik yok', (row['warning'] or '').lower())
        self.assertFalse(row['default_selected'])

    @patch('apps.academic.application.schedule_notify_service.dispatch_event')
    @patch('apps.academic.application.schedule_notify_service.render_class_schedule_pdf')
    def test_send_skips_unchanged_without_force(self, mock_pdf, mock_dispatch):
        mock_pdf.return_value = (b'%PDF-test', 'ders.pdf', 'Program')
        mock_dispatch.return_value = SendResult(success=True)
        fp = compute_grid_fingerprint(self.version.id, self.sinif.id)
        ClassScheduleNotifyLog.objects.create(
            kurum=self.kurum,
            term=self.term,
            schedule_version=self.version,
            sinif=self.sinif,
            grid_fingerprint=fp,
            veli_count=1,
            ogrenci_count=1,
            status=ClassScheduleNotifyStatus.SENT,
        )
        result = send_class_schedules(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            term_id=self.term.id,
            version_id=self.version.id,
            sinif_ids=[self.sinif.id],
        )
        self.assertEqual(result['total_skipped'], 1)
        self.assertEqual(result['total_veli_sent'], 0)
        mock_dispatch.assert_not_called()

    @patch('apps.academic.application.schedule_notify_service.dispatch_event')
    @patch('apps.academic.application.schedule_notify_service.render_class_schedule_pdf')
    def test_send_force_unchanged(self, mock_pdf, mock_dispatch):
        mock_pdf.return_value = (b'%PDF-test', 'ders.pdf', 'Program')
        mock_dispatch.return_value = SendResult(success=True)
        fp = compute_grid_fingerprint(self.version.id, self.sinif.id)
        ClassScheduleNotifyLog.objects.create(
            kurum=self.kurum,
            term=self.term,
            schedule_version=self.version,
            sinif=self.sinif,
            grid_fingerprint=fp,
            veli_count=1,
            ogrenci_count=1,
            status=ClassScheduleNotifyStatus.SENT,
        )
        result = send_class_schedules(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            term_id=self.term.id,
            version_id=self.version.id,
            sinif_ids=[self.sinif.id],
            force_unchanged_ids=[self.sinif.id],
        )
        self.assertEqual(result['total_skipped'], 0)
        self.assertGreaterEqual(result['total_veli_sent'], 1)
        self.assertGreaterEqual(result['total_ogrenci_sent'], 1)
        self.assertTrue(mock_dispatch.called)
        self.assertTrue(
            ClassScheduleNotifyLog.objects.filter(
                sinif=self.sinif,
                status=ClassScheduleNotifyStatus.SENT,
            ).count()
            >= 2,
        )


class ScheduleNotifyApiTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='SN API', kod='SNP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube', kod='SNP-A')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='snapi', password='x')
        role, _ = Role.objects.get_or_create(
            code='kurum_yoneticisi',
            defaults={'name': 'Yönetici', 'level': 10, 'is_system_role': True},
        )
        perm, _ = Permission.objects.get_or_create(
            code='communication.manage',
            defaults={
                'name': 'İletişim Yönetimi',
                'module': 'communication',
                'permission_type': 'manage',
            },
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
        UserRole.objects.update_or_create(user=self.user, defaults={'role': role})
        self.client.force_login(self.user)

        self.template = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube, name='Şablon',
        )
        self.cycle = WeeklyCycle.objects.create(
            kurum=self.kurum, sube=self.sube, schedule_template=self.template,
            name='Takvim', is_active=True,
        )
        self.day = WeeklyDay.objects.create(
            weekly_cycle=self.cycle, day_of_week=DayOfWeek.MONDAY,
            name='Pazartesi', order=1, is_active=True,
        )
        self.slot = TimeSlot.objects.create(
            schedule_template=self.template, name='1', start_time=time(8, 0),
            end_time=time(8, 40), order=1, slot_type=SlotType.LESSON, is_active=True,
        )
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='10', kod='10', aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Fizik', kod='FIZ', aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            ad='10-B', sinif_seviyesi=self.seviye, aktif_mi=True,
        )
        self.term = Term.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            name='Bahar', code='BAH', start_date=date(2026, 2, 1),
            end_date=date(2026, 6, 15), is_active=True,
        )
        self.version = ScheduleVersion.objects.create(
            egitim_yili=self.year, term=self.term, schedule_template=self.template,
            weekly_cycle=self.cycle, name='V1', is_active=True,
        )
        ProgramGridCell.objects.create(
            schedule_template=self.template, weekly_cycle=self.cycle,
            schedule_version=self.version, weekly_day=self.day, timeslot=self.slot,
            sinif=self.sinif, ders=self.ders, status=CellStatus.FILLED, is_active=True,
        )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }

    def test_preview_api(self):
        res = self.client.post(
            '/api/academic/schedule/notify/preview/',
            data={
                'term_id': self.term.id,
                'version_id': self.version.id,
                'sinif_ids': [self.sinif.id],
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(len(body['classes']), 1)
        self.assertTrue(body['classes'][0]['has_changes'])
