"""Kütüphane izni akademik yoklama rosterına yansımalı."""
from datetime import date

from django.test import TestCase

from apps.academic.domain.class_period_attendance import (
    ClassPeriodAttendanceRecord,
    ClassPeriodAttendanceSession,
    ClassPeriodCode,
)
from apps.academic.domain.lesson_attendance import StudentAttendanceStatus
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.academic.services.class_period_attendance_service import get_or_build_period_roster
from apps.academic.services.kutuphane_izin import sync_academic_attendance_for_student
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.kutuphane.application.service import OgrenciIzinService
from apps.kutuphane.domain.models import ExemptionType, IzinTekrarModu, SessionCode
from apps.ogrenci.domain.models import Ogrenci
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term


class KutuphaneIzinAcademicRosterTest(TestCase):
    def setUp(self):
        self.tarih = date(2026, 3, 16)  # Pazartesi
        self.kurum = Kurum.objects.create(ad='İzin Akademik', kod='IZA')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube', kod='IZA-A')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='9', kod='9', aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            ad='9-A', sinif_seviyesi=self.seviye, aktif_mi=True,
        )
        self.term = Term.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            name='Güz', code='GUZ',
            start_date=date(2025, 9, 1), end_date=date(2026, 6, 15),
            is_active=True,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Can', soyad='Demir', aktif_mi=True,
        )
        StudentClassPlacement.objects.create(
            academic_year=self.year,
            term=self.term,
            classroom=self.sinif,
            student=self.ogrenci,
            is_active=True,
        )
        self.session = ClassPeriodAttendanceSession.objects.create(
            egitim_yili=self.year,
            term=self.term,
            sinif=self.sinif,
            session_date=self.tarih,
            period=ClassPeriodCode.MORNING,
        )
        self.svc = OgrenciIzinService()

    def test_roster_shows_excused_without_saved_record(self):
        self.svc.create_izin({
            'ogrenci_id': self.ogrenci.id,
            'kurum_id': self.kurum.id,
            'izin_tipi': ExemptionType.PERIOD,
            'tekrar_modu': IzinTekrarModu.RANGE,
            'periyot_kodu': SessionCode.MORNING,
            'baslangic_tarihi': self.tarih,
            'bitis_tarihi': self.tarih,
            'sebep_kodu': 'HASTALIK',
            'sebep': 'Ateş',
        }, user_id=1)
        roster = get_or_build_period_roster(self.session)
        row = next(r for r in roster if r['student_id'] == self.ogrenci.id)
        self.assertEqual(row['status'], StudentAttendanceStatus.EXCUSED)
        self.assertTrue(row['izinli_mi'])
        self.assertIn('Ateş', row['izin_sebep'])

    def test_evening_izin_does_not_excuse_morning_class(self):
        self.svc.create_izin({
            'ogrenci_id': self.ogrenci.id,
            'kurum_id': self.kurum.id,
            'izin_tipi': ExemptionType.PERIOD,
            'tekrar_modu': IzinTekrarModu.RANGE,
            'periyot_kodu': SessionCode.EVENING,
            'baslangic_tarihi': self.tarih,
            'bitis_tarihi': self.tarih,
        }, user_id=1)
        roster = get_or_build_period_roster(self.session)
        row = next(r for r in roster if r['student_id'] == self.ogrenci.id)
        self.assertEqual(row['status'], StudentAttendanceStatus.PRESENT)
        self.assertFalse(row['izinli_mi'])

    def test_manual_present_not_overwritten_on_sync(self):
        rec = ClassPeriodAttendanceRecord.objects.create(
            session=self.session,
            student=self.ogrenci,
            status=StudentAttendanceStatus.PRESENT,
            izinli_mi=True,
        )
        self.svc.create_izin({
            'ogrenci_id': self.ogrenci.id,
            'kurum_id': self.kurum.id,
            'izin_tipi': ExemptionType.PERIOD,
            'tekrar_modu': IzinTekrarModu.RANGE,
            'periyot_kodu': SessionCode.MORNING,
            'baslangic_tarihi': self.tarih,
            'bitis_tarihi': self.tarih,
        }, user_id=1)
        rec.refresh_from_db()
        self.assertEqual(rec.status, StudentAttendanceStatus.PRESENT)
        self.assertTrue(rec.izinli_mi)

    def test_delete_izin_reverts_auto_excused_record(self):
        izin = self.svc.create_izin({
            'ogrenci_id': self.ogrenci.id,
            'kurum_id': self.kurum.id,
            'izin_tipi': ExemptionType.FULL_DAY,
            'tekrar_modu': IzinTekrarModu.RANGE,
            'baslangic_tarihi': self.tarih,
            'bitis_tarihi': self.tarih,
        }, user_id=1)
        rec = ClassPeriodAttendanceRecord.objects.create(
            session=self.session,
            student=self.ogrenci,
            status=StudentAttendanceStatus.EXCUSED,
            izinli_mi=True,
        )
        sync_academic_attendance_for_student(self.ogrenci.id, self.kurum.id, tarih=self.tarih)
        rec.refresh_from_db()
        self.assertEqual(rec.status, StudentAttendanceStatus.EXCUSED)

        self.svc.delete_izin(izin.id, user_id=1)
        rec.refresh_from_db()
        self.assertEqual(rec.status, StudentAttendanceStatus.PRESENT)
        self.assertFalse(rec.izinli_mi)
