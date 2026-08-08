"""Öğrenci notları — CRUD, sözleşme birleşimi ve audit."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.ogrenci.domain.models import (
    OgrenciNot,
    OgrenciNotAuditAction,
    OgrenciNotAuditLog,
    OgrenciNotKategori,
)
from apps.odeme_takip.domain.notlar_utils import get_notlar_json


SOZLESME_TIP_TITLES = {
    'odeme_gorusmesi': 'Ödeme görüşmesi',
    'genel': 'Sözleşme notu',
}


def user_display_name(user) -> str:
    if not user:
        return ''
    full = (user.get_full_name() or '').strip()
    if full:
        return full
    return (user.username or '').strip()


def parse_not_zamani(value: Any, *, default=None):
    if value is None or value == '':
        return default if default is not None else timezone.now()
    if isinstance(value, datetime):
        dt = value
    else:
        s = str(value).strip()
        dt = parse_datetime(s)
        if dt is None:
            # date-only or "YYYY-MM-DD HH:MM"
            for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d'):
                try:
                    dt = datetime.strptime(s[:19], fmt)
                    break
                except ValueError:
                    continue
        if dt is None:
            raise ValueError('Geçersiz tarih/saat formatı.')
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _iso(dt) -> str | None:
    if not dt:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt.isoformat()


def note_snapshot(note: OgrenciNot) -> dict[str, Any]:
    return {
        'baslik': note.baslik,
        'icerik': note.icerik,
        'kategori': note.kategori,
        'not_zamani': _iso(note.not_zamani),
    }


def serialize_manual_note(note: OgrenciNot) -> dict[str, Any]:
    return {
        'id': note.id,
        'source': 'manual',
        'baslik': note.baslik,
        'icerik': note.icerik,
        'kategori': note.kategori,
        'kategori_label': OgrenciNotKategori.LABELS.get(note.kategori, note.kategori),
        'not_zamani': _iso(note.not_zamani),
        'created_by': note.created_by_id,
        'created_by_name': user_display_name(note.created_by),
        'created_at': _iso(note.created_at),
        'updated_by': note.updated_by_id,
        'updated_by_name': user_display_name(note.updated_by),
        'updated_at': _iso(note.updated_at),
        'editable': True,
        'sozlesme_id': None,
        'sozlesme_no': None,
    }


def _contract_note_title(tip: str | None) -> str:
    if tip and tip in SOZLESME_TIP_TITLES:
        return SOZLESME_TIP_TITLES[tip]
    return 'Sözleşme notu'


def serialize_contract_note(sozlesme, raw: dict[str, Any]) -> dict[str, Any] | None:
    text = str(raw.get('text') or '').strip()
    if not text:
        return None
    note_id = str(raw.get('id') or '').strip() or 'legacy'
    created_at_raw = raw.get('created_at')
    not_zamani = None
    if created_at_raw:
        try:
            not_zamani = parse_not_zamani(created_at_raw)
        except ValueError:
            not_zamani = None
    if not_zamani is None:
        # Sözleşme kaydı / oluşturulma zamanı fallback
        fallback = getattr(sozlesme, 'created_at', None) or getattr(sozlesme, 'kayit_tarihi', None)
        if fallback:
            if isinstance(fallback, datetime):
                not_zamani = fallback if not timezone.is_naive(fallback) else timezone.make_aware(
                    fallback, timezone.get_current_timezone()
                )
            else:
                not_zamani = timezone.make_aware(
                    datetime.combine(fallback, datetime.min.time()),
                    timezone.get_current_timezone(),
                )
        else:
            not_zamani = timezone.now()

    tip = str(raw.get('tip') or '').strip() or None
    return {
        'id': f'sozlesme-{sozlesme.id}-{note_id}',
        'source': 'sozlesme',
        'baslik': _contract_note_title(tip),
        'icerik': text,
        'kategori': OgrenciNotKategori.SOZLESME,
        'kategori_label': OgrenciNotKategori.LABELS[OgrenciNotKategori.SOZLESME],
        'not_zamani': _iso(not_zamani),
        'created_by': None,
        'created_by_name': str(raw.get('created_by_name') or '').strip(),
        'created_at': _iso(not_zamani),
        'updated_by': None,
        'updated_by_name': '',
        'updated_at': None,
        'editable': False,
        'sozlesme_id': sozlesme.id,
        'sozlesme_no': getattr(sozlesme, 'sozlesme_no', '') or '',
    }


def write_audit(
    *,
    note: OgrenciNot,
    action: str,
    user,
    old_values: dict | None = None,
    new_values: dict | None = None,
    description: str = '',
) -> OgrenciNotAuditLog:
    return OgrenciNotAuditLog.objects.create(
        not_kaydi=note if note.pk else None,
        note_id=note.pk or 0,
        ogrenci_id=note.ogrenci_id,
        baslik_snapshot=(note.baslik or '')[:255],
        action=action,
        performed_by=user if getattr(user, 'is_authenticated', False) else None,
        old_values=old_values,
        new_values=new_values,
        description=(description or '')[:500],
    )


def _actor_label(user) -> str:
    name = user_display_name(user)
    return name or 'Sistem'


def create_note(*, ogrenci, user, data: dict[str, Any]) -> OgrenciNot:
    baslik = str(data.get('baslik') or '').strip()
    icerik = str(data.get('icerik') or '').strip()
    kategori = str(data.get('kategori') or OgrenciNotKategori.GENEL).strip()
    if not baslik:
        raise ValueError('Not başlığı zorunludur.')
    if not icerik:
        raise ValueError('Not içeriği zorunludur.')
    if kategori not in OgrenciNotKategori.CODES:
        raise ValueError('Geçersiz kategori.')
    not_zamani = parse_not_zamani(data.get('not_zamani'))

    note = OgrenciNot.objects.create(
        ogrenci=ogrenci,
        baslik=baslik[:255],
        icerik=icerik,
        kategori=kategori,
        not_zamani=not_zamani,
        created_by=user if getattr(user, 'is_authenticated', False) else None,
        updated_by=user if getattr(user, 'is_authenticated', False) else None,
    )
    write_audit(
        note=note,
        action=OgrenciNotAuditAction.CREATED,
        user=user,
        new_values=note_snapshot(note),
        description=f'{_actor_label(user)} tarafından "{note.baslik}" notu oluşturuldu.',
    )
    return note


def update_note(*, note: OgrenciNot, user, data: dict[str, Any]) -> OgrenciNot:
    if note.is_deleted:
        raise ValueError('Silinmiş not düzenlenemez.')
    old = note_snapshot(note)

    if 'baslik' in data:
        baslik = str(data.get('baslik') or '').strip()
        if not baslik:
            raise ValueError('Not başlığı zorunludur.')
        note.baslik = baslik[:255]
    if 'icerik' in data:
        icerik = str(data.get('icerik') or '').strip()
        if not icerik:
            raise ValueError('Not içeriği zorunludur.')
        note.icerik = icerik
    if 'kategori' in data:
        kategori = str(data.get('kategori') or '').strip()
        if kategori not in OgrenciNotKategori.CODES:
            raise ValueError('Geçersiz kategori.')
        note.kategori = kategori
    if 'not_zamani' in data:
        note.not_zamani = parse_not_zamani(data.get('not_zamani'), default=note.not_zamani)

    note.updated_by = user if getattr(user, 'is_authenticated', False) else None
    note.save()
    new = note_snapshot(note)
    write_audit(
        note=note,
        action=OgrenciNotAuditAction.UPDATED,
        user=user,
        old_values=old,
        new_values=new,
        description=f'{_actor_label(user)} tarafından "{note.baslik}" notu düzenlendi.',
    )
    return note


def soft_delete_note(*, note: OgrenciNot, user) -> OgrenciNot:
    if note.is_deleted:
        raise ValueError('Not zaten silinmiş.')
    old = note_snapshot(note)
    note.is_deleted = True
    note.deleted_by = user if getattr(user, 'is_authenticated', False) else None
    note.deleted_at = timezone.now()
    note.updated_by = note.deleted_by
    note.save(update_fields=['is_deleted', 'deleted_by', 'deleted_at', 'updated_by', 'updated_at'])
    write_audit(
        note=note,
        action=OgrenciNotAuditAction.DELETED,
        user=user,
        old_values=old,
        new_values=None,
        description=f'{_actor_label(user)} tarafından "{note.baslik}" notu silindi.',
    )
    return note


def list_merged_notes(
    ogrenci,
    *,
    kategori: str | None = None,
    q: str | None = None,
    date_from=None,
    date_to=None,
    created_by: int | None = None,
) -> list[dict[str, Any]]:
    from apps.odeme_takip.domain.models import Sozlesme

    qs = (
        OgrenciNot.objects.filter(ogrenci=ogrenci, is_deleted=False)
        .select_related('created_by', 'updated_by')
    )
    if kategori and kategori in OgrenciNotKategori.CODES:
        qs = qs.filter(kategori=kategori)
    if created_by:
        qs = qs.filter(created_by_id=created_by)
    if date_from:
        qs = qs.filter(not_zamani__date__gte=date_from)
    if date_to:
        qs = qs.filter(not_zamani__date__lte=date_to)
    if q:
        qs = qs.filter(Q(baslik__icontains=q) | Q(icerik__icontains=q))

    items: list[dict[str, Any]] = [serialize_manual_note(n) for n in qs]

    # Sözleşme notları — kategori filtresi sözleşme değilse ve created_by varsa atla
    include_contract = (not created_by) and (not kategori or kategori == OgrenciNotKategori.SOZLESME)
    if include_contract:
        sozlesmeler = Sozlesme.objects.filter(ogrenci=ogrenci).only(
            'id', 'sozlesme_no', 'notlar', 'notlar_json', 'kayit_tarihi', 'created_at'
        )
        for soz in sozlesmeler:
            for raw in get_notlar_json(soz):
                item = serialize_contract_note(soz, raw)
                if not item:
                    continue
                if q:
                    qq = q.lower()
                    hay = f"{item['baslik']} {item['icerik']}".lower()
                    if qq not in hay:
                        continue
                if date_from or date_to:
                    try:
                        nz = parse_not_zamani(item['not_zamani'])
                    except ValueError:
                        continue
                    d = timezone.localtime(nz).date()
                    if date_from and d < date_from:
                        continue
                    if date_to and d > date_to:
                        continue
                items.append(item)

    items.sort(key=lambda x: (x.get('not_zamani') or '', str(x.get('id'))), reverse=True)
    return items


def list_note_audit(note_id: int, ogrenci_id: int) -> list[dict[str, Any]]:
    logs = (
        OgrenciNotAuditLog.objects.filter(note_id=note_id, ogrenci_id=ogrenci_id)
        .select_related('performed_by')
        .order_by('-performed_at', '-id')
    )
    result = []
    for log in logs:
        result.append({
            'id': log.id,
            'action': log.action,
            'action_label': log.get_action_display(),
            'description': log.description,
            'performed_by': log.performed_by_id,
            'performed_by_name': user_display_name(log.performed_by),
            'performed_at': _iso(log.performed_at),
            'old_values': log.old_values,
            'new_values': log.new_values,
            'baslik_snapshot': log.baslik_snapshot,
        })
    return result


def categories_payload() -> list[dict[str, str]]:
    return [{'code': code, 'label': label} for code, label in OgrenciNotKategori.CHOICES]
