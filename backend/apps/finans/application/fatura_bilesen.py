"""
Sözleşme paketinin içindeki hizmetleri fatura kalemine çevirir.

Grup dersi ve premium paket, kütüphane, koçluk, deneme ve yayın gibi
dahil hizmetleri tek satırda saklar. Faturada bunlar ayrı kalem olur.
Eğitim satırının katalog ağırlığı, paket liste fiyatından dahil
hizmetlerin liste fiyatı düşülerek bulunur.
"""
from __future__ import annotations

from decimal import Decimal

from apps.egitim_paketleri.models import GrupDersi, PremiumPaket

_PAKETLER = {
    'grup_dersi': GrupDersi,
    'premium': PremiumPaket,
}


def bilesen_kalemleri(sozlesme) -> list[dict]:
    kalemler = list(sozlesme.kalemler.all())
    if not kalemler:
        return [{
            'ad': sozlesme.paket_adi or 'Eğitim bedeli',
            'katalog': sozlesme.net_tutar or 0,
            'kdv_orani': sozlesme.kdv_orani or 0,
        }]

    ana = _ana_paket_kalemi(sozlesme, kalemler)
    expanded = _expand(sozlesme, ana) if ana is not None else None
    dahil_adlar = {item['ad'] for item in expanded[1:]} if expanded else set()

    out = []
    for kalem in kalemler:
        if expanded and ana is not None and kalem.id == ana.id:
            out.extend(expanded)
            continue
        if kalem.kalem_adi in dahil_adlar:
            continue
        out.append({
            'ad': kalem.kalem_adi or 'Eğitim bedeli',
            'katalog': kalem.net_tutar or 0,
            'kdv_orani': kalem.kdv_orani or 0,
        })
    return out


def _ana_paket_kalemi(sozlesme, kalemler):
    if not sozlesme.paket_id or sozlesme.paket_turu not in _PAKETLER:
        return None
    for kalem in kalemler:
        if kalem.kalem_turu == 'paket':
            return kalem
        if kalem.kalem_turu == sozlesme.paket_turu and kalem.kalem_id == sozlesme.paket_id:
            return kalem
    if len(kalemler) == 1:
        return kalemler[0]
    return None


def _expand(sozlesme, kalem):
    model = _PAKETLER.get(sozlesme.paket_turu or '')
    if model is None:
        return None
    paket = model.objects.filter(pk=sozlesme.paket_id).first()
    if paket is None:
        return None

    pieces = []
    for hizmet in paket.dahil_ek_hizmetler.all().order_by('hizmet_turu', 'ad'):
        pieces.append(_piece(hizmet.ad, hizmet.brut_fiyat, hizmet.kdv_orani))
    if hasattr(paket, 'dahil_denemeler'):
        for deneme in paket.dahil_denemeler.all().order_by('ad'):
            pieces.append(_piece(deneme.ad, deneme.brut_fiyat, deneme.kdv_orani))
    if hasattr(paket, 'dahil_yayin_paketleri'):
        for yayin in paket.dahil_yayin_paketleri.all().order_by('ad'):
            pieces.append(_piece(yayin.ad, yayin.brut_fiyat, yayin.kdv_orani))
    if not pieces:
        return None

    included = sum((Decimal(item['katalog']) for item in pieces), Decimal('0'))
    residual = max(Decimal(paket.brut_fiyat or 0) - included, Decimal('0'))
    parent = {
        'ad': (kalem.kalem_adi or paket.ad or 'Eğitim bedeli').strip() or 'Eğitim bedeli',
        'katalog': residual,
        'kdv_orani': kalem.kdv_orani if kalem.kdv_orani is not None else paket.kdv_orani,
    }
    return [parent, *pieces]


def _piece(ad, fiyat, kdv_orani) -> dict:
    return {
        'ad': (ad or 'Hizmet').strip() or 'Hizmet',
        'katalog': Decimal(fiyat or 0),
        'kdv_orani': int(kdv_orani or 0),
    }
