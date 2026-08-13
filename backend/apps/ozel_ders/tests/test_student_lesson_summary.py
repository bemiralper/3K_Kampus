"""Dönem bazlı öğrenci özel ders özeti hesaplama testleri."""
from datetime import date, time
from unittest.mock import patch

from django.test import TestCase

from apps.egitim_tanimlari.models import Ders
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    BirebirOgrenciProgrami,
    OturumDurumu,
    OturumTuru,
    ProgramDurumu,
)
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.student_lesson_summary import (
    calculate_student_private_lesson_summary,
)
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube


class StudentLessonSummaryTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='OD Summary', kod='ODSUM')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SUM')
        self.ey = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Elif',
            soyad='Yılmaz',
            aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Matematik',
            kod='MAT-S',
            kisa_ad='Mat',
        )
        self.ogretmen = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Veli',
            aktif_mi=True,
        )
        # 2026-09-01 = Tuesday … 2026-09-28 = Monday (4 full weeks)
        self.start = date(2026, 9, 1)
        self.end = date(2026, 9, 28)
        self.program = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            ogrenci=self.ogrenci,
            baslangic_tarihi=self.start,
            bitis_tarihi=self.end,
            durum=ProgramDurumu.AKTIF,
        )
        # 3 × 60 dk / hafta: Salı, Perşembe, Cumartesi
        for gun in (2, 4, 6):
            BirebirHaftalikSlot.objects.create(
                program=self.program,
                gun=gun,
                baslangic=time(14, 0),
                bitis=time(15, 0),
                sure_dk=60,
                ders=self.ders,
                ogretmen=self.ogretmen,
                aktif=True,
            )

    def _summary(self, **kwargs):
        return calculate_student_private_lesson_summary(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            start_date=kwargs.get('start', self.start),
            end_date=kwargs.get('end', self.end),
        )

    def _make_oturum(self, day, *, turu=OturumTuru.OZEL, durum=OturumDurumu.PLANLANDI, sure=60):
        return BirebirDersOturumu.objects.create(
            program=self.program,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            session_date=day,
            start_time=time(14, 0),
            end_time=time(14, 0) if sure == 0 else time(14 + sure // 60, sure % 60),
            ogrenci=self.ogrenci,
            ders=self.ders,
            ogretmen=self.ogretmen,
            oturum_turu=turu,
            durum=durum,
            is_active=True,
        )

    def test_weekly_three_hours_four_weeks(self):
        """Senaryo 1: haftada 3 ders, 4 hafta → 12 ders planlanan (süre sayıma etki etmez)."""
        data = self._summary()
        self.assertEqual(data['ozet']['planlanan_ders'], 12)
        self.assertEqual(data['ozet']['islenen_ders'], 0)
        self.assertEqual(data['ozet']['kalan_ders'], 12)

    @patch('apps.ozel_ders.services.student_lesson_summary.is_holiday')
    def test_holiday_reduces_planned(self, mock_holiday):
        """Senaryo 2: bir ders günü tatil → planlanan −1 ders."""
        holiday = date(2026, 9, 3)  # Thursday
        mock_holiday.side_effect = lambda kurum_id, sube_id, day: day == holiday
        data = self._summary()
        self.assertEqual(data['ozet']['planlanan_ders'], 11)
        self.assertEqual(data['ozet']['tatilden_dusulen_ders'], 1)
        self.assertEqual(data['ozet']['tatil_gun_sayisi'], 1)

    def test_attended_reduces_remaining(self):
        """Senaryo 3: bir ders işlensin."""
        self._make_oturum(date(2026, 9, 3), durum=OturumDurumu.ISLENDI)
        data = self._summary()
        self.assertEqual(data['ozet']['islenen_ders'], 1)
        self.assertEqual(data['ozet']['kalan_ders'], 11)

    def test_cancel_does_not_consume_quota(self):
        """Senaryo 4: iptal işlenen sayılmaz, kalan düşmez."""
        self._make_oturum(date(2026, 9, 3), durum=OturumDurumu.IPTAL)
        data = self._summary()
        self.assertEqual(data['ozet']['iptal_ders'], 1)
        self.assertEqual(data['ozet']['islenen_ders'], 0)
        self.assertEqual(data['ozet']['kalan_ders'], 12)

    def test_telafi_attended_counts_once(self):
        """Senaryo 5: telafi işlenince islenen'e girer; çift sayım yok."""
        self._make_oturum(date(2026, 9, 3), durum=OturumDurumu.IPTAL)
        self._make_oturum(
            date(2026, 9, 5),
            turu=OturumTuru.TELAFI,
            durum=OturumDurumu.ISLENDI,
        )
        data = self._summary()
        self.assertEqual(data['ozet']['telafi_ders'], 1)
        self.assertEqual(data['ozet']['islenen_ders'], 1)
        self.assertEqual(data['ozet']['kalan_ders'], 11)

    def test_extra_does_not_reduce_remaining(self):
        """Senaryo 6: ek ders ayrı; kalan değişmez."""
        self._make_oturum(
            date(2026, 9, 8),
            turu=OturumTuru.EK,
            durum=OturumDurumu.ISLENDI,
        )
        data = self._summary()
        self.assertEqual(data['ozet']['ek_ders'], 1)
        self.assertEqual(data['ozet']['islenen_ders'], 0)
        self.assertEqual(data['ozet']['kalan_ders'], 12)

    def test_invalid_range(self):
        with self.assertRaises(OzelDersError):
            self._summary(start=self.end, end=self.start)

    def test_no_slots_planned_zero(self):
        BirebirHaftalikSlot.objects.filter(program=self.program).delete()
        data = self._summary()
        self.assertEqual(data['ozet']['planlanan_ders'], 0)
        self.assertEqual(data['program_ids'], [self.program.id])

    def test_multiple_packages_break_down_per_ders(self):
        """Bir öğrencinin birden fazla paketi/dersi olabilir — toplam tek bir
        paket adına indirilmemeli, her ders kendi kırılımında görünmeli."""
        fizik = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Fizik', kod='FIZ-S', kisa_ad='Fiz',
        )
        fizik_program = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            ogrenci=self.ogrenci,
            baslangic_tarihi=self.start,
            bitis_tarihi=self.end,
            durum=ProgramDurumu.AKTIF,
        )
        BirebirHaftalikSlot.objects.create(
            program=fizik_program,
            gun=1,
            baslangic=time(10, 0),
            bitis=time(10, 50),
            sure_dk=50,
            ders=fizik,
            ogretmen=self.ogretmen,
            aktif=True,
        )
        BirebirDersOturumu.objects.create(
            program=fizik_program,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            session_date=date(2026, 9, 7),
            start_time=time(10, 0),
            end_time=time(10, 50),
            ogrenci=self.ogrenci,
            ders=fizik,
            ogretmen=self.ogretmen,
            oturum_turu=OturumTuru.OZEL,
            durum=OturumDurumu.ISLENDI,
            is_active=True,
        )

        data = self._summary()

        self.assertEqual(len(data['paketler']), 2)
        self.assertEqual(data['ozet']['planlanan_ders'], 12 + 4)
        self.assertEqual(data['ozet']['islenen_ders'], 1)

        by_ad = {d['ders_ad']: d for d in data['dersler']}
        self.assertEqual(set(by_ad), {'Matematik', 'Fizik'})
        self.assertEqual(by_ad['Matematik']['planlanan_ders'], 12)
        self.assertEqual(by_ad['Matematik']['islenen_ders'], 0)
        self.assertEqual(by_ad['Fizik']['planlanan_ders'], 4)
        self.assertEqual(by_ad['Fizik']['islenen_ders'], 1)
        self.assertEqual(by_ad['Fizik']['kalan_ders'], 3)
