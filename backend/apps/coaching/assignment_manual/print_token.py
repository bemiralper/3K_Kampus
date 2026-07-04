"""Kısa ömürlü HMAC print token — headless PDF render için."""
from __future__ import annotations

import hashlib
import hmac
import time

from django.conf import settings

DEFAULT_TTL_SECONDS = 300


def create_print_token(
    assignment_id: int,
    kurum_id: int,
    notify_type: str = 'report',
    *,
    ttl: int = DEFAULT_TTL_SECONDS,
) -> str:
    exp = int(time.time()) + ttl
    payload = f'{assignment_id}:{kurum_id}:{notify_type}:{exp}'
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
    assignment_id, kurum_id, notify_type, exp, sig = parts
    try:
        exp_int = int(exp)
        assignment_id_int = int(assignment_id)
        kurum_id_int = int(kurum_id)
    except ValueError:
        return None
    if exp_int < time.time():
        return None
    payload = f'{assignment_id}:{kurum_id}:{notify_type}:{exp}'
    expected = hmac.new(
        settings.SECRET_KEY.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    return {
        'assignment_id': assignment_id_int,
        'kurum_id': kurum_id_int,
        'notify_type': notify_type,
    }
