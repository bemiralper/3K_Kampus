"""PostgreSQL'in READ ONLY transaction korumasıyla finans verisini denetler."""
import json

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from apps.finans.application.data_audit import build_finans_audit


class Command(BaseCommand):
    help = "Finans ilişkilerini/bakiyelerini salt okunur denetle; JSON raporu stdout'a yaz."

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int)
        parser.add_argument('--sube-id', type=int)
        parser.add_argument('--sample-limit', type=int, default=100)

    def handle(self, *args, **options):
        if connection.vendor != 'postgresql':
            raise CommandError('Veritabanı düzeyinde salt okunur koruma için PostgreSQL gerekir.')
        if connection.in_atomic_block:
            raise CommandError('Komut mevcut bir transaction içinde çalıştırılamaz.')
        if options['sample_limit'] < 0:
            raise CommandError('--sample-limit negatif olamaz.')
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
                cursor.execute('SHOW transaction_read_only')
                if cursor.fetchone()[0] != 'on':
                    raise CommandError('Salt okunur işlem doğrulanamadı.')
            report = build_finans_audit(
                kurum_id=options['kurum_id'], sube_id=options['sube_id'],
                sample_limit=options['sample_limit'],
            )
            report['database'] = {k: connection.settings_dict[k] for k in ('NAME', 'HOST', 'PORT')}
            report['generated_at'] = timezone.localtime().isoformat()
        self.stdout.write(json.dumps(report, ensure_ascii=False, indent=2))
