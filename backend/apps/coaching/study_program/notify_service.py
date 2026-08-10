"""Haftalık çalışma programı WhatsApp bildirimi (veli + öğrenci)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from django.db import transaction

from apps.communication.application.communication_service import MessageSource
from apps.communication.application.integration_hooks import SOURCE_KOC
from apps.communication.application.notification_dispatcher import (
    NotificationAttachment,
    NotificationRecipient,
    dispatch_event,
)
from apps.communication.application.notification_template_resolver import resolve_binding
from apps.communication.domain.enums import RecipientType
from apps.ogrenci.application.veli_contact import effective_veli_phone
from apps.ogrenci.domain.models import OgrenciVeli

from .models import WeeklyProgram
from .pdf_service import render_study_program_pdf, study_program_pdf_filename

EVENT_KEY = 'koc.calisma_programi'
OPT_IN_CATEGORY = 'duyuru'


@dataclass
class StudyProgramNotifyRecipient:
    recipient_type: str
    ogrenci_id: int
    veli_id: int | None
    display_name: str
    telefon: str
    body: str
    skip_reason: str = ''


@dataclass
class StudyProgramNotifyPreview:
    program_id: int
    student_name: str
    week_label: str
    recipients: list[StudyProgramNotifyRecipient] = field(default_factory=list)
    pdf_title: str = 'Haftalık Çalışma Programı'
    meta_template_veli: str = ''
    meta_template_ogrenci: str = ''
    send_mode: str = 'document'


def _mask_phone(phone: str) -> str:
    p = (phone or '').strip()
    if len(p) < 4:
        return p
    return f'{p[:3]}***{p[-2:]}'


def _week_label(program: WeeklyProgram) -> str:
    return f'{program.week_start.strftime("%d.%m.%Y")} – {program.week_end.strftime("%d.%m.%Y")}'


def _context(program: WeeklyProgram, *, veli=None) -> dict[str, Any]:
    student = program.student
    student_name = f'{student.ad} {student.soyad}'.strip() if student else ''
    coach_name = ''
    if program.coach_id and program.coach:
        coach_name = program.coach.get_full_name() or program.coach.username
    veli_ad = ''
    if veli is not None:
        veli_ad = getattr(veli, 'tam_ad', None) or f'{getattr(veli, "ad", "")} {getattr(veli, "soyad", "")}'.strip()
    return {
        'ogrenci_ad': student_name,
        'veli_ad': veli_ad,
        'hafta': _week_label(program),
        'koc_ad': coach_name,
        'pdf_baslik': 'Haftalık Çalışma Programı',
        'kurum_ad': getattr(getattr(student, 'kurum', None), 'ad', '') or '',
        'sube': getattr(getattr(student, 'sube', None), 'ad', '') or '',
    }


def _fallback_body(program: WeeklyProgram, *, for_veli: bool, veli=None) -> str:
    ctx = _context(program, veli=veli)
    if for_veli:
        return (
            f"Sayın {ctx['veli_ad'] or 'velimiz'}, "
            f"{ctx['ogrenci_ad']} öğrencimizin {ctx['hafta']} haftalık çalışma programı ektedir."
        )
    return f"Merhaba {ctx['ogrenci_ad']}, {ctx['hafta']} haftalık çalışma programın ektedir."


class StudyProgramNotifyService:
    def preview(self, kurum_id: int, program_id: int) -> StudyProgramNotifyPreview:
        program = (
            WeeklyProgram.objects.select_related('student', 'student__kurum', 'student__sube', 'coach')
            .filter(id=program_id, student__kurum_id=kurum_id, is_template=False)
            .first()
        )
        if not program:
            raise ValueError('Program bulunamadı.')

        student = program.student
        student_name = f'{student.ad} {student.soyad}'.strip()
        recipients: list[StudyProgramNotifyRecipient] = []

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
            recipients.append(StudyProgramNotifyRecipient(
                recipient_type='veli',
                ogrenci_id=student.id,
                veli_id=veli.id,
                display_name=getattr(veli, 'tam_ad', None) or f'{veli.ad} {veli.soyad}'.strip(),
                telefon=_mask_phone(phone),
                body=_fallback_body(program, for_veli=True, veli=veli),
                skip_reason=skip,
            ))
        if not veliler:
            recipients.append(StudyProgramNotifyRecipient(
                recipient_type='veli',
                ogrenci_id=student.id,
                veli_id=None,
                display_name='',
                telefon='',
                body='',
                skip_reason='Veli kaydı yok',
            ))

        student_phone = (student.telefon or '').strip()
        recipients.append(StudyProgramNotifyRecipient(
            recipient_type='ogrenci',
            ogrenci_id=student.id,
            veli_id=None,
            display_name=student_name,
            telefon=_mask_phone(student_phone) if student_phone else '',
            body=_fallback_body(program, for_veli=False),
            skip_reason='' if student_phone else 'Öğrenci telefonu bulunamadı',
        ))

        resolved_v = resolve_binding(
            kurum_id, EVENT_KEY, RecipientType.VELI,
            sube_id=getattr(student, 'sube_id', None),
        )
        resolved_o = resolve_binding(
            kurum_id, EVENT_KEY, RecipientType.OGRENCI,
            sube_id=getattr(student, 'sube_id', None),
        )
        meta_v_name = getattr(getattr(resolved_v, 'meta_template', None), 'name', '') or ''
        meta_o_name = getattr(getattr(resolved_o, 'meta_template', None), 'name', '') or ''

        return StudyProgramNotifyPreview(
            program_id=program.id,
            student_name=student_name,
            week_label=_week_label(program),
            recipients=recipients,
            meta_template_veli=meta_v_name,
            meta_template_ogrenci=meta_o_name,
            send_mode='meta_template' if (meta_v_name or meta_o_name) else 'document',
        )

    @transaction.atomic
    def send(
        self,
        kurum_id: int,
        program_id: int,
        *,
        veli_ids: list[int] | None = None,
        include_student: bool = False,
        sent_by_user_id: int | None = None,
        pdf_bytes: bytes | None = None,
        pdf_filename: str | None = None,
    ) -> dict:
        preview = self.preview(kurum_id, program_id)
        program = (
            WeeklyProgram.objects.select_related('student', 'coach')
            .filter(id=program_id, student__kurum_id=kurum_id)
            .first()
        )
        if not program:
            raise ValueError('Program bulunamadı.')

        if pdf_bytes is None:
            pdf_bytes = render_study_program_pdf(program)
            filename = study_program_pdf_filename(program)
        else:
            filename = pdf_filename or study_program_pdf_filename(program)
            if len(pdf_bytes) < 2500 or not pdf_bytes.startswith(b'%PDF'):
                raise ValueError('Geçersiz veya boş PDF dosyası.')

        selected_veli = set(veli_ids or [])
        sent = 0
        skipped = 0
        errors: list[str] = []
        sent_details: list[dict] = []

        for item in preview.recipients:
            if item.recipient_type == 'veli':
                if not item.veli_id or item.veli_id not in selected_veli:
                    continue
                if item.skip_reason:
                    skipped += 1
                    errors.append(f'{item.display_name}: {item.skip_reason}')
                    continue
                veli = OgrenciVeli.objects.filter(id=item.veli_id).first()
                if not veli:
                    skipped += 1
                    continue
                ctx = _context(program, veli=veli)
                body = _fallback_body(program, for_veli=True, veli=veli)
                result = dispatch_event(
                    kurum_id,
                    EVENT_KEY,
                    recipient=NotificationRecipient.veli(veli.id),
                    context={**ctx, 'kisa_mesaj': body},
                    attachment=NotificationAttachment(filename=filename, file_bytes=pdf_bytes),
                    source=MessageSource(module=SOURCE_KOC, ref_id=f'calisma_programi:{program.id}:veli:{veli.id}'),
                    sube_id=getattr(program.student, 'sube_id', None),
                    sent_by_user_id=sent_by_user_id,
                    fallback_body=body,
                )
                if result and result.success:
                    sent += 1
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
                ctx = _context(program)
                body = _fallback_body(program, for_veli=False)
                result = dispatch_event(
                    kurum_id,
                    EVENT_KEY,
                    recipient=NotificationRecipient.ogrenci(program.student_id),
                    context={**ctx, 'kisa_mesaj': body},
                    attachment=NotificationAttachment(filename=filename, file_bytes=pdf_bytes),
                    source=MessageSource(module=SOURCE_KOC, ref_id=f'calisma_programi:{program.id}:ogrenci'),
                    sube_id=getattr(program.student, 'sube_id', None),
                    sent_by_user_id=sent_by_user_id,
                    fallback_body=body,
                )
                if result and result.success:
                    sent += 1
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
        }
