"""Kısa ömürlü HMAC print token — headless PDF render için."""
from __future__ import annotations

import hashlib
import hmac
import time

from django.conf import settings

DEFAULT_TTL_SECONDS = 300

DOC_PLAN = 'plan'
DOC_MAKBUZ = 'makbuz'
DOC_SOZLESME = 'sozlesme'


def create_print_token(
    entity_id: int,
    kurum_id: int,
    doc_type: str,
    *,
    ttl: int = DEFAULT_TTL_SECONDS,
) -> str:
    exp = int(time.time()) + ttl
    payload = f'{entity_id}:{kurum_id}:{doc_type}:{exp}'
    sig = hmac.new(
        settings.SECRET_KEY.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f'{payload}:{sig}'


def validate_print_token(token: str) -> dict | None:
    if not token or not isinstance(token, str):
        return None
    parts = token.split(':')
    if len(parts) != 5:
        return None
    entity_id, kurum_id, doc_type, exp, sig = parts
    try:
        exp_int = int(exp)
        entity_id_int = int(entity_id)
        kurum_id_int = int(kurum_id)
    except ValueError:
        return None
    if exp_int < time.time():
        return None
    payload = f'{entity_id}:{kurum_id}:{doc_type}:{exp}'
    expected = hmac.new(
        settings.SECRET_KEY.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    return {
        'entity_id': entity_id_int,
        'kurum_id': kurum_id_int,
        'doc_type': doc_type,
    }
