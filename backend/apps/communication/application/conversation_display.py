"""
Sohbet / bildirimde gösterilecek kişi adı.
Kayıtlı veli / öğrenci / personel varsa telefon yerine isim döner.
"""
from __future__ import annotations

import re

from apps.communication.domain.enums import RecipientType


def looks_like_phone(value: str | None, contact_phone: str | None = None) -> bool:
    """Kayıtlı isim mi yoksa telefon mu — contact_name'e telefon yazılmışsa ayırt et."""
    if not value:
        return True
    text = str(value).strip()
    if not text:
        return True
    phone = (contact_phone or '').strip()
    digits = re.sub(r'\D', '', text)
    phone_digits = re.sub(r'\D', '', phone)
    if phone and (text == phone or (phone_digits and digits == phone_digits)):
        return True
    if text.startswith('+') and len(digits) >= 10:
        return True
    # Neredeyse tamamen rakam (+, boşluk, tire hariç)
    if len(digits) >= 10 and len(digits) >= len(re.sub(r'[\s\-\(\)]', '', text)) - 1:
        return True
    return False


def _name_from_linked_entities(conversation) -> str:
    if conversation.veli_id:
        veli = getattr(conversation, 'veli', None)
        if veli is None:
            from apps.ogrenci.domain.models import OgrenciVeli
            veli = OgrenciVeli.objects.filter(id=conversation.veli_id).first()
        if veli:
            name = (getattr(veli, 'tam_ad', None) or f'{veli.ad} {veli.soyad}').strip()
            if name and not looks_like_phone(name, conversation.contact_phone):
                return name

    if conversation.ogrenci_id:
        ogrenci = getattr(conversation, 'ogrenci', None)
        if ogrenci is None:
            from apps.ogrenci.domain.models import Ogrenci
            ogrenci = Ogrenci.objects.filter(id=conversation.ogrenci_id).first()
        if ogrenci:
            name = f'{ogrenci.ad} {ogrenci.soyad}'.strip()
            if name and not looks_like_phone(name, conversation.contact_phone):
                return name

    identity = getattr(conversation, 'contact_identity', None)
    if identity is None and conversation.contact_identity_id:
        from apps.communication.domain.models import ContactIdentity
        identity = ContactIdentity.objects.filter(
            id=conversation.contact_identity_id,
        ).select_related('veli', 'ogrenci', 'personel').first()

    contact_type = getattr(conversation, 'contact_type', '')

    # Personel eşiği: aynı telefon numarası öğrenci/veli ile paylaşılabilir —
    # identity üzerinde birden fazla bağ varsa bu thread'in contact_type'ına
    # göre doğru kaydı önceliklendir (ör. identity.ogrenci dolu diye personel
    # sohbetinde öğrenci adı gösterilmemeli).
    if contact_type == RecipientType.PERSONEL:
        if identity and identity.personel_id and getattr(identity, 'personel', None):
            p = identity.personel
            name = (getattr(p, 'tam_ad', None) or f'{p.ad} {p.soyad}').strip()
            if name:
                return name
        subject = (conversation.subject or '').strip()
        if subject and not looks_like_phone(subject, conversation.contact_phone):
            return subject

    if identity:
        if identity.veli_id and getattr(identity, 'veli', None):
            name = (identity.veli.tam_ad or '').strip()
            if name:
                return name
        if identity.ogrenci_id and getattr(identity, 'ogrenci', None):
            o = identity.ogrenci
            name = f'{o.ad} {o.soyad}'.strip()
            if name:
                return name
        if identity.personel_id and getattr(identity, 'personel', None):
            p = identity.personel
            name = (getattr(p, 'tam_ad', None) or f'{p.ad} {p.soyad}').strip()
            if name:
                return name

    if contact_type == RecipientType.PERSONEL:
        subject = (conversation.subject or '').strip()
        if subject and not looks_like_phone(subject, conversation.contact_phone):
            return subject

    return ''


def resolve_conversation_display_name(
    conversation,
    *,
    wa_profile_name: str = '',
    allow_live_lookup: bool = True,
    lookup_cache: dict | None = None,
) -> str:
    """
    Öncelik: bağlı kayıt → geçerli contact_name/subject → canlı telefon eşlemesi
    → WhatsApp profil adı → telefon.

    `lookup_cache` verilirse (ör. sohbet listesi serializer'ının request-scoped
    context'i), canlı telefon eşlemesi her satır için veli/öğrenci/personel
    tablolarını taramak yerine kurum başına tek seferlik oluşturulan
    (`ContactResolver.build_kurum_lookup_maps`) haritayı kullanır — hem N+1
    sorgu hem de GET isteğinde ContactIdentity yazma yan etkisi engellenmiş
    olur. `lookup_cache` verilmezse eski davranış (tekil, yazma yapan
    `ContactResolver.resolve_contact`) korunur — router/webhook gibi tekil
    akışlar için uygundur.
    """
    linked = _name_from_linked_entities(conversation)
    if linked:
        return linked

    stored = (getattr(conversation, 'contact_name', None) or '').strip()
    if stored and not looks_like_phone(stored, conversation.contact_phone):
        return stored

    subject = (getattr(conversation, 'subject', None) or '').strip()
    if subject and not looks_like_phone(subject, conversation.contact_phone):
        return subject

    if allow_live_lookup and conversation.contact_phone and conversation.kurum_id:
        try:
            from apps.communication.application.contact_resolver import ContactResolver
            if lookup_cache is not None:
                maps = lookup_cache.get(conversation.kurum_id)
                if maps is None:
                    maps = ContactResolver.get_kurum_lookup_maps(conversation.kurum_id)
                    lookup_cache[conversation.kurum_id] = maps
                name = ContactResolver.lookup_display_name(
                    conversation.kurum_id, conversation.contact_phone, maps,
                ).strip()
            else:
                resolved = ContactResolver.resolve_contact(
                    conversation.kurum_id,
                    conversation.contact_phone,
                )
                name = (resolved.display_name or '').strip()
            if name and not looks_like_phone(name, conversation.contact_phone):
                return name
        except Exception:
            pass

    profile = (wa_profile_name or '').strip()
    if profile and not looks_like_phone(profile, conversation.contact_phone):
        return profile

    return (conversation.contact_phone or '').strip() or 'WhatsApp'


def sync_conversation_display_name(
    conversation,
    *,
    wa_profile_name: str = '',
    save: bool = True,
) -> str:
    """İsmi hesapla; gerçek isimse contact_name alanına yazar (telefon yazmaz)."""
    name = resolve_conversation_display_name(
        conversation,
        wa_profile_name=wa_profile_name,
        allow_live_lookup=True,
    )
    if name and not looks_like_phone(name, conversation.contact_phone):
        if conversation.contact_name != name:
            conversation.contact_name = name[:255]
            if save:
                conversation.save(update_fields=['contact_name', 'updated_at'])
    elif looks_like_phone(conversation.contact_name, conversation.contact_phone):
        # Eskiden telefona yazılmış contact_name'i temizle ki serializer tekrar çözümlesin
        if conversation.contact_name:
            conversation.contact_name = ''
            if save:
                conversation.save(update_fields=['contact_name', 'updated_at'])
    return name
