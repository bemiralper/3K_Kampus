"""
Gelir & Gider v2 servis testleri — Faz 2
(command + query + dashboard + rapor + audit).
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.roller.models import Role, UserRole
from apps.roller.seed import ensure_default_roles
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.gelir_kategorisi import GelirKategorisi
from apps.finans.domain.gider_kategorisi import GiderKategorisi
from apps.finans.domain.cari_etiket import CariEtiket
from apps.finans.domain.finans_islem_log import FinansIslemLog
from apps.finans.constants.cari_types import CariHesapTuru

from apps.finans.application.gelir_v2.gelir_command_service import GelirCommandService
from apps.finans.application.gelir_v2.gelir_query_service import GelirQueryService
from apps.finans.application.gelir_v2.gelir_dashboard_service import GelirDashboardService
from apps.finans.application.gider_v2.gider_command_service import GiderCommandService
from apps.finans.application.gider_v2.gider_query_service import GiderQueryService
from apps.finans.application.gider_v2.gider_dashboard_service import GiderDashboardService
from apps.finans.application.finans_v2.rapor_service import FinansV2RaporService, SLUGS
from apps.finans.application.tanimlar.tanim_service import (
    GelirKaynagiService, MaliyetMerkeziService, ProjeService,
)


class GelirGiderV2Test(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='V2 Kurum', kod='V2K001')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.musteri = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube, unvan='Müşteri A',
            hesap_turu=CariHesapTuru.MUSTERI,
        )
        self.tedarikci = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube, unvan='Tedarikçi B',
            hesap_turu=CariHesapTuru.TEDARIKCI,
        )
        self.gelir_kat = GelirKategorisi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Eğitim Geliri',
        )
        self.gider_kat = GiderKategorisi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Kira Gideri',
        )
        self.etiket = CariEtiket.objects.create(kurum=self.kurum, sube=self.sube, ad='Önemli')
        self.kaynak, _ = GelirKaynagiService().create(self.kurum.id, {'ad': 'Ders Ücreti'}, sube_id=self.sube.id)
        self.merkez, _ = MaliyetMerkeziService().create(self.kurum.id, {'ad': 'İdari'}, sube_id=self.sube.id)
        self.proje, _ = ProjeService().create(self.kurum.id, {'ad': 'Kampanya'}, sube_id=self.sube.id)

    def _gelir_data(self, brut='1000', **over):
        d = {
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.musteri.id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'gelir_kaynagi_id': self.kaynak.id,
            'proje_id': self.proje.id,
            'brut_tutar': Decimal(brut),
            'kdv_orani': 20,
            'fatura_tarihi': date.today(),
            'vade_tarihi': date.today(),
            'etiket_ids': [self.etiket.id],
        }
        d.update(over)
        return d

    def _gider_data(self, brut='500', **over):
        d = {
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.tedarikci.id,
            'gider_kategorisi_id': self.gider_kat.id,
            'maliyet_merkezi_id': self.merkez.id,
            'proje_id': self.proje.id,
            'brut_tutar': Decimal(brut),
            'kdv_orani': 20,
            'fatura_tarihi': date.today(),
            'vade_tarihi': date.today(),
            'taksit_sayisi': 1,
            'etiket_ids': [self.etiket.id],
        }
        d.update(over)
        return d

    def test_gelir_create_v2_alanlar_ve_audit(self):
        gelir, err = GelirCommandService().create(self._gelir_data())
        self.assertIsNone(err)
        self.assertEqual(gelir.gelir_kaynagi_id, self.kaynak.id)
        self.assertEqual(gelir.proje_id, self.proje.id)
        self.assertEqual(gelir.net_tutar, Decimal('1200.00'))
        self.assertEqual(list(gelir.etiketler.values_list('id', flat=True)), [self.etiket.id])
        # audit log
        self.assertTrue(FinansIslemLog.objects.filter(
            modul='gelir', eylem='olustur', kayit_id=gelir.pk).exists())

    def test_gelir_query_ve_dashboard(self):
        GelirCommandService().create(self._gelir_data('1000'))
        GelirCommandService().create(self._gelir_data('2000'))
        res = GelirQueryService().list_paginated(self.kurum.id, self.sube.id, page=1, page_size=10)
        self.assertEqual(res['total'], 2)
        self.assertEqual(len(res['results']), 2)
        # filtre: tutar_min
        res2 = GelirQueryService().list_paginated(
            self.kurum.id, self.sube.id, filters={'tutar_min': '1500'})
        self.assertEqual(res2['total'], 1)

        dash = GelirDashboardService().summary(self.kurum.id, self.sube.id)
        self.assertIn('bu_ay_gelir', dash['kartlar'])
        self.assertEqual(Decimal(dash['kartlar']['toplam_gelir']), Decimal('3600.00'))

    def test_gider_create_query_dashboard(self):
        gider, err = GiderCommandService().create(self._gider_data('500'))
        self.assertIsNone(err)
        self.assertEqual(gider.maliyet_merkezi_id, self.merkez.id)
        self.assertEqual(gider.net_tutar, Decimal('600.00'))

        res = GiderQueryService().list_paginated(self.kurum.id, self.sube.id)
        self.assertEqual(res['total'], 1)

        dash = GiderDashboardService().summary(self.kurum.id, self.sube.id)
        self.assertEqual(Decimal(dash['kartlar']['toplam_gider']), Decimal('600.00'))

    def test_gider_musteriye_acilamaz(self):
        _, err = GiderCommandService().create(self._gider_data(cari_hesap_id=self.musteri.id))
        self.assertIsNotNone(err)

    def test_gider_liste_ve_rapor_iptal_kayitlarini_haric_tutar(self):
        """İptal giderler varsayılan listede/raporda görünmemeli (dashboard ile tutarlı)."""
        gider, _ = GiderCommandService().create(self._gider_data('500'))
        GiderCommandService().onayla(gider.id)
        _, err = GiderCommandService().iptal_et(gider.id)
        self.assertIsNone(err)

        res = GiderQueryService().list_paginated(self.kurum.id, self.sube.id)
        self.assertEqual(res['total'], 0)

        res_iptal = GiderQueryService().list_paginated(
            self.kurum.id, self.sube.id, filters={'durum': 'iptal'},
        )
        self.assertEqual(res_iptal['total'], 1)

        rapor = FinansV2RaporService().gider_analizi(self.kurum.id, self.sube.id, {})
        self.assertEqual(rapor['kpis'][0]['value'], 0)

    def test_tum_raporlar_calisir(self):
        GelirCommandService().create(self._gelir_data('1000'))
        GiderCommandService().create(self._gider_data('400'))
        svc = FinansV2RaporService()
        for slug in SLUGS:
            data = svc.build(slug, self.kurum.id, self.sube.id, {})
            self.assertIsNotNone(data, f'{slug} None döndü')
            self.assertIn('baslik', data, f'{slug} baslik yok')
            self.assertIn('columns', data, f'{slug} columns yok')
            self.assertIn('rows', data, f'{slug} rows yok')

    def test_gelir_iptal_audit(self):
        gelir, _ = GelirCommandService().create(self._gelir_data())
        _, err = GelirCommandService().iptal_et(gelir.id)
        self.assertIsNone(err)
        self.assertTrue(FinansIslemLog.objects.filter(
            modul='gelir', eylem='iptal', kayit_id=gelir.id).exists())


class GelirGiderV2ApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_default_roles()
        cls.kurum = Kurum.objects.create(ad='GG API Kurum', kod='GGAPI')
        cls.sube = Sube.objects.create(kurum=cls.kurum, ad='Merkez', kod='GG-M')
        cls.musteri = CariHesap.objects.create(
            kurum=cls.kurum, sube=cls.sube, unvan='API Müşteri',
            hesap_turu=CariHesapTuru.MUSTERI,
        )
        cls.gelir_kat = GelirKategorisi.objects.create(
            kurum=cls.kurum, sube=cls.sube, ad='API Gelir Kat',
        )
        cls.role = Role.objects.get(code='muhasebe')
        cls.user = User.objects.create_user(username='gg_muh', password='test123')
        UserRole.objects.create(user=cls.user, role=cls.role)

    def setUp(self):
        self.client = Client()

    def _q(self, path):
        return f'{path}?kurum_id={self.kurum.id}&sube_id={self.sube.id}'

    def test_anonim_erisemez(self):
        r = self.client.get(self._q('/finans/api/gelir/v2/kayitlar/'))
        self.assertIn(r.status_code, (401, 403))

    def test_muhasebe_liste_dashboard_dropdown(self):
        self.client.login(username='gg_muh', password='test123')
        for path in ['/finans/api/gelir/v2/kayitlar/', '/finans/api/gelir/v2/dashboard/',
                     '/finans/api/gider/v2/kayitlar/', '/finans/api/gider/v2/dashboard/',
                     '/finans/api/gelir-gider/v2/dropdown/']:
            r = self.client.get(self._q(path))
            self.assertEqual(r.status_code, 200, f'{path} -> {r.status_code}: {r.content[:200]}')

    def test_gelir_create_ve_detail_api(self):
        self.client.login(username='gg_muh', password='test123')
        r = self.client.post(
            self._q('/finans/api/gelir/v2/kayitlar/'),
            data={
                'kurum_id': self.kurum.id,
                'cari_hesap_id': self.musteri.id,
                'gelir_kategorisi_id': self.gelir_kat.id,
                'brut_tutar': '1000.00',
                'kdv_orani': 20,
                'fatura_tarihi': str(date.today()),
                'vade_tarihi': str(date.today()),
            },
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 201, r.content)
        gid = r.json()['id']
        d = self.client.get(self._q(f'/finans/api/gelir/v2/kayitlar/{gid}/'))
        self.assertEqual(d.status_code, 200)
        self.assertEqual(d.json()['net_tutar'], '1200.00')

    def test_rapor_endpoint(self):
        self.client.login(username='gg_muh', password='test123')
        r = self.client.get(self._q('/finans/api/gelir-gider/v2/raporlar/finans-ozeti/'))
        self.assertEqual(r.status_code, 200)
        self.assertIn('kpis', r.json())

    def test_yetkiler_full(self):
        self.client.login(username='gg_muh', password='test123')
        r = self.client.get('/finans/api/gelir-gider/v2/yetkiler/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['can_manage'])

    def test_rapor_export_json(self):
        self.client.login(username='gg_muh', password='test123')
        r = self.client.get(
            self._q('/finans/api/gelir-gider/v2/raporlar/finans-ozeti/export/') + '&fmt=json'
        )
        self.assertEqual(r.status_code, 200, r.content[:300])
        body = r.json()
        self.assertIn('columns', body)
        self.assertIn('rows', body)

    def test_rapor_export_csv(self):
        self.client.login(username='gg_muh', password='test123')
        r = self.client.get(
            self._q('/finans/api/gelir-gider/v2/raporlar/finans-ozeti/export/') + '&fmt=csv'
        )
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertIn('text/csv', r['Content-Type'])
        self.assertIn('attachment', r['Content-Disposition'])
        content = r.content.decode('utf-8')
        # Ortak standart: kurum adı + rapor başlığı üst bilgi olarak yer alır
        self.assertIn('GG API Kurum', content)
        self.assertIn('Finans Özeti', content)

    def test_rapor_export_xlsx(self):
        self.client.login(username='gg_muh', password='test123')
        r = self.client.get(
            self._q('/finans/api/gelir-gider/v2/raporlar/gelir-analizi/export/') + '&fmt=xlsx'
        )
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertIn('spreadsheetml', r['Content-Type'])

    def test_rapor_export_gecersiz_slug(self):
        self.client.login(username='gg_muh', password='test123')
        r = self.client.get(
            self._q('/finans/api/gelir-gider/v2/raporlar/olmayan-rapor/export/') + '&fmt=csv'
        )
        self.assertEqual(r.status_code, 404)
