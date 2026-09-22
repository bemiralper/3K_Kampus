"""
Sınıf ders programı WhatsApp bildirimi — fingerprint, PDF, preview/send.
"""
from __future__ import annotations

import hashlib
import html
import logging
import re
from typing import Any

from django.db.models import Prefetch
from django.utils import timezone

from apps.academic.domain.class_schedule_notify_log import (
    ClassScheduleNotifyLog,
    ClassScheduleNotifyStatus,
)
from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.academic.services.schedule_export_service import (
    ScheduleExportError,
    apply_teacher_display,
    build_classroom_schedule_payload,
    occupied_day_columns,
    pretty_class_label,
    schedule_cell_palette,
)
from apps.communication.application.communication_service import MessageSource, SendResult
from apps.communication.application.notification_dispatcher import (
    NotificationAttachment,
    NotificationRecipient,
    dispatch_event,
)
from apps.ogrenci.application.veli_contact import effective_veli_phone
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.sinif.domain.models import Sinif
from apps.term.domain.models import Term

logger = logging.getLogger(__name__)

EVENT_KEY = 'akademik.sinif_programi'
TEACHER_EVENT_KEY = 'akademik.ogretmen_programi'


class ScheduleNotifyError(Exception):
    def __init__(self, message: str, *, field: str | None = None):
        self.message = message
        self.field = field
        super().__init__(message)


def compute_grid_fingerprint(version_id: int, sinif_id: int) -> str:
    """Sınıf × versiyon grid durumunun kanonik SHA256 özeti."""
    rows = (
        ProgramGridCell.objects.filter(
            schedule_version_id=version_id,
            sinif_id=sinif_id,
            is_active=True,
        )
        .order_by('weekly_day_id', 'timeslot_id', 'id')
        .values_list(
            'weekly_day_id',
            'timeslot_id',
            'ders_id',
            'ogretmen_id',
            'status',
        )
    )
    parts = [
        f'{day}:{slot}:{ders or 0}:{ogretmen or 0}:{status}'
        for day, slot, ders, ogretmen, status in rows
    ]
    raw = '|'.join(parts).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def _filled_cell_count(version_id: int, sinif_id: int) -> int:
    return ProgramGridCell.objects.filter(
        schedule_version_id=version_id,
        sinif_id=sinif_id,
        is_active=True,
        status=CellStatus.FILLED,
    ).count()


def _last_notify_log(version_id: int, sinif_id: int) -> ClassScheduleNotifyLog | None:
    return (
        ClassScheduleNotifyLog.objects.filter(
            schedule_version_id=version_id,
            sinif_id=sinif_id,
            status__in=(
                ClassScheduleNotifyStatus.SENT,
                ClassScheduleNotifyStatus.PARTIAL,
            ),
        )
        .order_by('-sent_at', '-id')
        .first()
    )


def _student_row(student: Ogrenci) -> dict[str, Any]:
    phone = (student.telefon or '').strip()
    return {
        'id': student.id,
        'name': f'{student.ad} {student.soyad}'.strip(),
        'phone': phone,
        'has_phone': bool(phone),
    }


def _veli_row(veli: OgrenciVeli, student: Ogrenci, phone: str) -> dict[str, Any]:
    return {
        'id': veli.id,
        'name': f'{veli.ad} {veli.soyad}'.strip(),
        'phone': phone or '',
        'has_phone': bool(phone),
        'ogrenci_id': student.id,
        'ogrenci_ad': f'{student.ad} {student.soyad}'.strip(),
    }


def _resolve_recipients(term_id: int, sinif_id: int) -> dict[str, Any]:
    placements = (
        StudentClassPlacement.objects.filter(
            term_id=term_id,
            classroom_id=sinif_id,
            is_active=True,
            student__aktif_mi=True,
        )
        .select_related('student')
        .prefetch_related(
            Prefetch(
                'student__veliler',
                queryset=OgrenciVeli.objects.all(),
            ),
        )
    )
    students: list[Ogrenci] = []
    veli_targets: list[tuple[OgrenciVeli, Ogrenci]] = []
    student_rows: list[dict[str, Any]] = []
    veli_rows: list[dict[str, Any]] = []
    students_no_phone = 0
    veliler_no_phone = 0

    for p in placements:
        student = p.student
        students.append(student)
        student_rows.append(_student_row(student))
        if not (student.telefon or '').strip():
            students_no_phone += 1
        veliler = list(student.veliler.all())
        if not veliler:
            continue
        for veli in veliler:
            phone = effective_veli_phone(veli, student)
            veli_rows.append(_veli_row(veli, student, phone or ''))
            if phone:
                veli_targets.append((veli, student))
            else:
                veliler_no_phone += 1

    return {
        'students': students,
        'veli_targets': veli_targets,
        'student_rows': student_rows,
        'veli_rows': veli_rows,
        'student_count': len(students),
        'veli_count': len(veli_targets),
        'students_with_phone': sum(1 for s in students if (s.telefon or '').strip()),
        'students_no_phone': students_no_phone,
        'veliler_no_phone': veliler_no_phone,
    }


def preview_classes(
    *,
    kurum_id: int,
    sube_id: int,
    term_id: int,
    version_id: int,
    sinif_ids: list[int],
) -> dict[str, Any]:
    term = Term.objects.filter(pk=term_id, sube_id=sube_id, kurum_id=kurum_id).first()
    if not term:
        raise ScheduleNotifyError('Dönem bulunamadı.', field='term_id')
    version = (
        ScheduleVersion.objects.select_related('weekly_cycle')
        .filter(pk=version_id, term_id=term_id)
        .first()
    )
    if not version:
        raise ScheduleNotifyError('Program bulunamadı.', field='version_id')

    siniflar = list(
        Sinif.objects.filter(
            id__in=sinif_ids,
            sube_id=sube_id,
            kurum_id=kurum_id,
            aktif_mi=True,
        ).order_by('ad')
    )
    found_ids = {s.id for s in siniflar}
    missing = [i for i in sinif_ids if i not in found_ids]
    if missing:
        raise ScheduleNotifyError(f'Sınıf bulunamadı: {missing}', field='sinif_ids')

    from apps.academic.services.grid_engine import class_schedule_version_id

    classes = []
    for sinif in siniflar:
        class_version_id = class_schedule_version_id(term_id, sinif.id) or version_id
        fp = compute_grid_fingerprint(class_version_id, sinif.id)
        last = _last_notify_log(class_version_id, sinif.id)
        has_changes = True if last is None else (last.grid_fingerprint != fp)
        filled = _filled_cell_count(class_version_id, sinif.id)
        recipients = _resolve_recipients(term_id, sinif.id)
        warning = None
        if filled == 0:
            warning = 'Bu sınıfın ders programı boş — mesaj gönderilmez.'
        elif not has_changes:
            warning = 'Son gönderimden beri değişiklik yok — mesaj gerekmez.'

        classes.append({
            'sinif_id': sinif.id,
            'sinif_ad': sinif.ad,
            'version_id': class_version_id,
            'has_changes': has_changes,
            'empty_grid': filled == 0,
            'filled_count': filled,
            'last_sent_at': last.sent_at.isoformat() if last else None,
            'student_count': recipients['student_count'],
            'veli_count': recipients['veli_count'],
            'students_with_phone': recipients['students_with_phone'],
            'students_no_phone': recipients['students_no_phone'],
            'veliler_no_phone': recipients['veliler_no_phone'],
            'students': recipients['student_rows'],
            'veliler': recipients['veli_rows'],
            'warning': warning,
            'default_selected': has_changes and filled > 0,
        })

    return {
        'term_id': term_id,
        'term_name': term.name,
        'version_id': version_id,
        'calendar_name': version.weekly_cycle.name if version.weekly_cycle_id else None,
        'classes': classes,
    }


def _safe_filename_part(value: str) -> str:
    cleaned = re.sub(r'[^\w\-]+', '_', (value or '').strip(), flags=re.UNICODE)
    return cleaned.strip('_')[:40] or 'sinif'


def _schedule_gap_label(prev_end: str, next_start: str) -> str | None:
    def minutes(value: str) -> int | None:
        parts = (value or '').split(':')
        if len(parts) < 2:
            return None
        try:
            return int(parts[0]) * 60 + int(parts[1])
        except ValueError:
            return None

    end = minutes(prev_end)
    start = minutes(next_start)
    if end is None or start is None or start - end < 40:
        return None
    if end <= 13 * 60 and start >= 13 * 60:
        return 'Öğle arası'
    return 'Ara'


def _logo_data_uri() -> str:
    from pathlib import Path

    from django.conf import settings

    candidates = [
        Path(settings.BASE_DIR) / 'static' / 'img' / 'beyaz-logo.png',
        Path(settings.BASE_DIR).parent / 'frontend' / 'public' / 'img' / 'beyaz-logo.png',
    ]
    for path in candidates:
        if path.is_file():
            import base64
            encoded = base64.b64encode(path.read_bytes()).decode('ascii')
            return f'data:image/png;base64,{encoded}'
    return ''


def _card_palette(card: dict[str, Any], *, subject_kind: str, color_by: str) -> dict[str, str] | None:
    if color_by == 'none':
        return None
    if subject_kind == 'teacher' or color_by == 'classroom':
        entity = card.get('classroom_id') or card.get('teacher_id') or card.get('lesson_id')
    elif color_by == 'ogretmen':
        entity = card.get('teacher_id') or card.get('lesson_id') or card.get('classroom_id')
    else:
        entity = card.get('lesson_id') or card.get('teacher_id') or card.get('classroom_id')
    return schedule_cell_palette(entity)


def _card_who(card: dict[str, Any], *, subject_kind: str) -> str:
    if subject_kind == 'teacher':
        return pretty_class_label(card.get('classroom') or card.get('teacher') or '')
    if subject_kind == 'student':
        return ' · '.join(
            part for part in (
                pretty_class_label(card.get('teacher') or ''),
                pretty_class_label(card.get('classroom') or ''),
                (card.get('status') or '').strip(),
            ) if part
        )
    return pretty_class_label(card.get('teacher') or '')


def _html_schedule_card(
    card: dict[str, Any],
    order: int,
    *,
    subject_kind: str,
    color_by: str = 'ders',
    table_like: bool = True,
) -> str:
    pal = _card_palette(card, subject_kind=subject_kind, color_by=color_by)
    bg = f"#{pal['bg']}" if pal else '#eff6ff'
    border = f"#{pal['border']}" if pal else '#93c5fd'
    ink = f"#{pal['text']}" if pal else '#1e3a8a'
    start = html.escape((card.get('start') or '').strip())
    end = html.escape((card.get('end') or '').strip())
    lesson = html.escape((card.get('lesson') or '').strip())
    who = html.escape(_card_who(card, subject_kind=subject_kind))
    who_html = f'<span class="who">{who}</span>' if who else ''
    return (
        '<div class="card is-table" style="'
        f'background:{bg};border-color:{border};color:{ink}">'
        f'<div class="rail"><em>{start}</em><i></i><em>{end}</em></div>'
        '<div class="main">'
        f'<em class="badge">{order}. Ders</em>'
        f'<strong>{lesson}</strong>'
        f'{who_html}'
        '</div></div>'
    )


def _program_label(payload: dict[str, Any]) -> str:
    kind = payload.get('subject_kind') or ''
    if kind == 'student':
        return 'ÖZEL DERS PROGRAMI'
    if kind == 'teacher' or payload.get('layout_kind') == 'day_cards':
        return 'ÖĞRETMEN PROGRAMI'
    return payload.get('report_title') or 'SINIF PROGRAMI'


def build_schedule_pdf_html(payload: dict[str, Any], *, color_by: str = 'ders') -> str:
    """Sınıf, öğretmen ve birebir: ekrandaki kart + marka şeridi."""
    days = payload.get('days') or []
    subject_kind = payload.get('subject_kind') or (
        'teacher' if payload.get('layout_kind') == 'day_cards' else 'class'
    )
    show_gaps = subject_kind == 'class'
    program_label = html.escape(_program_label(payload))
    term = html.escape((payload.get('term') or {}).get('name') or '')
    year = html.escape(payload.get('egitim_yili') or '')
    today = timezone.localdate().strftime('%d.%m.%Y')
    meta = ' · '.join(p for p in (year, term, today) if p)
    logo = _logo_data_uri()
    logo_html = f'<img class="logo" src="{logo}" alt="">' if logo else '<div class="logo-fallback">3K</div>'
    week_cols = 1
    for group in payload.get('groups') or []:
        week_cols = max(week_cols, len(occupied_day_columns(days, group)))

    sections = []
    stack_gap = 1.0
    gap_row = 3.2
    for group in payload.get('groups') or []:
        cname = html.escape(pretty_class_label(group.get('classroom_name') or ''))
        visible = occupied_day_columns(days, group)
        cols_html = []
        page_cards = 1
        page_gaps = 0
        for day, cards in visible:
            day_name = html.escape(day.get('short_name') or day.get('name') or '')
            items = []
            gap_rows = 0
            for order, card in enumerate(cards, 1):
                prev = cards[order - 2] if order > 1 else None
                if prev and show_gaps:
                    gap = _schedule_gap_label(prev.get('end') or '', card.get('start') or '')
                    if gap:
                        gap_rows += 1
                        items.append(f'<div class="gap">{html.escape(gap)}</div>')
                items.append(
                    _html_schedule_card(
                        card, order, subject_kind=subject_kind, color_by=color_by,
                    ),
                )
            page_cards = max(page_cards, len(cards) or 1)
            page_gaps = max(page_gaps, gap_rows)
            cols_html.append(
                f'<section class="day-col">'
                f'<header><i></i><strong>{day_name}</strong></header>'
                f'<div class="day-stack">{"".join(items)}</div>'
                f'</section>'
            )
        page_class = {
            'teacher': 'teacher-page',
            'student': 'student-page',
        }.get(subject_kind, 'class-page')
        board = (
            f'<div class="week-board">{"".join(cols_html)}</div>'
            if cols_html
            else '<div class="empty">Bu programda ders yok</div>'
        )
        printable = 210 - 26
        chrome = 14 + 7 + 3 + 4
        between = max(0, page_cards - 1) * stack_gap + page_gaps * (gap_row + stack_gap)
        card_mm = (printable - chrome - between) / max(page_cards, 1)
        card_mm = max(7.2, min(16, card_mm))
        title_px = 11 if card_mm >= 11 else 9
        who_px = 10 if card_mm >= 11 else 8
        sections.append(
            f'<section class="{page_class}" style="--card-h:{card_mm:.2f}mm;--title-px:{title_px}px;--who-px:{who_px}px">'
            f'<header class="brand">'
            f'{logo_html}'
            f'<div class="brand-text">'
            f'<em>{program_label}</em>'
            f'<h1>{cname}</h1>'
            f'<span>{meta}</span>'
            f'</div></header>'
            f'{board}'
            f'</section>'
        )

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page {{ size: A4 landscape; margin: 0; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; }}
  body {{
    font-family: Arial, Helvetica, sans-serif;
    color: #0f172a;
    background: #f8fafc;
  }}
  .teacher-page, .class-page, .student-page {{
    padding: 0 8mm 4mm;
    break-after: page;
    page-break-after: always;
  }}
  .teacher-page:last-child, .class-page:last-child, .student-page:last-child {{
    break-after: auto; page-break-after: auto;
  }}
  .brand {{
    display: flex; align-items: center; gap: 10px;
    margin: 0 -8mm 3mm; padding: 6px 8mm;
    background: #0262a7; color: #fff;
  }}
  .logo {{ height: 28px; width: auto; display: block; }}
  .logo-fallback {{
    width: 36px; height: 36px; border: 1px solid rgba(255,255,255,.4);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 12px;
  }}
  .brand-text {{ min-width: 0; flex: 1; }}
  .brand-text em {{
    display: block; font-style: normal; font-size: 9px; font-weight: 800;
    letter-spacing: .08em; opacity: .82;
  }}
  .brand-text h1 {{
    margin: 1px 0 0; font-size: 14px; line-height: 1.15; color: #fff;
  }}
  .brand-text span {{ display: block; margin-top: 2px; font-size: 10px; opacity: .88; }}
  .week-board {{
    display: grid;
    grid-template-columns: repeat({week_cols}, minmax(0, 1fr));
    gap: 8px;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 4px;
  }}
  .day-col header {{
    position: relative;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    text-align: center;
    padding: 4px 4px 3px;
    margin-bottom: 4px;
    color: #334155;
  }}
  .day-col header i {{
    position: absolute; left: 0; right: 0; top: 0; height: 3px;
    background: #0262a7; border-radius: 8px 8px 0 0;
  }}
  .day-col header strong {{ font-size: 11px; font-weight: 800; }}
  .day-stack {{ display: flex; flex-direction: column; gap: {stack_gap}mm; }}
  .card {{
    display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 6px;
    align-items: stretch;
    height: var(--card-h, 14mm); min-height: 0; padding: 3px 6px 3px 4px;
    border: 1px solid #dbeafe; border-radius: 8px;
    overflow: hidden;
  }}
  .badge {{
    font-size: 9px; font-weight: 800; letter-spacing: .06em;
    text-transform: uppercase; opacity: .8; font-style: normal;
  }}
  .rail {{
    display: flex; flex-direction: column; align-items: flex-end;
    justify-content: space-between; padding: 1px 7px 1px 0;
    border-right: 2px solid currentColor; opacity: .72;
  }}
  .rail em {{
    font-style: normal; font-size: 10px; font-weight: 800;
    font-variant-numeric: tabular-nums; line-height: 1;
  }}
  .rail i {{
    flex: 1; width: 2px; margin: 4px 5px 4px 0;
    background: currentColor; opacity: .22; border-radius: 99px;
  }}
  .main {{ display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; }}
  .main strong {{ font-size: var(--title-px, 11px); line-height: 1.15; }}
  .who {{ font-size: var(--who-px, 10px); font-weight: 600; }}
  .gap {{
    display: flex; align-items: center; gap: 6px;
    height: {gap_row}mm;
    text-align: center; font-size: 8px; font-weight: 800;
    letter-spacing: .04em; text-transform: uppercase; color: #94a3b8;
  }}
  .gap::before, .gap::after {{
    content: ''; height: 1px; flex: 1; background: #e2e8f0;
  }}
  .empty {{ color: #94a3b8; text-align: center; padding: 28px 0; }}
</style></head><body>
  {''.join(sections)}
</body></html>"""


def render_class_schedule_pdf(
    *,
    term_id: int,
    version_id: int,
    sinif_id: int,
    sube_id: int,
) -> tuple[bytes, str, str]:
    """PDF bytes, filename, pdf_baslik."""
    payload = build_classroom_schedule_payload(
        term_id=term_id,
        version_id=version_id,
        classroom_ids=[sinif_id],
        sube_id=sube_id,
    )
    payload = apply_teacher_display(payload, 'full')
    group = (payload.get('groups') or [{}])[0]
    sinif_ad = group.get('classroom_name') or 'sinif'
    term_name = (payload.get('term') or {}).get('name') or ''
    pdf_baslik = f'{sinif_ad} Ders Programı'
    filename = (
        f'ders_programi_{_safe_filename_part(sinif_ad)}_'
        f'{_safe_filename_part(term_name)}.pdf'
    )

    html_doc = build_schedule_pdf_html(payload)
    try:
        from apps.communication.application.html_to_pdf import render_html_to_pdf
        pdf_bytes = render_html_to_pdf(html_doc, landscape=True)
    except Exception as exc:
        logger.warning('Playwright PDF başarısız, reportlab fallback: %s', exc)
        from apps.communication.application.pdf_render_service import PdfRenderService

        lines = [pdf_baslik, term_name, '']
        for row in group.get('rows') or []:
            parts = [row.get('slot_name') or '']
            for cell in row.get('cells') or []:
                if cell and cell.get('lesson'):
                    parts.append(cell['lesson'])
            lines.append(' | '.join(parts))
        pdf_bytes = PdfRenderService.render_simple_text_pdf(pdf_baslik, '\n'.join(lines))

    return pdf_bytes, filename, pdf_baslik


def _filter_recipient_ids(
    all_ids: list[int],
    *,
    include_ids: list[int] | None,
    exclude_ids: list[int] | None,
) -> set[int]:
    allowed = set(all_ids)
    if include_ids is not None:
        allowed &= set(include_ids)
    if exclude_ids:
        allowed -= set(exclude_ids)
    return allowed


def _recipient_row(
    *,
    kind: str,
    person_id: int,
    name: str,
    phone: str,
    status: str,
    error: str = '',
    sinif_ad: str = '',
) -> dict[str, Any]:
    return {
        'kind': kind,
        'id': person_id,
        'name': name,
        'phone': phone,
        'status': status,
        'error': error,
        'sinif_ad': sinif_ad,
    }


def _write_notify_log(
    *,
    kurum_id: int,
    term_id: int,
    class_version_id: int | None,
    sinif_id: int | None,
    fingerprint: str,
    veli_ok: int,
    ogrenci_ok: int,
    status: str,
    recipients: list[dict[str, Any]],
    errors: list[str],
    batch_id: str,
    target_kind: str,
    title: str,
    user,
) -> None:
    ClassScheduleNotifyLog.objects.create(
        kurum_id=kurum_id,
        term_id=term_id,
        schedule_version_id=class_version_id,
        sinif_id=sinif_id,
        target_kind=target_kind,
        batch_id=(batch_id or '')[:64],
        grid_fingerprint=fingerprint,
        veli_count=veli_ok,
        ogrenci_count=ogrenci_ok,
        status=status,
        detail={
            'errors': errors[:50],
            'recipients': recipients[:400],
            'title': title,
            'batch_id': batch_id or '',
        },
        sent_by=user if user and getattr(user, 'is_authenticated', False) else None,
    )


def list_notify_history(
    *,
    kurum_id: int,
    term_id: int,
    target_kind: str | None = None,
    limit: int = 80,
) -> dict[str, Any]:
    qs = ClassScheduleNotifyLog.objects.filter(
        kurum_id=kurum_id,
        term_id=term_id,
    ).select_related('sinif', 'sent_by')
    if target_kind in ('class', 'teacher'):
        qs = qs.filter(target_kind=target_kind)
    items = []
    for log in qs.order_by('-sent_at', '-id')[:limit]:
        detail = log.detail if isinstance(log.detail, dict) else {}
        title = ''
        if log.sinif_id and log.sinif:
            title = log.sinif.ad
        title = title or detail.get('title') or ''
        sent_by = ''
        if log.sent_by_id and log.sent_by:
            sent_by = (
                log.sent_by.get_full_name()
                or getattr(log.sent_by, 'username', '')
                or ''
            ).strip()
        items.append({
            'id': log.id,
            'batch_id': log.batch_id or detail.get('batch_id') or '',
            'target_kind': log.target_kind,
            'title': title,
            'status': log.status,
            'veli_count': log.veli_count,
            'ogrenci_count': log.ogrenci_count,
            'sent_at': log.sent_at.isoformat() if log.sent_at else None,
            'sent_by': sent_by,
            'recipients': detail.get('recipients') or [],
            'errors': detail.get('errors') or [],
        })
    return {'term_id': term_id, 'items': items}


def send_class_schedules(
    *,
    kurum_id: int,
    sube_id: int,
    term_id: int,
    version_id: int,
    sinif_ids: list[int],
    force_unchanged_ids: list[int] | None = None,
    send_to: list[str] | None = None,
    exclude_ogrenci_ids: list[int] | None = None,
    exclude_veli_ids: list[int] | None = None,
    include_ogrenci_ids: list[int] | None = None,
    include_veli_ids: list[int] | None = None,
    batch_id: str | None = None,
    user=None,
) -> dict[str, Any]:
    force_set = set(force_unchanged_ids or [])
    targets = send_to or ['veli', 'ogrenci']
    send_veli = 'veli' in targets
    send_ogrenci = 'ogrenci' in targets
    if not send_veli and not send_ogrenci:
        raise ScheduleNotifyError('En az bir alıcı tipi seçin (veli/öğrenci).', field='send_to')

    preview = preview_classes(
        kurum_id=kurum_id,
        sube_id=sube_id,
        term_id=term_id,
        version_id=version_id,
        sinif_ids=sinif_ids,
    )

    results = []
    total_veli = 0
    total_ogrenci = 0
    total_skipped = 0
    total_errors = 0

    for cls_row in preview['classes']:
        sid = cls_row['sinif_id']
        if cls_row['empty_grid']:
            results.append({
                'sinif_id': sid,
                'sinif_ad': cls_row['sinif_ad'],
                'status': 'skipped',
                'reason': 'empty_grid',
                'veli_sent': 0,
                'ogrenci_sent': 0,
                'errors': [cls_row['warning'] or 'Boş program'],
                'recipients': [],
            })
            total_skipped += 1
            continue

        if not cls_row['has_changes'] and sid not in force_set:
            results.append({
                'sinif_id': sid,
                'sinif_ad': cls_row['sinif_ad'],
                'status': 'skipped',
                'reason': 'unchanged',
                'veli_sent': 0,
                'ogrenci_sent': 0,
                'errors': [cls_row['warning'] or 'Değişiklik yok'],
                'recipients': [],
            })
            total_skipped += 1
            continue

        class_version_id = cls_row.get('version_id') or version_id
        try:
            pdf_bytes, filename, pdf_baslik = render_class_schedule_pdf(
                term_id=term_id,
                version_id=class_version_id,
                sinif_id=sid,
                sube_id=sube_id,
            )
        except ScheduleExportError as exc:
            results.append({
                'sinif_id': sid,
                'sinif_ad': cls_row['sinif_ad'],
                'status': 'failed',
                'reason': 'pdf',
                'veli_sent': 0,
                'ogrenci_sent': 0,
                'errors': [exc.message],
                'recipients': [],
            })
            total_errors += 1
            continue

        recipients = _resolve_recipients(term_id, sid)
        fp = compute_grid_fingerprint(class_version_id, sid)
        errors: list[str] = []
        delivered: list[dict[str, Any]] = []
        veli_ok = 0
        ogrenci_ok = 0

        base_ctx = {
            'sinif': cls_row['sinif_ad'],
            'donem': preview['term_name'],
            'pdf_baslik': pdf_baslik,
            'kurum_ad': '',
            'sube': '',
        }
        term = Term.objects.select_related('kurum', 'sube').filter(pk=term_id).first()
        if term:
            base_ctx['kurum_ad'] = term.kurum.ad if term.kurum_id else ''
            base_ctx['sube'] = term.sube.ad if term.sube_id else ''

        attachment = NotificationAttachment(filename=filename, file_bytes=pdf_bytes)
        source = MessageSource(module='akademik', ref_id=f'schedule:{class_version_id}:{sid}')
        sent_by = getattr(user, 'id', None)

        allowed_students = _filter_recipient_ids(
            [s.id for s in recipients['students']],
            include_ids=include_ogrenci_ids,
            exclude_ids=exclude_ogrenci_ids,
        )
        allowed_veliler = _filter_recipient_ids(
            [v.id for v, _ in recipients['veli_targets']],
            include_ids=include_veli_ids,
            exclude_ids=exclude_veli_ids,
        )

        if send_veli:
            for veli, student in recipients['veli_targets']:
                if veli.id not in allowed_veliler:
                    continue
                ctx = {
                    **base_ctx,
                    'ogrenci_ad': f'{student.ad} {student.soyad}'.strip(),
                    'veli_ad': f'{veli.ad} {veli.soyad}'.strip(),
                }
                result = dispatch_event(
                    kurum_id,
                    EVENT_KEY,
                    recipient=NotificationRecipient.veli(veli.id),
                    context=ctx,
                    attachment=attachment,
                    source=source,
                    sube_id=sube_id,
                    sent_by_user_id=sent_by,
                )
                veli_name = f'{veli.ad} {veli.soyad}'.strip()
                if isinstance(result, SendResult) and result.success:
                    veli_ok += 1
                    delivered.append(_recipient_row(
                        kind='veli',
                        person_id=veli.id,
                        name=veli_name,
                        phone=effective_veli_phone(veli, student) or '',
                        status='sent',
                        sinif_ad=cls_row['sinif_ad'],
                    ))
                else:
                    err = (
                        '; '.join(result.errors)
                        if isinstance(result, SendResult) and result.errors
                        else 'Veli gönderimi başarısız'
                    )
                    errors.append(f'veli:{veli.id}: {err}')
                    delivered.append(_recipient_row(
                        kind='veli',
                        person_id=veli.id,
                        name=veli_name,
                        phone=effective_veli_phone(veli, student) or '',
                        status='failed',
                        error=err,
                        sinif_ad=cls_row['sinif_ad'],
                    ))

        if send_ogrenci:
            for student in recipients['students']:
                if student.id not in allowed_students:
                    continue
                if not (student.telefon or '').strip():
                    continue
                ctx = {
                    **base_ctx,
                    'ogrenci_ad': f'{student.ad} {student.soyad}'.strip(),
                    'veli_ad': '',
                }
                result = dispatch_event(
                    kurum_id,
                    EVENT_KEY,
                    recipient=NotificationRecipient.ogrenci(student.id),
                    context=ctx,
                    attachment=attachment,
                    source=source,
                    sube_id=sube_id,
                    sent_by_user_id=sent_by,
                )
                student_name = f'{student.ad} {student.soyad}'.strip()
                if isinstance(result, SendResult) and result.success:
                    ogrenci_ok += 1
                    delivered.append(_recipient_row(
                        kind='ogrenci',
                        person_id=student.id,
                        name=student_name,
                        phone=(student.telefon or ''),
                        status='sent',
                        sinif_ad=cls_row['sinif_ad'],
                    ))
                else:
                    err = (
                        '; '.join(result.errors)
                        if isinstance(result, SendResult) and result.errors
                        else 'Öğrenci gönderimi başarısız'
                    )
                    errors.append(f'ogrenci:{student.id}: {err}')
                    delivered.append(_recipient_row(
                        kind='ogrenci',
                        person_id=student.id,
                        name=student_name,
                        phone=(student.telefon or ''),
                        status='failed',
                        error=err,
                        sinif_ad=cls_row['sinif_ad'],
                    ))

        if veli_ok or ogrenci_ok:
            status = (
                ClassScheduleNotifyStatus.PARTIAL
                if errors
                else ClassScheduleNotifyStatus.SENT
            )
            _write_notify_log(
                kurum_id=kurum_id,
                term_id=term_id,
                class_version_id=class_version_id,
                sinif_id=sid,
                fingerprint=fp,
                veli_ok=veli_ok,
                ogrenci_ok=ogrenci_ok,
                status=status,
                recipients=delivered,
                errors=errors,
                batch_id=batch_id or '',
                target_kind='class',
                title=cls_row['sinif_ad'],
                user=user,
            )
            results.append({
                'sinif_id': sid,
                'sinif_ad': cls_row['sinif_ad'],
                'status': 'sent' if not errors else 'partial',
                'reason': None,
                'veli_sent': veli_ok,
                'ogrenci_sent': ogrenci_ok,
                'errors': errors[:20],
                'recipients': delivered,
            })
            total_veli += veli_ok
            total_ogrenci += ogrenci_ok
            if errors:
                total_errors += len(errors)
        else:
            fail_errors = errors or ['Alıcı yok veya gönderim başarısız']
            _write_notify_log(
                kurum_id=kurum_id,
                term_id=term_id,
                class_version_id=class_version_id,
                sinif_id=sid,
                fingerprint=fp,
                veli_ok=0,
                ogrenci_ok=0,
                status=ClassScheduleNotifyStatus.FAILED,
                recipients=delivered,
                errors=fail_errors,
                batch_id=batch_id or '',
                target_kind='class',
                title=cls_row['sinif_ad'],
                user=user,
            )
            results.append({
                'sinif_id': sid,
                'sinif_ad': cls_row['sinif_ad'],
                'status': 'failed',
                'reason': 'no_recipients' if not errors else 'dispatch',
                'veli_sent': 0,
                'ogrenci_sent': 0,
                'errors': fail_errors[:20],
                'recipients': delivered,
            })
            total_errors += 1

    return {
        'term_id': term_id,
        'version_id': version_id,
        'total_veli_sent': total_veli,
        'total_ogrenci_sent': total_ogrenci,
        'total_skipped': total_skipped,
        'total_errors': total_errors,
        'results': results,
        'sent_at': timezone.now().isoformat(),
    }


def _teacher_phone(teacher) -> str:
    return (getattr(teacher, 'cep_telefon', None) or getattr(teacher, 'telefon', None) or '').strip()


def _teacher_filled_count(term_id: int, teacher_id: int) -> int:
    from django.db.models import Q
    from apps.ozel_ders.domain.models import BirebirHaftalikSlot, ProgramDurumu

    group_count = ProgramGridCell.objects.filter(
        schedule_version__term_id=term_id,
        is_active=True,
        status=CellStatus.FILLED,
    ).filter(
        Q(ogretmen_id=teacher_id) | Q(class_lesson_plan__ogretmen_id=teacher_id)
    ).count()
    term = Term.objects.filter(pk=term_id).only('kurum_id', 'sube_id', 'egitim_yili_id').first()
    if not term or not term.egitim_yili_id:
        return group_count
    private_count = BirebirHaftalikSlot.objects.filter(
        ogretmen_id=teacher_id,
        aktif=True,
        program__durum=ProgramDurumu.AKTIF,
        program__kurum_id=term.kurum_id,
        program__sube_id=term.sube_id,
        program__egitim_yili_id=term.egitim_yili_id,
    ).count()
    return group_count + private_count


def render_teacher_schedule_pdf(
    *,
    term_id: int,
    teacher_id: int,
    sube_id: int,
) -> tuple[bytes, str, str]:
    from apps.academic.services.schedule_export_service import build_teacher_schedule_payload

    payload = build_teacher_schedule_payload(
        term_id=term_id,
        teacher_id=teacher_id,
        sube_id=sube_id,
    )
    payload = apply_teacher_display(payload, 'full')
    group = (payload.get('groups') or [{}])[0]
    teacher_ad = group.get('classroom_name') or 'ogretmen'
    term_name = (payload.get('term') or {}).get('name') or ''
    pdf_baslik = f'{teacher_ad} Ders Programı'
    filename = (
        f'ogretmen_programi_{_safe_filename_part(teacher_ad)}_'
        f'{_safe_filename_part(term_name)}.pdf'
    )
    html_doc = build_schedule_pdf_html(payload)
    try:
        from apps.communication.application.html_to_pdf import render_html_to_pdf
        pdf_bytes = render_html_to_pdf(html_doc, landscape=True)
    except Exception as exc:
        logger.warning('Playwright PDF başarısız, reportlab fallback: %s', exc)
        from apps.communication.application.pdf_render_service import PdfRenderService

        lines = [pdf_baslik, term_name, '']
        for row in group.get('rows') or []:
            parts = [row.get('slot_name') or '']
            for cell in row.get('cells') or []:
                if cell and cell.get('lesson'):
                    parts.append(cell['lesson'])
            lines.append(' | '.join(parts))
        pdf_bytes = PdfRenderService.render_simple_text_pdf(pdf_baslik, '\n'.join(lines))
    return pdf_bytes, filename, pdf_baslik


def preview_teachers(
    *,
    kurum_id: int,
    sube_id: int,
    term_id: int,
    teacher_ids: list[int],
) -> dict[str, Any]:
    from apps.personel.domain.models import Personel

    term = Term.objects.filter(pk=term_id, sube_id=sube_id, kurum_id=kurum_id).first()
    if not term:
        raise ScheduleNotifyError('Dönem bulunamadı.', field='term_id')

    teachers = list(
        Personel.objects.filter(
            id__in=teacher_ids,
            kurum_id=kurum_id,
            aktif_mi=True,
        ).order_by('ad', 'soyad')
    )
    found = {t.id for t in teachers}
    missing = [i for i in teacher_ids if i not in found]
    if missing:
        raise ScheduleNotifyError(f'Öğretmen bulunamadı: {missing}', field='teacher_ids')

    rows = []
    for teacher in teachers:
        phone = _teacher_phone(teacher)
        filled = _teacher_filled_count(term_id, teacher.id)
        warning = None
        if filled == 0:
            warning = 'Seçili dönemde program yok — mesaj gönderilmez.'
        elif not phone:
            warning = 'Öğretmenin telefonu yok — WhatsApp gönderilemez.'
        rows.append({
            'teacher_id': teacher.id,
            'teacher_name': f'{teacher.ad} {teacher.soyad}'.strip(),
            'phone': phone,
            'has_phone': bool(phone),
            'empty_grid': filled == 0,
            'filled_count': filled,
            'warning': warning,
            'default_selected': filled > 0 and bool(phone),
        })

    return {
        'term_id': term_id,
        'term_name': term.name,
        'teachers': rows,
    }


def send_teacher_schedules(
    *,
    kurum_id: int,
    sube_id: int,
    term_id: int,
    teacher_ids: list[int],
    exclude_teacher_ids: list[int] | None = None,
    include_teacher_ids: list[int] | None = None,
    batch_id: str | None = None,
    user=None,
) -> dict[str, Any]:
    preview = preview_teachers(
        kurum_id=kurum_id,
        sube_id=sube_id,
        term_id=term_id,
        teacher_ids=teacher_ids,
    )
    allowed = _filter_recipient_ids(
        [t['teacher_id'] for t in preview['teachers']],
        include_ids=include_teacher_ids,
        exclude_ids=exclude_teacher_ids,
    )

    results = []
    total_sent = 0
    total_skipped = 0
    total_errors = 0
    sent_by = getattr(user, 'id', None)

    for row in preview['teachers']:
        tid = row['teacher_id']
        if tid not in allowed:
            results.append({
                'teacher_id': tid,
                'teacher_name': row['teacher_name'],
                'status': 'skipped',
                'reason': 'excluded',
                'sent': 0,
                'errors': [],
            })
            total_skipped += 1
            continue
        if row['empty_grid']:
            results.append({
                'teacher_id': tid,
                'teacher_name': row['teacher_name'],
                'status': 'skipped',
                'reason': 'empty_grid',
                'sent': 0,
                'errors': [row['warning'] or 'Boş program'],
            })
            total_skipped += 1
            continue
        if not row['has_phone']:
            results.append({
                'teacher_id': tid,
                'teacher_name': row['teacher_name'],
                'status': 'failed',
                'reason': 'no_phone',
                'sent': 0,
                'errors': [row['warning'] or 'Telefon yok'],
            })
            total_errors += 1
            continue

        try:
            pdf_bytes, filename, pdf_baslik = render_teacher_schedule_pdf(
                term_id=term_id,
                teacher_id=tid,
                sube_id=sube_id,
            )
        except ScheduleExportError as exc:
            results.append({
                'teacher_id': tid,
                'teacher_name': row['teacher_name'],
                'status': 'failed',
                'reason': 'pdf',
                'sent': 0,
                'errors': [exc.message],
            })
            total_errors += 1
            continue

        ctx = {
            'ogretmen_ad': row['teacher_name'],
            'donem': preview['term_name'],
            'pdf_baslik': pdf_baslik,
            'kurum_ad': '',
            'sube': '',
        }
        term = Term.objects.select_related('kurum', 'sube').filter(pk=term_id).first()
        if term:
            ctx['kurum_ad'] = term.kurum.ad if term.kurum_id else ''
            ctx['sube'] = term.sube.ad if term.sube_id else ''

        result = dispatch_event(
            kurum_id,
            TEACHER_EVENT_KEY,
            recipient=NotificationRecipient.personel(tid),
            context=ctx,
            attachment=NotificationAttachment(filename=filename, file_bytes=pdf_bytes),
            source=MessageSource(module='akademik', ref_id=f'teacher-schedule:{term_id}:{tid}'),
            sube_id=sube_id,
            sent_by_user_id=sent_by,
        )
        if isinstance(result, SendResult) and result.success:
            person = _recipient_row(
                kind='ogretmen',
                person_id=tid,
                name=row['teacher_name'],
                phone=row.get('phone') or '',
                status='sent',
            )
            _write_notify_log(
                kurum_id=kurum_id,
                term_id=term_id,
                class_version_id=None,
                sinif_id=None,
                fingerprint='',
                veli_ok=0,
                ogrenci_ok=0,
                status=ClassScheduleNotifyStatus.SENT,
                recipients=[person],
                errors=[],
                batch_id=batch_id or '',
                target_kind='teacher',
                title=row['teacher_name'],
                user=user,
            )
            results.append({
                'teacher_id': tid,
                'teacher_name': row['teacher_name'],
                'status': 'sent',
                'reason': None,
                'sent': 1,
                'errors': [],
                'recipients': [person],
            })
            total_sent += 1
        else:
            err = (
                '; '.join(result.errors)
                if isinstance(result, SendResult) and result.errors
                else 'Öğretmen gönderimi başarısız'
            )
            person = _recipient_row(
                kind='ogretmen',
                person_id=tid,
                name=row['teacher_name'],
                phone=row.get('phone') or '',
                status='failed',
                error=err,
            )
            _write_notify_log(
                kurum_id=kurum_id,
                term_id=term_id,
                class_version_id=None,
                sinif_id=None,
                fingerprint='',
                veli_ok=0,
                ogrenci_ok=0,
                status=ClassScheduleNotifyStatus.FAILED,
                recipients=[person],
                errors=[err],
                batch_id=batch_id or '',
                target_kind='teacher',
                title=row['teacher_name'],
                user=user,
            )
            results.append({
                'teacher_id': tid,
                'teacher_name': row['teacher_name'],
                'status': 'failed',
                'reason': 'dispatch',
                'sent': 0,
                'errors': [err],
                'recipients': [person],
            })
            total_errors += 1

    return {
        'term_id': term_id,
        'total_sent': total_sent,
        'total_skipped': total_skipped,
        'total_errors': total_errors,
        'results': results,
        'sent_at': timezone.now().isoformat(),
    }
