from django.test import Client, TestCase
from django.contrib.auth import get_user_model


class SistemYonetimiApiSmokeTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_superuser(username='sysadmin', email='sys@test.local', password='testpass123')
        self.client = Client()
        self.client.force_login(self.user)

    def test_dashboard(self):
        res = self.client.get('/sistem-yonetimi/api/dashboard/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('application', data)
        self.assertIn('postgres', data)

    def test_health(self):
        res = self.client.get('/sistem-yonetimi/api/health/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('items', res.json())

    def test_storage(self):
        res = self.client.get('/sistem-yonetimi/api/storage/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('disk', res.json())

    def test_settings_get(self):
        res = self.client.get('/sistem-yonetimi/api/settings/')
        self.assertEqual(res.status_code, 200)

    def test_jobs_list(self):
        res = self.client.get('/sistem-yonetimi/api/jobs/')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(len(res.json().get('items') or []) >= 1)

    def test_collect_metrics_command(self):
        from django.core.management import call_command
        call_command('collect_system_metrics')
        from apps.sistem_yonetimi.domain.models import SystemMetricSample
        self.assertTrue(SystemMetricSample.objects.exists())
