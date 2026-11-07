"""Kurum/şube kaçışlarını gerçek API ve servis yollarında sınar."""
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.finans.tests import test_cari_hesaplama as fixtures
from apps.finans.tests import test_cek_senet_v2 as cheque_fixtures
from apps.finans.tests.test_sube_isolation import _assign_finans_read_manage
from apps.finans.application.gelir_service import GelirService
from apps.finans.application.gelir_tahsilat_service import GelirTahsilatService
from apps.finans.application.gider_service import GiderService
from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.payment_method import OdemeYontemi
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.application.cari_odeme_service import CariOdemeService
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.odeme_takip.domain.cek_senet import CekSenetDetay


@override_settings(CEK_SENET_V2_ENABLED=True)
class FinansTenantSecurityTest(fixtures.CariHesaplamaTestBase):
    def setUp(self):
        super().setUp()
        _assign_finans_read_manage(self.user)
        role = self.user.user_role
        role.kurum = self.kurum
        role.save(update_fields=['kurum'])
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_KURUM_ID=str(self.kurum.id), HTTP_X_SUBE_ID=str(self.sube.id))
        self.other_kurum = Kurum.objects.create(ad='Diğer', kod='SEC2')
        self.other_sube = Sube.objects.create(kurum=self.other_kurum, ad='Diğer', kod='SEC2')
        self.sibling = Sube.objects.create(kurum=self.kurum, ad='Kardeş', kod='SEC3')
        self.foreign_account = MaliHesap.objects.create(sube=self.other_sube, ad='Diğer kasa')
        self.foreign_method = OdemeYontemi.objects.create(
            kurum=self.other_kurum, mali_hesap=self.foreign_account, ad='Nakit', tip='nakit')
        self.cheque_method = OdemeYontemi.objects.create(kurum=self.kurum, ad='Çek', tip='cek')
        self.cheque = CekSenetDetay.objects.create(
            kurum=self.kurum, sube=self.sube, odeme_yontemi=self.cheque_method,
            yon='alinan', arac_tipi='cek', tutar=1000, durum='portfoyde', vade_tarihi=self.today)

    def invoice(self, gider=False):
        data = dict(kurum_id=self.kurum.id, sube_id=self.sube.id,
                    cari_hesap_id=(self._create_tedarikci() if gider else self._create_musteri()).id,
                    brut_tutar=Decimal('1000'), kdv_orani=0, fatura_tarihi=self.today,
                    vade_tarihi=self.today, egitim_yili_id=self.ey.id)
        data['gider_kategorisi_id' if gider else 'gelir_kategorisi_id'] = (
            self.gider_kat.id if gider else self.gelir_kat.id)
        obj, err = (GiderService() if gider else GelirService()).create(data)
        self.assertIsNone(err, err)
        return obj

    def test_all_record_routes_reject_other_branch_before_side_effects(self):
        self.client.credentials(HTTP_X_KURUM_ID=str(self.kurum.id), HTTP_X_SUBE_ID=str(self.sibling.id))
        root = f'/finans/api/cek-senet/{self.cheque.pk}/'
        routes = [('get', ''), ('patch', ''), ('get', 'timeline/'), ('get', 'dosyalar/'),
                  ('post', 'dosyalar/'), ('delete', 'dosyalar/123/'), ('post', 'ciro/'),
                  ('post', 'protesto/'), ('post', 'iade/'), ('post', 'iptal/'),
                  ('post', 'transition/'), ('post', 'tahsil/'), ('post', 'ode/')]
        before = self.cheque.loglar.count()
        for method, path in routes:
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(root + path)
                self.assertIn(response.status_code, (403, 404), response.data)
        self.cheque.refresh_from_db()
        self.assertEqual(self.cheque.durum, 'portfoyde')
        self.assertEqual(self.cheque.loglar.count(), before)
        self.assertEqual(BakiyeHareketi.objects.count(), 0)


    def test_foreign_institution_record_denied_even_with_forged_context(self):
        CekSenetDetay.objects.filter(pk=self.cheque.pk).update(
            kurum=self.other_kurum, sube=self.other_sube)
        response = self.client.get(f'/finans/api/cek-senet/{self.cheque.pk}/',
            {'kurum_id': self.other_kurum.id, 'sube_id': self.other_sube.id})
        self.assertIn(response.status_code, (403, 404))

    def test_own_record_read_and_edit_still_work(self):
        url = f'/finans/api/cek-senet/{self.cheque.pk}/'
        self.assertEqual(self.client.get(url).status_code, 200)
        response = self.client.patch(url, {'aciklama': 'Geçerli değişiklik'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.cheque.refresh_from_db()
        self.assertEqual(self.cheque.aciklama, 'Geçerli değişiklik')

    def test_cheque_create_does_not_trust_body_branch(self):
        response = self.client.post('/finans/api/cek-senet/', dict(
            kurum_id=self.other_kurum.id, sube_id=self.other_sube.id,
            odeme_yontemi_id=self.foreign_method.id, yon='alinan', tutar=1000,
            vade_tarihi=self.today.isoformat()), format='json')
        self.assertIn(response.status_code, (400, 403))
        self.assertEqual(CekSenetDetay.objects.count(), 1)

    def test_cheque_related_cari_must_match_scope(self):
        foreign = CariHesap.objects.create(kurum=self.other_kurum, sube=self.other_sube, unvan='Diğer')
        service = CekSenetService()
        for operation in (
            lambda: service.guncelle(self.cheque.pk, {'cari_hesap_id': foreign.pk}),
            lambda: service.ciro_et(self.cheque.pk, ciro_edilen_cari_id=foreign.pk),
            lambda: service.create_alinan(dict(kurum_id=self.kurum.id, sube_id=self.sube.id,
                odeme_yontemi_id=self.cheque_method.pk, cari_hesap_id=foreign.pk,
                tutar=100, vade_tarihi=self.today)),
        ):
            result, err = operation()
            self.assertIsNone(result)
            self.assertIsNotNone(err)
        self.cheque.refresh_from_db()
        self.assertIsNone(self.cheque.cari_hesap_id)
        self.assertEqual(CekSenetDetay.objects.count(), 1)

    def test_cheque_payment_rejects_foreign_account(self):
        self.cheque.yon = 'verilen'
        self.cheque.durum = 'verildi'
        self.cheque.save()
        _, err = CekSenetService().ode(self.cheque.pk, odeme_mali_hesap_id=self.foreign_account.pk)
        self.assertIsNotNone(err)
        self.assertEqual(BakiyeHareketi.objects.count(), 0)

    def test_serbest_payment_cancel_rejects_other_branch(self):
        cari = self._create_tedarikci()
        result, err = CariOdemeService().serbest_odeme_yap(dict(
            kurum_id=self.kurum.pk, sube_id=self.sube.pk, cari_hesap_id=cari.pk,
            mali_hesap_id=self.mali_hesap.pk, odeme_yontemi_id=self.odeme_yontemi.pk,
            tutar=100, odeme_tarihi=self.today, egitim_yili_id=self.ey.pk))
        self.assertIsNone(err, err)
        self.client.credentials(HTTP_X_KURUM_ID=str(self.kurum.pk), HTTP_X_SUBE_ID=str(self.sibling.pk))
        response = self.client.post(f"/finans/api/cari-odemeler/{result['cari_hareket_id']}/iptal/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(BakiyeHareketi.objects.count(), 1)
        self.client.credentials(HTTP_X_KURUM_ID=str(self.kurum.pk), HTTP_X_SUBE_ID=str(self.sube.pk))
        response = self.client.post(f"/finans/api/cari-odemeler/{result['cari_hareket_id']}/iptal/")
        self.assertEqual(response.status_code, 200, response.data)

    def test_serbest_payment_rejects_foreign_method_before_writes(self):
        cari = self._create_tedarikci()
        _, err = CariOdemeService().serbest_odeme_yap(dict(
            kurum_id=self.kurum.pk, sube_id=self.sube.pk, cari_hesap_id=cari.pk,
            mali_hesap_id=self.mali_hesap.pk, odeme_yontemi_id=self.foreign_method.pk,
            tutar=100, odeme_tarihi=self.today, egitim_yili_id=self.ey.pk))
        self.assertIsNotNone(err)
        self.assertEqual(BakiyeHareketi.objects.count(), 0)

    def test_create_cheque_rejects_foreign_method(self):
        foreign = OdemeYontemi.objects.create(kurum=self.other_kurum, ad='Diğer Çek', tip='cek')
        for method in (CekSenetService().create_alinan, CekSenetService().create_verilen):
            _, err = method(dict(kurum_id=self.kurum.pk, sube_id=self.sube.pk,
                odeme_yontemi_id=foreign.pk, tutar=100, vade_tarihi=self.today))
            self.assertIsNotNone(err)
        self.assertEqual(CekSenetDetay.objects.count(), 1)

    def test_income_and_expense_api_reject_foreign_or_mismatched_accounts(self):
        sibling_account = MaliHesap.objects.create(sube=self.sibling, ad='Kardeş kasa')
        other_local = MaliHesap.objects.create(sube=self.sube, ad='İkinci kasa')
        for gider in (False, True):
            obj = self.invoice(gider=gider)
            before = BakiyeHareketi.objects.count()
            url = (f'/finans/api/giderler/{obj.pk}/odemeler/' if gider
                   else f'/finans/api/gelirler/{obj.pk}/tahsilatlar/')
            key = 'gider_kaydi_id' if gider else 'gelir_kaydi_id'
            date_key = 'odeme_tarihi' if gider else 'tahsilat_tarihi'
            for account, method in ((self.foreign_account, self.foreign_method),
                                    (sibling_account, self.odeme_yontemi),
                                    (other_local, self.odeme_yontemi)):
                with self.subTest(gider=gider, account=account.pk):
                    response = self.client.post(url, {key: obj.pk, date_key: self.today.isoformat(),
                        'mali_hesap_id': account.pk, 'odeme_yontemi_id': method.pk,
                        'tutar': '100'}, format='json')
                    self.assertEqual(response.status_code, 400, response.data)
            self.assertEqual(BakiyeHareketi.objects.count(), before)
            response = self.client.post(url, {key: obj.pk, date_key: self.today.isoformat(),
                'mali_hesap_id': self.mali_hesap.pk, 'odeme_yontemi_id': self.odeme_yontemi.pk,
                'tutar': '100'}, format='json')
            self.assertEqual(response.status_code, 201, response.data)

    def test_service_rejects_passive_and_deleted_payment_accounts(self):
        gelir = self.invoice()
        for flag in ('aktif_mi', 'silindi_mi'):
            MaliHesap.objects.filter(pk=self.mali_hesap.pk).update(**{flag: flag == 'silindi_mi'})
            _, err = GelirTahsilatService().tahsilat_yap(dict(
                gelir_kaydi_id=gelir.pk, mali_hesap_id=self.mali_hesap.pk,
                odeme_yontemi_id=self.odeme_yontemi.pk, tutar=Decimal('100'), tahsilat_tarihi=self.today))
            self.assertIsNotNone(err)
            MaliHesap.objects.tumu().filter(pk=self.mali_hesap.pk).update(aktif_mi=True, silindi_mi=False)
        self.assertEqual(BakiyeHareketi.objects.count(), 0)

@override_settings(CEK_SENET_V2_ENABLED=True)
class ContractPaymentScopeTest(TestCase):
    setUp = cheque_fixtures.CekSenetV2Test.setUp

    def foreign_account(self):
        kurum = Kurum.objects.create(ad='Diğer kurum', kod='CONTRACT-OTHER')
        sube = Sube.objects.create(kurum=kurum, ad='Diğer şube', kod='CONTRACT-OTHER')
        hesap = MaliHesap.objects.create(sube=sube, ad='Diğer kasa')
        method = OdemeYontemi.objects.create(kurum=kurum, mali_hesap=hesap, ad='Nakit', tip='nakit')
        return hesap, method

    def test_contract_collection_rejects_foreign_payment_method(self):
        from apps.odeme_takip.application.services.tahsilat_service import TahsilatService
        _, method = self.foreign_account()
        _, err = TahsilatService().create(dict(sozlesme_id=self.sozlesme.pk,
            mali_hesap_id=self.mali_hesap.pk, odeme_yontemi_id=method.pk,
            tutar=100, tahsilat_tarihi=timezone.localdate()))
        self.assertIsNotNone(err)
        self.assertEqual(BakiyeHareketi.objects.count(), 0)

    def test_contract_refund_rejects_foreign_cash_account(self):
        from apps.odeme_takip.application.services.tahsilat_service import TahsilatService
        svc = TahsilatService()
        th, err = svc.create(dict(sozlesme_id=self.sozlesme.pk, mali_hesap_id=self.mali_hesap.pk,
            odeme_yontemi_id=self.nakit.pk, tutar=100, tahsilat_tarihi=timezone.localdate()))
        self.assertIsNone(err, err)
        hesap, method = self.foreign_account()
        _, err = svc.iade_yap(dict(sozlesme_id=self.sozlesme.pk, kaynak_tahsilat_id=th.pk,
            mali_hesap_id=hesap.pk, odeme_yontemi_id=method.pk,
            tutar=50, tahsilat_tarihi=timezone.localdate()))
        self.assertIsNotNone(err)
        self.assertEqual(self.sozlesme.tahsilatlar.count(), 1)
        self.assertEqual(BakiyeHareketi.objects.count(), 1)

    def test_cheque_collection_rejects_foreign_cash_account(self):
        svc = CekSenetService()
        svc.sync_sozlesme_plan(self.sozlesme)
        cek = CekSenetDetay.objects.get(taksit=self.taksit)
        svc.transition(cek.pk, 'portfoyde')
        hesap, _ = self.foreign_account()
        _, err = svc.tahsil_et(cek.pk, tahsilat_mali_hesap_id=hesap.pk)
        self.assertIsNotNone(err)
        self.assertEqual(BakiyeHareketi.objects.count(), 0)


