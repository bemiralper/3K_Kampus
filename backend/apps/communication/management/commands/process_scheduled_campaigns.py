"""
Zamanlanmış kampanyaları onayla ve kuyruğa al.

Cron önerisi: her 1 dakika
  python manage.py process_scheduled_campaigns
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.communication.application.campaign_service import CampaignService
from apps.communication.domain.enums import CampaignStatus
from apps.communication.domain.models import OutboundCampaign


class Command(BaseCommand):
    help = 'scheduled_at geçmiş DRAFT/CONFIRMED kampanyaları onaylar ve kuyruğa alır'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Kampanyaları listele, onaylama',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        now = timezone.now()

        qs = OutboundCampaign.objects.filter(
            scheduled_at__isnull=False,
            scheduled_at__lte=now,
            status__in=[CampaignStatus.DRAFT, CampaignStatus.CONFIRMED],
        ).order_by('scheduled_at')

        count = qs.count()
        if count == 0:
            self.stdout.write('Zamanlanmış kampanya yok.')
            return

        self.stdout.write(f'{count} zamanlanmış kampanya bulundu.')

        service = CampaignService()
        processed = 0

        for campaign in qs:
            if dry_run:
                self.stdout.write(f'  [dry-run] {campaign.id} — {campaign.title}')
                continue

            try:
                if campaign.status == CampaignStatus.DRAFT:
                    service.confirm(campaign, sender_user_id=campaign.created_by_id)
                elif campaign.status == CampaignStatus.CONFIRMED:
                    # CONFIRMED ama henüz kuyruğa alınmamış — confirm tekrar çalıştır
                    service.confirm(campaign, sender_user_id=campaign.created_by_id)
                processed += 1
                self.stdout.write(self.style.SUCCESS(f'  Onaylandı: {campaign.id}'))
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f'  Hata ({campaign.id}): {exc}'))

        if not dry_run:
            self.stdout.write(self.style.SUCCESS(f'{processed} kampanya işlendi.'))
