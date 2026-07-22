"""Yasal metin içeriklerini varsayılan JSON ile senkronize eder."""
from django.core.management.base import BaseCommand

from apps.website.seed_defaults import resolve_landing_kurum
from apps.website.yasal_defaults import ensure_yasal_metinler


class Command(BaseCommand):
    help = 'KVKK, gizlilik, kullanım ve çerez metinlerini varsayılan içerikle senkronize eder'

    def add_arguments(self, parser):
        parser.add_argument(
            '--kurum-kod',
            default='3K',
            help='Hedef kurum kodu (varsayılan: 3K)',
        )
        parser.add_argument(
            '--force-all',
            action='store_true',
            help='Mevcut tüm metinleri varsayılanlarla değiştir',
        )

    def handle(self, *args, **options):
        kurum = resolve_landing_kurum(options['kurum_kod'])
        if not kurum:
            self.stderr.write(self.style.ERROR('Kurum bulunamadı'))
            return

        stats = ensure_yasal_metinler(
            kurum,
            upgrade_placeholders=not options['force_all'],
            force=options['force_all'],
        )
        self.stdout.write(self.style.SUCCESS(
            f"Yasal metinler senkronize edildi (kurum: {kurum.kod}) — "
            f"oluşturulan: {stats['created']}, güncellenen: {stats['upgraded']}"
        ))
