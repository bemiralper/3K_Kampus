import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase


class MaintenanceApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_superuser(
            username='sysadmin2', email='sys2@test.local', password='testpass123',
        )
        self.client = Client()
        self.client.force_login(self.user)
        self.tmp = tempfile.mkdtemp()
        self.flag = Path(self.tmp) / 'maintenance.enable'
        self.env_patch = patch.dict(os.environ, {'LMS_MAINTENANCE_FLAG': str(self.flag)})
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()
        if self.flag.is_file():
            self.flag.unlink()

    def test_maintenance_get_default_off(self):
        res = self.client.get('/sistem-yonetimi/api/maintenance/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data['enabled'])
        self.assertIn('flag_path', data)

    def test_maintenance_enable_disable(self):
        res = self.client.post(
            '/sistem-yonetimi/api/maintenance/',
            data=json.dumps({'enabled': True, 'confirm': 'BAKIM_AC'}),
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['enabled'])
        self.assertTrue(self.flag.is_file())

        res = self.client.post(
            '/sistem-yonetimi/api/maintenance/',
            data=json.dumps({'enabled': False, 'confirm': 'BAKIM_KAPAT'}),
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json()['enabled'])
        self.assertFalse(self.flag.exists())

    def test_maintenance_wrong_confirm(self):
        res = self.client.post(
            '/sistem-yonetimi/api/maintenance/',
            data=json.dumps({'enabled': True, 'confirm': 'YANLIS'}),
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 400)
