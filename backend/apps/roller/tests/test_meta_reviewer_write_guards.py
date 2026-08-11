"""meta_wa_reviewer: diğer modüllerde yazma engeli (salt okuma)."""
import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.roller.models import Role, UserRole
from apps.roller.seed import ensure_default_roles
from apps.sube.domain.models import Sube

User = get_user_model()


class MetaReviewerWriteGuardTests(TestCase):
    def setUp(self):
        ensure_default_roles()
        self.kurum = Kurum.objects.create(ad='Guard Kurum', kod='GRD')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='GRD-M')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Test', aktif_mi=True,
        )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.client = Client()
        user = User.objects.create_user(
            username='meta_guard', password='x', is_staff=True,
        )
        role = Role.objects.get(code='meta_wa_reviewer')
        UserRole.objects.create(
            user=user, role=role, kurum=self.kurum, must_change_password=False,
        )
        self.client.force_login(user)
        self.session = self.client.session
        self.session['active_kurum_id'] = self.kurum.id
        self.session['active_sube_id'] = self.sube.id
        self.session.save()

    def test_ogrenci_put_forbidden(self):
        res = self.client.put(
            f'/ogrenciler/api/{self.ogrenci.id}/',
            data=json.dumps({'ad': 'Hack', 'soyad': 'Test'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)

    def test_kurum_put_forbidden(self):
        res = self.client.put(
            f'/kurum-yonetimi/api/kurum/{self.kurum.id}/',
            data=json.dumps({'ad': 'Hack', 'kod': 'GRD'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)
        self.kurum.refresh_from_db()
        self.assertEqual(self.kurum.ad, 'Guard Kurum')

    def test_sube_put_forbidden(self):
        res = self.client.put(
            f'/kurum-yonetimi/api/sube/{self.sube.id}/',
            data=json.dumps({'ad': 'Hack', 'kod': 'GRD-M', 'kurum_id': self.kurum.id}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)

    def test_role_create_forbidden(self):
        res = self.client.post(
            '/roller/api/roles/create/',
            data=json.dumps({'code': 'hack', 'name': 'Hack', 'permission_ids': []}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)

    def test_sinif_create_forbidden(self):
        res = self.client.post(
            '/siniflar/api/create/',
            data=json.dumps({'ad': 'Hack', 'kod': 'H1', 'kapasite': 10}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)

    def test_website_v2_write_forbidden(self):
        res = self.client.post(
            '/website-yonetimi/api/v2/pages/',
            data=json.dumps({'title': 'Hack', 'slug': 'hack-page'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)

    def test_gorev_create_forbidden(self):
        res = self.client.post(
            '/gorev/api/gorevler/',
            data=json.dumps({'baslik': 'Hack görev', 'gorev_tipi_id': 1}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)

    def test_egitim_tanimlari_create_forbidden(self):
        res = self.client.post(
            '/egitim-tanimlari/api/sinif-seviyesi/',
            data=json.dumps({'ad': 'Hack', 'kod': 'H'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)

    def test_egitim_paketleri_create_forbidden(self):
        res = self.client.post(
            '/egitim-paketleri/api/grup-dersleri/',
            data=json.dumps({'ad': 'Hack', 'kod': 'H', 'fiyat': 100}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)

    def test_communication_write_allowed_shape(self):
        """İletişim yazma izni rolde olmalı — endpoint varlığı ayrı."""
        codes = list(
            Role.objects.get(code='meta_wa_reviewer')
            .get_all_permissions()
            .values_list('code', flat=True)
        )
        self.assertIn('communication.write', codes)
        self.assertNotIn('ogrenci.write', codes)
        self.assertNotIn('kurum.write', codes)
        self.assertNotIn('finans.write', codes)
