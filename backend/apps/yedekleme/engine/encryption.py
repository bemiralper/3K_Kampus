"""AES-256-GCM şifreleme (cryptography)."""

from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path

from django.conf import settings


class EncryptionError(Exception):
    pass


def encryption_key_available() -> bool:
    return bool(os.environ.get('BACKUP_ENCRYPTION_KEY') or getattr(settings, 'BACKUP_ENCRYPTION_KEY', None))


def _raw_key() -> bytes:
    raw = os.environ.get('BACKUP_ENCRYPTION_KEY') or getattr(settings, 'BACKUP_ENCRYPTION_KEY', None)
    if not raw:
        raise EncryptionError('BACKUP_ENCRYPTION_KEY tanımlı değil')
    if isinstance(raw, bytes):
        data = raw
    else:
        text = str(raw).strip()
        try:
            data = base64.b64decode(text)
        except Exception:
            data = text.encode('utf-8')
    if len(data) == 32:
        return data
    # Derive 32 bytes via SHA-256 if user provided passphrase
    return hashlib.sha256(data).digest()


def key_fingerprint() -> str | None:
    if not encryption_key_available():
        return None
    return hashlib.sha256(_raw_key()).hexdigest()[:16]


def encrypt_file(src: Path, dest: Path) -> None:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = _raw_key()
    nonce = os.urandom(12)
    aes = AESGCM(key)
    plaintext = src.read_bytes()
    ciphertext = aes.encrypt(nonce, plaintext, None)
    dest.write_bytes(nonce + ciphertext)


def decrypt_file(src: Path, dest: Path) -> None:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = _raw_key()
    data = src.read_bytes()
    if len(data) < 13:
        raise EncryptionError('Şifreli dosya bozuk veya çok kısa')
    nonce, ciphertext = data[:12], data[12:]
    aes = AESGCM(key)
    try:
        plaintext = aes.decrypt(nonce, ciphertext, None)
    except Exception as exc:  # noqa: BLE001
        raise EncryptionError(f'Şifre çözme başarısız: {exc}') from exc
    dest.write_bytes(plaintext)
