"""
Tahsilat tutarını sözleşme kalemlerine oranlar.

Kalem fiyatları KDV dahildir. Gelen ödeme, kalem netlerinin payına bölünür.
Son satır kuruş farkını alır; fatura toplamı tahsilat tutarına eşit olur.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal('0.01')


def dagit_kalemler(kalemler: list[dict], odeme) -> list[dict]:
    """
    kalemler: {ad, net, kdv_orani}
    net ve odeme KDV dahil tutardır.
    """
    pay = _money(odeme)
    if pay <= 0:
        return []

    usable = []
    for kalem in kalemler:
        net = _money(kalem.get('net') or 0)
        if net <= 0:
            continue
        usable.append({
            'ad': (kalem.get('ad') or 'Eğitim bedeli').strip() or 'Eğitim bedeli',
            'net': net,
            'kdv_orani': int(kalem.get('kdv_orani') or 0),
        })

    if not usable:
        rate = int(kalemler[0].get('kdv_orani') or 0) if kalemler else 0
        name = (kalemler[0].get('ad') if kalemler else None) or 'Eğitim bedeli'
        return [_line(name, pay, rate)]

    total = sum((item['net'] for item in usable), Decimal('0'))
    grosses = [(item['net'] * pay / total).quantize(CENT, rounding=ROUND_HALF_UP) for item in usable]
    drift = pay - sum(grosses, Decimal('0'))
    grosses[-1] = (grosses[-1] + drift).quantize(CENT, rounding=ROUND_HALF_UP)

    lines = []
    for item, gross in zip(usable, grosses):
        if gross <= 0:
            continue
        lines.append(_line(item['ad'], gross, item['kdv_orani']))

    if lines:
        lines[-1] = _absorb(lines, pay)
    return [line for line in lines if _money(line['brut']) > 0]


def dagit_bilesenler(bilesenler: list[dict], odeme) -> list[dict]:
    """
    Katalog ağırlığına göre tahsilatı böler.
    Ağırlığı 0 olan satır da listede kalır; tutarı 0'dır, kullanıcı sonra pay verebilir.
    """
    pay = _money(odeme)
    prepared = []
    for item in bilesenler:
        prepared.append({
            'ad': (item.get('ad') or 'Eğitim bedeli').strip() or 'Eğitim bedeli',
            'katalog': _money(item.get('katalog') or 0),
            'kdv_orani': int(item.get('kdv_orani') or 0),
        })
    if not prepared or pay <= 0:
        return []

    total_w = sum((item['katalog'] for item in prepared), Decimal('0'))
    if total_w <= 0:
        grosses = [Decimal('0.00')] * len(prepared)
        grosses[0] = pay
    else:
        grosses = [
            (item['katalog'] * pay / total_w).quantize(CENT, rounding=ROUND_HALF_UP)
            if item['katalog'] > 0 else Decimal('0.00')
            for item in prepared
        ]
        idx = max((i for i, item in enumerate(prepared) if item['katalog'] > 0), default=len(prepared) - 1)
        drift = pay - sum(grosses, Decimal('0'))
        grosses[idx] = (grosses[idx] + drift).quantize(CENT, rounding=ROUND_HALF_UP)

    lines = []
    for item, gross in zip(prepared, grosses):
        if gross < 0:
            gross = Decimal('0.00')
        line = _line(item['ad'], gross, item['kdv_orani'])
        line['katalog'] = item['katalog']
        lines.append(line)
    return lines


def satir_from_brut(ad: str, brut, kdv_orani: int) -> dict:
    return _line(ad, _money(brut), int(kdv_orani or 0))


def toplamlar(satirlar: list[dict]) -> dict:
    matrah = sum((_money(s['matrah']) for s in satirlar), Decimal('0'))
    kdv = sum((_money(s['kdv']) for s in satirlar), Decimal('0'))
    brut = sum((_money(s['brut']) for s in satirlar), Decimal('0'))
    return {
        'matrah': matrah,
        'kdv': kdv,
        'odenecek': brut,
    }


def _line(ad: str, gross: Decimal, kdv_orani: int) -> dict:
    gross = _money(gross)
    rate = Decimal(int(kdv_orani or 0))
    if rate < 0:
        rate = Decimal('0')
    matrah = (gross / (Decimal('1') + rate / Decimal('100'))).quantize(CENT, rounding=ROUND_HALF_UP)
    kdv = (gross - matrah).quantize(CENT, rounding=ROUND_HALF_UP)
    return {
        'ad': ad,
        'kdv_orani': int(rate),
        'matrah': matrah,
        'kdv': kdv,
        'brut': gross,
    }


def _absorb(lines: list[dict], pay: Decimal) -> dict:
    """Son satırı, satır toplamı tahsilata eşit olacak şekilde düzeltir."""
    head = lines[:-1]
    used = sum((_money(line['brut']) for line in head), Decimal('0'))
    last = dict(lines[-1])
    last_gross = (pay - used).quantize(CENT, rounding=ROUND_HALF_UP)
    rebuilt = _line(last['ad'], last_gross, last['kdv_orani'])
    return rebuilt


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)
