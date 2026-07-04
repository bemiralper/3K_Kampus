"""
Sistem rollerini ve yetkilerini oluşturan management command
"""
from django.core.management.base import BaseCommand

from apps.roller.seed import ensure_default_roles


class Command(BaseCommand):
    help = 'Sistem rollerini ve yetkilerini oluşturur'

    def handle(self, *args, **options):
        self.stdout.write('Yetkiler ve sistem rolleri oluşturuluyor...')
        ensure_default_roles(verbose=True, stdout=self.stdout)
        self.stdout.write(self.style.SUCCESS('Roller ve yetkiler başarıyla oluşturuldu!'))
