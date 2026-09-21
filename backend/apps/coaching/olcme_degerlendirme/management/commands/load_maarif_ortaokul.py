"""5–8. sınıf Maarif öğrenme çıktılarını yükler.

İlkokul ve lise kazanımları durur. Ortaokul (5–8) konuları bu katalogla değişir.

    python manage.py load_maarif_ortaokul
    python manage.py load_maarif_ortaokul --dry-run
"""
from django.core.management.base import BaseCommand

from apps.coaching.olcme_degerlendirme.services.maarif_ortaokul import (
    load_catalog,
    replace_ortaokul_catalog,
)


class Command(BaseCommand):
    help = 'Ortaokul (5–8) kazanımlarını Maarif kataloğuyla değiştirir.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Silmeden ve yazmadan say.')

    def handle(self, *args, **options):
        payload = load_catalog()
        stats = replace_ortaokul_catalog(payload, dry_run=options['dry_run'])
        action = 'Bakılacak' if stats['dry_run'] else 'Silindi'
        self.stdout.write(
            f"{action}: {stats['deleted_topics']} konu, {stats['deleted_outcomes']} kazanım. "
            f"Kalan (ilkokul/lise): {stats['kept_topics']} konu. "
            f"Yazılacak: {stats['topics']} konu, {stats['outcomes']} kazanım, "
            f"{stats['sub_outcomes']} alt kazanım. "
            f"Cevap anahtarı bağı çözülecek: {stats['cleared_answer_links']}."
        )
        if stats['dry_run']:
            self.stdout.write(self.style.WARNING('Dry-run: veritabanı değişmedi.'))
        else:
            self.stdout.write(self.style.SUCCESS('Ortaokul Maarif kataloğu yüklendi.'))
