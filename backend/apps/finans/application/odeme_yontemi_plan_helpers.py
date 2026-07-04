"""
Sözleşme / taksit planı için ödeme yöntemi listesi.

Tahsilatta banka (mali hesap) seçilir; planda yalnızca kanal tipi (Nakit, Havale, POS…)
gösterilir. Aynı tipte bankaya özel kayıtlar tekilleştirilir.
"""
from __future__ import annotations

from apps.finans.application.cek_senet.cek_senet_helpers import is_cek_senet_tip
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.payment_method import OdemeYontemi

PLAN_TIP_ORDER = (
    OdemeYontemiTipi.NAKIT,
    OdemeYontemiTipi.HAVALE_EFT,
    OdemeYontemiTipi.POS,
    OdemeYontemiTipi.ONLINE,
    OdemeYontemiTipi.CEK,
    OdemeYontemiTipi.SENET,
)

STANDARD_PLAN_TIPS = frozenset({
    OdemeYontemiTipi.NAKIT,
    OdemeYontemiTipi.HAVALE_EFT,
    OdemeYontemiTipi.POS,
    OdemeYontemiTipi.ONLINE,
})


def plan_display_ad(oy: OdemeYontemi) -> str:
    """Planda gösterilecek ad — standart tiplerde sabit etiket."""
    if is_cek_senet_tip(oy.tip) and not oy.mali_hesap_id:
        return oy.ad
    if oy.tip in STANDARD_PLAN_TIPS:
        return OdemeYontemiTipi.get_label(oy.tip)
    return oy.ad


def serialize_plan_item(oy: OdemeYontemi) -> dict:
    return {
        'id': oy.id,
        'ad': plan_display_ad(oy),
        'tip': oy.tip,
        'kod': oy.tip,
        'mali_hesap_id': oy.mali_hesap_id,
        'aktif_mi': oy.aktif_mi,
    }


def _prefer_canonical(current: OdemeYontemi | None, candidate: OdemeYontemi) -> OdemeYontemi:
    if current is None:
        return candidate
    if candidate.mali_hesap_id is None and current.mali_hesap_id is not None:
        return candidate
    if (candidate.mali_hesap_id is None) == (current.mali_hesap_id is None):
        if candidate.siralama != current.siralama:
            return candidate if candidate.siralama < current.siralama else current
        return candidate if candidate.id < current.id else current
    return current


def dedupe_odeme_yontemleri_for_plan(queryset) -> list[dict]:
    """
    Tip başına tek kayıt (standart kanallar).
    Çek/senet: kurum geneli (mali_hesap=null) tüm adlandırılmış kayıtlar listelenir.
    Bankaya bağlı çek/senet plan listesine alınmaz.
    """
    items = list(queryset.order_by('siralama', 'ad', 'id'))
    by_tip: dict[str, OdemeYontemi] = {}
    cek_senet: list[OdemeYontemi] = []

    for oy in items:
        if is_cek_senet_tip(oy.tip):
            if oy.mali_hesap_id is None:
                cek_senet.append(oy)
            continue
        if oy.tip not in STANDARD_PLAN_TIPS:
            continue
        by_tip[oy.tip] = _prefer_canonical(by_tip.get(oy.tip), oy)

    ordered = [by_tip[tip] for tip in PLAN_TIP_ORDER if tip in by_tip]
    ordered.extend(cek_senet)
    return [serialize_plan_item(oy) for oy in ordered]


def ensure_kurum_plan_odeme_yontemleri(kurum_id: int) -> dict[str, int]:
    """
    Kurum için plan amaçlı (mali_hesap=null) standart tip kayıtlarını oluşturur.
    Returns: tip -> odeme_yontemi_id
    """
    canonical: dict[str, int] = {}

    for tip in STANDARD_PLAN_TIPS:
        label = OdemeYontemiTipi.get_label(tip)
        oy = (
            OdemeYontemi.objects.filter(
                kurum_id=kurum_id,
                tip=tip,
                mali_hesap__isnull=True,
                silindi_mi=False,
            )
            .order_by('siralama', 'id')
            .first()
        )
        if not oy:
            oy = OdemeYontemi.objects.create(
                kurum_id=kurum_id,
                mali_hesap=None,
                ad=label,
                tip=tip,
                aktif_mi=True,
            )
        canonical[tip] = oy.id

    for oy in OdemeYontemi.objects.filter(
        kurum_id=kurum_id,
        mali_hesap__isnull=True,
        silindi_mi=False,
        tip__in=[OdemeYontemiTipi.CEK, OdemeYontemiTipi.SENET],
    ):
        canonical[f'{oy.tip}:{oy.id}'] = oy.id

    return canonical


def remap_odeme_yontemi_to_plan_canonical(kurum_id: int) -> int:
    """
    Sözleşme/taksit kayıtlarındaki bankaya özel ödeme yöntemi id'lerini
    kurum plan kanonik id'lerine taşır. Güncellenen kayıt sayısını döner.
    """
    from apps.odeme_takip.domain.models import Sozlesme, Taksit

    ensure_kurum_plan_odeme_yontemleri(kurum_id)
    tip_to_id = {
        oy.tip: oy.id
        for oy in OdemeYontemi.objects.filter(
            kurum_id=kurum_id,
            mali_hesap__isnull=True,
            silindi_mi=False,
            tip__in=STANDARD_PLAN_TIPS,
        )
    }

    updated = 0
    for model in (Sozlesme, Taksit):
        qs = model.objects.filter(
            odeme_yontemi_id__isnull=False,
            odeme_yontemi__kurum_id=kurum_id,
            odeme_yontemi__mali_hesap__isnull=False,
            odeme_yontemi__tip__in=STANDARD_PLAN_TIPS,
        ).select_related('odeme_yontemi')
        for row in qs:
            canonical_id = tip_to_id.get(row.odeme_yontemi.tip)
            if canonical_id and row.odeme_yontemi_id != canonical_id:
                model.objects.filter(pk=row.pk).update(odeme_yontemi_id=canonical_id)
                updated += 1
    return updated
