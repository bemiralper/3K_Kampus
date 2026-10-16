"""Atanan kişinin kendi seçtiği saatte hatırlatması."""
from django.utils import timezone

from apps.gorev.application.notification import GorevNotificationService
from apps.gorev.domain.enums import GorevDurum
from apps.gorev.domain.models import GorevAtama


def send_due_personal_reminders(now=None) -> int:
    now = now or timezone.now()
    due = (
        GorevAtama.objects.filter(
            gorev__is_deleted=False,
            kisisel_hatirlatma_at__isnull=False,
            kisisel_hatirlatma_at__lte=now,
            kisisel_hatirlatma_gonderildi_at__isnull=True,
        )
        .exclude(durum=GorevDurum.IPTAL)
        .select_related('gorev', 'gorev__gorev_tipi')
    )
    notifier = GorevNotificationService()
    count = 0
    for atama in due:
        notifier.notify_personal_reminder(atama.gorev, atama)
        atama.kisisel_hatirlatma_gonderildi_at = now
        atama.save(update_fields=['kisisel_hatirlatma_gonderildi_at'])
        count += 1
    return count
