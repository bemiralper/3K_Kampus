"""Dashboard sözleşme özet sayaçları + sözleşmesiz öğrenci listesi."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.domain.enums import SozlesmeDurum, TahsilatDurum
from apps.odeme_takip.domain.models import Sozlesme, Tahsilat
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()
API = '/odeme-takip/api'


def _assign_finans_manage(user):
    role, _ = Role.objects.get_or_create(
        code='odeme_dash_test',
        defaults={'name': 'Odeme Dash Test', 'level': 100, 'is_system_role': True},
    )
    perm, _ = Permission.objects.get_or_create(
        code='finans.manage',
        defaults={'name': 'finans.manage', 'module': 'finans', 'permission_type': 'manage'},
    )
    RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class DashboardSozlesmeOzetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Dash Kurum', kod='DASH')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DASH-M')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='dashuser', password='test')
        _assign_finans_manage(self.user)
        self.client.force_authenticate(user=self.user)

        today = timezone.localdate()

        self.ogrenci_sozlesmesiz = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Yılmaz', aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci_sozlesmesiz,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,
        )

        self.ogrenci_taslak = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mehmet', soyad='Demir', aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci_taslak,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,
        )
        Sozlesme.objects.create(
            sozlesme_no='SZ-DASH-TASLAK',
            ogrenci=self.ogrenci_taslak,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=today,
            bitis_tarihi=today + timedelta(days=365),
            brut_tutar=5000,
            net_tutar=5000,
            durum=SozlesmeDurum.TASLAK,
        )

        self.ogrenci_odemesiz = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Zeynep', soyad='Kaya', aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci_odemesiz,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,
        )
        self.sozlesme_odemesiz = Sozlesme.objects.create(
            sozlesme_no='SZ-DASH-ODMSZ',
            ogrenci=self.ogrenci_odemesiz,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=today,
            bitis_tarihi=today + timedelta(days=365),
            brut_tutar=7000,
            net_tutar=7000,
            durum=SozlesmeDurum.AKTIF,
        )

        self.ogrenci_odenen = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Can', soyad='Öztürk', aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci_odenen,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,
        )
        sozlesme_odenen = Sozlesme.objects.create(
            sozlesme_no='SZ-DASH-ODENEN',
            ogrenci=self.ogrenci_odenen,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=today,
            bitis_tarihi=today + timedelta(days=365),
            brut_tutar=9000,
            net_tutar=9000,
            durum=SozlesmeDurum.AKTIF,
        )
        Tahsilat.objects.create(
            sozlesme=sozlesme_odenen,
            tutar=1000,
            tahsilat_tarihi=today,
            durum=TahsilatDurum.AKTIF,
        )

    def _headers(self):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIM_YILI_ID': str(self.egitim_yili.id),
        }

    def test_dashboard_ozet_yeni_sayaclar(self):
        res = self.client.get(f'{API}/dashboard/', **self._headers())
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['sozlesmesiz_ogrenci_sayisi'], 1)
        self.assertEqual(data['taslak_sozlesme_sayisi'], 1)
        self.assertEqual(data['odemesiz_sozlesme_sayisi'], 1)

    def test_sozlesmesiz_ogrenciler_listesi(self):
        res = self.client.get(f'{API}/sozlesmesiz-ogrenciler/', **self._headers())
        self.assertEqual(res.status_code, 200)
        data = res.json()
        ids = {row['id'] for row in data['results']}
        self.assertIn(self.ogrenci_sozlesmesiz.id, ids)
        self.assertNotIn(self.ogrenci_taslak.id, ids)
        self.assertNotIn(self.ogrenci_odemesiz.id, ids)
        self.assertNotIn(self.ogrenci_odenen.id, ids)

    def test_pasif_ogrenci_sozlesmesiz_listede_yok(self):
        """Sözleşmesi iptal + öğrenci pasif → sözleşmesiz listede ve sayaçta olmamalı."""
        today = timezone.localdate()
        pasif = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Pasif', soyad='Öğrenci', aktif_mi=False,
        )
        OgrenciKayit.objects.create(
            ogrenci=pasif,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,  # eski tutarsız veri senaryosu
        )
        Sozlesme.objects.create(
            sozlesme_no='SZ-DASH-IPTAL',
            ogrenci=pasif,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=today,
            bitis_tarihi=today + timedelta(days=365),
            brut_tutar=3000,
            net_tutar=3000,
            durum=SozlesmeDurum.IPTAL,
        )

        dash = self.client.get(f'{API}/dashboard/', **self._headers())
        self.assertEqual(dash.status_code, 200)
        self.assertEqual(dash.json()['sozlesmesiz_ogrenci_sayisi'], 1)

        liste = self.client.get(f'{API}/sozlesmesiz-ogrenciler/', **self._headers())
        self.assertEqual(liste.status_code, 200)
        ids = {row['id'] for row in liste.json()['results']}
        self.assertIn(self.ogrenci_sozlesmesiz.id, ids)
        self.assertNotIn(pasif.id, ids)
