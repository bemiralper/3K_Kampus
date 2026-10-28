from __future__ import annotations

import re
from typing import Any, Optional

from django.db import transaction

from apps.ozel_ders.domain.models import (
    BirebirOgrenciProgrami,
    ProgramDurumu,
)
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.scope_guard import ensure_ogrenci, ensure_paketler

_TIME_RE = re.compile(r'^\d{2}:\d{2}$')


def _clamp_int(value: Any, *, default: int, min_v: int, max_v: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return max(min_v, min(max_v, n))


def _normalize_zaman_baslangic(value: Any, default: str = '09:00') -> str:
    raw = str(value or '').strip()[:5]
    if _TIME_RE.match(raw):
        return raw
    return default


def _guncel_slot_dersleri(program_ids: list[int]) -> dict[int, dict[str, int]]:
    """Program → {ders_id: süresi dolmamış aktif slot sayısı}."""
    from django.db.models import Count, Q
    from django.utils import timezone

    from apps.ozel_ders.domain.models import BirebirHaftalikSlot

    if not program_ids:
        return {}
    today = timezone.localdate()
    rows = (
        BirebirHaftalikSlot.objects.filter(program_id__in=program_ids, aktif=True)
        .filter(Q(bitis_tarihi__isnull=True) | Q(bitis_tarihi__gte=today))
        .values('program_id', 'ders_id')
        .annotate(n=Count('id'))
    )
    out: dict[int, dict[str, int]] = {}
    for r in rows:
        out.setdefault(r['program_id'], {})[str(r['ders_id'])] = r['n']
    return out


def serialize_program(
    p: BirebirOgrenciProgrami,
    guncel_slot_dersleri: Optional[dict[str, int]] = None,
) -> dict:
    from apps.ozel_ders.services.sync_service import resolve_paket_dersleri

    if guncel_slot_dersleri is None:
        guncel_slot_dersleri = _guncel_slot_dersleri([p.id]).get(p.id, {})

    ogrenci = p.ogrenci
    ad = ''
    if hasattr(ogrenci, 'tam_ad'):
        ad = ogrenci.tam_ad
    elif hasattr(ogrenci, 'ad'):
        ad = f'{getattr(ogrenci, "ad", "")} {getattr(ogrenci, "soyad", "")}'.strip()
    return {
        'id': p.id,
        'kurum': p.kurum_id,
        'sube': p.sube_id,
        'egitim_yili': p.egitim_yili_id,
        'term': p.term_id,
        'ogrenci': p.ogrenci_id,
        'ogrenci_ad': ad,
        'ogrenci_egitim_paketi': p.ogrenci_egitim_paketi_id,
        'premium_paket': p.premium_paket_id,
        'premium_paket_ad': p.premium_paket.ad if p.premium_paket_id else None,
        'ozel_ders_paket': p.ozel_ders_paket_id,
        'ozel_ders_paket_ad': p.ozel_ders_paket.ad if p.ozel_ders_paket_id else None,
        'baslangic_tarihi': p.baslangic_tarihi.isoformat(),
        'bitis_tarihi': p.bitis_tarihi.isoformat() if p.bitis_tarihi else None,
        'zaman_baslangic': p.zaman_baslangic or '09:00',
        'zaman_sure_dk': p.zaman_sure_dk or 50,
        'zaman_ara_dk': p.zaman_ara_dk if p.zaman_ara_dk is not None else 10,
        'zaman_ders_adet': p.zaman_ders_adet or 8,
        'durum': p.durum,
        'durum_display': p.get_durum_display(),
        'notlar': p.notlar,
        'slot_count': p.slots.filter(aktif=True).count(),
        'guncel_slot_dersleri': guncel_slot_dersleri,
        'paket_dersleri': resolve_paket_dersleri(p),
        'created_at': p.created_at.isoformat() if p.created_at else None,
        'updated_at': p.updated_at.isoformat() if p.updated_at else None,
    }


def list_programs(
    *,
    kurum_id: int,
    sube_id: int,
    egitim_yili_id: Optional[int] = None,
    ogrenci_id: Optional[int] = None,
    durum: Optional[str] = None,
) -> list[dict]:
    qs = BirebirOgrenciProgrami.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
    ).select_related('ogrenci', 'premium_paket', 'ozel_ders_paket')
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    if ogrenci_id:
        qs = qs.filter(ogrenci_id=ogrenci_id)
    if durum:
        qs = qs.filter(durum=durum)
    programs = list(qs)
    counts = _guncel_slot_dersleri([p.id for p in programs])
    return [serialize_program(p, counts.get(p.id, {})) for p in programs]


@transaction.atomic
def create_program(data: dict[str, Any], *, user=None) -> BirebirOgrenciProgrami:
    required = ['kurum_id', 'sube_id', 'egitim_yili_id', 'ogrenci_id', 'baslangic_tarihi']
    for key in required:
        if not data.get(key):
            raise OzelDersError(f'{key} zorunlu.', key)

    bitis = data.get('bitis_tarihi')
    if bitis and bitis < data['baslangic_tarihi']:
        raise OzelDersError('Bitiş tarihi başlangıçtan önce olamaz.', 'bitis_tarihi')
    durum = data.get('durum') or ProgramDurumu.AKTIF
    if durum not in ProgramDurumu.values:
        raise OzelDersError('Geçersiz program durumu.', 'durum')

    ogrenci_id = ensure_ogrenci(data['ogrenci_id'], kurum_id=data['kurum_id'])
    ensure_paketler(
        kurum_id=data['kurum_id'],
        ogrenci_id=ogrenci_id,
        ogrenci_egitim_paketi_id=data.get('ogrenci_egitim_paketi_id'),
        premium_paket_id=data.get('premium_paket_id'),
        ozel_ders_paket_id=data.get('ozel_ders_paket_id'),
    )

    return BirebirOgrenciProgrami.objects.create(
        kurum_id=data['kurum_id'],
        sube_id=data['sube_id'],
        egitim_yili_id=data['egitim_yili_id'],
        term_id=data.get('term_id'),
        ogrenci_id=ogrenci_id,
        ogrenci_egitim_paketi_id=data.get('ogrenci_egitim_paketi_id'),
        premium_paket_id=data.get('premium_paket_id'),
        ozel_ders_paket_id=data.get('ozel_ders_paket_id'),
        baslangic_tarihi=data['baslangic_tarihi'],
        bitis_tarihi=bitis,
        zaman_baslangic=_normalize_zaman_baslangic(data.get('zaman_baslangic')),
        zaman_sure_dk=_clamp_int(data.get('zaman_sure_dk'), default=50, min_v=15, max_v=180),
        zaman_ara_dk=_clamp_int(data.get('zaman_ara_dk'), default=10, min_v=0, max_v=60),
        zaman_ders_adet=_clamp_int(data.get('zaman_ders_adet'), default=8, min_v=1, max_v=16),
        durum=durum,
        notlar=data.get('notlar') or '',
        created_by=user if user and getattr(user, 'is_authenticated', False) else None,
    )


@transaction.atomic
def update_program(program_id: int, data: dict[str, Any], *, kurum_id: int, sube_id: int) -> BirebirOgrenciProgrami:
    try:
        p = BirebirOgrenciProgrami.objects.get(
            pk=program_id, kurum_id=kurum_id, sube_id=sube_id,
        )
    except BirebirOgrenciProgrami.DoesNotExist:
        raise OzelDersError('Program bulunamadı.', 'not_found', 404)

    ensure_paketler(
        kurum_id=kurum_id,
        ogrenci_id=p.ogrenci_id,
        ogrenci_egitim_paketi_id=data.get('ogrenci_egitim_paketi_id'),
        premium_paket_id=data.get('premium_paket_id'),
        ozel_ders_paket_id=data.get('ozel_ders_paket_id'),
    )
    if 'durum' in data and data['durum'] not in ProgramDurumu.values:
        raise OzelDersError('Geçersiz program durumu.', 'durum')
    was_active = p.durum == ProgramDurumu.AKTIF

    if 'term_id' in data:
        p.term_id = data['term_id']
    if 'ogrenci_egitim_paketi_id' in data:
        p.ogrenci_egitim_paketi_id = data['ogrenci_egitim_paketi_id']
    if 'premium_paket_id' in data:
        p.premium_paket_id = data['premium_paket_id']
    if 'ozel_ders_paket_id' in data:
        p.ozel_ders_paket_id = data['ozel_ders_paket_id']
    if 'baslangic_tarihi' in data:
        p.baslangic_tarihi = data['baslangic_tarihi']
    if 'bitis_tarihi' in data:
        p.bitis_tarihi = data['bitis_tarihi']
    if 'zaman_baslangic' in data:
        p.zaman_baslangic = _normalize_zaman_baslangic(data.get('zaman_baslangic'), p.zaman_baslangic or '09:00')
    if 'zaman_sure_dk' in data:
        p.zaman_sure_dk = _clamp_int(data.get('zaman_sure_dk'), default=p.zaman_sure_dk or 50, min_v=15, max_v=180)
    if 'zaman_ara_dk' in data:
        p.zaman_ara_dk = _clamp_int(
            data.get('zaman_ara_dk'),
            default=p.zaman_ara_dk if p.zaman_ara_dk is not None else 10,
            min_v=0,
            max_v=60,
        )
    if 'zaman_ders_adet' in data:
        p.zaman_ders_adet = _clamp_int(
            data.get('zaman_ders_adet'),
            default=p.zaman_ders_adet or 8,
            min_v=1,
            max_v=16,
        )
    if 'durum' in data:
        p.durum = data['durum']
    if 'notlar' in data:
        p.notlar = data['notlar'] or ''

    if p.bitis_tarihi and p.baslangic_tarihi and p.bitis_tarihi < p.baslangic_tarihi:
        raise OzelDersError('Bitiş tarihi başlangıçtan önce olamaz.', 'bitis_tarihi')

    date_changed = 'baslangic_tarihi' in data or 'bitis_tarihi' in data
    p.save()
    if was_active and p.durum != ProgramDurumu.AKTIF:
        close_future_program_sessions(p)
    elif date_changed and p.durum == ProgramDurumu.AKTIF:
        from apps.ozel_ders.services.materialize_service import sync_future_sessions_for_slot
        for slot in p.slots.filter(aktif=True):
            sync_future_sessions_for_slot(slot)
    return p


def close_future_program_sessions(p: BirebirOgrenciProgrami) -> int:
    """Aktif olmayan programın bugünden sonraki planlı derslerini kapatır.

    Yoklaması girilmiş veya hakedişi kilitli dersler korunur.
    """
    from django.db.models import Q
    from django.utils import timezone

    from apps.ozel_ders.domain.models import BirebirDersOturumu, HakedisDurumu, OturumDurumu

    qs = BirebirDersOturumu.objects.filter(
        program=p,
        is_active=True,
        durum=OturumDurumu.PLANLANDI,
        session_date__gt=timezone.localdate(),
    ).filter(
        Q(hakedis__isnull=True)
        | ~Q(hakedis__durum__in=(HakedisDurumu.ONAYLANDI, HakedisDurumu.BORDOYA_ISLENDI))
    )
    return qs.update(is_active=False, updated_at=timezone.now())


def get_program(program_id: int, *, kurum_id: int, sube_id: int) -> BirebirOgrenciProgrami:
    try:
        return BirebirOgrenciProgrami.objects.select_related(
            'ogrenci', 'premium_paket', 'ozel_ders_paket',
        ).get(pk=program_id, kurum_id=kurum_id, sube_id=sube_id)
    except BirebirOgrenciProgrami.DoesNotExist:
        raise OzelDersError('Program bulunamadı.', 'not_found', 404)
