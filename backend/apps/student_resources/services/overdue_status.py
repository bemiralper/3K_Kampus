"""Gecikmiş (OVERDUE) atama durumunu toplu günceller."""

from django.utils import timezone

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.student_resources.models import StudentResourceAssignment


def refresh_manual_assignment_overdue(kurum_id=None):
    """
    due_date geçmiş ASSIGNED/IN_PROGRESS manuel ödevleri OVERDUE yap.

    `kurum_id` verilirse güncelleme o kuruma sınırlanır — her istek üzerinde
    TÜM kurumların tablosunu taraması yerine yalnızca isteği yapan kurumun
    satırları güncellenir (çoklu kurum ortamında gereksiz UPDATE/kilit önlenir).
    `kurum_id=None` geriye dönük uyumluluk için tüm kurumları günceller
    (örn. cron/management command çağrıları).
    """
    now = timezone.now()
    queryset = ManualAssignment.objects.filter(
        is_active=True,
        due_date__lt=now,
        status__in=(
            ManualAssignment.Status.ASSIGNED,
            ManualAssignment.Status.IN_PROGRESS,
        ),
    )
    if kurum_id:
        queryset = queryset.filter(student__kurum_id=kurum_id)
    return queryset.update(status=ManualAssignment.Status.OVERDUE)


def refresh_student_resource_overdue():
    """due_date geçmiş ASSIGNED/IN_PROGRESS kaynak atamalarını OVERDUE yap."""
    today = timezone.now().date()
    return StudentResourceAssignment.objects.filter(
        is_active=True,
        due_date__lt=today,
        status__in=(
            StudentResourceAssignment.Status.ASSIGNED,
            StudentResourceAssignment.Status.IN_PROGRESS,
        ),
    ).update(status=StudentResourceAssignment.Status.OVERDUE)


def refresh_all_overdue():
    """Her iki model için gecikme durumunu güncelle."""
    manual_count = refresh_manual_assignment_overdue()
    resource_count = refresh_student_resource_overdue()
    return manual_count, resource_count


def revert_student_resource_overdue_if_extended(assignment):
    """Erteleme/güncelleme sonrası gelecekteki son tarihte OVERDUE → ASSIGNED."""
    if assignment.status != StudentResourceAssignment.Status.OVERDUE:
        return False
    today = timezone.now().date()
    if assignment.due_date and assignment.due_date >= today:
        assignment.status = StudentResourceAssignment.Status.ASSIGNED
        assignment.save(update_fields=['status', 'updated_at'])
        return True
    return False
