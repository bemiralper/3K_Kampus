"""Read-time status projection: same calendar rule as the overdue maintenance job."""
from django.db.models import Case, When, Value, F, CharField
from django.utils import timezone


def with_effective_status(queryset):
    return queryset.annotate(effective_status=Case(
        When(status__in=('ASSIGNED', 'IN_PROGRESS'), due_date__date__lt=timezone.localdate(), then=Value('OVERDUE')),
        When(status='OVERDUE', due_date__date__gte=timezone.localdate(), completion_percent__gt=0, then=Value('IN_PROGRESS')),
        When(status='OVERDUE', due_date__date__gte=timezone.localdate(), completion_percent__lte=0, then=Value('ASSIGNED')),
        default=F('status'), output_field=CharField(),
    ))
