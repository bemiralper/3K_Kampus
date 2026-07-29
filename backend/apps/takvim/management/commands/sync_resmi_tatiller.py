"""
Türkiye resmi tatillerini kurum takvimine senkronize et.

Kullanım:
    python manage.py sync_resmi_tatiller --kurum-id=1
    python manage.py sync_resmi_tatiller --kurum-id=1 --year=2026
    python manage.py sync_resmi_tatiller --all
"""
from django.core.management.base import BaseCommand

from apps.takvim.application.resmi_tatil_service import ResmiTatilSyncService


class Command(BaseCommand):
    help = 'Türkiye resmi tatillerini takvime senkronize et'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, help='Tek kurum ID')
        parser.add_argument('--all', action='store_true', help='Tüm kurumlar')
        parser.add_argument('--year', type=int, help='Tek yıl (varsayılan: katalogdaki tüm yıllar)')
        parser.add_argument('--user-id', type=int, default=1)

    def handle(self, *args, **options):
        from apps.kurum.domain.models import Kurum

        svc = ResmiTatilSyncService()
        year = options.get('year')
        user_id = options['user_id']

        if options['all']:
            kurum_ids = list(Kurum.objects.values_list('id', flat=True))
        elif options.get('kurum_id'):
            kurum_ids = [options['kurum_id']]
        else:
            self.stderr.write(' --kurum-id veya --all gerekli')
            return

        for kid in kurum_ids:
            result = svc.sync_kurum(kid, year=year, user_id=user_id)
            self.stdout.write(
                self.style.SUCCESS(
                    f'Kurum {kid}: +{result["created"]} yeni, '
                    f'{result["updated"]} güncellendi, {result["restored"]} geri yüklendi '
                    f'(yıllar={result["years"]})'
                )
            )
