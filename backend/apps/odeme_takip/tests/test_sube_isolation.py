"""
Şube zorunluluğu — ödeme takip API endpoint'leri.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum, TahsilatDurum
from apps.odeme_takip.domain.models import Sozlesme, Taksit, Tahsilat
from apps.ogrenci.domain.models import Ogrenci
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()

API = '/odeme-takip/api'


def _assign_finans_manage(user):
    role, _ = Role.objects.get_or_create(
        code='odeme_sube_test',
        defaults={'name': 'Odeme Sube Test', 'level': 100, 'is_system_role': True},
    )
    perm, _ = Permission.objects.get_or_create(
        code='finans.manage',
        defaults={'name': 'finans.manage', 'module': 'finans', 'permission_type': 'manage'},
    )
    RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class OdemeTakipSubeIsolationAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Odeme Iso Kurum', kod='OISO')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Ankara', kod='OISO-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='İstanbul', kod='OISO-B')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025,
            bitis_yil=2026,
            aktif_mi=True,
        )
        self.user = User.objects.create_user(username='odemeiso', password='test')
        _assign_finans_manage(self.user)
        self.client.force_authenticate(user=self.user)

        self.ogrenci_a = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Ali',
            soyad='Ankara',
            aktif_mi=True,
        )
        self.ogrenci_b = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            ad='Veli',
            soyad='İstanbul',
            aktif_mi=True,
        )
        today = timezone.localdate()
        self.sozlesme_a = Sozlesme.objects.create(
            sozlesme_no='SZ-OISO-A-001',
            ogrenci=self.ogrenci_a,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube_a,
            baslangic_tarihi=today,
            bitis_tarihi=today + timedelta(days=365),
            brut_tutar=10000,
            net_tutar=10000,
            durum=SozlesmeDurum.AKTIF,
        )
        self.sozlesme_b = Sozlesme.objects.create(
            sozlesme_no='SZ-OISO-B-001',
            ogrenci=self.ogrenci_b,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube_b,
            baslangic_tarihi=today,
            bitis_tarihi=today + timedelta(days=365),
            brut_tutar=8000,
            net_tutar=8000,
            durum=SozlesmeDurum.AKTIF,
        )
        self.taksit_a = Taksit.objects.create(
            sozlesme=self.sozlesme_a,
            taksit_no=1,
            vade_tarihi=today - timedelta(days=5),
            tutar=5000,
            kalan_tutar=5000,
            durum=TaksitDurum.BEKLEMEDE,
        )
        Taksit.objects.create(
            sozlesme=self.sozlesme_b,
            taksit_no=1,
            vade_tarihi=today - timedelta(days=3),
            tutar=4000,
            kalan_tutar=4000,
            durum=TaksitDurum.BEKLEMEDE,
        )
        self.tahsilat_a = Tahsilat.objects.create(
            sozlesme=self.sozlesme_a,
            tutar=1000,
            tahsilat_tarihi=today,
            durum=TahsilatDurum.AKTIF,
        )
        Tahsilat.objects.create(
            sozlesme=self.sozlesme_b,
            tutar=2000,
            tahsilat_tarihi=today,
            durum=TahsilatDurum.AKTIF,
        )

    def _headers(self, sube):
        return {
            'HTTP_X_SUBE_ID': str(sube.id),
            'HTTP_X_KURUM_ID': str(self.kurum.id),
        }

    def test_sozlesme_list_requires_sube_context(self):
        res = self.client.get(f'{API}/sozlesmeler/', {'kurum_id': self.kurum.id})
        self.assertEqual(res.status_code, 400)
        self.assertIn('sube_id', res.json().get('error', '').lower())

    def test_sozlesme_list_scoped_to_active_sube(self):
        res = self.client.get(
            f'{API}/sozlesmeler/',
            {'kurum_id': self.kurum.id, 'egitim_yili_id': self.egitim_yili.id},
            **self._headers(self.sube_a),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()}
        self.assertIn(self.sozlesme_a.id, ids)
        self.assertNotIn(self.sozlesme_b.id, ids)

    def test_sozlesme_detail_forbidden_wrong_sube(self):
        res = self.client.get(
            f'{API}/sozlesmeler/{self.sozlesme_b.id}/',
            **self._headers(self.sube_a),
        )
        self.assertEqual(res.status_code, 403)

        res_ok = self.client.get(
            f'{API}/sozlesmeler/{self.sozlesme_b.id}/',
            **self._headers(self.sube_b),
        )
        self.assertEqual(res_ok.status_code, 200)

    def test_vadesi_gecenler_scoped_to_active_sube(self):
        res = self.client.get(
            f'{API}/taksitler/vadesi-gecenler/',
            {'kurum_id': self.kurum.id},
            **self._headers(self.sube_a),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()}
        self.assertIn(self.taksit_a.id, ids)
        self.assertEqual(len(ids), 1)

    def test_tahsilat_list_scoped_to_active_sube(self):
        res = self.client.get(
            f'{API}/tahsilatlar/',
            {'kurum_id': self.kurum.id, 'egitim_yili_id': self.egitim_yili.id},
            **self._headers(self.sube_a),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()}
        self.assertIn(self.tahsilat_a.id, ids)
        self.assertEqual(len(ids), 1)

    def test_dashboard_scoped_to_active_sube(self):
        res = self.client.get(
            f'{API}/dashboard/',
            {'kurum_id': self.kurum.id, 'egitim_yili_id': self.egitim_yili.id},
            **self._headers(self.sube_a),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['toplam_sozlesme'], 1)
        self.assertEqual(body['geciken_taksit_sayisi'], 1)

    def test_sozlesme_create_accepts_body_sube_when_header_missing(self):
        """Header/session yokken POST gövdesindeki sube_id bağlam hatasına düşmez."""
        payload = {
            'kurum_id': self.kurum.id,
            'sube_id': self.sube_a.id,
            'egitim_yili_id': self.egitim_yili.id,
        }
        res = self.client.post(f'{API}/sozlesmeler/create/', payload, format='json')
        err = res.json().get('error', '')
        self.assertNotIn('sube_id parametresi', err)
        self.assertNotIn('aktif şube bağlamı', err)
