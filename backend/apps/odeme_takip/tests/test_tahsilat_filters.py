from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.domain.enums import SozlesmeDurum, TahsilatDurum
from apps.odeme_takip.domain.models import Sozlesme, Tahsilat
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.payment_method import OdemeYontemi
from apps.odeme_takip.infrastructure.repositories.tahsilat_repository import TahsilatRepository
from apps.odeme_takip.interfaces.api_views.sozlesme_views import _serialize_tahsilat
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.sube.domain.models import Sube


class TahsilatNameFilterTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Filtre Kurum', kod='FLT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='FLT-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Ankara', aktif_mi=True,
        )
        today = timezone.localdate()
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-FLT-001',
            ogrenci=self.ogrenci,
            egitim_yili=self.yil,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=today,
            bitis_tarihi=today + timedelta(days=365),
            brut_tutar=1000,
            net_tutar=1000,
            durum=SozlesmeDurum.AKTIF,
        )
        self.tahsilat = Tahsilat.objects.create(
            sozlesme=self.sozlesme,
            tutar=250,
            tahsilat_tarihi=today,
            durum=TahsilatDurum.AKTIF,
        )
        self.repo = TahsilatRepository()

    def test_full_name_matches_student(self):
        rows = self.repo.get_all(
            self.kurum.id, self.sube.id, self.yil.id, {'ogrenci_adi': 'Ali Ankara'},
        )
        self.assertEqual(list(rows.values_list('id', flat=True)), [self.tahsilat.id])

    def test_unrelated_name_excludes(self):
        rows = self.repo.get_all(
            self.kurum.id, self.sube.id, self.yil.id, {'ogrenci_adi': 'Zeynep'},
        )
        self.assertEqual(rows.count(), 0)


class TahsilatSerializeYontemTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Ser Kurum', kod='SER')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SER-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Demir',
            tc_kimlik_no='12345678901', aktif_mi=True,
        )
        today = timezone.localdate()
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-SER-001',
            ogrenci=self.ogrenci,
            egitim_yili=self.yil,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=today,
            bitis_tarihi=today + timedelta(days=365),
            brut_tutar=1000,
            net_tutar=1000,
            durum=SozlesmeDurum.AKTIF,
        )
        self.yontem = OdemeYontemi.objects.create(
            kurum=self.kurum,
            ad='Şube Kasa',
            tip=OdemeYontemiTipi.NAKIT,
        )
        self.tahsilat = Tahsilat.objects.create(
            sozlesme=self.sozlesme,
            tutar=250,
            tahsilat_tarihi=today,
            durum=TahsilatDurum.AKTIF,
            odeme_yontemi=self.yontem,
        )

    def test_serialize_includes_odeme_yontemi_tip(self):
        data = _serialize_tahsilat(self.tahsilat)
        self.assertEqual(data['odeme_yontemi']['id'], self.yontem.id)
        self.assertEqual(data['odeme_yontemi']['ad'], 'Şube Kasa')
        self.assertEqual(data['odeme_yontemi']['tip'], OdemeYontemiTipi.NAKIT)

    def test_serialize_includes_student_and_all_parent_tcs(self):
        OgrenciVeli.objects.create(
            ogrenci=self.ogrenci, veli_turu='anne', ad='Fatma', soyad='Demir',
            tc_kimlik_no='11111111111', varsayilan=True,
        )
        OgrenciVeli.objects.create(
            ogrenci=self.ogrenci, veli_turu='baba', ad='Hasan', soyad='Demir',
            tc_kimlik_no='22222222222', varsayilan=False,
        )
        data = _serialize_tahsilat(self.tahsilat)
        self.assertEqual(data['ogrenci_tc'], '12345678901')
        self.assertIn('11111111111', data['veli_tc'])
        self.assertIn('22222222222', data['veli_tc'])
        self.assertEqual(len(data['veliler']), 2)
