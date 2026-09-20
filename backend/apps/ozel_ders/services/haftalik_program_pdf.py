"""Özel ders haftalık şablon PDF + WhatsApp gönderimi."""
from __future__ import annotations

import io
import logging
import re
from datetime import date
from typing import Any

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.academic.services.schedule_export_service import schedule_cell_palette
from apps.ozel_ders.services.pdf_brand import (
    SIDE,
    brand_header,
    draw_page_chrome,
    header_styles,
    register_fonts,
)

from apps.communication.application.communication_service import MessageSource
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.notification_dispatcher import (
    NotificationAttachment,
    NotificationRecipient,
    dispatch_event,
)
from apps.communication.application.notification_events import get_event
from apps.communication.application.notification_template_resolver import resolve_binding
from apps.communication.application.variable_resolver import resolve_variables
from apps.communication.domain.enums import RecipientType
from apps.ogrenci.application.veli_contact import effective_veli_phone
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    BirebirOgrenciProgrami,
    ProgramDurumu,
)
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.ogrenci_ozel_ders_dashboard import GUN_LABELS

GUN_SHORT = {
    1: 'Pzt',
    2: 'Sal',
    3: 'Çar',
    4: 'Per',
    5: 'Cum',
    6: 'Cmt',
    7: 'Paz',
}

logger = logging.getLogger(__name__)

EVENT_KEY = 'ozel_ders.haftalik_program'
OPT_IN_CATEGORY = 'duyuru'

BRAND = '#0262a7'
BRAND_SOFT = '#e8f2fa'
INK = '#1e3352'
MUTED = '#7088a4'
LINE = '#dfe6ef'
SURFACE = '#f7f9fc'


def _person_ad(obj) -> str:
    if obj is None:
        return ''
    ad = getattr(obj, 'tam_ad', None)
    if ad:
        return str(ad)
    return f'{getattr(obj, "ad", "")} {getattr(obj, "soyad", "")}'.strip()


def _escape(text: str) -> str:
    return (
        (text or '')
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
    )


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r'[^A-Za-z0-9._-]+', '_', name).strip('_')
    return (cleaned or 'ozel-ders-program')[:80]


def _register_fonts() -> tuple[str, str]:
    try:
        return register_fonts()
    except Exception:
        return 'Helvetica', 'Helvetica-Bold'


def collect_weekly_program(
    *,
    ogrenci_id: int,
    kurum_id: int,
    sube_id: int,
    start_date: date | str | None = None,
    end_date: date | str | None = None,
) -> dict[str, Any]:
    try:
        ogrenci = Ogrenci.objects.select_related('kurum', 'sube').get(
            pk=ogrenci_id, kurum_id=kurum_id, sube_id=sube_id,
        )
    except Ogrenci.DoesNotExist as exc:
        raise OzelDersError('Öğrenci bulunamadı.', 'not_found', 404) from exc

    programs = list(
        BirebirOgrenciProgrami.objects.filter(
            ogrenci_id=ogrenci_id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            durum=ProgramDurumu.AKTIF,
        ).select_related('premium_paket', 'ozel_ders_paket')
    )
    slots = list(
        BirebirHaftalikSlot.objects.filter(
            program__in=programs,
            aktif=True,
        ).select_related('ders', 'ogretmen', 'oda', 'program').order_by('gun', 'baslangic')
    )
    paketler = []
    for p in programs:
        ad = (
            p.premium_paket.ad if p.premium_paket_id and p.premium_paket
            else (p.ozel_ders_paket.ad if p.ozel_ders_paket_id and p.ozel_ders_paket else None)
        )
        if ad and ad not in paketler:
            paketler.append(ad)

    week_start = _parse_iso_date(start_date)
    week_end = _parse_iso_date(end_date)
    week_mode = bool(week_start and week_end)
    rows = []
    if week_mode:
        sessions = (
            BirebirDersOturumu.objects
            .filter(
                ogrenci_id=ogrenci_id,
                kurum_id=kurum_id,
                sube_id=sube_id,
                is_active=True,
                session_date__gte=week_start,
                session_date__lte=week_end,
            )
            .select_related('ders', 'ogretmen', 'oda')
            .order_by('session_date', 'start_time', 'id')
        )
        for o in sessions:
            rows.append({
                'gun': o.session_date.isoweekday(),
                'gun_label': (
                    f"{GUN_LABELS.get(o.session_date.isoweekday(), '')} "
                    f"{o.session_date.strftime('%d.%m')}"
                ).strip(),
                'baslangic': o.start_time.strftime('%H:%M'),
                'bitis': o.end_time.strftime('%H:%M'),
                'ders_id': o.ders_id,
                'ders_ad': getattr(o.ders, 'ad', None) or str(o.ders_id),
                'ogretmen_ad': _person_ad(o.ogretmen),
                'oda_ad': o.oda.ad if o.oda_id else '',
                'durum': o.get_durum_display(),
            })
    else:
        for s in slots:
            rows.append({
                'gun': s.gun,
                'gun_label': GUN_LABELS.get(s.gun, str(s.gun)),
                'baslangic': s.baslangic.strftime('%H:%M'),
                'bitis': s.bitis.strftime('%H:%M'),
                'ders_id': s.ders_id,
                'ders_ad': getattr(s.ders, 'ad', None) or str(s.ders_id),
                'ogretmen_ad': _person_ad(s.ogretmen),
                'oda_ad': s.oda.ad if s.oda_id else '',
            })

    ogrenci_ad = _person_ad(ogrenci)
    week_label = (
        f"{week_start.strftime('%d.%m.%Y')} – {week_end.strftime('%d.%m.%Y')}"
        if week_mode else ''
    )
    return {
        'ogrenci': ogrenci,
        'ogrenci_id': ogrenci_id,
        'ogrenci_ad': ogrenci_ad,
        'kurum_ad': ogrenci.kurum.ad if ogrenci.kurum_id else '',
        'sube_ad': ogrenci.sube.ad if ogrenci.sube_id else '',
        'paketler': paketler,
        'slots': rows,
        'mode': 'week' if week_mode else 'template',
        'week_label': week_label,
        'pdf_baslik': (
            f'{ogrenci_ad} — Haftalık program ({week_label})'
            if week_mode
            else f'{ogrenci_ad} — Özel ders haftalık program'
        ),
    }


def _parse_iso_date(value: date | str | None) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return date.fromisoformat(value.strip()[:10])
        except ValueError:
            return None
    return None


def _occupied_days(slots: list[dict[str, Any]]) -> list[tuple[int, list[dict[str, Any]]]]:
    by_day: dict[int, list[dict[str, Any]]] = {}
    for row in slots:
        by_day.setdefault(int(row['gun']), []).append(row)
    return [(gun, by_day[gun]) for gun in range(1, 8) if by_day.get(gun)]


def haftalik_as_schedule_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Birebir satırlarını sınıf/öğretmen PDF şablonuyla aynı yapıya çevirir."""
    visible = _occupied_days(payload.get('slots') or [])
    days = []
    columns = []
    for gun, rows in visible:
        days.append({
            'id': gun,
            'name': rows[0].get('gun_label') or GUN_LABELS.get(gun, str(gun)),
            'short_name': GUN_SHORT.get(gun) or GUN_LABELS.get(gun, str(gun)),
            'order': gun,
        })
        columns.append([
            {
                'start': row.get('baslangic') or '',
                'end': row.get('bitis') or '',
                'lesson': row.get('ders_ad') or '',
                'lesson_id': row.get('ders_id'),
                'teacher': row.get('ogretmen_ad') or '',
                'teacher_id': None,
                'classroom': row.get('oda_ad') or '',
                'classroom_id': None,
                'status': row.get('durum') or '',
                'label': row.get('ders_ad') or '',
            }
            for row in rows
        ])
    return {
        'report_title': 'ÖZEL DERS PROGRAMI',
        'subject_kind': 'student',
        'layout_kind': 'grid',
        'egitim_yili': payload.get('week_label') or payload.get('kurum_ad') or '',
        'term': {'name': ', '.join(payload.get('paketler') or [])},
        'days': days,
        'groups': [{
            'classroom_name': payload.get('ogrenci_ad') or 'Öğrenci',
            'day_cards': columns,
            'rows': [],
        }],
    }


def _day_column(day_title: str, day_rows: list[dict[str, Any]], col_w: float, styles) -> Table:
    rail_w = min(14 * mm, max(11 * mm, col_w * 0.22))
    body_w = col_w - rail_w
    head = Table(
        [[Paragraph(_escape(day_title), styles['day'])]],
        colWidths=[col_w],
    )
    head.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f1f5f9')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('LINEABOVE', (0, 0), (-1, 0), 2.2, colors.HexColor(BRAND)),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    blocks = [head, Spacer(1, 2.2 * mm)]
    for order, row in enumerate(day_rows, 1):
        pal = schedule_cell_palette(row.get('ders_id')) or {}
        bg = f"#{pal['bg']}" if pal else '#eff6ff'
        border = f"#{pal['border']}" if pal else '#93c5fd'
        ink = f"#{pal['text']}" if pal else INK
        who = ' · '.join(part for part in (
            (row.get('ogretmen_ad') or '').strip(),
            (row.get('oda_ad') or '').strip(),
            (row.get('durum') or '').strip(),
        ) if part)
        card_rows = [
            [
                Paragraph(_escape(row.get('baslangic') or ''), styles['time'](ink)),
                Paragraph(f'{order}. Ders', styles['badge'](ink)),
            ],
            [
                Paragraph(_escape(row.get('bitis') or ''), styles['time'](ink)),
                Paragraph(_escape(row.get('ders_ad') or ''), styles['lesson'](ink)),
            ],
        ]
        if who:
            card_rows.append(['', Paragraph(_escape(who), styles['who'](ink))])
        card = Table(card_rows, colWidths=[rail_w, body_w])
        card.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(bg)),
            ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor(border)),
            ('LINEAFTER', (0, 0), (0, -1), 1.4, colors.HexColor(ink)),
            ('VALIGN', (0, 0), (0, -1), 'MIDDLE'),
            ('VALIGN', (1, 0), (1, -1), 'TOP'),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('LEFTPADDING', (0, 0), (0, -1), 3),
            ('RIGHTPADDING', (0, 0), (0, -1), 4),
            ('LEFTPADDING', (1, 0), (1, -1), 5),
            ('RIGHTPADDING', (1, 0), (1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, 0), 5),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 5),
            ('TOPPADDING', (0, 1), (-1, -2), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -2), 1),
        ]))
        blocks.append(card)
        blocks.append(Spacer(1, 2 * mm))
    return Table([[blocks]], colWidths=[col_w])


def render_haftalik_program_pdf(payload: dict[str, Any]) -> tuple[bytes, str]:
    filename = f"{_safe_filename(payload.get('ogrenci_ad') or '')}_ozel_ders_haftalik.pdf"
    try:
        from apps.academic.application.schedule_notify_service import build_schedule_pdf_html
        from apps.communication.application.html_to_pdf import render_html_to_pdf

        html_doc = build_schedule_pdf_html(haftalik_as_schedule_payload(payload))
        return render_html_to_pdf(html_doc, landscape=True), filename
    except Exception as exc:
        logger.warning('Birebir HTML PDF başarısız, reportlab fallback: %s', exc)
    return _render_haftalik_program_reportlab(payload, filename)


def _render_haftalik_program_reportlab(
    payload: dict[str, Any],
    filename: str | None = None,
) -> tuple[bytes, str]:
    font, font_bold = _register_fonts()
    ogrenci_ad = payload['ogrenci_ad']
    title = payload['pdf_baslik']
    page_w, page_h = landscape(A4)
    content_w = page_w - 2 * SIDE

    def mk(name, *, size, bold=False, color=INK, align=0, leading=None):
        return ParagraphStyle(
            name, fontName=font_bold if bold else font, fontSize=size,
            leading=leading or size * 1.28,
            textColor=colors.HexColor(color), alignment=align,
        )

    def tinted(base, size, *, bold=False):
        def make(color: str):
            return ParagraphStyle(
                f'{base}_{color}',
                fontName=font_bold if bold else font,
                fontSize=size,
                leading=size * 1.25,
                textColor=colors.HexColor(color),
            )
        return make

    styles = {
        'day': mk('hp_day', size=8.5, bold=True, color='#334155', align=1),
        'empty': mk('hp_empty', size=10, color=MUTED, align=1),
        'time': tinted('hp_time', 7.2, bold=True),
        'badge': tinted('hp_badge', 6.4, bold=True),
        'lesson': tinted('hp_lesson', 8.4, bold=True),
        'who': tinted('hp_who', 7),
    }

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=(page_w, page_h),
        leftMargin=SIDE, rightMargin=SIDE,
        topMargin=12 * mm, bottomMargin=14 * mm,
        title=title,
    )
    story = []
    meta_bits = [p for p in (
        payload.get('kurum_ad'),
        payload.get('sube_ad'),
        f"{len(payload.get('slots') or [])} ders / hafta",
    ) if p]
    strip_bits = [p for p in (
        ', '.join(payload.get('paketler') or []) or None,
        payload.get('week_label') or 'Haftalık özel ders programı',
    ) if p]
    story.extend(brand_header(
        header_styles(font, font_bold),
        kicker='Özel Ders Yönetimi',
        title=ogrenci_ad or 'Öğrenci',
        meta='  ·  '.join(meta_bits),
        strip='  ·  '.join(strip_bits),
        content_w=content_w,
    ))
    story.append(Spacer(1, 5 * mm))

    slots = payload.get('slots') or []
    visible = _occupied_days(slots)
    if not visible:
        empty = Table(
            [[Paragraph('Bu öğrencinin aktif haftalık program şablonu yok.', styles['empty'])]],
            colWidths=[content_w],
        )
        empty.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(BRAND_SOFT)),
            ('TOPPADDING', (0, 0), (-1, -1), 14),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ]))
        story.append(empty)
    else:
        gap = 2.4 * mm
        col_w = (content_w - gap * (len(visible) - 1)) / max(1, len(visible))
        columns = []
        for gun, day_rows in visible:
            day_title = day_rows[0].get('gun_label') or GUN_LABELS.get(gun, str(gun))
            columns.append(_day_column(day_title, day_rows, col_w, styles))
        board = Table([columns], colWidths=[col_w] * len(visible))
        board.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 1.2),
            ('RIGHTPADDING', (0, 0), (-1, -1), 1.2),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(board)

    caption = '3K Kampüs · Özel ders haftalık program'
    running = (ogrenci_ad or 'Haftalık program')[:72]

    def first_page(c, d):
        draw_page_chrome(c, d, font, caption, page_w=page_w, page_h=page_h)

    def later_page(c, d):
        draw_page_chrome(
            c, d, font, caption, running_title=running, font_bold=font_bold,
            page_w=page_w, page_h=page_h,
        )

    doc.build(story, onFirstPage=first_page, onLaterPages=later_page)
    return buf.getvalue(), filename or f"{_safe_filename(ogrenci_ad)}_ozel_ders_haftalik.pdf"


def pdf_http_response(payload: dict[str, Any]) -> HttpResponse:
    pdf_bytes, filename = render_haftalik_program_pdf(payload)
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def _mask_phone(phone: str) -> str:
    p = (phone or '').strip()
    if len(p) < 4:
        return p
    return f'{p[:3]}***{p[-2:]}'


def _base_context(payload: dict[str, Any], *, veli=None) -> dict[str, str]:
    return {
        'ogrenci_ad': payload['ogrenci_ad'],
        'pdf_baslik': payload['pdf_baslik'],
        'paketler': ', '.join(payload.get('paketler') or []),
        'kurum_ad': payload.get('kurum_ad') or '',
        'sube': payload.get('sube_ad') or '',
        'veli_ad': _person_ad(veli) or 'Velimiz',
    }


def _render_body(recipient_type: str, ctx: dict[str, str]) -> str:
    event = get_event(EVENT_KEY)
    template = event.default_body(recipient_type) if event else ''
    return resolve_variables(template, ctx).strip()


def _template_info(kurum_id: int, sube_id: int, recipient_type: str) -> dict[str, Any]:
    resolved = resolve_binding(
        kurum_id, EVENT_KEY, recipient_type, sube_id=sube_id,
    )
    meta = getattr(resolved, 'meta_template', None)
    app = getattr(resolved, 'message_template', None)
    meta_name = getattr(meta, 'name', '') or ''
    meta_status = getattr(meta, 'status', '') or ''
    usable = bool(resolved and resolved.meta_usable(needs_document=True))
    return {
        'recipient_type': recipient_type,
        'meta_name': meta_name,
        'meta_status': meta_status,
        'meta_usable': usable,
        'app_template': getattr(app, 'name', '') or '',
        'has_catalog_body': bool(get_event(EVENT_KEY)),
    }


def preview_haftalik_program(
    *,
    ogrenci_id: int,
    kurum_id: int,
    sube_id: int,
) -> dict[str, Any]:
    payload = collect_weekly_program(
        ogrenci_id=ogrenci_id, kurum_id=kurum_id, sube_id=sube_id,
    )
    ogrenci = payload['ogrenci']
    recipients: list[dict[str, Any]] = []

    veliler = list(OgrenciVeli.objects.filter(ogrenci=ogrenci).order_by('-varsayilan', '-id'))
    for veli in veliler:
        phone = effective_veli_phone(veli, ogrenci) or ''
        skip = ''
        if not phone.strip():
            skip = 'Veli telefonu yok'
        elif not ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
            skip = 'Veli duyuru bildirimini kabul etmemiş'
        ctx = _base_context(payload, veli=veli)
        recipients.append({
            'recipient_type': 'veli',
            'ogrenci_id': ogrenci.id,
            'veli_id': veli.id,
            'display_name': _person_ad(veli) or 'Veli',
            'telefon': _mask_phone(phone),
            'body': _render_body(RecipientType.VELI, ctx),
            'skip_reason': skip,
        })
    if not veliler:
        recipients.append({
            'recipient_type': 'veli',
            'ogrenci_id': ogrenci.id,
            'veli_id': None,
            'display_name': '',
            'telefon': '',
            'body': '',
            'skip_reason': 'Veli kaydı yok',
        })

    student_phone = (getattr(ogrenci, 'telefon', '') or '').strip()
    recipients.append({
        'recipient_type': 'ogrenci',
        'ogrenci_id': ogrenci.id,
        'veli_id': None,
        'display_name': payload['ogrenci_ad'],
        'telefon': _mask_phone(student_phone) if student_phone else '',
        'body': _render_body(RecipientType.OGRENCI, _base_context(payload)),
        'skip_reason': '' if student_phone else 'Öğrenci telefonu yok',
    })

    templates = {
        'veli': _template_info(kurum_id, sube_id, RecipientType.VELI),
        'ogrenci': _template_info(kurum_id, sube_id, RecipientType.OGRENCI),
    }
    meta_ready = (
        templates['veli']['meta_usable'] or templates['ogrenci']['meta_usable']
    )
    return {
        'ogrenci_id': ogrenci.id,
        'ogrenci_ad': payload['ogrenci_ad'],
        'pdf_baslik': payload['pdf_baslik'],
        'slot_count': len(payload['slots']),
        'paketler': payload['paketler'],
        'recipients': recipients,
        'templates': templates,
        'send_mode': 'meta_template' if meta_ready else 'document',
        'has_template': True,
        'event_key': EVENT_KEY,
        'event_label': (get_event(EVENT_KEY).label if get_event(EVENT_KEY) else EVENT_KEY),
    }


def send_haftalik_program(
    *,
    ogrenci_id: int,
    kurum_id: int,
    sube_id: int,
    send_veli: bool = True,
    send_ogrenci: bool = True,
    veli_ids: list[int] | None = None,
    include_student: bool | None = None,
    user=None,
) -> dict[str, Any]:
    payload = collect_weekly_program(
        ogrenci_id=ogrenci_id, kurum_id=kurum_id, sube_id=sube_id,
    )
    if not payload['slots']:
        raise OzelDersError(
            'Gönderilecek haftalık program yok. Önce şablona ders ekleyin.',
            'empty',
        )
    pdf_bytes, filename = render_haftalik_program_pdf(payload)
    ogrenci = payload['ogrenci']
    attachment = NotificationAttachment(filename=filename, file_bytes=pdf_bytes)
    source = MessageSource(module='ozel_ders', ref_id=f'haftalik:{ogrenci_id}')
    sent_by = getattr(user, 'id', None)
    preview = preview_haftalik_program(
        ogrenci_id=ogrenci_id, kurum_id=kurum_id, sube_id=sube_id,
    )
    selected_veli = set(veli_ids) if veli_ids is not None else None
    if include_student is None:
        include_student = send_ogrenci

    veli_ok = 0
    ogrenci_ok = 0
    skipped = 0
    errors: list[str] = []

    for item in preview['recipients']:
        if item['recipient_type'] == 'veli':
            if selected_veli is not None:
                if not item['veli_id'] or item['veli_id'] not in selected_veli:
                    continue
            elif not send_veli:
                continue
            if item['skip_reason'] or not item['veli_id']:
                skipped += 1
                errors.append(f"{item['display_name'] or 'Veli'}: {item['skip_reason'] or 'Atlandı'}")
                continue
            veli = OgrenciVeli.objects.filter(pk=item['veli_id']).first()
            if not veli:
                skipped += 1
                continue
            ctx = _base_context(payload, veli=veli)
            result = dispatch_event(
                kurum_id,
                EVENT_KEY,
                recipient=NotificationRecipient.veli(veli.id),
                context=ctx,
                attachment=attachment,
                source=source,
                sube_id=sube_id,
                sent_by_user_id=sent_by,
                fallback_body=item['body'],
            )
            if getattr(result, 'success', False):
                veli_ok += 1
            else:
                err = (
                    '; '.join(getattr(result, 'errors', None) or [])
                    or 'Veli gönderimi başarısız'
                )
                errors.append(f"{item['display_name']}: {err}")
            continue

        if item['recipient_type'] == 'ogrenci':
            if not include_student:
                continue
            if item['skip_reason']:
                skipped += 1
                errors.append(f"{item['display_name']}: {item['skip_reason']}")
                continue
            result = dispatch_event(
                kurum_id,
                EVENT_KEY,
                recipient=NotificationRecipient.ogrenci(ogrenci.id),
                context=_base_context(payload),
                attachment=attachment,
                source=source,
                sube_id=sube_id,
                sent_by_user_id=sent_by,
                fallback_body=item['body'],
            )
            if getattr(result, 'success', False):
                ogrenci_ok += 1
            else:
                err = (
                    '; '.join(getattr(result, 'errors', None) or [])
                    or 'Öğrenci gönderimi başarısız'
                )
                errors.append(f"{item['display_name']}: {err}")

    if veli_ok + ogrenci_ok == 0:
        raise OzelDersError(
            errors[0] if errors else 'WhatsApp gönderilemedi.',
            'send_failed',
        )

    return {
        'veli_sent': veli_ok,
        'ogrenci_sent': ogrenci_ok,
        'skipped': skipped,
        'errors': errors,
        'filename': filename,
    }
