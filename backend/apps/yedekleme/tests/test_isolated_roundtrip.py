"""Geçici dizin ve ayrı veritabanında gerçek dump, bütünlük, şifre ve geri yükleme.

Django test veritabanına ve 5433 üzerindeki veriye yazılmaz.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from types import SimpleNamespace

import psycopg
from django.db import connection
from django.test import SimpleTestCase, override_settings
from psycopg import sql

from apps.yedekleme.engine.archive import create_zip, extract_zip, sha256_file, verify_checksums, write_checksums
from apps.yedekleme.engine.encryption import EncryptionError, decrypt_file, encrypt_file
from apps.yedekleme.engine.handlers.database_full import DatabaseFullHandler


def _admin_kwargs():
    db = connection.settings_dict
    port = str(db.get('PORT') or '')
    name = str(db.get('NAME') or '')
    if port == '5433':
        raise AssertionError('5433 üretim verisidir')
    if not name.startswith('test_'):
        raise AssertionError(f'izole test veritabanı değil: {name}')
    return dict(
        dbname=name,
        user=db.get('USER') or '',
        password=db.get('PASSWORD') or '',
        host=db.get('HOST') or 'localhost',
        port=int(port or 5432),
    )


class IsolatedBackupRoundtripTests(SimpleTestCase):
    def test_dump_checksum_encrypt_and_restore_on_throwaway_databases(self):
        suffix = f'{os.getpid()}'
        src_name = f'lms_iso_src_{suffix}'
        dst_name = f'lms_iso_dst_{suffix}'
        for name in (src_name, dst_name):
            if not name.startswith('lms_iso_'):
                self.fail(name)
        token = 'lms-iso-roundtrip'
        admin = None
        try:
            admin = psycopg.connect(**_admin_kwargs(), autocommit=True)
        except Exception as exc:
            self.skipTest(f'izole veritabanı bağlantısı açılamadı: {exc}')
        try:
            self._recreate(admin, src_name)
            self._recreate(admin, dst_name)
            base = connection.settings_dict
            src_db = {**base, 'NAME': src_name}
            dst_db = {**base, 'NAME': dst_name}
            with psycopg.connect(dbname=src_name, user=base.get('USER') or '', password=base.get('PASSWORD') or '', host=base.get('HOST') or 'localhost', port=int(base.get('PORT') or 5432), autocommit=True) as src:
                src.execute('CREATE TABLE iso_probe (id int PRIMARY KEY, note text)')
                src.execute('INSERT INTO iso_probe (id, note) VALUES (1, %s)', (token,))
            handler = DatabaseFullHandler()
            log = SimpleNamespace(info=lambda *args, **kwargs: None)
            resource = SimpleNamespace(code='system.database', config={})
            with tempfile.TemporaryDirectory() as td:
                root = Path(td)
                work = root / 'work'
                handler.export(resource, work, log, database=src_db)
                write_checksums(work, [p for p in work.rglob('*') if p.is_file()])
                ok, errors = verify_checksums(work)
                self.assertTrue(ok, errors)
                dump = work / 'database.dump'
                self.assertTrue(dump.exists())
                self.assertGreater(dump.stat().st_size, 0)
                corrupt = root / 'corrupt'
                corrupt.mkdir()
                (corrupt / 'database.dump').write_bytes(dump.read_bytes()[:-1] + b'X')
                write_checksums(corrupt, [corrupt / 'database.dump'])
                (corrupt / 'database.dump').write_bytes(dump.read_bytes())
                bad, bad_errors = verify_checksums(corrupt)
                self.assertFalse(bad)
                self.assertTrue(bad_errors)
                zip_path = root / 'backup.zip'
                create_zip(work, zip_path, compress=True)
                enc_path = root / 'backup.zip.enc'
                with override_settings(BACKUP_ENCRYPTION_KEY='isolated-roundtrip-key'):
                    encrypt_file(zip_path, enc_path)
                    self.assertNotEqual(zip_path.read_bytes()[:8], enc_path.read_bytes()[:8])
                    with self.assertRaises(EncryptionError):
                        with override_settings(BACKUP_ENCRYPTION_KEY='wrong-key'):
                            decrypt_file(enc_path, root / 'wrong.zip')
                    decrypt_file(enc_path, root / 'opened.zip')
                self.assertEqual(sha256_file(zip_path), sha256_file(root / 'opened.zip'))
                extracted = root / 'extracted'
                extract_zip(root / 'opened.zip', extracted)
                ok, errors = verify_checksums(extracted)
                self.assertTrue(ok, errors)
                restored = handler.restore(resource, extracted, database=dst_db)
                self.assertTrue(restored.ok, restored.message)
            with psycopg.connect(dbname=dst_name, user=base.get('USER') or '', password=base.get('PASSWORD') or '', host=base.get('HOST') or 'localhost', port=int(base.get('PORT') or 5432)) as dst:
                row = dst.execute('SELECT note FROM iso_probe WHERE id = 1').fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], token)
            with psycopg.connect(**_admin_kwargs()) as still:
                probe = still.execute("SELECT to_regclass('public.iso_probe')").fetchone()
            self.assertIsNone(probe[0])
        finally:
            if admin is not None:
                for name in (src_name, dst_name):
                    self._drop(admin, name)
                admin.close()

    def _recreate(self, admin, name: str):
        if not name.startswith('lms_iso_'):
            raise AssertionError(name)
        self._drop(admin, name)
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))

    def _drop(self, admin, name: str):
        if not str(name).startswith('lms_iso_'):
            raise AssertionError(name)
        admin.execute(
            'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()',
            (name,),
        )
        admin.execute(sql.SQL('DROP DATABASE IF EXISTS {}').format(sql.Identifier(name)))
