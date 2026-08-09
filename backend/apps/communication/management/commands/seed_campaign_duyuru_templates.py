"""
Kampanya Meta şablon taslaklarını oluşturur (duyuru / hatırlatma / bilgilendirme).

Örnekler:
  python manage.py seed_campaign_duyuru_templates --list

  python manage.py seed_campaign_duyuru_templates \\
      --kurum-id=1 --channel-config-id=<uuid>
"""
from django.core.management.base import BaseCommand, CommandError

from apps.communication.application.campaign_duyuru_template_seed import (
    CampaignDuyuruTemplateSeedService,
)


class Command(BaseCommand):
    help = (
        'Kampanya (CAMPAIGN) Meta şablon taslaklarını oluşturur: '
        'duyuru, hatirlatma, bilgilendirme × veli/öğrenci/personel × metin/görsel/pdf.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None)
        parser.add_argument(
            '--channel-config-id',
            type=str,
            default=None,
            help='WhatsApp hesap UUID (zorunlu, --list hariç).',
        )
        parser.add_argument('--list', action='store_true')
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument(
            '--force',
            action='store_true',
            help='Aynı adlı mevcut şablonları atlama.',
        )

    def handle(self, *args, **options):
        if options.get('list'):
            for row in CampaignDuyuruTemplateSeedService.describe():
                self.stdout.write('')
                self.stdout.write(self.style.MIGRATE_HEADING(
                    f"{row['meta_name']} — {row['label']} "
                    f"[{row['header_type']}] ({row['audience']})",
                ))
                self.stdout.write(f"  Kategori: {row['meta_category']} | kullanım: {row['usage_scope']}")
                self.stdout.write(f"  Gövde: {row['body_named']}")
            self.stdout.write('')
            self.stdout.write(self.style.SUCCESS(
                f"Toplam {len(CampaignDuyuruTemplateSeedService.describe())} kampanya taslağı "
                f"(duyuru + hatırlatma + bilgilendirme × veli/öğrenci/personel).",
            ))
            return

        kurum_id = options.get('kurum_id')
        channel_config_id = options.get('channel_config_id')
        if not kurum_id:
            raise CommandError('--kurum-id zorunludur (--list hariç).')
        if not channel_config_id:
            raise CommandError('--channel-config-id zorunludur (--list hariç).')

        result = CampaignDuyuruTemplateSeedService.seed(
            kurum_id,
            channel_config_id=channel_config_id,
            dry_run=bool(options.get('dry_run')),
            skip_existing=not bool(options.get('force')),
        )

        self.stdout.write(
            f"kurum={result['kurum_id']} hesap={result['channel_config_id']} "
            f"dry_run={result['dry_run']}",
        )
        self.stdout.write(
            f"meta DRAFT: +{len(result['created_meta'])} "
            f"atlandı={len(result['skipped_meta'])}",
        )
        for name in result['created_meta']:
            self.stdout.write(f'  + meta  {name}')
        for name in result['skipped_meta']:
            self.stdout.write(f'  = skip  {name}')
        for err in result['errors']:
            self.stderr.write(self.style.ERROR(f'  ! {err}'))
        for step in result.get('next_steps') or []:
            self.stdout.write(self.style.WARNING(f'  → {step}'))

        if result['errors']:
            raise CommandError(f"{len(result['errors'])} şablon oluşturulamadı.")
        self.stdout.write(self.style.SUCCESS('Kampanya şablon taslakları hazır.'))
