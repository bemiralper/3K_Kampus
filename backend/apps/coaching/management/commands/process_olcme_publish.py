"""
Sınav yayın saatinde karne / cevap anahtarı PDF kuyruğa alır.

Cron önerisi: her 1 dakika
  python manage.py process_olcme_publish
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.coaching.application.olcme_publish import process_due


class Command(BaseCommand):
    help = 'Yayın saati gelmiş sınav karne / cevap anahtarı gönderimlerini işler'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--exam-id', type=int)
        parser.add_argument('--date', help='YYYY-MM-DDTHH:MM — varsayılan şimdi')

    def handle(self, *args, **options):
        now = timezone.now()
        raw = options.get('date')
        if raw:
            parsed = parse_datetime(raw) or parse_datetime(f'{raw}T00:00:00')
            if parsed is None:
                self.stderr.write('Geçersiz --date')
                return
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
            now = parsed
        result = process_due(
            now=now,
            exam_id=options.get('exam_id'),
            dry_run=options.get('dry_run') or False,
        )
        self.stdout.write(
            f"İşlenen {result['processed']} · gönderilen {result['sent']} · "
            f"bekleyen/eksik {result['overdue']}"
            + (' (dry-run)' if result['dry_run'] else '')
        )
        for err in result.get('errors') or []:
            self.stdout.write(self.style.WARNING(f'  {err}'))
