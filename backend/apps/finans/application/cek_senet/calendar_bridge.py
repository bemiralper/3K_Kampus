"""Verilen çek/senet vade tarihlerini merkezi takvime yansıtır."""
import logging
from datetime import datetime, time as dtime

from django.db import transaction
from django.utils import timezone

from apps.odeme_takip.domain.cek_senet import CekSenetDetay, CekSenetDurum, CekSenetYon
from apps.takvim.application.integration_service import CalendarIntegrationService
from apps.takvim.domain.enums import EventCategory

logger = logging.getLogger('finans.cek_senet.calendar')

KAYNAK_MODUL = 'cek_senet'


class CekSenetCalendarBridge:
    """Verilen çek/senet ödeme (vade) tarihini takvimde gösterir."""

    RENK = '#DC2626'

    def __init__(self):
        self.cal = CalendarIntegrationService()

    def _should_sync(self, detay: CekSenetDetay) -> bool:
        return (
            detay.yon == CekSenetYon.VERILEN
            and detay.kurum_id
            and detay.vade_tarihi
            and detay.tutar > 0
            and CekSenetDurum.is_aktif(detay.durum)
        )

    def _baslik(self, detay: CekSenetDetay) -> str:
        arac = 'Çek' if detay.arac_tipi == 'cek' else 'Senet'
        no = detay.cek_senet_no or f'#{detay.pk}'
        cari = detay.cari_hesap.unvan if detay.cari_hesap_id else 'Cari yok'
        return f'Verilen {arac} Ödemesi — {no} ({cari})'

    def _aciklama(self, detay: CekSenetDetay) -> str:
        parts = [f'Tutar: {detay.tutar:,} TL'.replace(',', '.')]
        if detay.banka_adi:
            parts.append(f'Banka: {detay.banka_adi}')
        if detay.aciklama:
            parts.append(detay.aciklama)
        return ' · '.join(parts)

    @transaction.atomic
    def sync_detay(self, detay: CekSenetDetay, user_id: int | None = None):
        if not self._should_sync(detay):
            if detay.kurum_id:
                self.remove_detay(detay.kurum_id, detay.pk)
            return None

        vade = detay.vade_tarihi
        baslangic = timezone.make_aware(datetime.combine(vade, dtime(0, 0)))
        bitis = timezone.make_aware(datetime.combine(vade, dtime(23, 59)))

        egitim_yili_id = None
        if detay.gider_taksit_id and detay.gider_taksit:
            egitim_yili_id = getattr(detay.gider_taksit.gider_kaydi, 'egitim_yili_id', None)

        event = self.cal._sync_event(
            kurum_id=detay.kurum_id,
            kaynak_modul=KAYNAK_MODUL,
            kaynak_id=str(detay.pk),
            kategori=EventCategory.DIGER,
            baslik=self._baslik(detay),
            baslangic=baslangic,
            bitis=bitis,
            user_id=user_id or 1,
            aciklama=self._aciklama(detay),
            tum_gun=True,
            renk=self.RENK,
            sube_id=detay.sube_id,
            egitim_yili_id=egitim_yili_id,
        )
        if not event:
            logger.warning('Takvim senkronu başarısız: cek_senet=%s', detay.pk)
        return event

    def remove_detay(self, kurum_id: int, detay_id: int):
        self.cal.remove_event(kurum_id, KAYNAK_MODUL, str(detay_id))

    def sync_verilen_for_kurum(self, kurum_id: int, sube_id: int | None = None) -> int:
        """Mevcut aktif verilen çek/senet kayıtlarını toplu senkronize eder."""
        qs = CekSenetDetay.objects.filter(
            kurum_id=kurum_id,
            yon=CekSenetYon.VERILEN,
            durum__in=CekSenetDurum.AKTIF_DURUMLAR,
        ).select_related('cari_hesap', 'gider_taksit__gider_kaydi')
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        count = 0
        for detay in qs:
            self.sync_detay(detay)
            count += 1
        return count
