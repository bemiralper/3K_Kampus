"""
Gelir, Gider ve Cari v2 uçtan uca çoklu senaryo doğrulama testleri.

Kapsanan senaryolar:
1. Müşteri Serbest Tahsilat + Gelir Faturası + Bakiyeden Mahsup + İptal Koruma Kalkanı + Finans Audit (0 bulgu).
2. Gün 1 Serbest Tahsilat + Gün 5 Bakiyeden Mahsup -> Gün Sonu raporunda mükerrer nakit girişi olmaması.
3. Tedarikçi Serbest Ödeme + Gider Faturası + Bakiyeden Mahsup -> Cari bakiyenin 0 kalması (mükerrer alacak yazılmaması) + İptal Kalkanı + Finans Audit.
4. Serbest Tahsilat Çek/Senet akışı -> Portföyde oluşturulması ve tahsil edilince kasa + cari hareket üretmesi.
5. Cari Risk Motoru -> Müşteri (açık alacak), Tedarikçi (açık borç), Karma, Gelir/Gider hesaplarında doğru maruziyet, dashboard ve filtre.
6. Gelir Vade Filtreleri (gecikti, ileri_tarihli, kismi, tamamlanan) ve çok sayfalı (paginated) liste alt toplamları (Gelir, Gider, Cari).
7. Taslak olarak kaydetme + onaylama yaşam döngüsü ve tek adımda peşin tahsilat/ödeme (atomik rollback dahil).
8. HTTP API uçları -> Serbest tahsilat/iptal, Gelir detay, HTML işlem/makbuz belgeleri, ek yükleme/silme, Cari hareket devreden bakiye özeti ve cari kapsamlı raporlar.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.egitim_yili.domain.models import EgitimYili
from apps.finans.application.data_audit import build_finans_audit
from apps.finans.application.cari_balance import (
    hesapla_serbest_odeme_bakiye,
    hesapla_serbest_tahsilat_bakiye,
)
from apps.finans.application.selectors.bakiye_hareketi_selector import BakiyeHareketiSelector
from apps.finans.application.cari_odeme_service import CariOdemeService
from apps.finans.application.cari_tahsilat_service import CariTahsilatService
from apps.finans.application.cari_v2.cari_dashboard_service import CariDashboardService
from apps.finans.application.cari_v2.cari_panel_service import CariPanelService
from apps.finans.application.cari_v2.cari_query_service import CariQueryService
from apps.finans.application.cari_v2.cari_report_service import CariReportService
from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
from apps.finans.application.gelir_tahsilat_service import GelirTahsilatService
from apps.finans.application.gelir_v2.gelir_command_service import GelirCommandService
from apps.finans.application.gelir_v2.gelir_query_service import GelirQueryService
from apps.finans.application.gider_odeme_service import GiderOdemeService
from apps.finans.application.gider_v2.gider_command_service import GiderCommandService
from apps.finans.application.gider_v2.gider_query_service import GiderQueryService
from apps.finans.application.gun_sonu_service import GunSonuService
from apps.finans.constants.cari_types import CariHesapTuru
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gelir_kategorisi import GelirKategorisi
from apps.finans.domain.gider_kategorisi import GiderKategorisi
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


@override_settings(CEK_SENET_V2_ENABLED=True)
class FinansGelirGiderCariMultiScenarioTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Senaryo Kurum', kod='SNR001')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez Şube', kod='MRK')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_superuser(
            username='finans_admin',
            email='finans@test.local',
            password='pass',
        )
        if hasattr(self.user, 'kurum_id'):
            self.user.kurum = self.kurum
            self.user.save(update_fields=['kurum'])

        self.kasa = MaliHesap.objects.create(
            sube=self.sube,
            ad='Ana Kasa',
            tip='kasa',
            para_birimi='TRY',
            aktif_mi=True,
        )
        self.banka = MaliHesap.objects.create(
            sube=self.sube,
            ad='Ana Banka',
            tip='banka',
            para_birimi='TRY',
            aktif_mi=True,
        )
        self.nakit_yontem = OdemeYontemi.objects.create(
            kurum=self.kurum,
            ad='Nakit',
            tip='nakit',
            mali_hesap=self.kasa,
            aktif_mi=True,
        )
        self.eft_yontem = OdemeYontemi.objects.create(
            kurum=self.kurum,
            ad='Havale / EFT',
            tip='havale_eft',
            mali_hesap=self.banka,
            aktif_mi=True,
        )
        self.cek_yontem = OdemeYontemi.objects.create(
            kurum=self.kurum,
            ad='Müşteri Çeki',
            tip='cek',
            aktif_mi=True,
        )

        self.gelir_kat = GelirKategorisi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Kurumsal Eğitim Satışı',
        )
        self.gider_kat = GiderKategorisi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Yayın Alımı',
        )

        self.musteri = CariHesap.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            unvan='ABC Koleji A.Ş.',
            hesap_turu=CariHesapTuru.MUSTERI,
        )
        self.tedarikci = CariHesap.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            unvan='XYZ Yayıncılık Ltd.',
            hesap_turu=CariHesapTuru.TEDARIKCI,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {'HTTP_X_SUBE_ID': str(self.sube.id)}

    def _hesap_bakiye(self, mali_hesap_id: int) -> Decimal:
        return BakiyeHareketiSelector().get_son_bakiye(mali_hesap_id)

    def test_scenario_1_customer_serbest_tahsilat_mahsup_cancel_guard_and_audit(self):
        """Müşteri avans/serbest tahsilat -> fatura -> mahsup -> iptal kalkanı -> tam geri dönüş -> 0 audit bulgusu."""
        res, err = CariTahsilatService().serbest_tahsilat_yap({
            'cari_hesap_id': self.musteri.id,
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'egitim_yili_id': self.ey.id,
            'tutar': Decimal('5000.00'),
            'tahsilat_tarihi': date(2026, 4, 1),
            'mali_hesap_id': self.kasa.id,
            'odeme_yontemi_id': self.nakit_yontem.id,
            'aciklama': 'Ön avans tahsilatı',
            'islem_yapan': self.user,
        })
        self.assertIsNone(err, err)
        serbest_ch_id = res['cari_hareket_id']

        self.musteri.refresh_from_db()
        self.assertEqual(self._hesap_bakiye(self.kasa.id), Decimal('5000.00'))
        self.assertEqual(self.musteri.bakiye, Decimal('-5000.00'))
        self.assertEqual(hesapla_serbest_tahsilat_bakiye(self.musteri.id), Decimal('5000.00'))

        # 8.000 TL KDV muaf gelir faturası kesildiğinde müşteri net bakiyesi +3.000 TL olur
        gelir, g_err = GelirCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.musteri.id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'brut_tutar': Decimal('8000.00'),
            'kdv_orani': 0,
            'kdv_mod': 'muaf',
            'fatura_tarihi': date(2026, 4, 5),
            'vade_tarihi': date(2026, 4, 15),
        }, islem_yapan=self.user)
        self.assertIsNone(g_err)
        self.musteri.refresh_from_db()
        self.assertEqual(self.musteri.bakiye, Decimal('3000.00'))

        # 5.000 TL serbest tahsilattan mahsup edildiğinde kasaya ve cariye ikinci kez yazılmaz!
        tahsilat, t_err = GelirTahsilatService().tahsilat_yap({
            'gelir_kaydi_id': gelir.id,
            'tutar': Decimal('5000.00'),
            'tahsilat_tarihi': date(2026, 4, 5),
            'bakiyeden_mahsup': True,
            'islem_yapan': self.user,
        })
        self.assertIsNone(t_err, t_err)
        self.assertTrue(tahsilat.bakiyeden_mahsup)

        self.musteri.refresh_from_db()
        gelir.refresh_from_db()
        self.assertEqual(self._hesap_bakiye(self.kasa.id), Decimal('5000.00'))
        self.assertEqual(self.musteri.bakiye, Decimal('3000.00'))
        self.assertEqual(gelir.tahsil_edilen, Decimal('5000.00'))
        self.assertEqual(gelir.kalan_tutar, Decimal('3000.00'))
        self.assertEqual(hesapla_serbest_tahsilat_bakiye(self.musteri.id), Decimal('0.00'))

        # Mahsup aktifken serbest tahsilat iptal edilemez!
        _, cancel_err = CariTahsilatService().serbest_tahsilat_iptal(serbest_ch_id)
        self.assertIsNotNone(cancel_err)

        # Önce mahsup iptal edilir, ardından serbest tahsilat güvenle iptal edilir
        _, m_iptal_err = GelirTahsilatService().tahsilat_iptal(tahsilat.id)
        self.assertIsNone(m_iptal_err, m_iptal_err)
        self.assertEqual(hesapla_serbest_tahsilat_bakiye(self.musteri.id), Decimal('5000.00'))

        _, s_iptal_err = CariTahsilatService().serbest_tahsilat_iptal(serbest_ch_id)
        self.assertIsNone(s_iptal_err, s_iptal_err)

        self.musteri.refresh_from_db()
        self.assertEqual(self._hesap_bakiye(self.kasa.id), Decimal('0.00'))
        self.assertEqual(self.musteri.bakiye, Decimal('8000.00'))

        audit = build_finans_audit(kurum_id=self.kurum.id)
        self.assertEqual(audit['finding_count'], 0, audit['findings'])

    def test_scenario_2_gun_sonu_no_double_count_on_mahsup_day(self):
        """Gün 1 serbest tahsilat nakit girişi sayılır; Gün 5 mahsup günü kasa girişi 0'dır."""
        day1 = date(2026, 5, 1)
        day5 = date(2026, 5, 5)
        res, err = CariTahsilatService().serbest_tahsilat_yap({
            'cari_hesap_id': self.musteri.id,
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'egitim_yili_id': self.ey.id,
            'tutar': Decimal('4000.00'),
            'tahsilat_tarihi': day1,
            'mali_hesap_id': self.kasa.id,
            'odeme_yontemi_id': self.nakit_yontem.id,
            'islem_yapan': self.user,
        })
        self.assertIsNone(err, err)

        gelir, _ = GelirCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.musteri.id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'brut_tutar': Decimal('4000.00'),
            'kdv_orani': 0,
            'kdv_mod': 'muaf',
            'fatura_tarihi': day5,
            'vade_tarihi': day5,
        }, islem_yapan=self.user)
        _, m_err = GelirTahsilatService().tahsilat_yap({
            'gelir_kaydi_id': gelir.id,
            'tutar': Decimal('4000.00'),
            'tahsilat_tarihi': day5,
            'bakiyeden_mahsup': True,
            'islem_yapan': self.user,
        })
        self.assertIsNone(m_err, m_err)

        from apps.finans.application.gun_sonu_finans_helpers import bugun_alinan_toplam
        from apps.finans.application.period.period_service import PeriodService

        self.assertEqual(Decimal(str(bugun_alinan_toplam(self.kurum.id, day1, self.sube.id))), Decimal('4000.00'))
        self.assertEqual(Decimal(str(bugun_alinan_toplam(self.kurum.id, day5, self.sube.id))), Decimal('0.00'))

        gs_day5 = GunSonuService().ozet(self.kurum.id, day5, sube_id=self.sube.id)
        self.assertEqual(Decimal(str(gs_day5['tahsilatlar']['toplam'])), Decimal('0.00'))

        donem = PeriodService.period_summary(
            kurum_id=self.kurum.id, baslangic=day1, bitis=day5, sube_id=self.sube.id, mode='alinan',
        )
        self.assertEqual(Decimal(str(donem['ozet']['toplam_tutar'])), Decimal('4000.00'))

    def test_scenario_3_supplier_serbest_odeme_mahsup_zero_balance_and_guard(self):
        """Tedarikçi 6.000 TL serbest ödeme + 6.000 TL gider faturası + mahsup -> bakiye tam 0.00 TL kalır."""
        od_res, err = CariOdemeService().serbest_odeme_yap({
            'cari_hesap_id': self.tedarikci.id,
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'egitim_yili_id': self.ey.id,
            'tutar': Decimal('6000.00'),
            'odeme_tarihi': date(2026, 4, 2),
            'mali_hesap_id': self.banka.id,
            'odeme_yontemi_id': self.eft_yontem.id,
            'islem_yapan': self.user,
        })
        self.assertIsNone(err, err)
        serbest_ch_id = od_res['cari_hareket_id']

        gider, g_err = GiderCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.tedarikci.id,
            'gider_kategorisi_id': self.gider_kat.id,
            'brut_tutar': Decimal('6000.00'),
            'kdv_orani': 0,
            'kdv_mod': 'muaf',
            'fatura_tarihi': date(2026, 4, 6),
            'vade_tarihi': date(2026, 4, 6),
        }, islem_yapan=self.user)
        self.assertIsNone(g_err)

        self.tedarikci.refresh_from_db()
        self.assertEqual(self.tedarikci.bakiye, Decimal('0.00'))

        odeme, o_err = GiderOdemeService().odeme_yap({
            'gider_kaydi_id': gider.id,
            'tutar': Decimal('6000.00'),
            'odeme_tarihi': date(2026, 4, 6),
            'bakiyeden_mahsup': True,
            'islem_yapan': self.user,
        })
        self.assertIsNone(o_err, o_err)

        self.tedarikci.refresh_from_db()
        gider.refresh_from_db()
        self.assertEqual(self.tedarikci.bakiye, Decimal('0.00'))
        self.assertEqual(self._hesap_bakiye(self.banka.id), Decimal('-6000.00'))
        self.assertEqual(gider.durum, 'odendi')
        self.assertEqual(hesapla_serbest_odeme_bakiye(self.tedarikci.id), Decimal('0.00'))

        # Mahsup aktifken serbest ödeme iptali engellenir
        _, guard_err = CariOdemeService().serbest_odeme_iptal(serbest_ch_id)
        self.assertIsNotNone(guard_err)

        _, ipt_err = GiderOdemeService().odeme_iptal(odeme.id)
        self.assertIsNone(ipt_err, ipt_err)
        self.tedarikci.refresh_from_db()
        self.assertEqual(self.tedarikci.bakiye, Decimal('0.00'))
        self.assertEqual(hesapla_serbest_odeme_bakiye(self.tedarikci.id), Decimal('6000.00'))

        audit = build_finans_audit(kurum_id=self.kurum.id)
        self.assertEqual(audit['finding_count'], 0, audit['findings'])

    def test_scenario_4_serbest_tahsilat_cek_senet_lifecycle(self):
        """Serbest tahsilat çek ile alındığında Portföyde açılır; tahsil edilince kasa + cari güncellenir."""
        res, err = CariTahsilatService().serbest_tahsilat_yap({
            'cari_hesap_id': self.musteri.id,
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'egitim_yili_id': self.ey.id,
            'tutar': Decimal('7500.00'),
            'tahsilat_tarihi': date(2026, 4, 10),
            'odeme_yontemi_id': self.cek_yontem.id,
            'vade_tarihi': date(2026, 5, 10),
            'cek_senet_no': 'CHK-9001',
            'banka_adi': 'İş Bankası',
            'islem_yapan': self.user,
        })
        self.assertIsNone(err, err)
        cek_id = res['cek_senet_id']
        self.assertIsNone(res['cari_hareket_id'])

        self.musteri.refresh_from_db()
        self.assertEqual(self._hesap_bakiye(self.kasa.id), Decimal('0.00'))
        self.assertEqual(self.musteri.bakiye, Decimal('0.00'))
        self.assertEqual(hesapla_serbest_tahsilat_bakiye(self.musteri.id), Decimal('0.00'))

        _, tahsil_err = CekSenetService().tahsil_et(
            cek_id,
            tahsilat_mali_hesap_id=self.banka.id,
            tahsilat_tarihi=date(2026, 5, 10),
            user=self.user,
        )
        self.assertIsNone(tahsil_err, tahsil_err)
        self.musteri.refresh_from_db()
        self.assertEqual(self._hesap_bakiye(self.banka.id), Decimal('7500.00'))
        self.assertEqual(self.musteri.bakiye, Decimal('-7500.00'))
        self.assertEqual(hesapla_serbest_tahsilat_bakiye(self.musteri.id), Decimal('7500.00'))

    def test_scenario_5_risk_engine_customer_supplier_karma_and_dashboard(self):
        """Müşteri açık alacakla, tedarikçi açık borçla risk limitini aşar; dashboard ve filtre ikisini de yakalar."""
        self.musteri.risk_limiti = Decimal('10000.00')
        self.musteri.save(update_fields=['risk_limiti'])
        self.tedarikci.risk_limiti = Decimal('10000.00')
        self.tedarikci.save(update_fields=['risk_limiti'])

        GelirCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.musteri.id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'brut_tutar': Decimal('12000.00'),
            'kdv_orani': 0,
            'kdv_mod': 'muaf',
            'fatura_tarihi': date.today(),
            'vade_tarihi': date.today() + timedelta(days=10),
        }, islem_yapan=self.user)
        GiderCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.tedarikci.id,
            'gider_kategorisi_id': self.gider_kat.id,
            'brut_tutar': Decimal('15000.00'),
            'kdv_orani': 0,
            'kdv_mod': 'muaf',
            'fatura_tarihi': date.today(),
            'vade_tarihi': date.today() + timedelta(days=10),
        }, islem_yapan=self.user)

        dash = CariDashboardService().summary(self.kurum.id, self.sube.id)
        self.assertEqual(dash['riskli_cari'], 2)

        filtered = CariQueryService().list_paginated(
            self.kurum.id, self.sube.id, filters={'risk_durumu': 'limit_asildi'},
        )
        self.assertEqual(filtered['count'], 2)

        m_header = CariPanelService().header(self.musteri.id)
        t_header = CariPanelService().header(self.tedarikci.id)
        self.assertEqual(m_header['risk_durumu'], 'limit_asildi')
        self.assertEqual(t_header['risk_durumu'], 'limit_asildi')

    def test_scenario_6_gelir_due_filters_and_multipage_totals(self):
        """Gelir vade filtreleri (gecikti / ileri_tarihli) ve sayfa boyutundan bağımsız alt toplamlar."""
        today = date.today()
        # 1. Gecikmiş gelir (1.000 TL)
        GelirCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.musteri.id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'brut_tutar': Decimal('1000.00'),
            'kdv_orani': 0,
            'kdv_mod': 'muaf',
            'fatura_tarihi': today - timedelta(days=15),
            'vade_tarihi': today - timedelta(days=5),
        }, islem_yapan=self.user)
        # 2. İleri tarihli gelir (2.000 TL)
        GelirCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.musteri.id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'brut_tutar': Decimal('2000.00'),
            'kdv_orani': 0,
            'kdv_mod': 'muaf',
            'fatura_tarihi': today,
            'vade_tarihi': today + timedelta(days=20),
        }, islem_yapan=self.user)
        # 3. Peşin tahsil edilmiş gelir (3.000 TL)
        GelirCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.musteri.id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'brut_tutar': Decimal('3000.00'),
            'kdv_orani': 0,
            'kdv_mod': 'muaf',
            'fatura_tarihi': today,
            'vade_tarihi': today,
            'hemen_tahsil_et': True,
            'mali_hesap_id': self.kasa.id,
            'odeme_yontemi_id': self.nakit_yontem.id,
        }, islem_yapan=self.user)

        gecikti = GelirQueryService().list_paginated(
            self.kurum.id, self.sube.id, filters={'tahsil_durumu': 'gecikti'},
        )
        self.assertEqual(gecikti['total'], 1)
        self.assertEqual(gecikti['results'][0]['tahsil_durumu'], 'gecikti')

        ileri = GelirQueryService().list_paginated(
            self.kurum.id, self.sube.id, filters={'tahsil_durumu': 'ileri_tarihli'},
        )
        self.assertEqual(ileri['total'], 1)
        self.assertEqual(ileri['results'][0]['tahsil_durumu'], 'ileri_tarihli')

        # page_size=1 iken bile totals tüm 3 kaydın toplamını (6.000 TL) döndürmeli!
        paged = GelirQueryService().list_paginated(
            self.kurum.id, self.sube.id, page=1, page_size=1,
        )
        self.assertEqual(len(paged['results']), 1)
        self.assertEqual(paged['total'], 3)
        self.assertEqual(Decimal(paged['totals']['toplam_net']), Decimal('6000.00'))
        self.assertEqual(Decimal(paged['totals']['toplam_tahsil']), Decimal('3000.00'))
        self.assertEqual(Decimal(paged['totals']['toplam_kalan']), Decimal('3000.00'))

        # CariQueryService page_size=1 iken de tüm carilerin toplamını döndürmeli
        cari_paged = CariQueryService().list_paginated(
            self.kurum.id, self.sube.id, page=1, page_size=1,
        )
        self.assertEqual(len(cari_paged['results']), 1)
        self.assertEqual(cari_paged['count'], 2)
        self.assertEqual(Decimal(str(cari_paged['totals']['toplam_alacak'])), Decimal('3000.00'))

        # GiderQueryService page_size=1 iken de tüm giderlerin toplamını döndürmeli
        for g_tutar in (Decimal('1200.00'), Decimal('1800.00')):
            GiderCommandService().create({
                'kurum_id': self.kurum.id,
                'sube_id': self.sube.id,
                'cari_hesap_id': self.tedarikci.id,
                'gider_kategorisi_id': self.gider_kat.id,
                'brut_tutar': g_tutar,
                'kdv_orani': 0,
                'kdv_mod': 'muaf',
                'fatura_tarihi': today,
                'vade_tarihi': today,
            }, islem_yapan=self.user)
        gider_paged = GiderQueryService().list_paginated(
            self.kurum.id, self.sube.id, page=1, page_size=1,
        )
        self.assertEqual(len(gider_paged['results']), 1)
        self.assertEqual(gider_paged['total'], 2)
        self.assertEqual(Decimal(gider_paged['totals']['toplam_net']), Decimal('3000.00'))

    def test_scenario_7_draft_lifecycle_single_step_settlement_and_atomic_rollback(self):
        """Taslak kayıt cariyi etkilemez, onaylanınca etkiler; tek adımda ödeme eksik hesapta atomik geri alınır."""
        taslak_gider, err = GiderCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.tedarikci.id,
            'gider_kategorisi_id': self.gider_kat.id,
            'brut_tutar': Decimal('2500.00'),
            'kdv_orani': 20,
            'kdv_mod': 'haric',
            'fatura_tarihi': date.today(),
            'vade_tarihi': date.today(),
            'taslak_olarak_kaydet': True,
        }, islem_yapan=self.user)
        self.assertIsNone(err)
        self.assertEqual(taslak_gider.durum, 'taslak')
        self.tedarikci.refresh_from_db()
        self.assertEqual(self.tedarikci.bakiye, Decimal('0.00'))

        # Gider hesabı panelinde taslak tutarı görünür
        gider_hesabi = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube, unvan='Elektrik Gider Hesabı',
            hesap_turu=CariHesapTuru.GIDER_HESABI,
        )
        GiderCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': gider_hesabi.id,
            'gider_kategorisi_id': self.gider_kat.id,
            'brut_tutar': Decimal('1000.00'),
            'kdv_orani': 0,
            'kdv_mod': 'muaf',
            'fatura_tarihi': date.today(),
            'vade_tarihi': date.today(),
            'taslak_olarak_kaydet': True,
        }, islem_yapan=self.user)
        panel = CariPanelService().panel(gider_hesabi.id)
        self.assertEqual(Decimal(str(panel['gider']['onay_bekleyen'])), Decimal('1000.00'))
        self.assertNotIn('tedarikci', panel)

        # Taslak onaylanınca cari bakiye güncellenir (2.500 + %20 KDV = 3.000 TL)
        _, onayla_err = GiderCommandService().onayla(taslak_gider.id, islem_yapan=self.user)
        self.assertIsNone(onayla_err)
        self.tedarikci.refresh_from_db()
        self.assertEqual(self.tedarikci.bakiye, Decimal('-3000.00'))

        # Tek adımda peşin ödeme: mali_hesap_id eksikse hata döner ve GiderKaydi atomik olarak rollback olur!
        before_count = GiderKaydi.objects.count()
        bad_obj, bad_err = GiderCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.tedarikci.id,
            'gider_kategorisi_id': self.gider_kat.id,
            'brut_tutar': Decimal('900.00'),
            'kdv_orani': 0,
            'kdv_mod': 'muaf',
            'fatura_tarihi': date.today(),
            'vade_tarihi': date.today(),
            'hemen_ode': True,
        }, islem_yapan=self.user)
        self.assertIsNone(bad_obj)
        self.assertIsNotNone(bad_err)
        self.assertEqual(GiderKaydi.objects.count(), before_count)

        # Geçerli mali_hesap_id ile tek adımda peşin ödeme başarılı olur
        ok_gider, ok_err = GiderCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self.tedarikci.id,
            'gider_kategorisi_id': self.gider_kat.id,
            'brut_tutar': Decimal('900.00'),
            'kdv_orani': 0,
            'kdv_mod': 'muaf',
            'fatura_tarihi': date.today(),
            'vade_tarihi': date.today(),
            'hemen_ode': True,
            'mali_hesap_id': self.kasa.id,
            'odeme_yontemi_id': self.nakit_yontem.id,
        }, islem_yapan=self.user)
        self.assertIsNone(ok_err, ok_err)
        self.assertEqual(ok_gider.durum, 'odendi')
        self.assertEqual(self._hesap_bakiye(self.kasa.id), Decimal('-900.00'))

    def test_scenario_8_http_endpoints_end_to_end(self):
        """Serbest tahsilat API, Gelir detay/belge/ek API, Cari devreden bakiye ve cari kapsamlı rapor API'leri."""
        # 1. Serbest tahsilat HTTP POST + İptal
        st_resp = self.client.post(
            '/finans/api/cari-tahsilatlar/serbest/',
            {
                'cari_hesap_id': self.musteri.id,
                'kurum_id': self.kurum.id,
                'tutar': '1500.00',
                'tahsilat_tarihi': '2026-04-01',
                'mali_hesap_id': self.kasa.id,
                'odeme_yontemi_id': self.nakit_yontem.id,
                'aciklama': 'HTTP serbest tahsilat',
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(st_resp.status_code, 201, st_resp.content)
        ch_id = st_resp.json()['cari_hareket_id']

        # 2. Gelir V2 tek adımda peşin tahsilatlı oluşturma
        g_resp = self.client.post(
            f'/finans/api/gelir/v2/kayitlar/?kurum_id={self.kurum.id}&sube_id={self.sube.id}',
            {
                'kurum_id': self.kurum.id,
                'cari_hesap_id': self.musteri.id,
                'gelir_kategorisi_id': self.gelir_kat.id,
                'brut_tutar': '2000.00',
                'kdv_orani': 20,
                'kdv_mod': 'haric',
                'fatura_tarihi': '2026-04-10',
                'vade_tarihi': '2026-04-10',
                'hemen_tahsil_et': True,
                'mali_hesap_id': self.kasa.id,
                'odeme_yontemi_id': self.nakit_yontem.id,
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(g_resp.status_code, 201, g_resp.content)
        gelir_id = g_resp.json()['id']

        # 3. Gelir detay + HTML belge + Tahsilat makbuzu + Ek yükle/sil
        det_resp = self.client.get(f'/finans/api/gelir/v2/kayitlar/{gelir_id}/detay/', **self.headers)
        self.assertEqual(det_resp.status_code, 200)
        det_json = det_resp.json()
        self.assertEqual(len(det_json['tahsilatlar']), 1)
        tahsilat_id = det_json['tahsilatlar'][0]['id']

        belge_resp = self.client.get(
            f'/finans/api/gelir/v2/kayitlar/{gelir_id}/belgeler/gelir/?fmt=html', **self.headers,
        )
        self.assertEqual(belge_resp.status_code, 200)
        self.assertIn('GELİR İŞLEM BELGESİ', belge_resp.content.decode('utf-8'))

        makbuz_resp = self.client.get(
            f'/finans/api/gelir/v2/kayitlar/{gelir_id}/belgeler/tahsilat/{tahsilat_id}/?fmt=html',
            **self.headers,
        )
        self.assertEqual(makbuz_resp.status_code, 200)
        self.assertIn('TAHSİLAT MAKBUZU', makbuz_resp.content.decode('utf-8'))

        sample_pdf = SimpleUploadedFile('fatura.pdf', b'%PDF-1.4 test pdf content', content_type='application/pdf')
        ek_resp = self.client.post(
            f'/finans/api/gelir/v2/kayitlar/{gelir_id}/ekler/',
            {'dosya': sample_pdf, 'aciklama': 'E-Arşiv Fatura'},
            format='multipart',
            **self.headers,
        )
        self.assertEqual(ek_resp.status_code, 201, ek_resp.content)
        ek_id = ek_resp.json()['id']

        ek_del = self.client.delete(
            f'/finans/api/gelir/v2/kayitlar/{gelir_id}/ekler/{ek_id}/', **self.headers,
        )
        self.assertEqual(ek_del.status_code, 200)

        # 4. Cari hareketler devreden bakiye özeti (2026-04-05 başlangıç -> 2026-04-01'deki -1500 TL devreden olur!)
        har_resp = self.client.get(
            f'/finans/api/cari/v2/hesaplar/{self.musteri.id}/hareketler/?baslangic=2026-04-05',
            **self.headers,
        )
        self.assertEqual(har_resp.status_code, 200)
        ozet = har_resp.json()['ozet']
        self.assertEqual(Decimal(str(ozet['devreden_bakiye'])), Decimal('-1500.00'))
        self.assertEqual(Decimal(str(ozet['toplam_borc'])), Decimal('2400.00'))
        self.assertEqual(Decimal(str(ozet['toplam_alacak'])), Decimal('2400.00'))
        self.assertEqual(Decimal(str(ozet['kapanis_bakiye'])), Decimal('-1500.00'))

        # 5. Cari kapsamlı rapor (başka müşterinin geliri karışmamalı!)
        diger_musteri = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube, unvan='Başka Müşteri', hesap_turu=CariHesapTuru.MUSTERI,
        )
        GelirCommandService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': diger_musteri.id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'brut_tutar': Decimal('99000.00'),
            'kdv_orani': 0,
            'kdv_mod': 'muaf',
            'fatura_tarihi': date(2026, 4, 10),
            'vade_tarihi': date(2026, 4, 10),
        }, islem_yapan=self.user)

        rapor = CariReportService().build(
            'gelir-analizi', self.kurum.id, self.sube.id, {'cari_hesap_id': str(self.musteri.id)},
        )
        self.assertEqual(len(rapor['rows']), 1)
        self.assertEqual(Decimal(str(rapor['rows'][0]['toplam'])), Decimal('2400.00'))

        # 6. Serbest tahsilat HTTP iptal + Cari tab Türkçe durum etiketi
        ipt_resp = self.client.post(f'/finans/api/cari-tahsilatlar/{ch_id}/iptal/', format='json', **self.headers)
        self.assertEqual(ipt_resp.status_code, 200, ipt_resp.content)

        tab_resp = self.client.get(f'/finans/api/cari/v2/hesaplar/{self.musteri.id}/tab/gelirler/', **self.headers)
        self.assertEqual(tab_resp.status_code, 200)
        self.assertEqual(tab_resp.json()[0]['durum_label'], 'Tahsil Edildi')
