"""Öğrenci ve veli kayıtlarını Google kişi kartına çevirir."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from io import BytesIO

from apps.communication.application.contact_resolver import ContactResolver

GROUP_STUDENTS = '3K - Öğrenciler'
GROUP_PARENTS = '3K - Veliler'
GROUP_TEACHERS = '3K - Öğretmenler'
GROUP_STAFF = '3K - Personel'


def group_name_for(kind: str) -> str:
    fixed = {
        'students': GROUP_STUDENTS,
        'parents': GROUP_PARENTS,
        'teachers': GROUP_TEACHERS,
        'staff': GROUP_STAFF,
    }
    if kind in fixed:
        return fixed[kind]
    if kind.startswith('role:'):
        label = ' '.join(kind.split(':', 1)[1].split())[:60] or 'Personel'
        return f'3K - {label}'
    return GROUP_STAFF


@dataclass
class DesiredContact:
    display_name: str
    given_name: str
    family_name: str
    phones: list[str]
    biography: str
    group_kind: str
    group_kinds: tuple[str, ...] = ()
    photo_digest: str = ''
    photo_field: object = None

    @property
    def phone_e164(self) -> str:
        return self.phones[0] if self.phones else ''

    def label_kinds(self) -> list[str]:
        if self.group_kinds:
            return list(self.group_kinds)
        return [self.group_kind]

    @property
    def content_hash(self) -> str:
        payload = {
            'name': self.display_name,
            'phones': self.phones,
            'bio': self.biography,
            'group': ','.join(self.label_kinds()),
        }
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        digest = hashlib.sha256(raw.encode('utf-8')).hexdigest()
        if self.photo_digest:
            return f'{digest[:43]}|{self.photo_digest[:20]}'
        return digest

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


def _active_enrollment(ogrenci):
    prefetched = getattr(ogrenci, 'aktif_kayitlar', None)
    if prefetched is not None:
        return prefetched[0] if prefetched else None
    from apps.ogrenci.domain.models import OgrenciKayit

    return (
        OgrenciKayit.objects.filter(ogrenci_id=ogrenci.id, aktif_mi=True)
        .select_related('sinif', 'egitim_yili')
        .order_by('-id')
        .first()
    )


def enrollment_context(ogrenci) -> tuple[str, str]:
    """Aktif kayıttan sınıf adı ve eğitim yılı (2025-2026)."""
    kayit = _active_enrollment(ogrenci)
    if kayit is None:
        return '', ''
    sinif = getattr(kayit, 'sinif', None)
    sinif_ad = (getattr(sinif, 'ad', '') or '') if sinif is not None else ''
    yil = ''
    egitim_yili = getattr(kayit, 'egitim_yili', None)
    if egitim_yili is not None:
        yil = (getattr(egitim_yili, 'yil_str', '') or '').strip()
        if not yil and getattr(egitim_yili, 'baslangic_yil', None):
            yil = f'{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}'
    return sinif_ad, yil


def class_label(ogrenci) -> str:
    sinif_ad, _yil = enrollment_context(ogrenci)
    return sinif_ad


def _join_bio(parts: list[str]) -> str:
    return ' · '.join(part for part in parts if part)


def student_desired(ogrenci, *, sinif_ad: str = '', sube_ad: str = '', kayit_yili: str = '') -> DesiredContact | None:
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
        f'Kayıt: {kayit_yili}' if kayit_yili else '',
    ])
    digest = photo_digest(getattr(ogrenci, 'profil_foto', None))
    return DesiredContact(
        display_name=display,
        given_name=ad or full,
        family_name=f'{soyad} [Öğrenci]'.strip(),
        phones=phones,
        biography=bio,
        group_kind='students',
        photo_digest=digest,
        photo_field=getattr(ogrenci, 'profil_foto', None) if digest else None,
    )


def photo_digest(file_field) -> str:
    if not file_field:
        return ''
    name = (getattr(file_field, 'name', '') or '').strip()
    if not name:
        return ''
    try:
        size = int(file_field.size)
    except Exception:
        return ''
    raw = f'{name}:{size}'.encode()
    return hashlib.sha256(raw).hexdigest()[:20]


def contact_photo_bytes(file_field) -> bytes | None:
    """Google kişi fotoğrafı için küçültülmüş JPEG. Dosya yoksa None."""
    if not file_field:
        return None
    try:
        file_field.open('rb')
        raw = file_field.read()
    except Exception:
        return None
    finally:
        try:
            file_field.close()
        except Exception:
            pass
    if not raw:
        return None
    try:
        from PIL import Image, ImageOps

        image = ImageOps.exif_transpose(Image.open(BytesIO(raw)))
        image.thumbnail((720, 720))
        if image.mode != 'RGB':
            image = image.convert('RGB')
        out = BytesIO()
        image.save(out, format='JPEG', quality=82, optimize=True)
        return out.getvalue() or None
    except Exception:
        if len(raw) <= 900_000:
            return raw
        return None


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


def parent_desired(veli, ogrenci, *, sinif_ad: str = '', kayit_yili: str = '') -> DesiredContact | None:
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
        f'Kayıt: {kayit_yili}' if kayit_yili else '',
    ])
    return DesiredContact(
        display_name=display[:300],
        given_name=ad or full,
        family_name=f'{soyad} [{student_name} - {role}]'.strip(),
        phones=phones,
        biography=bio,
        group_kind='parents',
    )


def legacy_parent_desired(ogrenci, *, sinif_ad: str = '', kayit_yili: str = '') -> DesiredContact | None:
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
        biography=_join_bio([
            'Veli',
            student_name,
            role,
            f'Sınıf: {sinif_ad}' if sinif_ad else '',
            f'Kayıt: {kayit_yili}' if kayit_yili else '',
        ]),
        group_kind='parents',
    )


def _is_teacher_role(rol) -> bool:
    if rol is None:
        return False
    code = (getattr(rol, 'code', '') or '').casefold()
    name = (getattr(rol, 'name', '') or '').casefold()
    return 'ogretmen' in code or 'öğretmen' in name or 'ogretmen' in name


def _staff_assignments(personel) -> list:
    prefetched = getattr(personel, 'aktif_gorevler', None)
    if prefetched is not None:
        rows = list(prefetched)
    else:
        rows = list(
            personel.gorevlendirmeler.filter(aktif_mi=True).select_related(
                'rol', 'brans', 'egitim_yili', 'gorev_sube',
            )
        )
    current = [
        row for row in rows
        if getattr(getattr(row, 'egitim_yili', None), 'aktif_mi', False)
    ]
    return current or rows


def staff_desired(personel) -> DesiredContact | None:
    """Öğretmeni branşıyla, diğer personeli görev adıyla kişi kartına çevirir."""
    if not getattr(personel, 'aktif_mi', True):
        return None
    phones = normalize_numbers([
        getattr(personel, 'cep_telefon', '') or '',
        getattr(personel, 'telefon', '') or '',
    ])
    if not phones:
        return None
    assignments = _staff_assignments(personel)
    branches: list[str] = []
    roles = []
    teacher = False
    for row in assignments:
        brans = getattr(row, 'brans', None)
        brans_ad = (getattr(brans, 'ad', '') or '').strip() if brans is not None else ''
        if brans_ad and brans_ad not in branches:
            branches.append(brans_ad)
            teacher = True
        rol = getattr(row, 'rol', None)
        if rol is not None and rol not in roles:
            roles.append(rol)
        if _is_teacher_role(rol):
            teacher = True
    other_roles = [rol for rol in roles if not _is_teacher_role(rol)]
    other_roles.sort(key=lambda rol: (getattr(rol, 'level', 100) or 100, getattr(rol, 'name', '') or ''))
    if teacher:
        tag = ', '.join(branches) if branches else 'Öğretmen'
        kinds = ['teachers']
        for rol in other_roles:
            kind = f'role:{(rol.name or "").strip()}'
            if kind not in kinds:
                kinds.append(kind)
        bio_parts = ['Öğretmen']
        if branches:
            bio_parts.append(f'Branş: {", ".join(branches)}')
        if other_roles:
            bio_parts.append('Görev: ' + ', '.join(rol.name for rol in other_roles if rol.name))
    else:
        tag = other_roles[0].name.strip() if other_roles and other_roles[0].name else 'Personel'
        kinds = [f'role:{(rol.name or "").strip()}' for rol in other_roles if (rol.name or '').strip()] or ['staff']
        bio_parts = ['Personel']
        if other_roles:
            bio_parts.append('Görev: ' + ', '.join(rol.name for rol in other_roles if rol.name))
    sube = getattr(personel, 'sube', None)
    sube_ad = (getattr(sube, 'ad', '') or '').strip() if sube is not None else ''
    if sube_ad:
        bio_parts.append(f'Şube: {sube_ad}')
    ad = (personel.ad or '').strip()
    soyad = (personel.soyad or '').strip()
    full = f'{ad} {soyad}'.strip() or 'Personel'
    display = f'{full} [{tag}]'
    return DesiredContact(
        display_name=display[:300],
        given_name=ad or full,
        family_name=f'{soyad} [{tag}]'.strip(),
        phones=phones,
        biography=_join_bio(bio_parts),
        group_kind=kinds[0],
        group_kinds=tuple(kinds),
    )
