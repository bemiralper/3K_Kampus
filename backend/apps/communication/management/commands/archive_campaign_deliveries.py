"""
Gönderim geçmişi saklama politikası (ürün kararı 9: önce arşiv, sonra arşiv silme).

1. `--days N` (varsayılan 180): N gün önce bitmiş (COMPLETED/PARTIAL/CANCELLED/FAILED)
   kampanyaların teslimat satırları `CampaignDeliveryArchive.rows` JSON'una alınır;
   hacmi yaratan `MessageStatusEvent` satırları silinir. Kampanya `Message`
   kayıtları (sohbet geçmişi) varsayılan olarak KORUNUR; `--delete-messages`
   ile silinebilir (detay sayfası bu durumda arşivden okur).
2. `--purge-archive-days M` (varsayılan 730): M gün önce arşivlenmiş arşiv
   satırları silinir. Kampanya özeti (sayaçlar) her zaman kalır.

Cron önerisi: haftada bir, gece
  python manage.py archive_campaign_deliveries --days 180 --purge-archive-days 730
"""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.communication.domain.enums import CampaignStatus, MessageDirection
from apps.communication.domain.models import (
    CampaignDeliveryArchive,
    Message,
    MessageStatusEvent,
    OutboundCampaign,
)

TERMINAL = (
    CampaignStatus.COMPLETED,
    CampaignStatus.PARTIAL,
    CampaignStatus.CANCELLED,
    CampaignStatus.FAILED,
)


class Command(BaseCommand):
    help = 'Tamamlanmış kampanyaların teslimat satırlarını arşivler; eski arşivi siler.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=180, help='Bitişten bu kadar gün sonra arşivle')
        parser.add_argument(
            '--purge-archive-days', type=int, default=730,
            help='Arşivlenmesinden bu kadar gün sonra arşiv satırını sil (0 = silme)',
        )
        parser.add_argument('--delete-messages', action='store_true',
                            help='Kampanya Message kayıtlarını da sil (sohbet geçmişinden düşer)')
        parser.add_argument('--kurum-id', type=int, default=None)
        parser.add_argument('--limit', type=int, default=200, help='Tek çalışmada en çok kampanya')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        days = max(1, int(options['days']))
        purge_days = max(0, int(options['purge_archive_days']))
        delete_messages = bool(options['delete_messages'])
        dry_run = bool(options['dry_run'])
        limit = max(1, int(options['limit']))
        now = timezone.now()
        cutoff = now - timedelta(days=days)

        qs = OutboundCampaign.objects.filter(
            status__in=TERMINAL,
            updated_at__lt=cutoff,
            deliveries_archived_at__isnull=True,
        ).order_by('updated_at')
        if options['kurum_id']:
            qs = qs.filter(kurum_id=options['kurum_id'])
        campaigns = list(qs[:limit])

        archived = 0
        events_deleted = 0
        messages_deleted = 0
        for campaign in campaigns:
            rows = self._snapshot(campaign)
            msg_qs = Message.objects.filter(campaign=campaign, direction=MessageDirection.OUTBOUND)
            ev_qs = MessageStatusEvent.objects.filter(message__in=msg_qs)
            ev_count = ev_qs.count()
            msg_count = msg_qs.count() if delete_messages else 0
            if dry_run:
                self.stdout.write(
                    f'[dry-run] {campaign.id} "{campaign.title}" satır={len(rows)} '
                    f'event={ev_count} mesaj={msg_count}'
                )
                continue
            with transaction.atomic():
                CampaignDeliveryArchive.objects.update_or_create(
                    campaign=campaign,
                    defaults={
                        'kurum_id': campaign.kurum_id,
                        'rows': rows,
                        'row_count': len(rows),
                        'status_events_deleted': ev_count,
                        'messages_deleted': msg_count,
                    },
                )
                ev_qs.delete()
                if delete_messages:
                    msg_qs.delete()
                OutboundCampaign.objects.filter(pk=campaign.pk).update(
                    deliveries_archived_at=now, updated_at=now,
                )
            archived += 1
            events_deleted += ev_count
            messages_deleted += msg_count

        purged = 0
        if purge_days:
            purge_qs = CampaignDeliveryArchive.objects.filter(
                archived_at__lt=now - timedelta(days=purge_days),
            )
            if options['kurum_id']:
                purge_qs = purge_qs.filter(kurum_id=options['kurum_id'])
            if dry_run:
                purged = purge_qs.count()
                self.stdout.write(f'[dry-run] silinecek arşiv satırı: {purged}')
            else:
                purged, _ = purge_qs.delete()

        prefix = '[dry-run] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'{prefix}arşivlenen kampanya={archived} silinen durum olayı={events_deleted} '
            f'silinen mesaj={messages_deleted} silinen arşiv={purged}'
        ))

    @staticmethod
    def _snapshot(campaign) -> list[dict]:
        from apps.communication.interfaces.views.campaigns import _campaign_deliveries

        rows = _campaign_deliveries(campaign, limit=1_000_000, include_skipped=True)
        # Arşivde kuyruk notları anlamsız; sadeleştir
        for r in rows:
            r.pop('queue_note', None)
            r.pop('next_attempt_at', None)
        return rows
