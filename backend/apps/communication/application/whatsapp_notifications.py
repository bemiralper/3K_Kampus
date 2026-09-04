"""WhatsApp inbound → uygulama içi (🔔) bildirim."""
from __future__ import annotations

import logging

from apps.communication.application.conversation_display import (
    resolve_conversation_display_name,
)
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


def _assigned_coach_user_ids_for_student(ogrenci_id: int | None) -> list[int]:
    """Primary + yardımcı koçların user id'leri."""
    if not ogrenci_id:
        return []
    try:
        from apps.coaching.models import CoachStudentAssignment

        rows = (
            CoachStudentAssignment.objects.filter(
                student_id=ogrenci_id,
                end_date__isnull=True,
                coach__is_active=True,
                coach__is_coach=True,
            )
            .select_related('coach__teacher')
            .values_list('coach__teacher__user_id', flat=True)
        )
        return [int(uid) for uid in rows if uid]
    except Exception:
        logger.exception('whatsapp notify: secondary coach resolve failed')
        return []


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


def _outbound_sender_user_ids(conversation) -> list[int]:
    """Bu sohbete mesaj göndermiş personel — cevabı en çok onlar bekliyor."""
    try:
        from apps.communication.domain.enums import MessageDirection
        from apps.communication.domain.models import Message

        rows = (
            Message.objects.filter(
                conversation_id=conversation.id,
                direction=MessageDirection.OUTBOUND,
                sender_user_id__isnull=False,
            )
            .values_list('sender_user_id', flat=True)
            .distinct()[:10]
        )
        return [int(uid) for uid in rows if uid]
    except Exception:
        logger.exception('whatsapp notify: sender resolve failed')
        return []


def _can_see(user, conversation) -> bool:
    """Sohbeti listesinde göremeyecek kişiye bildirim gönderme."""
    try:
        from apps.communication.application.coach_scope import user_can_see_department

        return user_can_see_department(user, conversation.department)
    except Exception:
        logger.exception('whatsapp notify: department check failed')
        return True


def resolve_whatsapp_notify_user_ids(conversation) -> list[int]:
    """Bildirim alıcıları — yalnızca sohbetin departmanını görebilenler.

    Muhasebe sohbetine gelen cevap koça bildirilirse koç bildirimi görür ama
    sohbeti açamaz; bu yüzden departman görünürlüğü burada da uygulanır.
    """
    ids: set[int] = set()
    if conversation.claimed_by_user_id:
        ids.add(int(conversation.claimed_by_user_id))
    coach_uid = _coach_user_id(conversation)
    if coach_uid:
        ids.add(coach_uid)
    ids.update(_assigned_coach_user_ids_for_student(conversation.ogrenci_id))
    ids.update(_outbound_sender_user_ids(conversation))

    if ids:
        visible = {uid for uid, user in _load_users(ids).items() if _can_see(user, conversation)}
        if visible:
            return sorted(visible)

    fallback = set(_manage_user_ids(conversation.kurum_id))
    if not fallback:
        return []
    return sorted(
        uid for uid, user in _load_users(fallback).items() if _can_see(user, conversation)
    )


def _load_users(user_ids) -> dict[int, object]:
    try:
        from django.contrib.auth import get_user_model

        User = get_user_model()
        return {u.id: u for u in User.objects.filter(id__in=list(user_ids), is_active=True)}
    except Exception:
        logger.exception('whatsapp notify: user load failed')
        return {}


def _inbox_url_for_user(user, conversation_id) -> str:
    """
    Koç profili olan ve communication.manage olmayan kullanıcı → /coach/...
    Muhasebe personeli (koç değil, yönetici değil) → /muhasebe/...
    Diğerleri → /admin/...
    """
    try:
        from apps.coaching.services.coach_access import get_coach_profile
        from apps.communication.application.account_resolver import _is_accounting_staff
        from shared.permissions import user_has_any_permission

        if getattr(user, 'is_superuser', False) or user_has_any_permission(
            user, 'communication.manage',
        ):
            return f'/admin/iletisim/sohbetler?conversation={conversation_id}'
        if get_coach_profile(user):
            return f'/coach/sohbetler?conversation={conversation_id}'
        if _is_accounting_staff(user):
            return f'/muhasebe/iletisim/sohbetler?conversation={conversation_id}'
    except Exception:
        logger.exception('whatsapp notify: inbox url resolve failed user=%s', getattr(user, 'id', None))
    return f'/admin/iletisim/sohbetler?conversation={conversation_id}'


def notify_inbound_whatsapp(conversation, *, preview: str = '') -> int:
    """Gelen WhatsApp mesajı için AppNotification oluştur. Dönüş: oluşturulan sayı."""
    try:
        user_ids = resolve_whatsapp_notify_user_ids(conversation)
    except Exception:
        logger.exception('whatsapp notify: recipient resolve failed')
        return 0
    if not user_ids:
        return 0

    name = resolve_conversation_display_name(conversation, allow_live_lookup=True)
    body = (preview or conversation.last_message_preview or 'Yeni mesaj')[:200]
    repo = AppNotificationRepository()
    created = 0

    try:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        users_by_id = {
            u.id: u
            for u in User.objects.filter(id__in=user_ids, is_active=True)
        }
    except Exception:
        users_by_id = {}

    for user_id in user_ids:
        user = users_by_id.get(user_id)
        url = (
            _inbox_url_for_user(user, conversation.id)
            if user is not None
            else f'/admin/iletisim/sohbetler?conversation={conversation.id}'
        )
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
