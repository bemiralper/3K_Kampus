"""Öğretmen uygunluğu — liste ekranının çalışma takvimi filtresi.

Liste, her öğretmenin varsayılan uygunluğunda tanımlı çalışma takvimlerini
döndürmek zorunda: "Çalışma Takvimi" filtresi bu alana göre daraltma yapıyor.
"""
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.teacher_availability import (
    AvailabilityKind,
    TeacherAvailabilityCalendar,
    TeacherAvailabilitySet,
)
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.egitim_tanimlari.models import Brans
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Role
from apps.sube.domain.models import Sube

User = get_user_model()


class TeacherAvailabilityListTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='TU Kurum', kod='TUK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='TUK-A')
        self.year = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='tuuser', password='test')
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        self.client.force_login(self.user)

        self.template = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube, name='Şablon',
        )
        self.hafta_ici = WeeklyCycle.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            schedule_template=self.template,
            name='Hafta İçi',
            is_active=True,
        )
        self.hafta_sonu = WeeklyCycle.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            schedule_template=self.template,
            name='Hafta Sonu',
            is_active=True,
        )

        self.role, _ = Role.objects.get_or_create(
            code='ogretmen',
            defaults={'name': 'Öğretmen', 'is_system_role': True},
        )
        self.brans = Brans.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MAT', aktif_mi=True,
        )

        self.with_calendar = self._teacher('Ayşe', 'Yılmaz')
        self.without_calendar = self._teacher('Mehmet', 'Demir')

        # Yalnızca ilk öğretmene hafta sonu takvimi tanımlı.
        avail_set = TeacherAvailabilitySet.objects.create(
            personel=self.with_calendar,
            kurum=self.kurum,
            sube=self.sube,
            kind=AvailabilityKind.DEFAULT,
            is_active=True,
        )
        TeacherAvailabilityCalendar.objects.create(
            availability_set=avail_set, weekly_cycle=self.hafta_sonu,
        )

        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }

    def _teacher(self, ad, soyad):
        personel = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad=ad, soyad=soyad, aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            personel=personel,
            egitim_yili=self.year,
            rol=self.role,
            brans=self.brans,
            gorev_sube=self.sube,
            kurum=self.kurum,
            aktif_mi=True,
        )
        return personel

    def _rows(self):
        res = self.client.get(
            '/api/academic/teacher-availability/teachers/', **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        return {r['id']: r for r in res.json()['data']}

    def test_list_reports_assigned_calendar_ids(self):
        rows = self._rows()
        self.assertEqual(
            rows[self.with_calendar.id]['calendar_ids'], [self.hafta_sonu.id],
        )
        self.assertEqual(rows[self.without_calendar.id]['calendar_ids'], [])

    def test_calendar_ids_distinguish_calendars(self):
        """Filtre başka bir takvimi seçerse öğretmen listede kalmamalı."""
        rows = self._rows()
        matching = [
            pid for pid, r in rows.items()
            if self.hafta_ici.id in r['calendar_ids']
        ]
        self.assertEqual(matching, [])
