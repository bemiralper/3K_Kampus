"""Derslere göre özet + ders geçmişi PDF ve WhatsApp gönderimi."""
from __future__ import annotations

import io
import logging
from datetime import date
from typing import Any

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.ozel_ders.services.pdf_brand import (
    CONTENT_W,
    SIDE,
    brand_header,
    draw_page_chrome,
    header_styles,
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
from apps.ozel_ders.domain.models import BirebirDersOturumu, TelafiDurumu
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.haftalik_program_pdf import (
    _escape,
    _mask_phone,
    _person_ad,
    _register_fonts,
    _safe_filename,
)
from apps.ozel_ders.services.ders_tatil_service import build_tatil_hits
from apps.ozel_ders.services.student_lesson_summary import (
    calculate_student_private_lesson_summary,
)

logger = logging.getLogger(__name__)

EVENT_KEY = 'ozel_ders.ders_ozeti'
EVENT_KEY_TIMELINE = 'ozel_ders.ders_gecmisi'
OPT_IN_CATEGORY = 'duyuru'

BRAND = '#0262a7'
BRAND_SOFT = '#e8f2fa'
INK = '#1e3352'
MUTED = '#7088a4'
LINE = '#dfe6ef'
SURFACE = '#f7f9fc'


def _parse_iso(value: str) -> date:
    return date.fromisoformat((value or '')[:10])


def _fmt_tr_date(value: str) -> str:
    raw = (value or '')[:10]
    if len(raw) == 10 and raw[4] == '-':
        y, m, d = raw.split('-')
        return f'{d}.{m}.{y}'
    return raw or '—'


def _saat_kota(used: int | None, hedef: int | None) -> str:
    if not hedef:
        return '—'
    used_h = (used or 0) / 60
    hedef_h = hedef / 60
    return f'{used_h:.1f} / {hedef_h:.1f} saat'


def collect_ders_ozet(
    *,
    ogrenci_id: int,
    kurum_id: int,
    sube_id: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    start_date = (start_date or '').strip() or None
    end_date = (end_date or '').strip() or None
    data = calculate_student_private_lesson_summary(
        ogrenci_id=ogrenci_id,
        kurum_id=kurum_id,
        sube_id=sube_id,
        start_date=start_date,
        end_date=end_date,
    )
    try:
        ogrenci = Ogrenci.objects.select_related('kurum', 'sube').get(
            pk=ogrenci_id, kurum_id=kurum_id, sube_id=sube_id,
        )
    except Ogrenci.DoesNotExist as exc:
        raise OzelDersError('Öğrenci bulunamadı.', 'not_found', 404) from exc
    donem = data.get('donem') or {}
    return {
        **data,
        'ogrenci': ogrenci,
        'kurum_ad': ogrenci.kurum.ad if ogrenci.kurum_id else '',
        'sube_ad': ogrenci.sube.ad if ogrenci.sube_id else '',
        'pdf_baslik': f"{data['ogrenci_ad']} — Derslere göre özet",
        'donem_label': (
            f"{_fmt_tr_date(donem.get('baslangic', ''))} – "
            f"{_fmt_tr_date(donem.get('bitis', ''))}"
        ),
    }


def collect_ders_timeline(
    *,
    ogrenci_id: int,
    ders_id: int,
    kurum_id: int,
    sube_id: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    payload = collect_ders_ozet(
        ogrenci_id=ogrenci_id,
        kurum_id=kurum_id,
        sube_id=sube_id,
        start_date=start_date,
        end_date=end_date,
    )
    ders_row = next(
        (d for d in (payload.get('dersler') or []) if int(d['ders_id']) == int(ders_id)),
        None,
    )
    if ders_row is None:
        raise OzelDersError('Bu dönemde bu ders bulunamadı.', 'not_found', 404)

    donem = payload['donem']
    qs = BirebirDersOturumu.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        ogrenci_id=ogrenci_id,
        ders_id=ders_id,
        is_active=True,
        session_date__gte=donem['baslangic'],
        session_date__lte=donem['bitis'],
    ).select_related('ders', 'ogretmen', 'oda').order_by('session_date', 'start_time', 'id')

    rows = []
    for o in qs:
        sebep = (o.sebep_aciklama or o.get_sebep_kodu_display() or '').strip()
        notlar = (o.notes or '').strip()
        aciklama = ' · '.join(p for p in (sebep, notlar) if p)
        telafi = ''
        if o.telafi_durumu and o.telafi_durumu != TelafiDurumu.GEREKMIYOR:
            telafi = o.get_telafi_durumu_display()
        rows.append({
            'id': o.id,
            'tarih': o.session_date.isoformat(),
            'tarih_label': o.session_date.strftime('%d.%m.%Y'),
            'saat': f"{o.start_time.strftime('%H:%M')}–{o.end_time.strftime('%H:%M')}",
            'durum': o.get_durum_display(),
            'durum_kod': o.durum,
            'tur': o.get_oturum_turu_display(),
            'tur_kod': o.oturum_turu,
            'ogretmen_ad': _person_ad(o.ogretmen),
            'oda_ad': o.oda.ad if o.oda_id else '',
            'telafi_durumu': telafi,
            'sebep': sebep,
            'notlar': notlar,
            'aciklama': aciklama,
            'tatil_gun': False,
            'tatil_baslik': '',
            'holiday_key': '',
            'tatil_mode': '',
            'can_toggle_tatil': False,
            'virtual': False,
            'slot_id': o.source_slot_id,
        })

    donem_start = _parse_iso(donem['baslangic'])
    donem_end = _parse_iso(donem['bitis'])
    hits = build_tatil_hits(
        ogrenci_id=ogrenci_id,
        kurum_id=kurum_id,
        sube_id=sube_id,
        start=donem_start,
        end=donem_end,
        ders_id=ders_id,
    )
    by_date: dict[str, list[dict]] = {}
    for row in rows:
        by_date.setdefault(row['tarih'], []).append(row)
    for hit in hits:
        matches = by_date.get(hit['tarih']) or []
        existing = next(
            (r for r in matches if r.get('slot_id') == hit['slot_id']),
            matches[0] if matches else None,
        )
        if existing:
            existing['tatil_gun'] = True
            existing['tatil_baslik'] = hit['tatil_baslik']
            existing['holiday_key'] = hit['holiday_key']
            existing['tatil_mode'] = hit['tatil_mode']
            existing['can_toggle_tatil'] = hit['can_toggle_tatil']
            if not existing.get('aciklama'):
                existing['aciklama'] = hit['tatil_baslik']
            continue
        rows.append({
            'id': f"tatil:{hit['slot_id']}:{hit['tarih']}",
            'tarih': hit['tarih'],
            'tarih_label': hit['tarih_label'],
            'saat': hit['saat'],
            'durum': 'Tatil',
            'durum_kod': 'TATIL',
            'tur': 'Özel Ders',
            'tur_kod': 'OZEL',
            'ogretmen_ad': hit['ogretmen_ad'],
            'oda_ad': '',
            'telafi_durumu': '',
            'sebep': '',
            'notlar': '',
            'aciklama': hit['tatil_baslik'],
            'tatil_gun': True,
            'tatil_baslik': hit['tatil_baslik'],
            'holiday_key': hit['holiday_key'],
            'tatil_mode': 'tatil',
            'can_toggle_tatil': hit['can_toggle_tatil'],
            'virtual': True,
            'slot_id': hit['slot_id'],
        })
    rows.sort(key=lambda r: (r['tarih'], r.get('saat') or '', str(r['id'])))

    ders_ad = ders_row.get('ders_ad') or 'Ders'
    return {
        **payload,
        'ders_id': ders_id,
        'ders_ad': ders_ad,
        'ders_ozet': ders_row,
        'kayitlar': rows,
        'pdf_baslik': f"{payload['ogrenci_ad']} — {ders_ad} ders geçmişi",
    }


def _styles(font: str, font_bold: str) -> dict[str, ParagraphStyle]:
    def mk(name, *, size, bold=False, color=INK, align=0, leading=None):
        return ParagraphStyle(
            name, fontName=font_bold if bold else font, fontSize=size,
            leading=leading or size * 1.32,
            textColor=colors.HexColor(color), alignment=align,
        )

    return {
        'th': mk('dr_th', size=8, bold=True, color=MUTED),
        'cell': mk('dr_cell', size=8),
        'sub': mk('dr_sub', size=7.5, color=MUTED),
        'empty': mk('dr_empty', size=10, color=MUTED, align=1),
        'kpi': mk('dr_kpi', size=8, bold=True),
    }


def render_ders_ozet_pdf(payload: dict[str, Any]) -> tuple[bytes, str]:
    font, font_bold = _register_fonts()
    styles = _styles(font, font_bold)
    ogrenci_ad = payload['ogrenci_ad']
    title = payload['pdf_baslik']
    ozet = payload.get('ozet') or {}
    dersler = payload.get('dersler') or []

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=SIDE, rightMargin=SIDE,
        topMargin=14 * mm, bottomMargin=16 * mm,
        title=title,
    )
    story = []
    meta_bits = [p for p in (
        payload.get('kurum_ad'),
        payload.get('sube_ad'),
        payload.get('donem_label'),
    ) if p]
    paketler = ', '.join(p['ad'] for p in (payload.get('paketler') or []) if p.get('ad'))
    story.extend(brand_header(
        header_styles(font, font_bold),
        kicker='Özel Ders Yönetimi',
        title=ogrenci_ad or 'Öğrenci',
        meta='  ·  '.join(meta_bits),
        strip='  ·  '.join(p for p in (paketler or None, 'Derslere göre özet') if p),
    ))
    story.append(Spacer(1, 6 * mm))

    kpi = Table(
        [[
            Paragraph(f"Planlanan<br/>{ozet.get('planlanan_ders', 0)}", styles['kpi']),
            Paragraph(f"İşlenen<br/>{ozet.get('islenen_ders', 0)}", styles['kpi']),
            Paragraph(f"Kalan<br/>{ozet.get('kalan_ders', 0)}", styles['kpi']),
            Paragraph(f"Telafi<br/>{ozet.get('telafi_ders', 0)}", styles['kpi']),
            Paragraph(f"Ek<br/>{ozet.get('ek_ders', 0)}", styles['kpi']),
            Paragraph(f"İptal<br/>{ozet.get('iptal_ders', 0)}", styles['kpi']),
        ]],
        colWidths=[CONTENT_W / 6] * 6,
    )
    kpi.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(BRAND_SOFT)),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
    ]))
    story.append(kpi)
    story.append(Spacer(1, 5 * mm))

    if not dersler:
        empty = Table(
            [[Paragraph('Bu dönemde ders özeti yok.', styles['empty'])]],
            colWidths=[CONTENT_W],
        )
        empty.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(SURFACE)),
            ('TOPPADDING', (0, 0), (-1, -1), 14),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ]))
        story.append(empty)
    else:
        raw = [40, 20, 20, 18, 28, 18, 16, 16]
        scale = CONTENT_W / sum(x * mm for x in raw)
        col_w = [x * mm * scale for x in raw]
        data = [[
            Paragraph('Ders', styles['th']),
            Paragraph('Planlanan', styles['th']),
            Paragraph('İşlenen', styles['th']),
            Paragraph('Kalan', styles['th']),
            Paragraph('Saat kotası', styles['th']),
            Paragraph('Telafi', styles['th']),
            Paragraph('Ek', styles['th']),
            Paragraph('İptal', styles['th']),
        ]]
        for row in dersler:
            data.append([
                Paragraph(_escape(row.get('ders_ad') or '—'), styles['cell']),
                Paragraph(str(row.get('planlanan_ders', 0)), styles['cell']),
                Paragraph(str(row.get('islenen_ders', 0)), styles['cell']),
                Paragraph(str(row.get('kalan_ders', 0)), styles['cell']),
                Paragraph(_escape(_saat_kota(row.get('kullanilan_dakika'), row.get('hedef_dakika'))), styles['sub']),
                Paragraph(str(row.get('telafi_ders', 0)), styles['cell']),
                Paragraph(str(row.get('ek_ders', 0)), styles['cell']),
                Paragraph(str(row.get('iptal_ders', 0)), styles['cell']),
            ])
        table = Table(data, colWidths=col_w, repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(SURFACE)),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
            ('INNERGRID', (0, 0), (-1, -1), 0.3, colors.HexColor(LINE)),
        ]))
        story.append(table)

    caption = '3K Kampüs · Derslere göre özet'
    doc.build(
        story,
        onFirstPage=lambda c, d: draw_page_chrome(c, d, font, caption),
        onLaterPages=lambda c, d: draw_page_chrome(
            c, d, font, caption, running_title=(ogrenci_ad or 'Ders özeti')[:72],
            font_bold=font_bold,
        ),
    )
    return buf.getvalue(), f"{_safe_filename(ogrenci_ad)}_ders_ozeti.pdf"


def render_ders_timeline_pdf(payload: dict[str, Any]) -> tuple[bytes, str]:
    font, font_bold = _register_fonts()
    styles = _styles(font, font_bold)
    ogrenci_ad = payload['ogrenci_ad']
    ders_ad = payload.get('ders_ad') or 'Ders'
    title = payload['pdf_baslik']
    kayitlar = payload.get('kayitlar') or []
    ders_ozet = payload.get('ders_ozet') or {}

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=SIDE, rightMargin=SIDE,
        topMargin=14 * mm, bottomMargin=16 * mm,
        title=title,
    )
    story = []
    meta_bits = [p for p in (
        payload.get('kurum_ad'),
        payload.get('sube_ad'),
        payload.get('donem_label'),
        f"{len(kayitlar)} kayıt",
    ) if p]
    story.extend(brand_header(
        header_styles(font, font_bold),
        kicker='Özel Ders Yönetimi',
        title=f'{ogrenci_ad} · {ders_ad}',
        meta='  ·  '.join(meta_bits),
        strip=(
            f"Planlanan {ders_ozet.get('planlanan_ders', 0)}  ·  "
            f"İşlenen {ders_ozet.get('islenen_ders', 0)}  ·  "
            f"Telafi {ders_ozet.get('telafi_ders', 0)}  ·  "
            f"İptal {ders_ozet.get('iptal_ders', 0)}"
        ),
    ))
    story.append(Spacer(1, 6 * mm))

    if not kayitlar:
        empty = Table(
            [[Paragraph('Bu dönemde bu ders için kayıt yok.', styles['empty'])]],
            colWidths=[CONTENT_W],
        )
        empty.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(SURFACE)),
            ('TOPPADDING', (0, 0), (-1, -1), 14),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ]))
        story.append(empty)
    else:
        raw = [22, 20, 24, 22, 38, 50]
        scale = CONTENT_W / sum(x * mm for x in raw)
        col_w = [x * mm * scale for x in raw]
        data = [[
            Paragraph('Tarih', styles['th']),
            Paragraph('Saat', styles['th']),
            Paragraph('Durum', styles['th']),
            Paragraph('Tür', styles['th']),
            Paragraph('Öğretmen', styles['th']),
            Paragraph('Açıklama', styles['th']),
        ]]
        for row in kayitlar:
            note = ' · '.join(p for p in (
                row.get('telafi_durumu'),
                row.get('aciklama'),
                row.get('oda_ad') and f"Oda: {row['oda_ad']}",
            ) if p)
            data.append([
                Paragraph(_escape(row.get('tarih_label') or ''), styles['cell']),
                Paragraph(_escape(row.get('saat') or ''), styles['cell']),
                Paragraph(_escape(row.get('durum') or ''), styles['cell']),
                Paragraph(_escape(row.get('tur') or ''), styles['sub']),
                Paragraph(_escape(row.get('ogretmen_ad') or '—'), styles['cell']),
                Paragraph(_escape(note or '—'), styles['sub']),
            ])
        table = Table(data, colWidths=col_w, repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(SURFACE)),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
            ('INNERGRID', (0, 0), (-1, -1), 0.3, colors.HexColor(LINE)),
        ]))
        story.append(table)

    caption = '3K Kampüs · Ders geçmişi'
    doc.build(
        story,
        onFirstPage=lambda c, d: draw_page_chrome(c, d, font, caption),
        onLaterPages=lambda c, d: draw_page_chrome(
            c, d, font, caption, running_title=f'{ogrenci_ad} · {ders_ad}'[:72],
            font_bold=font_bold,
        ),
    )
    return buf.getvalue(), f"{_safe_filename(ogrenci_ad)}_{_safe_filename(ders_ad)}_gecmis.pdf"


def pdf_http_response(pdf_bytes: bytes, filename: str) -> HttpResponse:
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def _base_context(payload: dict[str, Any], *, veli=None) -> dict[str, str]:
    ozet = payload.get('ozet') or {}
    return {
        'ogrenci_ad': payload['ogrenci_ad'],
        'pdf_baslik': payload['pdf_baslik'],
        'paketler': ', '.join(p['ad'] for p in (payload.get('paketler') or []) if p.get('ad')),
        'kurum_ad': payload.get('kurum_ad') or '',
        'sube': payload.get('sube_ad') or '',
        'donem': payload.get('donem_label') or '',
        'ders_ad': payload.get('ders_ad') or '',
        'ders_adi': payload.get('ders_ad') or '',
        'planlanan_ders': str(ozet.get('planlanan_ders', 0)),
        'islenen_ders': str(ozet.get('islenen_ders', 0)),
        'veli_ad': _person_ad(veli) or 'Velimiz',
    }


def _render_body(recipient_type: str, ctx: dict[str, str], event_key: str = EVENT_KEY) -> str:
    event = get_event(event_key)
    template = event.default_body(recipient_type) if event else ''
    return resolve_variables(template, ctx).strip()


def _template_info(
    kurum_id: int, sube_id: int, recipient_type: str, event_key: str = EVENT_KEY,
) -> dict[str, Any]:
    resolved = resolve_binding(kurum_id, event_key, recipient_type, sube_id=sube_id)
    meta = getattr(resolved, 'meta_template', None)
    app = getattr(resolved, 'message_template', None)
    return {
        'recipient_type': recipient_type,
        'meta_name': getattr(meta, 'name', '') or '',
        'meta_status': getattr(meta, 'status', '') or '',
        'meta_usable': bool(resolved and resolved.meta_usable(needs_document=True)),
        'app_template': getattr(app, 'name', '') or '',
        'has_catalog_body': bool(get_event(event_key)),
    }


def preview_ders_ozet(
    *,
    ogrenci_id: int,
    kurum_id: int,
    sube_id: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    payload = collect_ders_ozet(
        ogrenci_id=ogrenci_id, kurum_id=kurum_id, sube_id=sube_id,
        start_date=start_date, end_date=end_date,
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
    meta_ready = templates['veli']['meta_usable'] or templates['ogrenci']['meta_usable']
    return {
        'ogrenci_id': ogrenci.id,
        'ogrenci_ad': payload['ogrenci_ad'],
        'pdf_baslik': payload['pdf_baslik'],
        'slot_count': len(payload.get('dersler') or []),
        'paketler': [p['ad'] for p in (payload.get('paketler') or []) if p.get('ad')],
        'recipients': recipients,
        'templates': templates,
        'send_mode': 'meta_template' if meta_ready else 'document',
        'has_template': True,
        'event_key': EVENT_KEY,
        'event_label': (get_event(EVENT_KEY).label if get_event(EVENT_KEY) else EVENT_KEY),
    }


def send_ders_ozet(
    *,
    ogrenci_id: int,
    kurum_id: int,
    sube_id: int,
    start_date: str | None = None,
    end_date: str | None = None,
    send_veli: bool = True,
    send_ogrenci: bool = True,
    veli_ids: list[int] | None = None,
    include_student: bool | None = None,
    user=None,
) -> dict[str, Any]:
    payload = collect_ders_ozet(
        ogrenci_id=ogrenci_id, kurum_id=kurum_id, sube_id=sube_id,
        start_date=start_date, end_date=end_date,
    )
    if not (payload.get('dersler') or []):
        raise OzelDersError('Gönderilecek ders özeti yok.', 'empty')
    pdf_bytes, filename = render_ders_ozet_pdf(payload)
    ogrenci = payload['ogrenci']
    attachment = NotificationAttachment(filename=filename, file_bytes=pdf_bytes)
    source = MessageSource(module='ozel_ders', ref_id=f'ders-ozet:{ogrenci_id}')
    sent_by = getattr(user, 'id', None)
    preview = preview_ders_ozet(
        ogrenci_id=ogrenci_id, kurum_id=kurum_id, sube_id=sube_id,
        start_date=start_date, end_date=end_date,
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
            result = dispatch_event(
                kurum_id, EVENT_KEY,
                recipient=NotificationRecipient.veli(veli.id),
                context=_base_context(payload, veli=veli),
                attachment=attachment, source=source, sube_id=sube_id,
                sent_by_user_id=sent_by, fallback_body=item['body'],
            )
            if getattr(result, 'success', False):
                veli_ok += 1
            else:
                err = '; '.join(getattr(result, 'errors', None) or []) or 'Veli gönderimi başarısız'
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
                kurum_id, EVENT_KEY,
                recipient=NotificationRecipient.ogrenci(ogrenci.id),
                context=_base_context(payload),
                attachment=attachment, source=source, sube_id=sube_id,
                sent_by_user_id=sent_by, fallback_body=item['body'],
            )
            if getattr(result, 'success', False):
                ogrenci_ok += 1
            else:
                err = '; '.join(getattr(result, 'errors', None) or []) or 'Öğrenci gönderimi başarısız'
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


def preview_ders_timeline(
    *,
    ogrenci_id: int,
    ders_id: int,
    kurum_id: int,
    sube_id: int,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    payload = collect_ders_timeline(
        ogrenci_id=ogrenci_id, ders_id=ders_id,
        kurum_id=kurum_id, sube_id=sube_id,
        start_date=start_date, end_date=end_date,
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
            'body': _render_body(RecipientType.VELI, ctx, EVENT_KEY_TIMELINE),
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
        'body': _render_body(RecipientType.OGRENCI, _base_context(payload), EVENT_KEY_TIMELINE),
        'skip_reason': '' if student_phone else 'Öğrenci telefonu yok',
    })
    templates = {
        'veli': _template_info(kurum_id, sube_id, RecipientType.VELI, EVENT_KEY_TIMELINE),
        'ogrenci': _template_info(kurum_id, sube_id, RecipientType.OGRENCI, EVENT_KEY_TIMELINE),
    }
    meta_ready = templates['veli']['meta_usable'] or templates['ogrenci']['meta_usable']
    return {
        'ogrenci_id': ogrenci.id,
        'ogrenci_ad': payload['ogrenci_ad'],
        'pdf_baslik': payload['pdf_baslik'],
        'slot_count': len(payload.get('kayitlar') or []),
        'paketler': [p['ad'] for p in (payload.get('paketler') or []) if p.get('ad')],
        'recipients': recipients,
        'templates': templates,
        'send_mode': 'meta_template' if meta_ready else 'document',
        'has_template': True,
        'event_key': EVENT_KEY_TIMELINE,
        'event_label': (
            get_event(EVENT_KEY_TIMELINE).label
            if get_event(EVENT_KEY_TIMELINE) else EVENT_KEY_TIMELINE
        ),
    }


def send_ders_timeline(
    *,
    ogrenci_id: int,
    ders_id: int,
    kurum_id: int,
    sube_id: int,
    start_date: str | None = None,
    end_date: str | None = None,
    send_veli: bool = True,
    send_ogrenci: bool = True,
    veli_ids: list[int] | None = None,
    include_student: bool | None = None,
    user=None,
) -> dict[str, Any]:
    payload = collect_ders_timeline(
        ogrenci_id=ogrenci_id, ders_id=ders_id,
        kurum_id=kurum_id, sube_id=sube_id,
        start_date=start_date, end_date=end_date,
    )
    if not (payload.get('kayitlar') or []):
        raise OzelDersError('Gönderilecek ders geçmişi yok.', 'empty')
    pdf_bytes, filename = render_ders_timeline_pdf(payload)
    ogrenci = payload['ogrenci']
    attachment = NotificationAttachment(filename=filename, file_bytes=pdf_bytes)
    source = MessageSource(module='ozel_ders', ref_id=f'ders-gecmis:{ogrenci_id}:{ders_id}')
    sent_by = getattr(user, 'id', None)
    preview = preview_ders_timeline(
        ogrenci_id=ogrenci_id, ders_id=ders_id,
        kurum_id=kurum_id, sube_id=sube_id,
        start_date=start_date, end_date=end_date,
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
            result = dispatch_event(
                kurum_id, EVENT_KEY_TIMELINE,
                recipient=NotificationRecipient.veli(veli.id),
                context=_base_context(payload, veli=veli),
                attachment=attachment, source=source, sube_id=sube_id,
                sent_by_user_id=sent_by, fallback_body=item['body'],
            )
            if getattr(result, 'success', False):
                veli_ok += 1
            else:
                err = '; '.join(getattr(result, 'errors', None) or []) or 'Veli gönderimi başarısız'
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
                kurum_id, EVENT_KEY_TIMELINE,
                recipient=NotificationRecipient.ogrenci(ogrenci.id),
                context=_base_context(payload),
                attachment=attachment, source=source, sube_id=sube_id,
                sent_by_user_id=sent_by, fallback_body=item['body'],
            )
            if getattr(result, 'success', False):
                ogrenci_ok += 1
            else:
                err = '; '.join(getattr(result, 'errors', None) or []) or 'Öğrenci gönderimi başarısız'
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
