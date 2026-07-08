"""
Gider v2 — Command Service.

Mevcut GiderService yazma yolunu sarmalar; v2'ye özel alanları (maliyet merkezi,
proje, etiketler) ekler ve audit log tutar. Muhasebe/taksit/cari mantığı değişmez.
"""
from __future__ import annotations

from django.db import transaction

from apps.finans.application.gider_service import GiderService
from apps.finans.application.finans_v2.audit import FinansAuditService
from apps.finans.domain.finans_islem_log import FinansEylem, FinansModul
from apps.finans.domain.cari_etiket import CariEtiket


def _valid_etiket_ids(kurum_id, ids):
    if not ids:
        return []
    return list(
        CariEtiket.objects.filter(kurum_id=kurum_id, id__in=ids)
        .values_list('id', flat=True)
    )


class GiderCommandService:
    def __init__(self):
        self.base = GiderService()

    @transaction.atomic
    def create(self, data, *, islem_yapan=None, ip_adresi=None):
        etiket_ids = data.pop('etiket_ids', None)
        payload = dict(data)
        payload['olusturan'] = islem_yapan

        gider, errors = self.base.create(payload)
        if errors:
            return None, errors

        if etiket_ids:
            gider.etiketler.set(_valid_etiket_ids(gider.kurum_id, etiket_ids))

        FinansAuditService.log(
            kurum_id=gider.kurum_id, sube_id=gider.sube_id,
            modul=FinansModul.GIDER, eylem=FinansEylem.OLUSTUR,
            kayit_tip='GiderKaydi', kayit_id=gider.pk,
            aciklama=f'Gider kaydı oluşturuldu: {gider.fatura_no}',
            tutar=gider.net_tutar, kullanici=islem_yapan, ip_adresi=ip_adresi,
        )
        return gider, None

    @transaction.atomic
    def update(self, gider_id, data, *, islem_yapan=None, ip_adresi=None):
        etiket_ids = data.pop('etiket_ids', None)
        payload = dict(data)
        payload['islem_yapan'] = islem_yapan

        gider, errors = self.base.update(gider_id, payload)
        if errors:
            return None, errors

        if etiket_ids is not None:
            gider.etiketler.set(_valid_etiket_ids(gider.kurum_id, etiket_ids))

        FinansAuditService.log(
            kurum_id=gider.kurum_id, sube_id=gider.sube_id,
            modul=FinansModul.GIDER, eylem=FinansEylem.GUNCELLE,
            kayit_tip='GiderKaydi', kayit_id=gider.pk,
            aciklama=f'Gider kaydı güncellendi: {gider.fatura_no}',
            tutar=gider.net_tutar, kullanici=islem_yapan, ip_adresi=ip_adresi,
        )
        return gider, None

    @transaction.atomic
    def onayla(self, gider_id, *, islem_yapan=None, ip_adresi=None):
        gider, errors = self.base.onayla(gider_id, onaylayan_user=islem_yapan)
        if errors:
            return None, errors
        FinansAuditService.log(
            kurum_id=gider.kurum_id, sube_id=gider.sube_id,
            modul=FinansModul.GIDER, eylem=FinansEylem.ONAYLA,
            kayit_tip='GiderKaydi', kayit_id=gider.pk,
            aciklama=f'Gider onaylandı: {gider.fatura_no}',
            tutar=gider.net_tutar, kullanici=islem_yapan, ip_adresi=ip_adresi,
        )
        return gider, None

    @transaction.atomic
    def iptal_et(self, gider_id, *, islem_yapan=None, ip_adresi=None):
        gider, errors = self.base.iptal_et(gider_id)
        if errors:
            return None, errors
        FinansAuditService.log(
            kurum_id=gider.kurum_id, sube_id=gider.sube_id,
            modul=FinansModul.GIDER, eylem=FinansEylem.IPTAL,
            kayit_tip='GiderKaydi', kayit_id=gider.pk,
            aciklama=f'Gider iptal edildi: {gider.fatura_no}',
            tutar=gider.net_tutar, kullanici=islem_yapan, ip_adresi=ip_adresi,
        )
        return gider, None

    def soft_delete(self, gider_id, *, islem_yapan=None, ip_adresi=None):
        gider, errors = self.base.soft_delete(gider_id)
        if errors:
            return None, errors
        FinansAuditService.log(
            kurum_id=gider.kurum_id, sube_id=gider.sube_id,
            modul=FinansModul.GIDER, eylem=FinansEylem.SIL,
            kayit_tip='GiderKaydi', kayit_id=gider.pk,
            aciklama=f'Gider silindi: {gider.fatura_no}',
            kullanici=islem_yapan, ip_adresi=ip_adresi,
        )
        return gider, None
