"""Management command — görev atamalarını takvim Event tablosuna senkronize eder."""
from django.core.management.base import BaseCommand

from apps.gorev.application.bridge import GorevCalendarBridge
from apps.gorev.domain.models import Gorev
from apps.takvim.application.service import EventTypeService


class Command(BaseCommand):
    help = 'GorevAtama kayıtlarını takvim Event tablosuna senkronize eder (backfill / onarım)'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None, help='Yalnızca belirli kurum')

    def handle(self, *args, **options):
        bridge = GorevCalendarBridge()
        kurum_id = options['kurum_id']

        qs = Gorev.objects.filter(is_deleted=False).prefetch_related('atamalar')
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)

        kurum_ids = set(qs.values_list('kurum_id', flat=True))
        for kid in kurum_ids:
            EventTypeService.seed_defaults(kid)

        synced = 0
        for gorev in qs:
            for atama in gorev.atamalar.all():
                event = bridge.sync_atama(atama, gorev.olusturan_id)
                if event:
                    synced += 1

        self.stdout.write(self.style.SUCCESS(f'✓ {synced} görev ataması takvime senkronize edildi'))
