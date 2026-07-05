"""3K Kampüs kurumsal site örnek verisi."""
from django.core.management.base import BaseCommand

from apps.website.seed_defaults import seed_website_defaults


class Command(BaseCommand):
    help = '3K Kampüs kurumsal web sitesi için örnek veri oluşturur'

    def handle(self, *args, **options):
        result = seed_website_defaults(overwrite_settings=True)
        self.stdout.write(self.style.SUCCESS(
            f"3K Kampüs site verisi hazır (kurum: {result['kurum_kod']})."
        ))
