"""Öğrenci özel ders dönem özeti — şablon + tatil + gerçek oturumlar.

Not: Ders sayıları dakika/saat değil "ders adedi" olarak hesaplanır.
Bir haftalık şablon slotunun her tekrarı (tatil hariç) 1 "ders" sayılır;
süresi (örn. 50 dk) sayıma etki etmez — süre yalnızca zaman ayarlarında
bilgi amaçlı gösterilir.

Bir öğrencinin aynı anda birden fazla aktif programı/paketi olabilir
(örn. Matematik + Fizik + Kimya + Biyoloji — her biri ayrı bir
BirebirOgrenciProgrami kaydı). Bu yüzden özet hem toplam hem de
ders bazında kırılım (dersler) ile döner; tek bir "paket adı" göstermek
yanıltıcıdır.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    BirebirOgrenciProgrami,
    OturumDurumu,
    OturumTuru,
    ProgramDurumu,
)
from apps.ozel_ders.services.conflict_service import is_holiday, iter_dates_for_weekday, list_holidays
from apps.ozel_ders.services.ders_tatil_service import build_tatil_hits
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.quota_service import (
    QUOTA_STATUSES,
    resolve_ders_hedef_dakika,
)

ATTENDED = {OturumDurumu.ISLENDI, OturumDurumu.ONLINE}
QUOTA_TURU = {OturumTuru.OZEL, OturumTuru.TELAFI}


def _person_ad(obj) -> str:
    if obj is None:
        return ''
    ad = getattr(obj, 'tam_ad', None)
    if ad:
        return str(ad)
    return f'{getattr(obj, "ad", "")} {getattr(obj, "soyad", "")}'.strip()


def _parse_date(value) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        return date.fromisoformat(value.strip()[:10])
    raise OzelDersError('Geçersiz tarih.', 'date')


def _paket_ad(program: BirebirOgrenciProgrami) -> str:
    return (
        (program.premium_paket.ad if program.premium_paket_id else None)
        or (program.ozel_ders_paket.ad if program.ozel_ders_paket_id else None)
        or f'Program #{program.id}'
    )


def calculate_student_private_lesson_summary(
    *,
    ogrenci_id: int,
    kurum_id: int,
    sube_id: int,
    start_date: Optional[date | str] = None,
    end_date: Optional[date | str] = None,
) -> dict:
    """Dönem bazlı planlanan / işlenen / kalan / telafi / ek / iptal özeti (ders adedi).

    Toplamların yanında `dersler` alanında ders bazında kırılım, `paketler`
    alanında ise öğrencinin bu dönemdeki tüm aktif paket/programlarının
    listesi döner (bir öğrencinin birden fazla paketi/dersi olabilir).
    """
    from apps.ogrenci.domain.models import Ogrenci

    try:
        ogrenci = Ogrenci.objects.select_related('sube').get(pk=ogrenci_id, kurum_id=kurum_id)
    except Ogrenci.DoesNotExist:
        raise OzelDersError('Öğrenci bulunamadı.', 'not_found', 404)

    programs_qs = BirebirOgrenciProgrami.objects.filter(
        kurum_id=kurum_id,
        ogrenci_id=ogrenci_id,
        durum=ProgramDurumu.AKTIF,
    ).select_related('premium_paket', 'ozel_ders_paket')
    if sube_id:
        programs_qs = programs_qs.filter(sube_id=sube_id)
    programs = list(programs_qs)

    if start_date is not None and end_date is not None:
        start = _parse_date(start_date)
        end = _parse_date(end_date)
    elif programs:
        start = min(p.baslangic_tarihi for p in programs)
        ends = [p.bitis_tarihi for p in programs if p.bitis_tarihi]
        end = max(ends) if ends else date.today().replace(month=12, day=31)
    else:
        start = date.today().replace(month=1, day=1)
        end = date.today().replace(month=12, day=31)

    if end < start:
        raise OzelDersError('Bitiş tarihi başlangıçtan önce olamaz.', 'date_range')

    program_ids = [p.id for p in programs]
    slots = list(
        BirebirHaftalikSlot.objects.filter(
            program_id__in=program_ids,
            aktif=True,
        ).select_related('program', 'ders', 'ogretmen')
        if program_ids
        else []
    )

    ders_breakdown: dict[int, dict] = {}

    def _ders_entry(ders_id: int, ders_obj=None, *, ders_ad: str = '', ders_kisa_ad: str = '') -> dict:
        ad = (ders_ad or getattr(ders_obj, 'ad', None) or '').strip()
        kisa = (ders_kisa_ad or getattr(ders_obj, 'kisa_ad', None) or '').strip()
        entry = ders_breakdown.get(ders_id)
        if entry is None:
            entry = {
                'ders_id': ders_id,
                'ders_ad': ad,
                'ders_kisa_ad': kisa,
                'planlanan_ders': 0,
                'islenen_ders': 0,
                'kalan_ders': 0,
                'telafi_ders': 0,
                'ek_ders': 0,
                'iptal_ders': 0,
                'hedef_dakika': None,
                'kullanilan_dakika': 0,
                'kalan_dakika': None,
            }
            ders_breakdown[ders_id] = entry
        elif ad and not entry['ders_ad']:
            entry['ders_ad'] = ad
            entry['ders_kisa_ad'] = kisa
        return entry

    # Planlanan: şablonun dönem içindeki her tekrarı 1 "ders" — tatiller hariç.
    # Saat kotası varsa pencere tekrarları kota dolana kadar sayılır.
    planlanan_ders = 0
    tatilden_dusulen_ders = 0
    holiday_dates: set[date] = set()
    planned_minutes_by_ders: dict[int, int] = {}
    hedef_by_ders: dict[int, int | None] = {}

    candidates: list[tuple[date, BirebirHaftalikSlot]] = []
    for slot in slots:
        slot_start = slot.baslangic_tarihi or slot.program.baslangic_tarihi
        slot_end = slot.bitis_tarihi or slot.program.bitis_tarihi or end
        range_start = max(start, slot_start)
        range_end = min(end, slot_end)
        if range_end < range_start:
            continue
        _ders_entry(slot.ders_id, slot.ders)
        if slot.ders_id not in hedef_by_ders:
            hedef_by_ders[slot.ders_id] = resolve_ders_hedef_dakika(
                ogrenci_id=ogrenci_id, ders_id=slot.ders_id,
            )
        for day in iter_dates_for_weekday(range_start, range_end, slot.gun):
            candidates.append((day, slot))
    candidates.sort(key=lambda item: (item[0], item[1].id))

    for day, slot in candidates:
        entry = _ders_entry(slot.ders_id, slot.ders)
        if is_holiday(kurum_id, sube_id, day):
            holiday_dates.add(day)
            tatilden_dusulen_ders += 1
            continue
        hedef = hedef_by_ders.get(slot.ders_id)
        sure = slot.resolved_sure_dk()
        if hedef:
            already = planned_minutes_by_ders.get(slot.ders_id, 0)
            if already + sure > hedef:
                continue
            planned_minutes_by_ders[slot.ders_id] = already + sure
        planlanan_ders += 1
        entry['planlanan_ders'] += 1

    # Gerçek oturumlar — her kayıt 1 "ders"tir (süresi ne olursa olsun).
    oturum_qs = BirebirDersOturumu.objects.filter(
        kurum_id=kurum_id,
        ogrenci_id=ogrenci_id,
        is_active=True,
        session_date__gte=start,
        session_date__lte=end,
    ).select_related('ders')
    if sube_id:
        oturum_qs = oturum_qs.filter(sube_id=sube_id)

    islenen_ders = 0
    telafi_ders = 0
    ek_ders = 0
    iptal_ders = 0

    from apps.ozel_ders.services.sync_service import resolve_paket_dersleri

    for p in programs:
        for d in resolve_paket_dersleri(p):
            _ders_entry(
                d['id'],
                ders_ad=d.get('ad', ''),
                ders_kisa_ad=d.get('kisa_ad', ''),
            )

    for o in oturum_qs.only(
        'durum', 'oturum_turu', 'ders_id', 'start_time', 'end_time',
        'ders__ad', 'ders__kisa_ad',
    ):
        entry = _ders_entry(o.ders_id, o.ders)
        if o.oturum_turu == OturumTuru.TELAFI:
            telafi_ders += 1
            entry['telafi_ders'] += 1
        if o.oturum_turu == OturumTuru.EK:
            ek_ders += 1
            entry['ek_ders'] += 1
        if o.durum == OturumDurumu.IPTAL:
            iptal_ders += 1
            entry['iptal_ders'] += 1
        if o.durum in ATTENDED and o.oturum_turu in QUOTA_TURU:
            islenen_ders += 1
            entry['islenen_ders'] += 1
        if o.durum in QUOTA_STATUSES and o.oturum_turu in QUOTA_TURU:
            entry['kullanilan_dakika'] += o.duration_minutes()

    kalan_ders = max(planlanan_ders - islenen_ders, 0)
    for entry in ders_breakdown.values():
        entry['kalan_ders'] = max(entry['planlanan_ders'] - entry['islenen_ders'], 0)
        hedef = hedef_by_ders.get(entry['ders_id'])
        if hedef is None:
            hedef = resolve_ders_hedef_dakika(ogrenci_id=ogrenci_id, ders_id=entry['ders_id'])
        entry['hedef_dakika'] = hedef
        if hedef:
            entry['kalan_dakika'] = max(hedef - entry['kullanilan_dakika'], 0)
        else:
            entry['kullanilan_dakika'] = 0
            entry['kalan_dakika'] = None

    dersler_list = sorted(
        ders_breakdown.values(),
        key=lambda e: (e['ders_ad'] or '').lower(),
    )

    primary = programs[0] if programs else None
    paketler = [{'id': p.id, 'ad': _paket_ad(p)} for p in programs]

    sinif_ad = ''
    # Ogrenci modelinde sinif ilişkisi değişken olabilir
    for attr in ('sinif', 'aktif_sinif', 'sinif_obj'):
        obj = getattr(ogrenci, attr, None)
        if obj is not None:
            sinif_ad = getattr(obj, 'ad', None) or str(obj)
            break
    if not sinif_ad:
        sinif_ad = getattr(ogrenci, 'sinif_ad', '') or ''

    return {
        'ogrenci_id': ogrenci.id,
        'ogrenci_ad': _person_ad(ogrenci),
        'sinif_ad': sinif_ad or None,
        'donem': {
            'baslangic': start.isoformat(),
            'bitis': end.isoformat(),
        },
        'program_ids': program_ids,
        'ozet': {
            'planlanan_ders': planlanan_ders,
            'islenen_ders': islenen_ders,
            'kalan_ders': kalan_ders,
            'telafi_ders': telafi_ders,
            'ek_ders': ek_ders,
            'iptal_ders': iptal_ders,
            'tatil_gun_sayisi': len(holiday_dates),
            'tatilden_dusulen_ders': tatilden_dusulen_ders,
        },
        'dersler': dersler_list,
        'tatiller': list_holidays(kurum_id, sube_id, start, end),
        'tatil_carpmalari': build_tatil_hits(
            ogrenci_id=ogrenci.id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            start=start,
            end=end,
        ),
        'paketler': paketler,
        'paket': {
            'program_sayisi': len(programs),
        },
        'zaman': {
            'baslangic': (primary.zaman_baslangic if primary else None) or '09:00',
            'sure_dk': (primary.zaman_sure_dk if primary else None) or 50,
            'ara_dk': (
                primary.zaman_ara_dk
                if primary and primary.zaman_ara_dk is not None
                else 10
            ),
            'ders_adet': (primary.zaman_ders_adet if primary else None) or 8,
        },
    }
