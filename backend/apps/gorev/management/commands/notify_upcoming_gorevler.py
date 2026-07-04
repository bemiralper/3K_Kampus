"""Son tarihe yaklaşan tamamlanmamış görevler için atanan kişiye hatırlatma gönder."""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.gorev.domain.models import GorevAtama
from apps.gorev.domain.enums import GorevDurum
from apps.gorev.application.notification import GorevNotificationService


class Command(BaseCommand):
    help = 'Son tarihe 24 saat kala tamamlanmamış görevler için hatırlatma bildirimi gönderir'

    def handle(self, *args, **options):
        now = timezone.now()
        window_end = now + timedelta(hours=24)
        remind_interval = timedelta(hours=12)
        active = [GorevDurum.BEKLIYOR, GorevDurum.BASLADI, GorevDurum.DEVAM_EDIYOR]
        notifier = GorevNotificationService()

        qs = GorevAtama.objects.filter(
            gorev__is_deleted=False,
            gorev__son_tarih__gt=now,
            gorev__son_tarih__lte=window_end,
            durum__in=active,
        ).select_related('gorev', 'gorev__gorev_tipi')

        count = 0
        for atama in qs:
            if atama.son_hatirlatma_at and (now - atama.son_hatirlatma_at) < remind_interval:
                continue
            notifier.notify_assignment_reminder(atama.gorev, atama)
            atama.son_hatirlatma_at = now
            atama.save(update_fields=['son_hatirlatma_at'])
            count += 1

        self.stdout.write(self.style.SUCCESS(f'{count} hatırlatma bildirimi gönderildi'))
