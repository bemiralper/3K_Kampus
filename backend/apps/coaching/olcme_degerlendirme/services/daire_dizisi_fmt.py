"""Sekonic / Datasis .fmt dosyasından daire dizisi alanları.

Dosya satır ve sütun verir, milimetre vermez. Köşe, formda duran bir
alanın ölçüsünden bir kez hesaplanır. Ad soyad varsa o tercih edilir.
"""
from __future__ import annotations

import uuid
from decimal import Decimal, ROUND_HALF_UP

from .daire_dizisi_schema import (
    HARFLER,
    RAKAMLAR,
    SURUM,
    TUR_CEVAP,
    TUR_DAIRE,
    TUR_KITAPCIK,
    TUR_METIN,
    TUR_OGRENCI_NO,
    TUR_SAYISAL,
    TUR_TC,
    TUR_TEK,
    YON_SATIR,
    YON_SUTUN,
    belge_dogrula,
)

_KATLA = str.maketrans({
    'İ': 'I', 'ı': 'I', 'i': 'I', 'I': 'I',
    'Ş': 'S', 'ş': 'S', 'Ğ': 'G', 'ğ': 'G',
    'Ü': 'U', 'ü': 'U', 'Ö': 'O', 'ö': 'O',
    'Ç': 'C', 'ç': 'C',
})
_BOS = '·'
_VARSAYILAN_X0 = Decimal('12')
_VARSAYILAN_Y0 = Decimal('18')
_VARSAYILAN_ARALIK = Decimal('4.3')
_VARSAYILAN_CAP = Decimal('3.2')


def _katla(text: str) -> str:
    folded = (text or '').translate(_KATLA).upper()
    return ''.join(ch for ch in folded if ch.isalnum())


def _ondalik(value, places='0.001') -> Decimal:
    return Decimal(str(value)).quantize(Decimal(places), rounding=ROUND_HALF_UP)


def _float(value, places='0.001') -> float:
    return float(_ondalik(value, places))


def _metin(raw: bytes | str) -> str:
    if isinstance(raw, str):
        return raw
    if raw.startswith(b'\xef\xbb\xbf'):
        return raw.decode('utf-8-sig')
    try:
        return raw.decode('utf-8')
    except UnicodeError:
        return raw.decode('cp1254')


def fmt_oku(raw: bytes | str) -> dict:
    """Başlık ve alan satırları. Aralıklar dahilidir."""
    text = _metin(raw).replace('\r\n', '\n').replace('\r', '\n')
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    if len(lines) < 2:
        raise ValueError('FMT dosyasında alan satırı yok.')
    header = lines[0].split('=')
    try:
        satir = int(header[0])
        sutun = int(header[1])
    except (ValueError, IndexError):
        raise ValueError('FMT başlığı satır ve sütun sayısıyla başlamalıdır.')
    if satir < 1 or sutun < 1 or satir > 200 or sutun > 200:
        raise ValueError('FMT satır veya sütun sayısı geçersiz.')
    alanlar = []
    for line in lines[1:]:
        parts = line.split('=')
        if len(parts) < 9:
            continue
        try:
            r1, r2 = int(parts[0]), int(parts[1])
            c1, c2 = int(parts[2]), int(parts[3])
        except ValueError:
            continue
        tip = (parts[4] or 'K').strip().upper()
        if tip not in ('K', 'S'):
            continue
        ad = (parts[8] or '').strip() or f'Alan {len(alanlar) + 1}'
        if r1 < 1 or c1 < 1 or r2 < r1 or c2 < c1 or r2 > satir or c2 > sutun:
            raise ValueError(f'{ad}: satır veya sütun aralığı ızgara dışında.')
        alanlar.append({
            'satir_bas': r1,
            'satir_son': r2,
            'sutun_bas': c1,
            'sutun_son': c2,
            'tip': tip,
            'zorunlu': (parts[5] or '').strip().upper() == 'D',
            'karakter': parts[6],
            'ad': ad[:80],
        })
    if not alanlar:
        raise ValueError('FMT dosyasında okunacak alan yok.')
    return {
        'satir': satir,
        'sutun': sutun,
        'alanlar': alanlar,
        'metin': text[:8000],
    }


def _tekil(alanlar: list[dict]) -> tuple[list[dict], list[str]]:
    """Aynı hücreyi iki kez tanımlayan satırda dolu olan kalır.

    Optik 129'da SINIF-1 ve SINIF-2 aynı sütundur. İkincisi tutulur.
    """
    by_span: dict[tuple, dict] = {}
    order: list[tuple] = []
    atlanan = []
    for item in alanlar:
        span = (item['satir_bas'], item['satir_son'], item['sutun_bas'], item['sutun_son'])
        prev = by_span.get(span)
        if prev is None:
            by_span[span] = item
            order.append(span)
            continue
        prev_score = sum(ch != ' ' for ch in prev['karakter'])
        score = sum(ch != ' ' for ch in item['karakter'])
        if score >= prev_score:
            atlanan.append(prev['ad'])
            by_span[span] = item
        else:
            atlanan.append(item['ad'])
    return [by_span[span] for span in order], atlanan


def _eslesen(alan: dict, fmt_alanlar: list[dict]) -> tuple[int, dict] | None:
    kaynak = (alan.get('veri_kaynagi') or '').strip()
    ad = _katla(alan.get('ad') or '')
    best = None
    best_rank = -1
    for item in fmt_alanlar:
        key = _katla(item['ad'])
        rank = -1
        if kaynak == 'ad_soyad' and 'ADISOYAD' in key:
            rank = 30
        elif kaynak == 'tc' and key.startswith('TC'):
            rank = 20
        elif kaynak in ('ogrenci_no', 'numara') and 'OGRENCI' in key:
            rank = 10
        elif ad and ad == key:
            rank = 5
        if rank > best_rank:
            best = item
            best_rank = rank
    if best is None or best_rank < 0:
        return None
    return best_rank, best


def izgara_bagla(fmt: dict, belge: dict | None, kenar: dict | None = None) -> dict:
    """1. satır 1. sütunun merkezi. Açık köşe, yoksa formdaki alan."""
    if isinstance(kenar, dict) and kenar.get('x0_mm') not in (None, '') and kenar.get('y0_mm') not in (None, ''):
        cap = _ondalik(kenar.get('cap_mm') or _VARSAYILAN_CAP, '0.01')
        isaret = kenar.get('isaret_cap_mm')
        if isaret in (None, ''):
            isaret = (cap * Decimal('0.68')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        return {
            'x0_mm': _float(kenar['x0_mm']),
            'y0_mm': _float(kenar['y0_mm']),
            'aralik_x_mm': _float(kenar.get('aralik_x_mm') or _VARSAYILAN_ARALIK),
            'aralik_y_mm': _float(kenar.get('aralik_y_mm') or _VARSAYILAN_ARALIK),
            'cap_mm': float(cap),
            'isaret_cap_mm': _float(isaret, '0.01'),
            'bagli': '',
            'uyari': '',
        }
    adaylar = []
    for alan in (belge or {}).get('alanlar') or []:
        if alan.get('tur') == TUR_METIN or not alan.get('aktif', True):
            continue
        try:
            ax = Decimal(str(alan.get('aralik_x_mm') or 0))
            ay = Decimal(str(alan.get('aralik_y_mm') or 0))
        except Exception:
            continue
        if ax <= 0 or ay <= 0:
            continue
        eslesen = _eslesen(alan, fmt['alanlar'])
        if eslesen:
            adaylar.append((eslesen[0], alan, eslesen[1]))
    if not adaylar:
        cap = _VARSAYILAN_CAP
        return {
            'x0_mm': float(_VARSAYILAN_X0),
            'y0_mm': float(_VARSAYILAN_Y0),
            'aralik_x_mm': float(_VARSAYILAN_ARALIK),
            'aralik_y_mm': float(_VARSAYILAN_ARALIK),
            'cap_mm': float(cap),
            'isaret_cap_mm': float((cap * Decimal('0.68')).quantize(Decimal('0.01'))),
            'bagli': '',
            'uyari': (
                'Formda bağlanacak ölçülü bir alan yok. '
                'Izgara sol üstten 12 mm ve 18 mm içeriye kondu; ok tuşlarıyla bir kez oturtun.'
            ),
        }
    adaylar.sort(key=lambda item: item[0], reverse=True)
    _, alan, fmt_alan = adaylar[0]
    ax = Decimal(str(alan['aralik_x_mm']))
    ay = Decimal(str(alan['aralik_y_mm']))
    cap = _ondalik(alan.get('cap_mm') or _VARSAYILAN_CAP, '0.01')
    isaret = alan.get('isaret_cap_mm')
    if isaret in (None, ''):
        isaret = (cap * Decimal('0.68')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    x0 = Decimal(str(alan['x_mm'])) - (Decimal(fmt_alan['sutun_bas']) - 1) * ax
    y0 = Decimal(str(alan['y_mm'])) - (Decimal(fmt_alan['satir_bas']) - 1) * ay
    return {
        'x0_mm': _float(x0),
        'y0_mm': _float(y0),
        'aralik_x_mm': _float(ax),
        'aralik_y_mm': _float(ay),
        'cap_mm': float(cap),
        'isaret_cap_mm': _float(isaret, '0.01'),
        'bagli': fmt_alan['ad'],
        'uyari': '',
        '_kaynak_alan': alan,
        '_kaynak_fmt': fmt_alan,
    }


def _yon(fmt_alan: dict) -> str:
    rows = fmt_alan['satir_son'] - fmt_alan['satir_bas'] + 1
    cols = fmt_alan['sutun_son'] - fmt_alan['sutun_bas'] + 1
    length = len(fmt_alan['karakter'])
    if rows == length and cols != length:
        return YON_SUTUN
    if cols == length and rows != length:
        return YON_SATIR
    if rows == 1 and cols == 1:
        return YON_SUTUN
    if rows == length and cols == length:
        return YON_SATIR
    return YON_SUTUN if cols >= rows else YON_SATIR


def _tur(fmt_alan: dict, yon: str, rows: int, cols: int) -> tuple[str, str]:
    key = _katla(fmt_alan['ad'])
    karakter = fmt_alan['karakter']
    harfler = [ch for ch in karakter if ch != ' ']
    if 'ADISOYAD' in key:
        return TUR_DAIRE, 'ad_soyad'
    if key.startswith('TC'):
        return TUR_TC, 'tc'
    if 'OGRENCI' in key:
        return TUR_OGRENCI_NO, 'ogrenci_no'
    if 'KITAPCIK' in key:
        return TUR_KITAPCIK, 'kitapcik'
    if key == 'SUBE' or key.startswith('SUBE'):
        return TUR_DAIRE, 'sube'
    if 'OTURUM' in key and rows * cols <= 4:
        return TUR_TEK, 'oturum'
    if key.startswith('SINIF'):
        return TUR_DAIRE, 'sinif'
    if ' ' in karakter:
        return TUR_DAIRE, ''
    if harfler and set(harfler) <= set('ABCDE') and len(harfler) >= 2:
        n_char = cols if yon == YON_SUTUN else rows
        n_sym = rows if yon == YON_SUTUN else cols
        if n_char > 1 and n_sym == len(harfler):
            return TUR_CEVAP, ''
        if n_char == 1:
            return TUR_TEK, ''
    if harfler and set(harfler) <= set('0123456789'):
        n_sym = rows if yon == YON_SUTUN else cols
        if n_sym == 10 and karakter == '0123456789':
            return TUR_SAYISAL, ''
        if rows == 1 and cols == 1:
            return TUR_TEK, ''
    if rows == 1 and cols == 1:
        return TUR_TEK, ''
    return TUR_DAIRE, ''


def _etiketler(fmt_alan: dict, tur: str) -> list[str]:
    karakter = fmt_alan['karakter']
    if tur in (TUR_TC, TUR_OGRENCI_NO, TUR_SAYISAL) and karakter == '0123456789':
        return list(RAKAMLAR)
    if tur == TUR_DAIRE and (fmt_alan.get('_veri') == 'ad_soyad') and karakter == ''.join(HARFLER):
        return list(HARFLER)
    return [_BOS if ch == ' ' else ch for ch in karakter]


def _kutu(belge: dict | None, veri: str, y_mm: float, cap: float) -> dict | None:
    if not veri:
        return None
    for alan in (belge or {}).get('alanlar') or []:
        kutu = alan.get('metin_kutusu')
        if (
            alan.get('veri_kaynagi') == veri
            and isinstance(kutu, dict)
            and kutu.get('aktif')
        ):
            return kutu
    if veri != 'ad_soyad':
        return None
    if y_mm - cap / 2 - 0.4 - 5 < 0:
        return None
    return {
        'aktif': True,
        'yon': 'ust',
        'olcu_mm': 5,
        'bosluk_mm': 0.4,
        'punto': 8,
        'hizalama': 'orta',
        'karakter_araligi': 0,
        'veri_kaynagi': 'ad_soyad',
        'sabit_deger': '',
    }


def alanlari_kur(fmt: dict, izgara: dict, belge: dict | None = None) -> list[dict]:
    x0 = Decimal(str(izgara['x0_mm']))
    y0 = Decimal(str(izgara['y0_mm']))
    ax = Decimal(str(izgara['aralik_x_mm']))
    ay = Decimal(str(izgara['aralik_y_mm']))
    cap = float(izgara['cap_mm'])
    isaret = float(izgara['isaret_cap_mm'])
    kaynak_alan = izgara.get('_kaynak_alan') or {}
    kaynak_fmt = izgara.get('_kaynak_fmt') or {}
    alanlar = []
    next_soru_no = 1
    for fmt_alan in fmt['alanlar']:
        rows = fmt_alan['satir_son'] - fmt_alan['satir_bas'] + 1
        cols = fmt_alan['sutun_son'] - fmt_alan['sutun_bas'] + 1
        yon = _yon(fmt_alan)
        tur, veri = _tur(fmt_alan, yon, rows, cols)
        if (
            kaynak_alan
            and fmt_alan['satir_bas'] == kaynak_fmt.get('satir_bas')
            and fmt_alan['sutun_bas'] == kaynak_fmt.get('sutun_bas')
            and fmt_alan['ad'] == kaynak_fmt.get('ad')
        ):
            x_mm = _float(kaynak_alan['x_mm'], '0.01')
            y_mm = _float(kaynak_alan['y_mm'], '0.01')
        else:
            x_mm = _float(x0 + (Decimal(fmt_alan['sutun_bas']) - 1) * ax, '0.01')
            y_mm = _float(y0 + (Decimal(fmt_alan['satir_bas']) - 1) * ay, '0.01')
        fmt_alan = {**fmt_alan, '_veri': veri}
        etiket = _etiketler(fmt_alan, tur)
        karakter = cols if yon == YON_SUTUN else rows
        cevap = None
        if tur == TUR_CEVAP:
            secenekler = [ch for ch in fmt_alan['karakter'] if ch != ' ']
            cevap = {
                'bolum_id': fmt_alan['ad'][:40],
                'soru_baslangic': next_soru_no,
                'soru_sayisi': karakter,
                'secenekler': secenekler,
                'fiziksel_sira': [],
                'coklu_isaret': False,
            }
            next_soru_no += karakter
            etiket = secenekler
        alanlar.append({
            'id': uuid.uuid4().hex[:12],
            'ad': fmt_alan['ad'],
            'tur': tur,
            'veri_kaynagi': veri,
            'sabit_deger': '',
            'aktif': True,
            'x_mm': x_mm,
            'y_mm': y_mm,
            'satir': rows,
            'sutun': cols,
            'cap_mm': cap,
            'isaret_cap_mm': isaret,
            'aralik_x_mm': float(izgara['aralik_x_mm']),
            'aralik_y_mm': float(izgara['aralik_y_mm']),
            'kodlama_yonu': yon,
            'kod_hizasi': 'sol',
            'etiketler': etiket,
            'punto': 8,
            'hizalama': 'sol',
            'genislik_mm': 40,
            'yukseklik_mm': 6,
            'karakter_araligi': 0,
            'sayfa_no': 1,
            'cevap_bloku': cevap,
            'metin_kutusu': _kutu(belge, veri, y_mm, cap),
        })
    return alanlar


def fmt_uygula(
    raw: bytes | str,
    dosya: str,
    belge: dict | None,
    page_w: float,
    page_h: float,
    kenar: dict | None = None,
) -> dict:
    """Alanları kurar ve doğrular. Şablonu kaydetmez."""
    fmt = fmt_oku(raw)
    secilen, atlanan = _tekil(fmt['alanlar'])
    fmt = {**fmt, 'alanlar': secilen}
    izgara = izgara_bagla(fmt, belge, kenar)
    alanlar = alanlari_kur(fmt, izgara, belge)
    taslak = dict(belge or {})
    taslak['surum'] = SURUM
    taslak['alanlar'] = alanlar
    taslak['fmt'] = {
        'dosya': (dosya or '')[:120],
        'satir': fmt['satir'],
        'sutun': fmt['sutun'],
        'x0_mm': izgara['x0_mm'],
        'y0_mm': izgara['y0_mm'],
        'aralik_x_mm': izgara['aralik_x_mm'],
        'aralik_y_mm': izgara['aralik_y_mm'],
        'cap_mm': izgara['cap_mm'],
        'bagli': izgara['bagli'],
        'metin': fmt['metin'],
    }
    temiz, _uyarilar = belge_dogrula(taslak, page_w, page_h)
    ozet = [
        {
            'ad': alan['ad'],
            'tur': alan['tur'],
            'satir': alan['satir'],
            'sutun': alan['sutun'],
            'x_mm': alan['x_mm'],
            'y_mm': alan['y_mm'],
            'kodlama_yonu': alan['kodlama_yonu'],
        }
        for alan in temiz['alanlar']
    ]
    return {
        'dosya': (dosya or '')[:120],
        'satir': fmt['satir'],
        'sutun': fmt['sutun'],
        'fmt': temiz['fmt'],
        'alanlar': temiz['alanlar'],
        'ozet': ozet,
        'atlanan': atlanan,
        'uyari': izgara['uyari'],
    }
