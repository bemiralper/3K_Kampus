"""
Çek/Senet V2 portföy akışı testleri.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.egitim_yili.domain.models import EgitimYili
from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.application.services.taksit_service import TaksitService
from apps.odeme_takip.domain.cek_senet import CekSenetDetay, CekSenetDurum, CekSenetYon
from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum
from apps.odeme_takip.domain.models import Sozlesme, Taksit
from apps.ogrenci.domain.models import Ogrenci
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_perms(user, *codes):
    role, _ = Role.objects.get_or_create(
        code='cek_senet_v2_test',
        defaults={'name': 'Cek Senet V2 Test', 'level': 100, 'is_system_role': True},
    )
    for code in codes:
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': code.split('.')[0], 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


@override_settings(CEK_SENET_V2_ENABLED=True)
class CekSenetV2Test(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='CS V2 Kurum', kod='CSV2')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='CSV2')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='cekv2', password='test')
        _assign_perms(self.user, 'finans.read', 'finans.manage')
        self.client.force_authenticate(user=self.user)

        self.mali_hesap = MaliHesap.objects.create(sube=self.sube, ad='Banka')
        self.nakit = OdemeYontemi.objects.create(
            mali_hesap=self.mali_hesap, kurum=self.kurum, ad='Nakit', tip=OdemeYontemiTipi.NAKIT,
        )
        self.cek_yontemi = OdemeYontemi.objects.create(
            kurum=self.kurum, ad='Çek Portföy', tip=OdemeYontemiTipi.CEK,
            mali_hesap=None,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Test', aktif_mi=True,
        )
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-CSV2-001',
            ogrenci=self.ogrenci,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=timezone.localdate(),
            bitis_tarihi=timezone.localdate() + timedelta(days=365),
            brut_tutar=3000,
            net_tutar=3000,
            durum=SozlesmeDurum.AKTIF,
        )
        self.taksit = Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=1,
            vade_tarihi=timezone.localdate() + timedelta(days=30),
            tutar=3000,
            kalan_tutar=3000,
            durum=TaksitDurum.BEKLEMEDE,
            odeme_yontemi=self.cek_yontemi,
        )

    def test_sync_plan_creates_bekliyor_kayit(self):
        service = CekSenetService()
        service.sync_sozlesme_plan(self.sozlesme)
        detay = CekSenetDetay.objects.get(taksit=self.taksit)
        self.assertEqual(detay.durum, CekSenetDurum.BEKLIYOR)
        self.assertEqual(detay.yon, CekSenetYon.ALINAN)
        self.assertEqual(detay.tutar, 3000)
        self.taksit.refresh_from_db()
        self.assertEqual(self.taksit.durum, TaksitDurum.BEKLEMEDE)

    def test_tahsil_et_closes_taksit_and_creates_movement(self):
        service = CekSenetService()
        service.sync_sozlesme_plan(self.sozlesme)
        detay = CekSenetDetay.objects.get(taksit=self.taksit)
        service.transition(detay.id, CekSenetDurum.PORTFOYDE, {'cek_senet_no': 'CHK-V2-001'})
        service.transition(detay.id, CekSenetDurum.TAHSILDE, {})

        result, errors = service.tahsil_et(
            detay.id,
            tahsilat_mali_hesap_id=self.mali_hesap.id,
            tahsilat_tarihi=timezone.localdate(),
            user=self.user,
        )
        self.assertIsNone(errors, errors)
        self.assertEqual(result['durum'], CekSenetDurum.TAHSIL_EDILDI)

        self.taksit.refresh_from_db()
        self.assertEqual(self.taksit.durum, TaksitDurum.ODENDI)

        from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
        self.assertTrue(
            BakiyeHareketi.objects.filter(
                kaynak_tip='tahsilat',
                kaynak_id=result['tahsilat_id'],
            ).exists()
        )

    def test_api_list_and_detail(self):
        CekSenetService().sync_sozlesme_plan(self.sozlesme)
        response = self.client.get(
            '/finans/api/cek-senet/',
            {'kurum_id': self.kurum.id, 'sube_id': self.sube.id, 'yon': 'alinan'},
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data['count'], 1)

        detay_id = response.data['results'][0]['id']
        detail = self.client.get(f'/finans/api/cek-senet/{detay_id}/')
        self.assertEqual(detail.status_code, 200)
        self.assertIn('allowed_transitions', detail.data)

    def test_verilen_create_and_ode(self):
        service = CekSenetService()
        created, err = service.create_verilen({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'odeme_yontemi_id': self.cek_yontemi.id,
            'tutar': 5000,
            'vade_tarihi': (timezone.localdate() + timedelta(days=14)).isoformat(),
            'cek_senet_no': 'VCK-001',
        })
        self.assertIsNone(err)
        detay_id = created['id']

        for durum in (CekSenetDurum.HAZIRLANDI, CekSenetDurum.VERILDI):
            _, err = service.transition(detay_id, durum, {'cek_senet_no': 'VCK-001'})
            self.assertIsNone(err, err)

        result, err = service.ode(
            detay_id,
            odeme_mali_hesap_id=self.mali_hesap.id,
            user=self.user,
        )
        self.assertIsNone(err, err)
        self.assertEqual(result['durum'], CekSenetDurum.ODENDI)

    def test_taksit_plan_with_odeme_yontemi_via_service(self):
        Taksit.objects.filter(sozlesme=self.sozlesme).delete()
        ts = TaksitService()
        ts.create_manual_plan(self.sozlesme, [{
            'tutar': 3000,
            'vade_tarihi': (timezone.localdate() + timedelta(days=10)).isoformat(),
            'odeme_yontemi_id': self.cek_yontemi.id,
        }])
        ts._sync_cek_senet_plan(self.sozlesme)
        self.assertGreaterEqual(
            CekSenetDetay.objects.filter(
                taksit__sozlesme=self.sozlesme,
                durum=CekSenetDurum.BEKLIYOR,
            ).count(),
            1,
        )

    def test_contract_level_cek_yontemi_syncs_portfolio(self):
        from apps.odeme_takip.domain.enums import OdemeTuru

        Taksit.objects.filter(sozlesme=self.sozlesme).delete()
        self.sozlesme.odeme_turu = OdemeTuru.TAKSITLI
        self.sozlesme.odeme_yontemi = self.cek_yontemi
        self.sozlesme.save(update_fields=['odeme_turu', 'odeme_yontemi'])

        ts = TaksitService()
        ts.recreate_plan(
            self.sozlesme,
            taksit_sayisi=2,
            ilk_odeme_tarihi=timezone.localdate(),
            periyot='aylik',
        )
        ts._apply_contract_odeme_yontemi_to_taksits(self.sozlesme)
        ts._sync_cek_senet_plan(self.sozlesme)

        self.assertEqual(
            CekSenetDetay.objects.filter(
                taksit__sozlesme=self.sozlesme,
                durum=CekSenetDurum.BEKLIYOR,
            ).count(),
            2,
        )

    def test_cek_senet_sozlesme_auto_assigns_single_yontem(self):
        """Çek/senet sözleşmesinde yöntemsiz taksitlere tek kurum çek yöntemi atanır."""
        from apps.odeme_takip.domain.enums import OdemeTuru

        Taksit.objects.filter(sozlesme=self.sozlesme).delete()
        CekSenetDetay.objects.filter(taksit__sozlesme=self.sozlesme).delete()
        self.sozlesme.odeme_turu = OdemeTuru.CEK_SENET
        self.sozlesme.odeme_yontemi = None
        self.sozlesme.save(update_fields=['odeme_turu', 'odeme_yontemi'])

        t = Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=1,
            vade_tarihi=timezone.localdate(),
            tutar=1500,
            kalan_tutar=1500,
            durum=TaksitDurum.BEKLEMEDE,
        )
        CekSenetService().sync_sozlesme_plan(self.sozlesme)
        t.refresh_from_db()
        self.assertEqual(t.odeme_yontemi_id, self.cek_yontemi.id)
        self.assertEqual(CekSenetDetay.objects.filter(taksit__sozlesme=self.sozlesme).count(), 1)

    # ─── V2 yeni akışlar ──────────────────────────────────────────

    def _create_alinan(self):
        service = CekSenetService()
        created, err = service.create_alinan({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'odeme_yontemi_id': self.cek_yontemi.id,
            'tutar': 4000,
            'vade_tarihi': (timezone.localdate() + timedelta(days=20)).isoformat(),
            'cek_senet_no': 'ALN-001',
        }, user=self.user)
        self.assertIsNone(err, err)
        return created['id']

    def test_create_alinan_portfoyde_and_logs(self):
        detay_id = self._create_alinan()
        detay = CekSenetDetay.objects.get(id=detay_id)
        self.assertEqual(detay.durum, CekSenetDurum.PORTFOYDE)
        self.assertEqual(detay.yon, CekSenetYon.ALINAN)
        self.assertGreaterEqual(detay.loglar.count(), 1)

    def test_ciro_et(self):
        from apps.finans.domain.cari_hesap import CariHesap
        cari = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube, unvan='Tedarikçi A', hesap_turu='tedarikci',
        )
        detay_id = self._create_alinan()
        result, err = CekSenetService().ciro_et(
            detay_id, ciro_edilen_cari_id=cari.id, user=self.user,
        )
        self.assertIsNone(err, err)
        self.assertEqual(result['durum'], CekSenetDurum.CIRO)
        self.assertEqual(result['ciro_edilen_cari_id'], cari.id)

    def test_protesto_ve_iade(self):
        service = CekSenetService()
        detay_id = self._create_alinan()
        service.transition(detay_id, CekSenetDurum.TAHSILDE, {})
        result, err = service.protesto_et(detay_id, user=self.user)
        self.assertIsNone(err, err)
        self.assertEqual(result['durum'], CekSenetDurum.PROTESTO)

        result, err = service.iade_et(detay_id, user=self.user)
        self.assertIsNone(err, err)
        self.assertEqual(result['durum'], CekSenetDurum.IADE)

    def test_dashboard_endpoint(self):
        self._create_alinan()
        response = self.client.get(
            '/finans/api/cek-senet/dashboard/',
            {'kurum_id': self.kurum.id, 'sube_id': self.sube.id},
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('kpi', response.data)
        self.assertIn('toplam_portfoy', response.data['kpi'])
        self.assertGreaterEqual(response.data['kpi']['toplam_portfoy']['adet'], 1)

    def test_timeline_endpoint(self):
        detay_id = self._create_alinan()
        response = self.client.get(f'/finans/api/cek-senet/{detay_id}/timeline/')
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data['results']), 1)

    def test_dosya_ekle_ve_sil(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        service = CekSenetService()
        detay_id = self._create_alinan()
        f = SimpleUploadedFile('cek.pdf', b'%PDF-1.4 test', content_type='application/pdf')
        result, err = service.dosya_ekle(detay_id, dosya=f, dosya_adi='cek.pdf', user=self.user)
        self.assertIsNone(err, err)
        self.assertEqual(len(service.dosyalar(detay_id)), 1)
        ok, err = service.dosya_sil(detay_id, result['id'], user=self.user)
        self.assertTrue(ok)
        self.assertEqual(len(service.dosyalar(detay_id)), 0)

    def test_sekme_filtreleri(self):
        self._create_alinan()
        service = CekSenetService()
        portfoy = service.list_kayitlar(self.kurum.id, sube_id=self.sube.id, sekme='portfoy')
        self.assertGreaterEqual(portfoy['count'], 1)
        gelen_cekler = service.list_kayitlar(self.kurum.id, sube_id=self.sube.id, sekme='gelen-cekler')
        self.assertGreaterEqual(gelen_cekler['count'], 1)
        iptaller = service.list_kayitlar(self.kurum.id, sube_id=self.sube.id, sekme='iptaller')
        self.assertEqual(iptaller['count'], 0)

    def test_gider_cek_odeme_creates_gider_odeme(self):
        """Verilen çek ödendiğinde GiderOdeme oluşmalı — gün sonu/gider listesi için."""
        from apps.finans.application.gun_sonu_service import GunSonuService
        from apps.finans.constants.gider_types import GiderDurum, GiderTaksitDurum, OdemeDurum
        from apps.finans.domain.cari_hesap import CariHesap
        from apps.finans.domain.gider_kategorisi import GiderKategorisi
        from apps.finans.domain.gider_kaydi import GiderKaydi
        from apps.finans.domain.gider_odeme import GiderOdeme
        from apps.finans.domain.gider_taksit import GiderTaksit

        bugun = timezone.localdate()
        cari = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube, unvan='Çek Gider Cari', hesap_turu='tedarikci',
        )
        kat = GiderKategorisi.objects.create(kurum=self.kurum, sube=self.sube, ad='Çek Kat')
        gider = GiderKaydi.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            cari_hesap=cari,
            gider_kategorisi=kat,
            fatura_tarihi=bugun,
            vade_tarihi=bugun,
            brut_tutar=2000,
            kdv_orani=0,
            kdv_tutar=0,
            net_tutar=2000,
            durum=GiderDurum.ONAYLANDI,
        )
        taksit = GiderTaksit.objects.create(
            gider_kaydi=gider,
            taksit_no=1,
            vade_tarihi=bugun,
            tutar=2000,
            odeme_yontemi=self.cek_yontemi,
            durum=GiderTaksitDurum.BEKLEMEDE,
        )
        service = CekSenetService()
        service.sync_gider_plan(gider)
        detay = taksit.cek_senet_detay
        self.assertIsNotNone(detay)

        _, err = service.transition(detay.pk, CekSenetDurum.HAZIRLANDI, {}, user=self.user)
        self.assertIsNone(err, err)
        _, err = service.transition(detay.pk, CekSenetDurum.VERILDI, {}, user=self.user)
        self.assertIsNone(err, err)
        result, err = service.ode(
            detay.pk,
            odeme_mali_hesap_id=self.mali_hesap.id,
            odeme_tarihi=bugun,
            user=self.user,
        )
        self.assertIsNone(err, err)
        self.assertEqual(result['durum'], CekSenetDurum.ODENDI)

        odemeler = GiderOdeme.objects.filter(gider_kaydi=gider, durum=OdemeDurum.TAMAMLANDI)
        self.assertEqual(odemeler.count(), 1)
        self.assertEqual(int(odemeler.first().tutar), 2000)

        gider.refresh_from_db()
        self.assertEqual(gider.durum, GiderDurum.ODENDI)

        gun_sonu = GunSonuService().ozet(self.kurum.id, bugun, sube_id=self.sube.id)
        self.assertGreaterEqual(gun_sonu['odemeler']['toplam'], 2000)
