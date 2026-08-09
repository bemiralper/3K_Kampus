"""Ders programı — versiyonlu grid iskeleti ve elle yerleştirme."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.timeslot import SlotType, TimeSlot
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.domain.weekly_day import DayOfWeek, WeeklyDay
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Role
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()


class DersProgramiGridApiTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='DP Kurum', kod='DPK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='DPK-A')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='dpuser', password='test')
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        self.client.force_login(self.user)

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
            name='Taslak',
            is_active=True,
        )
        self.plan = ClassLessonPlan.objects.create(
            egitim_yili=self.year,
            term=self.term,
            sinif=self.sinif,
            ders=self.ders,
            weekly_hours=2,
        )

        role, _ = Role.objects.get_or_create(
            code='ogretmen',
            defaults={'name': 'Öğretmen', 'is_system_role': True},
        )
        self.teacher = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Veli', aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            personel=self.teacher,
            egitim_yili=self.year,
            rol=role,
            gorev_sube=self.sube,
            kurum=self.kurum,
            aktif_mi=True,
        )
        self.plan.ogretmen = self.teacher
        self.plan.save(update_fields=['ogretmen'])

        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }

    def test_ensure_version_creates_cells(self):
        res = self.client.post(
            '/api/academic/program-grid/ensure-version/',
            data={'version_id': self.version.id, 'classroom_id': self.sinif.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertIn(res.status_code, (200, 201), res.content)
        body = res.json()
        self.assertEqual(body['created_count'], 1)
        self.assertTrue(
            ProgramGridCell.objects.filter(
                schedule_version=self.version,
                sinif=self.sinif,
                status=CellStatus.EMPTY,
            ).exists()
        )

    def test_swap_filled_cells(self):
        ensure = self.client.post(
            '/api/academic/program-grid/ensure-version/',
            data={'version_id': self.version.id, 'classroom_id': self.sinif.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertIn(ensure.status_code, (200, 201), ensure.content)

        # İkinci slot + plan
        from apps.academic.domain.timeslot import SlotType, TimeSlot
        slot2 = TimeSlot.objects.create(
            schedule_template=self.template,
            name='2. Ders',
            start_time=time(8, 50),
            end_time=time(9, 30),
            order=2,
            slot_type=SlotType.LESSON,
            is_active=True,
        )
        ensure2 = self.client.post(
            '/api/academic/program-grid/ensure-version/',
            data={'version_id': self.version.id, 'classroom_id': self.sinif.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertIn(ensure2.status_code, (200, 201), ensure2.content)

        ders2 = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Fizik', kod='FIZ', aktif_mi=True,
        )
        teacher2 = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Demir', aktif_mi=True,
        )
        plan2 = ClassLessonPlan.objects.create(
            egitim_yili=self.year,
            term=self.term,
            sinif=self.sinif,
            ders=ders2,
            weekly_hours=2,
            ogretmen=teacher2,
        )

        cell1 = ProgramGridCell.objects.get(
            schedule_version=self.version, sinif=self.sinif, timeslot=self.slot,
        )
        cell2 = ProgramGridCell.objects.get(
            schedule_version=self.version, sinif=self.sinif, timeslot=slot2,
        )
        self.assertEqual(
            self.client.post(
                f'/api/academic/program-grid/cells/{cell1.id}/fill/',
                data={'class_lesson_plan_id': self.plan.id},
                content_type='application/json',
                **self.headers,
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(
                f'/api/academic/program-grid/cells/{cell2.id}/fill/',
                data={'class_lesson_plan_id': plan2.id},
                content_type='application/json',
                **self.headers,
            ).status_code,
            200,
        )

        swap = self.client.post(
            '/api/academic/program-grid/cells/swap/',
            data={'source_cell_id': cell1.id, 'target_cell_id': cell2.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(swap.status_code, 200, swap.content)
        cell1.refresh_from_db()
        cell2.refresh_from_db()
        self.assertEqual(cell1.class_lesson_plan_id, plan2.id)
        self.assertEqual(cell2.class_lesson_plan_id, self.plan.id)
        self.assertEqual(cell1.ders_id, ders2.id)
        self.assertEqual(cell2.ders_id, self.ders.id)

    def test_fill_and_clear_cell(self):
        ensure = self.client.post(
            '/api/academic/program-grid/ensure-version/',
            data={'version_id': self.version.id, 'classroom_id': self.sinif.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertIn(ensure.status_code, (200, 201), ensure.content)
        cell = ProgramGridCell.objects.get(schedule_version=self.version, sinif=self.sinif)

        fill = self.client.post(
            f'/api/academic/program-grid/cells/{cell.id}/fill/',
            data={'class_lesson_plan_id': self.plan.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(fill.status_code, 200, fill.content)
        cell.refresh_from_db()
        self.assertEqual(cell.status, CellStatus.FILLED)
        self.assertEqual(cell.ders_id, self.ders.id)
        self.assertEqual(cell.ogretmen_id, self.teacher.id)

        class_view = self.client.get(
            f'/api/academic/schedule/class/?classroom_id={self.sinif.id}'
            f'&term_id={self.term.id}&version_id={self.version.id}',
            **self.headers,
        )
        self.assertEqual(class_view.status_code, 200)
        cells = class_view.json().get('cells', [])
        self.assertEqual(len(cells), 1)
        self.assertEqual(cells[0]['status'], 'FILLED')

        clear = self.client.post(
            f'/api/academic/program-grid/cells/{cell.id}/clear/',
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(clear.status_code, 200, clear.content)
        cell.refresh_from_db()
        self.assertEqual(cell.status, CellStatus.EMPTY)
        self.assertIsNone(cell.ders_id)

    def test_fill_rejects_over_weekly_hours(self):
        self.plan.weekly_hours = 1
        self.plan.save(update_fields=['weekly_hours'])
        # İkinci slot — limit 1 saat
        from datetime import time as dtime
        slot2 = TimeSlot.objects.create(
            schedule_template=self.template,
            name='2. Ders',
            start_time=dtime(8, 50),
            end_time=dtime(9, 30),
            order=2,
            slot_type=SlotType.LESSON,
            is_active=True,
        )
        self.client.post(
            '/api/academic/program-grid/ensure-version/',
            data={'version_id': self.version.id, 'classroom_id': self.sinif.id},
            content_type='application/json',
            **self.headers,
        )
        cells = list(
            ProgramGridCell.objects.filter(
                schedule_version=self.version, sinif=self.sinif,
            ).order_by('timeslot__order')
        )
        self.assertGreaterEqual(len(cells), 2)
        first = self.client.post(
            f'/api/academic/program-grid/cells/{cells[0].id}/fill/',
            data={'class_lesson_plan_id': self.plan.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(first.status_code, 200, first.content)
        second = self.client.post(
            f'/api/academic/program-grid/cells/{cells[1].id}/fill/',
            data={'class_lesson_plan_id': self.plan.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(second.status_code, 400)
        self.assertIn('haftalık', second.json().get('error', '').lower())

    def test_fill_rejects_locked_version(self):
        self.client.post(
            '/api/academic/program-grid/ensure-version/',
            data={'version_id': self.version.id, 'classroom_id': self.sinif.id},
            content_type='application/json',
            **self.headers,
        )
        cell = ProgramGridCell.objects.get(schedule_version=self.version, sinif=self.sinif)
        self.version.is_locked = True
        self.version.save(update_fields=['is_locked'])

        fill = self.client.post(
            f'/api/academic/program-grid/cells/{cell.id}/fill/',
            data={'class_lesson_plan_id': self.plan.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(fill.status_code, 400)

    def test_ensure_version_uses_day_level_template(self):
        """Yeni takvimler cycle.schedule_template=null; şablon gün satırında."""
        yaz = WeeklyCycle.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            schedule_template=None,
            name='Yaz Kursu',
            is_active=True,
        )
        yaz_day = WeeklyDay.objects.create(
            weekly_cycle=yaz,
            day_of_week=DayOfWeek.MONDAY,
            name='Pazartesi',
            order=1,
            is_active=True,
            schedule_template=self.template,
        )
        self.assertIsNone(yaz.schedule_template_id)
        self.assertEqual(yaz.primary_schedule_template(), self.template)

        version = ScheduleVersion.objects.create(
            egitim_yili=self.year,
            term=self.term,
            schedule_template=self.template,
            weekly_cycle=yaz,
            name='Yaz Taslak',
            is_active=False,
        )
        res = self.client.post(
            '/api/academic/program-grid/ensure-version/',
            data={'version_id': version.id, 'classroom_id': self.sinif.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertIn(res.status_code, (200, 201), res.content)
        self.assertEqual(res.json()['created_count'], 1)
        cell = ProgramGridCell.objects.get(schedule_version=version, sinif=self.sinif)
        self.assertEqual(cell.weekly_day_id, yaz_day.id)
        self.assertEqual(cell.timeslot_id, self.slot.id)
        self.assertEqual(cell.schedule_template_id, self.template.id)

    def test_ensure_version_falls_back_to_version_template(self):
        """Gün şablonu boş olsa bile version.schedule_template ile grid üretilir."""
        cal = WeeklyCycle.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            schedule_template=None,
            name='Eksik Gün Şablonu',
            is_active=True,
        )
        day = WeeklyDay.objects.create(
            weekly_cycle=cal,
            day_of_week=DayOfWeek.TUESDAY,
            name='Salı',
            order=1,
            is_active=True,
            schedule_template=None,
        )
        version = ScheduleVersion.objects.create(
            egitim_yili=self.year,
            term=self.term,
            schedule_template=self.template,
            weekly_cycle=cal,
            name='Fallback Taslak',
            is_active=False,
        )
        res = self.client.post(
            '/api/academic/program-grid/ensure-version/',
            data={'version_id': version.id, 'classroom_id': self.sinif.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertIn(res.status_code, (200, 201), res.content)
        self.assertEqual(res.json()['created_count'], 1)
        cell = ProgramGridCell.objects.get(schedule_version=version, sinif=self.sinif)
        self.assertEqual(cell.weekly_day_id, day.id)
        self.assertEqual(cell.timeslot_id, self.slot.id)

    def test_ensure_version_errors_when_template_has_no_slots(self):
        empty_tpl = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube, name='Boş Şablon',
        )
        cal = WeeklyCycle.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            schedule_template=None,
            name='Boş Slot Takvim',
            is_active=True,
        )
        WeeklyDay.objects.create(
            weekly_cycle=cal,
            day_of_week=DayOfWeek.WEDNESDAY,
            name='Çarşamba',
            order=1,
            is_active=True,
            schedule_template=empty_tpl,
        )
        version = ScheduleVersion.objects.create(
            egitim_yili=self.year,
            term=self.term,
            schedule_template=empty_tpl,
            weekly_cycle=cal,
            name='Boş Slot Taslak',
            is_active=False,
        )
        res = self.client.post(
            '/api/academic/program-grid/ensure-version/',
            data={'version_id': version.id, 'classroom_id': self.sinif.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('ders saati', res.json().get('error', '').lower())

    def test_schedule_export_json_and_xlsx(self):
        ensure = self.client.post(
            '/api/academic/program-grid/ensure-version/',
            data={'version_id': self.version.id, 'classroom_id': self.sinif.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertIn(ensure.status_code, (200, 201), ensure.content)
        cell = ProgramGridCell.objects.get(schedule_version=self.version, sinif=self.sinif)
        fill = self.client.post(
            f'/api/academic/program-grid/cells/{cell.id}/fill/',
            data={'class_lesson_plan_id': self.plan.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(fill.status_code, 200, fill.content)

        js = self.client.get(
            f'/api/academic/schedule/export/?term_id={self.term.id}'
            f'&version_id={self.version.id}&classroom_ids={self.sinif.id}&export_format=json',
            **self.headers,
        )
        self.assertEqual(js.status_code, 200, js.content)
        body = js.json()
        self.assertEqual(len(body['groups']), 1)
        self.assertEqual(body['groups'][0]['classroom_id'], self.sinif.id)
        self.assertGreaterEqual(body['groups'][0]['filled_count'], 1)

        xlsx = self.client.get(
            f'/api/academic/schedule/export/?term_id={self.term.id}'
            f'&version_id={self.version.id}&classroom_ids={self.sinif.id}'
            f'&export_format=xlsx&layout=per_class_sheet',
            **self.headers,
        )
        self.assertEqual(xlsx.status_code, 200, xlsx.content)
        self.assertIn(
            'spreadsheetml',
            xlsx.get('Content-Type', ''),
        )
        self.assertIn(
            'DersProgrami_',
            xlsx.get('Content-Disposition', ''),
        )

        full = self.client.get(
            f'/api/academic/schedule/export/?term_id={self.term.id}'
            f'&version_id={self.version.id}&classroom_ids={self.sinif.id}'
            f'&export_format=json&teacher_display=full',
            **self.headers,
        )
        self.assertEqual(full.status_code, 200, full.content)
        full_cell = next(
            c for g in full.json()['groups'] for r in g['rows'] for c in r['cells'] if c
        )
        self.assertIn('Ali', full_cell['teacher'])
        self.assertEqual(full.json()['teacher_display'], 'full')

        initials = self.client.get(
            f'/api/academic/schedule/export/?term_id={self.term.id}'
            f'&version_id={self.version.id}&classroom_ids={self.sinif.id}'
            f'&export_format=json&teacher_display=initials',
            **self.headers,
        )
        self.assertEqual(initials.status_code, 200, initials.content)
        init_cell = next(
            c for g in initials.json()['groups'] for r in g['rows'] for c in r['cells'] if c
        )
        self.assertEqual(init_cell['teacher'], 'A. V.')

        hidden = self.client.get(
            f'/api/academic/schedule/export/?term_id={self.term.id}'
            f'&version_id={self.version.id}&classroom_ids={self.sinif.id}'
            f'&export_format=json&teacher_display=hidden',
            **self.headers,
        )
        self.assertEqual(hidden.status_code, 200, hidden.content)
        hid_cell = next(
            c for g in hidden.json()['groups'] for r in g['rows'] for c in r['cells'] if c
        )
        self.assertEqual(hid_cell['teacher'], '')
        self.assertEqual(hid_cell['label'], 'Matematik')
