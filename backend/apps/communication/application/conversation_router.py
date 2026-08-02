"""
Ticket routing — inbound/outbound sohbet sahipliği ve SLA zaman damgaları.
assigned_coach = öğrencinin gerçek koçu; claimed_by = üstlenen personel.
Aktif ConversationRoutingRule eşleşirse department/status override edilir.
"""
from __future__ import annotations

from django.conf import settings
from django.utils import timezone

from apps.communication.application.conversation_events import (
    log_conversation_event,
    log_status_change,
)
from apps.communication.application.routing_rule_matcher import (
    match_routing_rule,
    resolve_rule_actions,
)
from apps.communication.domain.enums import (
    CommunicationDepartment,
    ConversationEventType,
    ConversationStatus,
    RecipientType,
)
from apps.communication.domain.models import Conversation


def ticket_routing_enabled() -> bool:
    return bool(getattr(settings, 'COMMUNICATION_TICKET_ROUTING', True))


def resolve_primary_coach(ogrenci_id: int | None):
    """Öğrencinin aktif primary koçu; yoksa ilk aktif atama."""
    if not ogrenci_id:
        return None
    from apps.coaching.models import CoachStudentAssignment

    qs = CoachStudentAssignment.objects.filter(
        student_id=ogrenci_id,
        end_date__isnull=True,
        coach__is_active=True,
    ).select_related('coach')
    primary = qs.filter(is_primary=True).first()
    if primary:
        return primary.coach
    assignment = qs.first()
    return assignment.coach if assignment else None


def _contact_display_name(conversation: Conversation) -> str:
    if conversation.contact_name:
        return conversation.contact_name
    if conversation.veli_id and getattr(conversation, 'veli', None):
        return conversation.veli.tam_ad or ''
    if conversation.ogrenci_id and getattr(conversation, 'ogrenci', None):
        o = conversation.ogrenci
        return f'{o.ad} {o.soyad}'.strip()
    return conversation.contact_phone or ''


def _department_from_channel(conversation: Conversation, channel_config=None) -> str:
    dept = CommunicationDepartment.COACHING
    if channel_config and getattr(channel_config, 'department', None):
        return channel_config.department
    if conversation.channel_config_id and getattr(conversation, 'channel_config', None):
        return conversation.channel_config.department or dept
    return dept


def _default_inbound_status(conversation: Conversation) -> str | None:
    """Kural yokken mevcut hardcoded status geçişi. NEW/WAITING/NEEDS_SUPPORT korunur."""
    if conversation.status == ConversationStatus.ARCHIVED:
        return ConversationStatus.NEW
    if conversation.status in (
        ConversationStatus.NEEDS_SUPPORT,
        ConversationStatus.NEW,
        ConversationStatus.WAITING,
    ):
        return None
    if conversation.status in (
        ConversationStatus.REPLIED,
        ConversationStatus.READ,
        ConversationStatus.CLOSED,
        ConversationStatus.OPEN,
        ConversationStatus.AWAITING_REPLY,
    ):
        return (
            ConversationStatus.WAITING
            if conversation.assigned_coach_id
            else ConversationStatus.NEW
        )
    return (
        ConversationStatus.WAITING
        if conversation.assigned_coach_id
        else ConversationStatus.NEW
    )


class ConversationRouter:
    """Inbound/outbound sonrası sohbet routing güncellemeleri."""

    @staticmethod
    def apply_after_inbound(
        conversation: Conversation,
        *,
        channel_config=None,
        preview: str = '',
    ) -> Conversation:
        now = timezone.now()
        update_fields: list[str] = []
        old_status = conversation.status
        matched_meta: dict = {}

        # Koç senkronu (her inbound'da güncel primary) — kural eşlemesi has_coach'a bağlı
        coach = resolve_primary_coach(conversation.ogrenci_id)
        if coach and conversation.assigned_coach_id != coach.id:
            conversation.assigned_coach = coach
            update_fields.append('assigned_coach')
            log_conversation_event(
                conversation,
                ConversationEventType.ASSIGNED_COACH_SYNC,
                meta={'coach_id': coach.id},
            )
        elif not coach and conversation.ogrenci_id and conversation.assigned_coach_id:
            conversation.assigned_coach = None
            update_fields.append('assigned_coach')

        has_coach = bool(conversation.assigned_coach_id)

        name = _contact_display_name(conversation)
        if name and conversation.contact_name != name:
            conversation.contact_name = name[:255]
            update_fields.append('contact_name')

        conversation.last_customer_message_at = now
        update_fields.append('last_customer_message_at')
        if not conversation.first_unanswered_at:
            conversation.first_unanswered_at = now
            update_fields.append('first_unanswered_at')

        # Arşivden çık (kural uygulamasından önce)
        if conversation.status == ConversationStatus.ARCHIVED:
            conversation.status = ConversationStatus.NEW
            conversation.archived_at = None
            update_fields.extend(['status', 'archived_at'])

        # Kural eşleştir
        rule = match_routing_rule(
            conversation.kurum_id,
            conversation,
            has_coach=has_coach,
            contact_type=conversation.contact_type,
        )
        resolved = resolve_rule_actions(rule, has_coach=has_coach) if rule else None

        # Departman: kural override → WABA hesabı
        if resolved and resolved.department:
            dept = resolved.department
        else:
            dept = _department_from_channel(conversation, channel_config)
        if conversation.department != dept:
            conversation.department = dept
            update_fields.append('department')

        # Status: kural aksiyonu veya varsayılan
        if resolved and resolved.status:
            new_status = resolved.status
            if conversation.status != new_status:
                conversation.status = new_status
                update_fields.append('status')
            if (
                new_status == ConversationStatus.NEEDS_SUPPORT
                and not conversation.needs_support_at
            ):
                conversation.needs_support_at = now
                update_fields.append('needs_support_at')
            matched_meta = {
                'routing_rule_id': resolved.rule_id,
                'queue_behavior': resolved.queue_behavior,
                'notify_roles': resolved.notify_roles,
            }
        else:
            default_status = _default_inbound_status(conversation)
            if default_status and conversation.status != default_status:
                conversation.status = default_status
                if 'status' not in update_fields:
                    update_fields.append('status')
                if default_status == ConversationStatus.NEW and conversation.archived_at:
                    conversation.archived_at = None
                    update_fields.append('archived_at')

        if update_fields:
            if 'updated_at' not in update_fields:
                update_fields.append('updated_at')
            conversation.save(update_fields=list(dict.fromkeys(update_fields)))

        if old_status != conversation.status:
            log_status_change(conversation, old_status, conversation.status)

        event_meta = {'preview': (preview or '')[:200]}
        if matched_meta:
            event_meta.update(matched_meta)
        log_conversation_event(
            conversation,
            ConversationEventType.MESSAGE_IN,
            meta=event_meta,
        )
        return conversation

    @staticmethod
    def apply_after_outbound(
        conversation: Conversation,
        *,
        actor=None,
        preview: str = '',
    ) -> Conversation:
        now = timezone.now()
        old_status = conversation.status
        update_fields = ['last_reply_at', 'first_unanswered_at', 'needs_support_at', 'status', 'updated_at']

        conversation.last_reply_at = now
        conversation.first_unanswered_at = None
        conversation.needs_support_at = None
        if conversation.status != ConversationStatus.ARCHIVED:
            conversation.status = ConversationStatus.REPLIED

        conversation.save(update_fields=update_fields)
        if old_status != conversation.status:
            log_status_change(conversation, old_status, conversation.status, actor=actor)
        log_conversation_event(
            conversation,
            ConversationEventType.MESSAGE_OUT,
            actor=actor,
            meta={'preview': (preview or '')[:200]},
        )
        return conversation

    @staticmethod
    def is_unclaimed_queue(conversation: Conversation) -> bool:
        """Yeni Gelenler: üstlenilmemiş + (koçsuz veya bilinmeyen)."""
        if conversation.claimed_by_user_id:
            return False
        if conversation.status == ConversationStatus.ARCHIVED:
            return False
        if conversation.assigned_coach_id is None:
            return True
        if conversation.contact_type == RecipientType.RAW_PHONE and not conversation.ogrenci_id:
            return True
        return False


# Geriye uyumluluk — coach_scope.assign_coach_to_conversation buraya yönlendirilir
def assign_coach_to_conversation(conversation: Conversation) -> None:
    if not ticket_routing_enabled():
        if conversation.assigned_coach_id or not conversation.ogrenci_id:
            return
        coach = resolve_primary_coach(conversation.ogrenci_id)
        if coach:
            conversation.assigned_coach = coach
            conversation.save(update_fields=['assigned_coach', 'updated_at'])
        return

    coach = resolve_primary_coach(conversation.ogrenci_id)
    if coach and conversation.assigned_coach_id != coach.id:
        conversation.assigned_coach = coach
        conversation.save(update_fields=['assigned_coach', 'updated_at'])
        log_conversation_event(
            conversation,
            ConversationEventType.ASSIGNED_COACH_SYNC,
            meta={'coach_id': coach.id},
        )
