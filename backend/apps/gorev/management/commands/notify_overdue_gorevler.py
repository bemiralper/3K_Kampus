"""Geciken görevler için yönetici bildirimi gönder."""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.gorev.domain.models import GorevAtama
from apps.gorev.domain.enums import GorevDurum
from apps.gorev.application.notification import GorevNotificationService


class Command(BaseCommand):
    help = 'Son tarihi geçmiş ve henüz bildirilmemiş görevler için admin bildirimi oluşturur'

    def handle(self, *args, **options):
        now = timezone.now()
        notifier = GorevNotificationService()
        active = [GorevDurum.BEKLIYOR, GorevDurum.BASLADI, GorevDurum.DEVAM_EDIYOR]

        qs = GorevAtama.objects.filter(
            gorev__is_deleted=False,
            gorev__son_tarih__lt=now,
            durum__in=active,
            gecikme_bildirildi_at__isnull=True,
        ).select_related('gorev', 'gorev__gorev_tipi')

        count = 0
        for atama in qs:
            if not atama.gecikti_mi:
                continue
            notifier.notify_admins_atama_overdue(atama.gorev, atama)
            atama.gecikme_bildirildi_at = now
            atama.save(update_fields=['gecikme_bildirildi_at'])
            count += 1

        self.stdout.write(self.style.SUCCESS(f'{count} gecikme bildirimi gönderildi'))
