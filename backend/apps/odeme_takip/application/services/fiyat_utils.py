"""
Sözleşme kalem fiyat/indirim hesaplama yardımcıları.

Öncelik sırası: net_tutar > indirim_tutari > indirim_orani
brut_tutar her zaman KDV dahil liste fiyatıdır (tam sayı TL).
"""


def resolve_kalem_indirim(brut, indirim_orani=None, indirim_tutari=None, net_tutar=None):
    """
  Kalem indirimini çözümle.

  Returns:
      (indirim_orani_int, indirim_tutari_int, net_tutar_int)
  """
    brut = int(brut or 0)
    if brut <= 0:
        return 0, 0, 0

    if net_tutar is not None and net_tutar != "":
        net = max(0, min(brut, int(net_tutar)))
        indirim = brut - net
    elif indirim_tutari is not None and indirim_tutari != "":
        indirim = max(0, min(brut, int(indirim_tutari)))
        net = brut - indirim
    else:
        oran_val = float(indirim_orani or 0)
        indirim = round(brut * oran_val / 100)
        net = brut - indirim

    oran_gosterim = round(indirim / brut * 100) if brut > 0 else 0
    return oran_gosterim, indirim, net


def hesapla_kalem_fiyat(brut, kdv_orani, indirim_orani=None, indirim_tutari=None, net_tutar=None):
    """
  KDV + indirim dahil tam kalem fiyat döndürür.

  Returns:
      dict: kdv_orani, kdv_tutari, kdv_haric, indirim_orani, indirim_tutari, net_tutar, brut_tutar, kdv_dahil_tutar
  """
    from apps.egitim_paketleri.models import hesapla_kdv

    brut = int(brut or 0)
    kdv_orani = int(kdv_orani or 10)
    kdv_haric, kdv_tutari = hesapla_kdv(brut, kdv_orani)
    oran, indirim, net = resolve_kalem_indirim(
        brut,
        indirim_orani=indirim_orani,
        indirim_tutari=indirim_tutari,
        net_tutar=net_tutar,
    )
    return {
        "brut_tutar": brut,
        "kdv_orani": kdv_orani,
        "kdv_haric": kdv_haric,
        "kdv_tutari": kdv_tutari,
        "kdv_dahil_tutar": brut,
        "indirim_orani": oran,
        "indirim_tutari": indirim,
        "net_tutar": net,
    }
