"""
Türkiye resmi tatil kataloğu.

Birincil kaynak: Google Takvim "Türkiye'deki Tatiller" (ICS).
Yedek: kod içi sabit günler + bilinen dini bayram tarihleri (2025–2027).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable, Optional


@dataclass(frozen=True)
class ResmiTatil:
    key: str
    year: int
    start: date
    end: date  # inclusive
    title: str

    def iter_days(self) -> Iterable[date]:
        cur = self.start
        while cur <= self.end:
            yield cur
            cur += timedelta(days=1)


def _fixed(year: int) -> list[ResmiTatil]:
    return [
        ResmiTatil(f'TR-{year}-01-01', year, date(year, 1, 1), date(year, 1, 1), 'Yılbaşı'),
        ResmiTatil(f'TR-{year}-04-23', year, date(year, 4, 23), date(year, 4, 23), 'Ulusal Egemenlik ve Çocuk Bayramı'),
        ResmiTatil(f'TR-{year}-05-01', year, date(year, 5, 1), date(year, 5, 1), 'Emek ve Dayanışma Günü'),
        ResmiTatil(f'TR-{year}-05-19', year, date(year, 5, 19), date(year, 5, 19), 'Atatürk’ü Anma, Gençlik ve Spor Bayramı'),
        ResmiTatil(f'TR-{year}-07-15', year, date(year, 7, 15), date(year, 7, 15), 'Demokrasi ve Millî Birlik Günü'),
        ResmiTatil(f'TR-{year}-08-30', year, date(year, 8, 30), date(year, 8, 30), 'Zafer Bayramı'),
        ResmiTatil(f'TR-{year}-10-29', year, date(year, 10, 29), date(year, 10, 29), 'Cumhuriyet Bayramı'),
    ]


# Yedek dini bayramlar (Google erişilemezse)
_RELIGIOUS: dict[int, list[tuple[str, date, date, str]]] = {
    2025: [
        ('RAMAZAN', date(2025, 3, 30), date(2025, 4, 1), 'Ramazan Bayramı'),
        ('KURBAN', date(2025, 6, 6), date(2025, 6, 9), 'Kurban Bayramı'),
    ],
    2026: [
        ('RAMAZAN', date(2026, 3, 20), date(2026, 3, 22), 'Ramazan Bayramı'),
        ('KURBAN', date(2026, 5, 27), date(2026, 5, 30), 'Kurban Bayramı'),
    ],
    2027: [
        ('RAMAZAN', date(2027, 3, 9), date(2027, 3, 11), 'Ramazan Bayramı'),
        ('KURBAN', date(2027, 5, 16), date(2027, 5, 19), 'Kurban Bayramı'),
    ],
}


def _fallback_for_year(year: int) -> list[ResmiTatil]:
    items = list(_fixed(year))
    for code, start, end, title in _RELIGIOUS.get(year, []):
        items.append(ResmiTatil(f'TR-{year}-{code}', year, start, end, title))
    items.sort(key=lambda h: h.start)
    return items


def holidays_for_year(year: int, *, force_refresh: bool = False) -> list[ResmiTatil]:
    try:
        from apps.takvim.application.google_holiday_fetch import holidays_from_google

        remote = holidays_from_google(year, force=force_refresh)
        if remote:
            return remote
    except Exception:
        pass
    return _fallback_for_year(year)


def holidays_in_range(start: date, end: date) -> list[ResmiTatil]:
    if end < start:
        return []
    out: list[ResmiTatil] = []
    for y in range(start.year, end.year + 1):
        for h in holidays_for_year(y):
            if h.end < start or h.start > end:
                continue
            out.append(h)
    return out


def get_holiday(key: str) -> Optional[ResmiTatil]:
    key = (key or '').strip()
    # Google gün anahtarı: TR-YYYY-MM-DD
    if key.startswith('TR-') and len(key) == 13 and key[7] == '-' and key[10] == '-':
        try:
            d = date.fromisoformat(key[3:])
        except ValueError:
            return None
        for h in holidays_for_year(d.year):
            if h.key == key or (h.start <= d <= h.end):
                if h.key == key:
                    return h
                return ResmiTatil(key=key, year=d.year, start=d, end=d, title=h.title)
        return ResmiTatil(key=key, year=d.year, start=d, end=d, title='Resmi tatil')

    try:
        year = int(key.split('-')[1])
    except (IndexError, ValueError):
        return None
    for h in holidays_for_year(year):
        if h.key == key:
            return h
    for h in _fallback_for_year(year):
        if h.key == key:
            return h
    return None


def available_years() -> list[int]:
    """Google yılları + yedek katalog + içinde bulunduğumuz ve sonraki yıl."""
    years: set[int] = set(_RELIGIOUS.keys())
    today = date.today()
    years.add(today.year)
    years.add(today.year + 1)
    try:
        from apps.takvim.application.google_holiday_fetch import available_years_from_google

        years.update(available_years_from_google() or [])
    except Exception:
        pass
    return sorted(years)


# Geriye dönük uyumluluk
AVAILABLE_YEARS = sorted(_RELIGIOUS.keys())
