"""
Cari v2 — servis ve API testleri.

Kapsam:
  - Risk hesaplama servisi (birim)
  - Komut servisi: oluşturma + açılış bakiyesi (merkezi CariHareketService ile)
  - Sorgu servisi: filtreleme + sayfalama + risk filtresi
  - Dashboard özet kartları
  - Raporlar (ekstre, hesap-ozeti, risk-analizi)
  - Muhasebe rolü API erişimi (finans.manage → tam yetki)
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from apps.egitim_yili.domain.models import EgitimYili
from apps.finans.application.cari_v2.cari_command_service import CariCommandService
from apps.finans.application.cari_v2.cari_dashboard_service import CariDashboardService
from apps.finans.application.cari_v2.cari_query_service import CariQueryService
from apps.finans.application.cari_v2.cari_report_service import CariReportService
from apps.finans.application.cari_v2.cari_risk_service import hesapla_risk
from apps.finans.constants.cari_types import CariHareketYonu, CariHesapTuru
from apps.finans.domain.cari_hesap import CariHesap
from apps.roller.models import Role, UserRole
from apps.roller.seed import ensure_default_roles
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class CariV2ServiceTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='V2 Kurum', kod='V2K')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='V2-M')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='v2test', password='test')

    def _create(self, **kwargs):
        data = {
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'unvan': kwargs.pop('unvan', 'Müşteri A'),
            'hesap_turu': kwargs.pop('hesap_turu', CariHesapTuru.MUSTERI),
        }
        data.update(kwargs)
        hesap, err = CariCommandService().create(data, islem_yapan=self.user)
        self.assertIsNone(err, err)
        return hesap

    # ─── Risk servisi ────────────────────────────
    def test_risk_normal_when_no_limit_no_overdue(self):
        r = hesapla_risk(acik_borc=1000, risk_limiti=0, vadesi_gecmis=0)
        self.assertEqual(r['risk_durumu'], 'normal')

    def test_risk_limit_asildi(self):
        r = hesapla_risk(acik_borc=1500, risk_limiti=1000, vadesi_gecmis=0)
        self.assertEqual(r['risk_durumu'], 'limit_asildi')
        self.assertGreater(r['kullanim_orani'], 100)

    def test_risk_kritik_when_overdue_and_limit_exceeded(self):
        r = hesapla_risk(acik_borc=1500, risk_limiti=1000, vadesi_gecmis=500)
        self.assertEqual(r['risk_durumu'], 'kritik')
        self.assertEqual(r['risk_skoru'], 100.0)

    # ─── Komut servisi + açılış bakiyesi ─────────
    def test_create_with_opening_balance_updates_balance(self):
        hesap = self._create(
            unvan='Açılışlı Müşteri',
            acilis_bakiye=Decimal('2500'),
            acilis_yon=CariHareketYonu.BORC,
        )
        hesap.refresh_from_db()
        self.assertEqual(float(hesap.toplam_borc), 2500.0)
        self.assertEqual(float(hesap.bakiye), 2500.0)
        # İmmutable hareket kaydı oluşmalı
        self.assertEqual(hesap.hareketler.filter(islem_turu='acilis').count(), 1)

    def test_create_new_type_gelir_hesabi(self):
        hesap = self._create(unvan='Gelir Hesabı', hesap_turu=CariHesapTuru.GELIR_HESABI)
        self.assertEqual(hesap.hesap_turu, 'gelir_hesabi')
        self.assertTrue(hesap.hesap_kodu.startswith('CH-GLR-'))

    def test_vergi_no_unique_per_sube(self):
        self._create(unvan='A', vergi_no='1234567890')
        _, err = CariCommandService().create({
            'kurum_id': self.kurum.id, 'sube_id': self.sube.id,
            'unvan': 'B', 'hesap_turu': CariHesapTuru.MUSTERI,
            'vergi_no': '1234567890',
        })
        self.assertIsNotNone(err)
        self.assertIn('vergi_no', err)

    # ─── Sorgu servisi ───────────────────────────
    def test_query_pagination_and_filter(self):
        for i in range(5):
            self._create(unvan=f'Cari {i}')
        self._create(unvan='Borçlu Cari', acilis_bakiye=Decimal('100'),
                     acilis_yon=CariHareketYonu.ALACAK)  # net negatif → borçlu

        res = CariQueryService().list_paginated(
            self.kurum.id, self.sube.id, page=1, page_size=3,
        )
        self.assertEqual(res['count'], 6)
        self.assertEqual(len(res['results']), 3)
        self.assertEqual(res['total_pages'], 2)

        borclu = CariQueryService().list_paginated(
            self.kurum.id, self.sube.id, filters={'bakiye_durumu': 'borclu'},
        )
        self.assertEqual(borclu['count'], 1)
        self.assertEqual(borclu['results'][0]['unvan'], 'Borçlu Cari')

    def test_query_search(self):
        self._create(unvan='Acme Ltd')
        self._create(unvan='Beta AŞ')
        res = CariQueryService().list_paginated(
            self.kurum.id, self.sube.id, filters={'arama': 'acme'},
        )
        self.assertEqual(res['count'], 1)

    # ─── Dashboard ───────────────────────────────
    def test_dashboard_summary_counts(self):
        self._create(unvan='Alacaklı', acilis_bakiye=Decimal('500'),
                     acilis_yon=CariHareketYonu.BORC)  # net pozitif → alacaklı
        self._create(unvan='Borçlu', acilis_bakiye=Decimal('300'),
                     acilis_yon=CariHareketYonu.ALACAK)  # net negatif → borçlu
        self._create(unvan='Dengede')

        s = CariDashboardService().summary(self.kurum.id, self.sube.id)
        self.assertEqual(s['toplam_cari'], 3)
        self.assertEqual(s['alacakli_cari'], 1)
        self.assertEqual(s['borclu_cari'], 1)
        self.assertEqual(s['dengede_cari'], 1)

    # ─── Raporlar ────────────────────────────────
    def test_report_hesap_ozeti(self):
        self._create(unvan='R1', acilis_bakiye=Decimal('100'),
                     acilis_yon=CariHareketYonu.BORC)
        rapor = CariReportService().build('hesap-ozeti', self.kurum.id, self.sube.id, {})
        self.assertEqual(rapor['baslik'], 'Hesap Özeti')
        self.assertTrue(len(rapor['rows']) >= 1)

    def test_report_ekstre_requires_cari(self):
        rapor = CariReportService().build('ekstre', self.kurum.id, self.sube.id, {})
        self.assertIn('error', rapor)

    def test_report_ekstre_ok(self):
        hesap = self._create(unvan='Ekstre', acilis_bakiye=Decimal('750'),
                             acilis_yon=CariHareketYonu.BORC)
        rapor = CariReportService().build(
            'ekstre', self.kurum.id, self.sube.id, {'cari_hesap_id': hesap.pk},
        )
        self.assertEqual(rapor['ozet']['kapanis'], 750.0)
        self.assertEqual(len(rapor['rows']), 1)


class CariV2ApiPermissionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_default_roles()
        cls.kurum = Kurum.objects.create(ad='API Kurum', kod='APIK')
        cls.sube = Sube.objects.create(kurum=cls.kurum, ad='Merkez', kod='API-M')
        cls.muhasebe_role = Role.objects.get(code='muhasebe')
        cls.user = User.objects.create_user(username='muh_v2', password='test123')
        UserRole.objects.create(user=cls.user, role=cls.muhasebe_role)

    def setUp(self):
        self.client = Client()

    def _q(self, path):
        return f'{path}?kurum_id={self.kurum.id}&sube_id={self.sube.id}'

    def test_anonymous_forbidden(self):
        r = self.client.get(self._q('/finans/api/cari/v2/hesaplar/'))
        self.assertIn(r.status_code, (401, 403))

    def test_muhasebe_can_list(self):
        self.client.login(username='muh_v2', password='test123')
        r = self.client.get(self._q('/finans/api/cari/v2/hesaplar/'))
        self.assertEqual(r.status_code, 200)

    def test_muhasebe_can_dashboard(self):
        self.client.login(username='muh_v2', password='test123')
        r = self.client.get(self._q('/finans/api/cari/v2/dashboard/'))
        self.assertEqual(r.status_code, 200)

    def test_muhasebe_effective_permissions_full(self):
        self.client.login(username='muh_v2', password='test123')
        r = self.client.get('/finans/api/cari/v2/yetkiler/')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data['can_view'])
        self.assertTrue(data['can_edit'])
        self.assertTrue(data['can_delete'])
        self.assertTrue(data['can_manage'])

    def test_muhasebe_can_create_and_detail(self):
        self.client.login(username='muh_v2', password='test123')
        r = self.client.post(
            f'/finans/api/cari/v2/hesaplar/?kurum_id={self.kurum.id}&sube_id={self.sube.id}',
            data={
                'kurum_id': self.kurum.id,
                'unvan': 'API Müşteri',
                'hesap_turu': 'musteri',
            },
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 201, r.content)
        cari_id = r.json()['id']
        d = self.client.get(self._q(f'/finans/api/cari/v2/hesaplar/{cari_id}/'))
        self.assertEqual(d.status_code, 200)
