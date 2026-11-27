"""
Dış analiz raporundaki bulguların doğrulama testleri.

1. Cari Ekstre kurum/şube sahiplik kontrolü (ekran + dışa aktarma).
2. Ekstre ve Hareketler ortak dönem bakiyesi: geriye tarihli kayıt, boş dönem, filtreli sekme.
3. Eski bakiyeden-mahsup ALACAK/MAHSUP satırları: denetim, önizleme, düzeltme, iptal koruması.
4. Belgeye dayalı açık alacak/borç, açık kalemler ve gün aralıklı yaşlandırma.
5. Gelir/Gider şube özeti kartlarında taslak ayrımı; gelir vade aralığı filtresi.
"""
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.egitim_yili.domain.models import EgitimYili
from apps.finans.application.cari_balance import (
    hesapla_serbest_odeme_bakiye,
    hesapla_serbest_tahsilat_bakiye,
)
from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.application.cari_odeme_service import CariOdemeService
from apps.finans.application.cari_tahsilat_service import CariTahsilatService
from apps.finans.application.cari_v2.cari_panel_service import CariPanelService
from apps.finans.application.cari_v2.cari_report_service import CariReportService
from apps.finans.application.data_audit import build_finans_audit
from apps.finans.application.ekstre_balance import cari_donem_bakiyesi
from apps.finans.application.finans_v2.rapor_service import FinansV2RaporService
from apps.finans.application.gelir_tahsilat_service import GelirTahsilatService
from apps.finans.application.gelir_v2.gelir_command_service import GelirCommandService
from apps.finans.application.gelir_v2.gelir_dashboard_service import GelirDashboardService
from apps.finans.application.gelir_v2.gelir_query_service import GelirQueryService
from apps.finans.application.gider_odeme_service import GiderOdemeService
from apps.finans.application.gider_v2.gider_command_service import GiderCommandService
from apps.finans.application.gider_v2.gider_dashboard_service import GiderDashboardService
from apps.finans.application.legacy_mahsup import dengelenmemis_mahsuplar
from apps.finans.application.selectors.cari_hesap_selector import CariHesapSelector
from apps.finans.constants.cari_types import CariHareketTuru, CariHareketYonu, CariHesapTuru
from apps.finans.constants.gider_types import GiderDurum, OdemeDurum
from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gelir_kategorisi import GelirKategorisi
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.domain.gider_kategorisi import GiderKategorisi
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class AnalizBulgulariMixin:
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Analiz Kurum', kod='ANL001')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.sube2 = Sube.objects.create(kurum=self.kurum, ad='İkinci', kod='IKN')
        self.diger_kurum = Kurum.objects.create(ad='Başka Kurum', kod='BSK001')
        self.diger_sube = Sube.objects.create(kurum=self.diger_kurum, ad='Başka Şube', kod='BSK')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_superuser(
            username='analiz_admin', email='analiz@test.local', password='pass',
        )
        self.banka = MaliHesap.objects.create(
            sube=self.sube, ad='Banka', tip='banka', para_birimi='TRY', aktif_mi=True,
        )
        self.eft = OdemeYontemi.objects.create(
            kurum=self.kurum, ad='EFT', tip='havale_eft', mali_hesap=self.banka, aktif_mi=True,
        )
        self.gelir_kat = GelirKategorisi.objects.create(kurum=self.kurum, sube=self.sube, ad='Satış')
        self.gider_kat = GiderKategorisi.objects.create(kurum=self.kurum, sube=self.sube, ad='Alım')
        self.cari = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube, unvan='Karma Cari A.Ş.',
            hesap_turu=CariHesapTuru.KARMA,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {'HTTP_X_SUBE_ID': str(self.sube.id)}

    def _hareket(self, cari, tarih, yon, tutar, tur=CariHareketTuru.SATIS):
        return CariHareketService().hareket_olustur(
            cari_hesap_id=cari.id, kurum_id=cari.kurum_id, tutar=Decimal(tutar),
            yon=yon, islem_turu=tur, islem_tarihi=tarih, sube_id=cari.sube_id,
        )

    def _gelir(self, tutar, vade, **extra):
        gelir, err = GelirCommandService().create({
            'kurum_id': self.kurum.id, 'sube_id': self.sube.id,
            'cari_hesap_id': self.cari.id, 'gelir_kategorisi_id': self.gelir_kat.id,
            'brut_tutar': Decimal(tutar), 'kdv_orani': 0, 'kdv_mod': 'muaf',
            'fatura_tarihi': min(vade, timezone.localdate()), 'vade_tarihi': vade,
            **extra,
        }, islem_yapan=self.user)
        self.assertIsNone(err, err)
        return gelir

    def _gider(self, tutar, vade, **extra):
        gider, err = GiderCommandService().create({
            'kurum_id': self.kurum.id, 'sube_id': self.sube.id,
            'cari_hesap_id': self.cari.id, 'gider_kategorisi_id': self.gider_kat.id,
            'brut_tutar': Decimal(tutar), 'kdv_orani': 0, 'kdv_mod': 'muaf',
            'fatura_tarihi': min(vade, timezone.localdate()), 'vade_tarihi': vade,
            **extra,
        }, islem_yapan=self.user)
        self.assertIsNone(err, err)
        return gider


class AnalizBulgulariTestBase(AnalizBulgulariMixin, TestCase):
    pass


class EkstreKapsamTests(AnalizBulgulariTestBase):
    def test_baska_kurum_ve_sube_carisi_ekstrede_gorunmez(self):
        yabanci = CariHesap.objects.create(
            kurum=self.diger_kurum, sube=self.diger_sube, unvan='Yabancı Cari',
            hesap_turu=CariHesapTuru.MUSTERI,
        )
        baska_sube = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube2, unvan='Diğer Şube Carisi',
            hesap_turu=CariHesapTuru.MUSTERI,
        )
        self._hareket(yabanci, date(2026, 1, 5), CariHareketYonu.BORC, '999')
        service = CariReportService()
        for hesap in (yabanci, baska_sube):
            res = service.build('ekstre', self.kurum.id, self.sube.id, {'cari_hesap_id': hesap.id})
            self.assertEqual(res, {'error': 'Cari hesap bulunamadı.'}, hesap.unvan)
        self.assertEqual(
            service.build('ekstre', self.kurum.id, self.sube.id, {'cari_hesap_id': 'abc'}),
            {'error': 'Cari hesap bulunamadı.'},
        )
        own = service.build('ekstre', self.kurum.id, self.sube.id, {'cari_hesap_id': self.cari.id})
        self.assertNotIn('error', own)

    def test_ekstre_ekran_ve_disa_aktarma_yabanci_cariyi_reddeder(self):
        yabanci = CariHesap.objects.create(
            kurum=self.diger_kurum, sube=self.diger_sube, unvan='Gizli Ünvan Ltd.',
            hesap_turu=CariHesapTuru.MUSTERI,
        )
        self._hareket(yabanci, date(2026, 1, 5), CariHareketYonu.BORC, '12345')
        resp = self.client.get(
            f'/finans/api/cari/v2/raporlar/ekstre/?kurum_id={self.kurum.id}&cari_hesap_id={yabanci.id}',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body, {'error': 'Cari hesap bulunamadı.'})
        self.assertNotIn('Gizli', json.dumps(body, ensure_ascii=False))

        exp = self.client.post(
            '/finans/api/cari/v2/raporlar/ekstre/export/',
            {'format': 'csv', 'kurum_id': self.kurum.id, 'params': {'cari_hesap_id': yabanci.id}},
            format='json', **self.headers,
        )
        self.assertEqual(exp.status_code, 400)
        self.assertNotIn(b'12345', exp.content)


class DonemBakiyesiTests(AnalizBulgulariTestBase):
    def _kur_geriye_tarihli(self):
        # Önce 10 Mart'a 100, sonra geriye tarihli 1 Şubat'a 50 borç girilir.
        mart = self._hareket(self.cari, date(2026, 3, 10), CariHareketYonu.BORC, '100')
        subat = self._hareket(self.cari, date(2026, 2, 1), CariHareketYonu.BORC, '50')
        # Anlık görüntü yanlış sırayı yansıtır (bakiye_oncesi 100) — hesap buna dayanmamalı.
        self.assertEqual(subat.bakiye_oncesi, Decimal('100'))
        return mart, subat

    def test_geriye_tarihli_kayit_devreden_ve_kapanisi_bozmaz(self):
        mart, subat = self._kur_geriye_tarihli()
        res = CariReportService().build('ekstre', self.kurum.id, self.sube.id, {
            'cari_hesap_id': self.cari.id, 'baslangic': '2026-02-01', 'bitis': '2026-03-31',
        })
        self.assertEqual(res['ozet']['devreden'], 0)
        self.assertEqual(res['ozet']['toplam_borc'], 150)
        self.assertEqual(res['ozet']['kapanis'], 150)
        bakiyeler = {r['islem_tarihi']: r['bakiye'] for r in res['rows']}
        self.assertEqual(bakiyeler, {'2026-02-01': 50.0, '2026-03-10': 150.0})

        mart_donemi = CariReportService().build('ekstre', self.kurum.id, self.sube.id, {
            'cari_hesap_id': self.cari.id, 'baslangic': '2026-03-01', 'bitis': '2026-03-31',
        })
        self.assertEqual(mart_donemi['ozet']['devreden'], 50)
        self.assertEqual(mart_donemi['ozet']['kapanis'], 150)

        resp = self.client.get(
            f'/finans/api/cari/v2/hesaplar/{self.cari.id}/hareketler/'
            f'?baslangic=2026-02-01&bitis=2026-03-31',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['ozet']['devreden_bakiye'], 0)
        self.assertEqual(data['ozet']['toplam_borc'], 150)
        self.assertEqual(data['ozet']['kapanis_bakiye'], 150)
        yuruyen = {r['id']: r['yuruyen_bakiye'] for r in data['results']}
        self.assertEqual(yuruyen, {subat.id: 50.0, mart.id: 150.0})
        # Mevcut alanlar korunur (geriye uyumluluk).
        self.assertIn('bakiye_sonrasi', data['results'][0])

    def test_bos_donem_onceki_bakiyeyi_tasir(self):
        self._kur_geriye_tarihli()
        res = CariReportService().build('ekstre', self.kurum.id, self.sube.id, {
            'cari_hesap_id': self.cari.id, 'baslangic': '2026-05-01', 'bitis': '2026-05-31',
        })
        self.assertEqual(res['rows'], [])
        self.assertEqual(res['ozet']['devreden'], 150)
        self.assertEqual(res['ozet']['kapanis'], 150)

        data = self.client.get(
            f'/finans/api/cari/v2/hesaplar/{self.cari.id}/hareketler/'
            f'?baslangic=2026-05-01&bitis=2026-05-31',
            **self.headers,
        ).json()
        self.assertEqual(data['count'], 0)
        self.assertEqual(data['ozet']['devreden_bakiye'], 150)
        self.assertEqual(data['ozet']['kapanis_bakiye'], 150)

    def test_filtreli_sekme_kapanis_hesabin_gercek_bakiyesidir(self):
        self._hareket(self.cari, date(2026, 1, 10), CariHareketYonu.BORC, '1000')
        self._hareket(self.cari, date(2026, 1, 20), CariHareketYonu.ALACAK, '300', CariHareketTuru.TAHSILAT)
        data = self.client.get(
            f'/finans/api/cari/v2/hesaplar/{self.cari.id}/hareketler/?islem_turu=tahsilat',
            **self.headers,
        ).json()
        self.assertEqual(data['count'], 1)
        self.assertTrue(data['ozet']['filtreli'])
        self.assertEqual(data['ozet']['toplam_borc'], 0)
        self.assertEqual(data['ozet']['toplam_alacak'], 300)
        self.assertEqual(data['ozet']['kapanis_bakiye'], 700)
        self.assertEqual(data['results'][0]['yuruyen_bakiye'], 700)

    def test_sayfalama_toplamlari_tum_donemi_kapsar(self):
        for gun in range(1, 8):
            self._hareket(self.cari, date(2026, 1, gun), CariHareketYonu.BORC, '10')
        data = self.client.get(
            f'/finans/api/cari/v2/hesaplar/{self.cari.id}/hareketler/?page=2&page_size=3',
            **self.headers,
        ).json()
        self.assertEqual(data['count'], 7)
        self.assertEqual(data['total_pages'], 3)
        self.assertEqual(len(data['results']), 3)
        self.assertEqual(data['ozet']['toplam_borc'], 70)
        # Yeni → eski sıralı 2. sayfa: 4, 3, 2 Ocak satırları.
        self.assertEqual([r['yuruyen_bakiye'] for r in data['results']], [40.0, 30.0, 20.0])

    def test_hatali_tarih_400_doner(self):
        resp = self.client.get(
            f'/finans/api/cari/v2/hesaplar/{self.cari.id}/hareketler/?baslangic=2026-02-30',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 400)
        res = CariReportService().build('ekstre', self.kurum.id, self.sube.id, {
            'cari_hesap_id': self.cari.id, 'bitis': 'bozuk',
        })
        self.assertIn('error', res)

    def test_ayni_gun_kayitlarinda_olusturma_sirasi_esas(self):
        a = self._hareket(self.cari, date(2026, 4, 1), CariHareketYonu.BORC, '500')
        b = self._hareket(self.cari, date(2026, 4, 1), CariHareketYonu.ALACAK, '200', CariHareketTuru.TAHSILAT)
        donem = cari_donem_bakiyesi(self.cari.id)
        self.assertEqual(donem.satir_bakiyeleri[a.id], Decimal('500'))
        self.assertEqual(donem.satir_bakiyeleri[b.id], Decimal('300'))
        self.assertEqual(donem.kapanis, Decimal('300'))
        self.cari.refresh_from_db()
        self.assertEqual(donem.kapanis, self.cari.bakiye)


class EskiMahsupTests(AnalizBulgulariMixin, TransactionTestCase):
    """Düzeltme komutu kendi transaction'ını açar; bu yüzden TransactionTestCase."""

    def _mahsuplu_gider(self, tutar='4000'):
        _, err = CariOdemeService().serbest_odeme_yap({
            'cari_hesap_id': self.cari.id, 'kurum_id': self.kurum.id,
            'sube_id': self.sube.id, 'egitim_yili_id': self.ey.id,
            'tutar': Decimal(tutar), 'odeme_tarihi': date(2026, 4, 2),
            'mali_hesap_id': self.banka.id, 'odeme_yontemi_id': self.eft.id,
            'islem_yapan': self.user,
        })
        self.assertIsNone(err, err)
        gider = self._gider(tutar, date(2026, 4, 6))
        odeme, err = GiderOdemeService().odeme_yap({
            'gider_kaydi_id': gider.id, 'tutar': Decimal(tutar),
            'odeme_tarihi': date(2026, 4, 6), 'bakiyeden_mahsup': True,
            'islem_yapan': self.user,
        })
        self.assertIsNone(err, err)
        self.cari.refresh_from_db()
        self.assertEqual(self.cari.bakiye, Decimal('0'))
        return gider, odeme

    def _eski_satir_ekle(self, odeme, gider):
        """Önceki sürümün yazdığı fazladan ALACAK/MAHSUP satırını taklit eder."""
        CariHareketService().hareket_olustur(
            cari_hesap_id=self.cari.id, kurum_id=self.kurum.id, tutar=odeme.tutar,
            yon=CariHareketYonu.ALACAK, islem_turu=CariHareketTuru.MAHSUP,
            islem_tarihi=odeme.odeme_tarihi, sube_id=self.sube.id,
            egitim_yili_id=gider.egitim_yili_id, kaynak_tip='GiderOdeme', kaynak_id=odeme.pk,
        )
        self.cari.refresh_from_db()
        self.assertEqual(self.cari.bakiye, -odeme.tutar)

    def _komut(self, *args):
        out = StringIO()
        call_command('duzelt_eski_mahsup_cari', *args, stdout=out)
        return json.loads(out.getvalue())

    def test_denetim_onizleme_duzeltme_ve_tekrar_calistirma(self):
        gider, odeme = self._mahsuplu_gider()
        self.assertEqual(dengelenmemis_mahsuplar(kurum_id=self.kurum.id), [])
        self._eski_satir_ekle(odeme, gider)

        audit = build_finans_audit(kurum_id=self.kurum.id)
        self.assertEqual(audit['findings']['legacy_mahsup_unbalanced']['count'], 1)

        satir_sayisi = CariHareket.objects.count()
        onizleme = self._komut()
        self.assertFalse(onizleme['apply'])
        self.assertEqual(onizleme['aday_sayisi'], 1)
        self.assertEqual(onizleme['adaylar'][0]['odeme_id'], odeme.pk)
        self.assertEqual(CariHareket.objects.count(), satir_sayisi)

        uygula = self._komut('--apply', f'--kurum-id={self.kurum.id}')
        self.assertEqual(uygula['duzeltilen_sayisi'], 1)
        self.assertEqual(Decimal(uygula['duzeltilen'][0]['yazilan']), odeme.tutar)
        self.cari.refresh_from_db()
        self.assertEqual(self.cari.bakiye, Decimal('0'))
        self.assertEqual(CariHareket.objects.count(), satir_sayisi + 1)
        self.assertNotIn('legacy_mahsup_unbalanced', build_finans_audit(kurum_id=self.kurum.id)['findings'])

        self.assertEqual(self._komut('--apply')['duzeltilen_sayisi'], 0)

        # Düzeltilmiş mahsup iptal edilince ikinci ters kayıt yazılmaz.
        _, err = GiderOdemeService().odeme_iptal(odeme.pk)
        self.assertIsNone(err, err)
        self.assertEqual(
            CariHareket.objects.filter(
                kaynak_tip='GiderOdeme', kaynak_id=odeme.pk, islem_turu=CariHareketTuru.MAHSUP,
            ).count(),
            2,
        )
        self.cari.refresh_from_db()
        # İptal sonrası gider borcu tekrar açık; serbest ödeme avansı yerinde → net 0.
        self.assertEqual(self.cari.bakiye, Decimal('0'))

    def test_duzeltilmemis_eski_mahsup_iptalde_bir_kez_dengelenir(self):
        gider, odeme = self._mahsuplu_gider('2500')
        self._eski_satir_ekle(odeme, gider)
        _, err = GiderOdemeService().odeme_iptal(odeme.pk)
        self.assertIsNone(err, err)
        self.cari.refresh_from_db()
        self.assertEqual(self.cari.bakiye, Decimal('0'))
        self.assertEqual(dengelenmemis_mahsuplar(kurum_id=self.kurum.id), [])

    def test_yeni_mahsup_iptali_cari_satiri_yazmaz(self):
        _, odeme = self._mahsuplu_gider('1500')
        _, err = GiderOdemeService().odeme_iptal(odeme.pk)
        self.assertIsNone(err, err)
        self.assertFalse(CariHareket.objects.filter(
            kaynak_tip='GiderOdeme', kaynak_id=odeme.pk, islem_turu=CariHareketTuru.MAHSUP,
        ).exists())


class AcikKalemTests(AnalizBulgulariTestBase):
    def test_karsilikli_belgeler_net_yerine_ayri_gorunur(self):
        bugun = timezone.localdate()
        gelir = self._gelir('10000', bugun - timedelta(days=40))
        gider = self._gider('8000', bugun + timedelta(days=10))
        self.cari.refresh_from_db()
        self.assertEqual(self.cari.bakiye, Decimal('2000'))
        # Mevcut net türetimli alanlar değişmedi.
        self.assertEqual(self.cari.acik_alacak, Decimal('2000'))
        self.assertEqual(self.cari.acik_borc, Decimal('0'))

        sonuc = CariHesapSelector().acik_kalemler(self.cari.id)
        ozet = sonuc['ozet']
        self.assertEqual(ozet['acik_alacak_belge'], 10000)
        self.assertEqual(ozet['acik_borc_belge'], 8000)
        self.assertEqual(ozet['geciken_tahsilat'], 10000)
        self.assertEqual(ozet['geciken_odeme'], 0)
        kalem_tipleri = [(k['tip'], k['kaynak_id'], k['gecikme_gun']) for k in sonuc['kalemler']]
        self.assertEqual(kalem_tipleri, [('gelir', gelir.id, 40), ('gider', gider.id, 0)])
        self.assertIsNotNone(sonuc['kalemler'][1]['taksit_id'])

        detay = self.client.get(f'/finans/api/cari/v2/hesaplar/{self.cari.id}/', **self.headers).json()
        self.assertEqual(detay['ozet']['acik_alacak_belge'], 10000)
        self.assertEqual(detay['ozet']['acik_borc_belge'], 8000)
        self.assertEqual(detay['ozet']['vadesi_gecmis_tahsilat'], 10000)

        tab = self.client.get(
            f'/finans/api/cari/v2/hesaplar/{self.cari.id}/tab/acik-kalemler/', **self.headers,
        )
        self.assertEqual(tab.status_code, 200)
        self.assertEqual(len(tab.json()['kalemler']), 2)

        risk = CariReportService().build('risk-analizi', self.kurum.id, self.sube.id, {})
        satir = risk['rows'][0]
        self.assertEqual((satir['acik_alacak'], satir['acik_borc']), (2000, 0))
        self.assertEqual((satir['acik_alacak_belge'], satir['acik_borc_belge']), (10000, 8000))

    def test_hareket_satiri_kaynak_belgeye_baglanir(self):
        bugun = timezone.localdate()
        gelir = self._gelir('500', bugun)
        gider = self._gider('200', bugun)
        tahsilat, err = GelirTahsilatService().tahsilat_yap({
            'gelir_kaydi_id': gelir.id,
            'tutar': Decimal('150'),
            'tahsilat_tarihi': bugun,
            'mali_hesap_id': self.banka.id,
            'odeme_yontemi_id': self.eft.id,
            'islem_yapan': self.user,
        })
        self.assertIsNone(err, err)
        self._hareket(self.cari, bugun, CariHareketYonu.BORC, '10')

        data = self.client.get(
            f'/finans/api/cari/v2/hesaplar/{self.cari.id}/hareketler/', **self.headers,
        ).json()
        belgeler = {(r['kaynak_tip'], r['kaynak_id']): r['kaynak_belge'] for r in data['results']}
        self.assertEqual(belgeler[('GelirKaydi', gelir.id)], {'tip': 'gelir', 'id': gelir.id})
        self.assertEqual(belgeler[('GelirTahsilat', tahsilat.id)], {'tip': 'gelir', 'id': gelir.id})
        self.assertEqual(belgeler[('GiderKaydi', gider.id)], {'tip': 'gider', 'id': gider.id})
        # Kaynağı olmayan elle girilmiş hareket belgeye bağlanmaz.
        self.assertIsNone(belgeler[('', None)])

    def test_taslak_ve_iptal_belgeler_acik_kalem_degildir(self):
        bugun = timezone.localdate()
        self._gelir('700', bugun, taslak_olarak_kaydet=True)
        iptal = self._gelir('300', bugun)
        GelirCommandService().iptal_et(iptal.id, islem_yapan=self.user)
        ozet = CariHesapSelector().acik_kalemler(self.cari.id)['ozet']
        self.assertEqual(ozet['acik_alacak_belge'], 0)
        self.assertEqual(ozet['acik_tahsilat_adet'], 0)

    def test_yaslandirma_gun_araliklari_ve_yon_ayrimi(self):
        bugun = timezone.localdate()
        self._gelir('100', bugun - timedelta(days=5))
        self._gelir('200', bugun - timedelta(days=45))
        self._gelir('300', bugun - timedelta(days=75))
        self._gelir('400', bugun - timedelta(days=120))
        self._gelir('50', bugun)
        self._gider('900', bugun + timedelta(days=15))
        res = CariReportService().build('yaslandirma', self.kurum.id, self.sube.id, {})
        satirlar = {r['yon']: r for r in res['rows']}
        tah = satirlar['Tahsil Edilecek']
        self.assertEqual(
            (tah['bugun'], tah['g1_30'], tah['g31_60'], tah['g61_90'], tah['g90_ustu'], tah['gelecek']),
            (50, 100, 200, 300, 400, 0),
        )
        self.assertEqual(tah['toplam'], 1050)
        self.assertEqual(satirlar['Ödenecek']['gelecek'], 900)
        kpi = {k['label']: k['value'] for k in res['kpis']}
        self.assertEqual(kpi['Geciken Tahsilat'], 1000)
        self.assertEqual(kpi['Geciken Ödeme'], 0)
        self.assertEqual(kpi['90+ Gün Geciken'], 400)


class DashboardVeFiltreTests(AnalizBulgulariTestBase):
    def test_taslaklar_sube_ozeti_toplamlarina_girmez(self):
        bugun = timezone.localdate()
        self._gelir('1000', bugun)
        self._gelir('600', bugun, taslak_olarak_kaydet=True)
        kart = GelirDashboardService().summary(self.kurum.id, self.sube.id)['kartlar']
        self.assertEqual(Decimal(kart['toplam_gelir']), Decimal('1000'))
        self.assertEqual(Decimal(kart['bugun_gelir']), Decimal('1000'))
        self.assertEqual(kart['toplam_adet'], 1)
        self.assertEqual(Decimal(kart['taslak_toplam']), Decimal('600'))
        self.assertEqual(kart['taslak_adet'], 1)

        self._gider('2000', bugun)
        self._gider('450', bugun, taslak_olarak_kaydet=True)
        gk = GiderDashboardService().summary(self.kurum.id, self.sube.id)['kartlar']
        self.assertEqual(Decimal(gk['toplam_gider']), Decimal('2000'))
        self.assertEqual(Decimal(gk['bu_ay_gider']), Decimal('2000'))
        self.assertEqual(Decimal(gk['taslak_toplam']), Decimal('450'))
        self.assertEqual(gk['taslak_adet'], 1)

    def test_gelir_vade_araligi_filtresi(self):
        bugun = timezone.localdate()
        yakin = self._gelir('100', bugun + timedelta(days=3))
        self._gelir('200', bugun + timedelta(days=40))
        res = GelirQueryService().list_paginated(
            self.kurum.id, self.sube.id,
            filters={
                'tahsil_durumu': 'bekleyen',
                'vade_baslangic': bugun.isoformat(),
                'vade_bitis': (bugun + timedelta(days=7)).isoformat(),
            },
            sort='vade_tarihi',
        )
        self.assertEqual([r['id'] for r in res['results']], [yakin.id])
        self.assertEqual(Decimal(res['totals']['toplam_kalan']), Decimal('100'))

        api = self.client.get(
            f'/finans/api/gelir/v2/kayitlar/?kurum_id={self.kurum.id}'
            f'&vade_baslangic={bugun.isoformat()}&vade_bitis={(bugun + timedelta(days=7)).isoformat()}',
            **self.headers,
        ).json()
        self.assertEqual(api['total'], 1)


class BorcAlacakListesiVeTarihTutarliligiTests(AnalizBulgulariTestBase):
    def test_borc_ve_alacak_listesi_karsilikli_acik_belgeleri_gosterir(self):
        bugun = timezone.localdate()
        # 10.000 ₺ açık alacak (geciken) + 8.000 ₺ açık borç (gelecek vadeli) → net +2.000 ₺.
        self._gelir('10000', bugun - timedelta(days=15))
        self._gider('8000', bugun + timedelta(days=20))

        avans_musteri = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube, unvan='Avanslı Müşteri',
            hesap_turu=CariHesapTuru.MUSTERI,
        )
        _, s_err = CariTahsilatService().serbest_tahsilat_yap({
            'cari_hesap_id': avans_musteri.id, 'kurum_id': self.kurum.id,
            'sube_id': self.sube.id, 'egitim_yili_id': self.ey.id,
            'tutar': Decimal('5000'), 'tahsilat_tarihi': bugun,
            'mali_hesap_id': self.banka.id, 'odeme_yontemi_id': self.eft.id,
            'islem_yapan': self.user,
        })
        self.assertIsNone(s_err, s_err)

        svc = CariReportService()
        borc = svc.build('borc-listesi', self.kurum.id, self.sube.id, {})
        self.assertEqual([r['id'] for r in borc['rows']], [self.cari.id])
        self.assertEqual(borc['rows'][0]['acik_borc_belge'], 8000.0)
        self.assertEqual(borc['rows'][0]['bakiye'], 2000.0)
        borc_kpi = {k['label']: k['value'] for k in borc['kpis']}
        self.assertEqual(borc_kpi['Borçlu Cari'], 1)
        self.assertEqual(borc_kpi['Toplam Borç'], 8000.0)
        self.assertEqual(borc_kpi['Geciken Ödeme'], 0.0)

        alacak = svc.build('alacak-listesi', self.kurum.id, self.sube.id, {})
        self.assertEqual([r['id'] for r in alacak['rows']], [self.cari.id])
        self.assertEqual(alacak['rows'][0]['acik_alacak_belge'], 10000.0)
        self.assertEqual(alacak['rows'][0]['bakiye'], 2000.0)
        alacak_kpi = {k['label']: k['value'] for k in alacak['kpis']}
        self.assertEqual(alacak_kpi['Alacaklı Cari'], 1)
        self.assertEqual(alacak_kpi['Toplam Alacak'], 10000.0)
        self.assertEqual(alacak_kpi['Geciken Tahsilat'], 10000.0)

    def test_tarih_filtresi_eski_borcu_dusurmez_ve_kesim_tarihiyle_tutarlidir(self):
        # Şubat'ta oluşan 8.000 ₺ gider Mayıs'ta ödenir; Mayıs sonunda yeni 3.000 ₺ gider doğar.
        subat_gider = self._gider(
            '8000', date(2026, 3, 1), fatura_tarihi=date(2026, 2, 15),
        )
        _, od_err = GiderOdemeService().odeme_yap({
            'gider_kaydi_id': subat_gider.id,
            'tutar': Decimal('8000'),
            'odeme_tarihi': date(2026, 5, 10),
            'mali_hesap_id': self.banka.id,
            'odeme_yontemi_id': self.eft.id,
            'islem_yapan': self.user,
        })
        self.assertIsNone(od_err, od_err)
        self._gider('3000', date(2026, 6, 15), fatura_tarihi=date(2026, 5, 20))

        svc = CariReportService()
        nisan_params = {'baslangic': '2026-04-01', 'bitis': '2026-04-30'}

        # Nisan'da hiç hareket olmasa da 30 Nisan sonu itibarıyla 8.000 ₺ borç açıktır ve 60 gün gecikmiştir.
        borc_nisan = svc.build('borc-listesi', self.kurum.id, self.sube.id, nisan_params)
        self.assertEqual(len(borc_nisan['rows']), 1)
        satir = borc_nisan['rows'][0]
        self.assertEqual(satir['bakiye'], -8000.0)
        self.assertEqual(satir['acik_borc_belge'], 8000.0)
        self.assertEqual(satir['vadesi_gecmis_odeme'], 8000.0)
        self.assertEqual(satir['son_islem_tarihi'], '2026-02-15')

        ekstre_nisan = svc.build('ekstre', self.kurum.id, self.sube.id, {
            **nisan_params, 'cari_hesap_id': self.cari.id,
        })
        self.assertEqual(satir['bakiye'], ekstre_nisan['ozet']['kapanis'])

        yas_nisan = svc.build('yaslandirma', self.kurum.id, self.sube.id, nisan_params)
        self.assertEqual(len(yas_nisan['rows']), 1)
        self.assertEqual(yas_nisan['rows'][0]['g31_60'], 8000.0)
        self.assertEqual(yas_nisan['rows'][0]['toplam'], 8000.0)

        risk_nisan = svc.build('risk-analizi', self.kurum.id, self.sube.id, nisan_params)
        self.assertEqual(risk_nisan['rows'][0]['acik_borc'], 8000.0)
        self.assertEqual(risk_nisan['rows'][0]['acik_borc_belge'], 8000.0)
        self.assertEqual(risk_nisan['rows'][0]['vadesi_gecmis'], 8000.0)

        # 31 Mayıs sonu itibarıyla Şubat borcu kapanmış, yalnız Mayıs borcu (3.000 ₺, gelecek vadeli) kalmıştır.
        borc_mayis = svc.build('borc-listesi', self.kurum.id, self.sube.id, {
            'baslangic': '2026-05-01', 'bitis': '2026-05-31',
        })
        self.assertEqual(len(borc_mayis['rows']), 1)
        self.assertEqual(borc_mayis['rows'][0]['bakiye'], -3000.0)
        self.assertEqual(borc_mayis['rows'][0]['acik_borc_belge'], 3000.0)
        self.assertEqual(borc_mayis['rows'][0]['vadesi_gecmis_odeme'], 0.0)

        # Ters tarih aralığı ve hatalı tarih güvenli biçimde reddedilir.
        ters = svc.build('borc-listesi', self.kurum.id, self.sube.id, {
            'baslangic': '2026-05-10', 'bitis': '2026-04-01',
        })
        self.assertIn('error', ters)
        bad_api = self.client.get(
            f'/finans/api/cari-hesaplar/rapor/?kurum_id={self.kurum.id}&bitis=2026-02-30',
            **self.headers,
        )
        self.assertEqual(bad_api.status_code, 400)


class EszamanliMahsupTests(AnalizBulgulariMixin, TransactionTestCase):
    """Gerçek eşzamanlı PostgreSQL bağlantılarıyla mahsup yarış testi."""

    @staticmethod
    def _run_concurrent(fn1, fn2):
        barrier = threading.Barrier(2)

        def _wrap(fn):
            try:
                barrier.wait(timeout=10)
                return fn()
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            f1 = pool.submit(_wrap, fn1)
            f2 = pool.submit(_wrap, fn2)
            return f1.result(timeout=20), f2.result(timeout=20)

    def test_eszamanli_gelir_mahsubu_ayni_avansi_iki_kez_kullandirmaz(self):
        bugun = date(2026, 4, 10)
        _, s_err = CariTahsilatService().serbest_tahsilat_yap({
            'cari_hesap_id': self.cari.id, 'kurum_id': self.kurum.id,
            'sube_id': self.sube.id, 'egitim_yili_id': self.ey.id,
            'tutar': Decimal('5000'), 'tahsilat_tarihi': bugun,
            'mali_hesap_id': self.banka.id, 'odeme_yontemi_id': self.eft.id,
            'islem_yapan': self.user,
        })
        self.assertIsNone(s_err, s_err)
        gelir_1 = self._gelir('5000', bugun)
        gelir_2 = self._gelir('5000', bugun)

        r1, r2 = self._run_concurrent(
            lambda: GelirTahsilatService().tahsilat_yap({
                'gelir_kaydi_id': gelir_1.id, 'tutar': Decimal('5000'),
                'tahsilat_tarihi': bugun, 'bakiyeden_mahsup': True,
            }),
            lambda: GelirTahsilatService().tahsilat_yap({
                'gelir_kaydi_id': gelir_2.id, 'tutar': Decimal('5000'),
                'tahsilat_tarihi': bugun, 'bakiyeden_mahsup': True,
            }),
        )
        hatalar = [err for _, err in (r1, r2) if err is not None]
        basarilar = [obj for obj, err in (r1, r2) if err is None]
        self.assertEqual(len(basarilar), 1, (r1, r2))
        self.assertEqual(len(hatalar), 1, (r1, r2))
        self.assertIn('tutar', hatalar[0])
        self.assertEqual(
            GelirTahsilat.objects.filter(
                gelir_kaydi__cari_hesap_id=self.cari.id,
                bakiye_hareketi_id=GelirTahsilat.MAHSUP_SENTINEL_BH_ID,
                durum=OdemeDurum.TAMAMLANDI,
            ).count(),
            1,
        )
        self.assertEqual(hesapla_serbest_tahsilat_bakiye(self.cari.id), Decimal('0.00'))

    def test_eszamanli_gider_mahsubu_ayni_avansi_iki_kez_kullandirmaz(self):
        bugun = date(2026, 4, 10)
        _, s_err = CariOdemeService().serbest_odeme_yap({
            'cari_hesap_id': self.cari.id, 'kurum_id': self.kurum.id,
            'sube_id': self.sube.id, 'egitim_yili_id': self.ey.id,
            'tutar': Decimal('6000'), 'odeme_tarihi': bugun,
            'mali_hesap_id': self.banka.id, 'odeme_yontemi_id': self.eft.id,
            'islem_yapan': self.user,
        })
        self.assertIsNone(s_err, s_err)
        gider_1 = self._gider('6000', bugun)
        gider_2 = self._gider('6000', bugun)

        r1, r2 = self._run_concurrent(
            lambda: GiderOdemeService().odeme_yap({
                'gider_kaydi_id': gider_1.id, 'tutar': Decimal('6000'),
                'odeme_tarihi': bugun, 'bakiyeden_mahsup': True,
            }),
            lambda: GiderOdemeService().odeme_yap({
                'gider_kaydi_id': gider_2.id, 'tutar': Decimal('6000'),
                'odeme_tarihi': bugun, 'bakiyeden_mahsup': True,
            }),
        )
        hatalar = [err for _, err in (r1, r2) if err is not None]
        basarilar = [obj for obj, err in (r1, r2) if err is None]
        self.assertEqual(len(basarilar), 1, (r1, r2))
        self.assertEqual(len(hatalar), 1, (r1, r2))
        self.assertIn('tutar', hatalar[0])
        self.assertEqual(
            GiderOdeme.objects.filter(
                gider_kaydi__cari_hesap_id=self.cari.id,
                bakiyeden_mahsup=True,
                durum=OdemeDurum.TAMAMLANDI,
            ).count(),
            1,
        )
        self.assertEqual(hesapla_serbest_odeme_bakiye(self.cari.id), Decimal('0.00'))

    def test_eszamanli_serbest_odeme_iptali_ve_mahsup_cakismaz(self):
        bugun = date(2026, 4, 10)
        serbest, s_err = CariOdemeService().serbest_odeme_yap({
            'cari_hesap_id': self.cari.id, 'kurum_id': self.kurum.id,
            'sube_id': self.sube.id, 'egitim_yili_id': self.ey.id,
            'tutar': Decimal('4000'), 'odeme_tarihi': bugun,
            'mali_hesap_id': self.banka.id, 'odeme_yontemi_id': self.eft.id,
            'islem_yapan': self.user,
        })
        self.assertIsNone(s_err, s_err)
        hareket_id = serbest['cari_hareket_id']
        gider = self._gider('4000', bugun)

        r_iptal, r_mahsup = self._run_concurrent(
            lambda: CariOdemeService().serbest_odeme_iptal(hareket_id),
            lambda: GiderOdemeService().odeme_yap({
                'gider_kaydi_id': gider.id, 'tutar': Decimal('4000'),
                'odeme_tarihi': bugun, 'bakiyeden_mahsup': True,
            }),
        )
        basarilar = [res for res, err in (r_iptal, r_mahsup) if err is None]
        self.assertEqual(len(basarilar), 1, (r_iptal, r_mahsup))


class TaslakAnalizAyrimiTests(AnalizBulgulariTestBase):
    def test_taslak_ve_onay_bekleyen_cari_ve_finans_analizlerine_girmez(self):
        bugun = timezone.localdate()
        gelir = self._gelir('1000', bugun)
        _, th_err = GelirTahsilatService().tahsilat_yap({
            'gelir_kaydi_id': gelir.id, 'tutar': Decimal('400'),
            'tahsilat_tarihi': bugun, 'mali_hesap_id': self.banka.id,
            'odeme_yontemi_id': self.eft.id, 'islem_yapan': self.user,
        })
        self.assertIsNone(th_err, th_err)
        self._gelir('600', bugun, taslak_olarak_kaydet=True)

        gider = self._gider('2000', bugun)
        _, od_err = GiderOdemeService().odeme_yap({
            'gider_kaydi_id': gider.id, 'tutar': Decimal('500'),
            'odeme_tarihi': bugun, 'mali_hesap_id': self.banka.id,
            'odeme_yontemi_id': self.eft.id, 'islem_yapan': self.user,
        })
        self.assertIsNone(od_err, od_err)
        self._gider('450', bugun, taslak_olarak_kaydet=True)
        onay_bekleyen = self._gider('350', bugun, taslak_olarak_kaydet=True)
        GiderKaydi.objects.filter(pk=onay_bekleyen.pk).update(durum=GiderDurum.ONAY_BEKLIYOR)

        svc = CariReportService()
        ga = svc.build('gelir-analizi', self.kurum.id, self.sube.id, {'cari_hesap_id': self.cari.id})
        ga_kpi = {k['label']: k['value'] for k in ga['kpis']}
        self.assertEqual(ga_kpi, {'Toplam Gelir': 1000.0, 'Tahsil Edilen': 400.0, 'Bekleyen': 600.0})

        gda = svc.build('gider-analizi', self.kurum.id, self.sube.id, {'cari_hesap_id': self.cari.id})
        gda_kpi = {k['label']: k['value'] for k in gda['kpis']}
        self.assertEqual(gda_kpi, {'Toplam Gider': 2000.0, 'Ödenen': 500.0, 'Kalan': 1500.0})

        panel = CariPanelService().panel(self.cari.id)
        self.assertEqual(panel['net']['toplam_gelir'], 1000.0)
        self.assertEqual(panel['net']['toplam_gider'], 2000.0)

        fsvc = FinansV2RaporService()
        f_ga = {k['label']: k['value'] for k in fsvc.build('gelir-analizi', self.kurum.id, self.sube.id, {})['kpis']}
        f_gda = {k['label']: k['value'] for k in fsvc.build('gider-analizi', self.kurum.id, self.sube.id, {})['kpis']}
        self.assertEqual((f_ga['Toplam Gelir'], f_ga['Bekleyen']), (1000.0, 600.0))
        self.assertEqual((f_gda['Toplam Gider'], f_gda['Kalan']), (2000.0, 1500.0))
