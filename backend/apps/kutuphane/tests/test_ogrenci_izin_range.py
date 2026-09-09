"""Tarih aralığı / haftalık izin eşleşmesi ve bitiş zorunluluğu."""
from datetime import date

from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.kutuphane.application.service import OgrenciIzinService
from apps.kutuphane.domain.models import (
    ExemptionType,
    IzinTekrarModu,
    OgrenciIzin,
    SessionCode,
)
from apps.kutuphane.infrastructure.repository import OgrenciIzinRepository
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube


class OgrenciIzinRangeTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='İzin Range', kod='IZR')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='IZR-M')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ada', soyad='Yılmaz', aktif_mi=True,
        )
        self.svc = OgrenciIzinService()

    def test_range_covers_only_days_inside_window(self):
        OgrenciIzin.objects.create(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            izin_tipi=ExemptionType.PERIOD,
            tekrar_modu=IzinTekrarModu.RANGE,
            periyot_kodu=SessionCode.MORNING,
            baslangic_tarihi=date(2026, 3, 15),
            bitis_tarihi=date(2026, 3, 17),
            aktif_mi=True,
        )
        self.assertTrue(self.svc.is_student_exempted(
            self.ogrenci.id, date(2026, 3, 16), SessionCode.MORNING, ignore_library=True,
        ))
        self.assertFalse(self.svc.is_student_exempted(
            self.ogrenci.id, date(2026, 3, 16), SessionCode.EVENING, ignore_library=True,
        ))
        # 23 Mart pazartesi — aralık dışı
        self.assertFalse(self.svc.is_student_exempted(
            self.ogrenci.id, date(2026, 3, 23), SessionCode.MORNING, ignore_library=True,
        ))

    def test_weekly_respects_weekday_and_end_date(self):
        # 2026-03-16 Pazartesi
        OgrenciIzin.objects.create(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            izin_tipi=ExemptionType.PERIOD,
            tekrar_modu=IzinTekrarModu.WEEKLY,
            gun=0,
            periyot_kodu=SessionCode.EVENING,
            baslangic_tarihi=date(2026, 3, 1),
            bitis_tarihi=date(2026, 3, 31),
            aktif_mi=True,
        )
        self.assertTrue(self.svc.is_student_exempted(
            self.ogrenci.id, date(2026, 3, 16), SessionCode.EVENING, ignore_library=True,
        ))
        self.assertFalse(self.svc.is_student_exempted(
            self.ogrenci.id, date(2026, 3, 17), SessionCode.EVENING, ignore_library=True,
        ))
        self.assertFalse(self.svc.is_student_exempted(
            self.ogrenci.id, date(2026, 4, 6), SessionCode.EVENING, ignore_library=True,
        ))

    def test_full_day_range_covers_all_periods(self):
        OgrenciIzin.objects.create(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            izin_tipi=ExemptionType.FULL_DAY,
            tekrar_modu=IzinTekrarModu.RANGE,
            baslangic_tarihi=date(2026, 3, 15),
            bitis_tarihi=date(2026, 3, 15),
            aktif_mi=True,
        )
        for kod in (SessionCode.MORNING, SessionCode.AFTERNOON, SessionCode.EVENING):
            self.assertTrue(self.svc.is_student_exempted(
                self.ogrenci.id, date(2026, 3, 15), kod, ignore_library=True,
            ))

    def test_create_requires_end_or_suresiz(self):
        with self.assertRaises(ValueError):
            self.svc.create_izin({
                'ogrenci_id': self.ogrenci.id,
                'kurum_id': self.kurum.id,
                'izin_tipi': ExemptionType.PERIOD,
                'tekrar_modu': IzinTekrarModu.RANGE,
                'periyot_kodu': SessionCode.MORNING,
                'baslangic_tarihi': date(2026, 3, 15),
            }, user_id=1)

        izin = self.svc.create_izin({
            'ogrenci_id': self.ogrenci.id,
            'kurum_id': self.kurum.id,
            'izin_tipi': ExemptionType.PERIOD,
            'tekrar_modu': IzinTekrarModu.RANGE,
            'periyot_kodu': SessionCode.MORNING,
            'baslangic_tarihi': date(2026, 3, 15),
            'suresiz': True,
            'sebep_kodu': 'HASTALIK',
            'sebep': 'Grip',
        }, user_id=1)
        self.assertIsNone(izin.bitis_tarihi)
        self.assertEqual(izin.sebep_kodu, 'HASTALIK')

    def test_replace_weekly_keeps_range_rows(self):
        ranged = OgrenciIzin.objects.create(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            izin_tipi=ExemptionType.PERIOD,
            tekrar_modu=IzinTekrarModu.RANGE,
            periyot_kodu=SessionCode.MORNING,
            baslangic_tarihi=date(2026, 3, 15),
            bitis_tarihi=date(2026, 3, 15),
            aktif_mi=True,
        )
        OgrenciIzin.objects.create(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            izin_tipi=ExemptionType.PERIOD,
            tekrar_modu=IzinTekrarModu.WEEKLY,
            gun=0,
            periyot_kodu=SessionCode.EVENING,
            baslangic_tarihi=date(2026, 3, 1),
            bitis_tarihi=date(2026, 6, 1),
            aktif_mi=True,
        )
        self.svc.replace_student_izinler(
            self.ogrenci.id,
            self.kurum.id,
            [{
                'izin_tipi': ExemptionType.PERIOD,
                'tekrar_modu': IzinTekrarModu.WEEKLY,
                'gun': 1,
                'periyot_kodu': SessionCode.AFTERNOON,
                'baslangic_tarihi': date(2026, 3, 1),
                'suresiz': True,
            }],
            user_id=1,
        )
        ranged.refresh_from_db()
        self.assertTrue(ranged.aktif_mi)
        weekly = OgrenciIzin.objects.filter(
            ogrenci_id=self.ogrenci.id, tekrar_modu=IzinTekrarModu.WEEKLY, aktif_mi=True,
        )
        self.assertEqual(weekly.count(), 1)
        self.assertEqual(weekly.first().gun, 1)

    def test_session_lookup_includes_range(self):
        OgrenciIzin.objects.create(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            izin_tipi=ExemptionType.PERIOD,
            tekrar_modu=IzinTekrarModu.RANGE,
            periyot_kodu=SessionCode.AFTERNOON,
            baslangic_tarihi=date(2026, 3, 15),
            bitis_tarihi=date(2026, 3, 17),
            aktif_mi=True,
        )
        ids = OgrenciIzinRepository.get_exempted_students_for_session(
            self.kurum.id, date(2026, 3, 16).weekday(), SessionCode.AFTERNOON,
            date(2026, 3, 16),
        )
        self.assertIn(self.ogrenci.id, ids)
