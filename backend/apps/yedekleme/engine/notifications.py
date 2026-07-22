"""Yedekleme e-posta bildirimleri."""

from __future__ import annotations

import logging

from django.conf import settings as dj_settings
from django.core.mail import send_mail

logger = logging.getLogger('yedekleme.notifications')


def smtp_configured() -> bool:
    host = getattr(dj_settings, 'EMAIL_HOST', None)
    user = getattr(dj_settings, 'EMAIL_HOST_USER', None)
    backend = getattr(dj_settings, 'EMAIL_BACKEND', '') or ''
    if 'console' in backend or 'locmem' in backend:
        return bool(host or user)
    return bool(host and user)


def parse_recipients(raw: str | None) -> list[str]:
    return [e.strip() for e in (raw or '').replace(';', ',').split(',') if e.strip()]


def default_from_email() -> str:
    return (
        getattr(dj_settings, 'DEFAULT_FROM_EMAIL', None)
        or getattr(dj_settings, 'EMAIL_HOST_USER', None)
        or 'no-reply@3kkampus'
    )


def send_backup_notification(
    *,
    subject: str,
    body: str,
    recipients: list[str],
    fail_silently: bool = False,
) -> int:
    """SMTP ile mail gönderir; gönderilen alıcı sayısını döner."""
    if not recipients:
        return 0
    if not smtp_configured():
        msg = 'SMTP yapılandırılmadı (EMAIL_HOST / EMAIL_HOST_USER eksik)'
        if fail_silently:
            logger.warning(msg)
            return 0
        raise RuntimeError(msg)
    try:
        return send_mail(subject, body, default_from_email(), recipients, fail_silently=False)
    except Exception:
        if fail_silently:
            logger.warning('Yedek bildirim maili gönderilemedi', exc_info=True)
            return 0
        raise
