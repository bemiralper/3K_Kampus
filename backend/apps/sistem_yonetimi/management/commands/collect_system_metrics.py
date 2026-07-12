from django.core.management.base import BaseCommand

from apps.sistem_yonetimi.services.dashboard import collect_and_store_metrics


class Command(BaseCommand):
    help = 'CPU/RAM/disk/PG metrik örneği kaydeder (dakikalık cron önerilir).'

    def handle(self, *args, **options):
        sample = collect_and_store_metrics()
        self.stdout.write(self.style.SUCCESS(
            f'Metrik kaydedildi id={sample.id} cpu={sample.cpu_percent}% ram={sample.ram_percent}% disk={sample.disk_percent}%'
        ))
