"""
Gider Ödeme Takibi — vade satırları, sıralama ve açıklama önceliği.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.finans.application.gider_odeme_durumu import resolve_odeme_takibi_durum
from apps.finans.application.gider_odeme_service import GiderOdemeService
from apps.finans.application.gider_service import GiderService
from apps.finans.application.gider_v2.gider_odeme_takibi_service import GiderOdemeTakibiQueryService
from apps.finans.constants.account_types import MaliHesapTipi
from apps.finans.constants.cari_types import CariHesapTuru
from apps.finans.constants.gider_types import GiderOdemeTakibiDurum
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gider_kategorisi import GiderKategorisi
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class GiderOdemeTakibiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Takip Kurum', kod='GTK01')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='GTKM')
        self.user = User.objects.create_user(username='gidetakip', password='x')
        self.tedarikci = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube, unvan='Tedarikçi A.Ş.',
            hesap_turu=CariHesapTuru.TEDARIKCI,
        )
        self.kat = GiderKategorisi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Bilgisayar Alımı',
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
        self.q = GiderOdemeTakibiQueryService()
        self.today = timezone.localdate()

    def _create(self, *, brut='10000', vade=None, fatura=None, taksit_sayisi=1,
                taksit_plani=None, aciklama='Gider açıklaması', kategori=None):
        data = {
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.tedarikci.id,
            'gider_kategorisi_id': (kategori or self.kat).id,
            'mali_hesap_id': self.mali.id,
            'odeme_yontemi_id': self.yontem.id,
            'brut_tutar': Decimal(brut),
            'kdv_orani': 0,
            'fatura_tarihi': fatura or self.today,
            'vade_tarihi': vade or self.today,
            'taksit_sayisi': taksit_sayisi,
            'aciklama': aciklama,
            'olusturan': self.user,
        }
        if taksit_plani:
            data['taksit_plani'] = taksit_plani
            data['taksit_sayisi'] = len(taksit_plani)
        gider, err = self.svc.create(data)
        self.assertIsNone(err, err)
        return gider

    def _ode(self, gider, tutar, taksit=None):
        payload = {
            'gider_kaydi_id': gider.id,
            'tutar': Decimal(str(tutar)),
            'odeme_tarihi': self.today,
            'mali_hesap_id': self.mali.id,
            'odeme_yontemi_id': self.yontem.id,
            'islem_yapan': self.user,
        }
        if taksit is not None:
            payload['gider_taksit_id'] = taksit.id
        odeme, err = self.odeme_svc.odeme_yap(payload)
        self.assertIsNone(err, err)
        return odeme

    def _data(self, **filters):
        page = filters.pop('page', 1)
        page_size = filters.pop('page_size', 100)
        allowed = filters.pop('allowed_sube_ids', None)
        return self.q.list_paginated(
            self.kurum.id, self.sube.id,
            filters=filters, allowed_sube_ids=allowed,
            page=page, page_size=page_size,
        )

    def _rows(self, **filters):
        return self._data(**filters)['results']

    def test_pesin_odenen_varsayilan_listede_yok(self):
        gider = self._create(brut='1500')
        self._ode(gider, '1500')
        rows = self._rows()
        self.assertFalse(any(r['gider_id'] == gider.id for r in rows))

    def test_ileri_tarihli_tek_satir_taksit_yok(self):
        vade = self.today + timedelta(days=20)
        gider = self._create(brut='2500', vade=vade, aciklama='Eylül internet ödemesi')
        rows = self._rows()
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual(r['gider_id'], gider.id)
        self.assertIsNone(r['taksit_label'])
        self.assertEqual(r['durum'], GiderOdemeTakibiDurum.ILERI_TARIHLI)
        self.assertEqual(r['aciklama'], 'Eylül internet ödemesi')
        self.assertEqual(r['aciklama_kaynak'], 'gider')

    def test_uc_taksit_ayri_satir(self):
        d1 = self.today + timedelta(days=15)
        d2 = self.today + timedelta(days=45)
        d3 = self.today + timedelta(days=75)
        self._create(
            brut='36000',
            taksit_plani=[
                {'taksit_no': 1, 'vade_tarihi': d1.isoformat(), 'tutar': '12000', 'aciklama': '1. taksit ödemesi'},
                {'taksit_no': 2, 'vade_tarihi': d2.isoformat(), 'tutar': '12000'},
                {'taksit_no': 3, 'vade_tarihi': d3.isoformat(), 'tutar': '12000'},
            ],
            aciklama='3 adet bilgisayar alımı',
        )
        rows = self._rows()
        self.assertEqual(len(rows), 3)
        self.assertEqual([r['taksit_label'] for r in rows], ['1 / 3', '2 / 3', '3 / 3'])
        self.assertEqual(rows[0]['aciklama'], '1. taksit ödemesi')
        self.assertEqual(rows[0]['aciklama_kaynak'], 'odeme')
        self.assertEqual(rows[1]['aciklama'], '3 adet bilgisayar alımı')
        self.assertEqual(rows[1]['aciklama_kaynak'], 'gider')

    def test_ilk_taksit_odendi_digerleri_kalir(self):
        d1 = self.today + timedelta(days=15)
        d2 = self.today + timedelta(days=45)
        gider = self._create(
            brut='20000',
            taksit_plani=[
                {'taksit_no': 1, 'vade_tarihi': d1.isoformat(), 'tutar': '10000'},
                {'taksit_no': 2, 'vade_tarihi': d2.isoformat(), 'tutar': '10000'},
            ],
        )
        t1 = gider.taksitler.get(taksit_no=1)
        self._ode(gider, '10000', taksit=t1)
        rows = self._rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['taksit_label'], '2 / 2')
        _, err = self.odeme_svc.odeme_yap({
            'gider_kaydi_id': gider.id,
            'gider_taksit_id': t1.id,
            'tutar': Decimal('100'),
            'odeme_tarihi': self.today,
            'mali_hesap_id': self.mali.id,
            'odeme_yontemi_id': self.yontem.id,
            'islem_yapan': self.user,
        })
        self.assertIsNotNone(err)

    def test_kismi_odeme_durumu(self):
        vade = self.today + timedelta(days=10)
        gider = self._create(brut='8000', vade=vade)
        self._ode(gider, '3000', taksit=gider.taksitler.get())
        rows = self._rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['durum'], GiderOdemeTakibiDurum.KISMI_ODENDI)
        self.assertEqual(Decimal(rows[0]['kalan_tutar']), Decimal('5000.00'))

    def test_gecikmis_bugun_yaklasan_ileri_sirasi(self):
        gecik = self._create(brut='1000', vade=self.today - timedelta(days=5), aciklama='gecik')
        bugun = self._create(brut='1000', vade=self.today, aciklama='bugun')
        yakin = self._create(brut='1000', vade=self.today + timedelta(days=3), aciklama='yakin')
        ileri = self._create(brut='1000', vade=self.today + timedelta(days=20), aciklama='ileri')
        rows = self._rows()
        self.assertEqual([r['aciklama'] for r in rows], ['gecik', 'bugun', 'yakin', 'ileri'])
        self.assertEqual(rows[0]['durum'], GiderOdemeTakibiDurum.GECIKTI)
        self.assertEqual(rows[1]['durum'], GiderOdemeTakibiDurum.BUGUN)
        self.assertEqual(rows[2]['durum'], GiderOdemeTakibiDurum.YAKLASIYOR)
        self.assertEqual(rows[3]['durum'], GiderOdemeTakibiDurum.ILERI_TARIHLI)
        self.assertTrue(any(r['gider_id'] == gecik.id for r in rows))
        self.assertTrue(any(r['gider_id'] == bugun.id for r in rows))
        self.assertTrue(any(r['gider_id'] == yakin.id for r in rows))
        self.assertTrue(any(r['gider_id'] == ileri.id for r in rows))

    def test_yeni_gider_eski_vadeyi_kaybetmez(self):
        """31 Ağustos gider + 15 Ekim vade; sonra eylül giderleri eklenince Ekim yerinde kalır."""
        fatura_31 = self.today.replace(day=1) if self.today.day > 28 else self.today
        ekim = self.today + timedelta(days=45)
        eylul1 = self.today + timedelta(days=1)
        eylul5 = self.today + timedelta(days=5)
        eylul10 = self.today + timedelta(days=10)
        late = self._create(
            brut='15000', fatura=fatura_31, vade=ekim, aciklama='Ekim ödemesi',
        )
        self._create(brut='1000', fatura=eylul1, vade=eylul1, aciklama='Eylül 1')
        self._create(brut='1000', fatura=eylul5, vade=eylul5, aciklama='Eylül 5')
        self._create(brut='1000', fatura=eylul10, vade=eylul10, aciklama='Eylül 10')
        rows = self._rows()
        dates = [r['vade_tarihi'] for r in rows]
        self.assertEqual(dates, [
            eylul1.isoformat(), eylul5.isoformat(), eylul10.isoformat(), ekim.isoformat(),
        ])
        self.assertEqual(rows[-1]['gider_id'], late.id)
        self.assertEqual(rows[-1]['aciklama'], 'Ekim ödemesi')

    def test_durum_filtre_gecikti(self):
        self._create(brut='1000', vade=self.today - timedelta(days=2))
        self._create(brut='1000', vade=self.today + timedelta(days=20))
        rows = self._rows(durum='gecikti')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['durum'], GiderOdemeTakibiDurum.GECIKTI)

    def test_odenen_filtre_ile_gorunur(self):
        gider = self._create(brut='500')
        self._ode(gider, '500')
        rows = self._rows(durum='odendi')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['durum'], GiderOdemeTakibiDurum.ODENDI)

    def test_takip_durum_hesabi(self):
        self.assertEqual(
            resolve_odeme_takibi_durum(self.today - timedelta(days=1), Decimal('10'), Decimal('0')),
            GiderOdemeTakibiDurum.GECIKTI,
        )
        self.assertEqual(
            resolve_odeme_takibi_durum(self.today, Decimal('10'), Decimal('0')),
            GiderOdemeTakibiDurum.BUGUN,
        )
        self.assertEqual(
            resolve_odeme_takibi_durum(self.today + timedelta(days=7), Decimal('10'), Decimal('0')),
            GiderOdemeTakibiDurum.YAKLASIYOR,
        )
        self.assertEqual(
            resolve_odeme_takibi_durum(self.today + timedelta(days=8), Decimal('10'), Decimal('0')),
            GiderOdemeTakibiDurum.ILERI_TARIHLI,
        )

    def test_donem_7gun_ve_bu_ay(self):
        self._create(brut='1000', vade=self.today + timedelta(days=3), aciklama='yakin')
        self._create(brut='1000', vade=self.today + timedelta(days=20), aciklama='uzak')
        self._create(brut='1000', vade=self.today, aciklama='bugun-satir')
        self.assertEqual(
            [r['aciklama'] for r in self._rows(donem='7gun')],
            ['bugun-satir', 'yakin'],
        )
        self.assertEqual([r['aciklama'] for r in self._rows(donem='bugun')], ['bugun-satir'])
        bu_ay = self._rows(donem='bu_ay')
        self.assertTrue(any(r['aciklama'] == 'bugun-satir' for r in bu_ay))

    def test_ozel_tarih_araligi(self):
        d1 = self.today + timedelta(days=2)
        d2 = self.today + timedelta(days=12)
        self._create(brut='1000', vade=d1, aciklama='icinde')
        self._create(brut='1000', vade=d2, aciklama='disinda')
        rows = self._rows(donem='ozel', baslangic=d1.isoformat(), bitis=d1.isoformat())
        self.assertEqual([r['aciklama'] for r in rows], ['icinde'])

    def test_odeme_tipi_taksitli_ve_tek(self):
        self._create(brut='1000', vade=self.today + timedelta(days=4), aciklama='tek')
        self._create(
            brut='3000',
            taksit_plani=[
                {'taksit_no': 1, 'vade_tarihi': (self.today + timedelta(days=4)).isoformat(), 'tutar': '1500'},
                {'taksit_no': 2, 'vade_tarihi': (self.today + timedelta(days=40)).isoformat(), 'tutar': '1500'},
            ],
            aciklama='taksitli',
        )
        taksitli = self._rows(odeme_tipi='taksitli')
        self.assertEqual(len(taksitli), 2)
        self.assertTrue(all(r['taksit_label'] for r in taksitli))
        tek = self._rows(odeme_tipi='tek')
        self.assertEqual(len(tek), 1)
        self.assertIsNone(tek[0]['taksit_label'])

    def test_kategori_ve_arama(self):
        kira = GiderKategorisi.objects.create(kurum=self.kurum, sube=self.sube, ad='Kira')
        self._create(brut='2000', vade=self.today + timedelta(days=3), aciklama='Ağustos kira', kategori=kira)
        self._create(brut='1000', vade=self.today + timedelta(days=3), aciklama='Kırtasiye notu')
        rows = self._rows(gider_kategorisi_id=kira.id)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['gider_adi'], 'Kira')
        self.assertEqual(len(self._rows(arama='Tedarikçi')), 2)
        self.assertEqual(len(self._rows(arama='Ağustos kira')), 1)
        self.assertEqual(len(self._rows(arama='Kira')), 1)

    def test_odeme_aciklamasi_ile_arama(self):
        self._create(
            brut='2000',
            taksit_plani=[
                {
                    'taksit_no': 1,
                    'vade_tarihi': (self.today + timedelta(days=4)).isoformat(),
                    'tutar': '2000',
                    'aciklama': '2. taksit ödemesi',
                },
            ],
            aciklama='Gider gövde',
        )
        rows = self._rows(arama='2. taksit ödemesi')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['aciklama_kaynak'], 'odeme')

    def test_birlesik_7gun_bekliyor_taksitli_toplam(self):
        yakin = self.today + timedelta(days=3)
        uzak = self.today + timedelta(days=40)
        self._create(
            brut='36000',
            taksit_plani=[
                {'taksit_no': 1, 'vade_tarihi': yakin.isoformat(), 'tutar': '12000'},
                {'taksit_no': 2, 'vade_tarihi': uzak.isoformat(), 'tutar': '12000'},
                {'taksit_no': 3, 'vade_tarihi': (uzak + timedelta(days=30)).isoformat(), 'tutar': '12000'},
            ],
            aciklama='Bilgisayar',
        )
        self._create(brut='2500', vade=yakin, aciklama='Tek ödeme 7 gün')
        self._create(brut='8000', vade=self.today - timedelta(days=2), aciklama='Gecikmiş taksit değil')
        data = self._data(durum='bekliyor', donem='7gun', odeme_tipi='taksitli')
        self.assertEqual(data['total'], 1)
        self.assertEqual(Decimal(data['toplam_tutar']), Decimal('12000.00'))
        self.assertEqual(data['results'][0]['taksit_label'], '1 / 3')

    def test_pagination_toplam_filtreli_kalir(self):
        for i in range(5):
            self._create(brut='1000', vade=self.today + timedelta(days=2), aciklama=f'satir-{i}')
        data = self._data(donem='7gun', page=1, page_size=2)
        self.assertEqual(len(data['results']), 2)
        self.assertEqual(data['total'], 5)
        self.assertEqual(Decimal(data['toplam_tutar']), Decimal('5000.00'))

    def test_sube_filtresi_yetki_disini_gorme(self):
        diger = Sube.objects.create(kurum=self.kurum, ad='Diğer', kod='GTKD')
        kat2 = GiderKategorisi.objects.create(kurum=self.kurum, sube=diger, ad='Su')
        ted2 = CariHesap.objects.create(
            kurum=self.kurum, sube=diger, unvan='Diğer Cari',
            hesap_turu=CariHesapTuru.TEDARIKCI,
        )
        mali2 = MaliHesap.objects.create(sube=diger, ad='Kasa 2', tip=MaliHesapTipi.KASA)
        yontem2 = OdemeYontemi.objects.create(
            mali_hesap=mali2, kurum=self.kurum, ad='Nakit 2',
            tip=OdemeYontemiTipi.NAKIT, komisyon_orani=Decimal('0'),
        )
        self._create(brut='1000', vade=self.today + timedelta(days=2), aciklama='merkez')
        g, err = self.svc.create({
            'kurum_id': self.kurum.id,
            'sube_id': diger.id,
            'cari_hesap_id': ted2.id,
            'gider_kategorisi_id': kat2.id,
            'mali_hesap_id': mali2.id,
            'odeme_yontemi_id': yontem2.id,
            'brut_tutar': Decimal('4000'),
            'kdv_orani': 0,
            'fatura_tarihi': self.today,
            'vade_tarihi': self.today + timedelta(days=2),
            'taksit_sayisi': 1,
            'aciklama': 'diger-sube',
            'olusturan': self.user,
        })
        self.assertIsNone(err, err)
        only_merkez = self._data(filtre_sube_id=str(diger.id), allowed_sube_ids=[self.sube.id])
        self.assertFalse(any(r['aciklama'] == 'diger-sube' for r in only_merkez['results']))
        both = self._data(
            filtre_sube_id='all',
            allowed_sube_ids=[self.sube.id, diger.id],
        )
        self.assertEqual(both['total'], 2)
        self.assertEqual(Decimal(both['toplam_tutar']), Decimal('5000.00'))
        self.assertIsNotNone(g)
