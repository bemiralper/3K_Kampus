import time
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from apps.coaching.assignment_manual.models import AssignmentOperation
from apps.coaching.assignment_manual.operations import process_operation


class Command(BaseCommand):
    help = 'Process persisted homework PDF jobs (Celery fallback; no HTTP request work).'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=10)
        parser.add_argument('--max-seconds', type=int, default=50)

    def handle(self, *args, **options):
        started = time.monotonic()
        ids = list(AssignmentOperation.objects.filter(kind='notify').filter(
            Q(status='PENDING') | Q(status='PROCESSING', started_at__lt=timezone.now()-timedelta(minutes=5))
        ).order_by('created_at').values_list('pk', flat=True)[:max(1, min(options['limit'], 100))])
        count = 0
        for operation_id in ids:
            if time.monotonic()-started >= options['max_seconds']:
                break
            process_operation(operation_id)
            count += 1
        self.stdout.write(f'Processed jobs: {count}')
