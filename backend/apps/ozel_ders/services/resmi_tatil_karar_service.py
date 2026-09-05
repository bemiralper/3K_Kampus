"""Resmi tatil listesi + özel ders tatil/devam kararı."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from django.db.models import Q

from apps.ozel_ders.domain.models import OzelDersTatilKarari
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services import tatil_etkilenen_service
from apps.takvim.application.integration_service import KaynakModul
from apps.takvim.application.resmi_tatil_service import ResmiTatilSyncService
from apps.takvim.data.resmi_tatiller_tr import available_years, get_holiday, holidays_for_year
from apps.takvim.domain.models import Event


def list_resmi_tatiller_for_year(
    *,
    kurum_id: int,
    sube_id: Optional[int],
    year: int,
) -> dict:
    catalog = holidays_for_year(year)
    source = 'google' if catalog and len(catalog[0].key) == 13 else 'fallback'

    synced_keys = set(
        Event.objects.filter(
            kurum_id=kurum_id,
            kaynak_modul=KaynakModul.RESMI_TATIL,
            is_deleted=False,
            kaynak_id__startswith=f'TR-{year}-',
        ).values_list('kaynak_id', flat=True)
    )

    karar_qs = OzelDersTatilKarari.objects.filter(
        kurum_id=kurum_id,
        tarih__year=year,
    )
    if sube_id:
        karar_qs = karar_qs.filter(Q(sube_id=sube_id) | Q(sube_id__isnull=True))
    else:
        karar_qs = karar_qs.filter(sube_id__isnull=True)

    karar_map: dict[tuple[str, str], bool] = {}
    karar_by_date: dict[str, bool] = {}
    for k in karar_qs:
        karar_map[(k.holiday_key, k.tarih.isoformat())] = bool(k.ozel_ders_aktif)
        karar_by_date[k.tarih.isoformat()] = bool(k.ozel_ders_aktif)

    affected = tatil_etkilenen_service.counts_by_date(
        kurum_id=kurum_id,
        sube_id=sube_id,
        year=year,
    )
    cevre_dates = tatil_etkilenen_service.cevre_aktif_dates(kurum_id=kurum_id, year=year)

    days: list[dict] = []
    resmi_dates: set[str] = set()
    for h in catalog:
        for d in h.iter_days():
            day_iso = d.isoformat()
            resmi_dates.add(day_iso)
            holiday_key = h.key if h.start == h.end else f'TR-{day_iso}'
            if (holiday_key, day_iso) in karar_map:
                ozel_aktif = karar_map[(holiday_key, day_iso)]
            elif (h.key, day_iso) in karar_map:
                ozel_aktif = karar_map[(h.key, day_iso)]
            else:
                ozel_aktif = karar_by_date.get(day_iso, False)
            prev_d = d - timedelta(days=1)
            next_d = d + timedelta(days=1)
            days.append({
                'date': day_iso,
                'title': h.title,
                'holiday_key': holiday_key,
                'year': year,
                'synced': holiday_key in synced_keys or h.key in synced_keys,
                'ozel_ders_aktif': bool(ozel_aktif),
                'mode': 'devam' if ozel_aktif else 'tatil',
                'source': 'resmi',
                'affected_count': affected.get(day_iso, 0),
                'cevre_prev': prev_d in cevre_dates,
                'cevre_next': next_d in cevre_dates,
            })

    # Aktif çevre günleri (katalogda yoksa ayrı satır)
    for cd in sorted(cevre_dates):
        day_iso = cd.isoformat()
        if day_iso in resmi_dates:
            continue
        days.append({
            'date': day_iso,
            'title': 'Özel ders çevre tatili',
            'holiday_key': f'CEVRE-{day_iso}',
            'year': year,
            'synced': True,
            'ozel_ders_aktif': False,
            'mode': 'tatil',
            'source': 'cevre',
            'affected_count': affected.get(day_iso, 0),
            'cevre_prev': False,
            'cevre_next': False,
        })

    days.sort(key=lambda r: r['date'])

    years = available_years()
    if year not in years:
        years = sorted(set(years) | {year})

    return {
        'year': year,
        'years': [year],
        'available_years': years,
        'synced_count': len(synced_keys),
        'source': source,
        'days': days,
    }


def list_resmi_tatiller_for_years(
    *,
    kurum_id: int,
    sube_id: Optional[int],
    years: list[int],
) -> dict:
    years = sorted({int(y) for y in years})
    if not years:
        years = available_years()
    days: list[dict] = []
    synced = 0
    source = 'fallback'
    available = available_years()
    for y in years:
        part = list_resmi_tatiller_for_year(
            kurum_id=kurum_id, sube_id=sube_id, year=y,
        )
        days.extend(part.get('days') or [])
        synced += int(part.get('synced_count') or 0)
        source = part.get('source') or source
        if part.get('available_years'):
            available = sorted(set(available) | set(part['available_years']))
    days.sort(key=lambda r: r['date'])
    return {
        'year': years[0] if len(years) == 1 else 0,
        'years': years,
        'available_years': available,
        'synced_count': synced,
        'source': source,
        'days': days,
    }


def sync_resmi_tatiller(
    *,
    kurum_id: int,
    year: Optional[int] = None,
    user_id: Optional[int] = None,
) -> dict:
    return ResmiTatilSyncService().sync_kurum(kurum_id, year=year, user_id=user_id)


def set_karar(
    *,
    kurum_id: int,
    sube_id: Optional[int],
    holiday_key: str,
    day: date | str,
    ozel_ders_aktif: bool,
) -> dict:
    if isinstance(day, str):
        day = date.fromisoformat(day[:10])

    h = get_holiday(holiday_key)
    if not h:
        raise OzelDersError('Geçersiz resmi tatil anahtarı.', 'holiday_key')
    if day < h.start or day > h.end:
        raise OzelDersError('Tarih bu tatil aralığında değil.', 'date_range')

    obj, _ = OzelDersTatilKarari.objects.update_or_create(
        kurum_id=kurum_id,
        sube_id=sube_id,
        holiday_key=holiday_key,
        tarih=day,
        defaults={'ozel_ders_aktif': bool(ozel_ders_aktif)},
    )
    return {
        'date': obj.tarih.isoformat(),
        'holiday_key': obj.holiday_key,
        'title': h.title,
        'ozel_ders_aktif': obj.ozel_ders_aktif,
        'mode': 'devam' if obj.ozel_ders_aktif else 'tatil',
    }
