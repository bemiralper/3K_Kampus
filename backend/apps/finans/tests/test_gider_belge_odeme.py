"""
Gider belgesi, ödeme planı ve gerçekleşen ödeme ayrımı testleri.
"""
from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone

from apps.finans.application.gider_belge_service import (
    ek_yukle,
    generate_gider_islem_belge_no,
    gider_islem_belgesi,
    odeme_belgesi,
    odeme_plani_belgesi,
)
from apps.finans.application.gider_odeme_durumu import compute_odeme_durumu
from apps.finans.application.gider_odeme_service import GiderOdemeService
from apps.finans.application.gider_service import GiderService
from apps.finans.application.gider_v2.gider_query_service import GiderQueryService
from apps.finans.constants.account_types import MaliHesapTipi
from apps.finans.constants.cari_types import CariHesapTuru
from apps.finans.constants.gider_types import GiderOdemeDurumu, GiderTaksitDurum, OdemeDurum
from apps.finans.constants.hareket_types import HareketKaynagi, HareketYonu
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gider_kategorisi import GiderKategorisi
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class GiderBelgeOdemeTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Belge Kurum', kod='GB001')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='GBM')
        self.user = User.objects.create_user(username='giderbelge', password='x')
        self.tedarikci = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube, unvan='Kağıt A.Ş.',
            hesap_turu=CariHesapTuru.TEDARIKCI,
        )
        self.kat = GiderKategorisi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Kırtasiye',
        )
        self.mali = MaliHesap.objects.create(
            sube=self.sube, ad='Ana Kasa', tip=MaliHesapTipi.KASA,
        )
        self.yontem = OdemeYontemi.objects.create(
            mali_hesap=self.mali, kurum=self.kurum, ad='Nakit',
            tip=OdemeYontemiTipi.NAKIT, komisyon_orani=Decimal('0'),
        )
        self.svc = GiderService()
        self.odeme_svc = GiderOdemeService()
        self.today = timezone.localdate()

    def _create(self, brut='30000', **over):
        data = {
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.tedarikci.id,
            'gider_kategorisi_id': self.kat.id,
            'mali_hesap_id': self.mali.id,
            'odeme_yontemi_id': self.yontem.id,
            'brut_tutar': Decimal(brut),
            'kdv_orani': 0,
            'fatura_tarihi': self.today,
            'vade_tarihi': self.today,
            'taksit_sayisi': 1,
            'aciklama': 'Kırtasiye alımı',
            'olusturan': self.user,
        }
        data.update(over)
        gider, err = self.svc.create(data)
        self.assertIsNone(err, err)
        return gider

    def _ode(self, gider, tutar, taksit=None, odeme_tarihi=None):
        payload = {
            'gider_kaydi_id': gider.id,
            'tutar': Decimal(str(tutar)),
            'odeme_tarihi': odeme_tarihi or self.today,
            'mali_hesap_id': self.mali.id,
            'odeme_yontemi_id': self.yontem.id,
            'islem_yapan': self.user,
        }
        if taksit is not None:
            payload['gider_taksit_id'] = taksit.id
        odeme, err = self.odeme_svc.odeme_yap(payload)
        self.assertIsNone(err, err)
        return odeme

    def _cikis_sayisi(self, kaynak_id=None):
        qs = BakiyeHareketi.objects.filter(
            kaynak=HareketKaynagi.GIDER, yon=HareketYonu.CIKIS,
        )
        if kaynak_id:
            qs = qs.filter(kaynak_id=kaynak_id)
        return qs.count()

    def test_pesin_gider_belge_no_ve_bekliyor(self):
        gider = self._create()
        self.assertRegex(gider.islem_belge_no, r'^GDR-\d{4}-\d{6}$')
        self.assertEqual(compute_odeme_durumu(gider), GiderOdemeDurumu.BEKLIYOR)
        self.assertEqual(self._cikis_sayisi(), 0)
        self.assertEqual(gider.odenen_toplam, Decimal('0'))
        self.assertEqual(gider.kalan_tutar, Decimal('30000'))

    def test_ileri_tarihli_gider_kasa_cikisi_olmaz(self):
        vade = self.today + timedelta(days=20)
        gider = self._create(vade_tarihi=vade)
        self.assertEqual(compute_odeme_durumu(gider), GiderOdemeDurumu.ILERI_TARIHLI)
        taksit = gider.taksitler.first()
        self.assertEqual(taksit.durum, GiderTaksitDurum.ILERI_TARIHLI)
        self.assertEqual(self._cikis_sayisi(), 0)
        data = GiderQueryService.serialize(gider)
        self.assertEqual(data['odeme_durumu'], GiderOdemeDurumu.ILERI_TARIHLI)
        self.assertFalse(data['has_odeme'])

    def test_iki_ve_alti_taksit_toplamlari(self):
        g2 = self._create(taksit_sayisi=2, vade_tarihi=self.today + timedelta(days=10))
        self.assertEqual(g2.taksitler.count(), 2)
        self.assertEqual(sum(t.tutar for t in g2.taksitler.all()), g2.net_tutar)

        plan = [
            {'taksit_no': i, 'vade_tarihi': (self.today + timedelta(days=30 * i)).isoformat(), 'tutar': '10000'}
            for i in range(1, 7)
        ]
        g6 = self._create(brut='60000', taksit_sayisi=6, taksit_plani=plan)
        self.assertEqual(g6.taksitler.count(), 6)
        self.assertEqual(g6.net_tutar, Decimal('60000'))
        self.assertEqual(self._cikis_sayisi(), 0)

    def test_taksit_odeme_tek_kasa_hareketi(self):
        plan = [
            {'taksit_no': 1, 'vade_tarihi': self.today.isoformat(), 'tutar': '10000'},
            {'taksit_no': 2, 'vade_tarihi': (self.today + timedelta(days=30)).isoformat(), 'tutar': '10000'},
            {'taksit_no': 3, 'vade_tarihi': (self.today + timedelta(days=60)).isoformat(), 'tutar': '10000'},
        ]
        gider = self._create(taksit_sayisi=3, taksit_plani=plan)
        t1 = gider.taksitler.get(taksit_no=1)
        odeme = self._ode(gider, '10000', t1)
        gider.refresh_from_db()
        t1.refresh_from_db()
        self.assertEqual(t1.durum, GiderTaksitDurum.ODENDI)
        self.assertEqual(gider.odenen_toplam, Decimal('10000'))
        self.assertEqual(gider.kalan_tutar, Decimal('20000'))
        self.assertEqual(compute_odeme_durumu(gider), GiderOdemeDurumu.KISMI_ODENDI)
        self.assertEqual(self._cikis_sayisi(), 1)
        self.assertRegex(odeme.odeme_belge_no, r'^ODM-\d{4}-\d{6}$')
        self.assertEqual(BakiyeHareketi.objects.filter(kaynak_tip='GiderOdeme', kaynak_id=odeme.pk).count(), 1)

    def test_birden_fazla_taksit_ve_kismi_odeme(self):
        plan = [
            {'taksit_no': 1, 'vade_tarihi': self.today.isoformat(), 'tutar': '10000'},
            {'taksit_no': 2, 'vade_tarihi': (self.today + timedelta(days=30)).isoformat(), 'tutar': '10000'},
        ]
        gider = self._create(brut='20000', taksit_sayisi=2, taksit_plani=plan)
        t1 = gider.taksitler.get(taksit_no=1)
        self._ode(gider, '4000', t1)
        t1.refresh_from_db()
        self.assertEqual(t1.durum, GiderTaksitDurum.KISMI_ODENDI)
        self.assertEqual(t1.kalan_tutar, Decimal('6000'))
        self._ode(gider, '6000', t1)
        self._ode(gider, '10000', gider.taksitler.get(taksit_no=2))
        gider.refresh_from_db()
        self.assertEqual(gider.odenen_toplam, Decimal('20000'))
        self.assertEqual(compute_odeme_durumu(gider), GiderOdemeDurumu.ODENDI)
        self.assertEqual(self._cikis_sayisi(), 3)

    def test_odeme_toplami_asima_izin_yok(self):
        gider = self._create(brut='5000')
        _, err = self.odeme_svc.odeme_yap({
            'gider_kaydi_id': gider.id,
            'tutar': Decimal('6000'),
            'odeme_tarihi': self.today,
            'mali_hesap_id': self.mali.id,
            'odeme_yontemi_id': self.yontem.id,
        })
        self.assertIsNotNone(err)
        self.assertIn('tutar', err)
        self.assertEqual(self._cikis_sayisi(), 0)

    def test_gecikmis_odeme_durumu(self):
        gider = self._create(vade_tarihi=self.today - timedelta(days=5))
        self.assertEqual(compute_odeme_durumu(gider), GiderOdemeDurumu.GECIKTI)
        self.assertEqual(gider.taksitler.first().durum, GiderTaksitDurum.GECIKTI)

    def test_odeme_belgesi_yalnizca_gerceklesen(self):
        gider = self._create()
        resp, errors = odeme_belgesi(gider, GiderOdeme(gider_kaydi=gider, durum=OdemeDurum.IPTAL, tutar=1), fmt='html')
        self.assertIsNone(resp)
        self.assertIsNotNone(errors)
        odeme = self._ode(gider, '5000')
        html_resp, err = odeme_belgesi(gider, odeme, fmt='html')
        self.assertIsNone(err)
        body = html_resp.content.decode()
        self.assertIn('ÖDEME BELGESİ', body)
        self.assertIn(odeme.odeme_belge_no, body)
        self.assertIn(gider.islem_belge_no, body)
        self.assertIn('fatura veya fiş yerine geçmez', body.lower())

    def test_gider_ve_plan_html_icerik(self):
        gider = self._create(taksit_sayisi=2, vade_tarihi=self.today + timedelta(days=15))
        ghtml = gider_islem_belgesi(gider, fmt='html').content.decode()
        self.assertIn('GİDER İŞLEM BELGESİ', ghtml)
        self.assertIn(gider.islem_belge_no, ghtml)
        self.assertIn('Kağıt', ghtml)
        self.assertIn(str(gider.pk), ghtml)
        self.assertIn('gerçek bir fatura', ghtml.lower())
        phtml = odeme_plani_belgesi(gider, fmt='html').content.decode()
        self.assertIn('ÖDEME PLANI', phtml)
        self.assertIn('Taksit', phtml)

    def test_ekli_fatura_fis(self):
        gider = self._create()
        dosya = SimpleUploadedFile('fis.pdf', b'%PDF-1.4 fake', content_type='application/pdf')
        ek, err = ek_yukle(gider, dosya, yukleyen=self.user)
        self.assertIsNone(err)
        self.assertEqual(ek.dosya_turu, 'fatura_fis')
        self.assertEqual(gider.ekli_belgeler.count(), 1)
        bad = SimpleUploadedFile('x.exe', b'MZ', content_type='application/octet-stream')
        _, err = ek_yukle(gider, bad)
        self.assertIsNotNone(err)

    def test_gider_duzenleme_ve_iptal_cift_hareket_yok(self):
        gider = self._create(brut='10000')
        gider, err = self.svc.update(gider.id, {
            'aciklama': 'Güncellendi', 'islem_yapan': self.user,
        })
        self.assertIsNone(err)
        self.assertEqual(self._cikis_sayisi(), 0)
        gider, err = self.svc.iptal_et(gider.id)
        self.assertIsNone(err)
        self.assertEqual(compute_odeme_durumu(gider), GiderOdemeDurumu.IPTAL)
        self.assertEqual(self._cikis_sayisi(), 0)

    def test_yil_degisince_numara_sifirlanir(self):
        n1 = generate_gider_islem_belge_no(self.kurum.id)
        year = timezone.localdate().year
        self.assertTrue(n1.startswith(f'GDR-{year}-'))
        self._create()
        n2 = generate_gider_islem_belge_no(self.kurum.id)
        self.assertNotEqual(n1, n2)
        self.assertTrue(n2.endswith('000002') or int(n2.split('-')[-1]) >= 2)
