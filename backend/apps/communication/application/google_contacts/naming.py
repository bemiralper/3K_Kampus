"""Öğrenci ve veli kayıtlarını Google kişi kartına çevirir."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from apps.communication.application.contact_resolver import ContactResolver

GROUP_STUDENTS = '3K - Öğrenciler'
GROUP_PARENTS = '3K - Veliler'


@dataclass
class DesiredContact:
    display_name: str
    given_name: str
    family_name: str
    phones: list[str]
    biography: str
    group_kind: str

    @property
    def phone_e164(self) -> str:
        return self.phones[0] if self.phones else ''

    @property
    def content_hash(self) -> str:
        payload = {
            'name': self.display_name,
            'phones': self.phones,
            'bio': self.biography,
            'group': self.group_kind,
        }
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(raw.encode('utf-8')).hexdigest()

    def person_body(self) -> dict:
        phone_numbers = [
            {'value': number, 'type': 'mobile' if index == 0 else 'other'}
            for index, number in enumerate(self.phones)
        ]
        return {
            'names': [{
                'givenName': self.given_name[:200],
                'familyName': self.family_name[:200],
                'unstructuredName': self.display_name[:300],
            }],
            'phoneNumbers': phone_numbers,
            'biographies': [{
                'value': self.biography[:2000],
                'contentType': 'TEXT_PLAIN',
            }],
        }


def normalize_numbers(raw_numbers: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for raw in raw_numbers:
        text = (raw or '').strip()
        if not text:
            continue
        try:
            e164 = ContactResolver.normalize(text)
        except Exception:
            continue
        if e164 in seen:
            continue
        seen.add(e164)
        result.append(e164)
    return result


def class_label(ogrenci) -> str:
    prefetched = getattr(ogrenci, 'aktif_kayitlar', None)
    if prefetched is not None:
        for kayit in prefetched:
            sinif = getattr(kayit, 'sinif', None)
            if sinif is not None and getattr(sinif, 'ad', ''):
                return sinif.ad
        return ''
    from apps.ogrenci.domain.models import OgrenciKayit

    kayit = (
        OgrenciKayit.objects.filter(ogrenci_id=ogrenci.id, aktif_mi=True, sinif__isnull=False)
        .select_related('sinif')
        .order_by('-id')
        .first()
    )
    if kayit and kayit.sinif_id:
        return kayit.sinif.ad or ''
    return ''


def _join_bio(parts: list[str]) -> str:
    return ' · '.join(part for part in parts if part)


def student_desired(ogrenci, *, sinif_ad: str = '', sube_ad: str = '') -> DesiredContact | None:
    phones = normalize_numbers([getattr(ogrenci, 'telefon', '')])
    if not phones:
        return None
    ad = (ogrenci.ad or '').strip()
    soyad = (ogrenci.soyad or '').strip()
    full = f'{ad} {soyad}'.strip() or 'Öğrenci'
    display = f'{full} [Öğrenci]'
    bio = _join_bio([
        'Öğrenci',
        f'Sınıf: {sinif_ad}' if sinif_ad else '',
        f'Şube: {sube_ad}' if sube_ad else '',
    ])
    return DesiredContact(
        display_name=display,
        given_name=ad or full,
        family_name=f'{soyad} [Öğrenci]'.strip(),
        phones=phones,
        biography=bio,
        group_kind='students',
    )


def _veli_numbers(veli, ogrenci) -> list[str]:
    raw: list[str] = []
    phone = (getattr(veli, 'telefon', '') or '').strip()
    if phone:
        raw.append(phone)
    telefonlar = getattr(veli, 'telefonlar', None) or []
    if isinstance(telefonlar, list):
        for item in telefonlar:
            if not isinstance(item, dict):
                continue
            number = (item.get('numara') or item.get('telefon') or '').strip()
            if number:
                raw.append(number)
    if not raw:
        from apps.ogrenci.application.veli_contact import effective_veli_phone
        fallback = effective_veli_phone(veli, ogrenci)
        if fallback:
            raw.append(fallback)
    return normalize_numbers(raw)


def parent_desired(veli, ogrenci, *, sinif_ad: str = '') -> DesiredContact | None:
    phones = _veli_numbers(veli, ogrenci)
    if not phones:
        return None
    student_name = f'{(ogrenci.ad or "").strip()} {(ogrenci.soyad or "").strip()}'.strip() or 'Öğrenci'
    try:
        role = veli.get_veli_turu_display() or 'Veli'
    except Exception:
        role = 'Veli'
    ad = (veli.ad or '').strip()
    soyad = (veli.soyad or '').strip()
    full = f'{ad} {soyad}'.strip() or 'Veli'
    display = f'{full} [{student_name} - {role}]'
    bio = _join_bio([
        'Veli',
        student_name,
        role,
        f'Sınıf: {sinif_ad}' if sinif_ad else '',
    ])
    return DesiredContact(
        display_name=display[:300],
        given_name=ad or full,
        family_name=f'{soyad} [{student_name} - {role}]'.strip(),
        phones=phones,
        biography=bio,
        group_kind='parents',
    )


def legacy_parent_desired(ogrenci, *, sinif_ad: str = '') -> DesiredContact | None:
    phones = normalize_numbers([getattr(ogrenci, 'veli_telefon', '')])
    if not phones:
        return None
    raw_name = (getattr(ogrenci, 'veli_ad_soyad', '') or '').strip()
    parts = raw_name.split()
    if len(parts) >= 2:
        ad = ' '.join(parts[:-1])
        soyad = parts[-1]
    else:
        ad = raw_name or 'Veli'
        soyad = ''
    student_name = f'{(ogrenci.ad or "").strip()} {(ogrenci.soyad or "").strip()}'.strip() or 'Öğrenci'
    yakinlik = (getattr(ogrenci, 'veli_yakinlik', '') or '').strip()
    if yakinlik:
        try:
            role = ogrenci.get_veli_yakinlik_display() or 'Veli'
        except Exception:
            role = 'Veli'
    else:
        role = 'Veli'
    full = f'{ad} {soyad}'.strip()
    display = f'{full} [{student_name} - {role}]'
    return DesiredContact(
        display_name=display[:300],
        given_name=ad or full,
        family_name=f'{soyad} [{student_name} - {role}]'.strip(),
        phones=phones,
        biography=_join_bio(['Veli', student_name, role, f'Sınıf: {sinif_ad}' if sinif_ad else '']),
        group_kind='parents',
    )
