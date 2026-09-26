"""Sınav karne / cevap anahtarı zamanlanmış gönderim."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

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

KARNE_CHUNK = 10


def exam_is_graded(exam: Exam) -> bool:
    if exam.status in (Exam.Status.RESULTS_UPLOADED, Exam.Status.COMPLETED):
        return True
    if StudentAnswer.objects.filter(session__exam=exam).exists():
        return True
    return ExamSession.objects.filter(exam=exam, status=ExamSession.Status.COMPLETED).exists()


def present_student_ids(exam: Exam) -> set[int]:
    """Yoklamada geldi işaretli katılımcılar."""
    return set(
        ExamParticipant.objects.filter(
            exam=exam,
            attendance=ExamParticipant.Attendance.PRESENT,
        ).exclude(student_id__isnull=True).values_list('student_id', flat=True)
    )


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
        'karne_students': StudentAnswer.objects.filter(
            session__exam=exam, student_id__in=present_student_ids(exam),
        ).count(),
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
    campaign: object | None = None,
    expected_total: int | None = None,
    skipped_recipients: list[dict] | None = None,
) -> object:
    from apps.communication.application.campaign_service import CampaignStatsService
    from apps.communication.domain.enums import CampaignStatus, Channel
    from apps.communication.domain.models import Message, OutboundCampaign, OutboundQueueItem

    label = 'Karne PDF' if kind == KIND_KARNE else 'Cevap anahtarı PDF'
    if campaign is None:
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
    opts = dict(campaign.send_options_json or {})
    if expected_total is not None:
        opts['expected_recipients'] = int(expected_total)
    if skipped_recipients:
        existing = list(opts.get('skipped_recipients') or [])
        existing.extend(skipped_recipients)
        opts['skipped_recipients'] = existing
    if opts != (campaign.send_options_json or {}):
        campaign.send_options_json = opts
        campaign.save(update_fields=['send_options_json', 'updated_at'])
    if message_ids:
        valid_ids = []
        for raw in message_ids:
            try:
                valid_ids.append(str(uuid.UUID(str(raw))))
            except (TypeError, ValueError, AttributeError):
                continue
        if valid_ids:
            Message.objects.filter(pk__in=valid_ids).update(campaign_id=campaign.id)
            OutboundQueueItem.objects.filter(message_id__in=valid_ids).update(campaign_id=campaign.id)
    msg_n = Message.objects.filter(campaign_id=campaign.id).count()
    skip_n = len((campaign.send_options_json or {}).get('skipped_recipients') or [])
    shown = msg_n + skip_n
    expected = int((campaign.send_options_json or {}).get('expected_recipients') or 0)
    # İş bitene kadar geçmişte planlanan alıcı sayısı görünsün; 0 kalmasın.
    if expected > shown and not (campaign.send_options_json or {}).get('finalize_totals'):
        shown = expected
    if campaign.total_recipients != shown:
        campaign.total_recipients = shown
        campaign.save(update_fields=['total_recipients', 'updated_at'])
    if msg_n or skip_n:
        CampaignStatsService.refresh_campaign_stats(campaign.id)
        if skip_n:
            campaign.refresh_from_db()
            campaign.failed_count = (campaign.failed_count or 0) + skip_n
            campaign.save(update_fields=['failed_count', 'updated_at'])
    bind_publish_campaign(exam, kind, campaign)
    return campaign


def bind_publish_campaign(exam: Exam, kind: str, campaign) -> ExamScheduledDispatch:
    """Banner’daki ‘Gönderim geçmişi’ linkinin bu kampanyayı göstermesini sağlar."""
    row, _ = ExamScheduledDispatch.objects.get_or_create(
        exam=exam, kind=kind,
        defaults={'status': ST_PENDING, 'is_enabled': False},
    )
    if row.campaign_id != getattr(campaign, 'id', None):
        row.campaign_id = campaign.id
        row.save(update_fields=['campaign_id', 'updated_at'])
    return row


def load_publish_campaign(exam: Exam, campaign_id: str | None):
    if not campaign_id:
        return None
    from apps.communication.domain.models import OutboundCampaign

    campaign = OutboundCampaign.objects.filter(id=campaign_id, kurum_id=exam.kurum_id).first()
    if not campaign:
        return None
    opts = campaign.send_options_json if isinstance(campaign.send_options_json, dict) else {}
    if opts.get('exam_id') not in (exam.id, str(exam.id)):
        return None
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

    present = present_student_ids(exam)
    answers = list(
        StudentAnswer.objects.select_related('student')
        .filter(session__exam=exam, student_id__in=present)
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
            return data, cevap_anahtari_filename(exam)
    return render_cevap_anahtari_pdf(exam), cevap_anahtari_filename(exam)


def _send_karnes(
    exam: Exam,
    *,
    sent_by_user_id: int | None = None,
    include_veli: bool = True,
    include_student: bool = True,
    answer_ids: list[int] | None = None,
    veli_ids: list[int] | None = None,
    ranking_year: int | None = None,
    on_chunk=None,
) -> dict:
    from apps.coaching.application.olcme_karne_notify import send_karne_notify_bulk
    from apps.coaching.application.olcme_karne_pdf import karne_filename, render_karne_pdf
    from apps.coaching.olcme_degerlendirme.services.scoring_settings import resolve_puan_yili
    from apps.coaching.olcme_degerlendirme.views.analysis_views import (
        build_exam_payload_context,
        build_student_detail_payload,
    )

    qs = (
        StudentAnswer.objects.select_related('student', 'session')
        .prefetch_related('section_scores__section')
        .filter(session__exam=exam)
        .order_by('id')
    )
    if answer_ids is None:
        # Otomatik/zamanlı gönderim: yalnızca yoklamada gelenler.
        answers = list(qs.filter(student_id__in=present_student_ids(exam)))
        empty_error = 'Yoklamada gelen ve sonucu olan öğrenci yok.'
    else:
        # Kullanıcı seçimi yoklamadan bağımsızdır; analizde görünen herkes gönderilebilir.
        answers = list(qs.filter(pk__in={int(x) for x in answer_ids}))
        empty_error = 'Seçilen öğrencilerin karnesi bulunamadı.'
    if not answers:
        raise ValueError(empty_error)

    ranking_year = resolve_puan_yili(exam, ranking_year)
    payload_ctx = build_exam_payload_context(exam, ranking_year)
    sent = 0
    skipped = 0
    errors: list[str] = []
    message_ids: list[str] = []
    for i in range(0, len(answers), KARNE_CHUNK):
        chunk = answers[i:i + KARNE_CHUNK]
        items = []
        for answer in chunk:
            karne = build_student_detail_payload(
                exam, answer, ranking_year, include_trend=False, context=payload_ctx,
            )
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
        if on_chunk:
            on_chunk({
                'students': len(chunk),
                'sent_delta': result.get('sent') or 0,
                'skipped_delta': result.get('skipped') or 0,
                'answer_ids': [a.id for a in chunk],
                'message_ids': list(result.get('message_ids') or []),
                'skipped_recipients': list(result.get('skipped_recipients') or []),
            })
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


def _record_karne_chunk(row: ExamScheduledDispatch, exam: Exam, chunk: dict) -> None:
    """Her parça bitince ilerlemeyi ve gönderim geçmişini günceller."""
    opts = dict(row.send_options or {})
    opts['students_done'] = int(opts.get('students_done') or 0) + int(chunk.get('students') or 0)
    opts['messages_sent'] = int(opts.get('messages_sent') or 0) + int(chunk.get('sent_delta') or 0)
    opts['messages_skipped'] = int(opts.get('messages_skipped') or 0) + int(chunk.get('skipped_delta') or 0)
    done_ids = {int(x) for x in (chunk.get('answer_ids') or [])}
    if done_ids and opts.get('answer_ids'):
        opts['answer_ids'] = [int(x) for x in opts['answer_ids'] if int(x) not in done_ids]
    if not opts.get('students_total'):
        opts['students_total'] = opts['students_done'] + len(opts.get('answer_ids') or [])
    row.send_options = opts
    row.sent_count = opts['messages_sent']
    row.skipped_count = opts['messages_skipped']
    row.save(update_fields=['send_options', 'sent_count', 'skipped_count', 'updated_at'])
    campaign = attach_publish_campaign(
        exam, row.kind, chunk.get('message_ids') or [],
        sent_by_user_id=opts.get('sent_by_user_id'),
        campaign=load_publish_campaign(exam, str(row.campaign_id) if row.campaign_id else None),
        skipped_recipients=chunk.get('skipped_recipients') or [],
    )
    if row.campaign_id != campaign.id:
        row.campaign_id = campaign.id
        row.save(update_fields=['campaign_id', 'updated_at'])


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
    ranking_year: int | None = None,
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
    stored = row.send_options if isinstance(row.send_options, dict) else {}
    if stored:
        # Arka plan işi: seçim cron çalışırken satırdan okunur.
        if answer_ids is None and stored.get('answer_ids') is not None:
            answer_ids = [int(x) for x in stored['answer_ids']]
        if student_ids is None and stored.get('student_ids') is not None:
            student_ids = [int(x) for x in stored['student_ids']]
        if veli_ids is None and stored.get('veli_ids') is not None:
            veli_ids = [int(x) for x in stored['veli_ids']]
        if 'include_veli' in stored:
            include_veli = bool(stored['include_veli'])
        if 'include_student' in stored:
            include_student = bool(stored['include_student'])
        if sent_by_user_id is None:
            sent_by_user_id = stored.get('sent_by_user_id')
        if ranking_year is None and stored.get('ranking_year') is not None:
            ranking_year = int(stored['ranking_year'])

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
        send_kwargs['ranking_year'] = ranking_year
        send_kwargs['on_chunk'] = lambda chunk, row=row, exam=exam: _record_karne_chunk(row, exam, chunk)
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

    campaign = load_publish_campaign(exam, str(row.campaign_id) if row.campaign_id else None)
    if campaign is not None:
        opts = dict(campaign.send_options_json or {})
        opts['finalize_totals'] = True
        campaign.send_options_json = opts
        campaign.save(update_fields=['send_options_json', 'updated_at'])
    campaign = attach_publish_campaign(
        exam, row.kind, result.get('message_ids') or [],
        sent_by_user_id=sent_by_user_id,
        campaign=campaign,
    )
    row.status = ST_SENT
    row.sent_at = timezone.now()
    if row.kind == KIND_KARNE:
        stored_now = row.send_options if isinstance(row.send_options, dict) else {}
        row.sent_count = int(stored_now.get('messages_sent') or result.get('sent') or 0)
        row.skipped_count = int(stored_now.get('messages_skipped') or result.get('skipped') or 0)
    else:
        row.sent_count = (row.sent_count or 0) + (result.get('sent') or 0)
        row.skipped_count = (row.skipped_count or 0) + (result.get('skipped') or 0)
    row.last_error = '; '.join((result.get('errors') or [])[:8])
    row.campaign_id = campaign.id
    row.is_enabled = False
    row.send_options = {
        'students_total': int((row.send_options or {}).get('students_total') or 0),
        'students_done': int((row.send_options or {}).get('students_done') or 0),
    }
    row.save(update_fields=[
        'status', 'sent_at', 'sent_count', 'skipped_count', 'last_error',
        'campaign_id', 'is_enabled', 'send_options', 'updated_at',
    ])
    return {
        'ok': True,
        'status': ST_SENT,
        **result,
        'campaign_id': str(campaign.id),
    }


@transaction.atomic
def queue_karne_send(
    exam: Exam,
    *,
    answer_ids: list[int],
    include_veli: bool = True,
    include_student: bool = True,
    sent_by_user_id: int | None = None,
    expected_recipients: int | None = None,
    ranking_year: int | None = None,
) -> dict:
    """Seçilen karneleri arka plan işine yazar.

    Karne PDF üretimi öğrenci başına ~1,5 sn sürdüğü için yüzlerce karne
    istek içinde üretilemez. İş `ExamScheduledDispatch` satırında durur;
    `process_olcme_publish` cron'u üretip kuyruğa alır, tarayıcı kapanabilir.
    """
    if not answer_ids:
        raise ValueError('Öğrenci seçilmedi.')

    row, _ = ExamScheduledDispatch.objects.select_for_update().get_or_create(
        exam=exam, kind=KIND_KARNE,
        defaults={'status': ST_PENDING, 'is_enabled': False},
    )
    if row.status == ST_PENDING and row.is_enabled and row.send_options:
        return {
            'queued': 0,
            'already': True,
            'campaign_id': str(row.campaign_id) if row.campaign_id else None,
        }

    campaign = attach_publish_campaign(
        exam, KIND_KARNE, [],
        sent_by_user_id=sent_by_user_id,
        expected_total=expected_recipients if expected_recipients is not None else len(answer_ids),
    )
    row.refresh_from_db()
    row.send_options = {
        'answer_ids': [int(x) for x in answer_ids],
        'include_veli': bool(include_veli),
        'include_student': bool(include_student),
        'sent_by_user_id': sent_by_user_id,
        'ranking_year': ranking_year,
        'students_total': len(answer_ids),
        'students_done': 0,
    }
    row.scheduled_at = timezone.now()
    row.is_enabled = True
    row.status = ST_PENDING
    row.last_error = ''
    row.campaign_id = campaign.id
    row.save(update_fields=[
        'send_options', 'scheduled_at', 'is_enabled', 'status',
        'last_error', 'campaign_id', 'updated_at',
    ])
    return {
        'queued': len(answer_ids),
        'campaign_id': str(campaign.id),
        'already': False,
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
    _reclaim_stale_karne_jobs(now)
    qs = ExamScheduledDispatch.objects.filter(
        status=ST_PENDING,
        is_enabled=True,
        scheduled_at__isnull=False,
        scheduled_at__lte=now,
    )
    if exam_id:
        qs = qs.filter(exam_id=exam_id)
    ids = list(qs.order_by('scheduled_at', 'id').values_list('id', flat=True))
    processed = 0
    sent = 0
    overdue = 0
    errors: list[str] = []
    for pk in ids:
        if dry_run:
            row = (
                ExamScheduledDispatch.objects.select_related('exam').filter(pk=pk).first()
            )
            if row is None:
                continue
            result = fire_dispatch(row, force=False, dry_run=True)
        else:
            # Kilidi yalnızca işi üstlenirken tut. PDF üretimi dakikalar sürebilir.
            if not _claim_dispatch(pk, now):
                continue
            row = ExamScheduledDispatch.objects.select_related('exam').get(pk=pk)
            result = fire_dispatch(row, force=True, dry_run=False)
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


def _claim_dispatch(pk: int, now) -> bool:
    with transaction.atomic():
        row = (
            ExamScheduledDispatch.objects.select_for_update(skip_locked=True)
            .filter(
                pk=pk,
                status=ST_PENDING,
                is_enabled=True,
                scheduled_at__isnull=False,
                scheduled_at__lte=now,
            )
            .first()
        )
        if row is None:
            return False
        opts = dict(row.send_options or {})
        opts['running_since'] = now.isoformat()
        opts.setdefault('students_done', 0)
        if opts.get('answer_ids') is not None and not opts.get('students_total'):
            opts['students_total'] = len(opts['answer_ids']) + int(opts.get('students_done') or 0)
        row.send_options = opts
        row.is_enabled = False
        row.save(update_fields=['send_options', 'is_enabled', 'updated_at'])
        return True


def _reclaim_stale_karne_jobs(now) -> None:
    """Çöken işi 15 dakika sonra yeniden dene."""
    cutoff = now - timedelta(minutes=15)
    for row in ExamScheduledDispatch.objects.filter(status=ST_PENDING, is_enabled=False):
        opts = row.send_options if isinstance(row.send_options, dict) else {}
        if not opts.get('running_since') or not opts.get('answer_ids'):
            continue
        if row.updated_at and row.updated_at > cutoff:
            continue
        opts.pop('running_since', None)
        row.send_options = opts
        row.is_enabled = True
        row.scheduled_at = now
        row.save(update_fields=['send_options', 'is_enabled', 'scheduled_at', 'updated_at'])


def karne_queue_progress(exam: Exam) -> dict:
    row = ExamScheduledDispatch.objects.filter(exam=exam, kind=KIND_KARNE).first()
    if row is None:
        return {'state': 'idle', 'students_total': 0, 'students_done': 0, 'sent': 0, 'skipped': 0}
    opts = row.send_options if isinstance(row.send_options, dict) else {}
    total = int(opts.get('students_total') or 0)
    done = int(opts.get('students_done') or 0)
    if row.status == ST_SENT:
        state = 'done'
        if not total:
            total = (row.sent_count or 0) + (row.skipped_count or 0)
        if total and done < total:
            done = total
    elif row.status == ST_OVERDUE:
        state = 'error'
    elif opts.get('running_since') or (row.is_enabled and opts.get('answer_ids')):
        state = 'running'
    else:
        state = 'idle'
    return {
        'state': state,
        'students_total': total,
        'students_done': done,
        'sent': row.sent_count or 0,
        'skipped': row.skipped_count or 0,
        'campaign_id': str(row.campaign_id) if row.campaign_id else None,
        'error': (row.last_error or '')[:300],
    }
