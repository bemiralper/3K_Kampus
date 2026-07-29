"""
Google Takvim — Türkiye'deki Tatiller (herkese açık ICS).

Kaynak: tr.turkish#holiday@group.v.calendar.google.com
API anahtarı gerekmez. Sadece DESCRIPTION içinde "Resmi tatil" olanlar alınır
(Kutlama günleri atlanır).
"""
from __future__ import annotations

import logging
import re
import ssl
import urllib.error
import urllib.request
from datetime import date, timedelta
from typing import Optional

from django.core.cache import cache

from apps.takvim.data.resmi_tatiller_tr import ResmiTatil

logger = logging.getLogger(__name__)

GOOGLE_TR_HOLIDAYS_ICS = (
    'https://calendar.google.com/calendar/ical/'
    'tr.turkish%23holiday%40group.v.calendar.google.com/public/basic.ics'
)

CACHE_KEY = 'takvim:google_tr_holidays_ics_v1'
CACHE_TTL = 60 * 60 * 12  # 12 saat


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _fetch_ics_http() -> str:
    req = urllib.request.Request(
        GOOGLE_TR_HOLIDAYS_ICS,
        headers={'User-Agent': '3K-Kampus-LMS/1.0 (resmi-tatil-sync)'},
    )
    try:
        with urllib.request.urlopen(req, timeout=25, context=_ssl_context()) as resp:
            return resp.read().decode('utf-8', errors='replace')
    except Exception as primary_err:
        # Bazı ortamlarda SSL zinciri eksik; curl genelde çalışır
        try:
            import subprocess

            result = subprocess.run(
                ['curl', '-sL', '-A', '3K-Kampus-LMS/1.0', GOOGLE_TR_HOLIDAYS_ICS],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            if result.returncode == 0 and result.stdout:
                return result.stdout
        except Exception:
            pass
        raise primary_err


def fetch_ics(force: bool = False) -> str:
    if not force:
        cached = cache.get(CACHE_KEY)
        if cached:
            return cached

    raw = _fetch_ics_http()
    if 'BEGIN:VCALENDAR' not in raw:
        raise ValueError('Google tatil ICS geçersiz yanıt')

    cache.set(CACHE_KEY, raw, CACHE_TTL)
    return raw


def _unfold(ics: str) -> str:
    return re.sub(r'\r?\n[ \t]', '', ics)


def _unescape(value: str) -> str:
    return (
        value.replace('\\n', ' ')
        .replace('\\,', ',')
        .replace('\\;', ';')
        .replace('\\\\', '\\')
        .strip()
    )


def _parse_date(token: str) -> Optional[date]:
    token = token.strip()
    if len(token) >= 8 and token[:8].isdigit():
        y, m, d = int(token[0:4]), int(token[4:6]), int(token[6:8])
        return date(y, m, d)
    return None


def parse_official_holidays(ics: str) -> list[ResmiTatil]:
    """ICS → günlük ResmiTatil listesi (yalnızca resmi tatiller)."""
    text = _unfold(ics)
    days: list[tuple[date, str]] = []

    for block in re.findall(r'BEGIN:VEVENT(.*?)END:VEVENT', text, flags=re.S):
        def field(name: str) -> str:
            m = re.search(rf'^{name}[^:]*:(.+)$', block, flags=re.M)
            return _unescape(m.group(1)) if m else ''

        desc = field('DESCRIPTION').lower()
        if 'resmi tatil' not in desc:
            continue

        start = _parse_date(field('DTSTART'))
        end_raw = field('DTEND')
        end_excl = _parse_date(end_raw) if end_raw else None
        if not start:
            continue
        end = (end_excl - timedelta(days=1)) if end_excl else start
        if end < start:
            end = start

        title = field('SUMMARY') or 'Resmi tatil'
        cur = start
        while cur <= end:
            days.append((cur, title))
            cur += timedelta(days=1)

    # Aynı güne birden fazla event gelirse ilkini tut
    by_day: dict[date, str] = {}
    for d, title in sorted(days, key=lambda x: x[0]):
        by_day.setdefault(d, title)

    return [
        ResmiTatil(
            key=f'TR-{d.isoformat()}',
            year=d.year,
            start=d,
            end=d,
            title=title,
        )
        for d, title in sorted(by_day.items())
    ]


def holidays_from_google(year: Optional[int] = None, *, force: bool = False) -> list[ResmiTatil]:
    try:
        ics = fetch_ics(force=force)
        items = parse_official_holidays(ics)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, OSError) as exc:
        logger.warning('Google tatil ICS alınamadı: %s', exc)
        return []

    if year is not None:
        items = [h for h in items if h.year == year]
    return items


def available_years_from_google(*, force: bool = False) -> list[int]:
    items = holidays_from_google(force=force)
    return sorted({h.year for h in items})
