"""Muhasebe rolü ve API izin testleri."""
from django.contrib.auth.models import User
from django.test import Client, TestCase

from apps.roller.models import Role, UserRole
from apps.roller.seed import ensure_default_roles


class MuhasebePermissionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_default_roles()
        cls.muhasebe_role = Role.objects.get(code='muhasebe')
        cls.muhasebe_user = User.objects.create_user(
            username='muhasebe_test',
            password='testpass123',
        )
        UserRole.objects.create(user=cls.muhasebe_user, role=cls.muhasebe_role)

    def setUp(self):
        self.client = Client()

    def test_anonymous_finans_dashboard_returns_401_or_403(self):
        response = self.client.get('/finans/api/dashboard/?kurum_id=1')
        self.assertIn(response.status_code, (401, 403))

    def test_muhasebe_can_access_finans_dashboard(self):
        self.client.login(username='muhasebe_test', password='testpass123')
        response = self.client.get('/finans/api/dashboard/?kurum_id=1')
        self.assertIn(response.status_code, (200, 400))

    def test_muhasebe_cannot_access_bordro_sozlesme_api(self):
        self.client.login(username='muhasebe_test', password='testpass123')
        response = self.client.get('/personel/api/sozlesmeler/')
        self.assertEqual(response.status_code, 403)

    def test_muhasebe_role_has_expected_permissions(self):
        perms = set(self.muhasebe_role.get_all_permissions().values_list('code', flat=True))
        self.assertIn('ogrenci.write', perms)
        self.assertIn('personel.read', perms)
        self.assertIn('personel.write', perms)
        self.assertIn('finans.manage', perms)
        self.assertIn('communication.read', perms)
        self.assertIn('communication.write', perms)
        self.assertNotIn('personel.manage', perms)

    def test_setup_roles_idempotent(self):
        ensure_default_roles()
        role = Role.objects.get(code='muhasebe')
        perms = set(role.get_all_permissions().values_list('code', flat=True))
        self.assertIn('personel.write', perms)
