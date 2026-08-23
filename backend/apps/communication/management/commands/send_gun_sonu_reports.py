"""
Otomatik gün sonu WhatsApp gönderimi (seçilen rapor: özet / detay / ikisi).

Cron (her 5 dk, Europe/Istanbul):
  */5 * * * * cd /path/to/backend && DJANGO_ENV=production \\
      python manage.py send_gun_sonu_reports >> /var/log/lms/gun_sonu_reports.log 2>&1
"""
from django.core.management.base import BaseCommand
from django.utils.dateparse import parse_date

from apps.finans.application.gun_sonu_whatsapp_service import GunSonuWhatsappService


class Command(BaseCommand):
    help = 'Saati gelen gün sonu raporlarını (seçilen tür) yetkililere gönderir.'

    def add_arguments(self, parser):
        parser.add_argument('--date', type=str, default=None, help='YYYY-MM-DD (rapor günü)')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        on_date = parse_date(options['date']) if options.get('date') else None
        dry_run = bool(options.get('dry_run'))
        results = []
        if on_date:
            from apps.communication.application.notification_schedule_service import (
                GUN_SONU_EVENT,
                due_schedules,
            )
            from django.utils import timezone
            now = timezone.localtime()
            for row in due_schedules(event_key=GUN_SONU_EVENT, now=now):
                results.append(
                    GunSonuWhatsappService.send_for_schedule(
                        row, gun=on_date, dry_run=dry_run,
                    ),
                )
        else:
            results = GunSonuWhatsappService.run_due(dry_run=dry_run)

        if not results:
            self.stdout.write('Gönderilecek zamanlama yok.')
            return
        total = 0
        for row in results:
            sent = int(row.get('sent') or 0)
            total += sent
            self.stdout.write(
                f"kurum={row.get('kurum_id')} subeler={row.get('sube_ids')} sent={sent}",
            )
        self.stdout.write(self.style.SUCCESS(f'Toplam alıcı: {total}'))
