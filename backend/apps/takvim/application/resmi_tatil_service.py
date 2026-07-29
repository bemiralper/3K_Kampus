"""Türkiye resmi tatillerini kurum takvimine senkronize eder."""
from __future__ import annotations

from datetime import datetime, time
from typing import Optional
from zoneinfo import ZoneInfo

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.takvim.application.integration_service import CalendarIntegrationService, KaynakModul
from apps.takvim.data.resmi_tatiller_tr import available_years, holidays_for_year
from apps.takvim.domain.enums import EventCategory, EventStatus
from apps.takvim.domain.models import Event

TZ = ZoneInfo('Europe/Istanbul')
SYNC_CACHE_TTL = 60 * 60 * 24  # 24 saat


def _sync_cache_key(kurum_id: int) -> str:
    return f'takvim:resmi_tatil_sync:{kurum_id}'


class ResmiTatilSyncService:
    def __init__(self):
        self.integration = CalendarIntegrationService()

    def mark_synced(self, kurum_id: int) -> None:
        cache.set(
            _sync_cache_key(kurum_id),
            timezone.now().isoformat(),
            SYNC_CACHE_TTL,
        )

    def last_synced_at(self, kurum_id: int) -> Optional[str]:
        val = cache.get(_sync_cache_key(kurum_id))
        return str(val) if val else None

    def ensure_synced(
        self,
        kurum_id: int,
        *,
        year: Optional[int] = None,
        user_id: Optional[int] = None,
        force: bool = False,
    ) -> dict:
        """24s dolmadıysa no-op; aksi halde Google → Event sync."""
        if not force and self.last_synced_at(kurum_id):
            return {
                'skipped': True,
                'reason': 'fresh',
                'last_synced_at': self.last_synced_at(kurum_id),
                'created': 0,
                'updated': 0,
                'restored': 0,
            }
        result = self.sync_kurum(kurum_id, year=year, user_id=user_id)
        self.mark_synced(kurum_id)
        result['skipped'] = False
        return result

    def _day_bounds(self, start_d, end_d) -> tuple[datetime, datetime]:
        start_dt = datetime.combine(start_d, time.min, tzinfo=TZ)
        end_dt = datetime.combine(end_d, time(23, 59, 59), tzinfo=TZ)
        return start_dt, end_dt

    def _find_any(self, kurum_id: int, kaynak_id: str) -> Optional[Event]:
        return (
            Event.objects.filter(
                kurum_id=kurum_id,
                kaynak_modul=KaynakModul.RESMI_TATIL,
                kaynak_id=str(kaynak_id),
            )
            .order_by('-updated_at')
            .first()
        )

    @transaction.atomic
    def sync_kurum(
        self,
        kurum_id: int,
        *,
        year: Optional[int] = None,
        user_id: Optional[int] = None,
    ) -> dict:
        # Senkron sırasında Google ICS'i taze çek
        years = [year] if year else available_years()
        created = 0
        updated = 0
        restored = 0
        source = 'fallback'

        event_type = self.integration._resolve_event_type(kurum_id, EventCategory.TATIL)
        if not event_type:
            return {
                'created': 0,
                'updated': 0,
                'restored': 0,
                'years': years,
                'source': source,
                'error': 'TATIL türü yok',
            }

        uid = user_id or 0
        for y in years:
            catalog = holidays_for_year(y, force_refresh=True)
            if catalog and catalog[0].key.startswith('TR-') and len(catalog[0].key) == 13:
                source = 'google'
            for h in catalog:
                baslangic, bitis = self._day_bounds(h.start, h.end)
                existing = self._find_any(kurum_id, h.key)
                data = {
                    'event_type_id': event_type.id,
                    'baslik': h.title,
                    'aciklama': f'Resmi tatil — Google Takvim ({h.key})',
                    'baslangic': baslangic,
                    'bitis': bitis,
                    'tum_gun': True,
                    'kaynak_modul': KaynakModul.RESMI_TATIL,
                    'kaynak_id': h.key,
                    'sube_id': None,
                    'renk': '#6B7280',
                }
                if existing:
                    was_deleted = existing.is_deleted
                    data['updated_by'] = uid
                    data['is_deleted'] = False
                    data['deleted_at'] = None
                    data['durum'] = EventStatus.SCHEDULED
                    self.integration.repo.update(existing, data)
                    if was_deleted:
                        restored += 1
                    else:
                        updated += 1
                else:
                    data['kurum_id'] = kurum_id
                    data['created_by'] = uid
                    data['durum'] = EventStatus.SCHEDULED
                    self.integration.repo.create(data)
                    created += 1

        result = {
            'created': created,
            'updated': updated,
            'restored': restored,
            'years': years,
            'source': source,
            'synced_at': timezone.now().isoformat(),
        }
        self.mark_synced(kurum_id)
        return result
