"""Management command — otomatik görev kurallarını çalıştır."""
from django.core.management.base import BaseCommand

from apps.gorev.application.rule_engine import GorevRuleEngine
from apps.gorev.application.recurring_service import GorevRecurringService


class Command(BaseCommand):
    help = 'Otomatik görev kurallarını tarar (ödeme, senet, inaktif öğrenci) + tekrarlayan şablonlar'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None)
        parser.add_argument('--skip-recurring', action='store_true')

    def handle(self, *args, **options):
        kurum_id = options['kurum_id']
        engine = GorevRuleEngine()

        self.stdout.write('🔄 Otomatik görev kuralları çalıştırılıyor…')
        stats = engine.scan_all(kurum_id=kurum_id)
        for key, count in stats.items():
            self.stdout.write(f'  {key}: {count} görev oluşturuldu')

        if not options['skip_recurring']:
            recurring = GorevRecurringService().process_due_sablonlar(kurum_id=kurum_id)
            self.stdout.write(f'  tekrar_sablon: {recurring} görev oluşturuldu')

        self.stdout.write(self.style.SUCCESS('✓ Tamamlandı'))
