"""
Telefon normalizasyonu ve kişi eşleştirme.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from django.core.exceptions import ValidationError
from django.db.models import Q

from apps.communication.domain.enums import RecipientType
from apps.communication.domain.models import ContactIdentity
from apps.communication.infrastructure.repository import ContactIdentityRepository
from apps.kimlik.application.kisi_service import KisiService


@dataclass
class ResolvedContact:
    e164: str
    contact_type: str
    identity: ContactIdentity | None
    ogrenci_id: int | None = None
    veli_id: int | None = None
    personel_id: int | None = None
    display_name: str = ''


class ContactResolver:
    """E.164 normalizasyon ve kurum içi kişi çözümleme."""

    TR_MOBILE_PATTERN = re.compile(r'^(\+90|0)?5\d{9}$')

    # sms_bildirimleri kodları — duyuru/genel mesajlar için
    GENERAL_OPT_IN_CODES = {'duyuru', 'genel', 'general', 'announcement'}
    # Tercih kaydedilmemiş veliler için varsayılan operasyonel bildirimler
    DEFAULT_OPT_IN_CATEGORIES = GENERAL_OPT_IN_CODES | {'devamsizlik'}

    @classmethod
    def normalize(cls, phone: str) -> str:
        """Türkiye mobil numarasını E.164 (+90...) formatına çevirir."""
        if not phone:
            raise ValidationError('Telefon numarası boş olamaz.')

        digits = re.sub(r'\D', '', phone.strip())
        if digits.startswith('90') and len(digits) == 12:
            e164 = f'+{digits}'
        elif digits.startswith('0') and len(digits) == 11:
            e164 = f'+9{digits}'
        elif len(digits) == 10 and digits.startswith('5'):
            e164 = f'+90{digits}'
        elif phone.strip().startswith('+') and len(digits) >= 10:
            e164 = f'+{digits}'
        else:
            raise ValidationError(f'Geçersiz telefon formatı: {phone}')

        national = e164[3:] if e164.startswith('+90') else e164
        if not cls.TR_MOBILE_PATTERN.match(f'+90{national}' if not national.startswith('+') else national):
            if not (e164.startswith('+90') and len(e164) == 13 and e164[3] == '5'):
                raise ValidationError(f'Geçersiz TR mobil numarası: {phone}')

        return e164

    @classmethod
    def resolve_by_phone(cls, kurum_id: int, phone: str) -> ContactIdentity | None:
        """Normalize edilmiş telefona göre ContactIdentity döndürür."""
        resolved = cls.resolve_contact(kurum_id, phone)
        return resolved.identity

    @classmethod
    def _apply_entity_match(cls, match: dict) -> tuple:
        """DB lookup sonucu tek kaynak; eski identity alanları birleştirilmez."""
        ogrenci_id = match.get('ogrenci_id')
        veli_id = match.get('veli_id')
        personel_id = match.get('personel_id')
        display_name = match.get('display_name') or ''
        if veli_id:
            contact_type = RecipientType.VELI
        elif ogrenci_id:
            contact_type = RecipientType.OGRENCI
        elif personel_id:
            contact_type = RecipientType.PERSONEL
        else:
            contact_type = RecipientType.RAW_PHONE
        return ogrenci_id, veli_id, personel_id, contact_type, display_name

    @classmethod
    def resolve_contact(cls, kurum_id: int, phone: str) -> ResolvedContact:
        """
        Telefonu E.164'e çevirir, veli/öğrenci/personel ile eşleştirir,
        gerekirse ContactIdentity oluşturur.
        """
        e164 = cls.normalize(phone)
        identity = ContactIdentityRepository.get_by_e164(kurum_id, e164)

        ogrenci_id = None
        veli_id = None
        personel_id = None
        contact_type = RecipientType.RAW_PHONE
        display_name = e164

        match = cls._lookup_entities(kurum_id, e164)
        if match:
            ogrenci_id, veli_id, personel_id, contact_type, display_name = cls._apply_entity_match(match)
            kisi_id = KisiService.resolve_kisi_id_for_entity(
                ogrenci_id=ogrenci_id,
                veli_id=veli_id,
                personel_id=personel_id,
            )
            identity, _ = ContactIdentityRepository.update_or_create(
                kurum_id=kurum_id,
                e164=e164,
                defaults={
                    'ogrenci_id': ogrenci_id,
                    'veli_id': veli_id,
                    'personel_id': personel_id,
                    'kisi_id': kisi_id,
                },
            )
        elif identity:
            ogrenci_id = identity.ogrenci_id
            veli_id = identity.veli_id
            personel_id = identity.personel_id
            if veli_id and identity.veli:
                contact_type = RecipientType.VELI
                display_name = identity.veli.tam_ad
            elif ogrenci_id and identity.ogrenci:
                contact_type = RecipientType.OGRENCI
                display_name = f'{identity.ogrenci.ad} {identity.ogrenci.soyad}'.strip()
            elif personel_id and identity.personel:
                contact_type = RecipientType.PERSONEL
                display_name = f'{identity.personel.ad} {identity.personel.soyad}'.strip()

        return ResolvedContact(
            e164=e164,
            contact_type=contact_type,
            identity=identity,
            ogrenci_id=ogrenci_id,
            veli_id=veli_id,
            personel_id=personel_id,
            display_name=display_name,
        )

    @classmethod
    def refresh_identity_for_entity(cls, kurum_id: int, phone: str) -> None:
        """Veli/öğrenci telefonu değişince ContactIdentity güncelle."""
        if not phone:
            return
        try:
            cls.resolve_contact(kurum_id, phone)
        except ValidationError:
            pass

    @classmethod
    def _digits_match(cls, stored_phone: str | None, e164: str) -> bool:
        stored = re.sub(r'\D', '', stored_phone or '')
        digits = re.sub(r'\D', '', e164)
        suffix = digits[-10:] if len(digits) >= 10 else digits
        if not suffix or len(stored) < len(suffix):
            return False
        return stored.endswith(suffix)

    @classmethod
    def _lookup_entities(cls, kurum_id: int, e164: str) -> dict:
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
        from apps.personel.domain.models import Personel

        veliler = (
            OgrenciVeli.objects.filter(ogrenci__kurum_id=kurum_id)
            .exclude(telefon='')
            .select_related('ogrenci')
        )
        for veli in veliler:
            if cls._digits_match(veli.telefon, e164):
                return {
                    'veli_id': veli.id,
                    'ogrenci_id': veli.ogrenci_id,
                    'display_name': veli.tam_ad,
                }

        for ogrenci in Ogrenci.objects.filter(kurum_id=kurum_id).exclude(telefon=''):
            if cls._digits_match(ogrenci.telefon, e164):
                return {
                    'ogrenci_id': ogrenci.id,
                    'display_name': f'{ogrenci.ad} {ogrenci.soyad}'.strip(),
                }

        for personel in Personel.objects.filter(kurum_id=kurum_id):
            if cls._digits_match(personel.telefon, e164) or cls._digits_match(personel.cep_telefon, e164):
                return {
                    'personel_id': personel.id,
                    'display_name': f'{personel.ad} {personel.soyad}'.strip(),
                }

        return {}

    @classmethod
    def veli_allows_outbound(cls, veli, category: str = 'duyuru') -> bool:
        """Veli sms_bildirimleri opt-in kontrolü."""
        if not veli:
            return True
        codes = veli.sms_bildirimleri or []
        cat = category.lower().strip()
        if not codes:
            return cat in cls.DEFAULT_OPT_IN_CATEGORIES
        normalized = {str(c).lower().strip() for c in codes}
        if cat in normalized:
            return True
        if cat in ('duyuru', 'general', 'genel') and normalized & cls.GENERAL_OPT_IN_CODES:
            return True
        return False

    @classmethod
    def upsert_identity(
        cls,
        kurum_id: int,
        phone: str,
        *,
        ogrenci_id=None,
        veli_id=None,
        personel_id=None,
        label: str = '',
    ) -> tuple[ContactIdentity, list[str]]:
        """Telefon kimliği oluşturur veya günceller."""
        errors: list[str] = []
        try:
            e164 = cls.normalize(phone)
        except ValidationError as exc:
            return None, [str(exc.message if hasattr(exc, 'message') else exc)]

        existing = ContactIdentityRepository.get_by_e164(kurum_id, e164)
        if existing:
            if veli_id and existing.veli_id and existing.veli_id != veli_id:
                errors.append('Bu telefon numarası başka bir veliye atanmış.')
                return existing, errors
            if ogrenci_id and existing.ogrenci_id and existing.ogrenci_id != ogrenci_id:
                errors.append('Bu telefon numarası başka bir öğrenciye atanmış.')
                return existing, errors

        identity, _ = ContactIdentityRepository.update_or_create(
            kurum_id=kurum_id,
            e164=e164,
            defaults={
                'ogrenci_id': ogrenci_id,
                'veli_id': veli_id,
                'personel_id': personel_id,
                'label': label,
                'kisi_id': KisiService.resolve_kisi_id_for_entity(
                    ogrenci_id=ogrenci_id,
                    veli_id=veli_id,
                    personel_id=personel_id,
                ),
            },
        )
        return identity, errors
