"""
Ödev planı / kontrol raporu WhatsApp gönderimi — önizleme ve çoklu alıcı.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.integration_hooks import (
    SOURCE_ODEV,
    send_document_to_ogrenci,
    send_document_to_veli,
)
from apps.communication.application.pdf_render_service import PdfRenderService
from apps.coaching.assignment_manual.models import AssignmentLesson, AssignmentTask, ManualAssignment
from apps.ogrenci.application.veli_contact import list_outbound_veliler

from .assignment_notify_utils import (
    build_assignment_pdf_filename,
    build_pdf_attachment_message,
    pdf_title_label,
)

OPT_IN_CATEGORY = 'duyuru'

NOTIFY_PLAN = 'plan'
NOTIFY_REPORT = 'report'


@dataclass
class AssignmentNotifyRecipient:
    recipient_type: str  # veli | ogrenci
    ogrenci_id: int
    veli_id: int | None
    display_name: str
    telefon: str
    body: str
    skip_reason: str = ''
    send_count: int = 0
    last_sent_at: str | None = None
    send_history: list[dict] = field(default_factory=list)


@dataclass
class AssignmentNotifyPreview:
    notify_type: str
    assignment_id: int
    assignment_title: str
    student_name: str
    recipients: list[AssignmentNotifyRecipient] = field(default_factory=list)
    pdf_title: str = ''


class AssignmentNotificationService:
    def _get_assignment(self, assignment_id: int, kurum_id: int) -> ManualAssignment | None:
        return (
            ManualAssignment.objects.select_related('student', 'student__kurum')
            .prefetch_related('lessons__tasks', 'lessons__lesson', 'lessons__resource_book')
            .filter(id=assignment_id, student__kurum_id=kurum_id, is_active=True)
            .first()
        )

    def _mask_phone(self, phone: str) -> str:
        p = (phone or '').strip()
        if len(p) > 6:
            return p[:4] + '***' + p[-2:]
        return '***'

    def _format_due(self, assignment: ManualAssignment) -> str:
        if not assignment.due_date:
            return '-'
        return timezone.localtime(assignment.due_date).strftime('%d.%m.%Y %H:%M')

    def _task_status_label(self, status: str) -> str:
        return {
            'DONE': 'Yaptı',
            'NOT_DONE': 'Yapmadı',
            'PARTIAL': 'Eksik',
            'PENDING': 'Beklemede',
        }.get(status or 'PENDING', status or '-')

    def _build_plan_text(self, assignment: ManualAssignment, *, for_veli: bool) -> str:
        ogrenci = assignment.student
        ogrenci_ad = f'{ogrenci.ad} {ogrenci.soyad}'.strip()
        greeting = 'Sayın velimiz,' if for_veli else f'Merhaba {ogrenci.ad},'
        lines = [
            greeting,
            '',
            f'{ogrenci_ad} için ödev planı hazırlandı.',
            f'Ödev: {assignment.title}',
            f'Teslim: {self._format_due(assignment)}',
        ]
        if assignment.description:
            lines.append(f'Not: {assignment.description}')
        lines.append('')
        lines.append('İçerik:')
        for lesson in assignment.lessons.all().order_by('order', 'id'):
            lesson_name = lesson.lesson.ad if lesson.lesson else (lesson.topic_name or 'Ders')
            lines.append(f'• {lesson_name}')
            for task in lesson.tasks.all().order_by('order', 'id'):
                detail = task.title or task.get_task_type_display()
                if task.question_count:
                    detail += f' ({task.question_count} soru)'
                elif task.page_count:
                    detail += f' ({task.page_count} sayfa)'
                lines.append(f'  - {detail}')
        lines.extend(['', '3K Kampüs'])
        return '\n'.join(lines)

    def _build_report_text(self, assignment: ManualAssignment, *, for_veli: bool) -> str:
        ogrenci = assignment.student
        ogrenci_ad = f'{ogrenci.ad} {ogrenci.soyad}'.strip()
        greeting = 'Sayın velimiz,' if for_veli else f'Merhaba {ogrenci.ad},'
        tasks = AssignmentTask.objects.filter(
            lesson_block__assignment=assignment,
        ).select_related('lesson_block', 'lesson_block__lesson')

        done = tasks.filter(completion_status='DONE').count()
        partial = tasks.filter(completion_status='PARTIAL').count()
        not_done = tasks.filter(completion_status='NOT_DONE').count()
        total = tasks.count()

        lines = [
            greeting,
            '',
            f'{ogrenci_ad} ödev kontrol sonuç raporu.',
            f'Ödev: {assignment.title}',
            f'Tamamlanma: %{assignment.completion_percent or 0}',
            f'Görevler: {done} yaptı, {partial} eksik, {not_done} yapmadı (toplam {total})',
            '',
            'Detay:',
        ]
        for task in tasks.order_by('lesson_block__order', 'order', 'id'):
            lesson_name = (
                task.lesson_block.lesson.ad
                if task.lesson_block.lesson
                else (task.lesson_block.topic_name or 'Ders')
            )
            status = self._task_status_label(task.completion_status)
            pct = task.task_completion_percent or 0
            line = f'• {lesson_name} — {task.title or task.get_task_type_display()}: {status}'
            if task.completion_status == 'PARTIAL':
                line += f' (%{pct})'
            lines.append(line)
        lines.extend(['', '3K Kampüs'])
        return '\n'.join(lines)

    def _build_pdf(self, assignment: ManualAssignment, notify_type: str) -> tuple[str, bytes, str]:
        ogrenci = assignment.student
        title = pdf_title_label(notify_type)
        body = (
            self._build_plan_text(assignment, for_veli=True)
            if notify_type == NOTIFY_PLAN
            else self._build_report_text(assignment, for_veli=True)
        )
        filename = build_assignment_pdf_filename(assignment, notify_type)
        pdf_bytes = PdfRenderService.render_simple_text_pdf(
            f'{title} — {ogrenci.ad} {ogrenci.soyad}'.strip(),
            body,
        )
        return title, pdf_bytes, filename

    def _source_id(self, notify_type: str, assignment_id: int, recipient_key: str) -> str:
        return f'{assignment_id}:{notify_type}:{recipient_key}'

    def _recipient_send_history(
        self,
        kurum_id: int,
        source_ref: str,
        *,
        veli_id: int | None = None,
        ogrenci_id: int | None = None,
    ) -> list[dict]:
        from apps.communication.domain.models import Message

        qs = Message.objects.filter(
            source_module=SOURCE_ODEV,
            source_ref_id=source_ref,
            conversation__kurum_id=kurum_id,
        ).select_related('conversation').order_by('-created_at')

        if veli_id is not None:
            qs = qs.filter(conversation__veli_id=veli_id)
        elif ogrenci_id is not None:
            qs = qs.filter(conversation__ogrenci_id=ogrenci_id).filter(
                Q(conversation__veli_id__isnull=True),
            )

        history: list[dict] = []
        for msg in qs[:15]:
            history.append({
                'sent_at': timezone.localtime(msg.created_at).strftime('%d.%m.%Y %H:%M'),
                'status': msg.status,
            })
        return history

    def preview(
        self,
        kurum_id: int,
        assignment_id: int,
        notify_type: str,
    ) -> AssignmentNotifyPreview:
        assignment = self._get_assignment(assignment_id, kurum_id)
        if not assignment:
            raise ValueError('Ödev bulunamadı.')
        if assignment.status == ManualAssignment.Status.DRAFT:
            raise ValueError('Taslak ödev gönderilemez.')
        if notify_type == NOTIFY_REPORT and assignment.status != ManualAssignment.Status.COMPLETED:
            raise ValueError('Kontrol raporu yalnızca tamamlanan ödevler için gönderilebilir.')

        ogrenci = assignment.student
        ogrenci_ad = f'{ogrenci.ad} {ogrenci.soyad}'.strip()
        recipients: list[AssignmentNotifyRecipient] = []

        veli_pairs = list_outbound_veliler(ogrenci)
        kurum = getattr(ogrenci, 'kurum', None)
        for veli, phone in veli_pairs:
            body = build_pdf_attachment_message(
                assignment,
                kurum_id,
                notify_type,
                for_veli=True,
                veli=veli,
                kurum=kurum,
            )
            skip = ''
            if not ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                skip = 'Veli duyuru bildirimini kabul etmemiş'

            source_ref = self._source_id(notify_type, assignment.id, f'veli:{veli.id}')
            history = self._recipient_send_history(kurum_id, source_ref, veli_id=veli.id)

            recipients.append(AssignmentNotifyRecipient(
                recipient_type='veli',
                ogrenci_id=ogrenci.id,
                veli_id=veli.id,
                display_name=veli.tam_ad,
                telefon=self._mask_phone(phone),
                body=body,
                skip_reason=skip,
                send_count=len(history),
                last_sent_at=history[0]['sent_at'] if history else None,
                send_history=history,
            ))

        if not veli_pairs:
            recipients.append(AssignmentNotifyRecipient(
                recipient_type='veli',
                ogrenci_id=ogrenci.id,
                veli_id=None,
                display_name='',
                telefon='',
                body='',
                skip_reason='Veli telefonu bulunamadı',
            ))

        student_phone = (ogrenci.telefon or '').strip()
        student_body = build_pdf_attachment_message(
            assignment,
            kurum_id,
            notify_type,
            for_veli=False,
            kurum=kurum,
        )
        student_skip = ''
        if not student_phone:
            student_skip = 'Öğrenci telefonu bulunamadı'

        student_source = self._source_id(notify_type, assignment.id, 'ogrenci')
        student_history = self._recipient_send_history(
            kurum_id, student_source, ogrenci_id=ogrenci.id,
        )

        recipients.append(AssignmentNotifyRecipient(
            recipient_type='ogrenci',
            ogrenci_id=ogrenci.id,
            veli_id=None,
            display_name=ogrenci_ad,
            telefon=self._mask_phone(student_phone) if student_phone else '',
            body=student_body,
            skip_reason=student_skip,
            send_count=len(student_history),
            last_sent_at=student_history[0]['sent_at'] if student_history else None,
            send_history=student_history,
        ))

        pdf_title = pdf_title_label(notify_type)
        return AssignmentNotifyPreview(
            notify_type=notify_type,
            assignment_id=assignment.id,
            assignment_title=assignment.title,
            student_name=ogrenci_ad,
            recipients=recipients,
            pdf_title=pdf_title,
        )

    def _pdf_meta(self, assignment: ManualAssignment, notify_type: str) -> tuple[str, str]:
        return pdf_title_label(notify_type), build_assignment_pdf_filename(assignment, notify_type)

    @transaction.atomic
    def send(
        self,
        kurum_id: int,
        assignment_id: int,
        notify_type: str,
        *,
        veli_ids: list[int] | None = None,
        include_student: bool = False,
        sent_by_user_id: int | None = None,
        force_resend: bool = False,
        pdf_bytes: bytes | None = None,
        pdf_filename: str | None = None,
        orientation: str = 'portrait',
    ) -> dict:
        preview = self.preview(kurum_id, assignment_id, notify_type)
        assignment = self._get_assignment(assignment_id, kurum_id)
        if not assignment:
            raise ValueError('Ödev bulunamadı.')

        _, default_filename = self._pdf_meta(assignment, notify_type)
        if pdf_bytes is None:
            if notify_type == NOTIFY_REPORT:
                from .report_pdf_service import render_assignment_report_pdf

                pdf_bytes = render_assignment_report_pdf(
                    assignment.id,
                    kurum_id,
                    orientation=orientation,
                )
                filename = default_filename
            elif notify_type == NOTIFY_PLAN:
                from .report_pdf_service import render_assignment_plan_pdf

                pdf_bytes = render_assignment_plan_pdf(
                    assignment.id,
                    kurum_id,
                    orientation=orientation,
                )
                filename = default_filename
            else:
                _, pdf_bytes, filename = self._build_pdf(assignment, notify_type)
        else:
            filename = pdf_filename or default_filename
            if len(pdf_bytes) < 2500 or not pdf_bytes.startswith(b'%PDF'):
                raise ValueError('Geçersiz veya boş PDF dosyası.')
        selected_veli = set(veli_ids or [])
        sent = 0
        skipped = 0
        errors: list[str] = []
        sent_details: list[dict] = []
        from apps.communication.application.debug_trace import mask_phone

        for item in preview.recipients:
            if item.recipient_type == 'veli':
                if not item.veli_id or item.veli_id not in selected_veli:
                    continue
                if item.skip_reason:
                    skipped += 1
                    errors.append(f'{item.display_name}: {item.skip_reason}')
                    continue
                veli_obj = None
                if item.veli_id:
                    from apps.ogrenci.domain.models import OgrenciVeli
                    veli_obj = OgrenciVeli.objects.filter(id=item.veli_id).first()
                short_body = build_pdf_attachment_message(
                    assignment,
                    kurum_id,
                    notify_type,
                    for_veli=True,
                    veli=veli_obj,
                    kurum=getattr(assignment.student, 'kurum', None),
                )
                result = send_document_to_veli(
                    kurum_id,
                    item.veli_id,
                    short_body,
                    OPT_IN_CATEGORY,
                    SOURCE_ODEV,
                    self._source_id(notify_type, assignment.id, f'veli:{item.veli_id}'),
                    file_bytes=pdf_bytes,
                    filename=filename,
                    sent_by_user_id=sent_by_user_id,
                )
                if result and result.success:
                    sent += 1
                    sent_details.append({
                        'recipient_type': 'veli',
                        'display_name': item.display_name,
                        'telefon': mask_phone(result.sent_to_phone or item.telefon),
                        'message_status': result.message_status or 'SENT',
                    })
                else:
                    skipped += 1
                    if result and result.errors:
                        label = item.display_name or item.recipient_type
                        errors.extend(f'{label}: {err}' for err in result.errors)
                    else:
                        label = item.display_name or item.recipient_type
                        errors.append(f'{label}: Gönderim başarısız.')

            elif item.recipient_type == 'ogrenci' and include_student:
                if item.skip_reason:
                    skipped += 1
                    errors.append(f'{item.display_name}: {item.skip_reason}')
                    continue
                short_body = build_pdf_attachment_message(
                    assignment,
                    kurum_id,
                    notify_type,
                    for_veli=False,
                    kurum=getattr(assignment.student, 'kurum', None),
                )
                result = send_document_to_ogrenci(
                    kurum_id,
                    item.ogrenci_id,
                    short_body,
                    OPT_IN_CATEGORY,
                    SOURCE_ODEV,
                    self._source_id(notify_type, assignment.id, 'ogrenci'),
                    file_bytes=pdf_bytes,
                    filename=filename,
                    sent_by_user_id=sent_by_user_id,
                )
                if result and result.success:
                    sent += 1
                    sent_details.append({
                        'recipient_type': 'ogrenci',
                        'display_name': item.display_name,
                        'telefon': mask_phone(result.sent_to_phone or item.telefon),
                        'message_status': result.message_status or 'SENT',
                    })
                else:
                    skipped += 1
                    if result and result.errors:
                        label = item.display_name or item.recipient_type
                        errors.extend(f'{label}: {err}' for err in result.errors)
                    else:
                        label = item.display_name or item.recipient_type
                        errors.append(f'{label}: Gönderim başarısız.')

        if sent:
            try:
                from apps.communication.application.celery_dispatch import dispatch_process_outbound_queue
                dispatch_process_outbound_queue()
            except Exception:
                pass

        return {'sent': sent, 'skipped': skipped, 'errors': errors, 'sent_details': sent_details}
