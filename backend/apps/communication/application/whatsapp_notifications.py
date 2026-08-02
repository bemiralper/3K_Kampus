"""WhatsApp inbound → uygulama içi (🔔) bildirim."""
from __future__ import annotations

import logging

from apps.takvim.domain.enums import RecipientType
from apps.takvim.infrastructure.repository import AppNotificationRepository

logger = logging.getLogger(__name__)


def _coach_user_id(conversation) -> int | None:
    coach = getattr(conversation, 'assigned_coach', None)
    if not coach and conversation.assigned_coach_id:
        try:
            from apps.coaching.models import CoachProfile
            coach = CoachProfile.objects.select_related('teacher').filter(
                pk=conversation.assigned_coach_id,
            ).first()
        except Exception:
            return None
    teacher = getattr(coach, 'teacher', None) if coach else None
    user_id = getattr(teacher, 'user_id', None) if teacher else None
    return int(user_id) if user_id else None


def _manage_user_ids(kurum_id: int) -> list[int]:
    """communication.manage / write yetkili kullanıcılar (üst sınırlı)."""
    try:
        from django.contrib.auth import get_user_model
        from apps.personel.domain.models import Personel
        from apps.roller.models import UserRole
        from shared.permissions import user_has_any_permission

        User = get_user_model()
        personel_user_ids = list(
            Personel.objects.filter(kurum_id=kurum_id, user_id__isnull=False)
            .values_list('user_id', flat=True)
            .distinct()[:100]
        )
        role_user_ids = list(
            UserRole.objects.filter(kurum_id=kurum_id)
            .values_list('user_id', flat=True)
            .distinct()[:80]
        )
        candidate_ids = list(dict.fromkeys([*personel_user_ids, *role_user_ids]))
        if not candidate_ids:
            return list(
                User.objects.filter(is_superuser=True, is_active=True)
                .values_list('id', flat=True)[:10]
            )
        recipients = []
        for user in User.objects.filter(id__in=candidate_ids, is_active=True):
            if user.is_superuser or user_has_any_permission(
                user,
                'communication.manage',
                'communication.config',
                'communication.write',
                'communication.read',
            ):
                recipients.append(user.id)
            if len(recipients) >= 20:
                break
        return recipients
    except Exception:
        logger.exception('whatsapp notify: manage user resolve failed')
        return []


def resolve_whatsapp_notify_user_ids(conversation) -> list[int]:
    ids: set[int] = set()
    if conversation.claimed_by_user_id:
        ids.add(int(conversation.claimed_by_user_id))
    coach_uid = _coach_user_id(conversation)
    if coach_uid:
        ids.add(coach_uid)
    if not ids:
        ids.update(_manage_user_ids(conversation.kurum_id))
    return sorted(ids)


def notify_inbound_whatsapp(conversation, *, preview: str = '') -> int:
    """Gelen WhatsApp mesajı için AppNotification oluştur. Dönüş: oluşturulan sayı."""
    try:
        user_ids = resolve_whatsapp_notify_user_ids(conversation)
    except Exception:
        logger.exception('whatsapp notify: recipient resolve failed')
        return 0
    if not user_ids:
        return 0

    name = (
        (conversation.contact_name or '').strip()
        or conversation.contact_phone
        or 'WhatsApp'
    )
    body = (preview or conversation.last_message_preview or 'Yeni mesaj')[:200]
    url = f'/admin/iletisim/mesajlar?conversation={conversation.id}'
    repo = AppNotificationRepository()
    created = 0
    for user_id in user_ids:
        try:
            repo.create({
                'kurum_id': conversation.kurum_id,
                'user_id': user_id,
                'alici_tip': RecipientType.PERSONEL,
                'baslik': f'WhatsApp: {name}',
                'mesaj': body,
                'ikon': '💬',
                'renk': '#25D366',
                'url': url,
                'ekran_mesaji': False,
            })
            created += 1
        except Exception:
            logger.exception('whatsapp notify: create failed user=%s', user_id)
    return created
