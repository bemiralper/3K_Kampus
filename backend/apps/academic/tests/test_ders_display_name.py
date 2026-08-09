"""Ders görünen ad: plan.gorunen_ad → ders.kisa_ad → ders.ad"""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.program_grid_cell import ProgramGridCell
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.timeslot import SlotType, TimeSlot
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.domain.weekly_day import DayOfWeek, WeeklyDay
from apps.egitim_tanimlari.display import resolve_ders_display_name
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Role
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()


class DersDisplayNameTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='DN Kurum', kod='DNK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube', kod='DNK-A')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='9', kod='9', aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Fizik-1', kod='FIZ1', aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            ad='9-A', sinif_seviyesi=self.seviye, aktif_mi=True,
        )
        self.term = Term.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            name='Güz', code='GUZ', start_date=date(2025, 9, 1),
            end_date=date(2026, 1, 31), is_active=True,
        )
        self.plan = ClassLessonPlan.objects.create(
            egitim_yili=self.year, term=self.term, sinif=self.sinif,
            ders=self.ders, weekly_hours=2,
        )

    def test_resolve_priority(self):
        self.assertEqual(resolve_ders_display_name(ders=self.ders, plan=self.plan), 'Fizik-1')

        self.ders.kisa_ad = 'Fizik'
        self.ders.save(update_fields=['kisa_ad'])
        self.assertEqual(resolve_ders_display_name(ders=self.ders, plan=self.plan), 'Fizik')

        self.plan.gorunen_ad = 'Fizik Lab'
        self.plan.save(update_fields=['gorunen_ad'])
        self.assertEqual(resolve_ders_display_name(ders=self.ders, plan=self.plan), 'Fizik Lab')
        self.assertEqual(self.plan.display_name, 'Fizik Lab')

    def test_schedule_grid_uses_display_name(self):
        client = Client()
        user = User.objects.create_user(username='dndisp', password='test')
        user.is_superuser = True
        user.save(update_fields=['is_superuser'])
        client.force_login(user)

        template = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube, name='Şablon',
        )
        cycle = WeeklyCycle.objects.create(
            kurum=self.kurum, sube=self.sube, schedule_template=template,
            name='Takvim', is_active=True,
        )
        WeeklyDay.objects.create(
            weekly_cycle=cycle, day_of_week=DayOfWeek.MONDAY,
            name='Pazartesi', order=1, is_active=True,
        )
        TimeSlot.objects.create(
            schedule_template=template, name='1. Ders',
            start_time=time(8, 0), end_time=time(8, 40),
            order=1, slot_type=SlotType.LESSON, is_active=True,
        )
        version = ScheduleVersion.objects.create(
            egitim_yili=self.year, term=self.term,
            schedule_template=template, weekly_cycle=cycle,
            name='Taslak', is_active=True,
        )

        role, _ = Role.objects.get_or_create(
            code='ogretmen', defaults={'name': 'Öğretmen', 'is_system_role': True},
        )
        teacher = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Veli', aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            personel=teacher, egitim_yili=self.year, rol=role,
            gorev_sube=self.sube, kurum=self.kurum, aktif_mi=True,
        )
        self.ders.kisa_ad = 'Fizik'
        self.ders.save(update_fields=['kisa_ad'])
        self.plan.ogretmen = teacher
        self.plan.save(update_fields=['ogretmen'])

        headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }
        ensure = client.post(
            '/api/academic/program-grid/ensure-version/',
            data={'version_id': version.id, 'classroom_id': self.sinif.id},
            content_type='application/json',
            **headers,
        )
        self.assertIn(ensure.status_code, (200, 201), ensure.content)
        cell = ProgramGridCell.objects.get(schedule_version=version, sinif=self.sinif)
        fill = client.post(
            f'/api/academic/program-grid/cells/{cell.id}/fill/',
            data={'class_lesson_plan_id': self.plan.id},
            content_type='application/json',
            **headers,
        )
        self.assertEqual(fill.status_code, 200, fill.content)
        body = fill.json()
        self.assertEqual(body['lesson']['name'], 'Fizik')
        self.assertEqual(body['lesson']['full_name'], 'Fizik-1')

        grid = client.get(
            f'/api/academic/schedule/class/?classroom_id={self.sinif.id}'
            f'&term_id={self.term.id}&version_id={version.id}',
            **headers,
        )
        self.assertEqual(grid.status_code, 200, grid.content)
        filled = [c for c in grid.json()['cells'] if c['status'] == 'FILLED']
        self.assertEqual(filled[0]['lesson']['name'], 'Fizik')
        self.assertEqual(filled[0]['lesson']['full_name'], 'Fizik-1')

    def test_plan_teacher_change_syncs_grid_cells_and_api(self):
        from apps.academic.services.class_lesson_plan_service import ClassLessonPlanService

        client = Client()
        user = User.objects.create_user(username='dnteach', password='test')
        user.is_superuser = True
        user.save(update_fields=['is_superuser'])
        client.force_login(user)

        template = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube, name='Şablon T',
        )
        cycle = WeeklyCycle.objects.create(
            kurum=self.kurum, sube=self.sube, schedule_template=template,
            name='Takvim T', is_active=True,
        )
        WeeklyDay.objects.create(
            weekly_cycle=cycle, day_of_week=DayOfWeek.MONDAY,
            name='Pazartesi', order=1, is_active=True,
        )
        TimeSlot.objects.create(
            schedule_template=template, name='1. Ders',
            start_time=time(8, 0), end_time=time(8, 40),
            order=1, slot_type=SlotType.LESSON, is_active=True,
        )
        version = ScheduleVersion.objects.create(
            egitim_yili=self.year, term=self.term,
            schedule_template=template, weekly_cycle=cycle,
            name='Taslak', is_active=True,
        )
        role, _ = Role.objects.get_or_create(
            code='ogretmen', defaults={'name': 'Öğretmen', 'is_system_role': True},
        )
        teacher1 = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Bir', aktif_mi=True,
        )
        teacher2 = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='İki', aktif_mi=True,
        )
        for t in (teacher1, teacher2):
            PersonelGorevlendirme.objects.create(
                personel=t, egitim_yili=self.year, rol=role,
                gorev_sube=self.sube, kurum=self.kurum, aktif_mi=True,
            )
        self.plan.ogretmen = teacher1
        self.plan.save(update_fields=['ogretmen'])

        headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }
        ensure = client.post(
            '/api/academic/program-grid/ensure-version/',
            data={'version_id': version.id, 'classroom_id': self.sinif.id},
            content_type='application/json',
            **headers,
        )
        self.assertIn(ensure.status_code, (200, 201), ensure.content)
        cell = ProgramGridCell.objects.get(schedule_version=version, sinif=self.sinif)
        fill = client.post(
            f'/api/academic/program-grid/cells/{cell.id}/fill/',
            data={'class_lesson_plan_id': self.plan.id},
            content_type='application/json',
            **headers,
        )
        self.assertEqual(fill.status_code, 200, fill.content)
        cell.refresh_from_db()
        self.assertEqual(cell.ogretmen_id, teacher1.id)

        ClassLessonPlanService().update(self.plan.id, {'ogretmen_id': teacher2.id})
        cell.refresh_from_db()
        self.assertEqual(cell.ogretmen_id, teacher2.id)

        grid = client.get(
            f'/api/academic/schedule/class/?classroom_id={self.sinif.id}'
            f'&term_id={self.term.id}&version_id={version.id}',
            **headers,
        )
        self.assertEqual(grid.status_code, 200, grid.content)
        filled = [c for c in grid.json()['cells'] if c['status'] == 'FILLED']
        self.assertEqual(filled[0]['teacher']['id'], teacher2.id)
        self.assertIn('Ayşe', filled[0]['teacher']['name'])
