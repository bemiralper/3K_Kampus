"""Yedekleme v2 — registry, engine, encryption, API testleri."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings

from apps.yedekleme.domain.models import (
    BackupArtifact,
    BackupKind,
    BackupResource,
    BackupStatus,
    ResourceType,
)
from apps.yedekleme.engine.archive import create_zip, extract_zip, sha256_file, verify_checksums, write_checksums
from apps.yedekleme.engine.encryption import decrypt_file, encrypt_file, encryption_key_available
from apps.yedekleme.engine.handlers.database_table import DatabaseTableHandler
from apps.yedekleme.engine.orchestrator import BackupEngine
from apps.yedekleme.registry import ResourceSpec, register_resources, sync_registered_resources
from apps.yedekleme.registry.specs import ResourceSpec as Spec


User = get_user_model()


class ArchiveEncryptionTests(TestCase):
    def test_zip_checksum_roundtrip(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / 'a.txt').write_text('hello', encoding='utf-8')
            write_checksums(root, [root / 'a.txt'])
            ok, errors = verify_checksums(root)
            self.assertTrue(ok, errors)
            zip_path = root / 'out.zip'
            create_zip(root, zip_path)
            out = root / 'extracted'
            extract_zip(zip_path, out)
            self.assertTrue((out / 'a.txt').exists())
            self.assertEqual(sha256_file(root / 'a.txt'), sha256_file(out / 'a.txt'))

    @override_settings(BACKUP_ENCRYPTION_KEY='test-secret-key-for-aes-256!!')
    def test_aes_encrypt_decrypt(self):
        self.assertTrue(encryption_key_available())
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / 'plain.bin'
            enc = Path(td) / 'enc.bin'
            dec = Path(td) / 'dec.bin'
            src.write_bytes(b'backup-payload-bytes-12345')
            encrypt_file(src, enc)
            self.assertNotEqual(src.read_bytes(), enc.read_bytes())
            decrypt_file(enc, dec)
            self.assertEqual(src.read_bytes(), dec.read_bytes())


class RegistryTests(TestCase):
    def test_sync_creates_and_preserves_flags(self):
        register_resources('testapp', [
            Spec(
                code='test.table_a',
                name='Table A',
                resource_type=ResourceType.DATABASE_TABLE,
                handler_key='database_table',
                config={'tables': ['auth_user']},
                is_default=True,
                priority=1,
            ),
        ])
        result = sync_registered_resources()
        self.assertGreaterEqual(result['created'], 1)
        r = BackupResource.objects.get(code='test.table_a')
        r.is_active = False
        r.is_default = False
        r.save()
        sync_registered_resources()
        r.refresh_from_db()
        self.assertFalse(r.is_active)
        self.assertFalse(r.is_default)
        self.assertEqual(r.name, 'Table A')


class TableHandlerTests(TestCase):
    def test_export_import_auth_user_roundtrip_counts(self):
        User.objects.create_user(username='backup_test_user', password='x')
        resource = BackupResource.objects.create(
            code='test.auth_user',
            name='Auth User',
            resource_type=ResourceType.DATABASE_TABLE,
            handler_key='database_table',
            config={'tables': ['auth_user']},
        )
        handler = DatabaseTableHandler()
        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            log = mock.Mock()
            log.info = mock.Mock()
            result = handler.export(resource, work, log)
            self.assertIn('meta.json', result.files)
            dry = handler.dry_run(resource, work)
            self.assertIn('auth_user', dry.tables_changed)
            self.assertGreaterEqual(dry.rows_to_insert, 1)
            # restore into same table (truncate+insert) should succeed
            restored = handler.restore(resource, work, dry_run=False)
            self.assertTrue(restored.ok)
            self.assertTrue(User.objects.filter(username='backup_test_user').exists())


class EngineSelectedBackupTests(TestCase):
    def setUp(self):
        BackupResource.objects.create(
            code='test.settings_only',
            name='Settings',
            resource_type=ResourceType.CONFIGURATION,
            handler_key='configuration',
            config={'keys': ['TIME_ZONE', 'LANGUAGE_CODE']},
            is_active=True,
            is_default=True,
            priority=1,
        )

    def test_selected_settings_backup_verify(self):
        with tempfile.TemporaryDirectory() as td:
            with override_settings(BACKUP_CONFIG={
                'local_root': Path(td),
                'file_roots': [],
                'exclude_patterns': [],
                'retention': {},
            }):
                engine = BackupEngine()
                artifact, job = engine.create_backup(
                    kind=BackupKind.SELECTED,
                    resource_codes=['test.settings_only'],
                    encrypt=False,
                )
                self.assertEqual(artifact.status, BackupStatus.COMPLETED)
                self.assertEqual(job.status, BackupStatus.COMPLETED)
                self.assertTrue(artifact.checksum)
                self.assertTrue((Path(td) / artifact.storage_key).exists())
                verified = engine.verify(artifact)
                self.assertTrue(verified['valid'])
                preview = engine.preview(artifact)
                self.assertEqual(preview['manifest']['version'], '2.0')
                dry = engine.dry_run(artifact)
                self.assertFalse(dry['side_effects'])


class ApiPermissionTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(username='yedek_api', password='pass')

    def test_dashboard_requires_auth(self):
        res = self.client.get('/yedekleme/api/dashboard/')
        self.assertIn(res.status_code, (401, 403))

    def test_dashboard_with_superuser(self):
        self.user.is_superuser = True
        self.user.save()
        self.client.force_login(self.user)
        # ensure at least system sync can run
        sync_registered_resources()
        res = self.client.get('/yedekleme/api/dashboard/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('total_backups', data)
        self.assertEqual(data['config']['format_version'], '2.0')

    def test_create_selected_backup_api(self):
        self.user.is_superuser = True
        self.user.save()
        self.client.force_login(self.user)
        BackupResource.objects.create(
            code='api.settings',
            name='API Settings',
            resource_type=ResourceType.CONFIGURATION,
            handler_key='configuration',
            config={'keys': ['TIME_ZONE']},
            is_active=True,
        )
        with tempfile.TemporaryDirectory() as td:
            with override_settings(BACKUP_CONFIG={
                'local_root': Path(td),
                'file_roots': [],
                'exclude_patterns': [],
                'retention': {},
            }):
                res = self.client.post(
                    '/yedekleme/api/backups/',
                    data=json.dumps({
                        'kind': 'selected',
                        'resource_codes': ['api.settings'],
                        'encrypt': False,
                    }),
                    content_type='application/json',
                )
                self.assertEqual(res.status_code, 201, res.content)
                body = res.json()
                self.assertEqual(body['artifact']['status'], 'completed')
                self.assertEqual(body['artifact']['kind'], 'selected')
