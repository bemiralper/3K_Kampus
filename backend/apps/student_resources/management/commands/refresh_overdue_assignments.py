from django.core.management.base import BaseCommand

from apps.student_resources.services.overdue_status import refresh_all_overdue


class Command(BaseCommand):
    help = 'Gecikmiş manuel ödev ve kaynak atamalarının durumunu OVERDUE olarak güncelle'

    def handle(self, *args, **options):
        manual_count, resource_count = refresh_all_overdue()
        self.stdout.write(
            self.style.SUCCESS(
                f'Güncellendi: {manual_count} manuel ödev, {resource_count} kaynak ataması'
            )
        )
