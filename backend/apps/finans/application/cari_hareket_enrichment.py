"""
Cari hareket listesi için kaynak kayıtlardan kategori / ödeme yöntemi zenginleştirmesi.
"""
from collections import defaultdict


def _meta(kategori='', odeme_adi='', odeme_tip=''):
    return {
        'kategori_adi': kategori or '',
        'odeme_yontemi_adi': odeme_adi or '',
        'odeme_yontemi_tip': odeme_tip or '',
    }


def build_cari_hareket_meta(hareketler):
    """
    Hareket listesi için (kaynak_tip, kaynak_id) → meta sözlüğü üretir.
    """
    by_tip = defaultdict(set)
    for h in hareketler:
        if h.kaynak_tip and h.kaynak_id:
            by_tip[h.kaynak_tip].add(h.kaynak_id)

    meta = {}

    gelir_ids = by_tip.get('GelirKaydi')
    if gelir_ids:
        from apps.finans.domain.gelir_kaydi import GelirKaydi
        for row in GelirKaydi.objects.filter(pk__in=gelir_ids).select_related(
            'gelir_kategorisi', 'odeme_yontemi'
        ):
            meta[('GelirKaydi', row.pk)] = _meta(
                row.gelir_kategorisi.ad if row.gelir_kategorisi else '',
                row.odeme_yontemi.ad if row.odeme_yontemi else '',
                row.odeme_yontemi.tip if row.odeme_yontemi else '',
            )

    tahsilat_ids = by_tip.get('GelirTahsilat')
    if tahsilat_ids:
        from apps.finans.domain.gelir_tahsilat import GelirTahsilat
        for row in GelirTahsilat.objects.filter(pk__in=tahsilat_ids).select_related(
            'gelir_kaydi__gelir_kategorisi', 'odeme_yontemi'
        ):
            gk = row.gelir_kaydi
            meta[('GelirTahsilat', row.pk)] = _meta(
                gk.gelir_kategorisi.ad if gk and gk.gelir_kategorisi else '',
                row.odeme_yontemi.ad if row.odeme_yontemi else '',
                row.odeme_yontemi.tip if row.odeme_yontemi else '',
            )

    gider_ids = by_tip.get('GiderKaydi')
    if gider_ids:
        from apps.finans.domain.gider_kaydi import GiderKaydi
        for row in GiderKaydi.objects.filter(pk__in=gider_ids).select_related(
            'gider_kategorisi', 'odeme_yontemi'
        ):
            meta[('GiderKaydi', row.pk)] = _meta(
                row.gider_kategorisi.ad if row.gider_kategorisi else '',
                row.odeme_yontemi.ad if row.odeme_yontemi else '',
                row.odeme_yontemi.tip if row.odeme_yontemi else '',
            )

    odeme_ids = by_tip.get('GiderOdeme')
    if odeme_ids:
        from apps.finans.domain.gider_odeme import GiderOdeme
        for row in GiderOdeme.objects.filter(pk__in=odeme_ids).select_related(
            'gider_kaydi__gider_kategorisi', 'odeme_yontemi'
        ):
            gider = row.gider_kaydi
            meta[('GiderOdeme', row.pk)] = _meta(
                gider.gider_kategorisi.ad if gider and gider.gider_kategorisi else '',
                row.odeme_yontemi.ad if row.odeme_yontemi else '',
                row.odeme_yontemi.tip if row.odeme_yontemi else '',
            )

    return meta
