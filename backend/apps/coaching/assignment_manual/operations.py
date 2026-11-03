"""Durable PDF jobs and scoped idempotency, using existing Celery/cron infrastructure."""
import hashlib
import json
import logging
from datetime import timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from .models import AssignmentOperation

logger = logging.getLogger(__name__)


def operation_fingerprint(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':'), default=str).encode()).hexdigest()


def get_operation(*, kurum_id, actor_id, kind, key, payload, assignment=None):
    if not isinstance(key, str) or not key.strip() or len(key) > 100:
        raise ValueError('Geçerli işlem anahtarı gerekli (en fazla 100 karakter).')
    fingerprint = operation_fingerprint(payload)
    operation, created = AssignmentOperation.objects.get_or_create(
        kurum_id=kurum_id, actor_id=actor_id, kind=kind, key=key,
        defaults={'fingerprint': fingerprint, 'payload': payload, 'assignment': assignment},
    )
    if operation.fingerprint != fingerprint:
        raise ValueError('Bu işlem anahtarı farklı içerikle kullanılmış. Yeni işlem başlatın.')
    return operation, created


def schedule_operation(operation_id):
    def submit():
        if not getattr(settings, 'CELERY_BROKER_URL', ''):
            return  # Persistent PENDING rows are picked up by process_assignment_jobs.
        try:
            from .tasks import process_assignment_operation
            process_assignment_operation.apply_async(args=[str(operation_id)], retry=False)
        except Exception as exc:
            logger.error('Ödev işi kalıcı kaydedildi; broker erişilemiyor job=%s type=%s', operation_id, type(exc).__name__)
    transaction.on_commit(submit)


def operation_data(operation):
    result = dict(operation.result)
    result.pop('pdf_revision', None)
    details = result.get('sent_details', [])
    if details:
        from apps.communication.domain.models import Message
        messages = {str(m.pk): m for m in Message.objects.filter(
            pk__in=[d['message_id'] for d in details if d.get('message_id')],
            conversation__kurum_id=operation.kurum_id,
        )}
        details = [dict(d) for d in details]
        for detail in details:
            message = messages.get(detail.get('message_id'))
            if message:
                detail['message_status'] = ('UNKNOWN' if 'durumu belirsiz' in (message.failed_reason or '').lower() else message.status)
        result['sent_details'] = details
    return {
        'job_id': str(operation.pk), 'status': operation.status,
        'error': operation.error, **result,
    }


def document_revision(assignment_id, notify_type):
    from django.db.models import Count, Max
    from .models import ManualAssignment, AssignmentTask
    current = ManualAssignment.objects.filter(pk=assignment_id).values(
        'updated_at', 'student_id', 'student__updated_at', 'coach__first_name', 'coach__last_name',
    ).get()
    if notify_type == 'report':
        current['history'] = ManualAssignment.objects.filter(student_id=current['student_id']).aggregate(
            latest=Max('updated_at'), count=Count('id'),
        )
        current['tasks'] = AssignmentTask.objects.filter(lesson_block__assignment__student_id=current['student_id']).aggregate(
            latest=Max('updated_at'), count=Count('id'),
        )
    return operation_fingerprint(current)


def process_operation(operation_id):
    """No provider calls here: PDF first, then atomically persist message queue rows."""
    with transaction.atomic():
        operation = AssignmentOperation.objects.select_for_update().get(pk=operation_id, kind='notify')
        if operation.status in ('QUEUED', 'FAILED'):
            return operation_data(operation)
        if operation.status == 'PROCESSING' and operation.started_at and operation.started_at > timezone.now()-timedelta(minutes=5):
            return operation_data(operation)
        operation.status = 'PROCESSING'
        operation.started_at = timezone.now()
        operation.save(update_fields=['status', 'started_at', 'updated_at'])

    stage = 'authorize'
    try:
        payload = operation.payload
        from .notification_service import AssignmentNotificationService
        service = AssignmentNotificationService()
        from apps.coaching.services.coach_access import user_can_access_student
        assignment = service._get_assignment(operation.assignment_id, operation.kurum_id)
        if (not assignment or not operation.actor or not operation.actor.is_active
                or not user_can_access_student(operation.actor, assignment.student_id)
                or assignment.student.sube_id != payload['sube_id']):
            raise ValueError('İşlem için erişim bağlamı artık geçerli değil.')
        # Revalidate current assignment state and recipients before expensive work.
        service.preview(operation.kurum_id, operation.assignment_id, payload['notify_type'], assignment=assignment)
        revision = document_revision(operation.assignment_id, payload['notify_type'])
        if operation.pdf and operation.result.get('pdf_revision') != revision:
            operation.pdf = ''  # Keep the old artifact; changed data requires a new render.
        if not operation.pdf:
            stage = 'pdf_render'
            from .report_pdf_service import render_assignment_plan_pdf, render_assignment_report_pdf
            renderer = render_assignment_plan_pdf if payload['notify_type'] == 'plan' else render_assignment_report_pdf
            pdf = renderer(operation.assignment_id, operation.kurum_id, orientation=payload['orientation'])
            from apps.communication.application.html_to_pdf import _validate_pdf_bytes
            _validate_pdf_bytes(pdf)
            operation.result = {'pdf_revision': revision}
            operation.pdf.save(f'{operation.pk}.pdf', ContentFile(pdf), save=True)
        stage = 'pdf_read'
        with operation.pdf.open('rb') as document:
            pdf = document.read()
        # Transaction includes local messages and terminal job state. Crash/rollback
        # cannot commit messages without also committing the idempotent result.
        stage = 'queue'
        with transaction.atomic():
            locked = AssignmentOperation.objects.select_for_update().get(pk=operation.pk)
            if locked.status == 'QUEUED':
                return operation_data(locked)
            from .models import ManualAssignment
            ManualAssignment.objects.select_for_update().get(pk=operation.assignment_id)
            if document_revision(operation.assignment_id, payload['notify_type']) != revision:
                raise ValueError('Ödev verileri PDF hazırlanırken değişti; yeniden denenmeli.')
            result = service.send(
                operation.kurum_id, operation.assignment_id, payload['notify_type'],
                veli_ids=payload['veli_ids'], include_student=payload['include_student'],
                sent_by_user_id=operation.actor_id, pdf_bytes=pdf,
                orientation=payload['orientation'],
            )
            locked.result = {**result, 'pdf_revision': revision}
            locked.status = 'QUEUED' if result['sent'] else 'FAILED'
            locked.error = '' if result['sent'] else 'Seçili alıcılar kuyruğa alınamadı.'
            locked.save(update_fields=['result', 'status', 'error', 'updated_at'])
            return operation_data(locked)
    except Exception as exc:
        # Avoid provider payloads / token-bearing renderer URLs in user responses.
        logger.error('Ödev PDF/gönderim işi başarısız job=%s stage=%s type=%s', operation.pk, stage, type(exc).__name__)
        AssignmentOperation.objects.filter(pk=operation.pk).exclude(status='QUEUED').update(
            status='FAILED', error='PDF veya gönderim hazırlığı tamamlanamadı. İşlem kaydı üzerinden yeniden deneyin.',
            updated_at=timezone.now(),
        )
        return operation_data(AssignmentOperation.objects.get(pk=operation.pk))
