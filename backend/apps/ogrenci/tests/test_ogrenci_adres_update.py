"""Öğrenci detay düzenlemede adres kalıcılığı."""
import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.kurum.domain.models import Kurum
from apps.ogrenci.application.services import format_ogrenci_adres_text, sync_default_ogrenci_adres
from apps.ogrenci.domain.models import Ogrenci, OgrenciAdres
from apps.roller.models import Role, UserRole
from apps.roller.seed import ensure_default_roles
from apps.sube.domain.models import Sube

User = get_user_model()


class OgrenciAdresUpdateTests(TestCase):
    def setUp(self):
        ensure_default_roles()
        self.kurum = Kurum.objects.create(ad='Adres Kurum', kod='ADR')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ADR-M')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Yılmaz',
            aktif_mi=True,
            adres='Eski düz alan',
        )
        self.adres_row = OgrenciAdres.objects.create(
            ogrenci=self.ogrenci,
            adres='Atatürk Cad. No:5',
            il='İstanbul',
            ilce='Kadıköy',
            varsayilan=True,
            adres_turu='ev',
        )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.client = Client()
        user = User.objects.create_user(username='koc_adres', password='x', is_staff=True)
        UserRole.objects.create(
            user=user,
            role=Role.objects.get(code='koc'),
            kurum=self.kurum,
            must_change_password=False,
        )
        self.client.force_login(user)

    def _put(self, payload):
        return self.client.put(
            f'/ogrenciler/api/{self.ogrenci.id}/',
            data=json.dumps(payload),
            content_type='application/json',
            **self.headers,
        )

    def _get(self):
        return self.client.get(f'/ogrenciler/api/{self.ogrenci.id}/', **self.headers)

    def test_get_prefers_ogrenci_adres_over_flat_field(self):
        res = self._get()
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['adres'], 'Atatürk Cad. No:5, Kadıköy, İstanbul')
        self.assertNotEqual(body['adres'], self.ogrenci.adres)

    def test_put_address_survives_reload(self):
        displayed = self._get().json()['adres']
        new_display = displayed.replace('Atatürk Cad. No:5', 'Bağdat Cad. No:10')

        res = self._put({
            'ad': 'Ayşe',
            'soyad': 'Yılmaz',
            'adres': new_display,
        })
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['success'])

        reload_body = self._get().json()
        self.assertEqual(reload_body['adres'], new_display)

        self.adres_row.refresh_from_db()
        self.assertEqual(self.adres_row.adres, 'Bağdat Cad. No:10')
        self.assertEqual(self.adres_row.ilce, 'Kadıköy')
        self.assertEqual(self.adres_row.il, 'İstanbul')

        self.ogrenci.refresh_from_db()
        self.assertEqual(self.ogrenci.adres, new_display)

    def test_put_rewritten_address_does_not_duplicate_il_ilce(self):
        res = self._put({
            'ad': 'Ayşe',
            'soyad': 'Yılmaz',
            'adres': 'Yeni Mahalle 12, Üsküdar, İstanbul',
        })
        self.assertEqual(res.status_code, 200)

        reload_body = self._get().json()
        self.assertEqual(reload_body['adres'], 'Yeni Mahalle 12, Üsküdar, İstanbul')
        self.assertNotIn('Kadıköy', reload_body['adres'])

        self.adres_row.refresh_from_db()
        self.assertEqual(self.adres_row.adres, 'Yeni Mahalle 12, Üsküdar, İstanbul')
        self.assertEqual(self.adres_row.il, '')
        self.assertEqual(self.adres_row.ilce, '')

    def test_put_creates_adres_row_when_missing(self):
        OgrenciAdres.objects.filter(ogrenci=self.ogrenci).delete()
        self.ogrenci.adres = ''
        self.ogrenci.save(update_fields=['adres'])

        res = self._put({
            'ad': 'Ayşe',
            'soyad': 'Yılmaz',
            'adres': 'Sadece yeni adres',
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._get().json()['adres'], 'Sadece yeni adres')
        self.assertTrue(
            OgrenciAdres.objects.filter(ogrenci=self.ogrenci, adres='Sadece yeni adres').exists()
        )

    def test_put_clears_structured_address(self):
        res = self._put({
            'ad': 'Ayşe',
            'soyad': 'Yılmaz',
            'adres': '',
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._get().json()['adres'], '')

        self.adres_row.refresh_from_db()
        self.assertEqual(self.adres_row.adres, '')
        self.assertEqual(self.adres_row.il, '')
        self.assertEqual(self.adres_row.ilce, '')


class SyncDefaultOgrenciAdresUnitTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Unit Kurum', kod='ADU')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ADU-M')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Can', soyad='Demir', aktif_mi=True,
        )

    def test_format_joins_parts(self):
        self.assertEqual(
            format_ogrenci_adres_text('Sokak 1', 'Çankaya', 'Ankara'),
            'Sokak 1, Çankaya, Ankara',
        )

    def test_sync_noop_keeps_il_ilce(self):
        row = OgrenciAdres.objects.create(
            ogrenci=self.ogrenci,
            adres='Sokak 1',
            il='Ankara',
            ilce='Çankaya',
            varsayilan=True,
        )
        displayed = format_ogrenci_adres_text(row.adres, row.ilce, row.il)
        sync_default_ogrenci_adres(self.ogrenci, displayed)
        row.refresh_from_db()
        self.assertEqual(row.adres, 'Sokak 1')
        self.assertEqual(row.ilce, 'Çankaya')
        self.assertEqual(row.il, 'Ankara')
