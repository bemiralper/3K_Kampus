"""Olay bazlı otomatik bildirim zamanlaması."""
from __future__ import annotations

import logging
from datetime import datetime, time
from typing import Any

from django.db import DatabaseError
from django.utils import timezone

from apps.communication.application.notification_events import get_event
from apps.communication.domain.models import NotificationAutoSchedule

logger = logging.getLogger(__name__)

GUN_SONU_EVENT = 'finans.gun_sonu'
DEFAULT_SEND_TIME = time(18, 0)
SCHEDULABLE_EVENTS = frozenset({GUN_SONU_EVENT})
REPORT_KINDS = frozenset({'ozet', 'detay', 'ikisi'})
DEFAULT_REPORT_KINDS = 'ozet'


class NotificationScheduleError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _parse_send_time(value) -> time:
    if isinstance(value, time):
        return value
    raw = (value or '').strip()
    if not raw:
        return DEFAULT_SEND_TIME
    for fmt in ('%H:%M', '%H:%M:%S'):
        try:
            return datetime.strptime(raw, fmt).time()
        except ValueError:
            continue
    raise NotificationScheduleError('Gönderim saati HH:MM formatında olmalı.')


def _find(kurum_id: int, event_key: str, sube_id: int | None):
    qs = NotificationAutoSchedule.objects.filter(kurum_id=kurum_id, event_key=event_key)
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    else:
        qs = qs.filter(sube__isnull=True)
    return qs.first()


def normalize_report_kinds(value) -> str:
    raw = (value or '').strip().lower()
    if raw in REPORT_KINDS:
        return raw
    return DEFAULT_REPORT_KINDS


def report_kind_tuple(value) -> tuple[str, ...]:
    kind = normalize_report_kinds(value)
    if kind == 'detay':
        return ('detay',)
    if kind == 'ikisi':
        return ('ozet', 'detay')
    return ('ozet',)


def serialize_schedule(row: NotificationAutoSchedule | None, *, event_key: str) -> dict[str, Any]:
    if row is None:
        return {
            'event_key': event_key,
            'is_enabled': False,
            'send_time': DEFAULT_SEND_TIME.strftime('%H:%M'),
            'report_kinds': DEFAULT_REPORT_KINDS,
            'last_sent_on': None,
        }
    return {
        'event_key': row.event_key,
        'is_enabled': row.is_enabled,
        'send_time': row.send_time.strftime('%H:%M') if row.send_time else '18:00',
        'report_kinds': normalize_report_kinds(getattr(row, 'report_kinds', None)),
        'last_sent_on': row.last_sent_on.isoformat() if row.last_sent_on else None,
    }


def get_schedule(kurum_id: int, event_key: str, sube_id: int | None = None) -> dict[str, Any]:
    if get_event(event_key) is None:
        raise NotificationScheduleError(f'Tanımsız bildirim olayı: {event_key}')
    try:
        row = _find(kurum_id, event_key, sube_id)
        if row is None and sube_id:
            row = _find(kurum_id, event_key, None)
    except DatabaseError:
        logger.exception('Bildirim zamanlama tablosu okunamadı')
        row = None
    return serialize_schedule(row, event_key=event_key)


def upsert_schedule(
    kurum_id: int,
    event_key: str,
    *,
    is_enabled: bool,
    send_time=None,
    report_kinds=None,
    sube_id: int | None = None,
    user=None,
) -> dict[str, Any]:
    if event_key not in SCHEDULABLE_EVENTS:
        raise NotificationScheduleError('Bu olay için otomatik saat ayarlanamaz.')
    if get_event(event_key) is None:
        raise NotificationScheduleError(f'Tanımsız bildirim olayı: {event_key}')

    parsed = _parse_send_time(send_time)
    kinds = (
        None if report_kinds is None else normalize_report_kinds(report_kinds)
    )
    row = _find(kurum_id, event_key, sube_id)
    if row is None:
        row = NotificationAutoSchedule(
            kurum_id=kurum_id,
            sube_id=sube_id,
            event_key=event_key,
        )
    row.is_enabled = bool(is_enabled)
    row.send_time = parsed
    if kinds is not None:
        row.report_kinds = kinds
    elif not getattr(row, 'report_kinds', None):
        row.report_kinds = DEFAULT_REPORT_KINDS
    row.updated_by = user
    row.save()
    return serialize_schedule(row, event_key=event_key)


def is_auto_enabled(kurum_id: int, event_key: str, sube_id: int | None = None) -> bool:
    return bool(get_schedule(kurum_id, event_key, sube_id).get('is_enabled'))


def auto_blocks_report(schedule: dict, rapor_tipi: str) -> bool:
    if not schedule.get('is_enabled'):
        return False
    return rapor_tipi in report_kind_tuple(schedule.get('report_kinds'))


def due_schedules(*, event_key: str = GUN_SONU_EVENT, now=None):
    now = now or timezone.localtime()
    today = now.date()
    current = now.time().replace(second=0, microsecond=0)
    qs = NotificationAutoSchedule.objects.filter(is_enabled=True, event_key=event_key)
    for row in qs.select_related('kurum', 'sube'):
        if row.last_sent_on == today:
            continue
        send_at = (row.send_time or DEFAULT_SEND_TIME).replace(second=0, microsecond=0)
        if current < send_at:
            continue
        yield row


def mark_sent(row: NotificationAutoSchedule, on_date=None) -> None:
    row.last_sent_on = on_date or timezone.localdate()
    row.save(update_fields=['last_sent_on', 'updated_at'])
