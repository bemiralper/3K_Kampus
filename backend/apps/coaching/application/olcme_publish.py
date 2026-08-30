"""Sınav karne / cevap anahtarı zamanlanmış gönderim."""
from __future__ import annotations

from datetime import datetime

from django.db import transaction
from django.utils import timezone

from apps.coaching.olcme_degerlendirme.models import (
    AnswerKeyItem,
    Exam,
    ExamParticipant,
    ExamScheduledDispatch,
    ExamSession,
    StudentAnswer,
)

KIND_KARNE = ExamScheduledDispatch.Kind.KARNE
KIND_ANSWER_KEY = ExamScheduledDispatch.Kind.ANSWER_KEY
ST_PENDING = ExamScheduledDispatch.Status.PENDING
ST_SENT = ExamScheduledDispatch.Status.SENT
ST_OVERDUE = ExamScheduledDispatch.Status.OVERDUE_UNREAD
ST_CANCELLED = ExamScheduledDispatch.Status.CANCELLED

KARNE_CHUNK = 80


def exam_is_graded(exam: Exam) -> bool:
    if exam.status in (Exam.Status.RESULTS_UPLOADED, Exam.Status.COMPLETED):
        return True
    if StudentAnswer.objects.filter(session__exam=exam).exists():
        return True
    return ExamSession.objects.filter(exam=exam, status=ExamSession.Status.COMPLETED).exists()


def answer_key_ready(exam: Exam) -> bool:
    if getattr(exam, 'answer_key_pdf', None) and exam.answer_key_pdf:
        return True
    return AnswerKeyItem.objects.filter(answer_key__exam=exam).exists()


def serialize_dispatch(row: ExamScheduledDispatch | None) -> dict | None:
    if not row:
        return None
    return {
        'id': row.id,
        'kind': row.kind,
        'kind_label': row.get_kind_display(),
        'status': row.status,
        'status_label': row.get_status_display(),
        'scheduled_at': row.scheduled_at.isoformat() if row.scheduled_at else None,
        'sent_at': row.sent_at.isoformat() if row.sent_at else None,
        'sent_count': row.sent_count,
        'skipped_count': row.skipped_count,
        'last_error': row.last_error or '',
        'is_enabled': bool(getattr(row, 'is_enabled', False)),
        'campaign_id': str(row.campaign_id) if getattr(row, 'campaign_id', None) else None,
        'ready': exam_is_graded(row.exam) if row.kind == KIND_KARNE else answer_key_ready(row.exam),
    }


def ensure_dispatch_rows(exam: Exam) -> dict[str, ExamScheduledDispatch]:
    rows = {}
    for kind in (KIND_KARNE, KIND_ANSWER_KEY):
        row, _ = ExamScheduledDispatch.objects.get_or_create(
            exam=exam, kind=kind,
            defaults={'is_enabled': False, 'status': ST_PENDING},
        )
        row.exam = exam
        rows[kind] = row
    return rows


def publish_status(exam: Exam) -> dict:
    rows = ensure_dispatch_rows(exam)
    return {
        'exam_id': exam.id,
        'graded': exam_is_graded(exam),
        'answer_key_ready': answer_key_ready(exam),
        'has_uploaded_pdf': bool(getattr(exam, 'answer_key_pdf', None) and exam.answer_key_pdf),
        'karne_students': StudentAnswer.objects.filter(session__exam=exam).count(),
        'answer_key_students': ExamParticipant.objects.filter(
            exam=exam, attendance=ExamParticipant.Attendance.PRESENT,
        ).count(),
        'karne': serialize_dispatch(rows.get(KIND_KARNE)),
        'answer_key': serialize_dispatch(rows.get(KIND_ANSWER_KEY)),
    }


def _upsert(exam: Exam, kind: str, when: datetime | None) -> ExamScheduledDispatch | None:
    row = ExamScheduledDispatch.objects.filter(exam=exam, kind=kind).first()
    if when is None:
        if row and row.status != ST_SENT:
            row.scheduled_at = None
            row.is_enabled = False
            row.last_error = ''
            if row.status != ST_SENT:
                row.status = ST_PENDING
            row.save(update_fields=['status', 'scheduled_at', 'is_enabled', 'last_error', 'updated_at'])
        return row
    if row is None:
        return ExamScheduledDispatch.objects.create(
            exam=exam, kind=kind, scheduled_at=when, status=ST_PENDING, is_enabled=False,
        )
    if row.status == ST_SENT:
        return row
    if row.status == ST_OVERDUE and row.scheduled_at == when:
        return row
    row.scheduled_at = when
    row.status = ST_PENDING
    row.last_error = ''
    row.save(update_fields=['scheduled_at', 'status', 'last_error', 'updated_at'])
    return row


def sync_dispatches_from_exam(exam: Exam) -> dict:
    karne = _upsert(exam, KIND_KARNE, exam.result_publish_date)
    answer = _upsert(exam, KIND_ANSWER_KEY, exam.answer_key_publish_date)
    return {
        'karne': serialize_dispatch(karne),
        'answer_key': serialize_dispatch(answer),
    }


def set_schedule(
    exam: Exam,
    kind: str,
    *,
    is_enabled: bool,
    scheduled_at: datetime | None,
) -> ExamScheduledDispatch:
    if kind not in (KIND_KARNE, KIND_ANSWER_KEY):
        raise ValueError('Geçersiz gönderim türü.')
    if is_enabled and scheduled_at is None:
        raise ValueError('Zamanlı gönderimi açmak için tarih/saat gerekli.')

    if kind == KIND_KARNE:
        exam.result_publish_date = scheduled_at
        exam.save(update_fields=['result_publish_date', 'updated_at'])
    else:
        exam.answer_key_publish_date = scheduled_at
        exam.save(update_fields=['answer_key_publish_date', 'updated_at'])

    row, _ = ExamScheduledDispatch.objects.get_or_create(
        exam=exam, kind=kind,
        defaults={'status': ST_PENDING, 'is_enabled': False},
    )
    row.scheduled_at = scheduled_at
    if row.status == ST_SENT:
        row.is_enabled = False
        row.save(update_fields=['scheduled_at', 'is_enabled', 'updated_at'])
        return row
    row.is_enabled = bool(is_enabled and scheduled_at)
    row.status = ST_PENDING
    row.last_error = ''
    row.sent_at = None
    row.save(update_fields=[
        'scheduled_at', 'is_enabled', 'status', 'last_error', 'sent_at', 'updated_at',
    ])
    return row


def reschedule(exam: Exam, kind: str, when: datetime) -> ExamScheduledDispatch:
    return set_schedule(exam, kind, is_enabled=False, scheduled_at=when)


def cancel_enabled_karne_schedule(exam: Exam) -> bool:
    row = ExamScheduledDispatch.objects.filter(exam=exam, kind=KIND_KARNE).first()
    if not row or not row.is_enabled or row.status != ST_PENDING:
        return False
    row.is_enabled = False
    row.status = ST_CANCELLED
    row.last_error = 'Analiz toplu gönderimi ile iptal edildi.'
    row.save(update_fields=['is_enabled', 'status', 'last_error', 'updated_at'])
    return True


def karne_schedule_active(exam: Exam) -> dict | None:
    row = ExamScheduledDispatch.objects.filter(exam=exam, kind=KIND_KARNE).first()
    if not row or not row.is_enabled or row.status != ST_PENDING or not row.scheduled_at:
        return None
    row.exam = exam
    return serialize_dispatch(row)


def attach_publish_campaign(
    exam: Exam,
    kind: str,
    message_ids: list[str],
    *,
    sent_by_user_id: int | None = None,
) -> object:
    from apps.communication.application.campaign_service import CampaignStatsService
    from apps.communication.domain.enums import CampaignStatus, Channel
    from apps.communication.domain.models import Message, OutboundCampaign, OutboundQueueItem

    label = 'Karne PDF' if kind == KIND_KARNE else 'Cevap anahtarı PDF'
    campaign = OutboundCampaign.objects.create(
        kurum_id=exam.kurum_id,
        sube_id=exam.sube_id,
        created_by_id=sent_by_user_id,
        title=f'{exam.name} — {label}'[:200],
        status=CampaignStatus.QUEUED,
        channel=Channel.WHATSAPP,
        total_recipients=len(message_ids),
        send_options_json={'source': 'olcme_publish', 'kind': kind, 'exam_id': exam.id},
    )
    if message_ids:
        Message.objects.filter(pk__in=message_ids).update(campaign_id=campaign.id)
        OutboundQueueItem.objects.filter(message_id__in=message_ids).update(campaign_id=campaign.id)
    CampaignStatsService.refresh_campaign_stats(campaign.id)
    return campaign


def preview_publish_recipients(exam: Exam, kind: str) -> dict:
    if kind not in (KIND_KARNE, KIND_ANSWER_KEY):
        raise ValueError('Geçersiz gönderim türü.')
    if kind == KIND_ANSWER_KEY:
        from apps.coaching.application.olcme_cevap_anahtari_notify import preview_answer_key_notify
        data = preview_answer_key_notify(exam)
        data['ready'] = answer_key_ready(exam)
        return data

    from apps.coaching.application.olcme_karne_notify import preview_karne_notify

    answers = list(
        StudentAnswer.objects.select_related('student')
        .filter(session__exam=exam)
        .order_by('id')
    )
    students = []
    preview_body = ''
    for answer in answers:
        student = answer.student
        name = (
            f'{student.ad} {student.soyad}'.strip()
            if student else (answer.raw_student_name or answer.raw_student_id or 'Öğrenci')
        )
        stub = {
            'student_id': answer.student_id,
            'student_name': name,
            'exam_name': exam.name,
            'answer_id': answer.id,
            'toplam_net': float(answer.total_net or 0),
            'puan': None,
        }
        preview = preview_karne_notify(exam.kurum_id, stub)
        if not preview_body:
            for rec in preview.recipients:
                if rec.body and not rec.skip_reason:
                    preview_body = rec.body
                    break
        students.append({
            'student_id': answer.student_id,
            'participant_id': None,
            'answer_id': answer.id,
            'full_name': name,
            'recipients': [
                {
                    'recipient_type': r.recipient_type,
                    'ogrenci_id': r.ogrenci_id,
                    'veli_id': r.veli_id,
                    'display_name': r.display_name,
                    'telefon': r.telefon,
                    'body': r.body,
                    'skip_reason': r.skip_reason,
                }
                for r in preview.recipients
            ],
        })
    return {
        'kind': KIND_KARNE,
        'exam_id': exam.id,
        'exam_name': exam.name or '',
        'students': students,
        'preview_body': preview_body,
        'ready': exam_is_graded(exam),
    }


def _load_answer_key_pdf(exam: Exam) -> tuple[bytes, str]:
    from apps.coaching.application.olcme_cevap_anahtari_pdf import (
        cevap_anahtari_filename,
        render_cevap_anahtari_pdf,
    )

    if exam.answer_key_pdf:
        exam.answer_key_pdf.open('rb')
        try:
            data = exam.answer_key_pdf.read()
        finally:
            exam.answer_key_pdf.close()
        if data and data.startswith(b'%PDF'):
            name = (exam.answer_key_pdf.name or '').rsplit('/', 1)[-1] or cevap_anahtari_filename(exam)
            return data, name
    return render_cevap_anahtari_pdf(exam), cevap_anahtari_filename(exam)


def _send_karnes(
    exam: Exam,
    *,
    sent_by_user_id: int | None = None,
    include_veli: bool = True,
    include_student: bool = True,
    answer_ids: list[int] | None = None,
    veli_ids: list[int] | None = None,
) -> dict:
    from apps.coaching.application.olcme_karne_notify import send_karne_notify_bulk
    from apps.coaching.application.olcme_karne_pdf import karne_filename, render_karne_pdf
    from apps.coaching.olcme_degerlendirme.services.scoring_settings import resolve_puan_yili
    from apps.coaching.olcme_degerlendirme.views.analysis_views import (
        build_student_detail_payload,
    )

    answers = list(
        StudentAnswer.objects.select_related('student', 'session')
        .prefetch_related('section_scores__section')
        .filter(session__exam=exam)
        .order_by('id')
    )
    if answer_ids is not None:
        allowed = {int(x) for x in answer_ids}
        answers = [a for a in answers if a.id in allowed]
    if not answers:
        raise ValueError('Gönderilecek karne yok — sınav henüz okunmadı.')

    ranking_year = resolve_puan_yili(exam, None)
    sent = 0
    skipped = 0
    errors: list[str] = []
    message_ids: list[str] = []
    for i in range(0, len(answers), KARNE_CHUNK):
        chunk = answers[i:i + KARNE_CHUNK]
        items = []
        for answer in chunk:
            karne = build_student_detail_payload(exam, answer, ranking_year, include_trend=False)
            items.append({
                'answer_id': answer.id,
                'karne': karne,
                'pdf_bytes': render_karne_pdf(karne),
                'filename': karne_filename(karne),
                'sube_id': exam.sube_id or getattr(answer.student, 'sube_id', None),
            })
        result = send_karne_notify_bulk(
            kurum_id=exam.kurum_id,
            exam_id=exam.id,
            items=items,
            include_veli=include_veli,
            include_student=include_student,
            sent_by_user_id=sent_by_user_id,
            sube_id=exam.sube_id,
            veli_ids=veli_ids,
        )
        sent += result.get('sent') or 0
        skipped += result.get('skipped') or 0
        errors.extend(result.get('errors') or [])
        message_ids.extend(result.get('message_ids') or [])
    return {'sent': sent, 'skipped': skipped, 'errors': errors, 'message_ids': message_ids}


def _send_answer_keys(
    exam: Exam,
    *,
    sent_by_user_id: int | None = None,
    include_veli: bool = True,
    include_student: bool = True,
    student_ids: list[int] | None = None,
    veli_ids: list[int] | None = None,
) -> dict:
    from apps.coaching.application.olcme_cevap_anahtari_notify import send_answer_key_notify

    pdf_bytes, filename = _load_answer_key_pdf(exam)
    return send_answer_key_notify(
        exam, pdf_bytes, filename,
        include_veli=include_veli,
        include_student=include_student,
        sent_by_user_id=sent_by_user_id,
        student_ids=student_ids,
        veli_ids=veli_ids,
    )


def fire_dispatch(
    row: ExamScheduledDispatch,
    *,
    force: bool = False,
    sent_by_user_id: int | None = None,
    dry_run: bool = False,
    include_veli: bool = True,
    include_student: bool = True,
    student_ids: list[int] | None = None,
    veli_ids: list[int] | None = None,
    answer_ids: list[int] | None = None,
) -> dict:
    exam = row.exam
    exam.refresh_from_db()
    # Cron overdue kaydı sessizce göndermez; Hemen gönder / yeniden zamanla gerekir.
    if not force and row.status == ST_OVERDUE:
        return {
            'ok': False,
            'status': ST_OVERDUE,
            'error': row.last_error or 'Saat geçti — Hemen gönder veya yeniden zamanla.',
        }
    send_kwargs = {
        'sent_by_user_id': sent_by_user_id,
        'include_veli': include_veli,
        'include_student': include_student,
        'veli_ids': veli_ids,
    }
    if row.kind == KIND_KARNE:
        ready = exam_is_graded(exam)
        missing = 'Sınav henüz okunmadı.'
        send_kwargs['answer_ids'] = answer_ids
        sender = _send_karnes
    else:
        ready = answer_key_ready(exam)
        missing = 'Cevap anahtarı PDF / satır yok.'
        send_kwargs['student_ids'] = student_ids
        sender = _send_answer_keys

    now = timezone.now()
    due = bool(row.scheduled_at and row.scheduled_at <= now)
    if not force and not due:
        return {'ok': False, 'status': row.status, 'error': 'Zamanı gelmedi.'}

    if not ready:
        if dry_run:
            return {'ok': False, 'status': ST_OVERDUE, 'error': missing, 'dry_run': True}
        row.status = ST_OVERDUE
        row.last_error = missing
        row.save(update_fields=['status', 'last_error', 'updated_at'])
        return {'ok': False, 'status': ST_OVERDUE, 'error': missing}

    if dry_run:
        return {'ok': True, 'status': ST_PENDING, 'dry_run': True, 'ready': True}

    try:
        result = sender(exam, **send_kwargs)
    except Exception as exc:
        row.status = ST_OVERDUE
        row.last_error = str(exc)
        row.save(update_fields=['status', 'last_error', 'updated_at'])
        return {'ok': False, 'status': ST_OVERDUE, 'error': str(exc)}

    campaign = attach_publish_campaign(
        exam, row.kind, result.get('message_ids') or [],
        sent_by_user_id=sent_by_user_id,
    )
    row.status = ST_SENT
    row.sent_at = timezone.now()
    row.sent_count = (row.sent_count or 0) + (result.get('sent') or 0)
    row.skipped_count = (row.skipped_count or 0) + (result.get('skipped') or 0)
    row.last_error = '; '.join((result.get('errors') or [])[:8])
    row.campaign_id = campaign.id
    row.is_enabled = False
    row.save(update_fields=[
        'status', 'sent_at', 'sent_count', 'skipped_count', 'last_error',
        'campaign_id', 'is_enabled', 'updated_at',
    ])
    return {
        'ok': True,
        'status': ST_SENT,
        **result,
        'campaign_id': str(campaign.id),
    }


@transaction.atomic
def send_now(
    exam: Exam,
    kind: str,
    *,
    sent_by_user_id: int | None = None,
    include_veli: bool = True,
    include_student: bool = True,
    student_ids: list[int] | None = None,
    veli_ids: list[int] | None = None,
    answer_ids: list[int] | None = None,
) -> dict:
    if kind not in (KIND_KARNE, KIND_ANSWER_KEY):
        raise ValueError('Geçersiz gönderim türü.')
    row, _ = ExamScheduledDispatch.objects.select_for_update().get_or_create(
        exam=exam, kind=kind,
        defaults={'scheduled_at': timezone.now(), 'status': ST_PENDING, 'is_enabled': False},
    )
    has_selection = any(x is not None for x in (student_ids, veli_ids, answer_ids))
    if row.status == ST_SENT and row.sent_count and not has_selection:
        return {
            'ok': True,
            'status': ST_SENT,
            'sent': 0,
            'skipped': 0,
            'errors': ['Zaten gönderildi.'],
            'already': True,
            'campaign_id': str(row.campaign_id) if row.campaign_id else None,
        }
    return fire_dispatch(
        row,
        force=True,
        sent_by_user_id=sent_by_user_id,
        include_veli=include_veli,
        include_student=include_student,
        student_ids=student_ids,
        veli_ids=veli_ids,
        answer_ids=answer_ids,
    )


def process_due(*, now=None, exam_id: int | None = None, dry_run: bool = False) -> dict:
    now = now or timezone.now()
    qs = ExamScheduledDispatch.objects.select_related('exam').filter(
        status=ST_PENDING,
        is_enabled=True,
        scheduled_at__isnull=False,
        scheduled_at__lte=now,
    )
    if exam_id:
        qs = qs.filter(exam_id=exam_id)
    processed = 0
    sent = 0
    overdue = 0
    errors: list[str] = []
    for row in qs.order_by('scheduled_at', 'id'):
        result = fire_dispatch(row, force=False, dry_run=dry_run)
        processed += 1
        if result.get('status') == ST_SENT:
            sent += 1
        elif result.get('status') == ST_OVERDUE:
            overdue += 1
        if result.get('error'):
            errors.append(f'{row.exam_id}:{row.kind}: {result["error"]}')
    return {
        'processed': processed,
        'sent': sent,
        'overdue': overdue,
        'errors': errors,
        'dry_run': dry_run,
    }
