"""
SLA kontrolü — cevapsız sohbetleri Destek Gerekiyor durumuna alır.

Cron önerisi (her 1 dk):
  cd backend && DJANGO_ENV=production python manage.py check_conversation_sla
"""
from django.core.management.base import BaseCommand

from apps.communication.application.sla_service import check_and_mark_needs_support


class Command(BaseCommand):
    help = 'Cevapsız sohbetlerde 30 dk SLA ihlalini işaretler (NEEDS_SUPPORT).'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=200)

    def handle(self, *args, **options):
        n = check_and_mark_needs_support(limit=options['limit'])
        self.stdout.write(self.style.SUCCESS(f'SLA: {n} sohbet Destek Gerekiyor olarak işaretlendi.'))
