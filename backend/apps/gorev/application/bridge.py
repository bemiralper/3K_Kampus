"""Görev → Takvim Event köprüsü."""
import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.gorev.domain.models import Gorev, GorevAtama
from apps.gorev.domain.enums import GorevDurum
from apps.takvim.application.integration_service import CalendarIntegrationService
from apps.takvim.domain.enums import EventCategory, EventStatus

logger = logging.getLogger('gorev.bridge')

KAYNAK_MODUL = 'gorev'


class GorevCalendarBridge:
    """Her GorevAtama için takvimde bir Event oluşturur/günceller."""

    def __init__(self):
        self.cal = CalendarIntegrationService()

    def _atama_kaynak_id(self, atama: GorevAtama) -> str:
        return str(atama.id)

    def _map_durum(self, durum: str) -> str:
        mapping = {
            GorevDurum.BEKLIYOR: EventStatus.SCHEDULED,
            GorevDurum.BASLADI: EventStatus.IN_PROGRESS,
            GorevDurum.DEVAM_EDIYOR: EventStatus.IN_PROGRESS,
            GorevDurum.TAMAMLANDI: EventStatus.COMPLETED,
            GorevDurum.IPTAL: EventStatus.CANCELLED,
        }
        return mapping.get(durum, EventStatus.SCHEDULED)

    @transaction.atomic
    def sync_atama(self, atama: GorevAtama, user_id: int = None):
        gorev = atama.gorev
        if gorev.is_deleted or atama.durum == GorevDurum.IPTAL:
            self.remove_atama(gorev.kurum_id, atama.id)
            return None

        bitis = gorev.son_tarih
        if not gorev.tum_gun:
            bitis = gorev.son_tarih + timedelta(minutes=gorev.tahmini_sure_dk or 30)

        event = self.cal._sync_event(
            kurum_id=gorev.kurum_id,
            kaynak_modul=KAYNAK_MODUL,
            kaynak_id=self._atama_kaynak_id(atama),
            kategori=EventCategory.GOREV,
            baslik=gorev.baslik,
            baslangic=gorev.son_tarih,
            bitis=bitis,
            user_id=user_id or gorev.olusturan_id or atama.atanan_user_id,
            aciklama=gorev.aciklama,
            tum_gun=gorev.tum_gun,
            ogretmen_id=atama.atanan_user_id,
            renk=gorev.gorev_renk,
            sube_id=gorev.sube_id,
            egitim_yili_id=gorev.egitim_yili_id,
            donem_id=gorev.donem_id,
        )
        if event:
            event.durum = self._map_durum(atama.durum)
            event.save(update_fields=['durum'])
        else:
            logger.warning(
                'Takvim senkronu başarısız: gorev_atama=%s kurum=%s',
                atama.id, gorev.kurum_id,
            )
        return event

    @transaction.atomic
    def sync_gorev(self, gorev: Gorev, user_id: int = None):
        for atama in gorev.atamalar.all():
            self.sync_atama(atama, user_id)

    def remove_atama(self, kurum_id: int, atama_id):
        self.cal.remove_event(kurum_id, KAYNAK_MODUL, str(atama_id))

    def remove_gorev(self, gorev: Gorev):
        for atama in gorev.atamalar.all():
            self.remove_atama(gorev.kurum_id, atama.id)
