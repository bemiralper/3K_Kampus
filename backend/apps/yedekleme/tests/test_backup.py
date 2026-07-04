from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from pathlib import Path
import tempfile
import json

from apps.yedekleme.application.services.manifest_service import ManifestService, MANIFEST_VERSION
from apps.yedekleme.application.services.filesystem_backup import FilesystemBackupService
from apps.yedekleme.domain.models import BackupArtifact, BackupSchedule, BackupStatus
from apps.roller.models import Permission, Role, UserRole

User = get_user_model()


class ManifestServiceTests(TestCase):
    def test_validate_checksums(self):
        svc = ManifestService()
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            manifest = {'version': MANIFEST_VERSION, 'backup_id': 'test'}
            (work / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
            (work / 'database.dump').write_bytes(b'dump')
            svc.write_checksums(work)
            result = svc.validate(work)
            self.assertEqual(result['backup_id'], 'test')


@override_settings(
    BACKUP_CONFIG={
        'local_root': Path(tempfile.gettempdir()) / 'test_backups',
        'file_roots': [],
        'exclude_patterns': ['*.pyc'],
        'retention': {'daily': 2, 'manual': 1},
    }
)
class RetentionAndModelTests(TestCase):
    def test_schedule_singleton(self):
        a = BackupSchedule.get_singleton()
        b = BackupSchedule.get_singleton()
        self.assertEqual(a.pk, b.pk)

    def test_artifact_str(self):
        art = BackupArtifact.objects.create(
            filename='test.tar.gz',
            storage_key='key/test.tar.gz',
            status=BackupStatus.COMPLETED,
        )
        self.assertIn('test.tar.gz', str(art))


class FilesystemBackupExcludeTests(TestCase):
    def test_exclude_pattern(self):
        svc = FilesystemBackupService()
        self.assertTrue(svc._excluded('foo.pyc', ['*.pyc']))
        self.assertFalse(svc._excluded('foo.txt', ['*.pyc']))


class BackupApiPermissionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='backupuser', password='pass')
        perm, _ = Permission.objects.get_or_create(
            code='yedekleme.read',
            defaults={'name': 'Yedek Görüntüleme', 'module': 'yedekleme', 'permission_type': 'read'},
        )
        role, _ = Role.objects.get_or_create(code='backup_tester', defaults={'name': 'Backup Tester'})
        role.permissions.add(perm)
        UserRole.objects.update_or_create(user=self.user, defaults={'role': role})

    def test_dashboard_requires_login(self):
        from django.test import Client
        client = Client()
        res = client.get('/yedekleme/api/dashboard/')
        self.assertIn(res.status_code, (401, 403))

    def test_dashboard_with_permission(self):
        from django.test import Client
        client = Client()
        client.force_login(self.user)
        res = client.get('/yedekleme/api/dashboard/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('total_backups', data)
