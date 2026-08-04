"""
Doğum günü WhatsApp kutlamalarını kuyruğa alır.

Cron (Europe/Istanbul 00:01):
  1 0 * * * cd /path/to/backend && DJANGO_ENV=production \\
      python manage.py send_birthday_wishes >> /var/log/birthday_wishes.log 2>&1
"""
from django.core.management.base import BaseCommand
from django.utils.dateparse import parse_date

from apps.communication.application.birthday_wish_service import send_birthday_wishes_all


class Command(BaseCommand):
    help = 'Doğum günü olan öğrencilere WhatsApp kutlama mesajı gönderir.'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None)
        parser.add_argument('--sube-id', type=int, default=None)
        parser.add_argument('--date', type=str, default=None, help='YYYY-MM-DD (test için)')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        on_date = parse_date(options['date']) if options.get('date') else None
        results = send_birthday_wishes_all(
            kurum_id=options.get('kurum_id'),
            sube_id=options.get('sube_id'),
            on_date=on_date,
            dry_run=bool(options.get('dry_run')),
        )
        for row in results:
            self.stdout.write(
                f"kurum={row['kurum_id']} {row['kurum_ad']}: "
                f"scanned={row['scanned']} sent={row['sent']} "
                f"skipped={row['skipped']} failed={row['failed']}",
            )
        total_sent = sum(r['sent'] for r in results)
        self.stdout.write(self.style.SUCCESS(f'Toplam gönderim: {total_sent}'))
