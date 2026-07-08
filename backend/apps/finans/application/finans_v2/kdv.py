"""
KDV Hesaplama — tek merkez (DRY).

Tüm finans modülleri bu yardımcıyı kullanır; KDV formülü başka yerde tekrarlanmaz.
"""
from decimal import Decimal, ROUND_HALF_UP

_CENT = Decimal('0.01')


def kdv_hesapla(brut_tutar, kdv_orani):
    """
    Brüt tutar ve KDV oranından (yüzde) KDV tutarı ve net (KDV dahil) tutarı döner.

    Returns: (kdv_tutar: Decimal, net_tutar: Decimal)
    """
    brut = Decimal(str(brut_tutar or '0'))
    oran = Decimal(str(kdv_orani or '0'))
    kdv = (brut * oran / Decimal('100')).quantize(_CENT, rounding=ROUND_HALF_UP)
    return kdv, (brut + kdv).quantize(_CENT, rounding=ROUND_HALF_UP)


# ─── KDV Modları ─────────────────────────────────────────────
KDV_HARIC = 'haric'
KDV_DAHIL = 'dahil'
KDV_MUAF = 'muaf'
KDV_MOD_CHOICES = [
    (KDV_HARIC, 'KDV Hariç'),
    (KDV_DAHIL, 'KDV Dahil'),
    (KDV_MUAF, 'KDV Muaf'),
]
KDV_MOD_VALUES = frozenset({KDV_HARIC, KDV_DAHIL, KDV_MUAF})


def kdv_hesapla_mod(taban_tutar, kdv_orani, mod=KDV_HARIC):
    """
    KDV moduna göre brüt (KDV hariç taban), KDV ve net (KDV dahil) tutarları döner.

    - haric: kullanıcı KDV hariç tabanı girer → net = taban + KDV
    - dahil: kullanıcı KDV dahil net'i girer → brut = net / (1 + oran)
    - muaf : KDV yok → brut = net = taban

    Returns: (brut_tutar: Decimal, kdv_tutar: Decimal, net_tutar: Decimal)
    """
    taban = Decimal(str(taban_tutar or '0'))
    oran = Decimal(str(kdv_orani or '0'))

    if mod == KDV_MUAF or oran <= 0:
        taban_q = taban.quantize(_CENT, rounding=ROUND_HALF_UP)
        return taban_q, Decimal('0.00'), taban_q

    if mod == KDV_DAHIL:
        net = taban.quantize(_CENT, rounding=ROUND_HALF_UP)
        brut = (net / (Decimal('1') + oran / Decimal('100'))).quantize(_CENT, rounding=ROUND_HALF_UP)
        kdv = (net - brut).quantize(_CENT, rounding=ROUND_HALF_UP)
        return brut, kdv, net

    # haric (varsayılan)
    brut = taban.quantize(_CENT, rounding=ROUND_HALF_UP)
    kdv, net = kdv_hesapla(brut, oran)
    return brut, kdv, net
