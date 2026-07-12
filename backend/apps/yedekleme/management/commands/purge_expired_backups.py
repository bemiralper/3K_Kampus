from django.core.management.base import BaseCommand

from apps.yedekleme.engine import RetentionService


class Command(BaseCommand):
    help = 'Retention politikasına göre eski yedekleri siler.'

    def handle(self, *args, **options):
        result = RetentionService().purge()
        self.stdout.write(self.style.SUCCESS(f"Silinen: {result.get('deleted', 0)}"))
