"""Yedekleme v2 — registry, engine, encryption, API testleri."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, TransactionTestCase, override_settings

from apps.yedekleme.domain.models import (
    BackupArtifact,
    BackupKind,
    BackupResource,
    BackupStatus,
    ResourceType,
)
from apps.yedekleme.engine.archive import create_zip, extract_zip, sha256_file, verify_checksums, write_checksums
from apps.yedekleme.engine.encryption import decrypt_file, encrypt_file, encryption_key_available, key_fingerprint
from apps.yedekleme.engine.handlers.database_table import DatabaseTableHandler, _resolve_tables
from apps.yedekleme.engine.orchestrator import BackupEngine
from apps.yedekleme.engine.plan import filter_restore_entries, manifest_has_full_database
from apps.yedekleme.engine.selection import resolve_resources
from apps.yedekleme.registry import register_resources, sync_registered_resources
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
            self.assertTrue(key_fingerprint())


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


class PlanFilterTests(TestCase):
    def test_filter_skips_table_when_full_present(self):
        entries = [
            {'code': 'system.database', 'handler': 'database_full', 'priority': 10},
            {'code': 'finans.cariler', 'handler': 'database_table', 'priority': 40},
            {'code': 'system.media', 'handler': 'file_directory', 'priority': 20},
        ]
        restore, skipped = filter_restore_entries(entries)
        self.assertEqual([e['code'] for e in restore], ['system.database', 'system.media'])
        self.assertEqual([e['code'] for e in skipped], ['finans.cariler'])
        self.assertTrue(manifest_has_full_database({'resources': entries}))

    def test_filter_keeps_tables_without_full(self):
        entries = [
            {'code': 'finans.cariler', 'handler': 'database_table', 'priority': 40},
        ]
        restore, skipped = filter_restore_entries(entries)
        self.assertEqual(len(restore), 1)
        self.assertEqual(skipped, [])


class SelectionFullTests(TestCase):
    def setUp(self):
        BackupResource.objects.create(
            code='system.database',
            name='Full DB',
            resource_type=ResourceType.DATABASE_TABLE,
            handler_key='database_full',
            is_active=True,
            is_default=True,
            priority=10,
        )
        BackupResource.objects.create(
            code='mod.table',
            name='Mod Table',
            resource_type=ResourceType.DATABASE_TABLE,
            handler_key='database_table',
            config={'tables': ['auth_user']},
            is_active=True,
            is_default=True,
            priority=40,
        )
        BackupResource.objects.create(
            code='system.media',
            name='Media',
            resource_type=ResourceType.MEDIA,
            handler_key='file_directory',
            config={'relative_to': 'media', 'path': ''},
            is_active=True,
            is_default=True,
            priority=20,
        )

    def test_full_kind_excludes_table_handlers(self):
        resources = resolve_resources(BackupKind.FULL)
        handlers = {r.handler_key for r in resources}
        codes = {r.code for r in resources}
        self.assertIn('database_full', handlers)
        self.assertNotIn('database_table', handlers)
        self.assertIn('system.media', codes)
        self.assertNotIn('mod.table', codes)


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
            restored = handler.restore(resource, work, dry_run=False)
            self.assertTrue(restored.ok)
            self.assertTrue(User.objects.filter(username='backup_test_user').exists())

    def test_resolve_tables_includes_m2m_through(self):
        tables = _resolve_tables({'models': ['finans.CariHesap']})
        self.assertIn('finans_cari_hesap', tables)
        self.assertTrue(any('etiketler' in t or 'gider_kategorileri' in t for t in tables))


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
                self.assertFalse(artifact.manifest.get('encrypted'))
                self.assertIn('priority', artifact.manifest['resources'][0])
                verified = engine.verify(artifact)
                self.assertTrue(verified['valid'])
                preview = engine.preview(artifact)
                self.assertEqual(preview['manifest']['version'], '2.0')
                dry = engine.dry_run(artifact)
                self.assertFalse(dry['side_effects'])

    @override_settings(BACKUP_ENCRYPTION_KEY='test-secret-key-for-aes-256!!')
    def test_encrypted_manifest_flag(self):
        with tempfile.TemporaryDirectory() as td:
            with override_settings(
                BACKUP_ENCRYPTION_KEY='test-secret-key-for-aes-256!!',
                BACKUP_CONFIG={
                    'local_root': Path(td),
                    'file_roots': [],
                    'exclude_patterns': [],
                    'retention': {},
                },
            ):
                BackupResource.objects.get_or_create(
                    code='test.settings_only',
                    defaults={
                        'name': 'Settings',
                        'resource_type': ResourceType.CONFIGURATION,
                        'handler_key': 'configuration',
                        'config': {'keys': ['TIME_ZONE']},
                        'is_active': True,
                        'priority': 1,
                    },
                )
                engine = BackupEngine()
                artifact, _job = engine.create_backup(
                    kind=BackupKind.SELECTED,
                    resource_codes=['test.settings_only'],
                    encrypt=True,
                )
                self.assertTrue(artifact.encrypted)
                self.assertTrue(artifact.manifest.get('encrypted'))
                self.assertEqual(artifact.manifest.get('key_fingerprint'), key_fingerprint())


class RestoreOrchestrationTests(TransactionTestCase):
    def test_restore_skips_tables_when_manifest_has_full(self):
        """Orchestrator restore path skips database_table when full dump entry exists."""
        with tempfile.TemporaryDirectory() as td:
            with override_settings(BACKUP_CONFIG={
                'local_root': Path(td),
                'file_roots': [],
                'exclude_patterns': [],
                'retention': {},
            }):
                BackupResource.objects.create(
                    code='system.database',
                    name='Full',
                    resource_type=ResourceType.DATABASE_TABLE,
                    handler_key='database_full',
                    is_active=True,
                    is_restorable=True,
                    priority=10,
                )
                BackupResource.objects.create(
                    code='test.tbl',
                    name='Tbl',
                    resource_type=ResourceType.DATABASE_TABLE,
                    handler_key='database_table',
                    config={'tables': ['auth_user']},
                    is_active=True,
                    is_restorable=True,
                    priority=40,
                )
                BackupResource.objects.create(
                    code='test.settings_only',
                    name='Settings',
                    resource_type=ResourceType.CONFIGURATION,
                    handler_key='configuration',
                    config={'keys': ['TIME_ZONE']},
                    is_active=True,
                    is_restorable=True,
                    priority=30,
                )

                engine = BackupEngine()
                work = Path(td) / 'craft'
                payload = work / 'payload'
                (payload / 'system_database').mkdir(parents=True)
                (payload / 'test_tbl').mkdir(parents=True)
                (payload / 'test_settings_only').mkdir(parents=True)
                (payload / 'test_settings_only' / 'settings.json').write_text(
                    '{"TIME_ZONE":"UTC"}', encoding='utf-8'
                )
                (payload / 'test_settings_only' / 'meta.json').write_text(
                    '{"keys":["TIME_ZONE"]}', encoding='utf-8'
                )
                (payload / 'system_database' / 'meta.json').write_text('{}', encoding='utf-8')
                manifest = {
                    'version': '2.0',
                    'resources': [
                        {
                            'code': 'system.database',
                            'handler': 'database_full',
                            'priority': 10,
                            'restorable': True,
                            'config': {},
                        },
                        {
                            'code': 'test.tbl',
                            'handler': 'database_table',
                            'priority': 40,
                            'restorable': True,
                            'config': {'tables': ['auth_user']},
                        },
                        {
                            'code': 'test.settings_only',
                            'handler': 'configuration',
                            'priority': 30,
                            'restorable': True,
                            'config': {'keys': ['TIME_ZONE']},
                        },
                    ],
                    'encrypted': False,
                }
                (work / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
                files = [work / 'manifest.json']
                for p in payload.rglob('*'):
                    if p.is_file():
                        files.append(p)
                write_checksums(work, files)
                zip_path = Path(td) / 'fake.zip'
                create_zip(work, zip_path)
                storage_key = 'fake/fake.zip'
                dest = Path(td) / storage_key
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(zip_path.read_bytes())

                artifact = BackupArtifact.objects.create(
                    filename='fake.zip',
                    storage_key=storage_key,
                    size_bytes=dest.stat().st_size,
                    checksum=sha256_file(dest),
                    status=BackupStatus.COMPLETED,
                    kind=BackupKind.FULL,
                    resource_codes=['system.database', 'test.tbl', 'test.settings_only'],
                    manifest=manifest,
                    format_version='2.0',
                )

                mock_full = mock.Mock()
                mock_full.restore.return_value = mock.Mock(ok=True, message='ok', meta={})
                mock_table = mock.Mock()
                mock_table.restore.return_value = mock.Mock(ok=True, message='ok', meta={})
                from apps.yedekleme.engine.handlers import get_handler as real_get

                def _get(key):
                    if key == 'database_full':
                        return mock_full
                    if key == 'database_table':
                        return mock_table
                    return real_get(key)

                with mock.patch('apps.yedekleme.engine.orchestrator.get_handler', side_effect=_get):
                    result = engine.restore(artifact, confirm='RESTORE')

                self.assertTrue(result['restored'])
                self.assertTrue(result['full_database_restored'])
                self.assertIn('test.tbl', result['skipped_table_resources'])
                mock_full.restore.assert_called_once()
                mock_table.restore.assert_not_called()


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
