"""Ölçme karnesi WhatsApp gönderimi — önizleme ve veli/öğrenci alıcıları."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from django.db import transaction

from apps.communication.application.communication_service import MessageSource
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.integration_hooks import SOURCE_SINAV
from apps.communication.application.notification_dispatcher import (
    NotificationAttachment,
    NotificationRecipient,
    dispatch_event,
)
from apps.communication.application.notification_template_resolver import resolve_binding
from apps.communication.domain.enums import RecipientType
from apps.ogrenci.application.veli_contact import list_outbound_veliler
from apps.ogrenci.domain.models import Ogrenci

EVENT_KEY = 'sinav.karne'
OPT_IN_CATEGORY = 'duyuru'
PDF_TITLE = 'Sınav Sonuç Belgesi'


@dataclass
class KarneNotifyRecipient:
    recipient_type: str
    ogrenci_id: int
    veli_id: int | None
    display_name: str
    telefon: str
    body: str
    skip_reason: str = ''


@dataclass
class KarneNotifyPreview:
    exam_id: int
    answer_id: int
    exam_name: str
    student_name: str
    recipients: list[KarneNotifyRecipient] = field(default_factory=list)
    pdf_title: str = PDF_TITLE
    meta_template_veli: str = ''
    meta_template_ogrenci: str = ''
    send_mode: str = 'document'


def _mask_phone(phone: str) -> str:
    p = (phone or '').strip()
    if len(p) < 4:
        return p
    return f'{p[:3]}***{p[-2:]}'


def _fmt_num(n, digits=2) -> str:
    if n is None:
        return '—'
    try:
        return f'{float(n):,.{digits}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    except (TypeError, ValueError):
        return '—'


def _context(karne: dict, *, veli=None) -> dict[str, Any]:
    veli_ad = ''
    if veli is not None:
        veli_ad = getattr(veli, 'tam_ad', None) or f'{getattr(veli, "ad", "")} {getattr(veli, "soyad", "")}'.strip()
    return {
        'ogrenci_ad': karne.get('student_name') or '',
        'veli_ad': veli_ad,
        'sinav_ad': karne.get('exam_name') or '',
        'puan': _fmt_num(karne.get('puan'), 3),
        'net': _fmt_num(karne.get('toplam_net'), 2),
        'pdf_baslik': PDF_TITLE,
        'kurum_ad': karne.get('kurum_ad') or '',
        'sube': karne.get('sube_ad') or '',
        'sinif': karne.get('sinif') or '',
    }


def _fallback_body(karne: dict, *, for_veli: bool, veli=None) -> str:
    ctx = _context(karne, veli=veli)
    if for_veli:
        return (
            f"Sayın {ctx['veli_ad'] or 'velimiz'}, "
            f"{ctx['ogrenci_ad']} öğrencimizin \"{ctx['sinav_ad']}\" "
            f"sınav sonuç belgesi ektedir. Puan: {ctx['puan']}, net: {ctx['net']}."
        )
    return (
        f"Merhaba {ctx['ogrenci_ad']}, \"{ctx['sinav_ad']}\" "
        f"sınav sonuç belgen ektedir. Puan: {ctx['puan']}, net: {ctx['net']}."
    )


def preview_karne_notify(kurum_id: int, karne: dict) -> KarneNotifyPreview:
    student_id = karne.get('student_id')
    student_name = karne.get('student_name') or ''
    recipients: list[KarneNotifyRecipient] = []
    ogrenci = None
    if student_id:
        ogrenci = Ogrenci.objects.filter(id=student_id, kurum_id=kurum_id).first()

    if not ogrenci:
        recipients.append(KarneNotifyRecipient(
            recipient_type='veli',
            ogrenci_id=student_id or 0,
            veli_id=None,
            display_name='',
            telefon='',
            body='',
            skip_reason='Öğrenci eşleştirilmemiş — WhatsApp gönderilemez',
        ))
        recipients.append(KarneNotifyRecipient(
            recipient_type='ogrenci',
            ogrenci_id=student_id or 0,
            veli_id=None,
            display_name=student_name,
            telefon='',
            body='',
            skip_reason='Öğrenci eşleştirilmemiş — WhatsApp gönderilemez',
        ))
        return KarneNotifyPreview(
            exam_id=0,
            answer_id=karne.get('answer_id') or 0,
            exam_name=karne.get('exam_name') or '',
            student_name=student_name,
            recipients=recipients,
        )

    veli_pairs = list_outbound_veliler(ogrenci)
    for veli, phone in veli_pairs:
        skip = ''
        if not ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
            skip = 'Veli duyuru bildirimini kabul etmemiş'
        recipients.append(KarneNotifyRecipient(
            recipient_type='veli',
            ogrenci_id=ogrenci.id,
            veli_id=veli.id,
            display_name=getattr(veli, 'tam_ad', None) or f'{veli.ad} {veli.soyad}'.strip(),
            telefon=_mask_phone(phone),
            body=_fallback_body(karne, for_veli=True, veli=veli),
            skip_reason=skip,
        ))
    if not veli_pairs:
        recipients.append(KarneNotifyRecipient(
            recipient_type='veli',
            ogrenci_id=ogrenci.id,
            veli_id=None,
            display_name='',
            telefon='',
            body='',
            skip_reason='Veli telefonu bulunamadı',
        ))

    student_phone = (ogrenci.telefon or '').strip()
    recipients.append(KarneNotifyRecipient(
        recipient_type='ogrenci',
        ogrenci_id=ogrenci.id,
        veli_id=None,
        display_name=f'{ogrenci.ad} {ogrenci.soyad}'.strip(),
        telefon=_mask_phone(student_phone) if student_phone else '',
        body=_fallback_body(karne, for_veli=False),
        skip_reason='' if student_phone else 'Öğrenci telefonu bulunamadı',
    ))

    sube_id = getattr(ogrenci, 'sube_id', None)
    resolved_v = resolve_binding(kurum_id, EVENT_KEY, RecipientType.VELI, sube_id=sube_id)
    resolved_o = resolve_binding(kurum_id, EVENT_KEY, RecipientType.OGRENCI, sube_id=sube_id)
    meta_v_name = getattr(getattr(resolved_v, 'meta_template', None), 'name', '') or ''
    meta_o_name = getattr(getattr(resolved_o, 'meta_template', None), 'name', '') or ''

    return KarneNotifyPreview(
        exam_id=0,
        answer_id=karne.get('answer_id') or 0,
        exam_name=karne.get('exam_name') or '',
        student_name=student_name,
        recipients=recipients,
        meta_template_veli=meta_v_name,
        meta_template_ogrenci=meta_o_name,
        send_mode='meta_template' if (meta_v_name or meta_o_name) else 'document',
    )


def preview_to_dict(preview: KarneNotifyPreview) -> dict:
    data = asdict(preview)
    return data


@transaction.atomic
def send_karne_notify(
    *,
    kurum_id: int,
    exam_id: int,
    answer_id: int,
    karne: dict,
    pdf_bytes: bytes,
    filename: str,
    veli_ids: list[int] | None = None,
    include_student: bool = False,
    sent_by_user_id: int | None = None,
    sube_id: int | None = None,
) -> dict:
    if not pdf_bytes or not pdf_bytes.startswith(b'%PDF'):
        raise ValueError('Geçersiz veya boş PDF dosyası.')

    preview = preview_karne_notify(kurum_id, karne)
    selected_veli = set(veli_ids or [])
    sent = 0
    skipped = 0
    errors: list[str] = []
    sent_details: list[dict] = []
    message_ids: list[str] = []

    for item in preview.recipients:
        if item.recipient_type == 'veli':
            if not item.veli_id or item.veli_id not in selected_veli:
                continue
            if item.skip_reason:
                skipped += 1
                errors.append(f'{item.display_name}: {item.skip_reason}')
                continue
            from apps.ogrenci.domain.models import OgrenciVeli
            veli = OgrenciVeli.objects.filter(id=item.veli_id).first()
            if not veli:
                skipped += 1
                continue
            ctx = _context(karne, veli=veli)
            body = _fallback_body(karne, for_veli=True, veli=veli)
            result = dispatch_event(
                kurum_id,
                EVENT_KEY,
                recipient=NotificationRecipient.veli(veli.id),
                context={**ctx, 'kisa_mesaj': body},
                attachment=NotificationAttachment(filename=filename, file_bytes=pdf_bytes),
                source=MessageSource(
                    module=SOURCE_SINAV,
                    ref_id=f'karne:{exam_id}:{answer_id}:veli:{veli.id}',
                ),
                sube_id=sube_id,
                sent_by_user_id=sent_by_user_id,
                fallback_body=body,
            )
            if result and result.success:
                sent += 1
                mid = getattr(result, 'message_id', None)
                if mid:
                    message_ids.append(str(mid))
                sent_details.append({
                    'recipient_type': 'veli',
                    'display_name': item.display_name,
                    'telefon': item.telefon,
                    'message_status': result.message_status or 'SENT',
                })
            else:
                skipped += 1
                errors.append(
                    f'{item.display_name}: '
                    f'{"; ".join(result.errors) if result and result.errors else "gönderilemedi"}'
                )
        elif item.recipient_type == 'ogrenci' and include_student:
            if item.skip_reason:
                skipped += 1
                errors.append(f'{item.display_name}: {item.skip_reason}')
                continue
            ctx = _context(karne)
            body = _fallback_body(karne, for_veli=False)
            result = dispatch_event(
                kurum_id,
                EVENT_KEY,
                recipient=NotificationRecipient.ogrenci(item.ogrenci_id),
                context={**ctx, 'kisa_mesaj': body},
                attachment=NotificationAttachment(filename=filename, file_bytes=pdf_bytes),
                source=MessageSource(
                    module=SOURCE_SINAV,
                    ref_id=f'karne:{exam_id}:{answer_id}:ogrenci',
                ),
                sube_id=sube_id,
                sent_by_user_id=sent_by_user_id,
                fallback_body=body,
            )
            if result and result.success:
                sent += 1
                mid = getattr(result, 'message_id', None)
                if mid:
                    message_ids.append(str(mid))
                sent_details.append({
                    'recipient_type': 'ogrenci',
                    'display_name': item.display_name,
                    'telefon': item.telefon,
                    'message_status': result.message_status or 'SENT',
                })
            else:
                skipped += 1
                errors.append(
                    f'{item.display_name}: '
                    f'{"; ".join(result.errors) if result and result.errors else "gönderilemedi"}'
                )

    if sent:
        try:
            from apps.communication.application.celery_dispatch import (
                dispatch_process_outbound_queue,
            )
            dispatch_process_outbound_queue()
        except Exception:
            pass

    return {
        'sent': sent,
        'skipped': skipped,
        'errors': errors,
        'sent_details': sent_details,
        'message_ids': message_ids,
    }


def summarize_preview(preview: KarneNotifyPreview) -> dict:
    veliler = [r for r in preview.recipients if r.recipient_type == 'veli']
    ogrenci = next((r for r in preview.recipients if r.recipient_type == 'ogrenci'), None)
    sendable_veli = [r for r in veliler if r.veli_id and not r.skip_reason]
    student_ok = bool(ogrenci and not ogrenci.skip_reason)
    skip = ''
    if not preview.recipients:
        skip = 'Alıcı yok'
    elif all(r.skip_reason for r in preview.recipients):
        skip = next((r.skip_reason for r in preview.recipients if r.skip_reason), 'Gönderilemez')
    return {
        'answer_id': preview.answer_id,
        'student_name': preview.student_name,
        'veli_count': len(sendable_veli),
        'has_student': student_ok,
        'skip_reason': skip if not sendable_veli and not student_ok else '',
        'send_mode': preview.send_mode,
    }


def send_karne_notify_bulk(
    *,
    kurum_id: int,
    exam_id: int,
    items: list[dict],
    include_veli: bool = True,
    include_student: bool = True,
    sent_by_user_id: int | None = None,
    sube_id: int | None = None,
    veli_ids: list[int] | None = None,
) -> dict:
    """items: [{answer_id, karne, pdf_bytes, filename, sube_id?}]"""
    sent = 0
    skipped = 0
    errors: list[str] = []
    sent_details: list[dict] = []
    student_results: list[dict] = []
    message_ids: list[str] = []
    selected_veli = {int(x) for x in veli_ids} if veli_ids is not None else None

    for item in items:
        karne = item['karne']
        preview = preview_karne_notify(kurum_id, karne)
        item_veli_ids = [
            r.veli_id for r in preview.recipients
            if r.recipient_type == 'veli' and r.veli_id and not r.skip_reason
            and (selected_veli is None or r.veli_id in selected_veli)
        ] if include_veli else []
        send_student = include_student and any(
            r.recipient_type == 'ogrenci' and not r.skip_reason
            for r in preview.recipients
        )
        if not item_veli_ids and not send_student:
            skipped += 1
            reason = summarize_preview(preview)['skip_reason'] or 'Alıcı yok'
            errors.append(f"{karne.get('student_name') or 'Öğrenci'}: {reason}")
            student_results.append({
                'answer_id': item['answer_id'],
                'student_name': karne.get('student_name') or '',
                'sent': 0,
                'errors': [reason],
            })
            continue
        try:
            result = send_karne_notify(
                kurum_id=kurum_id,
                exam_id=exam_id,
                answer_id=item['answer_id'],
                karne=karne,
                pdf_bytes=item['pdf_bytes'],
                filename=item['filename'],
                veli_ids=item_veli_ids,
                include_student=send_student,
                sent_by_user_id=sent_by_user_id,
                sube_id=item.get('sube_id') or sube_id,
            )
        except ValueError as exc:
            skipped += 1
            errors.append(f"{karne.get('student_name') or 'Öğrenci'}: {exc}")
            student_results.append({
                'answer_id': item['answer_id'],
                'student_name': karne.get('student_name') or '',
                'sent': 0,
                'errors': [str(exc)],
            })
            continue
        sent += result['sent']
        skipped += result['skipped']
        errors.extend(result['errors'])
        sent_details.extend(result.get('sent_details') or [])
        message_ids.extend(result.get('message_ids') or [])
        student_results.append({
            'answer_id': item['answer_id'],
            'student_name': karne.get('student_name') or '',
            'sent': result['sent'],
            'errors': result['errors'],
        })

    return {
        'sent': sent,
        'skipped': skipped,
        'errors': errors,
        'sent_details': sent_details,
        'student_results': student_results,
        'message_ids': message_ids,
    }
