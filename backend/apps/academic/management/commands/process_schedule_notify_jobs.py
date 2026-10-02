"""
Yarım kalan sınıf / öğretmen ders programı WhatsApp gönderimlerini sürdürür.

Gönderim normalde HTTP isteğinden ayrı bir iş parçacığında biter. Worker
yeniden başlarsa kayıt RUNNING kalır; bu komut (veya dakikalık
process_communication_queue) kaldığı alıcıdan devam eder.

    python manage.py process_schedule_notify_jobs
    python manage.py process_schedule_notify_jobs --batch-id <uuid>
"""
from django.core.management.base import BaseCommand

from apps.academic.application.schedule_notify_service import process_schedule_notify_batch


class Command(BaseCommand):
    help = 'Yarım kalan ders programı WhatsApp gönderimlerini sürdürür'

    def add_arguments(self, parser):
        parser.add_argument('--batch-id', default='', help='Yalnızca bu gönderim grubu')
        parser.add_argument(
            '--max-seconds',
            type=float,
            default=None,
            help='Bu çalışmada harcanacak üst süre',
        )

    def handle(self, *args, **options):
        batch_id = (options['batch_id'] or '').strip() or None
        processed = process_schedule_notify_batch(
            batch_id,
            max_seconds=options['max_seconds'],
            reclaim_only_stale=True,
        )
        self.stdout.write(self.style.SUCCESS(f'Tamamlanan alıcı: {processed}'))
