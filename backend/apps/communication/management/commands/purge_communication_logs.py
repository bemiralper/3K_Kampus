"""
Eski iletişim loglarını temizler (KVKK / disk).

`CommunicationLog` ham API/webhook gövdesi, `RawWebhookEvent` ham Meta payload'ı
taşır; ikisi de kişisel veri içerir. Varsayılan saklama 90 gün; işlenmiş
webhook olayları silinir, FAILED/SKIPPED olanlar inceleme için `--keep-failed`
ile korunabilir.

Cron: 0 4 * * *  python manage.py purge_communication_logs --days 90
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.communication.domain.enums import WebhookProcessingStatus
from apps.communication.domain.models import CommunicationLog, RawWebhookEvent


class Command(BaseCommand):
    help = 'İletişim API/webhook loglarını saklama süresine göre temizler.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=90, help='Saklama süresi (gün), varsayılan 90')
        parser.add_argument('--keep-failed', action='store_true', help='FAILED/SKIPPED webhook olaylarını koru')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=max(1, options['days']))
        log_qs = CommunicationLog.objects.filter(created_at__lt=cutoff)
        event_qs = RawWebhookEvent.objects.filter(created_at__lt=cutoff)
        if options['keep_failed']:
            event_qs = event_qs.filter(processing_status=WebhookProcessingStatus.PROCESSED)

        log_count = log_qs.count()
        event_count = event_qs.count()
        if options['dry_run']:
            self.stdout.write(f'[dry-run] silinecek: log={log_count} webhook_event={event_count}')
            return
        log_qs.delete()
        event_qs.delete()
        self.stdout.write(f'silindi: log={log_count} webhook_event={event_count} (cutoff={cutoff:%Y-%m-%d})')
