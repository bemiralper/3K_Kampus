"""Sınıf ders programı toplu dışa aktarma — grid matrisi + kurumsal Excel/CSV."""
from __future__ import annotations

import csv
import io
from typing import Any, Optional

from django.http import HttpResponse

from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.weekly_day import WeeklyDay
from apps.academic.services.grid_engine import collapse_lesson_slots_by_time
from apps.sinif.domain.models import Sinif
from apps.term.domain.models import Term


class ScheduleExportError(Exception):
    def __init__(self, message: str, field: Optional[str] = None):
        self.message = message
        self.field = field
        super().__init__(message)


TEACHER_DISPLAY_MODES = ('full', 'initials', 'hidden')
COLOR_BY_MODES = ('ders', 'ogretmen', 'none')


def _u32(n: int) -> int:
    return n & 0xFFFFFFFF


def _i32(n: int) -> int:
    n = _u32(n)
    return n - 0x100000000 if n >= 0x80000000 else n


def _imul32(a: int, b: int) -> int:
    return _i32(_u32(a) * _u32(b))


def _schedule_hash_id(cid: int) -> int:
    """frontend/lib/schedule-color.ts hashId ile birebir."""
    x = _imul32(cid ^ 0x9E3779B9, 0x85EBCA6B)
    x = _i32(x ^ (_u32(x) >> 13))
    x = _imul32(x, 0xC2B2AE35)
    x = _i32(x ^ (_u32(x) >> 16))
    return abs(x)


def _hsl_to_rgb_hex(h: int, s: int, l: int) -> str:
    """HSL (0–360, 0–100, 0–100) → RRGGBB (openpyxl)."""
    hf = h / 360.0
    sf = s / 100.0
    lf = l / 100.0
    a = sf * min(lf, 1 - lf)

    def f(n: float) -> int:
        k = (n + hf * 12) % 12
        color = lf - a * max(min(k - 3, 9 - k, 1), -1)
        return max(0, min(255, round(255 * color)))

    return f'{f(0):02X}{f(8):02X}{f(4):02X}'


def schedule_cell_palette(entity_id: int | None) -> dict[str, str] | None:
    """Ekrandaki pastel kart renkleri — bg / border / text (RRGGBB)."""
    if not entity_id or entity_id <= 0:
        return None
    h = _schedule_hash_id(entity_id) % 360
    s = 48 + (_schedule_hash_id(entity_id + 7) % 18)
    l = 88 + (_schedule_hash_id(entity_id + 13) % 6)
    border_l = max(62, l - 22)
    return {
        'bg': _hsl_to_rgb_hex(h, s, l),
        'border': _hsl_to_rgb_hex(h, min(70, s + 12), border_l),
        'text': _hsl_to_rgb_hex(h, min(55, s), 22),
    }


def schedule_cell_fill_hex(entity_id: int | None) -> str | None:
    """Ekrandaki pastel hücre rengi (bg) — ders/öğretmen id."""
    pal = schedule_cell_palette(entity_id)
    return pal['bg'] if pal else None


def card_entity_id(cell: dict[str, Any] | None) -> int | None:
    if not cell:
        return None
    for key in ('classroom_id', 'teacher_id', 'lesson_id'):
        raw = cell.get(key)
        if raw in (None, '', 0, '0'):
            continue
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        if value > 0:
            return value
    return None


def format_teacher_name(full_name: str, mode: str = 'full') -> str:
    """Öğretmen adı: full | initials (A. Y.) | hidden."""
    name = (full_name or '').strip()
    if not name or mode == 'hidden':
        return ''
    if mode == 'initials':
        parts = [p for p in name.replace('.', ' ').split() if p]
        if not parts:
            return ''
        return ' '.join(f'{p[0].upper()}.' for p in parts)
    return name


def _apply_teacher_to_cell(cell: dict[str, Any], mode: str) -> dict[str, Any]:
    teacher = format_teacher_name(cell.get('teacher') or '', mode)
    lesson = cell.get('lesson') or ''
    label = lesson
    if teacher:
        label = f'{lesson}\n{teacher}'.strip()
    return {
        **cell,
        'teacher': teacher,
        'label': label,
    }


def apply_teacher_display(payload: dict[str, Any], mode: str = 'full') -> dict[str, Any]:
    """Payload hücrelerindeki öğretmen metnini seçilen moda göre düzenle."""
    if mode not in TEACHER_DISPLAY_MODES:
        mode = 'full'
    for group in payload.get('groups') or []:
        for row in group.get('rows') or []:
            row['cells'] = [
                _apply_teacher_to_cell(cell, mode) if cell else None
                for cell in row.get('cells') or []
            ]
        if group.get('day_cards'):
            group['day_cards'] = [
                [_apply_teacher_to_cell(card, mode) for card in (col or [])]
                for col in group['day_cards']
            ]
    payload['teacher_display'] = mode
    return payload


def _slots_for_version(version: ScheduleVersion, day_ids: list[int]) -> list:
    from apps.academic.services.grid_engine import collect_calendar_slots

    slots, valid_keys = collect_calendar_slots(version)
    allowed_days = set(day_ids)
    allowed_slot_ids = {
        slot_id for day_id, slot_id in valid_keys if day_id in allowed_days
    }
    return [slot for slot in slots if slot.id in allowed_slot_ids]


def _canonical_days_for_versions(versions: list[ScheduleVersion]) -> list[dict[str, Any]]:
    from apps.academic.domain.weekly_day import WeeklyDay

    cycle_ids = [v.weekly_cycle_id for v in versions if v.weekly_cycle_id]
    seen: dict[int, dict[str, Any]] = {}
    for day in WeeklyDay.objects.filter(
        weekly_cycle_id__in=cycle_ids,
        is_active=True,
    ).order_by('order', 'day_of_week'):
        if day.day_of_week in seen:
            continue
        seen[day.day_of_week] = {
            'id': day.day_of_week,
            'name': day.name,
            'short_name': getattr(day, 'day_name_short', None) or day.name[:3],
            'order': day.order if day.order else day.day_of_week + 1,
        }
    return [seen[k] for k in sorted(seen)]


def _merged_slots_for_versions(versions: list[ScheduleVersion]) -> list:
    from apps.academic.domain.timeslot import TimeSlot
    from apps.academic.domain.weekly_day import WeeklyDay
    from apps.academic.services.grid_engine import collapse_lesson_slots_by_time

    template_ids = set()
    cycle_ids = []
    for version in versions:
        if version.schedule_template_id:
            template_ids.add(version.schedule_template_id)
        if version.weekly_cycle_id:
            cycle_ids.append(version.weekly_cycle_id)
    if cycle_ids:
        template_ids.update(
            WeeklyDay.objects.filter(
                weekly_cycle_id__in=cycle_ids,
                is_active=True,
                schedule_template_id__isnull=False,
            ).values_list('schedule_template_id', flat=True)
        )
    if not template_ids:
        return []
    slots = TimeSlot.objects.filter(
        schedule_template_id__in=template_ids,
        slot_type='LESSON',
        is_active=True,
    ).order_by('start_time', 'order', 'id')
    slots, _ = collapse_lesson_slots_by_time(slots)
    return list(slots)


def _term_versions(term_id: int, version_id: Optional[int] = None) -> list[ScheduleVersion]:
    if version_id:
        version = (
            ScheduleVersion.objects.select_related('weekly_cycle', 'schedule_template')
            .filter(pk=version_id, term_id=term_id)
            .first()
        )
        return [version] if version else []
    rows = list(
        ScheduleVersion.objects.filter(term_id=term_id)
        .select_related('weekly_cycle', 'schedule_template')
        .order_by('weekly_cycle_id', '-is_active', '-id')
    )
    by_cycle: dict[Any, ScheduleVersion] = {}
    for version in rows:
        if version.weekly_cycle_id not in by_cycle:
            by_cycle[version.weekly_cycle_id] = version
    return list(by_cycle.values())


def pretty_class_label(value: str) -> str:
    import re

    text = (value or '').replace('_', ' ')
    text = re.sub(r'\s*/\s*', ' / ', text)
    return re.sub(r'\s+', ' ', text).strip()


def format_rail_card(cell: dict[str, Any] | None) -> str:
    """Ekrandaki öğretmen kartı: 10:40 / 11:20 / ders / sınıf."""
    if not cell:
        return ''
    start = (cell.get('start') or '').strip()
    end = (cell.get('end') or '').strip()
    lesson = (cell.get('lesson') or '').strip()
    who = pretty_class_label(cell.get('classroom') or cell.get('teacher') or '')
    lines = [part for part in (start, end, lesson, who) if part]
    return '\n'.join(lines)


def export_uses_cards(payload: dict[str, Any]) -> bool:
    return payload.get('subject_kind') in ('teacher', 'class') or payload.get('layout_kind') == 'day_cards'


def card_who_value(card: dict[str, Any], *, subject_kind: str) -> str:
    if subject_kind == 'teacher':
        return pretty_class_label(card.get('classroom') or card.get('teacher') or '')
    return pretty_class_label(card.get('teacher') or '')


def split_day_cards(columns: list[list[dict[str, Any]]]) -> list[list[dict[str, Any]]]:
    """Aynı hücreye birleşmiş dersleri ayrı kartlara ayır."""
    split: list[list[dict[str, Any]]] = []
    for cards in columns:
        out: list[dict[str, Any]] = []
        for card in cards:
            lessons = [part.strip() for part in (card.get('lesson') or '').split('\n') if part.strip()]
            teachers = [part.strip() for part in (card.get('teacher') or '').split('\n') if part.strip()]
            if len(lessons) <= 1:
                out.append(card)
                continue
            for index, lesson in enumerate(lessons):
                out.append({
                    **card,
                    'lesson': lesson,
                    'teacher': teachers[index] if index < len(teachers) else (teachers[0] if teachers else ''),
                })
        split.append(out)
    return split


def group_card_columns(days: list[dict[str, Any]], group: dict[str, Any]) -> list[list[dict[str, Any]]]:
    return split_day_cards(group.get('day_cards') or day_card_columns(days, group.get('rows') or []))


def day_card_columns(days: list[dict[str, Any]], rows: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    columns: list[list[dict[str, Any]]] = [[] for _ in days]
    for row in rows:
        start = ''
        end = ''
        slot_time = row.get('slot_time') or ''
        if '–' in slot_time:
            start, _, end = slot_time.partition('–')
            start, end = start.strip(), end.strip()
        elif '-' in slot_time:
            start, _, end = slot_time.partition('-')
            start, end = start.strip(), end.strip()
        for index, cell in enumerate(row.get('cells') or []):
            if not cell or index >= len(columns):
                continue
            columns[index].append({
                **cell,
                'start': cell.get('start') or start,
                'end': cell.get('end') or end,
            })
    for cards in columns:
        cards.sort(key=lambda c: (c.get('start') or '99:99', c.get('end') or '', c.get('lesson') or ''))
    return columns


def _cell_lesson_payload(cell) -> dict[str, Any]:
    from apps.egitim_tanimlari.display import resolve_ders_display_name

    lesson_name = resolve_ders_display_name(
        ders=cell.ders if cell.ders_id else None,
        plan=getattr(cell, 'class_lesson_plan', None),
    )
    teacher_name = (
        f'{cell.ogretmen.ad} {cell.ogretmen.soyad}'.strip()
        if cell.ogretmen_id else ''
    )
    classroom_name = cell.sinif.ad if cell.sinif_id else ''
    return {
        'lesson': lesson_name,
        'lesson_id': cell.ders_id,
        'teacher': teacher_name,
        'teacher_id': cell.ogretmen_id,
        'classroom': classroom_name,
        'classroom_id': cell.sinif_id,
        'label': (
            f'{lesson_name}'
            + (f'\n{teacher_name}' if teacher_name else '')
        ).strip(),
    }


def _payload_shell(term, versions: list[ScheduleVersion], *, report_title: str) -> dict[str, Any]:
    primary = versions[0]
    calendars = []
    for version in versions:
        name = version.weekly_cycle.name if version.weekly_cycle_id else ''
        if name and name not in calendars:
            calendars.append(name)
    egitim_yili = ''
    if term.egitim_yili_id:
        egitim_yili = str(term.egitim_yili)
    days = _canonical_days_for_versions(versions)
    slots = _merged_slots_for_versions(versions)
    slots_meta = [
        {
            'id': s.id,
            'name': s.name,
            'start': s.start_time.strftime('%H:%M') if s.start_time else '',
            'end': s.end_time.strftime('%H:%M') if s.end_time else '',
            'order': s.order,
        }
        for s in slots
    ]
    return {
        'term': {'id': term.id, 'name': term.name},
        'version': {
            'id': primary.id,
            'name': primary.name,
            'is_locked': primary.is_locked,
        },
        'calendar_name': ' · '.join(calendars) if len(calendars) > 1 else (calendars[0] if calendars else ''),
        'kurum_ad': term.kurum.ad if term.kurum_id else '',
        'sube_ad': term.sube.ad if term.sube_id else '',
        'egitim_yili': egitim_yili,
        'report_title': report_title,
        'days': days,
        'slots': slots_meta,
        '_slot_objs': slots,
    }


def _rows_from_cell_map(days, slots, cell_map: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for slot in slots:
        row = {
            'slot_id': slot.id,
            'slot_name': slot.name,
            'slot_time': (
                f"{slot.start_time.strftime('%H:%M') if slot.start_time else ''}"
                f"–{slot.end_time.strftime('%H:%M') if slot.end_time else ''}"
            ),
            'cells': [],
        }
        for day in days:
            key = f'{day["id"]}:{slot.id}'
            row['cells'].append(cell_map.get(key))
        rows.append(row)
    return rows


def _append_cell_to_export_map(
    cell_map: dict[str, dict[str, Any]],
    key: str,
    item: dict[str, Any],
) -> None:
    """
    Birden çok çalışma takviminde aynı gün/saatte ders olabilir.

    Grid hücresinin tek nesne sözleşmesini bozmadan, hiçbir dersi atlamamak
    için sonraki dersleri aynı hücre metnine ekler. Öğretmen programının
    kart görünümü ise aşağıda bağımsız ``day_cards`` listesini kullandığından
    her dersi ayrı kart olarak gösterir.
    """
    existing = cell_map.get(key)
    if not existing:
        cell_map[key] = item
        return

    def add_line(current: str, incoming: str) -> str:
        current = (current or '').strip()
        incoming = (incoming or '').strip()
        if not incoming or incoming in current.split('\n'):
            return current
        return f'{current}\n{incoming}' if current else incoming

    existing['lesson'] = add_line(existing.get('lesson') or '', item.get('lesson') or '')
    existing['teacher'] = add_line(existing.get('teacher') or '', item.get('teacher') or '')
    existing['label'] = add_line(existing.get('label') or '', item.get('label') or '')


def build_teacher_schedule_payload(
    *,
    term_id: int,
    teacher_id: int,
    sube_id: int,
    version_id: Optional[int] = None,
) -> dict[str, Any]:
    from django.db.models import Q

    from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
    from apps.personel.domain.models import Personel
    from apps.term.domain.models import Term

    try:
        term = Term.objects.select_related('kurum', 'sube', 'egitim_yili').get(
            pk=term_id, sube_id=sube_id,
        )
    except Term.DoesNotExist as exc:
        raise ScheduleExportError('Dönem bulunamadı.', 'term_id') from exc

    teacher = Personel.objects.filter(pk=teacher_id, kurum_id=term.kurum_id).first()
    if not teacher:
        raise ScheduleExportError('Öğretmen bulunamadı.', 'teacher_id')

    versions = _term_versions(term_id, version_id)
    if not versions:
        raise ScheduleExportError(
            'Bu dönem için program bulunamadı. Önce Ders Programı ekranından program oluşturun.',
            'term_id',
        )

    payload = _payload_shell(term, versions, report_title='ÖĞRETMEN PROGRAMI')
    days = payload['days']
    slots = payload.pop('_slot_objs')

    cells = ProgramGridCell.objects.filter(
        schedule_version_id__in=[v.id for v in versions],
        is_active=True,
        status=CellStatus.FILLED,
    ).filter(
        Q(ogretmen_id=teacher_id) | Q(class_lesson_plan__ogretmen_id=teacher_id)
    ).select_related(
        'ders', 'ogretmen', 'sinif', 'weekly_day', 'timeslot',
        'class_lesson_plan', 'class_lesson_plan__ders',
        'schedule_version', 'schedule_version__weekly_cycle',
    )

    cell_map: dict[str, dict[str, Any]] = {}
    cards_by_day: dict[int, list[dict[str, Any]]] = {day['id']: [] for day in days}
    for cell in cells:
        if not cell.weekly_day_id:
            continue
        day_id = cell.weekly_day.day_of_week
        key = f'{day_id}:{cell.timeslot_id}'
        item = _cell_lesson_payload(cell)
        classroom = item.get('classroom') or ''
        item['teacher'] = classroom
        item['teacher_id'] = item.get('classroom_id')
        item['start'] = (
            cell.timeslot.start_time.strftime('%H:%M')
            if getattr(cell, 'timeslot', None) and cell.timeslot.start_time
            else ''
        )
        item['end'] = (
            cell.timeslot.end_time.strftime('%H:%M')
            if getattr(cell, 'timeslot', None) and cell.timeslot.end_time
            else ''
        )
        cycle = getattr(getattr(cell, 'schedule_version', None), 'weekly_cycle', None)
        item['calendar_name'] = cycle.name if cycle else ''
        item['label'] = format_rail_card(item)
        _append_cell_to_export_map(cell_map, key, item)
        if day_id in cards_by_day:
            cards_by_day[day_id].append(item)

    # Birebir haftalık slotlar dönem yerine eğitim yılına bağlıdır. Aktif
    # programlar bitene kadar öğretmen görünümü ve export içinde kalır.
    from apps.egitim_tanimlari.display import resolve_ders_display_name
    from apps.ozel_ders.domain.models import BirebirHaftalikSlot, ProgramDurumu

    private_count = 0
    private_slots = BirebirHaftalikSlot.objects.filter(
        ogretmen_id=teacher_id,
        aktif=True,
        program__durum=ProgramDurumu.AKTIF,
        program__kurum_id=term.kurum_id,
        program__sube_id=sube_id,
        program__egitim_yili_id=term.egitim_yili_id,
    ).select_related('ders', 'program__ogrenci').order_by('gun', 'baslangic', 'id')
    for slot in private_slots:
        day_id = slot.gun - 1
        if day_id not in cards_by_day:
            continue
        student = getattr(slot.program, 'ogrenci', None)
        student_name = f'{student.ad} {student.soyad}'.strip() if student else 'Özel Ders'
        item = {
            'lesson': resolve_ders_display_name(ders=slot.ders),
            'lesson_id': slot.ders_id,
            'teacher': '',
            'teacher_id': teacher_id,
            'classroom': student_name,
            'classroom_id': student.id if student else None,
            'start': slot.baslangic.strftime('%H:%M'),
            'end': slot.bitis.strftime('%H:%M'),
            'calendar_name': 'Özel Ders',
            'label': '',
        }
        item['label'] = format_rail_card(item)
        cards_by_day[day_id].append(item)
        private_count += 1

    teacher_name = f'{teacher.ad} {teacher.soyad}'.strip()
    rows = _rows_from_cell_map(days, slots, cell_map)
    day_cards = [cards_by_day.get(day['id'], []) for day in days]
    for cards in day_cards:
        cards.sort(key=lambda card: (
            card.get('start') or '99:99',
            card.get('end') or '',
            card.get('lesson') or '',
        ))
    payload['subject_kind'] = 'teacher'
    payload['layout_kind'] = 'day_cards'
    payload['groups'] = [{
        'classroom_id': teacher.id,
        'classroom_name': teacher_name,
        'rows': rows,
        'day_cards': day_cards,
        'filled_count': len(cells) + private_count,
    }]
    return payload


def build_classroom_schedule_payload(
    *,
    term_id: int,
    version_id: Optional[int],
    classroom_ids: list[int],
    sube_id: int,
) -> dict[str, Any]:
    try:
        term = Term.objects.select_related('kurum', 'sube', 'egitim_yili').get(
            pk=term_id, sube_id=sube_id,
        )
    except Term.DoesNotExist as exc:
        raise ScheduleExportError('Dönem bulunamadı.', 'term_id') from exc

    classrooms = list(
        Sinif.objects.filter(
            id__in=classroom_ids,
            sube_id=sube_id,
            aktif_mi=True,
        ).order_by('ad')
    )
    if not classrooms:
        raise ScheduleExportError('Dışa aktarılacak sınıf yok.', 'classroom_ids')

    versions = _term_versions(term_id, version_id)
    if not versions:
        raise ScheduleExportError(
            'Bu dönem için program bulunamadı. Önce Ders Programı ekranından program oluşturun.',
            'version_id' if version_id else 'term_id',
        )

    # Tek program istendiyse eski (takvim gün id) ızgara; aksi halde birleşik görünüm.
    if version_id and len(versions) == 1:
        version = versions[0]
        days = list(
            WeeklyDay.objects.filter(
                weekly_cycle=version.weekly_cycle,
                is_active=True,
            ).order_by('order')
        )
        slots = _slots_for_version(version, [d.id for d in days])
        slots, timeslot_id_map = collapse_lesson_slots_by_time(slots)
        days_meta = [
            {
                'id': d.id,
                'name': d.name,
                'short_name': getattr(d, 'day_name_short', None) or d.name[:3],
                'order': d.order,
            }
            for d in days
        ]
        version_ids = [version.id]
        day_key_fn = lambda cell: cell.weekly_day_id
        slot_key_fn = lambda cell: timeslot_id_map.get(cell.timeslot_id, cell.timeslot_id)
        day_iter = days
    else:
        payload = _payload_shell(term, versions, report_title='DERS PROGRAMI')
        days_meta = payload['days']
        slots = payload.pop('_slot_objs')
        version_ids = [v.id for v in versions]
        day_key_fn = lambda cell: cell.weekly_day.day_of_week if cell.weekly_day_id else None
        slot_key_fn = lambda cell: cell.timeslot_id
        day_iter = days_meta
        version = versions[0]

    slots_meta = [
        {
            'id': s.id,
            'name': s.name,
            'start': s.start_time.strftime('%H:%M') if s.start_time else '',
            'end': s.end_time.strftime('%H:%M') if s.end_time else '',
            'order': s.order,
        }
        for s in slots
    ]

    day_index_by_id = {
        (day['id'] if isinstance(day, dict) else day.id): index
        for index, day in enumerate(day_iter)
    }

    groups = []
    for sinif in classrooms:
        cells = list(ProgramGridCell.objects.filter(
            schedule_version_id__in=version_ids,
            sinif_id=sinif.id,
            is_active=True,
            status=CellStatus.FILLED,
        ).select_related(
            'ders', 'ogretmen', 'sinif', 'weekly_day', 'timeslot',
            'class_lesson_plan', 'class_lesson_plan__ders',
        ))

        cell_map: dict[str, dict[str, Any]] = {}
        day_cards: list[list[dict[str, Any]]] = [[] for _ in day_iter]
        for c in cells:
            day_key = day_key_fn(c)
            if day_key is None:
                continue
            key = f'{day_key}:{slot_key_fn(c)}'
            item = _cell_lesson_payload(c)
            _append_cell_to_export_map(cell_map, key, item)
            column = day_index_by_id.get(day_key)
            if column is None:
                continue
            start = ''
            end = ''
            if c.timeslot_id and c.timeslot:
                if c.timeslot.start_time:
                    start = c.timeslot.start_time.strftime('%H:%M')
                if c.timeslot.end_time:
                    end = c.timeslot.end_time.strftime('%H:%M')
            day_cards[column].append({
                **item,
                'start': start,
                'end': end,
            })

        for cards in day_cards:
            cards.sort(key=lambda card: (
                card.get('start') or '99:99',
                card.get('end') or '',
                card.get('lesson') or '',
            ))

        rows = []
        for slot in slots:
            row = {
                'slot_id': slot.id,
                'slot_name': slot.name,
                'slot_time': (
                    f"{slot.start_time.strftime('%H:%M') if slot.start_time else ''}"
                    f"–{slot.end_time.strftime('%H:%M') if slot.end_time else ''}"
                ),
                'cells': [],
            }
            for day in day_iter:
                day_id = day['id'] if isinstance(day, dict) else day.id
                key = f'{day_id}:{slot.id}'
                row['cells'].append(cell_map.get(key))
            rows.append(row)

        groups.append({
            'classroom_id': sinif.id,
            'classroom_name': sinif.ad,
            'rows': rows,
            'day_cards': day_cards,
            'filled_count': len(cells),
        })

    calendars = []
    for ver in versions:
        name = ver.weekly_cycle.name if ver.weekly_cycle_id else ''
        if name and name not in calendars:
            calendars.append(name)

    egitim_yili = ''
    if term.egitim_yili_id:
        egitim_yili = str(term.egitim_yili)

    return {
        'term': {'id': term.id, 'name': term.name},
        'version': {
            'id': version.id,
            'name': version.name,
            'is_locked': version.is_locked,
        },
        'calendar_name': ' · '.join(calendars) if len(calendars) > 1 else (calendars[0] if calendars else ''),
        'kurum_ad': term.kurum.ad if term.kurum_id else '',
        'sube_ad': term.sube.ad if term.sube_id else '',
        'egitim_yili': egitim_yili,
        'report_title': 'SINIF PROGRAMI',
        'subject_kind': 'class',
        'days': days_meta,
        'slots': slots_meta,
        'groups': groups,
    }


def _report_meta(payload: dict[str, Any]):
    from shared.export.style_manager import ReportMeta

    return ReportMeta(
        report_title=payload.get('report_title') or 'DERS PROGRAMI',
        kurum_ad=payload.get('kurum_ad') or '',
        sube_ad=payload.get('sube_ad') or '',
        egitim_yili=payload.get('egitim_yili') or '',
        extra={
            'Dönem': payload['term']['name'],
        },
    )


def export_schedule_csv(payload: dict[str, Any], *, filename: str) -> HttpResponse:
    """Kurumsal letterhead + sınıf blokları (öğrenci listesi CSV kalıbı)."""
    from shared.export.csv_export_service import CsvExportService
    from shared.export import style_manager as sm

    days = payload['days']
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=';', lineterminator='\n')
    CsvExportService.write_letterhead_rows(writer, _report_meta(payload))
    writer.writerow([f"Dönem: {payload['term']['name']}"])
    writer.writerow([])

    use_cards = export_uses_cards(payload)
    subject_kind = payload.get('subject_kind') or 'class'
    who_header = 'Sınıf' if subject_kind == 'teacher' else 'Öğretmen'

    for group in payload['groups']:
        writer.writerow([group['classroom_name']])
        if use_cards:
            columns = group_card_columns(days, group)
            writer.writerow(['Gün', 'Sıra', 'Başlangıç', 'Bitiş', 'Ders', who_header])
            for day, cards in zip(days, columns):
                for order, card in enumerate(cards, 1):
                    writer.writerow([
                        day.get('name') or day.get('short_name') or '',
                        f'{order}. Ders',
                        (card.get('start') or '').strip(),
                        (card.get('end') or '').strip(),
                        (card.get('lesson') or '').strip(),
                        card_who_value(card, subject_kind=subject_kind),
                    ])
        else:
            writer.writerow(['Saat'] + [d['short_name'] or d['name'] for d in days])
            for row in group['rows']:
                cells = []
                for cell in row['cells']:
                    if not cell:
                        cells.append('')
                    else:
                        text = cell.get('lesson') or ''
                        if cell.get('teacher'):
                            text = f"{text} ({cell['teacher']})"
                        cells.append(text)
                writer.writerow([f"{row['slot_name']} {row.get('slot_time') or ''}".strip()] + cells)
        writer.writerow([])

    content = '\ufeff' + buf.getvalue()
    response = HttpResponse(content, content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{sm.safe_filename(filename)}.csv"'
    return response


def export_schedule_xlsx(
    payload: dict[str, Any],
    *,
    filename: str,
    layout: str = 'stacked',
    color_by: str = 'ders',
) -> HttpResponse:
    """Kurumsal logo + letterhead ile haftalık grid Excel (öğrenci listesi altyapısı)."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter
    from shared.export import style_manager as sm
    from shared.export.excel_export_service import ExcelExportService
    from shared.export.style_manager import ExportStat

    if color_by not in COLOR_BY_MODES:
        color_by = 'ders'

    days = payload['days']
    use_cards = export_uses_cards(payload)
    subject_kind = payload.get('subject_kind') or 'class'
    num_cols = max(2, (len(days) * 2) if use_cards else 1 + len(days))
    meta = _report_meta(payload)
    stats = [
        ExportStat(label='Sınıf sayısı', value=len(payload['groups']), type='integer'),
        ExportStat(label='Dönem', value=payload['term']['name'], type='text'),
    ]

    thin = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1'),
    )
    header_fill = PatternFill('solid', fgColor='E8F1F8')
    header_font = Font(name=sm.FONT_NAME, size=11, bold=True, color=sm.BRAND_PRIMARY_HEX)
    cell_font = Font(name=sm.FONT_NAME, size=10, color='0F172A')
    title_font = Font(name=sm.FONT_NAME, size=13, bold=True, color=sm.BRAND_PRIMARY_HEX)
    slot_fill = PatternFill('solid', fgColor='F8FAFC')
    fill_cache: dict[int, PatternFill] = {}

    def fill_for_cell(cell_data: dict[str, Any] | None) -> PatternFill | None:
        if color_by == 'none' or not cell_data:
            return None
        if use_cards and subject_kind == 'teacher':
            eid = cell_data.get('classroom_id') or cell_data.get('teacher_id') or cell_data.get('lesson_id')
        elif color_by == 'ogretmen':
            eid = cell_data.get('teacher_id')
        else:
            eid = cell_data.get('lesson_id')
        try:
            eid_int = int(eid) if eid is not None else 0
        except (TypeError, ValueError):
            return None
        hex_bg = schedule_cell_fill_hex(eid_int)
        if not hex_bg:
            return None
        if eid_int not in fill_cache:
            fill_cache[eid_int] = PatternFill('solid', fgColor=hex_bg)
        return fill_cache[eid_int]

    def write_class_grid(ws, group, start_row: int, *, show_title: bool = True) -> int:
        r = start_row
        if show_title:
            title_cell = ws.cell(row=r, column=1, value=group['classroom_name'])
            title_cell.font = title_font
            title_cell.alignment = Alignment(horizontal='left', vertical='center')
            if num_cols > 1:
                ws.merge_cells(
                    start_row=r, start_column=1,
                    end_row=r, end_column=num_cols,
                )
            ws.row_dimensions[r].height = 22
            r += 1

        if use_cards:
            for day_i, day in enumerate(days):
                rail_col = day_i * 2 + 1
                body_col = rail_col + 1
                head = ws.cell(row=r, column=rail_col, value=day.get('short_name') or day.get('name'))
                head.font = header_font
                head.fill = header_fill
                head.border = thin
                head.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
                twin = ws.cell(row=r, column=body_col)
                twin.fill = header_fill
                twin.border = thin
                if body_col > rail_col:
                    ws.merge_cells(
                        start_row=r, start_column=rail_col,
                        end_row=r, end_column=body_col,
                    )
            ws.row_dimensions[r].height = 20
            r += 1

            columns = group_card_columns(days, group)
            depth = max((len(col) for col in columns), default=0)

            for index in range(depth):
                for day_i, cards in enumerate(columns):
                    card = cards[index] if index < len(cards) else None
                    if not card:
                        continue
                    rail_col = day_i * 2 + 1
                    body_col = rail_col + 1
                    entity = (
                        (card.get('lesson_id') or card.get('teacher_id') or card_entity_id(card))
                        if subject_kind != 'teacher'
                        else card_entity_id(card)
                    )
                    pal = schedule_cell_palette(entity) if color_by != 'none' else None
                    fill = PatternFill('solid', fgColor=pal['bg']) if pal else None
                    ink = pal['text'] if pal else '0F172A'
                    edge = pal['border'] if pal else 'CBD5E1'
                    box = Border(
                        left=Side(style='medium', color=ink),
                        right=Side(style='thin', color=edge),
                        top=Side(style='thin', color=edge),
                        bottom=Side(style='thin', color=edge),
                    )
                    rail_box = Border(
                        left=Side(style='medium', color=ink),
                        right=Side(style='medium', color=ink),
                        top=Side(style='thin', color=edge),
                        bottom=Side(style='thin', color=edge),
                    )
                    start = (card.get('start') or '').strip()
                    end = (card.get('end') or '').strip()
                    rail_text = '\n'.join(part for part in (str(index + 1), start, end) if part)
                    ws.merge_cells(
                        start_row=r, start_column=rail_col,
                        end_row=r + 1, end_column=rail_col,
                    )
                    rail = ws.cell(row=r, column=rail_col, value=rail_text)
                    rail.font = Font(name=sm.FONT_NAME, size=8, bold=True, color=ink)
                    rail.alignment = Alignment(
                        horizontal='right', vertical='center', wrap_text=True,
                    )
                    lesson = ws.cell(row=r, column=body_col, value=(card.get('lesson') or '').strip())
                    lesson.font = Font(name=sm.FONT_NAME, size=10, bold=True, color=ink)
                    lesson.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
                    who = ws.cell(
                        row=r + 1,
                        column=body_col,
                        value=card_who_value(card, subject_kind=subject_kind),
                    )
                    who.font = Font(name=sm.FONT_NAME, size=9, color=ink)
                    who.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
                    for rr, cc, brd in (
                        (r, rail_col, rail_box),
                        (r + 1, rail_col, rail_box),
                        (r, body_col, box),
                        (r + 1, body_col, box),
                    ):
                        painted = ws.cell(row=rr, column=cc)
                        painted.border = brd
                        if fill is not None:
                            painted.fill = fill
                for offset in range(2):
                    ws.row_dimensions[r + offset].height = 18
                r += 3

            for day_i in range(len(days)):
                ws.column_dimensions[get_column_letter(day_i * 2 + 1)].width = 8
                ws.column_dimensions[get_column_letter(day_i * 2 + 2)].width = 18
            return r + 1

        headers = ['Saat'] + [d['short_name'] or d['name'] for d in days]
        for col, h in enumerate(headers, 1):
            cell = ws.cell(row=r, column=col, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.border = thin
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        ws.row_dimensions[r].height = 20
        r += 1

        for row in group['rows']:
            slot_label = row['slot_name']
            if row.get('slot_time'):
                slot_label = f"{row['slot_name']}\n{row['slot_time']}"
            c0 = ws.cell(row=r, column=1, value=slot_label)
            c0.font = cell_font
            c0.fill = slot_fill
            c0.border = thin
            c0.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
            for col, cell_data in enumerate(row['cells'], 2):
                text = ''
                if cell_data:
                    text = cell_data['lesson']
                    if cell_data.get('teacher'):
                        text = f"{text}\n{cell_data['teacher']}"
                c = ws.cell(row=r, column=col, value=text)
                c.font = cell_font
                c.border = thin
                c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
                fill = fill_for_cell(cell_data)
                if fill is not None:
                    c.fill = fill
            has_teacher = any(
                (cd or {}).get('teacher') for cd in row['cells'] if cd
            )
            ws.row_dimensions[r].height = 44 if has_teacher else 28
            r += 1

        for col in range(1, num_cols + 1):
            ws.column_dimensions[get_column_letter(col)].width = 20 if col > 1 else 15
        return r + 1

    wb = Workbook()

    def write_branded_header(ws, title_text: str) -> int:
        ws.sheet_view.showGridLines = False
        ws.merge_cells(start_row=1, start_column=1, end_row=2, end_column=num_cols)
        title = ws.cell(row=1, column=1, value=title_text)
        title.fill = PatternFill('solid', fgColor=sm.BRAND_PRIMARY_HEX)
        title.font = Font(name=sm.FONT_NAME, size=16, bold=True, color='FFFFFF')
        title.alignment = Alignment(horizontal='left', vertical='center')
        ws.row_dimensions[1].height = 25
        ws.row_dimensions[2].height = 10
        ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=num_cols)
        subtitle = ws.cell(
            row=3,
            column=1,
            value=f"{payload.get('report_title') or 'DERS PROGRAMI'}  ·  {payload.get('egitim_yili') or ''}",
        )
        subtitle.font = Font(name=sm.FONT_NAME, size=9, bold=True, color=sm.BRAND_PRIMARY_HEX)
        subtitle.alignment = Alignment(horizontal='left', vertical='center')
        return 5

    def apply_card_page(ws, last_row: int) -> None:
        ws.page_setup.orientation = 'landscape'
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 1
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.page_margins.left = 0.2
        ws.page_margins.right = 0.2
        ws.page_margins.top = 0.25
        ws.page_margins.bottom = 0.25
        ws.print_area = f'A1:{get_column_letter(num_cols)}{max(last_row, 3)}'

    # Kart düzeni PDF ile aynı: gün sütunları, saat rayı, ders + kişi.
    if use_cards:
        groups = payload['groups']
        if layout == 'per_class_sheet':
            for index, group in enumerate(groups):
                ws = wb.active if index == 0 else wb.create_sheet()
                ws.title = sm.safe_sheet_title(group['classroom_name'])[:31]
                start = write_branded_header(ws, group['classroom_name'])
                end = write_class_grid(ws, group, start, show_title=False)
                apply_card_page(ws, end - 1)
        else:
            ws = wb.active
            ws.title = sm.safe_sheet_title(payload.get('report_title') or 'Ders Programı')
            if len(groups) == 1:
                header_name = groups[0].get('classroom_name') or 'Program'
            else:
                header_name = f"{payload.get('report_title') or 'SINIF PROGRAMI'} ({len(groups)})"
            start = write_branded_header(ws, header_name)
            current = start
            for group in groups:
                current = write_class_grid(ws, group, current, show_title=len(groups) > 1)
            apply_card_page(ws, current - 1)

        buf = io.BytesIO()
        wb.save(buf)
        response = HttpResponse(
            buf.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{sm.safe_filename(filename)}.xlsx"'
        return response

    if layout == 'per_class_sheet':
        first = True
        for group in payload['groups']:
            if first:
                ws = wb.active
                first = False
            else:
                ws = wb.create_sheet()
            ws.title = sm.safe_sheet_title(group['classroom_name'])[:31]
            header_row = ExcelExportService._write_letterhead(ws, meta, num_cols=num_cols)
            current = ExcelExportService._write_stats(
                ws, stats, start_row=header_row, num_cols=num_cols,
            )
            end_row = write_class_grid(ws, group, current)
            ExcelExportService._apply_page_setup(
                ws,
                orientation='landscape',
                header_row=header_row,
                last_row=max(end_row, header_row + 1),
                last_col=num_cols,
                report_title=meta.report_title,
            )
    else:
        ws = wb.active
        ws.title = sm.safe_sheet_title('Ders Programları')
        header_row = ExcelExportService._write_letterhead(ws, meta, num_cols=num_cols)
        current = ExcelExportService._write_stats(
            ws, stats, start_row=header_row, num_cols=num_cols,
        )
        for group in payload['groups']:
            current = write_class_grid(ws, group, current)
        ExcelExportService._apply_page_setup(
            ws,
            orientation='landscape',
            header_row=header_row,
            last_row=max(current - 1, header_row),
            last_col=num_cols,
            report_title=meta.report_title,
        )

    buf = io.BytesIO()
    wb.save(buf)
    response = HttpResponse(
        buf.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = f'attachment; filename="{sm.safe_filename(filename)}.xlsx"'
    return response
