"""Şube ders programı JSON — v1 (periyot bazlı) ve v2 (gün bazlı) dönüşüm/okuma."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

PERIOD_CODES = ('MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM')
DAY_KEYS = tuple(str(i) for i in range(7))


def is_v2_ders_saatleri(data: dict | None) -> bool:
    if not data or not isinstance(data, dict):
        return False
    keys = set(data.keys())
    if keys & set(PERIOD_CODES):
        return False
    return bool(keys & set(DAY_KEYS))


def empty_period_block() -> dict:
    return {'ders_sayisi': 0, 'ders_suresi_dk': 40, 'dersler': [], 'molalar': []}


def empty_day_schedule() -> dict:
    return {code: empty_period_block() for code in ('MORNING', 'AFTERNOON', 'EVENING')}


def default_gun_bazli_aktiflik() -> dict:
    result = {}
    for i in range(7):
        aktif = i < 6
        result[str(i)] = {
            'aktif': aktif,
            'periyotlar': ['MORNING', 'AFTERNOON', 'EVENING'] if aktif else [],
        }
    return result


def migrate_v1_to_v2(v1: dict, gun_bazli: dict | None = None) -> dict:
    """Eski periyot-bazlı yapıyı 7 güne kopyalar (gun_bazli_aktiflik'e göre)."""
    gun_bazli = gun_bazli or default_gun_bazli_aktiflik()
    v2: dict[str, dict] = {}
    for day_key in DAY_KEYS:
        day_info = gun_bazli.get(day_key, {'aktif': False, 'periyotlar': []})
        if not day_info.get('aktif'):
            v2[day_key] = empty_day_schedule()
            continue
        day_schedule = empty_day_schedule()
        for code in ('MORNING', 'AFTERNOON', 'EVENING'):
            if code in day_info.get('periyotlar', []):
                src = v1.get(code) or {}
                day_schedule[code] = _normalize_period_block(src)
        v2[day_key] = day_schedule
    return v2


def normalize_ders_saatleri(data: dict | None, gun_bazli: dict | None = None) -> dict:
    if not data:
        return {k: empty_day_schedule() for k in DAY_KEYS}
    if is_v2_ders_saatleri(data):
        return _normalize_v2(data)
    return migrate_v1_to_v2(data, gun_bazli)


def _normalize_v2(data: dict) -> dict:
    result: dict[str, dict] = {}
    for day_key in DAY_KEYS:
        day_raw = data.get(day_key) or {}
        day_schedule = empty_day_schedule()
        for code in ('MORNING', 'AFTERNOON', 'EVENING'):
            day_schedule[code] = _normalize_period_block(day_raw.get(code) or {})
        result[day_key] = day_schedule
    return result


def _normalize_period_block(raw: dict) -> dict:
    dersler = raw.get('dersler') or []
    normalized = []
    for idx, d in enumerate(dersler):
        if not d.get('baslangic') or not d.get('bitis'):
            continue
        normalized.append({
            'ders_no': idx + 1,
            'baslangic': str(d['baslangic'])[:5],
            'bitis': str(d['bitis'])[:5],
        })
    return {
        'ders_sayisi': len(normalized),
        'ders_suresi_dk': int(raw.get('ders_suresi_dk') or 40),
        'dersler': normalized,
        'molalar': raw.get('molalar') or [],
    }


def derive_gun_bazli_aktiflik(gunluk: dict) -> dict:
    result: dict[str, dict] = {}
    for day_key in DAY_KEYS:
        day = gunluk.get(day_key) or empty_day_schedule()
        periyotlar = []
        for code in ('MORNING', 'AFTERNOON', 'EVENING'):
            block = day.get(code) or {}
            if block.get('dersler'):
                periyotlar.append(code)
        result[day_key] = {'aktif': bool(periyotlar), 'periyotlar': periyotlar}
    return result


def get_period_for_day(gunluk: dict, gun: int, period_code: str) -> dict:
    """gun: 0=Pazartesi (Python weekday)."""
    day_key = str(int(gun) % 7)
    day = gunluk.get(day_key) or empty_day_schedule()
    return day.get(period_code) or empty_period_block()


def validate_gunluk_ders_saatleri(gunluk: dict) -> None:
    if not gunluk:
        raise ValueError('En az bir gün için çalışma saati tanımlanmalıdır')

    has_any = False
    for day_key in DAY_KEYS:
        if day_key not in gunluk and day_key not in (None,):
            continue
        day = gunluk.get(day_key) or {}
        for period_code, period_data in day.items():
            if period_code not in PERIOD_CODES:
                raise ValueError(f'Geçersiz periyot kodu: {period_code}')
            dersler = (period_data or {}).get('dersler') or []
            for i, ders in enumerate(dersler):
                if not ders.get('baslangic') or not ders.get('bitis'):
                    raise ValueError(f'Gün {day_key} {period_code}: {i + 1}. periyot saati eksik')
                if ders['bitis'] <= ders['baslangic']:
                    raise ValueError(
                        f'Gün {day_key} {period_code}: {ders.get("ders_no", i + 1)}. periyot bitiş saati '
                        f'başlangıçtan sonra olmalıdır'
                    )
            if dersler:
                has_any = True

    if not has_any:
        raise ValueError('En az bir gün/periyot için çalışma saati girilmelidir')
