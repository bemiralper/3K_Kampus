from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Optional

from django.db import transaction
from django.db.models import Prefetch

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirOgrenciProgrami,
    OturumDurumu,
    OturumTuru,
    ProgramDurumu,
    SebepKodu,
    TelafiDurumu,
)
from apps.ozel_ders.services.conflict_service import check_all_for_occurrence
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.hakedis_service import sync_hakedis_for_oturum


PAYABLE_STATUSES = {OturumDurumu.ISLENDI, OturumDurumu.ONLINE}
REASON_REQUIRED = {
    OturumDurumu.OGRETMEN_GELMEDI,
    OturumDurumu.OGRENCI_GELMEDI,
    OturumDurumu.IPTAL,
}
TELAFI_CHOICE_STATUSES = {
    OturumDurumu.OGRENCI_GELMEDI,
    OturumDurumu.IPTAL,
}
USER_TELAFI_CHOICES = {TelafiDurumu.GEREKMIYOR, TelafiDurumu.BEKLENIYOR}

ALLOWED_TRANSITIONS = {
    OturumDurumu.PLANLANDI: {
        OturumDurumu.ISLENDI,
        OturumDurumu.ONLINE,
        OturumDurumu.OGRETMEN_GELMEDI,
        OturumDurumu.OGRENCI_GELMEDI,
        OturumDurumu.IPTAL,
    },
    OturumDurumu.ONLINE: {
        OturumDurumu.ISLENDI,
        OturumDurumu.IPTAL,
        OturumDurumu.PLANLANDI,
    },
    OturumDurumu.ISLENDI: {
        OturumDurumu.PLANLANDI,
        OturumDurumu.IPTAL,
    },
    OturumDurumu.OGRENCI_GELMEDI: {
        OturumDurumu.PLANLANDI,
        OturumDurumu.IPTAL,
        OturumDurumu.OGRENCI_GELMEDI,  # sebep/telafi güncelleme
    },
    OturumDurumu.OGRETMEN_GELMEDI: {
        OturumDurumu.PLANLANDI,
        OturumDurumu.IPTAL,
        OturumDurumu.OGRETMEN_GELMEDI,
    },
    OturumDurumu.IPTAL: {
        OturumDurumu.PLANLANDI,
        OturumDurumu.IPTAL,
    },
}


def _oturum_ozet(o: BirebirDersOturumu | None) -> dict | None:
    if o is None:
        return None
    return {
        'id': o.id,
        'session_date': o.session_date.isoformat(),
        'start_time': o.start_time.strftime('%H:%M'),
        'end_time': o.end_time.strftime('%H:%M'),
        'ders_ad': getattr(o.ders, 'ad', None) or str(o.ders_id),
        'ogretmen_ad': getattr(o.ogretmen, 'tam_ad', str(o.ogretmen_id)),
        'durum': o.durum,
        'durum_display': o.get_durum_display(),
        'telafi_durumu': o.telafi_durumu,
        'telafi_durumu_display': o.get_telafi_durumu_display(),
        'oturum_turu': o.oturum_turu,
    }


def serialize_oturum(o: BirebirDersOturumu, *, include_bildirimler: bool = True) -> dict:
    ogrenci_ad = getattr(o.ogrenci, 'tam_ad', None)
    if not ogrenci_ad:
        ogrenci_ad = f'{getattr(o.ogrenci, "ad", "")} {getattr(o.ogrenci, "soyad", "")}'.strip()

    kaynak = None
    if o.replaces_oturum_id:
        kaynak_obj = getattr(o, 'replaces_oturum', None)
        if kaynak_obj is None:
            try:
                kaynak_obj = BirebirDersOturumu.objects.select_related(
                    'ders', 'ogretmen',
                ).get(pk=o.replaces_oturum_id)
            except BirebirDersOturumu.DoesNotExist:
                kaynak_obj = None
        kaynak = _oturum_ozet(kaynak_obj)

    telafi_child = None
    children = getattr(o, '_prefetched_objects_cache', {}).get('telafi_oturumlari')
    if children is not None:
        active = [c for c in children if c.is_active]
        if active:
            telafi_child = _oturum_ozet(sorted(active, key=lambda x: x.id)[-1])
    else:
        child = (
            o.telafi_oturumlari.filter(is_active=True)
            .select_related('ders', 'ogretmen')
            .order_by('-id')
            .first()
        )
        telafi_child = _oturum_ozet(child)

    sebep_display = ''
    if o.sebep_kodu:
        sebep_display = dict(SebepKodu.choices).get(o.sebep_kodu, o.sebep_kodu)
        if o.sebep_aciklama:
            sebep_display = f'{sebep_display} — {o.sebep_aciklama}' if o.sebep_kodu != SebepKodu.DIGER else o.sebep_aciklama
    elif o.sebep_aciklama:
        sebep_display = o.sebep_aciklama

    data = {
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
        'telafi_durumu': o.telafi_durumu,
        'telafi_durumu_display': o.get_telafi_durumu_display(),
        'sebep_kodu': o.sebep_kodu or '',
        'sebep_aciklama': o.sebep_aciklama or '',
        'sebep_display': sebep_display,
        'replaces_oturum': o.replaces_oturum_id,
        'kaynak_oturum': kaynak,
        'telafi_oturum': telafi_child,
        'notes': o.notes,
        'is_active': o.is_active,
        'has_hakedis': _has_active_hakedis(o),
    }
    if include_bildirimler:
        from apps.ozel_ders.services.notify_service import serialize_bildirimler
        data['bildirimler'] = serialize_bildirimler(o)
    else:
        data['bildirimler'] = []
    return data


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
            'ogrenci', 'ders', 'ogretmen', 'oda', 'hakedis', 'replaces_oturum',
            'replaces_oturum__ders', 'replaces_oturum__ogretmen',
        ).prefetch_related('telafi_oturumlari').get(
            pk=oturum_id, kurum_id=kurum_id, sube_id=sube_id, is_active=True,
        )
    except BirebirDersOturumu.DoesNotExist:
        raise OzelDersError('Oturum bulunamadı.', 'not_found', 404)


def list_oturumlar(
    *,
    kurum_id: int,
    sube_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    durum: Optional[str] = None,
    telafi_durumu: Optional[str] = None,
    oturum_turu: Optional[str] = None,
    ogretmen_id: Optional[int] = None,
    ogrenci_id: Optional[int] = None,
    program_id: Optional[int] = None,
    egitim_yili_id: Optional[int] = None,
) -> list[dict]:
    qs = BirebirDersOturumu.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        is_active=True,
    ).select_related(
        'ogrenci', 'ders', 'ogretmen', 'oda', 'hakedis', 'replaces_oturum',
        'replaces_oturum__ders', 'replaces_oturum__ogretmen',
    ).prefetch_related(
        Prefetch(
            'telafi_oturumlari',
            queryset=BirebirDersOturumu.objects.filter(is_active=True).select_related(
                'ders', 'ogretmen',
            ),
        ),
    )
    if start_date:
        qs = qs.filter(session_date__gte=_parse_date(start_date))
    if end_date:
        qs = qs.filter(session_date__lte=_parse_date(end_date))
    if durum:
        qs = qs.filter(durum=durum)
    if telafi_durumu:
        qs = qs.filter(telafi_durumu=telafi_durumu)
    if oturum_turu:
        qs = qs.filter(oturum_turu=oturum_turu)
    if ogretmen_id:
        qs = qs.filter(ogretmen_id=ogretmen_id)
    if ogrenci_id:
        qs = qs.filter(ogrenci_id=ogrenci_id)
    if program_id:
        qs = qs.filter(program_id=program_id)
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    # Liste için bildirimleri tek tek sorgulamamak — boş bırak, detayda dolu gelir
    return [
        serialize_oturum(o, include_bildirimler=False)
        for o in qs.order_by('session_date', 'start_time')
    ]


def _resolve_program_id(data: dict[str, Any], *, kurum_id: int, sube_id: int) -> Optional[int]:
    """Tek seferlik oturumu öğrencinin aktif birebir programına bağlar."""
    if data.get('program_id'):
        try:
            return int(data['program_id'])
        except (TypeError, ValueError):
            return None
    ogrenci_id = data.get('ogrenci_id')
    if not ogrenci_id:
        return None
    qs = BirebirOgrenciProgrami.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        ogrenci_id=ogrenci_id,
        durum=ProgramDurumu.AKTIF,
    )
    ey = data.get('egitim_yili_id')
    if ey:
        qs = qs.filter(egitim_yili_id=ey)
    programs = list(qs.order_by('-id'))
    if not programs:
        return None
    ders_id = data.get('ders_id')
    if ders_id:
        from apps.ozel_ders.services.sync_service import resolve_paket_dersleri
        try:
            ders_id = int(ders_id)
        except (TypeError, ValueError):
            ders_id = None
        if ders_id:
            for program in programs:
                if any(d.get('id') == ders_id for d in resolve_paket_dersleri(program)):
                    return program.id
    return programs[0].id


def _create_oturum_record(
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
        program_id=_resolve_program_id(data, kurum_id=kurum_id, sube_id=sube_id),
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
        telafi_durumu=data.get('telafi_durumu') or TelafiDurumu.GEREKMIYOR,
        replaces_oturum_id=data.get('replaces_oturum_id'),
        notes=data.get('notes') or '',
        created_by=user if user and getattr(user, 'is_authenticated', False) else None,
    )
    return oturum, warnings


@transaction.atomic
def create_oturum(
    data: dict[str, Any],
    *,
    kurum_id: int,
    sube_id: int,
    user=None,
) -> tuple[BirebirDersOturumu, list[dict]]:
    # Tek seferlik oluşturma: Telafi Dersi → kaynak üzerinden create_telafi
    if (data.get('oturum_turu') == OturumTuru.TELAFI or data.get('oturum_turu') == 'TELAFI') and data.get('replaces_oturum_id'):
        return create_telafi(
            int(data['replaces_oturum_id']),
            data,
            kurum_id=kurum_id,
            sube_id=sube_id,
            user=user,
        )
    return _create_oturum_record(data, kurum_id=kurum_id, sube_id=sube_id, user=user)


def _validate_sebep(new_durum: str, sebep_kodu: str | None, sebep_aciklama: str | None) -> tuple[str, str]:
    kod = (sebep_kodu or '').strip()
    aciklama = (sebep_aciklama or '').strip()
    if new_durum in REASON_REQUIRED:
        if not kod or kod not in SebepKodu.values:
            raise OzelDersError('Gelmeme / iptal sebebi zorunludur.', 'sebep_kodu')
        if kod == SebepKodu.DIGER and not aciklama:
            raise OzelDersError('Diğer seçildiğinde açıklama zorunludur.', 'sebep_aciklama')
    else:
        kod = ''
        aciklama = ''
    return kod, aciklama


def _resolve_telafi_durumu(
    oturum: BirebirDersOturumu,
    new_durum: str,
    telafi_durumu: str | None,
) -> str:
    if new_durum in (OturumDurumu.ISLENDI, OturumDurumu.ONLINE):
        return TelafiDurumu.GEREKMIYOR
    if new_durum == OturumDurumu.OGRETMEN_GELMEDI:
        # Aktif telafi çocuğu varsa PLANLANDI/EDILDI korunabilir; yoksa BEKLENIYOR
        child = oturum.telafi_oturumlari.filter(is_active=True).order_by('-id').first()
        if child:
            if child.durum in PAYABLE_STATUSES:
                return TelafiDurumu.EDILDI
            return TelafiDurumu.PLANLANDI
        return TelafiDurumu.BEKLENIYOR
    if new_durum in TELAFI_CHOICE_STATUSES:
        if not telafi_durumu or telafi_durumu not in USER_TELAFI_CHOICES:
            raise OzelDersError(
                'Telafi durumu seçilmelidir (Telafi Gerekmiyor / Telafi Bekleniyor).',
                'telafi_durumu',
            )
        # Zaten planlanmış çocuk varsa kullanıcı GEREKMIYOR dese bile ilişkiyi bozma
        child = oturum.telafi_oturumlari.filter(is_active=True).order_by('-id').first()
        if child and telafi_durumu == TelafiDurumu.BEKLENIYOR:
            if child.durum in PAYABLE_STATUSES:
                return TelafiDurumu.EDILDI
            return TelafiDurumu.PLANLANDI
        return telafi_durumu
    if new_durum == OturumDurumu.PLANLANDI:
        return TelafiDurumu.GEREKMIYOR
    return oturum.telafi_durumu or TelafiDurumu.GEREKMIYOR


def _mark_kaynak_telafi_edildi(telafi: BirebirDersOturumu) -> None:
    """Telafi dersi işlenince kaynak zincirinde EDILDI."""
    if not telafi.replaces_oturum_id:
        return
    kaynak = BirebirDersOturumu.objects.filter(pk=telafi.replaces_oturum_id).first()
    if not kaynak:
        return
    if kaynak.telafi_durumu != TelafiDurumu.EDILDI:
        kaynak.telafi_durumu = TelafiDurumu.EDILDI
        kaynak.save(update_fields=['telafi_durumu', 'updated_at'])


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
    if source.telafi_durumu != TelafiDurumu.BEKLENIYOR:
        raise OzelDersError(
            'Yalnızca "Telafi Bekleniyor" durumundaki dersler için telafi oluşturulabilir.',
            'telafi_durumu',
        )

    payload = {
        'session_date': data.get('session_date'),
        'start_time': data.get('start_time'),
        'end_time': data.get('end_time'),
        'ogrenci_id': source.ogrenci_id,
        'ders_id': source.ders_id,
        'ogretmen_id': data.get('ogretmen_id') or source.ogretmen_id,
        'oda_id': data.get('oda_id', source.oda_id),
        'egitim_yili_id': source.egitim_yili_id,
        'program_id': source.program_id,
        'oturum_turu': OturumTuru.TELAFI,
        'telafi_durumu': TelafiDurumu.GEREKMIYOR,
        'replaces_oturum_id': source.id,
        'notes': data.get('notes') or f'Telafi: oturum #{source.id}',
    }
    oturum, warnings = _create_oturum_record(payload, kurum_id=kurum_id, sube_id=sube_id, user=user)

    source.telafi_durumu = TelafiDurumu.PLANLANDI
    source.save(update_fields=['telafi_durumu', 'updated_at'])

    user_id = getattr(user, 'id', None) if user else None
    from apps.ozel_ders.services.notify_service import notify_telafi_planlandi
    notify_telafi_planlandi(source, oturum, sent_by_user_id=user_id)

    return oturum, warnings


@transaction.atomic
def set_durum(
    oturum_id: int,
    new_durum: str,
    *,
    kurum_id: int,
    sube_id: int,
    notes: str | None = None,
    sebep_kodu: str | None = None,
    sebep_aciklama: str | None = None,
    telafi_durumu: str | None = None,
    send_whatsapp: bool | None = None,
    user=None,
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

    if oturum.durum in PAYABLE_STATUSES and new_durum not in PAYABLE_STATUSES:
        h = getattr(oturum, 'hakedis', None)
        if h and h.durum == 'BORDOYA_ISLENDI':
            raise OzelDersError(
                'Bordroya işlenmiş oturumun durumu değiştirilemez.',
                'bordro_locked',
            )

    kod, aciklama = _validate_sebep(new_durum, sebep_kodu, sebep_aciklama)
    resolved_telafi = _resolve_telafi_durumu(oturum, new_durum, telafi_durumu)

    oturum.durum = new_durum
    oturum.sebep_kodu = kod
    oturum.sebep_aciklama = aciklama
    oturum.telafi_durumu = resolved_telafi
    if notes is not None:
        oturum.notes = notes
    oturum.save()
    sync_hakedis_for_oturum(oturum)

    if new_durum in PAYABLE_STATUSES and oturum.oturum_turu == OturumTuru.TELAFI:
        _mark_kaynak_telafi_edildi(oturum)

    # WhatsApp varsayılanları
    if send_whatsapp is None:
        if new_durum in (
            OturumDurumu.OGRETMEN_GELMEDI,
            OturumDurumu.OGRENCI_GELMEDI,
            OturumDurumu.IPTAL,
        ):
            send_whatsapp = True
        else:
            send_whatsapp = False

    from apps.ozel_ders.services.notify_service import notify_yoklama
    notify_yoklama(
        oturum,
        send_whatsapp=bool(send_whatsapp),
        sent_by_user_id=getattr(user, 'id', None) if user else None,
    )

    return get_oturum(oturum.id, kurum_id=kurum_id, sube_id=sube_id)


@transaction.atomic
def change_teacher(
    oturum_id: int,
    ogretmen_id: int,
    *,
    kurum_id: int,
    sube_id: int,
) -> tuple[BirebirDersOturumu, list[dict]]:
    oturum = get_oturum(oturum_id, kurum_id=kurum_id, sube_id=sube_id)
    if oturum.durum != OturumDurumu.PLANLANDI:
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
