"""Mesaj kuyruğu izleme, arşiv ve yeniden deneme."""
from __future__ import annotations

import re
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, F, Q
from django.utils import timezone

from apps.communication.application.dashboard_service import SOURCE_LABELS
from apps.communication.domain.enums import MessageStatus
from apps.communication.domain.models import CommunicationChannelConfig, OutboundQueueItem

LIVE_FAILED_DAYS = 14
ACTIVE_STATUSES = (MessageStatus.PENDING, MessageStatus.SENDING)
_ERROR_ID = re.compile(r'\b[0-9a-f-]{8,}\b', re.I)


def _base_qs(kurum_id: int, sube_id: int | None):
    qs = OutboundQueueItem.objects.filter(kurum_id=kurum_id).select_related(
        'message',
        'message__conversation',
        'campaign',
        'campaign__channel_config',
    )
    if sube_id is not None:
        qs = qs.filter(
            Q(message__conversation__sube_id=sube_id) | Q(campaign__sube_id=sube_id)
        )
    return qs


def _error_key(text: str) -> str:
    raw = (text or '').strip() or 'Bilinmeyen hata'
    return _ERROR_ID.sub('#', raw)[:96]


def _channel_info(item: OutboundQueueItem) -> tuple[str | None, str]:
    campaign = item.campaign
    cfg = getattr(campaign, 'channel_config', None) if campaign else None
    if cfg:
        return str(cfg.id), cfg.name or cfg.display_phone or ''
    opts = item.send_options or {}
    raw_id = opts.get('channel_config_id')
    if raw_id:
        acc = CommunicationChannelConfig.objects.filter(id=raw_id).first()
        if acc:
            return str(acc.id), acc.name or acc.display_phone or ''
        return str(raw_id), ''
    return None, ''


def serialize_queue_item(item: OutboundQueueItem) -> dict:
    msg = item.message
    conv = getattr(msg, 'conversation', None)
    campaign = item.campaign
    channel_id, channel_name = _channel_info(item)
    status = msg.status if msg else None
    error = item.last_error or (msg.failed_reason if msg else '')
    source = (msg.source_module if msg else '') or ''
    return {
        'id': str(item.id),
        'message_id': str(msg.id) if msg else None,
        'conversation_id': str(conv.id) if conv else None,
        'status': status,
        'attempt_count': item.attempt_count,
        'max_attempts': item.max_attempts,
        'next_attempt_at': item.next_attempt_at.isoformat() if item.next_attempt_at else None,
        'last_error': error,
        'error_key': _error_key(error),
        'campaign_id': str(campaign.id) if campaign else None,
        'campaign_title': campaign.title if campaign else '',
        'channel_config_id': channel_id,
        'channel_config_name': channel_name,
        'contact_phone': conv.contact_phone if conv else '',
        'contact_name': (conv.contact_name if conv else '') or '',
        'source_module': source,
        'source_label': SOURCE_LABELS.get(source, source or 'Manuel'),
        'body_preview': (msg.body or '')[:120] if msg else '',
        'created_at': item.created_at.isoformat() if item.created_at else None,
        'updated_at': item.updated_at.isoformat() if item.updated_at else None,
        'can_retry': status == MessageStatus.FAILED,
        'can_cancel': status in (MessageStatus.PENDING, MessageStatus.SENDING),
    }


def _apply_scope(qs, scope: str, cutoff):
    if scope == 'archive':
        return qs.filter(message__status=MessageStatus.FAILED, created_at__lt=cutoff)
    if scope == 'all':
        return qs
    return qs.filter(
        Q(message__status__in=ACTIVE_STATUSES)
        | Q(message__status=MessageStatus.FAILED, created_at__gte=cutoff)
    )


def list_outbound_queue(
    kurum_id: int,
    sube_id: int | None = None,
    *,
    scope: str = 'live',
    status: str = '',
    campaign_id: str = '',
    account_id: str = '',
    query: str = '',
    error_key: str = '',
    page: int = 1,
    page_size: int = 50,
    live_days: int = LIVE_FAILED_DAYS,
) -> dict:
    now = timezone.now()
    days = max(1, min(int(live_days or LIVE_FAILED_DAYS), 90))
    cutoff = now - timedelta(days=days)
    qs = _base_qs(kurum_id, sube_id)
    scoped = _apply_scope(qs, scope, cutoff)

    if status:
        scoped = scoped.filter(message__status=status)
    if campaign_id:
        scoped = scoped.filter(campaign_id=campaign_id)
    if account_id:
        scoped = scoped.filter(
            Q(campaign__channel_config_id=account_id)
            | Q(send_options__channel_config_id=account_id)
        )
    if query:
        scoped = scoped.filter(
            Q(message__conversation__contact_phone__icontains=query)
            | Q(message__conversation__contact_name__icontains=query)
            | Q(last_error__icontains=query)
            | Q(message__failed_reason__icontains=query)
            | Q(message__body__icontains=query)
        )
    if error_key:
        scoped = scoped.filter(
            Q(last_error__icontains=error_key) | Q(message__failed_reason__icontains=error_key)
        )

    total = scoped.count()
    start = (page - 1) * page_size
    items = [serialize_queue_item(item) for item in scoped.order_by('-created_at')[start:start + page_size]]

    counts_qs = _base_qs(kurum_id, sube_id)
    status_counts = {
        'pending': counts_qs.filter(message__status=MessageStatus.PENDING).count(),
        'sending': counts_qs.filter(message__status=MessageStatus.SENDING).count(),
        'failed_live': counts_qs.filter(
            message__status=MessageStatus.FAILED, created_at__gte=cutoff,
        ).count(),
        'failed_archive': counts_qs.filter(
            message__status=MessageStatus.FAILED, created_at__lt=cutoff,
        ).count(),
        'retrying': counts_qs.filter(
            message__status=MessageStatus.PENDING, attempt_count__gt=0,
        ).count(),
    }
    status_counts['failed'] = status_counts['failed_live'] + status_counts['failed_archive']

    error_rows = (
        _apply_scope(counts_qs, 'live' if scope != 'all' else 'all', cutoff)
        .filter(message__status=MessageStatus.FAILED)
        .exclude(last_error='')
        .values('last_error')
        .annotate(count=Count('id'))
        .order_by('-count')[:8]
    )
    error_groups = []
    for row in error_rows:
        key = _error_key(row['last_error'])
        existing = next((g for g in error_groups if g['key'] == key), None)
        if existing:
            existing['count'] += row['count']
        else:
            error_groups.append({'key': key, 'label': key, 'count': row['count']})

    oldest = (
        counts_qs.filter(message__status=MessageStatus.PENDING)
        .order_by('created_at')
        .values_list('created_at', flat=True)
        .first()
    )
    oldest_wait_minutes = None
    if oldest:
        oldest_wait_minutes = max(0, int((now - oldest).total_seconds() // 60))

    return {
        'items': items,
        'total': total,
        'page': page,
        'page_size': page_size,
        'scope': scope,
        'live_days': days,
        'status_counts': status_counts,
        'error_groups': error_groups,
        'oldest_wait_minutes': oldest_wait_minutes,
        'generated_at': now.isoformat(),
        'refresh_seconds': 15,
    }


def _locked_item(kurum_id: int, item_id, sube_id: int | None = None) -> OutboundQueueItem | None:
    found = _base_qs(kurum_id, sube_id).filter(id=item_id).first()
    if not found:
        return None
    return (
        OutboundQueueItem.objects
        .select_for_update()
        .select_related('message')
        .get(pk=found.pk)
    )


@transaction.atomic
def retry_queue_item(kurum_id: int, item_id, sube_id: int | None = None) -> OutboundQueueItem:
    item = _locked_item(kurum_id, item_id, sube_id)
    if not item:
        raise ValueError('Kuyruk kaydı bulunamadı.')
    msg = item.message
    if msg.status not in (MessageStatus.FAILED, MessageStatus.PENDING):
        raise ValueError('Yalnızca bekleyen veya başarısız kayıt yeniden denenir.')
    item.attempt_count = 0
    item.last_error = ''
    item.locked_at = None
    item.next_attempt_at = timezone.now()
    item.save(update_fields=['attempt_count', 'last_error', 'locked_at', 'next_attempt_at', 'updated_at'])
    msg.status = MessageStatus.PENDING
    msg.failed_reason = ''
    msg.save(update_fields=['status', 'failed_reason', 'updated_at'])
    return item


@transaction.atomic
def cancel_queue_item(kurum_id: int, item_id, sube_id: int | None = None) -> None:
    item = _locked_item(kurum_id, item_id, sube_id)
    if not item:
        raise ValueError('Kuyruk kaydı bulunamadı.')
    if item.message.status not in (MessageStatus.PENDING, MessageStatus.SENDING):
        raise ValueError('Yalnızca bekleyen gönderim iptal edilir.')
    msg = item.message
    msg.status = MessageStatus.CANCELLED
    msg.save(update_fields=['status', 'updated_at'])
    item.delete()


def archive_old_failures(
    kurum_id: int,
    sube_id: int | None = None,
    *,
    days: int = LIVE_FAILED_DAYS,
) -> int:
    """Tükenmiş eski hataları kuyruktan çıkarır; mesaj kaydı durur."""
    cutoff = timezone.now() - timedelta(days=max(1, min(int(days), 90)))
    qs = _base_qs(kurum_id, sube_id).filter(
        message__status=MessageStatus.FAILED,
        created_at__lt=cutoff,
    )
    deleted, _ = qs.delete()
    return deleted
