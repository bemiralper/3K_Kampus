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
    BackupJob,
    BackupKind,
    BackupOperationAction,
    BackupResource,
    BackupStatus,
    BackupTrigger,
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

    @override_settings(BACKUP_ENCRYPTION_KEY='test-secret-key-for-aes-256!!')
    def test_streaming_encrypt_decrypt_multichunk(self):
        from apps.yedekleme.engine import encryption as enc_mod

        with tempfile.TemporaryDirectory() as td, mock.patch.object(enc_mod, '_STREAM_CHUNK', 1024):
            src = Path(td) / 'big.bin'
            enc = Path(td) / 'big.enc'
            dec = Path(td) / 'big.dec'
            payload = b'x' * (1024 * 5 + 123)  # birden çok parça
            src.write_bytes(payload)
            enc_mod.encrypt_file(src, enc)
            enc_mod.decrypt_file(enc, dec)
            self.assertEqual(dec.read_bytes(), payload)

    @override_settings(BACKUP_ENCRYPTION_KEY='test-secret-key-for-aes-256!!')
    def test_legacy_oneshot_decrypt_compat(self):
        """Eski (tek-atış) formatla şifrelenmiş yedekler hâlâ çözülebilmeli."""
        import os as _os

        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        from apps.yedekleme.engine import encryption as enc_mod

        with tempfile.TemporaryDirectory() as td:
            enc = Path(td) / 'legacy.enc'
            dec = Path(td) / 'legacy.dec'
            data = b'legacy-format-payload'
            key = enc_mod._raw_key()
            nonce = _os.urandom(12)
            enc.write_bytes(nonce + AESGCM(key).encrypt(nonce, data, None))
            enc_mod.decrypt_file(enc, dec)
            self.assertEqual(dec.read_bytes(), data)

    def test_extract_zip_rejects_zip_slip(self):
        import zipfile

        from apps.yedekleme.engine.archive import UnsafeArchiveError, extract_zip

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            evil = root / 'evil.zip'
            with zipfile.ZipFile(evil, 'w') as zf:
                zf.writestr('../escape.txt', 'pwned')
            with self.assertRaises(UnsafeArchiveError):
                extract_zip(evil, root / 'out')
            # Hedef dışına dosya yazılmamış olmalı
            self.assertFalse((root / 'escape.txt').exists())

    def test_quote_ident_escapes_double_quotes(self):
        from apps.yedekleme.engine.handlers.database_table import _quote_ident

        self.assertEqual(_quote_ident('auth_user'), '"auth_user"')
        self.assertEqual(_quote_ident('a"b'), '"a""b"')
        # Kaçış sonrası içeride tırnak kırılması olmamalı
        self.assertEqual(_quote_ident('x"; DROP TABLE y; --'), '"x""; DROP TABLE y; --"')


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

    def test_order_restore_puts_media_before_full_db(self):
        from apps.yedekleme.engine.plan import order_restore_entries

        entries = [
            {'code': 'system.database', 'handler': 'database_full', 'priority': 10},
            {'code': 'system.settings', 'handler': 'configuration', 'priority': 30},
            {'code': 'system.media', 'handler': 'file_directory', 'priority': 20},
        ]
        ordered = order_restore_entries(entries)
        self.assertEqual(
            [e['code'] for e in ordered],
            ['system.media', 'system.settings', 'system.database'],
        )

    def test_filter_keeps_tables_without_full(self):
        entries = [
            {'code': 'finans.cariler', 'handler': 'database_table', 'priority': 40},
        ]
        restore, skipped = filter_restore_entries(entries)
        self.assertEqual(len(restore), 1)
        self.assertEqual(skipped, [])


class FileDirectoryRestoreSkipTests(TestCase):
    def test_restore_skips_when_meta_missing(self):
        from apps.yedekleme.engine.handlers.file_directory import FileDirectoryHandler

        handler = FileDirectoryHandler()

        class _R:
            code = 'kurum.files'
            config = {'relative_to': 'media', 'path': 'kurum'}

        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            (work / 'meta.json').write_text(
                json.dumps({'missing': True, 'source': '/tmp/nope'}),
                encoding='utf-8',
            )
            res = handler.restore(_R(), work, dry_run=False)
            self.assertTrue(res.ok, res.message)
            self.assertIn('atlandı', res.message)

    def test_restore_skips_when_files_dir_absent(self):
        from apps.yedekleme.engine.handlers.file_directory import FileDirectoryHandler

        handler = FileDirectoryHandler()

        class _R:
            code = 'personel.files'
            config = {'relative_to': 'media', 'path': 'personel'}

        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            (work / 'meta.json').write_text(json.dumps({'file_count': 0}), encoding='utf-8')
            res = handler.restore(_R(), work, dry_run=False)
            self.assertTrue(res.ok, res.message)
            self.assertIn('atlandı', res.message)


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

                # C4: restore öncesi güvenlik yedeği gerçek pg_dump çalıştırır;
                # bu birim testte handler'lar mock olduğundan güvenlik yedeğini de
                # mock'layarak izole ediyoruz (davranış: full restore'da alınır).
                safety_artifact = mock.Mock(id=99999, filename='safety.zip', size_bytes=1)
                with mock.patch('apps.yedekleme.engine.orchestrator.get_handler', side_effect=_get), \
                        mock.patch.object(
                            BackupEngine, 'create_backup',
                            return_value=(safety_artifact, mock.Mock()),
                        ) as mock_create:
                    result = engine.restore(artifact, confirm='RESTORE')

                self.assertTrue(result['restored'])
                self.assertTrue(result['full_database_restored'])
                self.assertIn('test.tbl', result['skipped_table_resources'])
                mock_full.restore.assert_called_once()
                mock_table.restore.assert_not_called()
                # Güvenlik yedeği tam DB restore'da alınmalı
                mock_create.assert_called_once()
                self.assertEqual(result['safety_backup']['artifact_id'], 99999)
                # Eski format yedekler (excludes_session_table meta'sı yok) django_session'ı
                # da içerir → --clean aktif oturumları siler, relogin zorunlu kalmalı.
                self.assertTrue(result['relogin_required'])

    def test_relogin_not_required_when_session_table_excluded(self):
        """Yeni format yedekler (database_full.export excludes_session_table=True
        işaretler) django_session'a dokunmaz; restore sonrası relogin gerekmez."""
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
                engine = BackupEngine()
                work = Path(td) / 'craft'
                payload = work / 'payload'
                (payload / 'system_database').mkdir(parents=True)
                (payload / 'system_database' / 'meta.json').write_text(
                    '{"excludes_session_table": true}', encoding='utf-8'
                )
                manifest = {
                    'version': '2.0',
                    'resources': [
                        {
                            'code': 'system.database',
                            'handler': 'database_full',
                            'priority': 10,
                            'restorable': True,
                            'config': {},
                            'meta': {'excludes_session_table': True},
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
                zip_path = Path(td) / 'fake2.zip'
                create_zip(work, zip_path)
                storage_key = 'fake2/fake2.zip'
                dest = Path(td) / storage_key
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(zip_path.read_bytes())

                artifact = BackupArtifact.objects.create(
                    filename='fake2.zip',
                    storage_key=storage_key,
                    size_bytes=dest.stat().st_size,
                    checksum=sha256_file(dest),
                    status=BackupStatus.COMPLETED,
                    kind=BackupKind.FULL,
                    resource_codes=['system.database'],
                    manifest=manifest,
                    format_version='2.0',
                )

                mock_full = mock.Mock()
                mock_full.restore.return_value = mock.Mock(ok=True, message='ok', meta={})
                from apps.yedekleme.engine.handlers import get_handler as real_get

                def _get(key):
                    return mock_full if key == 'database_full' else real_get(key)

                safety_artifact = mock.Mock(id=88888, filename='safety2.zip', size_bytes=1)
                with mock.patch('apps.yedekleme.engine.orchestrator.get_handler', side_effect=_get), \
                        mock.patch.object(
                            BackupEngine, 'create_backup',
                            return_value=(safety_artifact, mock.Mock()),
                        ):
                    result = engine.restore(artifact, confirm='RESTORE')

                self.assertTrue(result['restored'])
                self.assertTrue(result['full_database_restored'])
                self.assertFalse(result['relogin_required'])

    def test_clear_stale_running_snapshot_preserves_known_good(self):
        """Restore'un kendi bilinen-doğru job/artifact'leri FAILED'e çevrilmemeli;
        snapshot'tan gelen alakasız RUNNING kayıtlar temizlenmeli."""
        good_artifact = BackupArtifact.objects.create(
            filename='good.zip', storage_key='good/good.zip', status=BackupStatus.RUNNING,
            kind=BackupKind.FULL,
        )
        good_job = BackupJob.objects.create(
            artifact=good_artifact, action=BackupOperationAction.RESTORE,
            status=BackupStatus.RUNNING,
        )
        stale_artifact = BackupArtifact.objects.create(
            filename='stale.zip', storage_key='stale/stale.zip', status=BackupStatus.RUNNING,
            kind=BackupKind.FULL,
        )
        stale_job = BackupJob.objects.create(
            artifact=stale_artifact, action=BackupOperationAction.CREATE,
            status=BackupStatus.RUNNING,
        )

        engine = BackupEngine()
        engine._clear_stale_running_snapshot(
            keep_job_ids={good_job.pk}, keep_artifact_ids={good_artifact.pk},
        )

        good_job.refresh_from_db()
        good_artifact.refresh_from_db()
        stale_job.refresh_from_db()
        stale_artifact.refresh_from_db()

        self.assertEqual(good_job.status, BackupStatus.RUNNING)
        self.assertEqual(good_artifact.status, BackupStatus.RUNNING)
        self.assertEqual(stale_job.status, BackupStatus.FAILED)
        self.assertEqual(stale_artifact.status, BackupStatus.FAILED)

    def test_reinstate_after_full_restore_reinserts_missing_row(self):
        """Restore snapshot'ı bir job/artifact satırını DROP edip kaybettiyse
        (yedek anında yoktu), bellekteki nesne aynı PK ile geri yazılmalı."""
        artifact = BackupArtifact.objects.create(
            filename='r.zip', storage_key='r/r.zip', status=BackupStatus.COMPLETED,
            kind=BackupKind.FULL,
        )
        job = BackupJob.objects.create(
            artifact=artifact, action=BackupOperationAction.RESTORE,
            status=BackupStatus.COMPLETED, progress=100, message='tamam',
        )
        job_pk = job.pk
        # Restore'un tablo DROP+CREATE'ini simüle et: satırı DB'den sil (bellekteki
        # Python nesnesi hâlâ doğru veriyi tutuyor).
        BackupJob.objects.filter(pk=job_pk).delete()
        self.assertFalse(BackupJob.objects.filter(pk=job_pk).exists())

        BackupEngine()._reinstate_after_full_restore(artifact, job)

        restored = BackupJob.objects.get(pk=job_pk)
        self.assertEqual(restored.status, BackupStatus.COMPLETED)
        self.assertEqual(restored.message, 'tamam')


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

    def test_restore_full_db_api_returns_relogin_required(self):
        self.user.is_superuser = True
        self.user.save()
        self.client.force_login(self.user)
        artifact = BackupArtifact.objects.create(
            filename='restore-test.zip',
            storage_key='restore-test/restore-test.zip',
            size_bytes=1,
            checksum='abc',
            status=BackupStatus.COMPLETED,
            kind=BackupKind.FULL,
            resource_codes=['system.database'],
            manifest={'resources': [{'code': 'system.database', 'handler': 'database_full'}]},
            format_version='2.0',
        )
        restore_payload = {
            'restored': True,
            'full_database_restored': True,
            'relogin_required': True,
            'results': [{'code': 'system.database', 'ok': True, 'message': 'ok'}],
            'duration_ms': 10,
            'job_id': 1,
        }
        with mock.patch('apps.yedekleme.interfaces.views._restore_worker') as mock_worker:
            with mock.patch.object(BackupEngine, 'create_restore_job') as mock_create_job:
                job = BackupJob.objects.create(
                    artifact=artifact,
                    action=BackupOperationAction.RESTORE,
                    status=BackupStatus.RUNNING,
                )
                mock_create_job.return_value = job
                res = self.client.post(
                    f'/yedekleme/api/backups/{artifact.id}/restore/',
                    data=json.dumps({'confirm': 'RESTORE'}),
                    content_type='application/json',
                )
        self.assertEqual(res.status_code, 202, res.content)
        body = res.json()
        self.assertTrue(body.get('accepted'))
        self.assertEqual(body['job']['id'], job.id)
        mock_worker.assert_called_once()

    def test_pre_restore_does_not_block_on_recent_running_create(self):
        from django.utils import timezone

        art = BackupArtifact.objects.create(
            filename='live.zip',
            storage_key='live/live.zip',
            size_bytes=1,
            checksum='x',
            status=BackupStatus.RUNNING,
            kind=BackupKind.FULL,
            started_at=timezone.now(),
        )
        BackupJob.objects.create(
            artifact=art,
            action=BackupOperationAction.CREATE,
            status=BackupStatus.RUNNING,
            started_at=timezone.now(),
        )
        engine = BackupEngine()
        with mock.patch('apps.yedekleme.engine.orchestrator.resolve_resources') as mock_res:
            mock_resource = mock.Mock()
            mock_resource.code = 'x'
            mock_res.return_value = [mock_resource]
            with mock.patch.object(engine, '_preflight_disk_check', return_value='Yetersiz disk alanı'):
                with self.assertRaises(RuntimeError) as ctx:
                    engine.create_backup(kind=BackupKind.DATABASE, trigger=BackupTrigger.PRE_RESTORE)
                self.assertNotIn('devam eden', str(ctx.exception))
        with self.assertRaises(RuntimeError) as ctx:
            engine.create_backup(kind=BackupKind.DATABASE, trigger=BackupTrigger.MANUAL)
        self.assertIn('devam eden', str(ctx.exception))

    def test_fail_stale_running_jobs_clears_old_create(self):
        from datetime import timedelta
        from django.utils import timezone

        old = timezone.now() - timedelta(hours=2)
        art = BackupArtifact.objects.create(
            filename='old.zip',
            storage_key='old/old.zip',
            size_bytes=1,
            checksum='x',
            status=BackupStatus.RUNNING,
            kind=BackupKind.FULL,
        )
        BackupJob.objects.create(
            artifact=art,
            action=BackupOperationAction.CREATE,
            status=BackupStatus.RUNNING,
        )
        BackupJob.objects.filter(artifact=art).update(started_at=old)
        BackupArtifact.objects.filter(pk=art.pk).update(started_at=old)
        cleaned = BackupEngine().fail_stale_running_jobs(max_age_minutes=30)
        self.assertEqual(cleaned, 1)
        self.assertFalse(BackupJob.objects.filter(status=BackupStatus.RUNNING).exists())

    def test_cancel_job_marks_running_as_cancelled(self):
        art = BackupArtifact.objects.create(
            filename='cancel-me.zip',
            storage_key='cancel/cancel-me.zip',
            size_bytes=1,
            checksum='x',
            status=BackupStatus.RUNNING,
            kind=BackupKind.DATABASE,
        )
        job = BackupJob.objects.create(
            artifact=art,
            action=BackupOperationAction.CREATE,
            status=BackupStatus.RUNNING,
            phase='exporting',
            progress=10,
            message='Kaynak dışa aktarılıyor: system.database',
        )
        result = BackupEngine().cancel_job(job, reason='Test iptal')
        self.assertTrue(result['cancelled'])
        job.refresh_from_db()
        art.refresh_from_db()
        self.assertEqual(job.status, BackupStatus.CANCELLED)
        self.assertEqual(art.status, BackupStatus.FAILED)


class TenantScopedBackupTests(TransactionTestCase):
    """Kurum-bazlı yedek: yalnızca hedef kurumun verisi export/restore edilir;
    diğer kurumların verisi ASLA silinmez."""

    def _log(self):
        class _L:
            def info(self, *a, **k):
                pass

            def error(self, *a, **k):
                pass
        return _L()

    def _resource(self, config):
        class _R:
            code = 'test.tenant'
        r = _R()
        r.config = config
        return r

    def test_tenant_export_restore_isolates_other_kurum(self):
        from django.db import connection

        handler = DatabaseTableHandler()
        with connection.cursor() as cur:
            cur.execute('DROP TABLE IF EXISTS _tenant_test')
            cur.execute(
                'CREATE TABLE _tenant_test (id serial PRIMARY KEY, kurum_id int, val text)'
            )
            cur.execute("INSERT INTO _tenant_test (id, kurum_id, val) VALUES "
                        "(1, 10, 'a10'), (2, 10, 'b10'), (3, 20, 'a20'), (4, 20, 'b20')")
        try:
            with tempfile.TemporaryDirectory() as td:
                work = Path(td) / 'payload'
                # Kurum 10 kapsamlı export
                res_export = self._resource({'tables': ['_tenant_test'], '__tenant__': {'kurum_id': 10}})
                result = handler.export(res_export, work, self._log())
                # Yalnızca kurum 10 satırları export edilmeli
                jsonl = (work / '_tenant_test.jsonl').read_text(encoding='utf-8').strip().splitlines()
                self.assertEqual(len(jsonl), 2)

                # Kurum 10 satırlarını boz/sil, kurum 20 dursun
                from django.db import connection as c2
                with c2.cursor() as cur:
                    cur.execute("DELETE FROM _tenant_test WHERE kurum_id = 10")
                    cur.execute("UPDATE _tenant_test SET val = 'MODIFIED' WHERE kurum_id = 20")

                # Restore (kurum kapsamlı): kurum 10 geri gelmeli, kurum 20 DOKUNULMAMALI
                res_restore = self._resource({'tables': ['_tenant_test']})
                rr = handler.restore(res_restore, work, dry_run=False)
                self.assertTrue(rr.ok, rr.message)

                with c2.cursor() as cur:
                    cur.execute("SELECT kurum_id, val FROM _tenant_test ORDER BY id")
                    rows = cur.fetchall()
                # kurum 10: a10,b10 geri geldi; kurum 20: MODIFIED (restore silmedi/ezmedi)
                as_map = {(r[0], r[1]) for r in rows}
                self.assertIn((10, 'a10'), as_map)
                self.assertIn((10, 'b10'), as_map)
                self.assertIn((20, 'MODIFIED'), as_map)
                # kurum 20 hâlâ 2 satır olmalı
                self.assertEqual(sum(1 for r in rows if r[0] == 20), 2)
        finally:
            with connection.cursor() as cur:
                cur.execute('DROP TABLE IF EXISTS _tenant_test')
