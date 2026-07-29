from django.core.management.base import BaseCommand

from apps.ozel_ders.services.ucret_engine import seed_default_rules


class Command(BaseCommand):
    help = 'Özel ders ücret kurallarını seed eder (global varsayılanlar)'

    def handle(self, *args, **options):
        created = seed_default_rules()
        self.stdout.write(self.style.SUCCESS(f'{created} ücret kuralı oluşturuldu.'))
