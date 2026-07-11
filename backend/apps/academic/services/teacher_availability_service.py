"""Öğretmen uygunluğu — grid yapısı, sözleşme özeti, doğrulama."""

from __future__ import annotations

from datetime import date
from typing import Any

from django.db import transaction
from django.db.models import Prefetch, Q

from apps.academic.domain.teacher_availability import (
    AvailabilityKind,
    SlotAvailabilityStatus,
    TeacherAvailabilityCalendar,
    TeacherAvailabilityCell,
    TeacherAvailabilitySet,
)
from apps.academic.domain.timeslot import SlotType
from apps.academic.domain.weekly_cycle import WeeklyCycle, ProgramTipi
from apps.academic.domain.weekly_day import DayOfWeek
from apps.personel.domain.sozlesme_models import PersonelSozlesme, SozlesmeDurumu


def _is_ogretmen_sozlesmesi(
    *,
    gorev_snapshot: str = '',
    brans_snapshot: str = '',
    rol_kodu: str = '',
    rol_ad: str = '',
) -> bool:
    """contract_calc_service ile aynı kural — dairesel import önlenir."""
    for val in (gorev_snapshot, rol_ad):
        low = (val or '').lower()
        if 'öğretmen' in low or 'ogretmen' in low:
            return True
    kod = (rol_kodu or '').lower()
    return kod in ('ogretmen', 'öğretmen')


GUN_LABELS = dict(DayOfWeek.choices)
MESAI_GUN_LABELS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
# Sözleşme mesai: 1=Pzt … 7=Paz | akademik: 0=Pzt … 6=Paz
CONTRACT_TO_ACADEMIC_DAY = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6}


def _personel_no(personel_id: int, contract: dict[str, Any] | None = None) -> str:
    if contract and contract.get('personel_no_snapshot'):
        return str(contract['personel_no_snapshot'])
    return f'P-{personel_id:06d}'


def _apply_teacher_search(gorev_qs, search: str):
    """Personel modelinde personel_no yok; ad/soyad/tc ve P-XXXXXX formatı desteklenir."""
    term = (search or '').strip()
    if not term:
        return gorev_qs
    q = (
        Q(personel__ad__icontains=term)
        | Q(personel__soyad__icontains=term)
        | Q(personel__tc_kimlik_no__icontains=term)
    )
    upper = term.upper()
    if upper.startswith('P-'):
        raw = upper.replace('P-', '').strip()
        if raw.isdigit():
            q |= Q(personel_id=int(raw))
    return gorev_qs.filter(q)


def _time_str(t) -> str | None:
    return t.strftime('%H:%M') if t else None


def _rol_fields(rol) -> tuple[str, str]:
    if not rol:
        return '', ''
    return (
        getattr(rol, 'code', None) or getattr(rol, 'kod', '') or '',
        getattr(rol, 'name', None) or getattr(rol, 'ad', '') or '',
    )


def is_ogretmen_gorevlendirme(gorevlendirme) -> bool:
    """Görevlendirmeler sayfasındaki rol/branş bilgisine göre öğretmen mi."""
    if not gorevlendirme:
        return False
    rol_kodu, rol_ad = _rol_fields(getattr(gorevlendirme, 'rol', None))
    brans_ad = gorevlendirme.brans.ad if getattr(gorevlendirme, 'brans_id', None) else ''
    return _is_ogretmen_sozlesmesi(
        gorev_snapshot='',
        brans_snapshot=brans_ad,
        rol_kodu=rol_kodu,
        rol_ad=rol_ad,
    )


def get_teacher_gorevlendirme(
    personel_id: int,
    *,
    kurum_id: int,
    sube_id: int,
    egitim_yili_id: int | None,
):
    """Aktif şube + eğitim yılı için görevlendirme kaydı."""
    from apps.personel.domain.models import PersonelGorevlendirme

    qs = PersonelGorevlendirme.objects.filter(
        personel_id=personel_id,
        kurum_id=kurum_id,
        gorev_sube_id=sube_id,
        aktif_mi=True,
    ).select_related('rol', 'brans', 'gorev_sube', 'egitim_yili')
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    return qs.order_by('-egitim_yili__baslangic_yil').first()


def serialize_gorevlendirme(g) -> dict[str, Any] | None:
    if not g:
        return None
    rol_kodu, rol_ad = _rol_fields(g.rol)
    return {
        'id': g.id,
        'personel_id': g.personel_id,
        'egitim_yili_id': g.egitim_yili_id,
        'egitim_yili_ad': str(g.egitim_yili) if g.egitim_yili_id else '',
        'gorev_sube_id': g.gorev_sube_id,
        'gorev_sube_ad': g.gorev_sube.ad if g.gorev_sube_id else '',
        'rol_id': g.rol_id,
        'rol_kodu': rol_kodu,
        'rol_ad': rol_ad,
        'brans_id': g.brans_id,
        'brans_ad': g.brans.ad if g.brans_id else '',
        'gorev_baslangic': g.gorev_baslangic.isoformat() if g.gorev_baslangic else None,
        'gorev_bitis': g.gorev_bitis.isoformat() if g.gorev_bitis else None,
        'aktif_mi': g.aktif_mi,
    }


def is_teacher_personel(personel, *, kurum_id: int, sube_id: int, egitim_yili_id=None) -> bool:
    g = get_teacher_gorevlendirme(
        personel.id,
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
    )
    if g and is_ogretmen_gorevlendirme(g):
        return True

    contract = get_active_contract(
        personel.id,
        kurum_id,
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
    )
    return bool(contract and contract.get('is_ogretmen'))


def get_active_contract(
    personel_id: int,
    kurum_id: int,
    *,
    sube_id: int | None = None,
    egitim_yili_id: int | None = None,
) -> dict[str, Any] | None:
    """Personel sözleşmeler sayfasındaki aktif kayıttan özet üretir."""
    from apps.personel.interfaces.sozlesme_serializers import serialize_sozlesme

    qs = PersonelSozlesme.objects.filter(
        personel_id=personel_id,
        kurum_id=kurum_id,
        durum=SozlesmeDurumu.AKTIF,
    ).select_related(
        'personel', 'gorevlendirme__rol', 'gorevlendirme__brans', 'sube', 'egitim_yili', 'kurum',
    ).prefetch_related('mesai_saatleri', 'ders_ucretleri__brans', 'maas_plani')
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    sozlesme = qs.order_by('-baslangic_tarihi').first()
    if not sozlesme:
        return None

    serialized = serialize_sozlesme(sozlesme)
    mesai = serialized.get('mesai_saatleri') or []
    working_days = sorted(
        CONTRACT_TO_ACADEMIC_DAY[m['gun']]
        for m in mesai
        if m.get('aktif') and m['gun'] in CONTRACT_TO_ACADEMIC_DAY
    )
    izin_gunleri = serialized.get('haftalik_izin_gunleri') or []
    ozet = serialized.get('ozet') or {}

    gorev = sozlesme.gorevlendirme
    gorev_brans_ad = gorev.brans.ad if gorev and gorev.brans_id else ''
    brans_display = serialized.get('brans_snapshot') or gorev_brans_ad

    ders_ucretleri = serialized.get('ders_ucretleri') or []
    ek_ders_parts = []
    for du in ders_ucretleri:
        tip = du.get('ucret_tipi_display') or du.get('ucret_tipi') or ''
        saat = du.get('haftalik_saat')
        brans = du.get('brans_ad') or 'Genel'
        if saat:
            ek_ders_parts.append(f'{brans}: {saat} saat/hafta ({tip})')
        else:
            ek_ders_parts.append(f'{brans} ({tip})')
    ek_ders_bilgisi = serialized.get('notlar') or ''
    if ek_ders_parts:
        ek_line = '; '.join(ek_ders_parts)
        ek_ders_bilgisi = f'{ek_ders_bilgisi}\n{ek_line}'.strip() if ek_ders_bilgisi else ek_line

    return {
        'id': serialized['id'],
        'sozlesme_no': serialized['sozlesme_no'],
        'sozlesme_turu': serialized['sozlesme_turu'],
        'sozlesme_turu_display': serialized['sozlesme_turu_display'],
        'is_ogretmen': serialized['is_ogretmen'],
        'brans_snapshot': brans_display,
        'gorev_snapshot': serialized.get('gorev_snapshot') or '',
        'rol_ad': serialized.get('rol_ad') or '',
        'gorevlendirme_id': serialized.get('gorevlendirme_id'),
        'egitim_yili_display': serialized.get('egitim_yili_display') or '',
        'baslangic_tarihi': serialized.get('baslangic_tarihi'),
        'bitis_tarihi': serialized.get('bitis_tarihi'),
        'haftalik_calisma_gun_sayisi': serialized.get('haftalik_calisma_gun_sayisi') or 0,
        'haftalik_izin_gunleri': izin_gunleri,
        'haftalik_izin_gunleri_labels': [
            MESAI_GUN_LABELS[g - 1] for g in izin_gunleri if 1 <= g <= 7
        ],
        'working_days_academic': working_days,
        'mesai_saatleri': [
            {
                'gun': m['gun'],
                'gun_label': MESAI_GUN_LABELS[m['gun'] - 1] if 1 <= m['gun'] <= 7 else '',
                'baslangic': m.get('baslangic'),
                'bitis': m.get('bitis'),
                'mola_dakika': m.get('mola_dakika') or 0,
                'aktif': m.get('aktif', False),
            }
            for m in mesai
        ],
        'haftalik_sozlesme_saati': ozet.get('haftalik_calisma_saati') or 0,
        'ders_ucretleri': ders_ucretleri,
        'ders_ucreti_aktif': serialized.get('ders_ucreti_aktif', False),
        'ek_ders_bilgisi': ek_ders_bilgisi,
        'ders_birim_ucret': serialized.get('ders_birim_ucret') or 0,
        'personel_no_snapshot': serialized.get('personel_no_snapshot') or '',
        'source': 'personel_sozlesme',
    }


def build_calendar_grid_structure(weekly_cycle: WeeklyCycle) -> dict[str, Any]:
    days = []
    weekly_days = (
        weekly_cycle.weekly_days.filter(is_active=True)
        .select_related('schedule_template')
        .prefetch_related(
            Prefetch(
                'schedule_template__time_slots',
                queryset=__import__(
                    'apps.academic.domain.timeslot', fromlist=['TimeSlot']
                ).TimeSlot.objects.filter(is_active=True, slot_type=SlotType.LESSON).order_by('order'),
            )
        )
        .order_by('order')
    )
    max_slots = 0
    for wd in weekly_days:
        if not wd.schedule_template_id:
            continue
        slots = list(
            wd.schedule_template.time_slots.filter(is_active=True, slot_type=SlotType.LESSON).order_by('order')
        )
        max_slots = max(max_slots, len(slots))
        days.append({
            'day_of_week': wd.day_of_week,
            'day_name': wd.name,
            'weekly_day_id': wd.id,
            'schedule_template_id': wd.schedule_template_id,
            'schedule_template_name': wd.schedule_template.name,
            'slots': [
                {
                    'timeslot_id': s.id,
                    'order': s.order,
                    'lesson_index': idx + 1,
                    'label': str(idx + 1),
                    'name': s.name,
                    'start_time': _time_str(s.start_time),
                    'end_time': _time_str(s.end_time),
                    'duration': s.duration if hasattr(s, 'duration') else None,
                }
                for idx, s in enumerate(slots)
            ],
        })
    return {
        'weekly_cycle_id': weekly_cycle.id,
        'weekly_cycle_name': weekly_cycle.name,
        'program_tipi': weekly_cycle.program_tipi,
        'program_tipi_display': weekly_cycle.get_program_tipi_display(),
        'days': days,
        'max_slot_count': max_slots,
    }


def list_teachers(
    *,
    kurum_id: int,
    sube_id: int,
    egitim_yili_id: int | None,
    search: str = '',
    brans: str = '',
    sozlesme_turu: str = '',
    aktif_only: bool = True,
) -> list[dict[str, Any]]:
    """
    Öğretmen listesi — kaynak: Personel > Görevlendirmeler (aktif şube + eğitim yılı).
    Branş ve rol bilgisi görevlendirme kaydından okunur; sözleşme türü aktif sözleşmeden.
    """
    from apps.personel.domain.models import PersonelGorevlendirme

    gorev_qs = PersonelGorevlendirme.objects.filter(
        kurum_id=kurum_id,
        gorev_sube_id=sube_id,
        aktif_mi=True,
    ).select_related('personel', 'personel__sube', 'rol', 'brans', 'gorev_sube', 'egitim_yili')

    if egitim_yili_id:
        gorev_qs = gorev_qs.filter(egitim_yili_id=egitim_yili_id)

    if search:
        gorev_qs = _apply_teacher_search(gorev_qs, search)

    rows: list[dict[str, Any]] = []
    seen_personel: set[int] = set()

    for g in gorev_qs.order_by('personel__ad', 'personel__soyad'):
        if not is_ogretmen_gorevlendirme(g):
            continue

        p = g.personel
        if p.id in seen_personel:
            continue
        seen_personel.add(p.id)

        if aktif_only and not p.aktif_mi:
            continue

        brans_ad = g.brans.ad if g.brans_id else ''
        if brans and brans.lower() not in (brans_ad or '').lower():
            continue

        contract = get_active_contract(
            p.id, kurum_id, sube_id=sube_id, egitim_yili_id=egitim_yili_id,
        )
        if sozlesme_turu and (not contract or contract['sozlesme_turu'] != sozlesme_turu):
            continue

        rol_kodu, rol_ad = _rol_fields(g.rol)
        rows.append({
            'id': p.id,
            'ad': p.ad,
            'soyad': p.soyad,
            'tam_ad': p.tam_ad,
            'personel_no': _personel_no(p.id, contract),
            'brans': brans_ad or '—',
            'brans_id': g.brans_id,
            'gorevlendirme_id': g.id,
            'rol_ad': rol_ad or '—',
            'aktif_mi': p.aktif_mi,
            'sube_id': g.gorev_sube_id,
            'sube_ad': g.gorev_sube.ad if g.gorev_sube_id else '',
            'fotograf_url': p.fotograf.url if getattr(p, 'fotograf', None) and p.fotograf else None,
            'sozlesme_turu': contract['sozlesme_turu_display'] if contract else None,
            'sozlesme_id': contract['id'] if contract else None,
        })
    return rows


def get_or_create_default_set(*, personel_id, kurum_id, sube_id) -> TeacherAvailabilitySet:
    existing = TeacherAvailabilitySet.objects.filter(
        personel_id=personel_id,
        sube_id=sube_id,
        kind=AvailabilityKind.DEFAULT,
        is_active=True,
    ).first()
    if existing:
        return existing
    return TeacherAvailabilitySet.objects.create(
        personel_id=personel_id,
        kurum_id=kurum_id,
        sube_id=sube_id,
        kind=AvailabilityKind.DEFAULT,
        title='Varsayılan Uygunluk',
        is_active=True,
    )


def serialize_availability_set(av_set: TeacherAvailabilitySet) -> dict[str, Any]:
    calendar_ids = list(
        av_set.calendar_links.values_list('weekly_cycle_id', flat=True)
    )
    cells = {
        f'{c.weekly_cycle_id}:{c.day_of_week}:{c.timeslot_id}': c.status
        for c in av_set.cells.all()
    }
    return {
        'id': av_set.id,
        'kind': av_set.kind,
        'title': av_set.title,
        'valid_from': av_set.valid_from.isoformat() if av_set.valid_from else None,
        'valid_until': av_set.valid_until.isoformat() if av_set.valid_until else None,
        'is_active': av_set.is_active,
        'calendar_ids': calendar_ids,
        'cells': cells,
        'updated_at': av_set.updated_at.isoformat(),
    }


def compute_summary(cells: dict[str, str], calendar_ids: list[int]) -> dict[str, int]:
    available = preferred = 0
    active_days: set[int] = set()
    for key, status in cells.items():
        if status == SlotAvailabilityStatus.UNAVAILABLE:
            continue
        parts = key.split(':')
        if len(parts) != 3:
            continue
        if int(parts[0]) not in calendar_ids:
            continue
        active_days.add(int(parts[1]))
        if status == SlotAvailabilityStatus.PREFERRED:
            preferred += 1
        elif status == SlotAvailabilityStatus.AVAILABLE:
            available += 1
    return {
        'total_available_slots': available,
        'total_preferred_slots': preferred,
        'weekly_available_days': len(active_days),
        'assigned_calendar_count': len(calendar_ids),
        'estimated_max_weekly_lesson_slots': available + preferred,
    }


def _count_cells_for_calendar(cells: dict[str, str], calendar_id: int) -> dict[str, int]:
    available = preferred = 0
    active_days: set[int] = set()
    for key, status in cells.items():
        if status == SlotAvailabilityStatus.UNAVAILABLE:
            continue
        parts = key.split(':')
        if len(parts) != 3 or int(parts[0]) != calendar_id:
            continue
        active_days.add(int(parts[1]))
        if status == SlotAvailabilityStatus.PREFERRED:
            preferred += 1
        elif status == SlotAvailabilityStatus.AVAILABLE:
            available += 1
    return {
        'total_available_slots': available,
        'total_preferred_slots': preferred,
        'weekly_available_days': len(active_days),
        'estimated_max_weekly_lesson_slots': available + preferred,
    }


def compute_detailed_summary(
    cells: dict[str, str],
    calendar_ids: list[int],
    *,
    calendars: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Takvim ve program tipi bazında özet."""
    base = compute_summary(cells, calendar_ids)
    cal_meta = {c['id']: c for c in (calendars or [])}

    by_calendar: list[dict[str, Any]] = []
    by_program_tipi: dict[str, dict[str, int]] = {
        ProgramTipi.GRUP: {'total_available_slots': 0, 'total_preferred_slots': 0, 'calendar_count': 0},
        ProgramTipi.BIREBIR: {'total_available_slots': 0, 'total_preferred_slots': 0, 'calendar_count': 0},
        ProgramTipi.GENEL: {'total_available_slots': 0, 'total_preferred_slots': 0, 'calendar_count': 0},
    }

    for cid in calendar_ids:
        counts = _count_cells_for_calendar(cells, cid)
        meta = cal_meta.get(cid, {})
        program_tipi = meta.get('program_tipi') or ProgramTipi.GENEL
        by_calendar.append({
            'calendar_id': cid,
            'name': meta.get('name') or f'Takvim #{cid}',
            'program_tipi': program_tipi,
            'program_tipi_display': meta.get('program_tipi_display') or program_tipi,
            'color': meta.get('color') or '#64748b',
            **counts,
        })
        bucket = by_program_tipi.setdefault(
            program_tipi,
            {'total_available_slots': 0, 'total_preferred_slots': 0, 'calendar_count': 0},
        )
        bucket['total_available_slots'] += counts['total_available_slots']
        bucket['total_preferred_slots'] += counts['total_preferred_slots']
        bucket['calendar_count'] += 1

    by_program_tipi_list = [
        {
            'program_tipi': tip,
            'program_tipi_display': dict(ProgramTipi.choices).get(tip, tip),
            **stats,
            'estimated_max_weekly_lesson_slots': (
                stats['total_available_slots'] + stats['total_preferred_slots']
            ),
        }
        for tip, stats in by_program_tipi.items()
        if stats['calendar_count'] > 0
    ]

    return {
        **base,
        'by_calendar': by_calendar,
        'by_program_tipi': by_program_tipi_list,
    }


def contract_conflicts(
    *,
    contract: dict[str, Any] | None,
    cells: dict[str, str],
    calendar_ids: list[int],
) -> list[dict[str, str]]:
    if not contract:
        return []
    working = set(contract.get('working_days_academic') or [])
    warnings: list[dict[str, str]] = []
    seen_days: set[int] = set()
    for key, status in cells.items():
        if status == SlotAvailabilityStatus.UNAVAILABLE:
            continue
        parts = key.split(':')
        if len(parts) != 3 or int(parts[0]) not in calendar_ids:
            continue
        dow = int(parts[1])
        if dow in seen_days or dow in working:
            continue
        seen_days.add(dow)
        warnings.append({
            'type': 'contract_day',
            'day_of_week': str(dow),
            'day_label': GUN_LABELS.get(dow, str(dow)),
            'message': (
                f'{GUN_LABELS.get(dow, "Gün")} sözleşmede çalışma günü değil; '
                f'yine de uygunluk tanımlanmış.'
            ),
        })
    return warnings


@transaction.atomic
def save_availability_set(
    *,
    av_set: TeacherAvailabilitySet,
    calendar_ids: list[int],
    cells: dict[str, str],
    title: str = '',
    valid_from=None,
    valid_until=None,
) -> TeacherAvailabilitySet:
    av_set.title = title or av_set.title
    av_set.valid_from = valid_from
    av_set.valid_until = valid_until
    av_set.save()

    av_set.calendar_links.exclude(weekly_cycle_id__in=calendar_ids).delete()
    existing_cals = set(av_set.calendar_links.values_list('weekly_cycle_id', flat=True))
    for cid in calendar_ids:
        if cid not in existing_cals:
            TeacherAvailabilityCalendar.objects.create(
                availability_set=av_set,
                weekly_cycle_id=cid,
            )

    av_set.cells.all().delete()
    bulk = []
    for key, status in cells.items():
        if status == SlotAvailabilityStatus.UNAVAILABLE:
            continue
        parts = key.split(':')
        if len(parts) != 3:
            continue
        cycle_id, dow, slot_id = int(parts[0]), int(parts[1]), int(parts[2])
        if cycle_id not in calendar_ids:
            continue
        bulk.append(
            TeacherAvailabilityCell(
                availability_set=av_set,
                weekly_cycle_id=cycle_id,
                day_of_week=dow,
                timeslot_id=slot_id,
                status=status,
            )
        )
    if bulk:
        TeacherAvailabilityCell.objects.bulk_create(bulk, ignore_conflicts=True)
    return av_set


def resolve_active_set_for_date(personel_id: int, sube_id: int, ref: date | None = None) -> TeacherAvailabilitySet | None:
    ref = ref or date.today()
    temp = (
        TeacherAvailabilitySet.objects.filter(
            personel_id=personel_id,
            sube_id=sube_id,
            kind=AvailabilityKind.TEMPORARY,
            is_active=True,
            valid_from__lte=ref,
            valid_until__gte=ref,
        )
        .order_by('-valid_from')
        .first()
    )
    if temp:
        return temp
    return TeacherAvailabilitySet.objects.filter(
        personel_id=personel_id,
        sube_id=sube_id,
        kind=AvailabilityKind.DEFAULT,
        is_active=True,
    ).first()
