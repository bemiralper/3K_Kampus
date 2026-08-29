"""İletişim paneli — canlı özet ve grafik serileri."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q
from django.db.models.functions import ExtractHour, TruncDate
from django.utils import timezone

from apps.communication.application.delivery_error import explain_delivery_failure
from apps.communication.domain.enums import (
    CampaignStatus,
    CommunicationDepartment,
    ConversationStatus,
    MessageDirection,
    MessageStatus,
    RecipientType,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    Conversation,
    Message,
    OutboundCampaign,
    OutboundQueueItem,
)

TREND_DAYS = 14

SOURCE_LABELS = {
    'odev': 'Ödev',
    'odeme': 'Ödeme',
    'finans': 'Finans',
    'yoklama': 'Yoklama',
    'kutuphane': 'Kütüphane',
    'gorusme': 'Görüşme',
    'sinav': 'Sınav',
    'devamsizlik': 'Devamsızlık',
    'duyuru': 'Duyuru',
    'koc': 'Koçluk',
    'ogrenci': 'Öğrenci',
    'takvim': 'Takvim',
    'akademik': 'Akademik',
    'ozel_ders': 'Özel ders',
}

STATUS_LABELS = {choice.value: choice.label for choice in ConversationStatus}
DEPT_LABELS = {choice.value: choice.label for choice in CommunicationDepartment}
CONTACT_LABELS = {choice.value: choice.label for choice in RecipientType}
DELIVERY_LABELS = {choice.value: choice.label for choice in MessageStatus}

ACTIVE_CAMPAIGN = (
    CampaignStatus.QUEUED,
    CampaignStatus.PROCESSING,
    CampaignStatus.CONFIRMED,
)


def _coach_display_names(coach_ids: list[int]) -> dict[int, str]:
    if not coach_ids:
        return {}
    from apps.coaching.models import CoachProfile

    names: dict[int, str] = {}
    for cp in CoachProfile.objects.filter(id__in=coach_ids).select_related('teacher'):
        teacher = getattr(cp, 'teacher', None)
        if teacher:
            label = (
                getattr(teacher, 'tam_ad', None)
                or f'{getattr(teacher, "ad", "")} {getattr(teacher, "soyad", "")}'.strip()
            )
            names[cp.id] = label or f'Koç #{cp.id}'
        else:
            names[cp.id] = f'Koç #{cp.id}'
    return names


def _iso_date(value: date | datetime | None) -> str:
    if value is None:
        return ''
    if isinstance(value, datetime):
        return timezone.localtime(value).date().isoformat()
    return value.isoformat()


def _count_map(rows, key, value_key='count') -> dict:
    out = {}
    for row in rows:
        raw = row.get(key)
        if raw is None:
            continue
        out[raw] = int(row.get(value_key) or 0)
    return out


def _labeled_counts(raw: dict, labels: dict[str, str], *, include_zero=False) -> list[dict]:
    items = []
    keys = list(labels.keys())
    extra = [k for k in raw if k not in labels]
    for key in keys + extra:
        count = int(raw.get(key) or 0)
        if count <= 0 and not include_zero:
            continue
        items.append({
            'key': key,
            'label': labels.get(key, key or 'Diğer'),
            'count': count,
        })
    items.sort(key=lambda item: item['count'], reverse=True)
    return items


def build_communication_dashboard(kurum_id: int, sube_id: int | None = None) -> dict:
    now = timezone.now()
    tz = timezone.get_current_timezone()
    today = timezone.localdate()
    week_ago = now - timedelta(days=7)
    trend_start = timezone.make_aware(
        datetime.combine(today - timedelta(days=TREND_DAYS - 1), datetime.min.time()),
        tz,
    )

    conv_qs = Conversation.objects.filter(kurum_id=kurum_id)
    if sube_id is not None:
        from apps.communication.interfaces.sube_context import filter_conversations_by_sube
        conv_qs = filter_conversations_by_sube(conv_qs, sube_id)

    active = conv_qs.exclude(status__in=(ConversationStatus.ARCHIVED, ConversationStatus.CLOSED))
    waiting = active.filter(
        Q(status__in=(
            ConversationStatus.NEW,
            ConversationStatus.WAITING,
            ConversationStatus.NEEDS_SUPPORT,
            ConversationStatus.AWAITING_REPLY,
        ))
        | Q(first_unanswered_at__isnull=False),
    )
    sla_qs = conv_qs.filter(status=ConversationStatus.NEEDS_SUPPORT)
    active_count = active.count()
    waiting_count = waiting.count()
    sla_count = sla_qs.count()
    unassigned_active = active.filter(assigned_coach__isnull=True).count()
    unanswered = active.filter(
        first_unanswered_at__isnull=False,
        unread_count_coach__gt=0,
    ).count()

    by_coach_raw = list(
        active.filter(assigned_coach__isnull=False)
        .values('assigned_coach_id')
        .annotate(count=Count('id'))
        .order_by('-count')[:12]
    )
    reply_stats = list(
        conv_qs.filter(
            assigned_coach__isnull=False,
            last_reply_at__isnull=False,
            last_customer_message_at__isnull=False,
            last_reply_at__gte=F('last_customer_message_at'),
        )
        .annotate(
            reply_delay=ExpressionWrapper(
                F('last_reply_at') - F('last_customer_message_at'),
                output_field=DurationField(),
            )
        )
        .values('assigned_coach_id')
        .annotate(avg_delay=Avg('reply_delay'), n=Count('id'))
        .order_by()[:12]
    )
    coach_ids = {
        row['assigned_coach_id']
        for row in by_coach_raw + reply_stats
        if row.get('assigned_coach_id')
    }
    coach_names = _coach_display_names(list(coach_ids))
    by_coach = [
        {
            'assigned_coach_id': row['assigned_coach_id'],
            'coach_name': coach_names.get(row['assigned_coach_id'], f"Koç #{row['assigned_coach_id']}"),
            'count': row['count'],
        }
        for row in by_coach_raw
    ]
    coach_reply = []
    for row in reply_stats:
        delay = row.get('avg_delay')
        cid = row['assigned_coach_id']
        coach_reply.append({
            'assigned_coach_id': cid,
            'coach_name': coach_names.get(cid, f'Koç #{cid}'),
            'avg_reply_seconds': int(delay.total_seconds()) if delay else None,
            'sample_count': row['n'],
        })
    coach_reply.sort(key=lambda row: (row['avg_reply_seconds'] is None, row['avg_reply_seconds'] or 0))

    msg_qs = Message.objects.filter(conversation__kurum_id=kurum_id)
    if sube_id is not None:
        msg_qs = msg_qs.filter(
            Q(conversation__sube_id=sube_id)
            | Q(conversation__ogrenci__sube_id=sube_id)
            | Q(conversation__veli__ogrenci__sube_id=sube_id)
        )

    today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()), tz)
    tomorrow_start = today_start + timedelta(days=1)
    yesterday_start = today_start - timedelta(days=1)
    today_msgs = msg_qs.filter(created_at__gte=today_start, created_at__lt=tomorrow_start)
    yesterday_msgs = msg_qs.filter(created_at__gte=yesterday_start, created_at__lt=today_start)

    daily_in = today_msgs.filter(direction=MessageDirection.INBOUND).count()
    daily_out = today_msgs.filter(direction=MessageDirection.OUTBOUND).count()
    yesterday_in = yesterday_msgs.filter(direction=MessageDirection.INBOUND).count()
    yesterday_out = yesterday_msgs.filter(direction=MessageDirection.OUTBOUND).count()
    today_failed = today_msgs.filter(
        direction=MessageDirection.OUTBOUND,
        status=MessageStatus.FAILED,
    ).count()

    hours_raw = (
        msg_qs.filter(created_at__gte=week_ago, direction=MessageDirection.INBOUND)
        .annotate(hour=ExtractHour('created_at', tzinfo=tz))
        .values('hour')
        .annotate(count=Count('id'))
    )
    hour_map = {int(row['hour']): int(row['count']) for row in hours_raw if row.get('hour') is not None}
    busy_hours = [{'hour': hour, 'count': hour_map.get(hour, 0)} for hour in range(24)]

    trend_dir = (
        msg_qs.filter(created_at__gte=trend_start)
        .annotate(day=TruncDate('created_at', tzinfo=tz))
        .values('day', 'direction')
        .annotate(count=Count('id'))
    )
    trend_fail = (
        msg_qs.filter(created_at__gte=trend_start, status=MessageStatus.FAILED)
        .annotate(day=TruncDate('created_at', tzinfo=tz))
        .values('day')
        .annotate(count=Count('id'))
    )
    inbound_by_day: dict[str, int] = defaultdict(int)
    outbound_by_day: dict[str, int] = defaultdict(int)
    for row in trend_dir:
        key = _iso_date(row.get('day'))
        if not key:
            continue
        if row.get('direction') == MessageDirection.INBOUND:
            inbound_by_day[key] += int(row['count'])
        elif row.get('direction') == MessageDirection.OUTBOUND:
            outbound_by_day[key] += int(row['count'])
    failed_by_day = {_iso_date(row.get('day')): int(row['count']) for row in trend_fail}
    daily_trend = []
    for offset in range(TREND_DAYS):
        day = today - timedelta(days=TREND_DAYS - 1 - offset)
        key = day.isoformat()
        daily_trend.append({
            'date': key,
            'label': day.strftime('%d.%m'),
            'inbound': inbound_by_day.get(key, 0),
            'outbound': outbound_by_day.get(key, 0),
            'failed': failed_by_day.get(key, 0),
        })

    by_status = _labeled_counts(
        _count_map(active.values('status').annotate(count=Count('id')), 'status'),
        STATUS_LABELS,
    )
    by_department = _labeled_counts(
        _count_map(active.values('department').annotate(count=Count('id')), 'department'),
        DEPT_LABELS,
        include_zero=False,
    )
    by_contact_type = _labeled_counts(
        _count_map(active.values('contact_type').annotate(count=Count('id')), 'contact_type'),
        CONTACT_LABELS,
    )

    delivery_raw = _count_map(
        today_msgs.filter(direction=MessageDirection.OUTBOUND)
        .values('status')
        .annotate(count=Count('id')),
        'status',
    )
    today_delivery = _labeled_counts(delivery_raw, DELIVERY_LABELS)

    source_raw = (
        msg_qs.filter(created_at__gte=week_ago, direction=MessageDirection.OUTBOUND)
        .exclude(source_module='')
        .values('source_module')
        .annotate(count=Count('id'))
        .order_by('-count')[:8]
    )
    by_source = [
        {
            'key': row['source_module'],
            'label': SOURCE_LABELS.get(row['source_module'], row['source_module']),
            'count': int(row['count']),
        }
        for row in source_raw
    ]

    queue_qs = OutboundQueueItem.objects.filter(kurum_id=kurum_id)
    if sube_id is not None:
        queue_qs = queue_qs.filter(
            Q(message__conversation__sube_id=sube_id) | Q(campaign__sube_id=sube_id)
        )
    queue = {
        'pending': queue_qs.filter(message__status=MessageStatus.PENDING).count(),
        'sending': queue_qs.filter(message__status=MessageStatus.SENDING).count(),
        'failed': queue_qs.filter(message__status=MessageStatus.FAILED).count(),
    }

    campaign_qs = OutboundCampaign.objects.filter(kurum_id=kurum_id)
    if sube_id is not None:
        campaign_qs = campaign_qs.filter(Q(sube_id=sube_id) | Q(sube__isnull=True))
    campaigns = {
        'active': campaign_qs.filter(status__in=ACTIVE_CAMPAIGN).count(),
        'today': campaign_qs.filter(created_at__gte=today_start, created_at__lt=tomorrow_start).count(),
    }

    account_qs = CommunicationChannelConfig.objects.filter(kurum_id=kurum_id).order_by('-is_active', 'name')
    today_by_account = _count_map(
        today_msgs.filter(direction=MessageDirection.OUTBOUND)
        .values('conversation__channel_config_id')
        .annotate(count=Count('id')),
        'conversation__channel_config_id',
    )
    accounts = []
    for acc in account_qs[:12]:
        accounts.append({
            'id': str(acc.id),
            'name': acc.name or acc.display_phone or 'WhatsApp',
            'display_phone': acc.display_phone or '',
            'is_active': acc.is_active,
            'department': acc.department,
            'department_label': DEPT_LABELS.get(acc.department, acc.department),
            'today_outbound': today_by_account.get(acc.id, 0),
        })

    recent_failures = []
    fail_qs = (
        msg_qs.filter(status=MessageStatus.FAILED)
        .select_related('conversation')
        .order_by('-created_at')[:8]
    )
    for msg in fail_qs:
        conv = msg.conversation
        recent_failures.append({
            'id': str(msg.id),
            'at': msg.created_at.isoformat(),
            'source_module': msg.source_module or '',
            'source_label': SOURCE_LABELS.get(msg.source_module, msg.source_module or 'Manuel'),
            'contact_name': (conv.contact_name if conv else '') or (conv.contact_phone if conv else ''),
            'reason': (
                explain_delivery_failure(msg.failed_reason) or 'Gönderilemedi'
            )[:160],
        })

    aging = {'0_15': 0, '15_30': 0, '30_60': 0, '60_plus': 0}
    for unanswered_at in active.filter(first_unanswered_at__isnull=False).values_list('first_unanswered_at', flat=True):
        minutes = max(0, int((now - unanswered_at).total_seconds() // 60))
        if minutes < 15:
            aging['0_15'] += 1
        elif minutes < 30:
            aging['15_30'] += 1
        elif minutes < 60:
            aging['30_60'] += 1
        else:
            aging['60_plus'] += 1
    sla_aging = [
        {'key': '0_15', 'label': '0–15 dk', 'count': aging['0_15']},
        {'key': '15_30', 'label': '15–30 dk', 'count': aging['15_30']},
        {'key': '30_60', 'label': '30–60 dk', 'count': aging['30_60']},
        {'key': '60_plus', 'label': '60+ dk', 'count': aging['60_plus']},
    ]

    alerts = []
    if sla_count:
        alerts.append({
            'key': 'sla',
            'tone': 'danger',
            'label': f'{sla_count} SLA ihlali',
            'href': '/admin/iletisim/mesajlar?queue=needs_support',
        })
    if unassigned_active:
        alerts.append({
            'key': 'unassigned',
            'tone': 'warn',
            'label': f'{unassigned_active} atamasız sohbet',
            'href': '/admin/iletisim/mesajlar',
        })
    if unanswered:
        alerts.append({
            'key': 'unanswered',
            'tone': 'warn',
            'label': f'{unanswered} cevapsız sohbet',
            'href': '/admin/iletisim/mesajlar',
        })
    if today_failed:
        alerts.append({
            'key': 'failed',
            'tone': 'danger',
            'label': f'Bugün {today_failed} başarısız gönderim',
            'href': '/admin/iletisim/kuyruk?status=FAILED',
        })
    if queue['pending'] or queue['sending']:
        alerts.append({
            'key': 'queue',
            'tone': 'info',
            'label': f"Kuyrukta {queue['pending'] + queue['sending']} mesaj",
            'href': '/admin/iletisim/kuyruk',
        })
    inactive_accounts = sum(1 for acc in accounts if not acc['is_active'])
    if inactive_accounts:
        alerts.append({
            'key': 'account',
            'tone': 'info',
            'label': f'{inactive_accounts} pasif WhatsApp hattı',
            'href': '/admin/iletisim/whatsapp-hesaplari',
        })

    return {
        'active_conversations': active_count,
        'waiting_conversations': waiting_count,
        'sla_breaches': sla_count,
        'unassigned_active': unassigned_active,
        'by_coach_active': by_coach,
        'by_coach_reply_time': coach_reply,
        'daily_inbound': daily_in,
        'daily_outbound': daily_out,
        'yesterday_inbound': yesterday_in,
        'yesterday_outbound': yesterday_out,
        'today_failed': today_failed,
        'busy_hours': busy_hours,
        'daily_trend': daily_trend,
        'by_status': by_status,
        'by_department': by_department,
        'by_contact_type': by_contact_type,
        'by_source': by_source,
        'today_delivery': today_delivery,
        'queue': queue,
        'campaigns': campaigns,
        'accounts': accounts,
        'recent_failures': recent_failures,
        'sla_aging': sla_aging,
        'alerts': alerts,
        'unanswered_messages': unanswered,
        'generated_at': now.isoformat(),
        'refresh_seconds': 20,
    }
