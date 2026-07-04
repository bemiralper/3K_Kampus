"""Ödev kontrol kilidi — kontrol günü bittikten sonra düzenleme/silme engeli."""

from datetime import date

from django.utils import timezone

from .models import AssignmentTask, ManualAssignment

CONTROL_LOCK_MESSAGE = (
    'Kontrol günü sona erdiği için bu ödev artık düzenlenemez veya silinemez.'
)


def assignment_due_local_date(assignment) -> date | None:
    if not assignment.due_date:
        return None
    if timezone.is_aware(assignment.due_date):
        return timezone.localtime(assignment.due_date).date()
    return assignment.due_date.date()


def assignment_has_control_evaluation(assignment) -> bool:
    """En az bir görev değerlendirilmiş veya ödev getirilmedi işaretlenmiş."""
    if assignment.non_submission_reason:
        return True
    return AssignmentTask.objects.filter(
        lesson_block__assignment=assignment,
    ).exclude(
        completion_status=AssignmentTask.CompletionStatus.PENDING,
    ).exists()


def is_assignment_control_locked(assignment) -> bool:
    """
    Ödev kontrolü yapılmış ve kontrol günü (due_date) takvim günü olarak bitmişse kilitli.
    Aynı gün içinde düzenlemeye izin verilir; ertesi günden itibaren kilitlenir.
    """
    if not assignment_has_control_evaluation(assignment):
        return False
    due = assignment_due_local_date(assignment)
    if not due:
        return False
    return timezone.localdate() > due
