"""Yönetici iletişim analytics paneli."""
from __future__ import annotations

from datetime import timedelta

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q
from django.db.models.functions import ExtractHour
from django.utils import timezone
from rest_framework.response import Response

from apps.communication.domain.enums import ConversationStatus, MessageDirection
from apps.communication.domain.models import Conversation, Message
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from shared.permissions import user_has_any_permission


def _coach_display_names(coach_ids: list[int]) -> dict[int, str]:
    """CoachProfile id → görünen ad (öğretmen adı)."""
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


class CommunicationDashboardView(CommunicationAPIView):
    """GET /api/communication/dashboard/ — communication.manage."""

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        if not (
            request.user.is_superuser
            or user_has_any_permission(request.user, 'communication.manage')
        ):
            return Response({'error': 'Yetkiniz yok.'}, status=403)

        now = timezone.now()
        today = now.date()
        conv_qs = Conversation.objects.filter(kurum_id=kurum_id)
        if sube_id is not None:
            from apps.communication.interfaces.sube_context import filter_conversations_by_sube
            conv_qs = filter_conversations_by_sube(conv_qs, sube_id)

        active = conv_qs.exclude(status__in=(ConversationStatus.ARCHIVED, ConversationStatus.CLOSED))
        waiting = active.filter(
            Q(status__in=(ConversationStatus.NEW, ConversationStatus.WAITING, ConversationStatus.NEEDS_SUPPORT))
            | Q(first_unanswered_at__isnull=False),
        )
        sla_breach = conv_qs.filter(status=ConversationStatus.NEEDS_SUPPORT)
        active_count = active.count()
        unassigned_active = active.filter(assigned_coach__isnull=True).count()

        by_coach_raw = list(
            active.filter(assigned_coach__isnull=False)
            .values('assigned_coach_id')
            .annotate(count=Count('id'))
            .order_by('-count')[:20]
        )

        # Koç başına ortalama cevap süresi (last_reply - last_customer yaklaşık)
        reply_stats = list(
            conv_qs.filter(
                assigned_coach__isnull=False,
                last_reply_at__isnull=False,
                last_customer_message_at__isnull=False,
            )
            .annotate(
                reply_delay=ExpressionWrapper(
                    F('last_reply_at') - F('last_customer_message_at'),
                    output_field=DurationField(),
                )
            )
            .values('assigned_coach_id')
            .annotate(avg_delay=Avg('reply_delay'), n=Count('id'))
            .order_by()[:20]
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

        msg_qs = Message.objects.filter(conversation__kurum_id=kurum_id)
        if sube_id is not None:
            msg_qs = msg_qs.filter(
                Q(conversation__sube_id=sube_id)
                | Q(conversation__ogrenci__sube_id=sube_id)
                | Q(conversation__veli__ogrenci__sube_id=sube_id)
            )

        daily_in = msg_qs.filter(
            direction=MessageDirection.INBOUND,
            created_at__date=today,
        ).count()
        daily_out = msg_qs.filter(
            direction=MessageDirection.OUTBOUND,
            created_at__date=today,
        ).count()

        # Son 7 gün saat yoğunluğu
        week_ago = now - timedelta(days=7)
        hours = (
            msg_qs.filter(created_at__gte=week_ago, direction=MessageDirection.INBOUND)
            .annotate(hour=ExtractHour('created_at'))
            .values('hour')
            .annotate(count=Count('id'))
            .order_by('hour')
        )
        busy_hours = [{'hour': h['hour'], 'count': h['count']} for h in hours]

        unanswered = active.filter(
            first_unanswered_at__isnull=False,
            unread_count_coach__gt=0,
        ).count()

        return Response({
            'active_conversations': active_count,
            'waiting_conversations': waiting.count(),
            'sla_breaches': sla_breach.count(),
            'unassigned_active': unassigned_active,
            'by_coach_active': by_coach,
            'by_coach_reply_time': coach_reply,
            'daily_inbound': daily_in,
            'daily_outbound': daily_out,
            'busy_hours': busy_hours,
            'unanswered_messages': unanswered,
            'generated_at': now.isoformat(),
        })
