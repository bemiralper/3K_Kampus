"""Sınıfın dolu takvimi dışındaki boş iskelet bağlarını düşürür.

Örnek:
  python manage.py dedupe_classroom_calendars --dry-run
  python manage.py dedupe_classroom_calendars --term-id 3
"""
from django.core.management.base import BaseCommand

from apps.academic.services.grid_engine import dedupe_classroom_calendars


class Command(BaseCommand):
    help = 'Dolu dersi olan sınıfı aynı dönemdeki boş takvimlerden ayırır.'

    def add_arguments(self, parser):
        parser.add_argument('--term-id', type=int, default=None)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        result = dedupe_classroom_calendars(
            term_id=options['term_id'],
            dry_run=options['dry_run'],
        )
        prefix = 'Önizleme' if result['dry_run'] else 'Uygulandı'
        self.stdout.write(
            f"{prefix}: {result['classrooms']} sınıf, "
            f"{result['released_cells']} boş hücre ayrıldı, "
            f"{result['kept_filled_calendars']} dolu takvim olduğu gibi kaldı."
        )
