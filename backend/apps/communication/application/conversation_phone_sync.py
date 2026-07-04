"""
Konuşma telefonu — öğrenci/veli kaydı güncellenince comm_conversation senkronu.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError

from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.domain.models import Conversation


def _phone_from_veli(veli, ogrenci=None) -> str:
    if not veli:
        return ''
    from apps.ogrenci.application.veli_contact import effective_veli_phone

    if ogrenci is None:
        ogrenci = getattr(veli, 'ogrenci', None)
    return effective_veli_phone(veli, ogrenci) or (getattr(veli, 'telefon', '') or '').strip()


def _phone_from_ogrenci_direct(ogrenci) -> str:
    """Öğrenci thread'i — yalnızca öğrencinin kendi numarası."""
    if not ogrenci:
        return ''
    return (getattr(ogrenci, 'telefon', '') or '').strip()


def resolve_linked_phone(conversation: Conversation) -> str | None:
    """Bağlı öğrenci/veli kaydından güncel ham telefon."""
    ogrenci = None
    if conversation.ogrenci_id:
        ogrenci = getattr(conversation, 'ogrenci', None)
        if ogrenci is None:
            from apps.ogrenci.domain.models import Ogrenci

            ogrenci = Ogrenci.objects.filter(id=conversation.ogrenci_id).first()

    if conversation.veli_id:
        veli = getattr(conversation, 'veli', None)
        if veli is None:
            from apps.ogrenci.domain.models import OgrenciVeli

            veli = OgrenciVeli.objects.filter(id=conversation.veli_id).first()
        raw = _phone_from_veli(veli, ogrenci)
        if raw:
            return raw
        if ogrenci:
            fallback = (getattr(ogrenci, 'veli_telefon', '') or '').strip()
            if fallback:
                return fallback
        return None

    if ogrenci:
        raw = _phone_from_ogrenci_direct(ogrenci)
        if raw:
            return raw
    return None


def _normalize_phone_safe(raw: str) -> str | None:
    if not raw:
        return None
    try:
        return ContactResolver.normalize(raw)
    except ValidationError:
        return None


def _party_phones(conversation: Conversation) -> tuple[str | None, str | None]:
    """Öğrenci ve veli E.164 numaraları (çapraz senkron koruması için)."""
    student_e164 = None
    veli_e164 = None

    ogrenci = getattr(conversation, 'ogrenci', None)
    if ogrenci is None and conversation.ogrenci_id:
        from apps.ogrenci.domain.models import Ogrenci

        ogrenci = Ogrenci.objects.filter(id=conversation.ogrenci_id).first()

    if not ogrenci:
        return None, None

    student_e164 = _normalize_phone_safe(_phone_from_ogrenci_direct(ogrenci))

    veli = getattr(conversation, 'veli', None)
    if veli is None and conversation.veli_id:
        from apps.ogrenci.domain.models import OgrenciVeli

        veli = OgrenciVeli.objects.filter(id=conversation.veli_id).first()
    if veli:
        veli_e164 = _normalize_phone_safe(_phone_from_veli(veli, ogrenci))
    else:
        fallback = (getattr(ogrenci, 'veli_telefon', '') or '').strip()
        veli_e164 = _normalize_phone_safe(fallback)

    return student_e164, veli_e164


def _should_block_phone_sync(
    conversation: Conversation,
    old_e164: str,
    new_e164: str,
    student_e164: str | None,
    veli_e164: str | None,
) -> bool:
    """
    Yanlış tarafa contact_phone taşınmasını engeller.
    Veli thread (veli_id set): öğrenci numarasından veli numarasına onarıma izin ver.
    Öğrenci thread: veli numarasına taşınmayı engelle.
    """
    if not old_e164 or old_e164 == new_e164:
        return False

    old_is_student = bool(student_e164 and old_e164 == student_e164)
    old_is_veli = bool(veli_e164 and old_e164 == veli_e164)
    new_is_student = bool(student_e164 and new_e164 == student_e164)
    new_is_veli = bool(veli_e164 and new_e164 == veli_e164)

    if conversation.veli_id:
        # Veli thread hiçbir koşulda öğrenci numarasına kaymasın.
        if new_is_student and not new_is_veli:
            return True
        return False

    if conversation.ogrenci_id:
        # Öğrenci konuşması — veli ↔ öğrenci numarası arasında taşınma yok.
        if old_is_student and new_is_veli:
            return True
        if old_is_veli and new_is_student:
            return True
        return False

    if old_is_veli and new_is_student:
        return True
    if old_is_student and new_is_veli:
        return True
    return False


def resolve_outbound_phone(conversation) -> str:
    """Gönderim anında veli/öğrenci kaydından güncel E.164 numara."""
    raw = resolve_linked_phone(conversation)
    if raw:
        return ContactResolver.normalize(raw)
    return conversation.contact_phone


def sync_conversation_linked_phone(conversation: Conversation) -> Conversation:
    """
    Öğrenci/veli telefonu değiştiyse conversation.contact_phone güncellenir.
    Veli thread → veli telefonu; öğrenci thread → öğrenci telefonu (veli numarasına çekilmez).
    """
    raw = resolve_linked_phone(conversation)
    if not raw:
        return conversation

    try:
        e164 = ContactResolver.normalize(raw)
    except ValidationError:
        return conversation

    if conversation.contact_phone == e164:
        return conversation

    student_e164, veli_e164 = _party_phones(conversation)
    if _should_block_phone_sync(
        conversation,
        conversation.contact_phone,
        e164,
        student_e164,
        veli_e164,
    ):
        return conversation

    update_fields = ['contact_phone', 'updated_at']
    conversation.contact_phone = e164

    try:
        resolved = ContactResolver.resolve_contact(conversation.kurum_id, e164)
        if resolved.identity and conversation.contact_identity_id != resolved.identity.id:
            conversation.contact_identity = resolved.identity
            update_fields.append('contact_identity')
        if resolved.contact_type and conversation.contact_type != resolved.contact_type:
            conversation.contact_type = resolved.contact_type
            update_fields.append('contact_type')
    except ValidationError:
        pass

    conversation.save(update_fields=update_fields)
    return conversation


def sync_conversations_for_veli(veli) -> int:
    """Veli telefonu güncellenince yalnızca veli thread'lerini senkronize et."""
    from apps.communication.domain.models import Conversation

    qs = Conversation.objects.filter(
        kurum_id=veli.ogrenci.kurum_id,
        veli_id=veli.id,
    ).select_related('ogrenci', 'veli')

    count = 0
    for conversation in qs:
        sync_conversation_linked_phone(conversation)
        count += 1
    return count


def sync_conversations_for_ogrenci(ogrenci) -> int:
    """Öğrenci telefonu güncellenince veli_id olmayan öğrenci thread'lerini senkronize et."""
    from apps.communication.domain.models import Conversation

    qs = Conversation.objects.filter(
        kurum_id=ogrenci.kurum_id,
        ogrenci_id=ogrenci.id,
        veli_id__isnull=True,
    ).select_related('ogrenci', 'veli')
    for conversation in qs:
        sync_conversation_linked_phone(conversation)
    return qs.count()
