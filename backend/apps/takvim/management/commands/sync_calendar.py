"""
Mevcut verileri takvime toplu senkronize et (backfill).

Kullanım:
    python manage.py sync_calendar --kurum-id=1
    python manage.py sync_calendar --kurum-id=1 --module=olcme
    python manage.py sync_calendar --kurum-id=1 --dry-run
"""
from django.core.management.base import BaseCommand

from apps.takvim.application.integration_service import CalendarIntegrationService


class Command(BaseCommand):
    help = 'Mevcut modül verilerini takvime toplu senkronize et'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, required=True, help='Kurum ID')
        parser.add_argument('--user-id', type=int, default=1, help='İşlemi yapan kullanıcı ID')
        parser.add_argument(
            '--module', type=str, default='all',
            choices=['all', 'olcme', 'gorusme', 'odev', 'calisma'],
            help='Hangi modülü senkronize et',
        )
        parser.add_argument('--dry-run', action='store_true', help='Sadece sayıları göster')

    def handle(self, *args, **options):
        kurum_id = options['kurum_id']
        user_id = options['user_id']
        module = options['module']
        dry_run = options['dry_run']

        if dry_run:
            self._dry_run(kurum_id, module)
            return

        svc = CalendarIntegrationService()
        total = 0

        if module in ('all', 'olcme'):
            self.stdout.write('📝 Sınavlar senkronize ediliyor...')
            count = svc.bulk_sync_exams(kurum_id, user_id)
            self.stdout.write(self.style.SUCCESS(f'  ✅ {count} sınav senkronize edildi'))
            total += count

        if module in ('all', 'gorusme'):
            self.stdout.write('🗣️ Görüşmeler senkronize ediliyor...')
            count = svc.bulk_sync_gorusmeler(kurum_id, user_id)
            self.stdout.write(self.style.SUCCESS(f'  ✅ {count} görüşme senkronize edildi'))
            total += count

        if module in ('all', 'odev'):
            self.stdout.write('📋 Ödevler senkronize ediliyor...')
            count = svc.bulk_sync_assignments(kurum_id, user_id)
            self.stdout.write(self.style.SUCCESS(f'  ✅ {count} ödev senkronize edildi'))
            total += count

        if module in ('all', 'calisma'):
            self.stdout.write('📊 Çalışma programları senkronize ediliyor...')
            from apps.coaching.study_program.models import WeeklyProgram
            programs = WeeklyProgram.objects.filter(
                is_template=False,
            )
            count = 0
            for p in programs:
                try:
                    if svc.sync_weekly_program(kurum_id, p, user_id):
                        count += 1
                except Exception as e:
                    self.stderr.write(f'  ⚠️ Program {p.id} hatası: {e}')
            self.stdout.write(self.style.SUCCESS(f'  ✅ {count} çalışma programı senkronize edildi'))
            total += count

        self.stdout.write(self.style.SUCCESS(f'\n🎯 Toplam {total} kayıt takvime senkronize edildi'))

    def _dry_run(self, kurum_id, module):
        """Sadece kayıt sayılarını göster"""
        self.stdout.write('🔍 Dry-run modu — senkronize edilecek kayıtlar:\n')

        if module in ('all', 'olcme'):
            from apps.coaching.olcme_degerlendirme.models.exam import Exam
            count = Exam.objects.filter(
                kurum_id=kurum_id, is_active=True, exam_date__isnull=False
            ).count()
            self.stdout.write(f'  📝 Sınavlar: {count}')

        if module in ('all', 'gorusme'):
            from apps.coaching.models import GorusmeKaydi
            count = GorusmeKaydi.objects.filter(kurum_id=kurum_id).count()
            self.stdout.write(f'  🗣️ Görüşmeler: {count}')

        if module in ('all', 'odev'):
            from apps.coaching.assignment_manual.models import ManualAssignment
            count = ManualAssignment.objects.filter(
                is_active=True, due_date__isnull=False
            ).count()
            self.stdout.write(f'  📋 Ödevler: {count}')

        if module in ('all', 'calisma'):
            from apps.coaching.study_program.models import WeeklyProgram
            count = WeeklyProgram.objects.filter(is_template=False).count()
            self.stdout.write(f'  📊 Çalışma Programları: {count}')
