"""Seçilen aralıktaki devamsızlık takvimi PDF'ini veliye ve öğrenciye gönderir."""
from __future__ import annotations

from datetime import date
from typing import Any

from django.db import transaction

from apps.coaching.services.attendance_calendar_pdf import (
    _fmt,
    attendance_calendar_filename,
    calendar_stat_counts,
    render_attendance_calendar_pdf,
)
from apps.coaching.services.attendance_followup import student_history_payload
from apps.communication.application.communication_service import MessageSource
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.integration_hooks import SOURCE_DEVAMSIZLIK
from apps.communication.application.notification_dispatcher import (
    NotificationAttachment,
    NotificationRecipient,
    build_preview,
    dispatch_event,
)
from apps.communication.domain.enums import RecipientType
from apps.ogrenci.application.veli_contact import effective_veli_phone
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli

EVENT_KEY = 'devamsizlik.takvim'
OPT_IN_CATEGORY = 'duyuru'
MAX_MONTHS = 18


def _mask_phone(phone: str) -> str:
    text = (phone or '').strip()
    if len(text) < 4:
        return text
    return f'{text[:3]}***{text[-2:]}'


def _month_span(start: date, end: date) -> int:
    if end < start:
        start, end = end, start
    return (end.year - start.year) * 12 + (end.month - start.month) + 1


def _normalize_range(start: date, end: date) -> tuple[date, date]:
    if end < start:
        return end, start
    return start, end


def _student_name(student: Ogrenci) -> str:
    return f'{student.ad} {student.soyad}'.strip()


def _veli_name(veli) -> str:
    return getattr(veli, 'tam_ad', None) or f'{getattr(veli, "ad", "")} {getattr(veli, "soyad", "")}'.strip()


def _context(student: Ogrenci, start: date, end: date, *, absent: int, late: int, veli=None) -> dict[str, Any]:
    return {
        'ogrenci_ad': _student_name(student),
        'veli_ad': _veli_name(veli) if veli is not None else '',
        'baslangic_tarihi': _fmt(start),
        'bitis_tarihi': _fmt(end),
        'gec_geldigi_gun_sayisi': str(late),
        'gelmedigi_gun_sayisi': str(absent),
        'pdf_baslik': 'Devamsızlık Takvimi',
        'kurum_ad': getattr(getattr(student, 'kurum', None), 'ad', '') or '',
        'sube': getattr(getattr(student, 'sube', None), 'ad', '') or '',
    }


def _history(student: Ogrenci, start: date, end: date, *, kurum_id: int, egitim_yili_id: int | None):
    start, end = _normalize_range(start, end)
    if _month_span(start, end) > MAX_MONTHS:
        raise ValueError('PDF için en fazla 18 ay seçin.')
    payload = student_history_payload(
        student,
        on_date=end,
        kurum_id=kurum_id,
        sube_id=student.sube_id,
        egitim_yili_id=egitim_yili_id,
        start_date=start,
        end_date=end,
    )
    absent, late = calendar_stat_counts(payload)
    return payload, start, end, absent, late


def _body(kurum_id: int, student: Ogrenci, recipient_type: str, context: dict) -> str:
    preview = build_preview(
        kurum_id,
        EVENT_KEY,
        recipient_type,
        context=context,
        sube_id=getattr(student, 'sube_id', None),
    )
    return preview.body


def preview_attendance_calendar_notify(
    student: Ogrenci,
    *,
    start: date,
    end: date,
    kurum_id: int,
    egitim_yili_id: int | None = None,
) -> dict:
    payload, start, end, absent, late = _history(
        student, start, end, kurum_id=kurum_id, egitim_yili_id=egitim_yili_id,
    )
    recipients: list[dict] = []
    veliler = list(OgrenciVeli.objects.filter(ogrenci=student))
    for veli in veliler:
        phone = effective_veli_phone(veli, student) or ''
        skip = ''
        if not phone.strip():
            skip = 'Veli telefonu bulunamadı'
        else:
            from apps.communication.application.contact_resolver import ContactResolver
            if not ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                skip = 'Veli duyuru bildirimini kabul etmemiş'
        ctx = _context(student, start, end, absent=absent, late=late, veli=veli)
        recipients.append({
            'recipient_type': 'veli',
            'ogrenci_id': student.id,
            'veli_id': veli.id,
            'display_name': _veli_name(veli),
            'telefon': _mask_phone(phone),
            'body': '' if skip else _body(kurum_id, student, RecipientType.VELI, ctx),
            'skip_reason': skip,
        })
    if not veliler:
        recipients.append({
            'recipient_type': 'veli',
            'ogrenci_id': student.id,
            'veli_id': None,
            'display_name': '',
            'telefon': '',
            'body': '',
            'skip_reason': 'Veli kaydı yok',
        })

    phone = (student.telefon or '').strip()
    ctx = _context(student, start, end, absent=absent, late=late)
    recipients.append({
        'recipient_type': 'ogrenci',
        'ogrenci_id': student.id,
        'veli_id': None,
        'display_name': _student_name(student),
        'telefon': _mask_phone(phone) if phone else '',
        'body': _body(kurum_id, student, RecipientType.OGRENCI, ctx) if phone else '',
        'skip_reason': ContactResolver.ogrenci_outbound_skip(
            student, empty='Öğrenci telefonu bulunamadı',
        ),
    })

    return {
        'student_id': student.id,
        'student_name': payload.get('student_name') or _student_name(student),
        'start_date': start.isoformat(),
        'end_date': end.isoformat(),
        'baslangic_tarihi': _fmt(start),
        'bitis_tarihi': _fmt(end),
        'gelmedigi_gun_sayisi': absent,
        'gec_geldigi_gun_sayisi': late,
        'recipients': recipients,
    }


@transaction.atomic
def send_attendance_calendar_notify(
    student: Ogrenci,
    *,
    start: date,
    end: date,
    kurum_id: int,
    egitim_yili_id: int | None = None,
    veli_ids: list[int] | None = None,
    include_student: bool = False,
    sent_by_user_id: int | None = None,
) -> dict:
    preview = preview_attendance_calendar_notify(
        student,
        start=start,
        end=end,
        kurum_id=kurum_id,
        egitim_yili_id=egitim_yili_id,
    )
    start = date.fromisoformat(preview['start_date'])
    end = date.fromisoformat(preview['end_date'])
    payload, _, _, absent, late = _history(
        student, start, end, kurum_id=kurum_id, egitim_yili_id=egitim_yili_id,
    )
    pdf_bytes = render_attendance_calendar_pdf(payload, start, end)
    if not pdf_bytes or not pdf_bytes.startswith(b'%PDF'):
        raise ValueError('PDF oluşturulamadı.')
    filename = attendance_calendar_filename(preview['student_name'])
    selected = set(veli_ids or [])
    sent = 0
    skipped = 0
    errors: list[str] = []
    sent_details: list[dict] = []

    def _fail(name: str, reason: str) -> None:
        nonlocal skipped
        skipped += 1
        errors.append(f'{name}: {reason}' if name else reason)

    for item in preview['recipients']:
        if item['recipient_type'] == 'veli':
            veli_id = item.get('veli_id')
            if not veli_id or veli_id not in selected:
                continue
            if item['skip_reason']:
                _fail(item['display_name'], item['skip_reason'])
                continue
            veli = OgrenciVeli.objects.filter(id=veli_id, ogrenci=student).first()
            if not veli:
                _fail(item['display_name'], 'Veli kaydı bulunamadı')
                continue
            ctx = _context(student, start, end, absent=absent, late=late, veli=veli)
            result = dispatch_event(
                kurum_id,
                EVENT_KEY,
                recipient=NotificationRecipient.veli(veli.id),
                context=ctx,
                attachment=NotificationAttachment(filename=filename, file_bytes=pdf_bytes),
                source=MessageSource(
                    module=SOURCE_DEVAMSIZLIK,
                    ref_id=f'takvim:{student.id}:{start.isoformat()}:{end.isoformat()}:veli:{veli.id}',
                ),
                sube_id=getattr(student, 'sube_id', None),
                sent_by_user_id=sent_by_user_id,
            )
            if result and result.success:
                sent += 1
                sent_details.append({
                    'recipient_type': 'veli',
                    'display_name': item['display_name'],
                    'telefon': item['telefon'],
                    'message_status': result.message_status or 'SENT',
                })
            else:
                _fail(
                    item['display_name'],
                    '; '.join(result.errors) if result and result.errors else 'gönderilemedi',
                )
        elif item['recipient_type'] == 'ogrenci' and include_student:
            if item['skip_reason']:
                skipped += 1
                continue
            ctx = _context(student, start, end, absent=absent, late=late)
            result = dispatch_event(
                kurum_id,
                EVENT_KEY,
                recipient=NotificationRecipient.ogrenci(student.id),
                context=ctx,
                attachment=NotificationAttachment(filename=filename, file_bytes=pdf_bytes),
                source=MessageSource(
                    module=SOURCE_DEVAMSIZLIK,
                    ref_id=f'takvim:{student.id}:{start.isoformat()}:{end.isoformat()}:ogrenci',
                ),
                sube_id=getattr(student, 'sube_id', None),
                sent_by_user_id=sent_by_user_id,
            )
            if result and result.success:
                sent += 1
                sent_details.append({
                    'recipient_type': 'ogrenci',
                    'display_name': item['display_name'],
                    'telefon': item['telefon'],
                    'message_status': result.message_status or 'SENT',
                })
            else:
                _fail(
                    item['display_name'],
                    '; '.join(result.errors) if result and result.errors else 'gönderilemedi',
                )

    if sent:
        from apps.communication.application.bulk_dispatch import pool_active
        if not pool_active():
            from apps.communication.application.celery_dispatch import (
                dispatch_outbound_queue_after_commit,
            )
            dispatch_outbound_queue_after_commit()

    return {
        'sent': sent,
        'skipped': skipped,
        'errors': errors,
        'sent_details': sent_details,
        'gelmedigi_gun_sayisi': absent,
        'gec_geldigi_gun_sayisi': late,
    }
