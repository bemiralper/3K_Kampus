"""
Finansman Tanımları (ortak master data) servis testleri — Faz 1.
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.application.tanimlar.tanim_service import (
    AciklamaSablonuService,
    GelirKaynagiService,
    MaliyetMerkeziService,
    ProjeService,
)
from apps.finans.domain.finansman_tanimlari import (
    AciklamaSablonuKapsam,
    MaliyetMerkeziTipi,
    ProjeDurum,
)


class FinansmanTanimServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Tanım Kurum', kod='TNM001')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')

    def test_gelir_kaynagi_create_list_unique(self):
        svc = GelirKaynagiService()
        obj, err = svc.create(self.kurum.id, {'ad': 'Öğrenci Ücreti'}, sube_id=self.sube.id)
        self.assertIsNone(err)
        self.assertIsNotNone(obj)

        # aynı ad tekrar → hata
        _, err2 = svc.create(self.kurum.id, {'ad': 'Öğrenci Ücreti'}, sube_id=self.sube.id)
        self.assertIsNotNone(err2)

        data = svc.list(self.kurum.id, self.sube.id)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['kullanim_sayisi'], 0)

    def test_gelir_kaynagi_kurum_geneli_gorunur(self):
        svc = GelirKaynagiService()
        # kurum geneli (sube_id=None)
        svc.create(self.kurum.id, {'ad': 'Genel Kaynak', 'sube_id': None}, sube_id=self.sube.id)
        # şubeye özel
        svc.create(self.kurum.id, {'ad': 'Şube Kaynak'}, sube_id=self.sube.id)
        data = svc.list(self.kurum.id, self.sube.id)
        adlar = {d['ad'] for d in data}
        self.assertIn('Genel Kaynak', adlar)
        self.assertIn('Şube Kaynak', adlar)

    def test_gelir_kaynagi_kullanimda_silinemez(self):
        svc = GelirKaynagiService()
        obj, _ = svc.create(self.kurum.id, {'ad': 'Kira'}, sube_id=self.sube.id)
        cari = CariHesap.objects.create(kurum=self.kurum, sube=self.sube, unvan='Müşteri')
        GelirKaydi.tum_kayitlar.create(
            kurum=self.kurum, sube=self.sube, cari_hesap=cari,
            gelir_kaynagi_id=obj.id,
            fatura_tarihi=date.today(), vade_tarihi=date.today(),
            brut_tutar=Decimal('100'), net_tutar=Decimal('100'),
        )
        ok, err = svc.delete(obj.id, self.kurum.id)
        self.assertFalse(ok)
        self.assertIn('genel', err)

    def test_maliyet_merkezi_tip_filtre(self):
        svc = MaliyetMerkeziService()
        svc.create(self.kurum.id, {'ad': 'İdari', 'tip': MaliyetMerkeziTipi.MALIYET}, sube_id=self.sube.id)
        svc.create(self.kurum.id, {'ad': 'Reklam', 'tip': MaliyetMerkeziTipi.GIDER}, sube_id=self.sube.id)
        maliyet = svc.list(self.kurum.id, self.sube.id, tip=MaliyetMerkeziTipi.MALIYET)
        self.assertEqual(len(maliyet), 1)
        self.assertEqual(maliyet[0]['ad'], 'İdari')

    def test_proje_create_ve_alanlar(self):
        svc = ProjeService()
        obj, err = svc.create(self.kurum.id, {
            'ad': 'Yaz Okulu 2026',
            'butce': '150000.50',
            'durum': ProjeDurum.AKTIF,
            'baslangic_tarihi': '2026-06-01',
        }, sube_id=self.sube.id)
        self.assertIsNone(err)
        ser = svc.serialize(obj)
        self.assertEqual(ser['butce'], '150000.50')
        self.assertEqual(ser['durum'], ProjeDurum.AKTIF)
        self.assertEqual(ser['baslangic_tarihi'], '2026-06-01')

    def test_aciklama_sablonu_kapsam_filtre(self):
        svc = AciklamaSablonuService()
        svc.create(self.kurum.id, {'ad': 'Aidat', 'kapsam': AciklamaSablonuKapsam.GELIR, 'icerik': 'Aylık aidat'}, sube_id=self.sube.id)
        svc.create(self.kurum.id, {'ad': 'Ortak Not', 'kapsam': AciklamaSablonuKapsam.GENEL}, sube_id=self.sube.id)
        gelir = svc.list(self.kurum.id, self.sube.id, kapsam=AciklamaSablonuKapsam.GELIR)
        adlar = {d['ad'] for d in gelir}
        # gelir kapsamı + genel görünür
        self.assertIn('Aidat', adlar)
        self.assertIn('Ortak Not', adlar)

    def test_toggle_aktiflik(self):
        svc = GelirKaynagiService()
        obj, _ = svc.create(self.kurum.id, {'ad': 'Toggle Test'}, sube_id=self.sube.id)
        self.assertTrue(obj.aktif_mi)
        updated, _ = svc.toggle(obj.id, self.kurum.id)
        self.assertFalse(updated.aktif_mi)
