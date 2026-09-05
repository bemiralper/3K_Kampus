"""
İletişim kuyruk işleme komutu.

Kullanım:
    python manage.py process_communication_queue
    python manage.py process_communication_queue --dry-run

Cron örneği (her dakika):
    * * * * * cd /path/to/backend && DJANGO_ENV=production python manage.py process_communication_queue >> /var/log/comm_queue.log 2>&1

Ayarlar (config/settings/base.py):
    COMMUNICATION_QUEUE_BATCH_SIZE — batch boyutu (varsayılan 20)
    COMMUNICATION_QUEUE_THROTTLE_MS — Meta API çağrıları arası bekleme ms (varsayılan 200)
    COMMUNICATION_QUEUE_DRAIN_SECONDS — tek çalışmada kuyruğu boşaltma bütçesi (varsayılan 50 sn)
"""
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.communication.application.outbound_processor import (
    drain_pending_queue,
    process_pending_batch,
)
from apps.communication.infrastructure.repository import OutboundQueueRepository


class Command(BaseCommand):
    help = 'Giden iletişim kuyruğunu işle'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Gönderim yapmadan pending sayısını göster',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=None,
            help='Batch boyutu (varsayılan: COMMUNICATION_QUEUE_BATCH_SIZE)',
        )
        parser.add_argument(
            '--max-seconds',
            type=float,
            default=None,
            help=(
                'Kuyruğu boşaltmak için ayrılan süre '
                '(varsayılan: COMMUNICATION_QUEUE_DRAIN_SECONDS, 0 → tek batch)'
            ),
        )
        parser.add_argument(
            '--once',
            action='store_true',
            help='Yalnızca tek batch işle (eski davranış)',
        )

    def handle(self, *args, **options):
        now = timezone.now()
        batch_size = options['batch_size'] or getattr(
            settings, 'COMMUNICATION_QUEUE_BATCH_SIZE',
            getattr(settings, 'COMM_QUEUE_BATCH_SIZE', 20),
        )
        self.stdout.write(
            f'📨 İletişim kuyruğu — {now.strftime("%d.%m.%Y %H:%M:%S")} (batch={batch_size})'
        )

        if options['dry_run']:
            pending_count = OutboundQueueRepository.count_pending()
            self.stdout.write(f'📊 İşlenecek kuyruk kaydı: {pending_count}')
            return

        if options['once']:
            result = process_pending_batch(limit=batch_size)
            result['pending_left'] = OutboundQueueRepository.count_pending()
        else:
            result = drain_pending_queue(
                max_seconds=options['max_seconds'],
                batch_size=batch_size,
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'✅ Tamamlandı — İşlenen: {result["processed"]}, '
                f'Gönderilen: {result["sent"]}, Başarısız: {result["failed"]}, '
                f'Kalan: {result.get("pending_left", 0)}'
            )
        )
