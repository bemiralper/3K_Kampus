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
    students_no_phone = 0
    veliler_no_phone = 0

    for p in placements:
        student = p.student
        students.append(student)
        if not (student.telefon or '').strip():
            students_no_phone += 1
        veliler = list(student.veliler.all())
        if not veliler:
            continue
        for veli in veliler:
            phone = effective_veli_phone(veli, student)
            if phone:
                veli_targets.append((veli, student))
            else:
                veliler_no_phone += 1

    return {
        'students': students,
        'veli_targets': veli_targets,
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
    version = ScheduleVersion.objects.filter(pk=version_id, term_id=term_id).first()
    if not version:
        raise ScheduleNotifyError('Program versiyonu bulunamadı.', field='version_id')

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
            'warning': warning,
            'default_selected': has_changes and filled > 0,
        })

    return {
        'term_id': term_id,
        'term_name': term.name,
        'version_id': version_id,
        'version_name': version.name,
        'classes': classes,
    }


def _safe_filename_part(value: str) -> str:
    cleaned = re.sub(r'[^\w\-]+', '_', (value or '').strip(), flags=re.UNICODE)
    return cleaned.strip('_')[:40] or 'sinif'


def build_schedule_pdf_html(payload: dict[str, Any]) -> str:
    """Tek sınıf (veya gruplar) için landscape HTML tablo."""
    kurum = html.escape(payload.get('kurum_ad') or '')
    sube = html.escape(payload.get('sube_ad') or '')
    term = html.escape((payload.get('term') or {}).get('name') or '')
    version = html.escape((payload.get('version') or {}).get('name') or '')
    days = payload.get('days') or []
    day_headers = ''.join(
        f'<th>{html.escape(d.get("short_name") or d.get("name") or "")}</th>'
        for d in days
    )

    sections = []
    for group in payload.get('groups') or []:
        rows_html = []
        for row in group.get('rows') or []:
            cells = []
            for cell in row.get('cells') or []:
                if not cell:
                    cells.append('<td class="empty">—</td>')
                    continue
                lesson = html.escape(cell.get('lesson') or '')
                teacher = html.escape(cell.get('teacher') or '')
                inner = lesson
                if teacher:
                    inner += f'<br><span class="t">{teacher}</span>'
                cells.append(f'<td>{inner}</td>')
            slot = html.escape(row.get('slot_name') or '')
            time_s = html.escape(row.get('slot_time') or '')
            rows_html.append(
                f'<tr><th class="slot">{slot}<br><span class="t">{time_s}</span></th>'
                f'{"".join(cells)}</tr>',
            )
        cname = html.escape(group.get('classroom_name') or '')
        sections.append(
            f'<h2>{cname}</h2>'
            f'<table><thead><tr><th>Saat</th>{day_headers}</tr></thead>'
            f'<tbody>{"".join(rows_html)}</tbody></table>',
        )

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {{ font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 16px; }}
  h1 {{ font-size: 18px; margin: 0 0 4px; color: #0262a7; }}
  .meta {{ color: #555; margin-bottom: 12px; }}
  h2 {{ font-size: 14px; margin: 16px 0 8px; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th, td {{ border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }}
  thead th {{ background: #0262a7; color: #fff; }}
  th.slot {{ background: #f1f5f9; width: 90px; text-align: left; }}
  td.empty {{ color: #94a3b8; text-align: center; }}
  .t {{ color: #64748b; font-size: 10px; }}
</style></head><body>
  <h1>Ders Programı</h1>
  <div class="meta">{kurum} · {sube} · {term} · {version}</div>
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


def send_class_schedules(
    *,
    kurum_id: int,
    sube_id: int,
    term_id: int,
    version_id: int,
    sinif_ids: list[int],
    force_unchanged_ids: list[int] | None = None,
    send_to: list[str] | None = None,
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

        if send_veli:
            for veli, student in recipients['veli_targets']:
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
