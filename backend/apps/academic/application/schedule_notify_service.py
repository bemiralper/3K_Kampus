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
    day_card_columns,
    pretty_class_label,
    schedule_cell_palette,
    card_entity_id,
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

    classes = []
    for sinif in siniflar:
        fp = compute_grid_fingerprint(version_id, sinif.id)
        last = _last_notify_log(version_id, sinif.id)
        has_changes = True if last is None else (last.grid_fingerprint != fp)
        filled = _filled_cell_count(version_id, sinif.id)
        recipients = _resolve_recipients(term_id, sinif.id)
        warning = None
        if filled == 0:
            warning = 'Bu sınıfın ders programı boş — mesaj gönderilmez.'
        elif not has_changes:
            warning = 'Son gönderimden beri değişiklik yok — mesaj gerekmez.'

        classes.append({
            'sinif_id': sinif.id,
            'sinif_ad': sinif.ad,
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


def _html_schedule_card(
    card: dict[str, Any],
    order: int,
    *,
    who_key: str,
) -> str:
    entity = card.get('lesson_id') if who_key == 'teacher' else card_entity_id(card)
    if who_key == 'teacher' and not entity:
        entity = card_entity_id(card)
    pal = schedule_cell_palette(entity)
    bg = f"#{pal['bg']}" if pal else '#eff6ff'
    border = f"#{pal['border']}" if pal else '#93c5fd'
    ink = f"#{pal['text']}" if pal else '#1e3a8a'
    start = html.escape((card.get('start') or '').strip())
    end = html.escape((card.get('end') or '').strip())
    lesson = html.escape((card.get('lesson') or '').strip())
    who = html.escape(pretty_class_label(card.get(who_key) or ''))
    return (
        '<div class="card" style="'
        f'background:{bg};border-color:{border};color:{ink}">'
        f'<div class="ord">{order}</div>'
        f'<div class="rail"><em>{start}</em><i></i><em>{end}</em></div>'
        '<div class="main">'
        f'<strong>{lesson}</strong>'
        f'{f"<span class=who>{who}</span>" if who else ""}'
        '</div></div>'
    )


def build_schedule_pdf_html(payload: dict[str, Any]) -> str:
    """Öğretmen: gün gün kartlar. Sınıf: haftalık gün sütunları."""
    title = html.escape(payload.get('report_title') or 'Ders Programı')
    term = html.escape((payload.get('term') or {}).get('name') or '')
    year = html.escape(payload.get('egitim_yili') or '')
    days = payload.get('days') or []
    teacher_cards = payload.get('layout_kind') == 'day_cards' or payload.get('subject_kind') == 'teacher'
    page_size = 'A4 portrait' if teacher_cards else 'A4 landscape'
    meta = ' · '.join(p for p in (year, term) if p)

    sections = []
    for group in payload.get('groups') or []:
        cname = html.escape(group.get('classroom_name') or '')
        columns = group.get('day_cards') or day_card_columns(days, group.get('rows') or [])
        if teacher_cards:
            cards_per_page = 7
            for day, cards in zip(days, columns):
                day_name = html.escape(day.get('name') or day.get('short_name') or '')
                for offset in range(0, max(len(cards), 1), cards_per_page):
                    cards_html = []
                    for order, card in enumerate(cards[offset:offset + cards_per_page], offset + 1):
                        cards_html.append(_html_schedule_card(card, order, who_key='classroom'))
                    continuation = ' · devam' if offset else ''
                    sections.append(
                        f'<section class="teacher-page">'
                        f'<h2>{cname} · {day_name}{continuation}</h2>'
                        f'<div class="day-cards">{"".join(cards_html) or "<div class=empty>—</div>"}</div>'
                        f'</section>'
                    )
            continue

        cols_html = []
        for day, cards in zip(days, columns):
            day_name = html.escape(day.get('short_name') or day.get('name') or '')
            items = []
            for order, card in enumerate(cards, 1):
                prev = cards[order - 2] if order > 1 else None
                gap = _schedule_gap_label(prev.get('end') or '', card.get('start') or '') if prev else None
                if gap:
                    items.append(f'<div class="gap">{html.escape(gap)}</div>')
                items.append(_html_schedule_card(card, order, who_key='teacher'))
            cols_html.append(
                f'<section class="day-col">'
                f'<header>{day_name}</header>'
                f'<div class="day-stack">{"".join(items) or "<div class=empty>—</div>"}</div>'
                f'</section>'
            )
        sections.append(
            f'<section class="class-page">'
            f'<h2>{cname}</h2>'
            f'<div class="week-board">{"".join(cols_html)}</div>'
            f'</section>'
        )

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {{ font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 12px; }}
  h1 {{ font-size: 16px; margin: 0 0 2px; color: #0262a7; }}
  .meta {{ color: #64748b; margin-bottom: 10px; }}
  h2 {{ font-size: 13px; margin: 0 0 8px; color: #0f172a; }}
  @page {{ size: {page_size}; margin: 8mm; }}
  .teacher-page, .class-page {{ break-after: page; page-break-after: always; }}
  .teacher-page:last-child, .class-page:last-child {{ break-after: auto; page-break-after: auto; }}
  .card {{ break-inside: avoid; page-break-inside: avoid; }}
  .day-cards {{ display: flex; flex-direction: column; gap: 8px; }}
  .week-board {{
    display: grid;
    grid-template-columns: repeat({max(1, len(days))}, minmax(0, 1fr));
    gap: 8px;
  }}
  .day-col header {{
    background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px;
    text-align: center; font-weight: 800; padding: 6px 4px; margin-bottom: 6px;
    color: #334155;
  }}
  .day-stack {{ display: flex; flex-direction: column; gap: 6px; }}
  .card {{
    display: grid; grid-template-columns: 18px 42px minmax(0, 1fr); gap: 6px;
    min-height: 58px; padding: 6px 8px 6px 6px;
    border: 1px solid; border-radius: 10px;
  }}
  .ord {{
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 800; line-height: 1;
  }}
  .rail {{
    display: flex; flex-direction: column; align-items: flex-end;
    justify-content: space-between; padding: 1px 6px 1px 0;
    border-right: 2px solid currentColor; opacity: .72;
  }}
  .rail em {{ font-style: normal; font-size: 9px; font-weight: 800; line-height: 1; }}
  .rail i {{ flex: 1; width: 2px; margin: 4px 5px 4px 0; background: currentColor; opacity: .22; border-radius: 99px; }}
  .main {{ display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; }}
  .main strong {{ font-size: 11px; line-height: 1.2; }}
  .who {{ font-size: 9px; font-weight: 600; }}
  .gap {{
    text-align: center; font-size: 8px; font-weight: 700; letter-spacing: .04em;
    text-transform: uppercase; color: #64748b; padding: 3px 0;
  }}
  .empty {{ color: #94a3b8; text-align: center; padding: 12px 0; }}
</style></head><body>
  <h1>{title}</h1>
  <div class="meta">{meta}</div>
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
            })
            total_skipped += 1
            continue

        try:
            pdf_bytes, filename, pdf_baslik = render_class_schedule_pdf(
                term_id=term_id,
                version_id=version_id,
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
            })
            total_errors += 1
            continue

        recipients = _resolve_recipients(term_id, sid)
        fp = compute_grid_fingerprint(version_id, sid)
        errors: list[str] = []
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
        source = MessageSource(module='akademik', ref_id=f'schedule:{version_id}:{sid}')
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
                if isinstance(result, SendResult) and result.success:
                    veli_ok += 1
                else:
                    err = (
                        '; '.join(result.errors)
                        if isinstance(result, SendResult) and result.errors
                        else 'Veli gönderimi başarısız'
                    )
                    errors.append(f'veli:{veli.id}: {err}')

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
                if isinstance(result, SendResult) and result.success:
                    ogrenci_ok += 1
                else:
                    err = (
                        '; '.join(result.errors)
                        if isinstance(result, SendResult) and result.errors
                        else 'Öğrenci gönderimi başarısız'
                    )
                    errors.append(f'ogrenci:{student.id}: {err}')

        if veli_ok or ogrenci_ok:
            status = (
                ClassScheduleNotifyStatus.PARTIAL
                if errors
                else ClassScheduleNotifyStatus.SENT
            )
            ClassScheduleNotifyLog.objects.create(
                kurum_id=kurum_id,
                term_id=term_id,
                schedule_version_id=version_id,
                sinif_id=sid,
                grid_fingerprint=fp,
                veli_count=veli_ok,
                ogrenci_count=ogrenci_ok,
                status=status,
                detail={'errors': errors[:50]},
                sent_by=user if user and getattr(user, 'is_authenticated', False) else None,
            )
            results.append({
                'sinif_id': sid,
                'sinif_ad': cls_row['sinif_ad'],
                'status': 'sent' if not errors else 'partial',
                'reason': None,
                'veli_sent': veli_ok,
                'ogrenci_sent': ogrenci_ok,
                'errors': errors[:20],
            })
            total_veli += veli_ok
            total_ogrenci += ogrenci_ok
            if errors:
                total_errors += len(errors)
        else:
            ClassScheduleNotifyLog.objects.create(
                kurum_id=kurum_id,
                term_id=term_id,
                schedule_version_id=version_id,
                sinif_id=sid,
                grid_fingerprint=fp,
                veli_count=0,
                ogrenci_count=0,
                status=ClassScheduleNotifyStatus.FAILED,
                detail={'errors': errors[:50] or ['Alıcı yok veya gönderim başarısız']},
                sent_by=user if user and getattr(user, 'is_authenticated', False) else None,
            )
            results.append({
                'sinif_id': sid,
                'sinif_ad': cls_row['sinif_ad'],
                'status': 'failed',
                'reason': 'no_recipients' if not errors else 'dispatch',
                'veli_sent': 0,
                'ogrenci_sent': 0,
                'errors': errors[:20] or ['Gönderilecek alıcı bulunamadı'],
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
        pdf_bytes = render_html_to_pdf(html_doc, landscape=False)
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
            results.append({
                'teacher_id': tid,
                'teacher_name': row['teacher_name'],
                'status': 'sent',
                'reason': None,
                'sent': 1,
                'errors': [],
            })
            total_sent += 1
        else:
            err = (
                '; '.join(result.errors)
                if isinstance(result, SendResult) and result.errors
                else 'Öğretmen gönderimi başarısız'
            )
            results.append({
                'teacher_id': tid,
                'teacher_name': row['teacher_name'],
                'status': 'failed',
                'reason': 'dispatch',
                'sent': 0,
                'errors': [err],
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
