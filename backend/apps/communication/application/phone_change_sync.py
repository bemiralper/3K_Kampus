"""
Öğrenci/veli telefonu değişince iletişim kayıtlarını otomatik günceller.

ContactIdentity, Conversation.contact_phone ve gönderim hedefi tek kaynaktan
(ogrenci/veli kaydı) türetilir.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError

from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.domain.enums import RecipientType
from apps.communication.domain.models import ContactIdentity, Conversation


def _safe_normalize(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        return ContactResolver.normalize(raw)
    except ValidationError:
        return None


def reconcile_phone(kurum_id: int, raw_phone: str | None) -> None:
    """Eski numara artık kimseye ait değilse identity temizlenir; varsa yeniden eşlenir."""
    if not raw_phone:
        return
    e164 = _safe_normalize(raw_phone)
    if not e164:
        return
    match = ContactResolver._lookup_entities(kurum_id, e164)
    if match:
        ContactResolver.resolve_contact(kurum_id, raw_phone)
        return
    ContactIdentity.objects.filter(kurum_id=kurum_id, e164=e164).update(
        ogrenci_id=None,
        veli_id=None,
        personel_id=None,
    )


def force_conversation_to_phone(conversation: Conversation, raw_phone: str) -> Conversation:
    """Numara değişikliğinde thread'i zorla güncel telefona taşır (çapraz koruma yok)."""
    e164 = _safe_normalize(raw_phone)
    if not e164 or conversation.contact_phone == e164:
        return conversation

    update_fields = ['contact_phone', 'updated_at']
    conversation.contact_phone = e164

    try:
        resolved = ContactResolver.resolve_contact(conversation.kurum_id, raw_phone)
        if resolved.identity:
            conversation.contact_identity = resolved.identity
            update_fields.append('contact_identity')
    except ValidationError:
        pass

    if conversation.veli_id:
        conversation.contact_type = RecipientType.VELI
        update_fields.append('contact_type')
    elif conversation.ogrenci_id:
        conversation.contact_type = RecipientType.OGRENCI
        update_fields.append('contact_type')

    conversation.save(update_fields=update_fields)
    return conversation


class PhoneChangeSync:
    """Öğrenci/veli telefon değişikliği yan etkileri."""

    @classmethod
    def on_veli_saved(cls, veli, *, old_phone: str | None = None) -> None:
        ogrenci = getattr(veli, 'ogrenci', None)
        if ogrenci is None and veli.ogrenci_id:
            from apps.ogrenci.domain.models import Ogrenci

            ogrenci = Ogrenci.objects.filter(id=veli.ogrenci_id).first()
        if not ogrenci or not ogrenci.kurum_id:
            return

        kurum_id = ogrenci.kurum_id
        new_phone = (veli.telefon or '').strip()

        if veli.varsayilan:
            update_fields = ['veli_ad_soyad', 'updated_at']
            ogrenci.veli_ad_soyad = f'{veli.ad} {veli.soyad}'.strip()
            # Boş veli telefonu legacy ogrenci.veli_telefon alanını silmemeli
            if new_phone:
                ogrenci.veli_telefon = new_phone
                update_fields.insert(0, 'veli_telefon')
            ogrenci.save(update_fields=update_fields)

        conversations = Conversation.objects.filter(kurum_id=kurum_id, veli_id=veli.id)
        if new_phone:
            for conversation in conversations:
                force_conversation_to_phone(conversation, new_phone)
            ContactResolver.refresh_identity_for_entity(kurum_id, new_phone)
        else:
            from apps.communication.application.conversation_phone_sync import (
                sync_conversation_linked_phone,
            )

            for conversation in conversations:
                sync_conversation_linked_phone(conversation)

        old_normalized = (old_phone or '').strip()
        if old_normalized and old_normalized != new_phone:
            reconcile_phone(kurum_id, old_normalized)

    @classmethod
    def on_ogrenci_saved(cls, ogrenci, *, old_phone: str | None = None) -> None:
        if not ogrenci.kurum_id:
            return

        kurum_id = ogrenci.kurum_id
        new_phone = (ogrenci.telefon or '').strip()

        conversations = Conversation.objects.filter(
            kurum_id=kurum_id,
            ogrenci_id=ogrenci.id,
            veli_id__isnull=True,
        )
        if new_phone:
            for conversation in conversations:
                force_conversation_to_phone(conversation, new_phone)
            ContactResolver.refresh_identity_for_entity(kurum_id, new_phone)
        else:
            from apps.communication.application.conversation_phone_sync import (
                sync_conversation_linked_phone,
            )

            for conversation in conversations:
                sync_conversation_linked_phone(conversation)

        old_normalized = (old_phone or '').strip()
        if old_normalized and old_normalized != new_phone:
            reconcile_phone(kurum_id, old_normalized)

    @classmethod
    def on_veli_deleted(cls, veli, *, phone: str | None = None) -> None:
        ogrenci = getattr(veli, 'ogrenci', None)
        kurum_id = ogrenci.kurum_id if ogrenci else None
        if not kurum_id:
            return
        raw = (phone or getattr(veli, 'telefon', '') or '').strip()
        if raw:
            reconcile_phone(kurum_id, raw)
