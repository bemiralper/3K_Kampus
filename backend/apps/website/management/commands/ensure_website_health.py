from django.core.management.base import BaseCommand

from apps.kurum.domain.models import Kurum
from apps.website.application.health_service import ensure_website_health
from apps.website.seed_defaults import LANDING_KURUM_KOD, resolve_landing_kurum


class Command(BaseCommand):
    help = 'Web sitesi sağlık alanlarını (GA4, robots, favicon, meta) doldurur'

    def add_arguments(self, parser):
        parser.add_argument('--kurum', type=str, default='', help='Kurum kodu')
        parser.add_argument('--all', action='store_true')
        parser.add_argument('--ga4', type=str, default='', help='GA4 ölçüm kimliği (G-…)')

    def handle(self, *args, **options):
        if options['all']:
            kurumlar = Kurum.objects.filter(aktif_mi=True)
        elif options['kurum']:
            kurumlar = Kurum.objects.filter(kod__iexact=options['kurum'])
        else:
            k = resolve_landing_kurum(LANDING_KURUM_KOD) or resolve_landing_kurum()
            kurumlar = [k] if k else []

        if not kurumlar:
            self.stderr.write(self.style.ERROR('Kurum bulunamadı'))
            return

        for kurum in kurumlar:
            result = ensure_website_health(kurum.id, ga4_id=options['ga4'] or None)
            self.stdout.write(self.style.SUCCESS(f'{kurum.kod}: {result}'))
