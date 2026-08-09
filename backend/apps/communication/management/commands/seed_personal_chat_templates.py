"""
Personel sohbet açılış PERSONAL Meta taslaklarını oluşturur.

Örnekler:
  python manage.py seed_personal_chat_templates --list

  python manage.py seed_personal_chat_templates --kurum-id=1 \\
      --channel-config-id=<uuid>
"""
from django.core.management.base import BaseCommand, CommandError

from apps.communication.application.personal_chat_template_seed import (
    PersonalChatTemplateSeedService,
)
from apps.communication.infrastructure.repository import ChannelConfigRepository


class Command(BaseCommand):
    help = 'Sohbet başlatma PERSONAL Meta şablon taslaklarını oluşturur.'

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None)
        parser.add_argument('--channel-config-id', type=str, default=None)
        parser.add_argument(
            '--list',
            action='store_true',
            help='Departman verilmezse tüm aileleri; --department ile filtrele.',
        )
        parser.add_argument(
            '--department',
            type=str,
            default=None,
            help='ACCOUNTING | COACHING | MANAGEMENT (yalnızca --list).',
        )
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--force', action='store_true')

    def handle(self, *args, **options):
        if options.get('list'):
            rows = PersonalChatTemplateSeedService.describe(
                department=options.get('department'),
            )
            for row in rows:
                self.stdout.write('')
                self.stdout.write(self.style.MIGRATE_HEADING(
                    f"{row['meta_name']} ({row['family']} / {row['audience']})",
                ))
                self.stdout.write(f"  Butonlar: {', '.join(row['buttons'])}")
                self.stdout.write(f"  Gövde: {row['body_named']}")
            self.stdout.write('')
            self.stdout.write(self.style.SUCCESS(f'Toplam {len(rows)} sohbet taslağı.'))
            return

        kurum_id = options.get('kurum_id')
        channel_id = options.get('channel_config_id')
        if not kurum_id or not channel_id:
            raise CommandError('--kurum-id ve --channel-config-id zorunludur (--list hariç).')

        account = ChannelConfigRepository.get_by_id(kurum_id, channel_id)
        if not account:
            raise CommandError('WhatsApp hesabı bulunamadı.')

        result = PersonalChatTemplateSeedService.seed(
            kurum_id,
            channel_config_id=channel_id,
            dry_run=bool(options.get('dry_run')),
            skip_existing=not bool(options.get('force')),
        )

        self.stdout.write(
            f"kurum={result['kurum_id']} hesap={result['channel_config_id']} "
            f"dept={result['department'] or '—'} dry_run={result['dry_run']}",
        )
        self.stdout.write(
            f"meta: +{len(result['created_meta'])} "
            f"güncellendi={len(result['updated_meta'])} "
            f"atlandı={len(result['skipped_meta'])}",
        )
        for name in result['created_meta']:
            self.stdout.write(f'  + {name}')
        for name in result['updated_meta']:
            self.stdout.write(f'  ~ {name}')
        for err in result['errors']:
            self.stderr.write(self.style.ERROR(f'  ! {err}'))
        for step in result.get('next_steps') or []:
            self.stdout.write(self.style.WARNING(f'  → {step}'))

        if result['errors']:
            raise CommandError(f"{len(result['errors'])} şablon oluşturulamadı.")
        self.stdout.write(self.style.SUCCESS('Sohbet şablon taslakları hazır.'))
