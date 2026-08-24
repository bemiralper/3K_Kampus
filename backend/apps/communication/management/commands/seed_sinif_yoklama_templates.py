"""
Sınıf yoklama Meta + uygulama şablon taslaklarını oluşturur.

Örnekler:
  python manage.py seed_sinif_yoklama_templates --list

  python manage.py seed_sinif_yoklama_templates --kurum-id=1 --sube-id=1 \\
      --channel-config-id=<uuid>
"""
from django.core.management.base import BaseCommand, CommandError

from apps.communication.application.sinif_yoklama_template_seed import (
    SinifYoklamaTemplateSeedService,
)


class Command(BaseCommand):
    help = 'Sınıf yoklama bildirimi için uygulama/Meta şablon taslaklarını oluşturur.'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None)
        parser.add_argument('--sube-id', type=int, default=None)
        parser.add_argument(
            '--channel-config-id',
            type=str,
            default=None,
            help='WhatsApp hesap UUID — verilirse Meta DRAFT da oluşturulur.',
        )
        parser.add_argument('--list', action='store_true')
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--force', action='store_true')
        parser.add_argument('--no-bind', action='store_true')

    def handle(self, *args, **options):
        if options.get('list'):
            rows = SinifYoklamaTemplateSeedService.describe()
            for row in rows:
                self.stdout.write('')
                self.stdout.write(self.style.MIGRATE_HEADING(
                    f"{row['event_key']} → {row['meta_name']} ({row['recipient_type']})",
                ))
                self.stdout.write(f"  Uygulama: {row['app_name']}")
                self.stdout.write(f"  Başlık: {row['header_text']}")
                self.stdout.write(f"  Gövde: {row['body_named']}")
            self.stdout.write('')
            self.stdout.write(self.style.SUCCESS(f'Toplam {len(rows)} sınıf yoklama taslağı.'))
            return

        kurum_id = options.get('kurum_id')
        if not kurum_id:
            raise CommandError('--kurum-id zorunludur (--list hariç).')

        result = SinifYoklamaTemplateSeedService.seed(
            kurum_id,
            sube_id=options.get('sube_id'),
            channel_config_id=options.get('channel_config_id'),
            dry_run=bool(options.get('dry_run')),
            skip_existing=not bool(options.get('force')),
            bind=not bool(options.get('no_bind')),
        )
        self.stdout.write(
            f"LMS +{len(result['created_app'])} atlandı={len(result['skipped_app'])} "
            f"meta +{len(result['created_meta'])} atlandı={len(result['skipped_meta'])} "
            f"bağlandı={len(result.get('bound') or [])}",
        )
        for name in result['created_app']:
            self.stdout.write(f'  + lms {name}')
        for name in result['created_meta']:
            self.stdout.write(f'  + meta {name}')
        for err in result['errors']:
            self.stderr.write(self.style.ERROR(f'  ! {err}'))
        if result['errors']:
            raise CommandError(f"{len(result['errors'])} şablon oluşturulamadı.")
        self.stdout.write(self.style.SUCCESS('Sınıf yoklama şablon taslakları hazır.'))
