"""
Telefon normalizasyonu ve kişi eşleştirme.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from django.core.cache import cache
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

    # Telefon → kişi haritası kurum başına cache'lenir; veli/öğrenci telefonu
    # değişince PhoneChangeSync tarafından geçersiz kılınır.
    LOOKUP_MAP_CACHE_TTL = 60

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
    def _phone_suffix(cls, phone: str | None) -> str | None:
        digits = re.sub(r'\D', '', phone or '')
        return digits[-10:] if len(digits) >= 10 else None

    @classmethod
    def build_kurum_lookup_maps(cls, kurum_id: int) -> dict:
        """
        Kurum genelinde telefon-son-10-hane → kişi eşleme tabloları.

        Sohbet listesi gibi çok satırlı gösterimlerde her satır için ayrı ayrı
        veli/öğrenci/personel tablolarını taramak yerine (N+1) tek seferlik
        oluşturulup istek boyunca (request-scoped) yeniden kullanılmak üzere
        tasarlanmıştır. `_digits_match` ile aynı eşleşme kuralını uygular:
        son 10 hane eşleşirse kişi bulunmuş sayılır.
        """
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
        from apps.personel.domain.models import Personel

        veli_map: dict[str, dict] = {}
        # Varsayılan veli önce — aynı telefon birden fazla çocukta varsa önce o bağlanır.
        for veli_id, ogrenci_id, ad, soyad, telefon, telefonlar in (
            OgrenciVeli.objects.filter(ogrenci__kurum_id=kurum_id)
            .order_by('-varsayilan', 'id')
            .values_list('id', 'ogrenci_id', 'ad', 'soyad', 'telefon', 'telefonlar')
        ):
            phones = [telefon] if telefon else []
            if isinstance(telefonlar, list):
                for item in telefonlar:
                    if isinstance(item, dict) and item.get('numara'):
                        phones.append(item['numara'])
                    elif isinstance(item, str) and item.strip():
                        phones.append(item)
            for phone in phones:
                suffix = cls._phone_suffix(phone)
                if not suffix:
                    continue
                if suffix not in veli_map:
                    veli_map[suffix] = {
                        'veli_id': veli_id,
                        'ogrenci_id': ogrenci_id,
                        'display_name': f'{ad} {soyad}'.strip(),
                        'sibling_ogrenci_ids': [ogrenci_id] if ogrenci_id else [],
                    }
                elif ogrenci_id:
                    siblings = veli_map[suffix].setdefault('sibling_ogrenci_ids', [])
                    if ogrenci_id not in siblings:
                        siblings.append(ogrenci_id)

        ogrenci_map: dict[str, dict] = {}
        for ogrenci_id, ad, soyad, telefon in (
            Ogrenci.objects.filter(kurum_id=kurum_id)
            .exclude(telefon='')
            .order_by('id')
            .values_list('id', 'ad', 'soyad', 'telefon')
        ):
            suffix = cls._phone_suffix(telefon)
            if suffix and suffix not in ogrenci_map:
                ogrenci_map[suffix] = {
                    'ogrenci_id': ogrenci_id,
                    'display_name': f'{ad} {soyad}'.strip(),
                }

        personel_map: dict[str, dict] = {}
        for personel_id, ad, soyad, telefon, cep_telefon in (
            Personel.objects.filter(kurum_id=kurum_id)
            .order_by('id')
            .values_list('id', 'ad', 'soyad', 'telefon', 'cep_telefon')
        ):
            display_name = f'{ad} {soyad}'.strip()
            for phone in (telefon, cep_telefon):
                suffix = cls._phone_suffix(phone)
                if suffix and suffix not in personel_map:
                    personel_map[suffix] = {
                        'personel_id': personel_id,
                        'display_name': display_name,
                    }

        return {'veli': veli_map, 'ogrenci': ogrenci_map, 'personel': personel_map}

    @staticmethod
    def _lookup_map_cache_key(kurum_id: int) -> str:
        return f'comm:contact_lookup_maps:{kurum_id}'

    @classmethod
    def get_kurum_lookup_maps(cls, kurum_id: int) -> dict:
        """Cache'li `build_kurum_lookup_maps` — istek başına yeniden kurulmaz."""
        key = cls._lookup_map_cache_key(kurum_id)
        maps = cache.get(key)
        if maps is None:
            maps = cls.build_kurum_lookup_maps(kurum_id)
            cache.set(key, maps, cls.LOOKUP_MAP_CACHE_TTL)
        return maps

    @classmethod
    def invalidate_kurum_lookup_maps(cls, kurum_id: int) -> None:
        cache.delete(cls._lookup_map_cache_key(kurum_id))

    @classmethod
    def lookup_display_name(cls, kurum_id: int, phone: str, maps: dict) -> str:
        """`build_kurum_lookup_maps` çıktısı üzerinden yalnızca isim çözer (yazma yapmaz)."""
        try:
            e164 = cls.normalize(phone)
        except ValidationError:
            return ''
        suffix = cls._phone_suffix(e164)
        if not suffix:
            return ''
        entry = maps['veli'].get(suffix) or maps['ogrenci'].get(suffix) or maps['personel'].get(suffix)
        return (entry or {}).get('display_name') or ''

    @classmethod
    def _lookup_entities(cls, kurum_id: int, e164: str) -> dict:
        """
        Telefon → veli / öğrenci / personel eşlemesi.

        Kurum haritası üzerinden çalışır (`get_kurum_lookup_maps`); her çağrıda
        veli/öğrenci/personel tablolarını Python'da taramak yerine cache'li
        son-10-hane indeksinden okur. Eşleşme kuralı `_digits_match` ile aynıdır.
        """
        suffix = cls._phone_suffix(e164)
        if not suffix:
            return {}
        maps = cls.get_kurum_lookup_maps(kurum_id)
        for bucket in ('veli', 'ogrenci', 'personel'):
            entry = maps.get(bucket, {}).get(suffix)
            if entry:
                return dict(entry)
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
