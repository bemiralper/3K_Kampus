from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Optional

from django.db import transaction

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    OturumDurumu,
    OturumTuru,
)
from apps.ozel_ders.services.conflict_service import check_all_for_occurrence
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.hakedis_service import sync_hakedis_for_oturum


PAYABLE_STATUSES = {OturumDurumu.ISLENDI, OturumDurumu.ONLINE}

ALLOWED_TRANSITIONS = {
    OturumDurumu.PLANLANDI: {
        OturumDurumu.ISLENDI,
        OturumDurumu.IPTAL,
        OturumDurumu.TELAFI_EDILECEK,
        OturumDurumu.OGRENCI_GELMEDI,
        OturumDurumu.OGRETMEN_GELMEDI,
        OturumDurumu.ONLINE,
    },
    OturumDurumu.ONLINE: {
        OturumDurumu.ISLENDI,
        OturumDurumu.IPTAL,
        OturumDurumu.TELAFI_EDILECEK,
        OturumDurumu.PLANLANDI,
    },
    OturumDurumu.ISLENDI: {
        OturumDurumu.PLANLANDI,  # düzeltme
        OturumDurumu.IPTAL,
    },
    OturumDurumu.TELAFI_EDILECEK: {
        OturumDurumu.PLANLANDI,
        OturumDurumu.IPTAL,
    },
    OturumDurumu.OGRENCI_GELMEDI: {
        OturumDurumu.PLANLANDI,
        OturumDurumu.TELAFI_EDILECEK,
        OturumDurumu.IPTAL,
    },
    OturumDurumu.OGRETMEN_GELMEDI: {
        OturumDurumu.PLANLANDI,
        OturumDurumu.TELAFI_EDILECEK,
        OturumDurumu.IPTAL,
    },
    OturumDurumu.IPTAL: {
        OturumDurumu.PLANLANDI,
    },
}


def serialize_oturum(o: BirebirDersOturumu) -> dict:
    ogrenci_ad = getattr(o.ogrenci, 'tam_ad', None)
    if not ogrenci_ad:
        ogrenci_ad = f'{getattr(o.ogrenci, "ad", "")} {getattr(o.ogrenci, "soyad", "")}'.strip()
    return {
        'id': o.id,
        'program': o.program_id,
        'source_slot': o.source_slot_id,
        'kurum': o.kurum_id,
        'sube': o.sube_id,
        'egitim_yili': o.egitim_yili_id,
        'session_date': o.session_date.isoformat(),
        'start_time': o.start_time.strftime('%H:%M'),
        'end_time': o.end_time.strftime('%H:%M'),
        'sure_dk': o.duration_minutes(),
        'ogrenci': o.ogrenci_id,
        'ogrenci_ad': ogrenci_ad,
        'ders': o.ders_id,
        'ders_ad': getattr(o.ders, 'ad', None) or str(o.ders_id),
        'ders_kisa_ad': (getattr(o.ders, 'kisa_ad', None) or '').strip(),
        'ogretmen': o.ogretmen_id,
        'ogretmen_ad': getattr(o.ogretmen, 'tam_ad', str(o.ogretmen_id)),
        'oda': o.oda_id,
        'oda_ad': o.oda.ad if o.oda_id else None,
        'oturum_turu': o.oturum_turu,
        'oturum_turu_display': o.get_oturum_turu_display(),
        'durum': o.durum,
        'durum_display': o.get_durum_display(),
        'replaces_oturum': o.replaces_oturum_id,
        'notes': o.notes,
        'is_active': o.is_active,
        'has_hakedis': _has_active_hakedis(o),
    }


def _has_active_hakedis(o: BirebirDersOturumu) -> bool:
    from django.core.exceptions import ObjectDoesNotExist
    try:
        h = o.hakedis
    except ObjectDoesNotExist:
        return False
    return h is not None and h.durum != 'IPTAL'


def _parse_time(value) -> time:
    if isinstance(value, time):
        return value
    for fmt in ('%H:%M:%S', '%H:%M'):
        try:
            return datetime.strptime(value, fmt).time()
        except (ValueError, TypeError):
            continue
    raise OzelDersError('Geçersiz saat.', 'time')


def _parse_date(value) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return date.fromisoformat(str(value)[:10])


def get_oturum(oturum_id: int, *, kurum_id: int, sube_id: int) -> BirebirDersOturumu:
    try:
        return BirebirDersOturumu.objects.select_related(
            'ogrenci', 'ders', 'ogretmen', 'oda', 'hakedis',
        ).get(pk=oturum_id, kurum_id=kurum_id, sube_id=sube_id, is_active=True)
    except BirebirDersOturumu.DoesNotExist:
        raise OzelDersError('Oturum bulunamadı.', 'not_found', 404)


def list_oturumlar(
    *,
    kurum_id: int,
    sube_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    durum: Optional[str] = None,
    oturum_turu: Optional[str] = None,
    ogretmen_id: Optional[int] = None,
    ogrenci_id: Optional[int] = None,
    program_id: Optional[int] = None,
) -> list[dict]:
    qs = BirebirDersOturumu.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        is_active=True,
    ).select_related('ogrenci', 'ders', 'ogretmen', 'oda')
    if start_date:
        qs = qs.filter(session_date__gte=_parse_date(start_date))
    if end_date:
        qs = qs.filter(session_date__lte=_parse_date(end_date))
    if durum:
        qs = qs.filter(durum=durum)
    if oturum_turu:
        qs = qs.filter(oturum_turu=oturum_turu)
    if ogretmen_id:
        qs = qs.filter(ogretmen_id=ogretmen_id)
    if ogrenci_id:
        qs = qs.filter(ogrenci_id=ogrenci_id)
    if program_id:
        qs = qs.filter(program_id=program_id)
    return [serialize_oturum(o) for o in qs.order_by('session_date', 'start_time')]


@transaction.atomic
def create_oturum(
    data: dict[str, Any],
    *,
    kurum_id: int,
    sube_id: int,
    user=None,
) -> tuple[BirebirDersOturumu, list[dict]]:
    required = ['session_date', 'start_time', 'end_time', 'ogrenci_id', 'ders_id', 'ogretmen_id', 'egitim_yili_id']
    for key in required:
        if not data.get(key):
            raise OzelDersError(f'{key} zorunlu.', key)

    session_date = _parse_date(data['session_date'])
    start = _parse_time(data['start_time'])
    end = _parse_time(data['end_time'])
    warnings = check_all_for_occurrence(
        ogretmen_id=data['ogretmen_id'],
        ogrenci_id=data['ogrenci_id'],
        oda_id=data.get('oda_id'),
        kurum_id=kurum_id,
        sube_id=sube_id,
        session_date=session_date,
        start=start,
        end=end,
    )

    oturum = BirebirDersOturumu.objects.create(
        program_id=data.get('program_id'),
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili_id=data['egitim_yili_id'],
        session_date=session_date,
        start_time=start,
        end_time=end,
        ogrenci_id=data['ogrenci_id'],
        ders_id=data['ders_id'],
        ogretmen_id=data['ogretmen_id'],
        oda_id=data.get('oda_id'),
        oturum_turu=data.get('oturum_turu') or OturumTuru.OZEL,
        durum=OturumDurumu.PLANLANDI,
        replaces_oturum_id=data.get('replaces_oturum_id'),
        notes=data.get('notes') or '',
        created_by=user if user and getattr(user, 'is_authenticated', False) else None,
    )
    return oturum, warnings


@transaction.atomic
def create_telafi(
    source_oturum_id: int,
    data: dict[str, Any],
    *,
    kurum_id: int,
    sube_id: int,
    user=None,
) -> tuple[BirebirDersOturumu, list[dict]]:
    source = get_oturum(source_oturum_id, kurum_id=kurum_id, sube_id=sube_id)
    payload = {
        'session_date': data.get('session_date'),
        'start_time': data.get('start_time'),
        'end_time': data.get('end_time'),
        'ogrenci_id': source.ogrenci_id,
        'ders_id': data.get('ders_id') or source.ders_id,
        'ogretmen_id': data.get('ogretmen_id') or source.ogretmen_id,
        'oda_id': data.get('oda_id', source.oda_id),
        'egitim_yili_id': source.egitim_yili_id,
        'program_id': source.program_id,
        'oturum_turu': OturumTuru.TELAFI,
        'replaces_oturum_id': source.id,
        'notes': data.get('notes') or f'Telafi: oturum #{source.id}',
    }
    oturum, warnings = create_oturum(payload, kurum_id=kurum_id, sube_id=sube_id, user=user)
    if source.durum != OturumDurumu.TELAFI_EDILECEK:
        source.durum = OturumDurumu.TELAFI_EDILECEK
        source.save(update_fields=['durum', 'updated_at'])
    return oturum, warnings


@transaction.atomic
def set_durum(
    oturum_id: int,
    new_durum: str,
    *,
    kurum_id: int,
    sube_id: int,
    notes: str | None = None,
) -> BirebirDersOturumu:
    oturum = get_oturum(oturum_id, kurum_id=kurum_id, sube_id=sube_id)
    if new_durum not in OturumDurumu.values:
        raise OzelDersError('Geçersiz durum.', 'durum')

    allowed = ALLOWED_TRANSITIONS.get(oturum.durum, set())
    if new_durum != oturum.durum and new_durum not in allowed:
        raise OzelDersError(
            f'{oturum.get_durum_display()} → {dict(OturumDurumu.choices).get(new_durum, new_durum)} geçişi yapılamaz.',
            'invalid_transition',
        )

    # Bordroya işlenmiş hakediş varken ISLENDI geri alınamaz
    if oturum.durum in PAYABLE_STATUSES and new_durum not in PAYABLE_STATUSES:
        h = getattr(oturum, 'hakedis', None)
        if h and h.durum == 'BORDOYA_ISLENDI':
            raise OzelDersError(
                'Bordroya işlenmiş oturumun durumu değiştirilemez.',
                'bordro_locked',
            )

    oturum.durum = new_durum
    if notes is not None:
        oturum.notes = notes
    oturum.save()
    sync_hakedis_for_oturum(oturum)
    return oturum


@transaction.atomic
def change_teacher(
    oturum_id: int,
    ogretmen_id: int,
    *,
    kurum_id: int,
    sube_id: int,
) -> tuple[BirebirDersOturumu, list[dict]]:
    oturum = get_oturum(oturum_id, kurum_id=kurum_id, sube_id=sube_id)
    if oturum.durum not in (OturumDurumu.PLANLANDI, OturumDurumu.TELAFI_EDILECEK):
        raise OzelDersError('Sadece planlı oturumlarda öğretmen değiştirilebilir.', 'status')

    warnings = check_all_for_occurrence(
        ogretmen_id=ogretmen_id,
        ogrenci_id=oturum.ogrenci_id,
        oda_id=oturum.oda_id,
        kurum_id=kurum_id,
        sube_id=sube_id,
        session_date=oturum.session_date,
        start=oturum.start_time,
        end=oturum.end_time,
        exclude_id=oturum.id,
    )
    oturum.ogretmen_id = ogretmen_id
    oturum.save(update_fields=['ogretmen_id', 'updated_at'])
    return oturum, warnings
