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


# Akış (streaming) formatı — büyük dosyaları belleğe almadan şifreler.
# Her parça: [12 bayt nonce][4 bayt BE ciphertext_len][ciphertext+tag].
# Parça indeksi AAD olarak kullanılır (yeniden sıralama/oynama koruması);
# sonda 0-uzunluklu bir sonlandırıcı parça yazılır (truncation tespiti).
_STREAM_MAGIC = b'3KBKENC1'
_STREAM_CHUNK = 4 * 1024 * 1024  # 4 MiB düz metin


def encrypt_file(src: Path, dest: Path) -> None:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = _raw_key()
    aes = AESGCM(key)
    with src.open('rb') as fin, dest.open('wb') as fout:
        fout.write(_STREAM_MAGIC)
        index = 0
        while True:
            chunk = fin.read(_STREAM_CHUNK)
            aad = index.to_bytes(8, 'big')
            nonce = os.urandom(12)
            ciphertext = aes.encrypt(nonce, chunk, aad)
            fout.write(nonce)
            fout.write(len(ciphertext).to_bytes(4, 'big'))
            fout.write(ciphertext)
            index += 1
            if not chunk:
                # 0-uzunluklu son parça = EOF işareti
                break


def _decrypt_stream(fin, fout, aes) -> None:
    index = 0
    saw_terminator = False
    while True:
        nonce = fin.read(12)
        if not nonce:
            break
        if len(nonce) != 12:
            raise EncryptionError('Şifreli dosya bozuk (nonce eksik)')
        length_raw = fin.read(4)
        if len(length_raw) != 4:
            raise EncryptionError('Şifreli dosya bozuk (uzunluk eksik)')
        length = int.from_bytes(length_raw, 'big')
        ciphertext = fin.read(length)
        if len(ciphertext) != length:
            raise EncryptionError('Şifreli dosya bozuk (parça eksik/kesik)')
        aad = index.to_bytes(8, 'big')
        try:
            plaintext = aes.decrypt(nonce, ciphertext, aad)
        except Exception as exc:  # noqa: BLE001
            raise EncryptionError(f'Şifre çözme başarısız: {exc}') from exc
        if not plaintext:
            saw_terminator = True
            break
        fout.write(plaintext)
        index += 1
    if not saw_terminator:
        raise EncryptionError('Şifreli dosya eksik (sonlandırıcı parça yok — truncation)')


def decrypt_file(src: Path, dest: Path) -> None:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = _raw_key()
    aes = AESGCM(key)
    with src.open('rb') as fin:
        magic = fin.read(len(_STREAM_MAGIC))
        if magic == _STREAM_MAGIC:
            with dest.open('wb') as fout:
                _decrypt_stream(fin, fout, aes)
            return
        # Geriye dönük uyum: eski tek-atış format (nonce[12] + ciphertext).
        fin.seek(0)
        data = fin.read()
    if len(data) < 13:
        raise EncryptionError('Şifreli dosya bozuk veya çok kısa')
    nonce, ciphertext = data[:12], data[12:]
    try:
        plaintext = aes.decrypt(nonce, ciphertext, None)
    except Exception as exc:  # noqa: BLE001
        raise EncryptionError(f'Şifre çözme başarısız: {exc}') from exc
    dest.write_bytes(plaintext)
