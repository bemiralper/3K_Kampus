from django.core.management.base import BaseCommand

from apps.yedekleme.registry import sync_registered_resources


class Command(BaseCommand):
    help = 'Koddan kayıtlı backup resource spec\'lerini DB registry ile senkronize eder.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--deactivate-missing',
            action='store_true',
            help='Kodda olmayan aktif kaynakları pasifleştir',
        )

    def handle(self, *args, **options):
        # Ensure app ready hooks ran (system + modules)
        from django.apps import apps
        apps.check_apps_ready()
        result = sync_registered_resources(deactivate_missing=options['deactivate_missing'])
        self.stdout.write(self.style.SUCCESS(str(result)))
