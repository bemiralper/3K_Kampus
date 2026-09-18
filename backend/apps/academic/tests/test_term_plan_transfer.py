"""Yaz kursu / yanlış dönem planlarını başka döneme kopyalama."""
from datetime import date, time

from django.test import TestCase

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.timeslot import SlotType, TimeSlot
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.domain.weekly_day import DayOfWeek, WeeklyDay
from apps.academic.services.term_plan_transfer_service import (
    TermPlanTransferError,
    transfer_term_plans,
)
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term


class TermPlanTransferTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='3K Keşif', kod='KESIF')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KES-M')
        self.year_src = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.year_dst = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='9', kod='9', aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MAT', aktif_mi=True,
        )
        self.src_term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year_src,
            name='Yaz Kursu',
            code='YAZ',
            term_type='summer',
            start_date=date(2026, 6, 15),
            end_date=date(2026, 8, 31),
            is_active=True,
        )
        self.dst_term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year_dst,
            name='1. Dönem',
            code='D1',
            start_date=date(2026, 9, 1),
            end_date=date(2027, 1, 31),
            is_active=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year_src,
            term=self.src_term,
            ad='9-A',
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        self.plan = ClassLessonPlan.objects.create(
            egitim_yili=self.year_src,
            term=self.src_term,
            sinif=self.sinif,
            ders=self.ders,
            weekly_hours=4,
        )
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
            schedule_template=self.template, name='1. Ders',
            start_time=time(8, 0), end_time=time(8, 40),
            order=1, slot_type=SlotType.LESSON, is_active=True,
        )
        self.version = ScheduleVersion.objects.create(
            egitim_yili=self.year_src, term=self.src_term,
            schedule_template=self.template, weekly_cycle=self.cycle,
            name='Yaz program', is_active=True,
        )
        ProgramGridCell.objects.create(
            schedule_template=self.template,
            weekly_cycle=self.cycle,
            schedule_version=self.version,
            weekly_day=self.day,
            timeslot=self.slot,
            sinif=self.sinif,
            ders=self.ders,
            class_lesson_plan=self.plan,
            status=CellStatus.FILLED,
            is_active=True,
        )

    def test_dry_run_does_not_write(self):
        report = transfer_term_plans(
            source_term=self.src_term, target_term=self.dst_term, dry_run=True,
        )
        self.assertEqual(report.classrooms_copied, 1)
        self.assertEqual(report.plans_copied, 1)
        self.assertEqual(report.cells_copied, 1)
        self.assertFalse(Sinif.objects.filter(term=self.dst_term).exists())
        self.assertFalse(ClassLessonPlan.objects.filter(term=self.dst_term).exists())

    def test_copy_creates_class_plan_and_cell(self):
        report = transfer_term_plans(
            source_term=self.src_term, target_term=self.dst_term, dry_run=False,
        )
        self.assertEqual(report.classrooms_copied, 1)
        self.assertEqual(report.plans_copied, 1)
        self.assertEqual(report.cells_copied, 1)

        self.assertTrue(Sinif.objects.filter(id=self.sinif.id, term=self.src_term).exists())
        new_class = Sinif.objects.get(term=self.dst_term, ad='9-A')
        self.assertEqual(new_class.egitim_yili_id, self.year_dst.id)
        new_plan = ClassLessonPlan.objects.get(term=self.dst_term, sinif=new_class)
        self.assertEqual(new_plan.weekly_hours, 4)
        self.assertEqual(new_plan.ders_id, self.ders.id)
        cell = ProgramGridCell.objects.get(
            schedule_version__term=self.dst_term, sinif=new_class,
        )
        self.assertEqual(cell.status, CellStatus.FILLED)
        self.assertEqual(cell.class_lesson_plan_id, new_plan.id)

    def test_copy_skips_existing_name_but_fills_missing_plan(self):
        dest = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year_dst,
            term=self.dst_term, ad='9-A', aktif_mi=True,
        )
        report = transfer_term_plans(
            source_term=self.src_term, target_term=self.dst_term, dry_run=False,
        )
        self.assertEqual(report.classrooms_skipped, 1)
        self.assertEqual(ClassLessonPlan.objects.filter(term=self.dst_term, sinif=dest).count(), 1)

    def test_move_repoints_same_rows(self):
        report = transfer_term_plans(
            source_term=self.src_term, target_term=self.dst_term,
            mode='move', dry_run=False,
        )
        self.assertEqual(report.classrooms_moved, 1)
        self.sinif.refresh_from_db()
        self.plan.refresh_from_db()
        self.version.refresh_from_db()
        self.assertEqual(self.sinif.term_id, self.dst_term.id)
        self.assertEqual(self.sinif.egitim_yili_id, self.year_dst.id)
        self.assertEqual(self.plan.term_id, self.dst_term.id)
        self.assertEqual(self.version.term_id, self.dst_term.id)
        self.assertFalse(Sinif.objects.filter(term=self.src_term, aktif_mi=True).exists())

    def test_move_aborts_on_name_collision(self):
        Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year_dst,
            term=self.dst_term, ad='9-A', aktif_mi=True,
        )
        with self.assertRaises(TermPlanTransferError):
            transfer_term_plans(
                source_term=self.src_term, target_term=self.dst_term,
                mode='move', dry_run=False,
            )
