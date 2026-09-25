"""Mesaj kuyruğu izleme, arşiv ve yeniden deneme."""
from __future__ import annotations

import re
from datetime import timedelta

from django.db import transaction
from django.db.models import Count, F, Q
from django.utils import timezone

from apps.communication.application.dashboard_service import SOURCE_LABELS
from apps.communication.application.delivery_error import explain_delivery_failure
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
    error = explain_delivery_failure(item.last_error or (msg.failed_reason if msg else ''))
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
        # Mesaj gövdesinde arama (indexsiz, geniş metin) kaldırıldı (M-05); kişi/telefon/hata yeterli
        scoped = scoped.filter(
            Q(message__conversation__contact_phone__icontains=query)
            | Q(message__conversation__contact_name__icontains=query)
            | Q(last_error__icontains=query)
            | Q(message__failed_reason__icontains=query)
        )
    if error_key:
        scoped = scoped.filter(
            Q(last_error__icontains=error_key) | Q(message__failed_reason__icontains=error_key)
        )

    total = scoped.count()
    start = (page - 1) * page_size
    items = [serialize_queue_item(item) for item in scoped.order_by('-created_at')[start:start + page_size]]

    counts_qs = _base_qs(kurum_id, sube_id)
    # 5 ayrı COUNT yerine tek aggregate (M-05); 15 sn'lik yoklamada DB yükü 1/5
    agg = counts_qs.aggregate(
        pending=Count('id', filter=Q(message__status=MessageStatus.PENDING)),
        sending=Count('id', filter=Q(message__status=MessageStatus.SENDING)),
        failed_live=Count('id', filter=Q(message__status=MessageStatus.FAILED, created_at__gte=cutoff)),
        failed_archive=Count('id', filter=Q(message__status=MessageStatus.FAILED, created_at__lt=cutoff)),
        retrying=Count('id', filter=Q(message__status=MessageStatus.PENDING, attempt_count__gt=0)),
    )
    status_counts = {k: int(v or 0) for k, v in agg.items()}
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
        .select_for_update(of=('self',))
        .select_related('message', 'campaign')
        .get(pk=found.pk)
    )


def _assert_can_touch(item: OutboundQueueItem, user) -> None:
    """Kuyruk kaydına müdahale: kampanyayı açan / mesajı gönderen kişi veya yönetici."""
    if user is None:
        return
    from apps.communication.permissions import user_can_manage_campaign

    if item.campaign_id and item.campaign is not None:
        if user_can_manage_campaign(user, item.campaign):
            return
        raise PermissionError('Bu kampanyanın kuyruk kaydına yalnız oluşturan veya yönetici müdahale edebilir.')
    sender_id = getattr(item.message, 'sender_user_id', None)
    if sender_id and sender_id == getattr(user, 'id', None):
        return
    from apps.communication.application.coach_scope import _has_full_inbox_access

    if _has_full_inbox_access(user):
        return
    raise PermissionError('Bu kuyruk kaydına müdahale yetkiniz yok.')


@transaction.atomic
def retry_queue_item(kurum_id: int, item_id, sube_id: int | None = None, *, user=None) -> OutboundQueueItem:
    item = _locked_item(kurum_id, item_id, sube_id)
    if not item:
        raise ValueError('Kuyruk kaydı bulunamadı.')
    _assert_can_touch(item, user)
    msg = item.message
    if msg.status not in (MessageStatus.FAILED, MessageStatus.PENDING):
        raise ValueError('Yalnızca bekleyen veya başarısız kayıt yeniden denenir.')
    if item.locked_at is not None and msg.status == MessageStatus.PENDING:
        # Worker şu an bu kaydı tutuyor; kilidi sıfırlamak çift gönderime yol açar.
        raise ValueError('Kayıt şu an işleniyor; birkaç saniye sonra tekrar deneyin.')
    item.attempt_count = 0
    item.last_error = ''
    item.locked_at = None
    item.locked_by = ''
    item.provider_call_started_at = None
    item.next_attempt_at = timezone.now()
    item.save(update_fields=[
        'attempt_count', 'last_error', 'locked_at', 'locked_by',
        'provider_call_started_at', 'next_attempt_at', 'updated_at',
    ])
    msg.status = MessageStatus.PENDING
    msg.failed_reason = ''
    msg.save(update_fields=['status', 'failed_reason', 'updated_at'])
    return item


def refresh_send_options(opts: dict, conversation) -> dict:
    """Kayıtlı şablon değişkenlerinin kişi alanlarını güncel kayıttan yazar."""
    from apps.communication.application.variable_resolver import (
        build_recipient_context_from_conversation,
    )

    fresh = build_recipient_context_from_conversation(conversation)
    next_opts = dict(opts or {})

    def _merge(stored):
        if not isinstance(stored, dict):
            return stored
        merged = dict(stored)
        for key, value in fresh.items():
            if value:
                merged[key] = value
        return merged

    if isinstance(next_opts.get('template_context'), dict):
        next_opts['template_context'] = _merge(next_opts['template_context'])
    fallback = next_opts.get('session_fallback')
    if isinstance(fallback, dict) and isinstance(fallback.get('template_context'), dict):
        fallback = dict(fallback)
        fallback['template_context'] = _merge(fallback['template_context'])
        next_opts['session_fallback'] = fallback
    return next_opts


_ODEV_SOURCE_REF = re.compile(r'^(\d+):(plan|report):(veli:\d+|ogrenci)$')


def restore_template_send_options(message) -> dict:
    """Silinmiş kuyruk kaydındaki şablon adını ve değişkenlerini geri yükle.

    Meta gönderimi kabul edince kuyruk satırı silinir. WhatsApp sonradan
    iletilemedi derse şablon adı kaybolur ve tekrar gönderim PDF'siz düz
    metne düşer. Mesajda saklanan seçenekler, yoksa ödev kaynağından
    çözülen şablon kullanılır.
    """
    stored = message.send_options if isinstance(getattr(message, 'send_options', None), dict) else {}
    if stored.get('template_name'):
        return dict(stored)
    from apps.communication.domain.enums import MessageType

    if message.message_type != MessageType.TEMPLATE:
        return {}
    if (message.source_module or '') != 'odev':
        return {}
    match = _ODEV_SOURCE_REF.match(message.source_ref_id or '')
    if not match:
        return {}
    assignment_id, notify_type, recipient_key = match.groups()
    conversation = message.conversation
    recipient = 'VELI' if recipient_key.startswith('veli') else 'OGRENCI'
    event_key = 'odev.plan' if notify_type == 'plan' else 'odev.rapor'
    from apps.communication.application.notification_template_resolver import resolve_binding

    resolved = resolve_binding(
        conversation.kurum_id,
        event_key,
        recipient,
        sube_id=conversation.sube_id,
    )
    meta = resolved.meta_template if resolved.meta_usable(needs_document=True) else None
    if meta is None:
        return {}
    return {
        'template_name': meta.name,
        'template_language': meta.language or 'tr',
        'channel_config_id': str(meta.channel_config_id or ''),
        'template_context': _odev_retry_context(
            assignment_id=int(assignment_id),
            notify_type=notify_type,
            conversation=conversation,
            recipient=recipient,
        ),
    }


def _odev_retry_context(*, assignment_id: int, notify_type: str, conversation, recipient: str) -> dict:
    from apps.coaching.assignment_manual.assignment_notify_utils import build_assignment_context
    from apps.coaching.assignment_manual.models import ManualAssignment

    assignment = (
        ManualAssignment.objects.select_related('student', 'student__kurum')
        .filter(id=assignment_id, student__kurum_id=conversation.kurum_id)
        .first()
    )
    if assignment is None:
        return {}
    veli = None
    if recipient == 'VELI' and conversation.veli_id:
        from apps.ogrenci.domain.models import OgrenciVeli

        veli = OgrenciVeli.objects.filter(id=conversation.veli_id).first()
    context = build_assignment_context(
        assignment=assignment,
        notify_type=notify_type,
        veli=veli,
        kurum=getattr(assignment.student, 'kurum', None),
    )
    return {key: '' if value is None else str(value) for key, value in context.items()}


def _reset_attachment_media_ids(message) -> None:
    """Eski Meta medya kimliği süresi dolmuş olabilir; dosya duruyorsa yeniden yüklenir."""
    from apps.communication.domain.models import MessageAttachment

    for attachment in MessageAttachment.objects.filter(message_id=message.id):
        if attachment.file and attachment.provider_media_id:
            attachment.provider_media_id = ''
            attachment.save(update_fields=['provider_media_id'])


@transaction.atomic
def retry_failed_message(kurum_id: int, conversation, message, *, user=None) -> OutboundQueueItem:
    """Gitmeyen giden mesajı aynı kayıt üzerinden yeniden kuyruğa alır.

    Şablon değişkenleri (öğrenci/veli adı vb.) yeniden çözülür. Yeni serbest
    metin veya şablon seçim penceresi açılmaz.
    """
    from apps.communication.domain.enums import MessageDirection
    from apps.communication.domain.models import Message, OutboundQueueItem

    if message.direction != MessageDirection.OUTBOUND:
        raise ValueError('Yalnızca giden mesaj yeniden gönderilir.')
    if message.status != MessageStatus.FAILED:
        raise ValueError('Yalnızca gitmeyen mesaj yeniden gönderilir.')
    if message.conversation_id != conversation.id:
        raise ValueError('Mesaj bu sohbete ait değil.')

    item = (
        OutboundQueueItem.objects.select_for_update()
        .filter(message_id=message.id, kurum_id=kurum_id)
        .first()
    )
    if item is None:
        item = OutboundQueueItem.objects.create(
            kurum_id=kurum_id,
            message=message,
            next_attempt_at=timezone.now(),
            send_options={},
        )
    opts = item.send_options if isinstance(item.send_options, dict) else {}
    if not opts.get('template_name'):
        recovered = restore_template_send_options(message)
        if recovered.get('template_name'):
            opts = {**recovered, **{key: value for key, value in opts.items() if value}}
    item.send_options = refresh_send_options(opts, conversation)
    item.save(update_fields=['send_options', 'updated_at'])
    if item.send_options.get('template_name'):
        _reset_attachment_media_ids(message)
    item = retry_queue_item(kurum_id, item.id, conversation.sube_id, user=user)
    Message.objects.filter(pk=message.id).update(failed_reason='')
    return item


@transaction.atomic
def cancel_queue_item(kurum_id: int, item_id, sube_id: int | None = None, *, user=None) -> None:
    """Bekleyen kaydı iptal eder.

    Kilitli (worker'ın elindeki) kayıt silinmez: mesaj CANCELLED yapılır,
    worker göndermeden önce durumu kontrol edip atlar ve kaydı kendisi
    temizler. Kilitsiz kayıt hemen silinir.
    """
    item = _locked_item(kurum_id, item_id, sube_id)
    if not item:
        raise ValueError('Kuyruk kaydı bulunamadı.')
    _assert_can_touch(item, user)
    if item.message.status not in (MessageStatus.PENDING, MessageStatus.SENDING):
        raise ValueError('Yalnızca bekleyen gönderim iptal edilir.')
    msg = item.message
    msg.status = MessageStatus.CANCELLED
    msg.save(update_fields=['status', 'updated_at'])
    if item.locked_at is None:
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
