"""
Finans / muhasebe Meta + uygulama şablon taslaklarını oluşturur.

Örnekler:
  # Yalnızca listele (DB yazmaz)
  python manage.py seed_finance_templates --list

  # Uygulama şablonları (muhasebe kitlesi) — Meta hesabı gerekmez
  python manage.py seed_finance_templates --kurum-id=1 --sube-id=1

  # Meta DRAFT + uygulama (muhasebe WhatsApp hesabı bağlandıktan sonra)
  python manage.py seed_finance_templates --kurum-id=1 --sube-id=1 \\
      --channel-config-id=<uuid>
"""
from django.core.management.base import BaseCommand, CommandError

from apps.communication.application.finance_template_seed import FinanceTemplateSeedService


class Command(BaseCommand):
    help = 'Finans bildirimleri için muhasebe uygulama/Meta şablon taslaklarını oluşturur.'

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
            help='Aynı adlı mevcut şablonları atlama (yine de duplicate Meta adı hata verir).',
        )

    def handle(self, *args, **options):
        if options.get('list'):
            for row in FinanceTemplateSeedService.describe():
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
            self.stdout.write(self.style.SUCCESS(
                f"Toplam {len(FinanceTemplateSeedService.describe())} finans taslağı.",
            ))
            return

        kurum_id = options.get('kurum_id')
        if not kurum_id:
            raise CommandError('--kurum-id zorunludur (--list hariç).')

        result = FinanceTemplateSeedService.seed(
            kurum_id,
            sube_id=options.get('sube_id'),
            channel_config_id=options.get('channel_config_id'),
            dry_run=bool(options.get('dry_run')),
            skip_existing=not bool(options.get('force')),
        )

        self.stdout.write(
            f"kurum={result['kurum_id']} sube={result['sube_id']} "
            f"hesap={result['channel_config_id'] or '—'} "
            f"dry_run={result['dry_run']}",
        )
        self.stdout.write(
            f"uygulama: +{len(result['created_app'])} "
            f"atlandı={len(result['skipped_app'])}",
        )
        if result['channel_config_id']:
            self.stdout.write(
                f"meta DRAFT: +{len(result['created_meta'])} "
                f"atlandı={len(result['skipped_meta'])}",
            )
        for name in result.get('removed_legacy') or []:
            self.stdout.write(f'  - legacy {name}')
        for name in result['created_app']:
            self.stdout.write(f'  + app  {name}')
        for name in result['created_meta']:
            self.stdout.write(f'  + meta {name}')
        for err in result['errors']:
            self.stderr.write(self.style.ERROR(f'  ! {err}'))

        if result['errors']:
            raise CommandError(f"{len(result['errors'])} şablon oluşturulamadı.")
        self.stdout.write(self.style.SUCCESS('Finans şablon taslakları hazır.'))
