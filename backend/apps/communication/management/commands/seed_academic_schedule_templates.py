"""
Akademik sınıf ders programı Meta + uygulama şablon taslaklarını oluşturur.

Örnekler:
  python manage.py seed_academic_schedule_templates --list

  python manage.py seed_academic_schedule_templates --kurum-id=1 --sube-id=1

  python manage.py seed_academic_schedule_templates --kurum-id=1 --sube-id=1 \\
      --channel-config-id=<uuid>
"""
from django.core.management.base import BaseCommand, CommandError

from apps.communication.application.academic_schedule_template_seed import (
    AcademicScheduleTemplateSeedService,
)


class Command(BaseCommand):
    help = 'Sınıf ders programı bildirimi için uygulama/Meta şablon taslaklarını oluşturur.'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None)
        parser.add_argument('--sube-id', type=int, default=None)
        parser.add_argument(
            '--channel-config-id',
            type=str,
            default=None,
            help='WhatsApp hesap UUID — verilirse Meta DRAFT da oluşturulur.',
        )
        parser.add_argument(
            '--list',
            action='store_true',
            help='Taslakları yazdırmadan yalnızca listele.',
        )
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument(
            '--force',
            action='store_true',
            help='Aynı adlı mevcut şablonları atlama.',
        )
        parser.add_argument(
            '--no-bind',
            action='store_true',
            help='Bildirim Şablonları eşlemesi oluşturma.',
        )

    def handle(self, *args, **options):
        if options.get('list'):
            rows = AcademicScheduleTemplateSeedService.describe()
            for row in rows:
                self.stdout.write('')
                self.stdout.write(self.style.MIGRATE_HEADING(
                    f"{row['event_key']} → {row['meta_name']} ({row['recipient_type']})",
                ))
                self.stdout.write(f"  Uygulama: {row['app_name']}")
                self.stdout.write(f"  Kategori: {row['category']} | kitle: {row['audience_scope']}")
                if row['has_document']:
                    self.stdout.write('  Header: DOCUMENT')
                self.stdout.write(f"  Gövde: {row['body_named']}")
            self.stdout.write('')
            self.stdout.write(self.style.SUCCESS(f'Toplam {len(rows)} akademik program taslağı.'))
            return

        kurum_id = options.get('kurum_id')
        if not kurum_id:
            raise CommandError('--kurum-id zorunludur (--list hariç).')

        result = AcademicScheduleTemplateSeedService.seed(
            kurum_id,
            sube_id=options.get('sube_id'),
            channel_config_id=options.get('channel_config_id'),
            dry_run=bool(options.get('dry_run')),
            skip_existing=not bool(options.get('force')),
            bind=not bool(options.get('no_bind')),
        )

        self.stdout.write(
            f"kurum={result['kurum_id']} sube={result['sube_id']} "
            f"hesap={result['channel_config_id'] or '—'} "
            f"dry_run={result['dry_run']}",
        )
        self.stdout.write(
            f"uygulama: +{len(result['created_app'])} "
            f"güncellendi={len(result.get('updated_app') or [])} "
            f"atlandı={len(result['skipped_app'])}",
        )
        if result['channel_config_id']:
            self.stdout.write(
                f"meta DRAFT: +{len(result['created_meta'])} "
                f"güncellendi={len(result.get('updated_meta') or [])} "
                f"atlandı={len(result['skipped_meta'])}",
            )
        if result.get('bound'):
            self.stdout.write(f"bağlandı: {len(result['bound'])}")
        for name in result['created_app']:
            self.stdout.write(f'  + app  {name}')
        for name in result.get('updated_app') or []:
            self.stdout.write(f'  ~ app  {name}')
        for name in result['created_meta']:
            self.stdout.write(f'  + meta {name}')
        for name in result.get('updated_meta') or []:
            self.stdout.write(f'  ~ meta {name}')
        for err in result['errors']:
            self.stderr.write(self.style.ERROR(f'  ! {err}'))
        for step in result.get('next_steps') or []:
            self.stdout.write(self.style.WARNING(f'  → {step}'))

        if result['errors']:
            raise CommandError(f"{len(result['errors'])} şablon oluşturulamadı.")
        self.stdout.write(self.style.SUCCESS('Akademik program şablon taslakları hazır.'))
