"""
Gelir v2 — Command Service.

Mevcut (kanıtlanmış) GelirService yazma yolunu sarmalar; v2'ye özel alanları
(gelir kaynağı, proje, etiketler) ekler ve audit log tutar. Tek yazma yolu
korunur, muhasebe/cari mantığı değişmez.
"""
from __future__ import annotations

from django.db import transaction

from apps.finans.application.gelir_service import GelirService
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


class GelirCommandService:
    def __init__(self):
        self.base = GelirService()

    @transaction.atomic
    def create(self, data, *, islem_yapan=None, ip_adresi=None):
        etiket_ids = data.pop('etiket_ids', None)
        hemen_tahsil_et = bool(data.pop('hemen_tahsil_et', False))
        islem_odeme_tarihi = data.pop('islem_odeme_tarihi', None)
        bakiyeden_mahsup = bool(data.pop('bakiyeden_mahsup', False))
        taslak = bool(data.get('taslak_olarak_kaydet', False))

        if taslak and hemen_tahsil_et:
            return None, {
                'taslak_olarak_kaydet': 'Taslak olarak kaydedilen gelire aynı anda tahsilat işlenemez.',
            }

        payload = dict(data)
        payload['olusturan'] = islem_yapan

        gelir, errors = self.base.create(payload)
        if errors:
            transaction.set_rollback(True)
            return None, errors

        if etiket_ids:
            gelir.etiketler.set(_valid_etiket_ids(gelir.kurum_id, etiket_ids))

        if hemen_tahsil_et:
            from apps.finans.application.gelir_tahsilat_service import GelirTahsilatService
            tahsilat_payload = {
                'gelir_kaydi_id': gelir.pk,
                'tutar': gelir.net_tutar,
                'tahsilat_tarihi': islem_odeme_tarihi or gelir.fatura_tarihi,
                'mali_hesap_id': gelir.mali_hesap_id,
                'odeme_yontemi_id': gelir.odeme_yontemi_id,
                'aciklama': gelir.aciklama or 'Peşin gelir tahsilatı',
                'bakiyeden_mahsup': bakiyeden_mahsup,
                'islem_yapan': islem_yapan,
            }
            _, th_err = GelirTahsilatService().tahsilat_yap(tahsilat_payload)
            if th_err:
                transaction.set_rollback(True)
                return None, th_err
            gelir.refresh_from_db()

        FinansAuditService.log(
            kurum_id=gelir.kurum_id, sube_id=gelir.sube_id,
            modul=FinansModul.GELIR, eylem=FinansEylem.OLUSTUR,
            kayit_tip='GelirKaydi', kayit_id=gelir.pk,
            aciklama=f'Gelir kaydı oluşturuldu: {gelir.fatura_no}',
            tutar=gelir.net_tutar, kullanici=islem_yapan, ip_adresi=ip_adresi,
        )
        return gelir, None

    @transaction.atomic
    def update(self, gelir_id, data, *, islem_yapan=None, ip_adresi=None):
        etiket_ids = data.pop('etiket_ids', None)
        payload = dict(data)
        payload['islem_yapan'] = islem_yapan

        gelir, errors = self.base.update(gelir_id, payload)
        if errors:
            return None, errors

        if etiket_ids is not None:
            gelir.etiketler.set(_valid_etiket_ids(gelir.kurum_id, etiket_ids))

        FinansAuditService.log(
            kurum_id=gelir.kurum_id, sube_id=gelir.sube_id,
            modul=FinansModul.GELIR, eylem=FinansEylem.GUNCELLE,
            kayit_tip='GelirKaydi', kayit_id=gelir.pk,
            aciklama=f'Gelir kaydı güncellendi: {gelir.fatura_no}',
            tutar=gelir.net_tutar, kullanici=islem_yapan, ip_adresi=ip_adresi,
        )
        return gelir, None

    @transaction.atomic
    def onayla(self, gelir_id, *, islem_yapan=None, ip_adresi=None):
        gelir, errors = self.base.onayla(gelir_id)
        if errors:
            return None, errors
        FinansAuditService.log(
            kurum_id=gelir.kurum_id, sube_id=gelir.sube_id,
            modul=FinansModul.GELIR, eylem=FinansEylem.ONAYLA,
            kayit_tip='GelirKaydi', kayit_id=gelir.pk,
            aciklama=f'Gelir onaylandı: {gelir.fatura_no}',
            tutar=gelir.net_tutar, kullanici=islem_yapan, ip_adresi=ip_adresi,
        )
        return gelir, None

    @transaction.atomic
    def onay_kaldir(self, gelir_id, *, islem_yapan=None, ip_adresi=None):
        gelir, errors = self.base.onay_kaldir(gelir_id)
        if errors:
            return None, errors
        FinansAuditService.log(
            kurum_id=gelir.kurum_id, sube_id=gelir.sube_id,
            modul=FinansModul.GELIR, eylem=FinansEylem.GUNCELLE,
            kayit_tip='GelirKaydi', kayit_id=gelir.pk,
            aciklama=f'Gelir onayı kaldırıldı: {gelir.fatura_no}',
            tutar=gelir.net_tutar, kullanici=islem_yapan, ip_adresi=ip_adresi,
        )
        return gelir, None

    @transaction.atomic
    def iptal_et(self, gelir_id, *, islem_yapan=None, ip_adresi=None, force=False):
        gelir, errors = self.base.iptal_et(gelir_id, force=force)
        if errors:
            return None, errors
        FinansAuditService.log(
            kurum_id=gelir.kurum_id, sube_id=gelir.sube_id,
            modul=FinansModul.GELIR, eylem=FinansEylem.IPTAL,
            kayit_tip='GelirKaydi', kayit_id=gelir.pk,
            aciklama=f'Gelir iptal edildi: {gelir.fatura_no}',
            tutar=gelir.net_tutar, kullanici=islem_yapan, ip_adresi=ip_adresi,
        )
        return gelir, None

    def soft_delete(self, gelir_id, *, islem_yapan=None, ip_adresi=None, force=False):
        gelir, errors = self.base.soft_delete(gelir_id, force=force)
        if errors:
            return None, errors
        FinansAuditService.log(
            kurum_id=gelir.kurum_id, sube_id=gelir.sube_id,
            modul=FinansModul.GELIR, eylem=FinansEylem.SIL,
            kayit_tip='GelirKaydi', kayit_id=gelir.pk,
            aciklama=f'Gelir silindi: {gelir.fatura_no}',
            kullanici=islem_yapan, ip_adresi=ip_adresi,
        )
        return gelir, None
