"""
Access token Fernet encryption for CommunicationChannelConfig.
"""
from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _get_fernet():
    key = getattr(settings, 'COMMUNICATION_TOKEN_ENCRYPTION_KEY', '') or ''
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet
    except ImportError:
        logger.warning('cryptography package missing — tokens stored as plaintext')
        return None
    return Fernet(key.encode('utf-8') if isinstance(key, str) else key)


def encrypt_access_token(plaintext: str) -> str:
    if not plaintext:
        return ''
    fernet = _get_fernet()
    if not fernet:
        return plaintext
    return fernet.encrypt(plaintext.encode('utf-8')).decode('utf-8')


def decrypt_access_token(stored: str) -> str:
    if not stored:
        return ''
    fernet = _get_fernet()
    if not fernet:
        return stored
    try:
        return fernet.decrypt(stored.encode('utf-8')).decode('utf-8')
    except Exception:
        # Backward compatibility: legacy plaintext tokens
        return stored
