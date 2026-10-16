"""Ödemesi olan sözleşmede düzenleme, kullanıcının taksit planını korumalı."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService
from apps.odeme_takip.application.services.taksit_service import TaksitService
from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum, TahsilatDurum
from apps.odeme_takip.domain.models import Sozlesme, Tahsilat, Taksit
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube


class PaidPlanPreserveTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Plan Kurum', kod='PLN')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PLN')
        self.ey = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ertuğrul', soyad='Doğan', aktif_mi=True,
        )
        today = timezone.localdate()
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZL-PLN-001',
            ogrenci=self.ogrenci,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=today,
            bitis_tarihi=today + timedelta(days=300),
            brut_tutar=90000,
            kdv_dahil_tutar=90000,
            net_tutar=90000,
            taksit_sayisi=9,
            ilk_odeme_tarihi=today,
            durum=SozlesmeDurum.AKTIF,
        )
        self.paid = Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=1,
            vade_tarihi=today,
            tutar=15000,
            odenen_tutar=15000,
            kalan_tutar=0,
            durum=TaksitDurum.ODENDI,
        )
        Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=2,
            vade_tarihi=today + timedelta(days=30),
            tutar=8300,
            odenen_tutar=0,
            kalan_tutar=8300,
            durum=TaksitDurum.BEKLEMEDE,
        )
        Tahsilat.objects.create(
            sozlesme=self.sozlesme,
            taksit=self.paid,
            tutar=15000,
            tahsilat_tarihi=today,
            durum=TahsilatDurum.AKTIF,
        )
        self.service = SozlesmeService()

    def test_manuel_plan_odenmis_taksiti_korur(self):
        updated, err = self.service.update(self.sozlesme.id, {
            'taksit_yontemi': 'manuel',
            'taksit_sayisi': 3,
            'manuel_taksitler': [
                {'tutar': 15000, 'vade_tarihi': '2026-10-01'},
                {'tutar': 25000, 'vade_tarihi': '2026-11-15'},
                {'tutar': 50000, 'vade_tarihi': '2026-12-15'},
            ],
        })
        self.assertIsNone(err)
        self.assertIsNotNone(updated)

        rows = list(Taksit.objects.filter(sozlesme=self.sozlesme).order_by('taksit_no'))
        self.assertEqual([(t.taksit_no, t.tutar, t.durum) for t in rows], [
            (1, 15000, TaksitDurum.ODENDI),
            (2, 25000, TaksitDurum.BEKLEMEDE),
            (3, 50000, TaksitDurum.BEKLEMEDE),
        ])
        self.assertEqual(rows[0].id, self.paid.id)
        self.assertEqual(rows[0].odenen_tutar, 15000)
        self.assertEqual(
            Tahsilat.objects.get(sozlesme=self.sozlesme).taksit_id,
            self.paid.id,
        )
        updated.refresh_from_db()
        self.assertEqual(updated.taksit_sayisi, 3)

    def test_odenmis_tutar_sonraki_taksite_taser(self):
        """15.000 ödenmiş taksit 10.000 olunca 5.000 sonraki taksite yazılır."""
        updated, err = self.service.update(self.sozlesme.id, {
            'taksit_yontemi': 'manuel',
            'taksit_sayisi': 2,
            'manuel_taksitler': [
                {'tutar': 10000, 'vade_tarihi': '2026-10-01'},
                {'tutar': 80000, 'vade_tarihi': '2026-11-15'},
            ],
        })
        self.assertIsNone(err)
        self.assertIsNotNone(updated)
        rows = list(Taksit.objects.filter(sozlesme=self.sozlesme).order_by('taksit_no'))
        self.assertEqual(rows[0].id, self.paid.id)
        self.assertEqual(
            [(t.taksit_no, t.tutar, t.odenen_tutar, t.durum) for t in rows],
            [
                (1, 10000, 10000, TaksitDurum.ODENDI),
                (2, 80000, 5000, TaksitDurum.KISMI_ODENDI),
            ],
        )
        tahsilat = Tahsilat.objects.get(sozlesme=self.sozlesme)
        self.assertEqual(tahsilat.tutar, 15000)
        self.assertEqual(tahsilat.durum, TahsilatDurum.AKTIF)

    def test_fazla_odeme_bir_sonraki_taksitten_duser(self):
        """25.000 tahsil, taksit 15.000 olunca 10.000 sonraki taksite geçer."""
        self.paid.tutar = 25000
        self.paid.odenen_tutar = 25000
        self.paid.kalan_tutar = 0
        self.paid.save(update_fields=['tutar', 'odenen_tutar', 'kalan_tutar'])
        Tahsilat.objects.filter(sozlesme=self.sozlesme).update(tutar=25000)
        self.sozlesme.net_tutar = 40000
        self.sozlesme.save(update_fields=['net_tutar'])

        updated, err = self.service.update(self.sozlesme.id, {
            'taksit_yontemi': 'manuel',
            'taksit_sayisi': 2,
            'manuel_taksitler': [
                {'tutar': 15000, 'vade_tarihi': '2026-10-01'},
                {'tutar': 25000, 'vade_tarihi': '2026-11-15'},
            ],
        })
        self.assertIsNone(err, err)
        rows = list(Taksit.objects.filter(sozlesme=self.sozlesme).order_by('taksit_no'))
        self.assertEqual(
            [(t.tutar, t.odenen_tutar, t.kalan_tutar, t.durum) for t in rows],
            [
                (15000, 15000, 0, TaksitDurum.ODENDI),
                (25000, 10000, 15000, TaksitDurum.KISMI_ODENDI),
            ],
        )

    def test_tahsilat_plandan_buyukse_reddedilir(self):
        self.sozlesme.net_tutar = 10000
        self.sozlesme.save(update_fields=['net_tutar'])
        updated, err = self.service.update(self.sozlesme.id, {
            'taksit_yontemi': 'manuel',
            'taksit_sayisi': 1,
            'manuel_taksitler': [
                {'tutar': 10000, 'vade_tarihi': '2026-10-01'},
            ],
        })
        self.assertIsNone(updated)
        self.assertIn('sığmıyor', err['error'])
        self.assertTrue(Taksit.objects.filter(id=self.paid.id, tutar=15000).exists())

    def test_odeme_plani_kalan_satirlari_yazar(self):
        taksitler, err = TaksitService().smart_recreate(
            self.sozlesme,
            yontem='kalani_bol',
            manuel_taksitler=[
                {'tutar': 25000, 'vade_tarihi': '2026-11-15'},
                {'tutar': 50000, 'vade_tarihi': '2026-12-15'},
            ],
        )
        self.assertIsNone(err)
        self.assertEqual(
            [(t.taksit_no, t.tutar, t.durum) for t in taksitler],
            [
                (1, 15000, TaksitDurum.ODENDI),
                (2, 25000, TaksitDurum.BEKLEMEDE),
                (3, 50000, TaksitDurum.BEKLEMEDE),
            ],
        )
        self.assertEqual(taksitler[0].id, self.paid.id)
