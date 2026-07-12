from django.core.management.base import BaseCommand

from apps.kurum.domain.models import Kurum
from apps.website.application.site_bootstrap_service import bootstrap_website_content
from apps.website.seed_defaults import resolve_landing_kurum


class Command(BaseCommand):
    help = 'Anasayfa yerleşimi, ek sayfalar, menü ve örnek içerikleri oluşturur/günceller'

    def add_arguments(self, parser):
        parser.add_argument('--kurum', type=str, default='', help='Kurum kodu (boşsa aktif ilk kurum)')
        parser.add_argument(
            '--no-force-home',
            action='store_true',
            help='Mevcut anasayfa bloklarını ezme',
        )

    def handle(self, *args, **options):
        kod = (options.get('kurum') or '').strip()
        if kod:
            kurumlar = list(Kurum.objects.filter(kod__iexact=kod, aktif_mi=True))
        else:
            k = resolve_landing_kurum()
            kurumlar = [k] if k else []

        if not kurumlar:
            self.stderr.write('Kurum bulunamadı')
            return

        force_home = not options.get('no_force_home')
        for kurum in kurumlar:
            result = bootstrap_website_content(kurum.id, force_home=force_home)
            self.stdout.write(f'{kurum.kod}: {result}')
