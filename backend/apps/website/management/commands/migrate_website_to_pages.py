from django.core.management.base import BaseCommand

from apps.kurum.domain.models import Kurum
from apps.website.application.migrate_service import migrate_kurum_to_pages
from apps.website.seed_defaults import LANDING_KURUM_KOD


class Command(BaseCommand):
    help = 'Section CMS verisini Page Builder (WebPage) yapısına migrate eder'

    def add_arguments(self, parser):
        parser.add_argument('--kurum', type=str, default=LANDING_KURUM_KOD, help='Kurum kodu')
        parser.add_argument('--all', action='store_true', help='Tüm kurumlar')
        parser.add_argument('--force', action='store_true', help='Mevcut homepage üzerine yaz')

    def handle(self, *args, **options):
        if options['all']:
            kurumlar = Kurum.objects.filter(aktif_mi=True)
        else:
            kurumlar = Kurum.objects.filter(kod__iexact=options['kurum'])
            if not kurumlar.exists():
                self.stderr.write(self.style.ERROR(f"Kurum bulunamadı: {options['kurum']}"))
                return

        for kurum in kurumlar:
            result = migrate_kurum_to_pages(kurum.id, force=options['force'])
            self.stdout.write(self.style.SUCCESS(f'{kurum.kod}: {result}'))
