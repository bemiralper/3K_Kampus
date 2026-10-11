"""Bağlı Google Kişiler hesaplarını öğrenci ve veli telefonlarıyla eşitler."""
from django.core.management.base import BaseCommand, CommandError

from apps.communication.application.google_contacts.sync import sync_batch
from apps.communication.domain.models import GoogleContactsAccount


class Command(BaseCommand):
    help = 'Öğrenci ve veli telefonlarını bağlı Google Kişiler hesaplarına yazar.'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None)
        parser.add_argument('--limit', type=int, default=50)
        parser.add_argument(
            '--enqueue',
            action='store_true',
            help='İşlemeden önce tüm öğrencileri kuyruğa alır.',
        )

    def handle(self, *args, **options):
        kurum_id = options['kurum_id']
        accounts = GoogleContactsAccount.objects.filter(is_active=True).exclude(refresh_token_encrypted='')
        if kurum_id:
            accounts = accounts.filter(kurum_id=kurum_id)
        kurum_ids = list(accounts.values_list('kurum_id', flat=True).distinct())
        if not kurum_ids:
            raise CommandError('Aktif Google Kişiler hesabı yok.')
        for kid in kurum_ids:
            result = sync_batch(
                kurum_id=kid,
                limit=options['limit'],
                enqueue=options['enqueue'],
            )
            self.stdout.write(
                f"kurum={kid} işlenen={result['processed']} yeni={result['created']} "
                f"güncellenen={result['updated']} silinen={result['deleted']} "
                f"kalan={result['remaining']} hata={result['failed']}"
            )
            if result.get('error'):
                self.stdout.write(self.style.WARNING(result['error']))
