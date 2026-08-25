"""İzinli öğrencinin yoklama durumu elle değiştirilebilir."""
from datetime import date

from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.kutuphane.application.service import AttendanceService
from apps.kutuphane.domain.models import (
    AttendanceRecord,
    AttendanceSession,
    AttendanceSessionStatus,
    AttendanceStatus,
    ExemptionType,
    Library,
    OgrenciIzin,
    SessionCode,
)
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube


class AttendanceIzinOverrideTest(TestCase):
    def setUp(self):
        self.tarih = date(2026, 8, 25)  # Salı
        self.kurum = Kurum.objects.create(ad='İzin Override', kod='IZOV')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='IZOV-M')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Elif', soyad='İzinli', aktif_mi=True,
        )
        self.library = Library.objects.create(
            kurum_id=self.kurum.id, sube_id=self.sube.id, ad='Salon', kod='IZ-1', kapasite=10,
        )
        OgrenciIzin.objects.create(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            library=self.library,
            izin_tipi=ExemptionType.FULL_DAY,
            gun=self.tarih.weekday(),
            baslangic_tarihi=self.tarih,
            bitis_tarihi=self.tarih,
            aktif_mi=True,
        )
        self.session = AttendanceSession.objects.create(
            library=self.library,
            periyot_kodu=SessionCode.MORNING,
            tarih=self.tarih,
            durum=AttendanceSessionStatus.OPEN,
            acan_id=1,
        )
        self.record = AttendanceRecord.objects.create(
            attendance_session=self.session,
            ogrenci_id=self.ogrenci.id,
            durum=AttendanceStatus.EXCUSED,
            izinli_mi=True,
            kaydeden_id=1,
        )
        self.service = AttendanceService()

    def test_record_attendance_keeps_manual_status(self):
        result = self.service.record_attendance(
            self.session.id,
            [{'ogrenci_id': self.ogrenci.id, 'durum': AttendanceStatus.PRESENT, 'notlar': 'Geldi'}],
            user_id=1,
        )
        self.assertEqual(result['saved'], 1)
        self.record.refresh_from_db()
        self.assertEqual(self.record.durum, AttendanceStatus.PRESENT)
        self.assertTrue(self.record.izinli_mi)
        self.assertEqual(self.record.notlar, 'Geldi')

    def test_reopen_detail_does_not_reset_manual_status(self):
        self.record.durum = AttendanceStatus.ABSENT
        self.record.izinli_mi = True
        self.record.save(update_fields=['durum', 'izinli_mi'])

        detail = self.service.get_session_detail(self.session.id)
        saved = next(r for r in detail['records'] if r.ogrenci_id == self.ogrenci.id)
        self.assertEqual(saved.durum, AttendanceStatus.ABSENT)
        self.assertTrue(saved.izinli_mi)

        self.record.refresh_from_db()
        self.assertEqual(self.record.durum, AttendanceStatus.ABSENT)

    def test_new_izin_still_auto_excuses_unmarked_student(self):
        self.record.izinli_mi = False
        self.record.durum = AttendanceStatus.PRESENT
        self.record.save(update_fields=['izinli_mi', 'durum'])

        detail = self.service.get_session_detail(self.session.id)
        saved = next(r for r in detail['records'] if r.ogrenci_id == self.ogrenci.id)
        self.assertEqual(saved.durum, AttendanceStatus.EXCUSED)
        self.assertTrue(saved.izinli_mi)
