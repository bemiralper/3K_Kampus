"""Günü birlik kayıt sonrası sınav giriş belgesi (PDF ve WhatsApp)."""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from types import SimpleNamespace

from django.utils.html import escape

_MONTHS = (
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
)
_WEEKDAYS = ('Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar')
_COLOR_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')
_ARRIVE_MINUTES = 15


def _tr_date(value) -> str:
    if not value:
        return '—'
    return value.strftime('%d.%m.%Y')


def _tr_time(value) -> str:
    if not value:
        return ''
    return value.strftime('%H:%M')


def load_giris_context(kurum_id: int, sube_id: int, exam_id, ogrenci_id):
    from apps.coaching.olcme_degerlendirme.models import Exam, ExamParticipant
    from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit

    try:
        exam_id = int(exam_id)
        ogrenci_id = int(ogrenci_id)
    except (TypeError, ValueError):
        return None, 'Sınav ve öğrenci seçin.'

    exam = (
        Exam.objects.filter(pk=exam_id, kurum_id=kurum_id, sube_id=sube_id)
        .select_related('kurum', 'sube')
        .first()
    )
    if exam is None:
        return None, 'Sınav bulunamadı.'
    ogrenci = Ogrenci.objects.filter(pk=ogrenci_id, kurum_id=kurum_id).first()
    if ogrenci is None:
        return None, 'Öğrenci bulunamadı.'
    participants = list(
        ExamParticipant.objects.filter(exam=exam, student=ogrenci)
        .select_related('room', 'exam_session', 'sinif_seviyesi')
        .order_by('exam_session__order', 'id')
    )
    if not participants:
        return None, 'Bu öğrenci seçilen sınavda yok.'
    kayit = (
        OgrenciKayit.objects.filter(ogrenci=ogrenci, kurum_id=kurum_id)
        .select_related('sinif_seviyesi', 'sinif__sinif_seviyesi')
        .order_by('-id')
        .first()
    )
    return SimpleNamespace(
        exam=exam,
        ogrenci=ogrenci,
        participants=participants,
        kayit=kayit,
    ), ''


def _seviye(ctx):
    for participant in ctx.participants:
        if participant.sinif_seviyesi_id and participant.sinif_seviyesi:
            return participant.sinif_seviyesi
    kayit = ctx.kayit
    if kayit is None:
        return None
    if kayit.sinif_id and getattr(kayit.sinif, 'sinif_seviyesi', None):
        return kayit.sinif.sinif_seviyesi
    if getattr(kayit, 'sinif_seviyesi_id', None) and kayit.sinif_seviyesi:
        return kayit.sinif_seviyesi
    return None


def _seviye_adi(ctx) -> str:
    seviye = _seviye(ctx)
    return (getattr(seviye, 'ad', None) or '') if seviye is not None else ''


def _ogrenci_no(ctx) -> str:
    kayit = ctx.kayit
    if kayit is None:
        return ''
    return (getattr(kayit, 'okul_no', None) or getattr(kayit, 'ogrenci_no', None) or '') or ''


def _long_date(value) -> str:
    if not value:
        return ''
    return f'{value.day:02d} {_MONTHS[value.month - 1]} {value.year}'


def _weekday(value) -> str:
    if not value:
        return ''
    return _WEEKDAYS[value.weekday()]


def _duration_label(session) -> str:
    if session is None:
        return ''
    minutes = getattr(session, 'duration_minutes', None)
    if not minutes and session.start_time and session.end_time:
        start = datetime.combine(datetime.min, session.start_time)
        end = datetime.combine(datetime.min, session.end_time)
        if end < start:
            end += timedelta(days=1)
        minutes = int((end - start).total_seconds() // 60)
    if not minutes:
        return ''
    return f'{minutes} dakika'


def _arrive_label(session) -> str:
    if session is None or not session.start_time:
        return f'{_ARRIVE_MINUTES} dk önce'
    arrived = (
        datetime.combine(datetime.min, session.start_time) - timedelta(minutes=_ARRIVE_MINUTES)
    ).time()
    return arrived.strftime('%H:%M')


def _brand_color(kurum) -> str:
    color = (getattr(kurum, 'tema_rengi', None) or '').strip()
    if _COLOR_RE.match(color):
        return color
    return '#0262a7'


def _primary(ctx):
    return ctx.participants[0] if ctx.participants else None


def _card(ctx) -> dict:
    participant = _primary(ctx)
    session = participant.exam_session if participant is not None else None
    exam = ctx.exam
    when = None
    if session is not None and session.session_date:
        when = session.session_date
    elif exam.exam_date:
        when = exam.exam_date
    room = ''
    seat = ''
    if participant is not None:
        if participant.room_id and participant.room:
            room = participant.room.name or ''
        if participant.seat_no:
            seat = str(participant.seat_no)
    start = _tr_time(session.start_time) if session is not None else ''
    end = _tr_time(session.end_time) if session is not None else ''
    clock = ''
    if start and end:
        clock = f'{start} – {end}'
    elif start or end:
        clock = start or end
    return {
        'session_name': (session.name if session is not None else '') or '',
        'date_long': _long_date(when),
        'weekday': _weekday(when),
        'clock': clock or '—',
        'start': start or '—',
        'end': end or '—',
        'duration': _duration_label(session),
        'arrive': _arrive_label(session),
        'room': room,
        'seat': seat,
        'year': str(when.year) if when else '',
    }


def _anchor_date(ctx):
    participant = _primary(ctx)
    session = participant.exam_session if participant is not None else None
    if session is not None and session.session_date:
        return session.session_date
    return ctx.exam.exam_date


def _month_bounds(day):
    from calendar import monthrange

    start = day.replace(day=1)
    end = day.replace(day=monthrange(day.year, day.month)[1])
    return start, end


def _tr_upper(value: str) -> str:
    return (value or '').replace('i', 'İ').replace('ı', 'I').upper()


def _date_span(dates) -> str:
    days = sorted({day for day in dates if day})
    if not days:
        return '—'
    if len(days) == 1:
        return _long_date(days[0])
    first, last = days[0], days[-1]
    if first.year == last.year and first.month == last.month:
        return f'{first.day:02d} – {last.day:02d} {_MONTHS[first.month - 1]} {first.year}'
    return f'{_long_date(first)} – {_long_date(last)}'


_TYPE_SHORT = {
    'YKS_TYT': 'YKS / TYT',
    'TYT_11': '11. SINIF TYT',
    'YKS_AYT': 'YKS / AYT',
    'AYT_11': '11. SINIF AYT',
    'LGS': 'LGS',
    'LGS_7': 'LGS',
    'DENEME': 'DENEME',
    'KURUM_ICI': 'KURUM İÇİ',
    'KONU_TARAMA': 'KONU TARAMA',
    'KAZANIM': 'KAZANIM',
    'OZEL': 'ÖZEL',
}


def month_exam_rows(ctx) -> list[dict]:
    """Belge ayındaki, öğrencinin sınıf seviyesine uyan sınav takvimi."""
    from django.db.models import Q
    from django.utils import timezone

    from apps.coaching.olcme_degerlendirme.models import Exam, ExamParticipant
    from apps.ogrenci_kayit.application.sinav_uygunluk import exam_matches_seviye

    anchor = _anchor_date(ctx)
    seviye = _seviye(ctx)
    if anchor is None or seviye is None:
        return []
    start, end = _month_bounds(anchor)
    exams = (
        Exam.objects.filter(
            kurum_id=ctx.exam.kurum_id,
            sube_id=ctx.exam.sube_id,
            is_active=True,
            is_template=False,
        )
        .filter(
            Q(exam_date__range=(start, end))
            | Q(exam_sessions__session_date__range=(start, end))
        )
        .distinct()
        .prefetch_related(
            'exam_sessions',
            'audiences__deneme_paketi__sinif_seviyeleri',
            'deneme_paketi__sinif_seviyeleri',
            'siniflar',
        )
        .order_by('exam_date', 'name', 'id')
    )
    if ctx.exam.egitim_yili_id:
        exams = exams.filter(egitim_yili_id=ctx.exam.egitim_yili_id)
    matched = [exam for exam in exams if exam_matches_seviye(exam, seviye)]
    if not matched:
        return []

    participants = list(
        ExamParticipant.objects.filter(
            student_id=ctx.ogrenci.id,
            exam_id__in=[exam.id for exam in matched],
        )
    )
    session_hits = {
        (row.exam_id, row.exam_session_id)
        for row in participants
        if row.exam_session_id
    }
    exam_hits = {row.exam_id for row in participants if not row.exam_session_id}
    today = timezone.localdate()
    rows: list[dict] = []
    for exam in matched:
        sessions = sorted(
            exam.exam_sessions.all(),
            key=lambda session: (
                session.session_date or exam.exam_date or start,
                session.order,
                session.id,
            ),
        )
        touches = bool(exam.exam_date and start <= exam.exam_date <= end)
        if not touches:
            touches = any(
                start <= (session.session_date or exam.exam_date or start) <= end
                for session in sessions
                if session.session_date or exam.exam_date
            )
        if not touches:
            continue
        # Ay içindeki güne ek olarak sonraki aya sarkan oturumlar da tarihte görünür.
        slots = sessions or [None]
        dates = []
        joined_any = False
        for session in slots:
            when = session.session_date if session is not None and session.session_date else exam.exam_date
            dates.append(when)
            specific = any(item[0] == exam.id for item in session_hits)
            if session is not None and (exam.id, session.id) in session_hits:
                joined = True
            elif session is None:
                joined = exam.id in exam_hits or specific
            elif specific:
                joined = False
            else:
                joined = exam.id in exam_hits
            if joined:
                joined_any = True
        known = [day for day in dates if day]
        if joined_any:
            status = 'in'
        elif known and min(known) > today:
            status = 'open'
        else:
            status = 'miss'
        rows.append({
            'exam': _tr_upper(exam.name or ''),
            'date': _date_span(dates),
            'status': status,
        })
    return rows


def _calendar_html(ctx) -> str:
    rows = month_exam_rows(ctx)
    if not rows:
        return ''
    anchor = _anchor_date(ctx)
    title = _tr_upper(f'{_MONTHS[anchor.month - 1]} {anchor.year} sınav takvimi')
    body = []
    for row in rows:
        if row['status'] == 'in':
            mark = '<td class="mark reg">Kayıtlı</td>'
        else:
            mark = '<td class="mark none">-</td>'
        body.append(
            '<tr>'
            f'<td class="name">{escape(row["exam"])}</td>'
            f'<td class="when">{escape(row["date"])}</td>'
            f'{mark}'
            '</tr>'
        )
    return (
        '<section class="calendar">'
        f'<h2>{escape(title)}</h2>'
        '<table class="cal"><thead><tr>'
        '<th>Sınav</th><th class="when">Tarih</th><th class="mark">Kayıt durumu</th>'
        '</tr></thead><tbody>'
        + ''.join(body)
        + '</tbody></table></section>'
    )


def _center_lines(ctx) -> tuple[str, str]:
    exam = ctx.exam
    sube = exam.sube
    kurum = exam.kurum
    title = ''
    if sube is not None:
        title = (getattr(sube, 'ad', None) or '').strip()
    if not title and kurum is not None:
        title = (getattr(kurum, 'gorunen_ad', None) or getattr(kurum, 'ad', None) or '').strip()
    place = ''
    if sube is not None:
        ilce = (getattr(sube, 'ilce', None) or '').strip()
        il = (getattr(sube, 'il', None) or '').strip()
        place = f'{ilce} / {il}' if ilce and il else (ilce or il)
        adres = (getattr(sube, 'adres', None) or '').strip()
        if adres:
            place = adres if not place else f'{adres} · {place}'
    if not place and kurum is not None:
        place = (getattr(kurum, 'adres', None) or '').strip()
    return title, place


def giris_belgesi_filename(ctx) -> str:
    raw = f'{ctx.ogrenci.ad}-{ctx.ogrenci.soyad}'.strip('-')
    safe = re.sub(r'[^A-Za-z0-9\-]+', '-', raw).strip('-') or str(ctx.ogrenci.id)
    return f'{safe}-sinav-giris-belgesi.pdf'


def _light_header_logo(kurum, sube) -> str:
    """Beyaz zemin: renkli uygulama logosu. Beyaz login logosu burada görünmez."""
    import base64
    from pathlib import Path

    from django.conf import settings

    from apps.finans.application.export.report_html_template import _image_field_data_uri

    for entity in (sube, kurum):
        if entity is None:
            continue
        uri = _image_field_data_uri(getattr(entity, 'app_logo', None))
        if uri:
            return uri
    candidates = [
        Path(settings.BASE_DIR) / 'static' / 'img' / '3k-logo.png',
        Path(settings.BASE_DIR).parent / 'mobile' / 'assets' / 'brand' / '3k-logo.png',
    ]
    for path in candidates:
        if path.is_file():
            encoded = base64.b64encode(path.read_bytes()).decode('ascii')
            return f'data:image/png;base64,{encoded}'
    return ''


def _exam_kicker(exam, session_name: str) -> str:
    kind = _TYPE_SHORT.get(getattr(exam, 'exam_type', '') or '', '')
    session = _tr_upper((session_name or '').strip())
    return ' · '.join(part for part in (kind, session) if part)


def _web_host(url: str) -> str:
    raw = re.sub(r'^https?://', '', (url or '').strip()).rstrip('/')
    if raw.lower().startswith('www.'):
        raw = raw[4:]
    return raw


def _instagram_label(kurum) -> str:
    if kurum is None:
        return ''
    try:
        from apps.website.models import SiteSocialLink
        link = (
            SiteSocialLink.objects.filter(kurum=kurum, platform='instagram', aktif=True)
            .order_by('sira', 'id')
            .first()
        )
    except Exception:
        return ''
    if link is None or not (link.url or '').strip():
        return ''
    handle = link.url.rstrip('/').split('/')[-1].lstrip('@').strip()
    if not handle or 'instagram' in handle.lower():
        return ''
    return f'Instagram · @{handle}'


def giris_belgesi_message(ctx) -> str:
    card = _card(ctx)
    ad = f'{ctx.ogrenci.ad} {ctx.ogrenci.soyad}'.strip()
    room = card['room'] or 'sınav günü duyurulacak'
    seat = card['seat'] or '—'
    return (
        f'{ad} için {ctx.exam.name} sınav giriş belgesi ektedir. '
        f'Tarih: {card["date_long"] or "—"}. Saat: {card["clock"]}. '
        f'Salon: {room}, sıra: {seat}. '
        f'Sınavdan {_ARRIVE_MINUTES} dakika önce ({card["arrive"]}) hazır bulunun.'
    )


def _notify_context(ctx, *, veli=None) -> dict:
    card = _card(ctx)
    kurum = ctx.exam.kurum
    kurum_ad = ''
    if kurum is not None:
        kurum_ad = (getattr(kurum, 'gorunen_ad', None) or getattr(kurum, 'ad', None) or '').strip()
    veli_ad = ''
    if veli is not None:
        veli_ad = f'{(veli.ad or "").strip()} {(veli.soyad or "").strip()}'.strip() or (veli.ad or '')
    return {
        'ogrenci_ad': f'{ctx.ogrenci.ad} {ctx.ogrenci.soyad}'.strip(),
        'veli_ad': veli_ad,
        'sinav_adi': ctx.exam.name or '',
        'sinav_ad': ctx.exam.name or '',
        'sinav_tarihi': card['date_long'] or '—',
        'tarih': card['date_long'] or '—',
        'baslama_saati': card['start'],
        'bitis_saati': card['end'],
        'hazir_bulunma': card['arrive'],
        'sinav_salonu': card['room'] or 'Sınav günü duyurulacak',
        'sira_no': card['seat'] or '—',
        'sure': card['duration'],
        'kurum_ad': kurum_ad,
    }


def build_giris_belgesi_html(ctx) -> str:
    exam = ctx.exam
    ogrenci = ctx.ogrenci
    kurum = exam.kurum
    sube = exam.sube
    card = _card(ctx)
    color = _brand_color(kurum)
    kurum_ad = escape((getattr(kurum, 'gorunen_ad', None) or getattr(kurum, 'ad', None) or '3K Kampüs').strip())
    slogan = escape((getattr(kurum, 'slogan', None) or getattr(sube, 'slogan', None) or '').strip())
    ad = escape(f'{ogrenci.ad} {ogrenci.soyad}'.strip())
    numara = escape(_ogrenci_no(ctx) or '—')
    tc = escape((getattr(ogrenci, 'tc_kimlik_no', None) or '').strip() or '—')
    seviye = escape(_seviye_adi(ctx) or '—')
    sinav = escape(exam.name or '')
    logo = _light_header_logo(kurum, sube)
    mark = f'<img class="logo" src="{logo}" alt="" />' if logo else ''
    _center_title, center_place = _center_lines(ctx)
    web = ''
    if sube is not None:
        web = (getattr(sube, 'web_adresi', None) or '').strip()
    room = escape(card['room']) if card['room'] else 'Sınav günü duyurulacak'
    room_cls = 'room' if card['room'] else 'room soft'
    seat = escape(card['seat']) if card['seat'] else '—'
    extra = []
    for participant in ctx.participants[1:]:
        session = participant.exam_session
        label = escape(session.name if session is not None and session.name else 'Oturum')
        when = _long_date(session.session_date) if session is not None else ''
        clock = ''
        if session is not None:
            start = _tr_time(session.start_time)
            end = _tr_time(session.end_time)
            clock = f'{start} – {end}' if start and end else (start or end)
        extra.append(
            f'<li><strong>{label}</strong> {escape(when)} {escape(clock)}</li>'
        )
    extra_html = ''
    if extra:
        extra_html = '<ul class="extra">' + ''.join(extra) + '</ul>'
    slogan_html = f'<div class="slogan">{slogan}</div>' if slogan else ''
    duration_html = f'<div class="sub">{escape(card["duration"])}</div>' if card['duration'] else ''
    web_html = escape(_web_host(web)) if web else ''
    instagram = escape(_instagram_label(kurum))
    kicker = escape(_exam_kicker(exam, card['session_name']))
    kicker_html = f'<div class="kicker">{kicker}</div>' if kicker else ''
    start = card['start'] if card['start'] and card['start'] != '—' else ''
    end = card['end'] if card['end'] and card['end'] != '—' else ''
    if start and end:
        clock = escape(f'{start} - {end}')
    else:
        clock = escape(card['clock'] or '—')
    calendar_html = _calendar_html(ctx)
    address = escape(center_place or _center_title)
    return f'''<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>{ad} — Sınav Giriş Belgesi</title>
<style>
  @page {{ size: A4; margin: 12mm 14mm; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; }}
  body {{
    color: #122033; background: #fff;
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  }}
  .sheet {{ width: 100%; height: 273mm; border-collapse: collapse; }}
  .sheet-main {{ vertical-align: top; }}
  .top {{ display: flex; justify-content: space-between; align-items: center; gap: 16px; }}
  .brand {{ display: flex; gap: 10px; align-items: center; min-width: 0; }}
  .logo {{ height: 44px; width: auto; max-width: 148px; object-fit: contain; }}
  .brand-name {{ color: {color}; font-weight: 800; font-size: 18px; letter-spacing: -0.02em; line-height: 1.1; }}
  .slogan {{ margin-top: 2px; color: #8b9bb0; font-size: 11px; }}
  .docmeta {{ text-align: right; white-space: nowrap; }}
  .docmeta strong {{
    display: block; color: {color}; font-size: 13px; letter-spacing: .12em; font-weight: 800;
  }}
  .docmeta span {{ display: block; margin-top: 3px; color: #8b9bb0; font-size: 12px; }}
  .ticket {{
    display: flex; align-items: stretch; margin-top: 16px;
    background: #eff6fb; border-radius: 14px; overflow: hidden;
  }}
  .ticket-main {{ flex: 1; min-width: 0; padding: 14px 18px 16px; }}
  .kicker {{ color: {color}; font-size: 11px; font-weight: 800; letter-spacing: .06em; }}
  h1 {{ margin: 4px 0 0; font-size: 26px; line-height: 1.15; font-weight: 800; letter-spacing: -0.03em; }}
  .who {{
    display: grid; grid-template-columns: 1.5fr .9fr .9fr; gap: 8px 14px; margin-top: 16px;
  }}
  .lbl {{
    display: block; color: #8b9bb0; font-size: 9px; font-weight: 700; letter-spacing: .07em;
  }}
  .val {{ display: block; margin-top: 3px; font-size: 15px; font-weight: 800; letter-spacing: -0.02em; }}
  .sub {{ display: block; margin-top: 2px; color: #8b9bb0; font-size: 12px; }}
  .tc {{ margin-top: 10px; color: #8b9bb0; font-size: 11px; letter-spacing: .04em; font-weight: 700; }}
  .tc b {{ color: #5c6d82; font-weight: 700; }}
  .sched {{
    display: grid; grid-template-columns: 1.5fr .9fr .9fr; gap: 12px 14px;
    margin-top: 14px; padding-top: 12px; border-top: 0.8pt solid #d3e3ef;
  }}
  .seatbox {{
    position: relative; width: 29%; flex: 0 0 29%; background: {color}; color: #fff;
    margin: 0; padding: 16px 18px 14px;
    display: flex; flex-direction: column; justify-content: space-between;
    border-left: 0.8pt solid #a1c5df;
  }}
  .scoop {{
    position: absolute; display: block; left: -7pt; width: 14pt; height: 14pt;
    background: #fff; border-radius: 50%; z-index: 2;
  }}
  .scoop.up {{ top: -7pt; }}
  .scoop.down {{ bottom: -7pt; }}
  .seatbox .lbl {{ color: rgba(255,255,255,.8); }}
  .room {{ margin: 3px 0 0; font-size: 20px; font-weight: 800; line-height: 1.15; }}
  .room.soft {{ font-size: 13px; font-weight: 700; line-height: 1.3; }}
  .seat-mid {{
    border-top: 0.8pt solid #3d89be; margin-top: 10px; padding-top: 12px;
  }}
  .seat-no {{
    margin: 2px 0 0; font-size: 52px; font-weight: 800; letter-spacing: -0.04em; line-height: .9;
  }}
  .arrive {{ margin-top: 2px; font-size: 18px; font-weight: 800; }}
  .notes {{
    display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 18px;
  }}
  .notes h2 {{ margin: 0 0 6px; font-size: 13px; font-weight: 800; }}
  .notes .col p, .notes li {{ color: #3d4f63; font-size: 11.5px; line-height: 1.45; }}
  .notes .right {{ border-left: 1px solid #e6edf5; padding-left: 18px; }}
  .notes .right h2 {{ color: {color}; }}
  .notes ul {{ margin: 0; padding-left: 16px; }}
  .notes p {{ margin: 0; }}
  .extra {{ margin: 8px 0 0; color: #3d4f63; font-size: 11.5px; }}
  .warn {{
    margin: 14px 0 0; background: #fff3ea; color: #c05621;
    border-radius: 10px; padding: 9px 12px; text-align: center;
    font-size: 12.5px; font-weight: 700;
  }}
  .calendar {{ margin-top: 20px; }}
  .calendar h2 {{
    margin: 0 0 8px; color: #16324f; font-size: 13px; font-weight: 800; letter-spacing: .04em;
  }}
  .cal {{ width: 100%; border-collapse: separate; border-spacing: 0; }}
  .cal th {{
    background: {color}; color: #fff; font-size: 10px; font-weight: 700;
    letter-spacing: .08em; text-transform: uppercase; padding: 8px 14px; text-align: left;
  }}
  .cal th:first-child {{ border-radius: 8px 0 0 8px; }}
  .cal th:last-child {{ border-radius: 0 8px 8px 0; }}
  .cal th.when, .cal td.when {{ text-align: center; }}
  .cal th.mark, .cal td.mark {{ text-align: right; width: 120px; }}
  .cal td {{
    padding: 11px 14px; font-size: 12.5px; border-bottom: 1px solid #e7eef6; vertical-align: middle;
  }}
  .cal .name {{ font-weight: 800; letter-spacing: .02em; }}
  .cal .when {{ color: #5c6d82; white-space: nowrap; }}
  .cal .reg {{ color: {color}; font-weight: 800; }}
  .cal .none {{ color: #94a3b8; font-weight: 700; }}
  .page-foot {{
    vertical-align: bottom; border-top: 1px solid #e6edf5; padding-top: 8px;
    color: #8b9bb0; font-size: 11px;
  }}
  .foot-top, .foot-bot {{ display: flex; justify-content: space-between; gap: 16px; }}
  .web {{ color: #122033; font-weight: 800; }}
  .address {{ margin: 3px 0 0; }}
  .unit {{ color: #122033; }}
</style>
</head>
<body>
<table class="sheet">
<tr><td class="sheet-main">
  <header class="top">
    <div class="brand">
      {mark}
      <div>
        <div class="brand-name">{kurum_ad}</div>
        {slogan_html}
      </div>
    </div>
    <div class="docmeta">
      <strong>SINAV GİRİŞ BELGESİ</strong>
      <span>{escape(card["year"])} · 3K-{exam.id}-{ogrenci.id}</span>
    </div>
  </header>
  <section class="ticket">
    <div class="ticket-main">
      {kicker_html}
      <h1>{sinav}</h1>
      <div class="who">
        <div><span class="lbl">ÖĞRENCİ ADI SOYADI</span><span class="val">{ad}</span></div>
        <div><span class="lbl">ÖĞRENCİ NO</span><span class="val">{numara}</span></div>
        <div><span class="lbl">SINIF / GRUP</span><span class="val">{seviye}</span></div>
      </div>
      <div class="tc">T.C. KİMLİK NO · <b>{tc}</b></div>
      <div class="sched">
        <div>
          <span class="lbl">SINAV TARİHİ</span>
          <span class="val">{escape(card["date_long"] or "—")}</span>
          <div class="sub">{escape(card["weekday"])}</div>
        </div>
        <div>
          <span class="lbl">BAŞLANGIÇ / BİTİŞ</span>
          <span class="val">{clock}</span>
          {duration_html}
        </div>
      </div>
    </div>
    <aside class="seatbox">
      <i class="scoop up"></i>
      <i class="scoop down"></i>
      <div>
        <span class="lbl">SINAV SALONU</span>
        <div class="{room_cls}">{room}</div>
      </div>
      <div class="seat-mid">
        <span class="lbl">SIRA NUMARASI</span>
        <div class="seat-no">{seat}</div>
      </div>
      <div>
        <span class="lbl">HAZIR BULUNMA</span>
        <div class="arrive">{escape(card["arrive"])}</div>
      </div>
    </aside>
  </section>
  {extra_html}
  <div class="notes">
    <div class="col">
      <h2>Sınav öncesi hatırlatmalar</h2>
      <ul>
        <li>Kurşun kalem, silgi ve kalemtıraşınızı getiriniz.</li>
        <li>Telefon ve akıllı saatlerinizi görevliye teslim ediniz.</li>
        <li>Belirtilen salon ve sıra numarasına göre yerleşiniz.</li>
        <li>Sınavdan {_ARRIVE_MINUTES} dakika önce salonda hazır bulununuz.</li>
      </ul>
    </div>
    <div class="col right">
      <h2>Sınav sonuç bilgilendirmesi</h2>
      <p>Sonuçlar açıklandığında sınav sonuç belgesi, öğrencinin ve velisinin sistemde kayıtlı WhatsApp numaralarına gönderilecektir. Lütfen iletişim bilgilerinizi kontrol ediniz.</p>
    </div>
  </div>
  <p class="warn">Sınav başladıktan sonra salona öğrenci alınmayacaktır.</p>
  {calendar_html}
</td></tr>
<tr><td class="page-foot">
  <div class="foot-top">
    <span class="web">{web_html}</span>
    <span>{instagram}</span>
  </div>
  <div class="foot-bot">
    <span class="address">{address}</span>
    <span class="unit">{kurum_ad} · Ölçme ve Değerlendirme Birimi</span>
  </div>
</td></tr>
</table>
</body>
</html>'''


def render_giris_belgesi_pdf(ctx) -> bytes:
    from apps.communication.application.html_to_pdf import render_html_to_pdf

    return render_html_to_pdf(build_giris_belgesi_html(ctx))


def send_giris_belgesi_whatsapp(ctx, *, alicilar, sent_by_user_id: int | None = None) -> dict:
    """Seçilen alıcılara şablon metni ve PDF gönderir. Kayıt sohbette görünür."""
    from apps.communication.application.communication_service import MessageSource
    from apps.communication.application.notification_dispatcher import (
        NotificationAttachment,
        NotificationRecipient,
        dispatch_event,
    )

    chosen = {str(item).strip().lower() for item in (alicilar or [])}
    chosen &= {'ogrenci', 'veli'}
    if not chosen:
        return {'ok': False, 'sent': 0, 'detail': 'Öğrenci veya veli seçin.'}

    pdf = render_giris_belgesi_pdf(ctx)
    filename = giris_belgesi_filename(ctx)
    fallback = giris_belgesi_message(ctx)
    kurum_id = ctx.exam.kurum_id
    sube_id = ctx.exam.sube_id
    exam_id = ctx.exam.id
    attachment = NotificationAttachment(filename=filename, file_bytes=pdf)
    sent = 0
    errors: list[str] = []
    targets = 0

    def _deliver(recipient, ref, context):
        nonlocal sent
        result = dispatch_event(
            kurum_id,
            'sinav.giris_belgesi',
            recipient=recipient,
            context=context,
            attachment=attachment,
            source=MessageSource(module='sinav', ref_id=ref),
            sube_id=sube_id,
            sent_by_user_id=sent_by_user_id,
            fallback_body=fallback,
        )
        if result is not None and result.success:
            sent += 1
            return
        messages = getattr(result, 'errors', None) or ['Gönderilemedi.']
        errors.append(messages[0] if messages else 'Gönderilemedi.')

    if 'ogrenci' in chosen:
        targets += 1
        if not (ctx.ogrenci.telefon or '').strip():
            errors.append('Öğrencinin telefonu yok.')
        else:
            _deliver(
                NotificationRecipient.ogrenci(ctx.ogrenci.id),
                f'giris:{exam_id}:{ctx.ogrenci.id}:ogrenci',
                _notify_context(ctx),
            )

    if 'veli' in chosen:
        veliler = [
            veli for veli in ctx.ogrenci.veliler.all()
            if (veli.telefon or '').strip()
        ]
        if not veliler:
            targets += 1
            errors.append('Velinin telefonu yok.')
        for veli in veliler:
            targets += 1
            _deliver(
                NotificationRecipient.veli(veli.id),
                f'giris:{exam_id}:{ctx.ogrenci.id}:veli:{veli.id}',
                _notify_context(ctx, veli=veli),
            )

    if sent == 0:
        return {
            'ok': False,
            'sent': 0,
            'detail': errors[0] if errors else 'WhatsApp gönderilemedi.',
        }
    who = []
    if 'ogrenci' in chosen:
        who.append('öğrenci')
    if 'veli' in chosen:
        who.append('veli')
    detail = f'Giriş belgesi {" ve ".join(who)} sohbetine gönderildi.'
    if errors:
        detail = f'{detail} {errors[0]}'
    if targets and sent < targets and not errors:
        detail = f'Giriş belgesi {sent} alıcıya gönderildi.'
    return {'ok': True, 'sent': sent, 'detail': detail}
