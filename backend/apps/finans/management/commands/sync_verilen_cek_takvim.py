"""Verilen çek/senet vade tarihlerini merkezi takvime senkronize eder."""
from django.core.management.base import BaseCommand

from apps.finans.application.cek_senet.calendar_bridge import CekSenetCalendarBridge
from apps.kurum.domain.models import Kurum
from apps.takvim.application.service import EventTypeService


class Command(BaseCommand):
    help = 'Aktif verilen çek/senet kayıtlarını takvim Event tablosuna senkronize eder'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None, help='Yalnızca belirli kurum')
        parser.add_argument('--sube-id', type=int, default=None, help='Yalnızca belirli şube')

    def handle(self, *args, **options):
        bridge = CekSenetCalendarBridge()
        kurum_id = options['kurum_id']
        sube_id = options['sube_id']

        kurumlar = Kurum.objects.all()
        if kurum_id:
            kurumlar = kurumlar.filter(id=kurum_id)

        total = 0
        for kurum in kurumlar:
            EventTypeService.seed_defaults(kurum.id)
            count = bridge.sync_verilen_for_kurum(kurum.id, sube_id=sube_id)
            total += count
            self.stdout.write(f'  Kurum {kurum.kod}: {count} kayıt')

        self.stdout.write(self.style.SUCCESS(f'✓ {total} verilen çek/senet takvime senkronize edildi'))
