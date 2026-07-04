"""Kaynak havuzu (StudentResourceAssignment) ilerlemesini manuel ödevlerden senkronize eder."""

from django.db.models import Avg
from django.utils import timezone

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.student_resources.models import StudentResourceAssignment

_ACTIVE_MANUAL_STATUSES = (
    ManualAssignment.Status.ASSIGNED,
    ManualAssignment.Status.IN_PROGRESS,
    ManualAssignment.Status.COMPLETED,
    ManualAssignment.Status.OVERDUE,
)


def sync_source_assignment_progress(manual_assignment):
    """
    Bağlı kaynak atamasının ilerlemesini güncelle.

    Kural: Aynı source_assignment'a bağlı aktif manuel ödevlerin (taslak/iptal hariç)
    completion_percent ortalaması → progress_percent.
    """
    source_id = manual_assignment.source_assignment_id
    if not source_id:
        return

    try:
        source = StudentResourceAssignment.objects.get(pk=source_id, is_active=True)
    except StudentResourceAssignment.DoesNotExist:
        return

    manuals = ManualAssignment.objects.filter(
        source_assignment_id=source_id,
        is_active=True,
        status__in=_ACTIVE_MANUAL_STATUSES,
    )
    if not manuals.exists():
        return

    progress = round(manuals.aggregate(avg=Avg('completion_percent'))['avg'] or 0)
    source.progress_percent = progress

    all_completed = not manuals.exclude(
        status=ManualAssignment.Status.COMPLETED,
    ).exists()

    update_fields = ['progress_percent', 'updated_at']

    if (
        all_completed
        and progress >= 100
        and source.status != StudentResourceAssignment.Status.CANCELLED
    ):
        source.status = StudentResourceAssignment.Status.COMPLETED
        if not source.completed_at:
            source.completed_at = timezone.now()
            update_fields.append('completed_at')
        update_fields.append('status')
    elif (
        progress > 0
        and source.status
        not in (
            StudentResourceAssignment.Status.COMPLETED,
            StudentResourceAssignment.Status.CANCELLED,
        )
    ):
        source.status = StudentResourceAssignment.Status.IN_PROGRESS
        update_fields.append('status')

    source.save(update_fields=update_fields)
