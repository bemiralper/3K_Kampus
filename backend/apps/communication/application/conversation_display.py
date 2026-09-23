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


def _sibling_student_ids_by_phone(kurum_id: int, suffix: str, *, only_active: bool = True) -> list[int]:
    """Aynı veli telefonuna bağlı öğrenciler — kurum haritasından (P-01).

    Eski uygulama ilk 80 veli satırını Python'da tarıyordu; büyük kurumda hem
    yavaş hem eksikti. Harita 60 sn cache'li, telefon değişince invalidasyonlu.
    `only_active` ise pasif öğrenciler tek sorguyla ayıklanır; toplu çözümde
    çağıran taraf bunu kendi yapar.
    """
    if not suffix or len(suffix) < 10:
        return []
    from apps.communication.application.contact_resolver import ContactResolver

    maps = ContactResolver.get_kurum_lookup_maps(kurum_id)
    entry = (maps.get('veli') or {}).get(suffix) or {}
    ids = [int(x) for x in entry.get('sibling_ogrenci_ids') or [] if x]
    if ids and only_active:
        from apps.ogrenci.domain.models import Ogrenci

        active = set(Ogrenci.objects.filter(id__in=ids, aktif_mi=True).values_list('id', flat=True))
        ids = [i for i in ids if i in active]
    return ids


def prefetch_linked_student_names(conversations) -> dict:
    """Bir sayfa sohbet için bağlı öğrenci adlarını toplu çöz: {conversation_id: [ad, ...]}.

    Satır başına 1–3 sorgu yerine sayfa başına ≤3 sorgu (P-01). Sonuç
    `ConversationListSerializer` context'ine `_linked_names` olarak verilir.
    """
    from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli

    rows = list(conversations)
    if not rows:
        return {}
    kurum_ids = {c.kurum_id for c in rows}

    # Kardeş adayları: kisi_id ile bağlı veliler
    kisi_ids = {
        getattr(getattr(c, 'veli', None), 'kisi_id', None)
        for c in rows if c.veli_id and getattr(c, 'veli', None) is not None
    }
    kisi_ids.discard(None)
    kisi_to_students: dict[int, list[int]] = {}
    if kisi_ids:
        for kisi_id, ogrenci_id in OgrenciVeli.objects.filter(
            ogrenci__kurum_id__in=kurum_ids,
            ogrenci__aktif_mi=True,
            kisi_id__in=kisi_ids,
        ).values_list('kisi_id', 'ogrenci_id'):
            kisi_to_students.setdefault(kisi_id, []).append(ogrenci_id)

    # Telefon üzerinden kardeşler (kisi_id yoksa) — kurum haritası
    phone_students: dict[tuple, list[int]] = {}
    student_ids: set[int] = set()
    for c in rows:
        if c.ogrenci_id:
            student_ids.add(c.ogrenci_id)
        veli = getattr(c, 'veli', None) if c.veli_id else None
        if veli is None:
            continue
        if veli.ogrenci_id:
            student_ids.add(veli.ogrenci_id)
        if veli.kisi_id:
            student_ids.update(kisi_to_students.get(veli.kisi_id, []))
        else:
            suffix = re.sub(r'\D', '', veli.telefon or '')[-10:]
            if len(suffix) < 10:
                suffix = re.sub(r'\D', '', c.contact_phone or '')[-10:]
            ids = _sibling_student_ids_by_phone(c.kurum_id, suffix, only_active=False)
            phone_students[(c.kurum_id, suffix)] = ids
            student_ids.update(ids)

    phone_derived = {oid for ids in phone_students.values() for oid in ids}
    names_by_id = {}
    for oid, ad, soyad, aktif in Ogrenci.objects.filter(id__in=student_ids).values_list(
        'id', 'ad', 'soyad', 'aktif_mi',
    ):
        if oid in phone_derived and not aktif:
            continue
        names_by_id[oid] = f'{ad} {soyad}'.strip()

    result: dict = {}
    for c in rows:
        ordered: list[int] = []
        if c.ogrenci_id:
            ordered.append(c.ogrenci_id)
        veli = getattr(c, 'veli', None) if c.veli_id else None
        if veli is not None:
            if veli.ogrenci_id:
                ordered.append(veli.ogrenci_id)
            if veli.kisi_id:
                ordered.extend(kisi_to_students.get(veli.kisi_id, []))
            else:
                suffix = re.sub(r'\D', '', veli.telefon or '')[-10:]
                if len(suffix) < 10:
                    suffix = re.sub(r'\D', '', c.contact_phone or '')[-10:]
                ordered.extend(phone_students.get((c.kurum_id, suffix), []))
        seen: set[int] = set()
        names: list[str] = []
        for oid in ordered:
            if oid in seen:
                continue
            seen.add(oid)
            label = names_by_id.get(oid, '')
            if label:
                names.append(label)
        result[str(c.id)] = names
    return result


def linked_student_names_for_conversation(conversation, *, cache: dict | None = None) -> list[str]:
    """
    Veli sohbetinde bağlı öğrenci(ler)in adları.
    Aynı telefon / merkezi kişi ile birden fazla çocuk varsa hepsini döner.

    `cache` (`prefetch_linked_student_names` çıktısı) verilirse sorgu açılmaz.
    """
    if cache is not None and str(conversation.id) in cache:
        return list(cache[str(conversation.id)])

    from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli

    names: list[str] = []
    seen: set[int] = set()

    def _add(ogrenci) -> None:
        if not ogrenci or ogrenci.id in seen:
            return
        label = f'{ogrenci.ad} {ogrenci.soyad}'.strip()
        if not label:
            return
        seen.add(ogrenci.id)
        names.append(label)

    if conversation.ogrenci_id:
        ogrenci = getattr(conversation, 'ogrenci', None)
        if ogrenci is None:
            ogrenci = Ogrenci.objects.filter(id=conversation.ogrenci_id).first()
        _add(ogrenci)

    veli = getattr(conversation, 'veli', None) if conversation.veli_id else None
    if conversation.veli_id and veli is None:
        veli = OgrenciVeli.objects.filter(id=conversation.veli_id).select_related('ogrenci').first()
    if veli:
        _add(getattr(veli, 'ogrenci', None))
        if veli.kisi_id:
            sibling_qs = (
                OgrenciVeli.objects.filter(
                    ogrenci__kurum_id=conversation.kurum_id,
                    ogrenci__aktif_mi=True,
                    kisi_id=veli.kisi_id,
                )
                .select_related('ogrenci')[:12]
            )
            for row in sibling_qs:
                _add(row.ogrenci)
        else:
            # Telefon üzerinden kardeşler: kurum haritası (ilk-80-satır taraması kaldırıldı)
            suffix = re.sub(r'\D', '', veli.telefon or '')[-10:]
            if len(suffix) < 10:
                suffix = re.sub(r'\D', '', conversation.contact_phone or '')[-10:]
            sibling_ids = _sibling_student_ids_by_phone(conversation.kurum_id, suffix)
            if sibling_ids:
                for o in Ogrenci.objects.filter(id__in=sibling_ids).order_by('id'):
                    _add(o)

    return names
