"""Management command — tekrarlayan görev şablonlarını işle."""
from django.core.management.base import BaseCommand

from apps.gorev.application.recurring_service import GorevRecurringService


class Command(BaseCommand):
    help = 'Vadesi gelen tekrarlayan görev şablonlarından Gorev üretir'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None)

    def handle(self, *args, **options):
        count = GorevRecurringService().process_due_sablonlar(kurum_id=options['kurum_id'])
        self.stdout.write(self.style.SUCCESS(f'✓ {count} tekrarlayan görev oluşturuldu'))
