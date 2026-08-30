"""Sınava girenlere cevap anahtarı PDF WhatsApp gönderimi."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from apps.communication.application.communication_service import MessageSource
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.integration_hooks import SOURCE_SINAV
from apps.communication.application.notification_dispatcher import (
    NotificationAttachment,
    NotificationRecipient,
    dispatch_event,
)
from apps.ogrenci.application.veli_contact import list_outbound_veliler
from apps.coaching.olcme_degerlendirme.models import ExamParticipant

EVENT_KEY = 'sinav.cevap_anahtari'
OPT_IN = 'duyuru'
PDF_TITLE = 'Cevap Anahtarı'


def _mask_phone(phone: str) -> str:
    p = (phone or '').strip()
    if len(p) < 4:
        return p
    return f'{p[:3]}***{p[-2:]}'


@dataclass
class AnswerKeyRecipient:
    recipient_type: str
    ogrenci_id: int
    veli_id: int | None
    display_name: str
    telefon: str
    body: str
    skip_reason: str = ''


@dataclass
class AnswerKeyStudentPreview:
    student_id: int
    participant_id: int
    full_name: str
    recipients: list[AnswerKeyRecipient] = field(default_factory=list)


def _context(exam, student, *, veli=None) -> dict[str, Any]:
    veli_ad = ''
    if veli is not None:
        veli_ad = getattr(veli, 'tam_ad', None) or f'{getattr(veli, "ad", "")} {getattr(veli, "soyad", "")}'.strip()
    ogrenci_ad = f'{student.ad} {student.soyad}'.strip() if student else ''
    return {
        'ogrenci_ad': ogrenci_ad,
        'veli_ad': veli_ad,
        'sinav_ad': exam.name or '',
        'sinav_adi': exam.name or '',
        'pdf_baslik': PDF_TITLE,
        'kurum_ad': getattr(getattr(exam, 'kurum', None), 'ad', '') or '',
        'sube': getattr(getattr(exam, 'sube', None), 'ad', '') or '',
    }


def _fallback_body(exam, student, *, for_veli: bool, veli=None) -> str:
    ctx = _context(exam, student, veli=veli)
    if for_veli:
        return (
            f'Sayın {ctx["veli_ad"] or "velimiz"}, {ctx["ogrenci_ad"]} öğrencimizin '
            f'"{ctx["sinav_ad"]}" sınav cevap anahtarı ektedir.'
        )
    return (
        f'Merhaba {ctx["ogrenci_ad"]}, "{ctx["sinav_ad"]}" '
        f'sınav cevap anahtarın ektedir.'
    )


def preview_answer_key_notify(exam) -> dict:
    students: list[dict] = []
    preview_body = ''
    participants = (
        ExamParticipant.objects.filter(exam=exam, attendance=ExamParticipant.Attendance.PRESENT)
        .select_related('student')
        .order_by('id')
    )
    for p in participants:
        student = p.student
        if not student:
            continue
        recipients: list[AnswerKeyRecipient] = []
        veliler = list(list_outbound_veliler(student))
        for veli, phone in veliler:
            skip = ''
            if not ContactResolver.veli_allows_outbound(veli, OPT_IN):
                skip = 'Veli duyuru bildirimini kabul etmemiş'
            body = _fallback_body(exam, student, for_veli=True, veli=veli)
            if not preview_body and not skip:
                preview_body = body
            recipients.append(AnswerKeyRecipient(
                recipient_type='veli',
                ogrenci_id=student.id,
                veli_id=veli.id,
                display_name=getattr(veli, 'tam_ad', None) or f'{veli.ad} {veli.soyad}'.strip(),
                telefon=_mask_phone(phone),
                body=body,
                skip_reason=skip,
            ))
        if not veliler:
            recipients.append(AnswerKeyRecipient(
                recipient_type='veli',
                ogrenci_id=student.id,
                veli_id=None,
                display_name='',
                telefon='',
                body='',
                skip_reason='Veli telefonu bulunamadı',
            ))
        phone = (student.telefon or '').strip()
        student_body = _fallback_body(exam, student, for_veli=False)
        if not preview_body and phone:
            preview_body = student_body
        recipients.append(AnswerKeyRecipient(
            recipient_type='ogrenci',
            ogrenci_id=student.id,
            veli_id=None,
            display_name=f'{student.ad} {student.soyad}'.strip(),
            telefon=_mask_phone(phone) if phone else '',
            body=student_body,
            skip_reason='' if phone else 'Öğrenci telefonu bulunamadı',
        ))
        students.append({
            'student_id': student.id,
            'participant_id': p.id,
            'answer_id': None,
            'full_name': f'{student.ad} {student.soyad}'.strip(),
            'recipients': [asdict(r) for r in recipients],
        })
    return {
        'kind': 'answer_key',
        'exam_id': exam.id,
        'exam_name': exam.name or '',
        'students': students,
        'preview_body': preview_body,
    }


def send_answer_key_notify(
    exam,
    pdf_bytes: bytes,
    filename: str,
    *,
    include_veli: bool = True,
    include_student: bool = True,
    sent_by_user_id: int | None = None,
    student_ids: list[int] | None = None,
    veli_ids: list[int] | None = None,
) -> dict:
    if not pdf_bytes or not pdf_bytes.startswith(b'%PDF'):
        raise ValueError('Geçersiz veya boş cevap anahtarı PDF.')

    participants = (
        ExamParticipant.objects.filter(exam=exam, attendance=ExamParticipant.Attendance.PRESENT)
        .select_related('student')
        .order_by('id')
    )
    if student_ids is not None:
        allowed = {int(x) for x in student_ids}
        participants = participants.filter(student_id__in=allowed)
    selected_veli = {int(x) for x in veli_ids} if veli_ids is not None else None
    sent = 0
    skipped = 0
    errors: list[str] = []
    message_ids: list[str] = []

    for p in participants:
        student = p.student
        if not student:
            skipped += 1
            continue
        ctx = _context(exam, student)
        if include_veli:
            veliler = list(list_outbound_veliler(student))
            matched = [
                (veli, phone) for veli, phone in veliler
                if selected_veli is None or veli.id in selected_veli
            ]
            if not matched:
                skipped += 1
                if not veliler:
                    errors.append(f'{ctx["ogrenci_ad"]}: Veli telefonu bulunamadı')
            for veli, _phone in matched:
                if not ContactResolver.veli_allows_outbound(veli, OPT_IN):
                    skipped += 1
                    continue
                vctx = _context(exam, student, veli=veli)
                body = _fallback_body(exam, student, for_veli=True, veli=veli)
                result = dispatch_event(
                    exam.kurum_id,
                    EVENT_KEY,
                    recipient=NotificationRecipient.veli(veli.id),
                    context={**vctx, 'kisa_mesaj': body},
                    attachment=NotificationAttachment(filename=filename, file_bytes=pdf_bytes),
                    source=MessageSource(
                        module=SOURCE_SINAV,
                        ref_id=f'cevap:{exam.id}:{student.id}:veli:{veli.id}',
                    ),
                    sube_id=exam.sube_id,
                    sent_by_user_id=sent_by_user_id,
                    fallback_body=body,
                )
                if result and result.success:
                    sent += 1
                    mid = getattr(result, 'message_id', None)
                    if mid:
                        message_ids.append(str(mid))
                else:
                    skipped += 1
                    errors.append(vctx['veli_ad'] or 'Veli')
        if include_student:
            phone = (student.telefon or '').strip()
            if not phone:
                skipped += 1
                errors.append(f'{ctx["ogrenci_ad"]}: Öğrenci telefonu bulunamadı')
            else:
                body = _fallback_body(exam, student, for_veli=False)
                result = dispatch_event(
                    exam.kurum_id,
                    EVENT_KEY,
                    recipient=NotificationRecipient.ogrenci(student.id),
                    context={**ctx, 'kisa_mesaj': body},
                    attachment=NotificationAttachment(filename=filename, file_bytes=pdf_bytes),
                    source=MessageSource(
                        module=SOURCE_SINAV,
                        ref_id=f'cevap:{exam.id}:{student.id}:ogrenci',
                    ),
                    sube_id=exam.sube_id,
                    sent_by_user_id=sent_by_user_id,
                    fallback_body=body,
                )
                if result and result.success:
                    sent += 1
                    mid = getattr(result, 'message_id', None)
                    if mid:
                        message_ids.append(str(mid))
                else:
                    skipped += 1

    if sent:
        try:
            from apps.communication.application.celery_dispatch import dispatch_process_outbound_queue
            dispatch_process_outbound_queue()
        except Exception:
            pass

    return {'sent': sent, 'skipped': skipped, 'errors': errors, 'message_ids': message_ids}
