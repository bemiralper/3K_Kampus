"""Aynı kişiye ait kopya sohbetleri birleştir."""
from django.core.management.base import BaseCommand

from apps.communication.application.conversation_merge import merge_duplicate_conversations
from apps.kurum.domain.models import Kurum


class Command(BaseCommand):
    help = 'Aynı telefon/kişi için birden fazla sohbet kaydını tek thread altında birleştirir.'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, help='Yalnızca bu kurum')
        parser.add_argument('--dry-run', action='store_true', help='Silmeden raporla')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        kurum_id = options.get('kurum_id')
        qs = Kurum.objects.all()
        if kurum_id:
            qs = qs.filter(id=kurum_id)
        for kurum in qs:
            result = merge_duplicate_conversations(kurum.id, dry_run=dry_run)
            self.stdout.write(
                f'{kurum.kod}: grup={result["groups"]} birleşen={result["merged"]} '
                f'silinen={result["removed"]}'
                + (' (dry-run)' if dry_run else '')
            )
