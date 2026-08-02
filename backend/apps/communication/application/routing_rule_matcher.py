"""
ConversationRoutingRule eşleştirme — conditions/actions JSON şeması.

conditions:
  has_coach: bool | yok
  contact_types: ["RAW_PHONE"|"OGRENCI"|"VELI"|"PERSONEL"]
  queue: "new"|"mine"|"needs_support"  (opsiyonel bağlam)

actions:
  set_department: CommunicationDepartment
  queue_behavior: "unclaimed"|"assign_coach"|"needs_support"
  set_status: "NEW"|"WAITING"|"NEEDS_SUPPORT"
  notify_roles: list[str]  (meta; bildirim kanalı yok)
"""
from __future__ import annotations

from dataclasses import dataclass

from apps.communication.domain.enums import ConversationStatus, RecipientType
from apps.communication.domain.models import Conversation, ConversationRoutingRule

ALLOWED_SET_STATUSES = frozenset({
    ConversationStatus.NEW,
    ConversationStatus.WAITING,
    ConversationStatus.NEEDS_SUPPORT,
})

QUEUE_BEHAVIORS = frozenset({'unclaimed', 'assign_coach', 'needs_support'})
QUEUE_LABELS = frozenset({'new', 'mine', 'needs_support'})


@dataclass(frozen=True)
class MatchedRoutingActions:
    rule_id: str
    department: str | None
    status: str | None
    queue_behavior: str | None
    notify_roles: list[str]


def _as_bool(value) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ('1', 'true', 'yes', 'evet'):
            return True
        if lowered in ('0', 'false', 'no', 'hayir', 'hayır'):
            return False
    return None


def conditions_match(
    conditions: dict | None,
    *,
    has_coach: bool,
    contact_type: str | None,
    conversation: Conversation,
) -> bool:
    conditions = conditions or {}
    if not isinstance(conditions, dict):
        return False

    want_coach = _as_bool(conditions.get('has_coach')) if 'has_coach' in conditions else None
    if want_coach is not None and want_coach != bool(has_coach):
        return False

    contact_types = conditions.get('contact_types')
    if contact_types:
        if not isinstance(contact_types, (list, tuple)):
            return False
        allowed = {str(x) for x in contact_types if x}
        if allowed and (contact_type or '') not in allowed:
            return False

    queue = conditions.get('queue')
    if queue:
        queue = str(queue).strip().lower()
        if queue not in QUEUE_LABELS:
            return False
        if queue == 'new':
            # Üstlenilmemiş + (koçsuz veya ham telefon)
            if conversation.claimed_by_user_id:
                return False
            if has_coach and contact_type != RecipientType.RAW_PHONE:
                return False
        elif queue == 'mine':
            if not has_coach:
                return False
        elif queue == 'needs_support':
            if conversation.status != ConversationStatus.NEEDS_SUPPORT:
                return False

    return True


def match_routing_rule(
    kurum_id: int,
    conversation: Conversation,
    *,
    has_coach: bool,
    contact_type: str | None = None,
) -> ConversationRoutingRule | None:
    contact_type = contact_type or conversation.contact_type
    rules = (
        ConversationRoutingRule.objects.filter(kurum_id=kurum_id, is_active=True)
        .order_by('priority', 'name')
    )
    for rule in rules:
        if conditions_match(
            rule.conditions,
            has_coach=has_coach,
            contact_type=contact_type,
            conversation=conversation,
        ):
            return rule
    return None


def resolve_rule_actions(rule: ConversationRoutingRule, *, has_coach: bool) -> MatchedRoutingActions:
    actions = rule.actions if isinstance(rule.actions, dict) else {}
    department = actions.get('set_department') or rule.department or None
    if department:
        department = str(department)

    queue_behavior = actions.get('queue_behavior')
    if queue_behavior:
        queue_behavior = str(queue_behavior).strip().lower()
        if queue_behavior not in QUEUE_BEHAVIORS:
            queue_behavior = None

    set_status = actions.get('set_status')
    status = None
    if set_status:
        set_status = str(set_status).strip().upper()
        if set_status in ALLOWED_SET_STATUSES:
            status = set_status

    if status is None and queue_behavior:
        if queue_behavior == 'needs_support':
            status = ConversationStatus.NEEDS_SUPPORT
        elif queue_behavior == 'assign_coach':
            status = ConversationStatus.WAITING if has_coach else ConversationStatus.NEW
        elif queue_behavior == 'unclaimed':
            status = ConversationStatus.NEW

    notify_roles = actions.get('notify_roles') or []
    if not isinstance(notify_roles, list):
        notify_roles = []
    else:
        notify_roles = [str(x) for x in notify_roles if x]

    return MatchedRoutingActions(
        rule_id=str(rule.id),
        department=department,
        status=status,
        queue_behavior=queue_behavior,
        notify_roles=notify_roles,
    )
