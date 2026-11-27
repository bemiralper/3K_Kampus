"""
Eski "bakiyeden mahsup" cari satırları.

Önceki sürüm bakiyeden mahsup ödemesinde ayrıca ALACAK/MAHSUP cari hareketi
yazıyordu. Gider kaydının ALACAK/ALIŞ satırı borcu zaten oluşturduğundan
borç iki kez sayılıyordu. Yeni mahsuplar cari hareket yazmaz.

Dengelenmemiş eski satır, aynı ödeme için BORÇ/MAHSUP ters kaydıyla
kapatılır. Hiçbir satır silinmez ya da değiştirilmez.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Q, Sum

from apps.finans.constants.cari_types import CariHareketTuru, CariHareketYonu
from apps.finans.domain.cari_hareket import CariHareket

KAYNAK_TIP = 'GiderOdeme'


def _mahsup_satirlari():
    return CariHareket.objects.filter(
        kaynak_tip=KAYNAK_TIP, islem_turu=CariHareketTuru.MAHSUP,
    )


def mahsup_cari_net(odeme_id) -> Decimal:
    """Ödemenin dengelenmemiş eski mahsup tutarı (ALACAK − BORÇ, en az 0)."""
    agg = _mahsup_satirlari().filter(kaynak_id=odeme_id).aggregate(
        alacak=Sum('tutar', filter=Q(yon=CariHareketYonu.ALACAK)),
        borc=Sum('tutar', filter=Q(yon=CariHareketYonu.BORC)),
    )
    net = (agg['alacak'] or Decimal('0')) - (agg['borc'] or Decimal('0'))
    return net if net > 0 else Decimal('0')


def dengelenmemis_mahsuplar(*, kurum_id=None, sube_id=None):
    """Ters kaydı eksik eski mahsup satırları: [{odeme_id, cari_hesap_id, net, ...}]."""
    from apps.finans.domain.gider_odeme import GiderOdeme

    qs = _mahsup_satirlari()
    if kurum_id is not None:
        qs = qs.filter(kurum_id=kurum_id)
    if sube_id is not None:
        qs = qs.filter(sube_id=sube_id)
    gruplar = (
        qs.values('kaynak_id', 'cari_hesap_id')
        .annotate(
            alacak=Sum('tutar', filter=Q(yon=CariHareketYonu.ALACAK)),
            borc=Sum('tutar', filter=Q(yon=CariHareketYonu.BORC)),
        )
        .order_by('kaynak_id')
    )
    adaylar = []
    for g in gruplar:
        net = (g['alacak'] or Decimal('0')) - (g['borc'] or Decimal('0'))
        if net > 0:
            adaylar.append((g['kaynak_id'], g['cari_hesap_id'], net))
    if not adaylar:
        return []

    odemeler = {
        o.pk: o
        for o in GiderOdeme.objects.filter(
            pk__in=[a[0] for a in adaylar], bakiyeden_mahsup=True,
        ).select_related('gider_kaydi')
    }
    sonuc = []
    for odeme_id, cari_hesap_id, net in adaylar:
        odeme = odemeler.get(odeme_id)
        if odeme is None:
            continue
        gider = odeme.gider_kaydi
        sonuc.append({
            'odeme_id': odeme_id,
            'cari_hesap_id': cari_hesap_id,
            'gider_kaydi_id': gider.pk,
            'fatura_no': gider.fatura_no or '',
            'odeme_durum': odeme.durum,
            'odeme_tarihi': odeme.odeme_tarihi.isoformat(),
            'net': net,
            'kurum_id': gider.kurum_id,
            'sube_id': gider.sube_id,
        })
    return sonuc


def mahsup_ters_kaydi_yaz(odeme, *, cari_hareket_service, aciklama, islem_yapan=None):
    """Ödemenin dengelenmemiş eski mahsubunu BORÇ/MAHSUP ile kapatır. Yazılan tutarı döndürür."""
    net = mahsup_cari_net(odeme.pk)
    if net <= 0:
        return Decimal('0')
    eski = _mahsup_satirlari().filter(
        kaynak_id=odeme.pk, yon=CariHareketYonu.ALACAK,
    ).order_by('islem_tarihi', 'id').first()
    gider = odeme.gider_kaydi
    cari_hareket_service.hareket_olustur(
        cari_hesap_id=eski.cari_hesap_id,
        kurum_id=gider.kurum_id,
        tutar=net,
        yon=CariHareketYonu.BORC,
        islem_turu=CariHareketTuru.MAHSUP,
        islem_tarihi=odeme.odeme_tarihi,
        sube_id=gider.sube_id,
        egitim_yili_id=gider.egitim_yili_id,
        kaynak_tip=KAYNAK_TIP,
        kaynak_id=odeme.pk,
        aciklama=aciklama,
        islem_yapan=islem_yapan,
    )
    return net
