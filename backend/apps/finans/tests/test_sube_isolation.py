"""
Şube zorunluluğu — finans list endpoint'leri.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.kurum.domain.models import Kurum
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_finans_read(user):
    role, _ = Role.objects.get_or_create(
        code='finans_sube_test',
        defaults={'name': 'Finans Sube Test', 'level': 100, 'is_system_role': True},
    )
    perm, _ = Permission.objects.get_or_create(
        code='finans.read',
        defaults={'name': 'finans.read', 'module': 'finans', 'permission_type': 'read'},
    )
    RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


def _assign_finans_read_manage(user):
    role, _ = Role.objects.get_or_create(
        code='finans_sube_full_test',
        defaults={'name': 'Finans Sube Full Test', 'level': 100, 'is_system_role': True},
    )
    for code, ptype in (('finans.read', 'read'), ('finans.manage', 'manage')):
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'finans', 'permission_type': ptype},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class FinansSubeIsolationAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Sube Iso Kurum', kod='SISO')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SISO-M')
        self.user = User.objects.create_user(username='subeiso', password='test')
        _assign_finans_read(self.user)
        self.client.force_authenticate(user=self.user)

    def test_gelir_list_requires_sube_context(self):
        """sube_id/header/session yokken 400."""
        res = self.client.get('/finans/api/gelirler/', {'kurum_id': self.kurum.id})
        self.assertEqual(res.status_code, 400)
        self.assertIn('sube_id', res.json().get('error', '').lower())

    def test_gelir_list_success_with_sube_query_param(self):
        res = self.client.get(
            '/finans/api/gelirler/',
            {'kurum_id': self.kurum.id, 'sube_id': self.sube.id},
        )
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.json(), list)

    def test_mali_hesap_list_requires_sube_context(self):
        res = self.client.get('/finans/api/mali-hesaplar/', {'kurum_id': self.kurum.id})
        self.assertEqual(res.status_code, 400)
        self.assertIn('sube_id', res.json().get('error', '').lower())

    def test_mali_hesap_list_success_with_sube_header(self):
        res = self.client.get(
            '/finans/api/mali-hesaplar/',
            {'kurum_id': self.kurum.id},
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertIn('mali_hesaplar', body)

    def test_gider_detail_forbidden_without_sube_context(self):
        from django.utils import timezone
        from apps.finans.domain.gider_kaydi import GiderKaydi
        from apps.finans.domain.cari_hesap import CariHesap
        from apps.finans.domain.gider_kategorisi import GiderKategorisi

        cari = CariHesap.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            unvan='Test Cari',
            hesap_turu='tedarikci',
        )
        kategori = GiderKategorisi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Test Kat',
        )
        gider = GiderKaydi.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            cari_hesap=cari,
            gider_kategorisi=kategori,
            fatura_tarihi=timezone.localdate(),
            vade_tarihi=timezone.localdate(),
            brut_tutar=100,
            kdv_orani=0,
            kdv_tutar=0,
            net_tutar=100,
        )
        res = self.client.get(f'/finans/api/giderler/{gider.id}/')
        self.assertEqual(res.status_code, 400)

        res2 = self.client.get(
            f'/finans/api/giderler/{gider.id}/',
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(res2.status_code, 200)

    def test_legacy_gelir_gider_rapor_requires_sube(self):
        res = self.client.get(
            '/finans/api/raporlar/gelir-gider/',
            {'kurum_id': self.kurum.id},
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('sube_id', res.json().get('error', '').lower())

    def test_legacy_gelir_gider_rapor_export_csv_with_format_param(self):
        """DRF ?format=csv içerik müzakeresine takılmamalı — dosya indirilebilir olmalı."""
        res = self.client.get(
            '/finans/api/raporlar/gelir-gider/',
            {'kurum_id': self.kurum.id, 'format': 'csv'},
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertIn('text/csv', res['Content-Type'])
        self.assertIn('attachment', res['Content-Disposition'])

    def test_legacy_gelir_gider_rapor_export_pdf_with_fmt_param(self):
        res = self.client.get(
            '/finans/api/raporlar/gelir-gider/',
            {'kurum_id': self.kurum.id, 'fmt': 'pdf'},
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertIn('application/pdf', res['Content-Type'])
        self.assertTrue(res.content.startswith(b'%PDF'))

    def test_report_requires_sube_context(self):
        """Slug raporları sube_id/header/session olmadan 400."""
        res = self.client.get(
            '/finans/api/reports/gunluk-satis/',
            {
                'kurum_id': self.kurum.id,
                'baslangic': '2025-01-01',
                'bitis': '2025-01-31',
            },
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('sube_id', res.json().get('error', '').lower())

    def test_mali_hesap_detail_forbidden_wrong_sube_header(self):
        """Mali hesap detayı yanlış şube bağlamında 403."""
        from apps.finans.domain.financial_account import MaliHesap

        other_sube = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='SISO-B')
        mali = MaliHesap.objects.create(sube=self.sube, ad='Merkez Kasa')

        res = self.client.get(
            f'/finans/api/mali-hesaplar/{mali.id}/',
            HTTP_X_SUBE_ID=str(other_sube.id),
        )
        self.assertEqual(res.status_code, 403)

        res_ok = self.client.get(
            f'/finans/api/mali-hesaplar/{mali.id}/',
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(res_ok.status_code, 200)


class FinansTanimlarMaliHesapAPITest(TestCase):
    """Finans tanımları — mali hesap POST şube bağlamı."""

    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Tanimlar Kurum', kod='TNM')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='TNM-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='TNM-B')
        self.user = User.objects.create_user(username='tanimlar', password='test')
        _assign_finans_read_manage(self.user)
        self.client.force_authenticate(user=self.user)

    def test_mali_hesap_create_requires_sube_context(self):
        res = self.client.post(
            '/finans/api/mali-hesaplar/',
            {'ad': 'Test Kasa', 'tip': 'kasa', 'sube_id': self.sube_a.id},
            format='json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('sube_id', res.json().get('error', '').lower())

    def test_mali_hesap_create_success_with_sube_header(self):
        res = self.client.post(
            '/finans/api/mali-hesaplar/',
            {'ad': 'Header Kasa', 'tip': 'kasa', 'sube_id': self.sube_a.id},
            format='json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['ad'], 'Header Kasa')
        self.assertEqual(res.json()['sube'], self.sube_a.id)

    def test_mali_hesap_create_forbidden_body_sube_mismatch(self):
        res = self.client.post(
            '/finans/api/mali-hesaplar/',
            {'ad': 'Mismatch Kasa', 'tip': 'kasa', 'sube_id': self.sube_b.id},
            format='json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn('şubeye', res.json().get('error', '').lower())


class FinansCariGelirSubeCrossIsolationTest(TestCase):
    """Cari hesap ve gelir kayıtları şubeler arası izole."""

    def setUp(self):
        from django.utils import timezone
        from apps.finans.domain.cari_hesap import CariHesap
        from apps.finans.domain.gelir_kaydi import GelirKaydi
        from apps.finans.domain.gelir_kategorisi import GelirKategorisi

        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Cari Gelir Iso', kod='CGISO')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='CG-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='CG-B')
        self.user = User.objects.create_user(username='carigeliriso', password='test')
        _assign_finans_read_manage(self.user)
        self.client.force_authenticate(user=self.user)

        self.gelir_kat_a = GelirKategorisi.objects.create(
            kurum=self.kurum, sube=self.sube_a, ad='Satış',
        )
        self.gelir_kat_b = GelirKategorisi.objects.create(
            kurum=self.kurum, sube=self.sube_b, ad='Satış',
        )

        self.cari_a = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube_a, unvan='Cari A', hesap_turu='musteri',
        )
        self.cari_b = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube_b, unvan='Cari B', hesap_turu='musteri',
        )
        today = timezone.localdate()
        self.gelir_a = GelirKaydi.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            cari_hesap=self.cari_a,
            gelir_kategorisi=self.gelir_kat_a,
            fatura_tarihi=today,
            vade_tarihi=today,
            brut_tutar=100,
            net_tutar=100,
        )
        self.gelir_b = GelirKaydi.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            cari_hesap=self.cari_b,
            gelir_kategorisi=self.gelir_kat_b,
            fatura_tarihi=today,
            vade_tarihi=today,
            brut_tutar=200,
            net_tutar=200,
        )

    def test_cari_list_requires_sube_context(self):
        res = self.client.get('/finans/api/cari-hesaplar/', {'kurum_id': self.kurum.id})
        self.assertEqual(res.status_code, 400)
        self.assertIn('sube_id', res.json().get('error', '').lower())

    def test_cari_list_scoped_to_active_sube(self):
        res = self.client.get(
            '/finans/api/cari-hesaplar/',
            {'kurum_id': self.kurum.id},
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()}
        self.assertIn(self.cari_a.id, ids)
        self.assertNotIn(self.cari_b.id, ids)

    def test_cari_detail_forbidden_wrong_sube(self):
        res = self.client.get(
            f'/finans/api/cari-hesaplar/{self.cari_b.id}/',
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 403)

        res_ok = self.client.get(
            f'/finans/api/cari-hesaplar/{self.cari_b.id}/',
            HTTP_X_SUBE_ID=str(self.sube_b.id),
        )
        self.assertEqual(res_ok.status_code, 200)

    def test_gelir_list_scoped_to_active_sube(self):
        res = self.client.get(
            '/finans/api/gelirler/',
            {'kurum_id': self.kurum.id, 'sube_id': self.sube_a.id},
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()}
        self.assertIn(self.gelir_a.id, ids)
        self.assertNotIn(self.gelir_b.id, ids)

    def test_gelir_detail_forbidden_wrong_sube(self):
        res = self.client.get(
            f'/finans/api/gelirler/{self.gelir_b.id}/',
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 403)

        res_ok = self.client.get(
            f'/finans/api/gelirler/{self.gelir_b.id}/',
            HTTP_X_SUBE_ID=str(self.sube_b.id),
        )
        self.assertEqual(res_ok.status_code, 200)

    def test_gelir_create_assigns_active_sube(self):
        from django.utils import timezone

        today = timezone.localdate().isoformat()
        res = self.client.post(
            '/finans/api/gelirler/',
            {
                'kurum_id': self.kurum.id,
                'cari_hesap_id': self.cari_a.id,
                'gelir_kategorisi_id': self.gelir_kat_a.id,
                'fatura_tarihi': today,
                'vade_tarihi': today,
                'brut_tutar': '150.00',
            },
            format='json',
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['sube_id'], self.sube_a.id)
