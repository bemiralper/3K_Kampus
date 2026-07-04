"""
Veli thread'lerini veli telefonuna taşır / eksik veli konuşmalarını oluşturur.
"""
from django.core.management.base import BaseCommand

from apps.communication.application.phone_change_sync import PhoneChangeSync
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli


class Command(BaseCommand):
    help = 'Veli/öğrenci telefonlarını iletişim kayıtlarıyla senkronize eder.'

    def add_arguments(self, parser):
        parser.add_argument('--ogrenci-id', type=int, help='Yalnızca bu öğrenci için onar')
        parser.add_argument('--dry-run', action='store_true', help='Değişiklik yapmadan raporla')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        ogrenci_filter = options.get('ogrenci_id')

        veli_qs = OgrenciVeli.objects.select_related('ogrenci').exclude(telefon='')
        ogrenci_qs = Ogrenci.objects.exclude(telefon='')
        if ogrenci_filter:
            veli_qs = veli_qs.filter(ogrenci_id=ogrenci_filter)
            ogrenci_qs = ogrenci_qs.filter(id=ogrenci_filter)

        veli_count = 0
        for veli in veli_qs:
            if dry_run:
                self.stdout.write(f'Veli {veli.id} @ {veli.telefon!r}')
            else:
                PhoneChangeSync.on_veli_saved(veli)
            veli_count += 1

        ogr_count = 0
        for ogrenci in ogrenci_qs:
            if dry_run:
                self.stdout.write(f'Öğrenci {ogrenci.id} @ {ogrenci.telefon!r}')
            else:
                PhoneChangeSync.on_ogrenci_saved(ogrenci)
            ogr_count += 1

        reset_count = 0 if dry_run else self._reset_debug_trace_queue()

        self.stdout.write(self.style.SUCCESS(
            f'Tamamlandı: {veli_count} veli, {ogr_count} öğrenci senkronize edildi, '
            f'{reset_count} kuyruk kaydı sıfırlandı'
            + (' (dry-run)' if dry_run else '')
        ))

    def _reset_debug_trace_queue(self) -> int:
        from django.db import transaction
        from django.utils import timezone

        from apps.communication.domain.enums import MessageStatus
        from apps.communication.domain.models import OutboundQueueItem

        qs = OutboundQueueItem.objects.filter(
            last_error__icontains='debug_trace',
        ).select_related('message')
        count = qs.count()
        if not count:
            return count

        with transaction.atomic():
            for item in qs:
                item.attempt_count = 0
                item.last_error = ''
                item.locked_at = None
                item.next_attempt_at = timezone.now()
                item.save(update_fields=[
                    'attempt_count', 'last_error', 'locked_at', 'next_attempt_at', 'updated_at',
                ])
                msg = item.message
                if msg.status in (MessageStatus.SENDING, MessageStatus.FAILED):
                    msg.status = MessageStatus.PENDING
                    msg.failed_reason = ''
                    msg.save(update_fields=['status', 'failed_reason', 'updated_at'])
        return count
