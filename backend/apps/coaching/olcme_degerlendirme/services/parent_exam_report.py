"""
Veli Sınav Genel Durum Raporu — veri toplama, alıcı önizleme ve WhatsApp gönderim servisi.

Mevcut modelleri (`StudentAnswer`, `StudentSectionScore`, `ExamStudyAction`,
`ManualAssignment`, `OgrenciVeli`) salt-okunur kullanır; veritabanı değişikliği yapmaz.
"""
from __future__ import annotations

import logging
import math
import re
from collections import defaultdict
from datetime import date, datetime
from typing import Any

from django.db import transaction
from django.db.models import Avg, F, Max, Q
from django.utils import timezone

from apps.communication.application.communication_service import MessageSource
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.integration_hooks import SOURCE_SINAV
from apps.communication.application.notification_dispatcher import (
    NotificationAttachment,
    NotificationRecipient,
    dispatch_event,
)
from apps.ogrenci.application.veli_contact import effective_veli_phone
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli

from ..models import Exam, StudentAnswer, StudentSectionScore
from .development_analysis import (
    ayt_section_allowed,
    build_development_analysis,
    group_for_exam_type,
    types_for_group,
)
from .stored_scores import blocks_for_answers

logger = logging.getLogger(__name__)

TURKISH_MONTHS_SHORT = (
    '', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
    'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
)
TURKISH_MONTHS_FULL = (
    '', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
)

TRACK_ORDER = ('TYT', 'AYT', 'LGS', 'CLASS')
TRACK_LABELS = {
    'TYT': 'TYT Denemeleri',
    'AYT': 'AYT Denemeleri',
    'LGS': 'LGS Denemeleri',
    'CLASS': 'Sınıf Denemeleri',
}
TRACK_SHORT = {
    'TYT': 'TYT',
    'AYT': 'AYT',
    'LGS': 'LGS',
    'CLASS': 'Genel',
}

ALAN_LABELS = {
    'SAYISAL': 'Sayısal',
    'ESIT_AGIRLIK': 'Eşit Ağırlık',
    'SOZEL': 'Sözel',
    'DIL': 'Dil',
}

WINDOW_LABELS = {
    'last_3': 'Son 3 Sınav',
    'last_5': 'Son 5 Sınav',
    'last_10': 'Son 10 Sınav',
    'all': 'Tüm Dönem',
}


def _r(val: float | int | None, nd: int = 2) -> float | None:
    if val is None:
        return None
    return round(float(val), nd)


def _fold_tr(text: str | None) -> str:
    return (
        (text or '')
        .replace('İ', 'i')
        .replace('I', 'i')
        .replace('ı', 'i')
        .lower()
        .replace('ğ', 'g')
        .replace('ü', 'u')
        .replace('ş', 's')
        .replace('ö', 'o')
        .replace('ç', 'c')
        .strip()
    )


def _fmt_date_short(raw: str | date | None) -> str:
    if not raw:
        return ''
    if isinstance(raw, str):
        try:
            d = date.fromisoformat(raw[:10])
        except ValueError:
            return raw
    else:
        d = raw
    return f'{d.day} {TURKISH_MONTHS_SHORT[d.month]}'


def _fmt_date_full(raw: str | date | datetime | None) -> str:
    if not raw:
        return ''
    if isinstance(raw, datetime):
        d = raw.date()
    elif isinstance(raw, str):
        try:
            d = date.fromisoformat(raw[:10])
        except ValueError:
            return raw
    else:
        d = raw
    return f'{d.day} {TURKISH_MONTHS_FULL[d.month]} {d.year}'


def _short_exam_label(name: str, exam_date: str | None, idx: int) -> str:
    if exam_date:
        return _fmt_date_short(exam_date)
    cleaned = re.sub(r'\s+', ' ', (name or '')).strip()
    if len(cleaned) <= 14:
        return cleaned or f'Sınav {idx + 1}'
    return f'{cleaned[:13]}…'


def _normalize_options(raw: dict[str, Any] | None) -> dict[str, Any]:
    data = raw or {}
    scope = str(data.get('scope') or 'both').strip()
    if scope not in ('both', 'TYT', 'AYT', 'LGS', 'CLASS'):
        scope = 'both'
    window = str(data.get('window') or 'last_5').strip().lower()
    if window not in ('last_3', 'last_5', 'last_10', 'all'):
        window = 'last_5'

    date_from = (data.get('date_from') or '').strip() or None
    date_to = (data.get('date_to') or '').strip() or None

    def _b(key: str, default: bool) -> bool:
        val = data.get(key)
        if val is None:
            return default
        return bool(val)

    coach_note = str(data.get('coach_note') or '').strip()
    if len(coach_note) > 1200:
        coach_note = coach_note[:1200]

    theme = str(data.get('theme') or 'midnight').strip().lower()
    if theme not in ('midnight', 'brand', 'print'):
        theme = 'midnight'

    tone = str(data.get('tone') or 'balanced').strip().lower()
    if tone not in ('supportive', 'balanced', 'focused'):
        tone = 'balanced'

    custom_title = str(data.get('custom_title') or '').strip()[:90]
    recipient_greeting = str(data.get('recipient_greeting') or '').strip()[:80]

    raw_excl = data.get('excluded_exam_ids') or []
    excluded_exam_ids: list[int] = []
    if isinstance(raw_excl, list):
        for item in raw_excl:
            try:
                excluded_exam_ids.append(int(item))
            except (TypeError, ValueError):
                continue

    return {
        'scope': scope,
        'window': window,
        'date_from': date_from,
        'date_to': date_to,
        'theme': theme,
        'tone': tone,
        'custom_title': custom_title,
        'recipient_greeting': recipient_greeting,
        'excluded_exam_ids': sorted(set(excluded_exam_ids)),
        'include_kurum_avg': _b('include_kurum_avg', True),
        'include_progress_bridge': _b('include_progress_bridge', True),
        'include_net_breakdown': _b('include_net_breakdown', True),
        'include_exam_table': _b('include_exam_table', True),
        'include_error_profile': _b('include_error_profile', True),
        'include_strengths': _b('include_strengths', True),
        'include_study_focus': _b('include_study_focus', True),
        'include_assignments': _b('include_assignments', True),
        'include_attendance': _b('include_attendance', True),
        'include_ranking': _b('include_ranking', False),
        'coach_note': coach_note,
    }


def _compute_exam_kurum_averages(
    exam_ids: list[int],
    *,
    kurum_id: int,
    sube_id: int | None,
    group: str,
    alan: str | None,
) -> dict[int, float]:
    """Her sınav için kurum/şube ortalama netini tek/az sorguda hesaplar."""
    if not exam_ids:
        return {}

    base = StudentAnswer.objects.filter(
        session__exam_id__in=exam_ids,
        session__status='COMPLETED',
        session__exam__kurum_id=kurum_id,
    )
    if sube_id:
        base = base.filter(session__exam__sube_id=sube_id)

    # AYT'de öğrencinin alan derslerine göre net ortalaması hesaplanır.
    if group == 'AYT':
        sec_rows = (
            StudentSectionScore.objects
            .filter(
                student_answer__in=base,
                section__is_sub_section=False,
            )
            .values(
                'student_answer_id',
                'student_answer__session__exam_id',
                'student_answer__session__exam__exam_type',
                'section__name',
                'net',
            )
        )
        per_answer_net: dict[tuple[int, int], float] = defaultdict(float)
        for row in sec_rows:
            ex_type = row['student_answer__session__exam__exam_type']
            if not ayt_section_allowed(row['section__name'], ex_type, alan, score_scope=True):
                continue
            key = (row['student_answer__session__exam_id'], row['student_answer_id'])
            per_answer_net[key] += float(row['net'] or 0)

        by_exam: dict[int, list[float]] = defaultdict(list)
        for (ex_id, _ans_id), net_sum in per_answer_net.items():
            by_exam[ex_id].append(net_sum)
        return {
            ex_id: round(sum(vals) / len(vals), 2)
            for ex_id, vals in by_exam.items()
            if vals
        }

    rows = (
        base.values('session__exam_id')
        .annotate(avg_net=Avg('total_net'))
    )
    return {
        row['session__exam_id']: round(float(row['avg_net']), 2)
        for row in rows
        if row['avg_net'] is not None
    }


def _extract_study_focus(agenda_items: list[dict], exams: list[dict], group: str) -> list[dict]:
    """Koçun plana aldığı konuları önceler; eksikleri nokta atışı kuralıyla en fazla 5 konuya tamamlar."""
    if not agenda_items:
        return []

    exam_ids = [e['exam_id'] for e in exams]
    last_two = set(exam_ids[-2:])
    net_per_wrong = 1.33 if group == 'LGS' else 1.25

    planned: list[dict] = []
    candidates: list[dict] = []

    for item in agenda_items:
        if item.get('kind') == 'academic':
            continue
        name = (item.get('name') or '').strip()
        subject = (item.get('subject') or '').strip()
        topic = (item.get('topic') or '').strip()
        if (
            not name
            or topic == 'Eşleme eksik'
            or 'kazanimi eslenmemis' in _fold_tr(name)
            or 'kirilim eksik' in _fold_tr(name)
            or (not item.get('outcome_id') and not item.get('sub_outcome_id') and _fold_tr(name) == _fold_tr(subject))
        ):
            continue

        status = item.get('status') or 'suggested'
        if status == 'deferred':
            continue

        evidence = item.get('evidence') or []
        if evidence:
            total_q = sum(p.get('question_count') or 0 for p in evidence)
            total_w = sum(p.get('wrong') or 0 for p in evidence)
            total_e = sum(p.get('empty') or 0 for p in evidence)
            missed_exams = sum(1 for p in evidence if (p.get('wrong') or 0) + (p.get('empty') or 0) > 0)
            measured_exams = len(evidence)
        else:
            total_q = item.get('question_count') or 0
            total_w = item.get('wrong') or 0
            total_e = item.get('empty') or 0
            missed_exams = item.get('missed_exam_count') or 1
            measured_exams = item.get('exam_count') or 1

        total_loss = total_w + total_e
        if total_loss <= 0 or total_q <= 0:
            continue

        loss_rate = round((total_loss / total_q) * 100)
        denom = max(1, measured_exams)
        est_net_gain = round(((total_w * net_per_wrong) + total_e) / denom, 2)

        entry = {
            'subject': subject,
            'topic': topic if _fold_tr(topic) != _fold_tr(name) else '',
            'name': name,
            'is_planned': status == 'planned',
            'coach_note': (item.get('note') or '').strip(),
            'missed_exams': missed_exams,
            'measured_exams': measured_exams,
            'total_loss': total_loss,
            'total_wrong': total_w,
            'total_empty': total_e,
            'loss_rate': loss_rate,
            'est_net_gain': est_net_gain,
            'profile': (
                'Yanlış ağırlıklı'
                if total_w > total_e * 1.4
                else 'Boş ağırlıklı'
                if total_e > total_w * 1.4
                else 'Yanlış ve boş dengeli'
            ),
        }

        if status == 'planned':
            planned.append(entry)
            continue

        recent_pts = [p for p in evidence if p.get('exam_id') in last_two]
        recent_has_loss = (
            any((p.get('wrong') or 0) + (p.get('empty') or 0) > 0 for p in recent_pts)
            if recent_pts
            else item.get('kind') in ('recurring', 'current')
        )
        recovered_recent = (
            len(recent_pts) >= 2
            and all((p.get('mastery_rate') or 0) >= 80 for p in recent_pts)
        )
        if missed_exams >= 2 and total_q >= 3 and recent_has_loss and not recovered_recent:
            candidates.append(entry)

    planned.sort(key=lambda r: (-r['est_net_gain'], -r['total_loss']))
    candidates.sort(key=lambda r: (-r['est_net_gain'], -r['missed_exams'], -r['total_loss']))

    combined = planned[:5]
    if len(combined) < 5:
        seen = {(_fold_tr(x['subject']), _fold_tr(x['name'])) for x in combined}
        for cand in candidates:
            sig = (_fold_tr(cand['subject']), _fold_tr(cand['name']))
            if sig in seen:
                continue
            combined.append(cand)
            seen.add(sig)
            if len(combined) >= 5:
                break

    return combined


BREAKDOWN_PALETTE = (
    '#4F46E5', '#0891B2', '#059669', '#D97706', '#7C3AED', '#E11D48', '#2563EB', '#0D9488',
)


def _compute_consistency(nets: list[float], group: str) -> dict[str, Any] | None:
    if len(nets) < 2:
        return None
    mean = sum(nets) / len(nets)
    variance = sum((x - mean) ** 2 for x in nets) / len(nets)
    std = round(math.sqrt(variance), 2)
    span = round(max(nets) - min(nets), 2)
    high_thr = 3.5 if group == 'AYT' else 4.5
    med_thr = 7.0 if group == 'AYT' else 9.0
    if std <= high_thr:
        return {
            'level': 'high',
            'label': 'Çok İstikrarlı',
            'std_dev': std,
            'range_span': span,
            'summary_text': f'Deneme netleri ±{_r(std, 1)} net bandında yüksek tutarlılık gösteriyor.',
        }
    if std <= med_thr:
        return {
            'level': 'medium',
            'label': 'Dengeli',
            'std_dev': std,
            'range_span': span,
            'summary_text': f'Denemeler arası fark kontrollü (±{_r(std, 1)} net sapma · en düşük–en yüksek {_r(span, 1)} net).',
        }
    return {
        'level': 'volatile',
        'label': 'Dalgalı',
        'std_dev': std,
        'range_span': span,
        'summary_text': f'Sınavdan sınava dalgalanma belirgin ({_r(span, 1)} net aralık); sınav günü ritmi ve odak çalışması faydalı olur.',
    }


def _compute_progress_bridge(series: list[dict[str, Any]], subjects: list[dict[str, Any]]) -> dict[str, Any] | None:
    if len(series) < 2:
        return None
    if len(series) >= 4:
        early_slice = series[:2]
        recent_slice = series[-2:]
        early_label = 'İlk 2 Deneme Ort.'
        recent_label = 'Son 2 Deneme Ort.'
    else:
        early_slice = series[:1]
        recent_slice = series[-1:]
        early_label = f'İlk Deneme ({series[0]["date_label"] or "Başlangıç"})'
        recent_label = f'Son Deneme ({series[-1]["date_label"] or "Güncel"})'

    early_avg = round(sum(p['net'] for p in early_slice) / len(early_slice), 2)
    recent_avg = round(sum(p['net'] for p in recent_slice) / len(recent_slice), 2)
    delta = round(recent_avg - early_avg, 2)

    risers = []
    for s in subjects:
        sp = s.get('sparkline_nets') or []
        if len(sp) >= 2:
            d = round(sp[-1] - sp[0], 2)
            if d > 0.4:
                risers.append({'name': s['name'], 'delta': d})
    risers.sort(key=lambda x: -x['delta'])

    return {
        'early_label': early_label,
        'recent_label': recent_label,
        'early_avg': early_avg,
        'recent_avg': recent_avg,
        'delta': delta,
        'top_risers': risers[:2],
    }


def _compute_net_breakdown(subjects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pos = [s for s in subjects if float(s.get('avg_net') or 0) > 0]
    total_pos = sum(float(s['avg_net']) for s in pos)
    if total_pos <= 0:
        return []
    pos.sort(key=lambda x: -float(x['avg_net']))
    out = []
    for idx, s in enumerate(pos):
        share = round((float(s['avg_net']) / total_pos) * 100)
        if share <= 0:
            continue
        out.append({
            'name': s['name'],
            'avg_net': s['avg_net'],
            'share_pct': share,
            'color': BREAKDOWN_PALETTE[idx % len(BREAKDOWN_PALETTE)],
        })
    return out


def _build_track_section(
    student: Ogrenci,
    *,
    group: str,
    answers_qs,
    options: dict[str, Any],
    egitim_yili_id: int | None,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Tek bir sınav türü grubu (TYT / AYT / LGS) için modern rapor bloğu + seçilebilir sınav listesi üretir."""
    excluded_set = set(options.get('excluded_exam_ids') or [])

    # 1. Önce hariç tutma olmadan penceredeki tüm aday sınavları çıkar
    base_dev = build_development_analysis(
        student,
        exam_type=group,
        window=options['window'],
        date_from=options['date_from'],
        date_to=options['date_to'],
        answers_queryset=answers_qs,
    )
    base_exams = base_dev.get('exams') or []
    if not base_exams:
        return None, []

    base_totals: dict[int, float] = defaultdict(float)
    for subj in base_dev.get('subjects') or []:
        for pt in subj.get('series') or []:
            if pt.get('score_included') is False:
                continue
            base_totals[pt['exam_id']] += float(pt.get('net') or 0)

    available_exams = [
        {
            'exam_id': ex['exam_id'],
            'group': group,
            'group_label': TRACK_SHORT.get(group, group),
            'name': ex['name'],
            'date': ex.get('date'),
            'date_label': _fmt_date_short(ex.get('date')),
            'net': round(base_totals.get(ex['exam_id'], 0.0), 2),
            'excluded': ex['exam_id'] in excluded_set,
        }
        for ex in base_exams
    ]

    # 2. Hariç tutulan sınav varsa bu track analizini onlarsız yeniden hesapla
    active_exam_ids = [ex['exam_id'] for ex in base_exams if ex['exam_id'] not in excluded_set]
    if not active_exam_ids:
        return None, available_exams

    if len(active_exam_ids) < len(base_exams):
        dev = build_development_analysis(
            student,
            exam_type=group,
            window='custom',
            exam_ids=active_exam_ids,
            answers_queryset=answers_qs,
            custom_selection=True,
        )
    else:
        dev = base_dev

    exams_meta = dev.get('exams') or []
    if not exams_meta:
        return None, available_exams

    alan = (dev.get('filters') or {}).get('alan')
    exam_ids = [e['exam_id'] for e in exams_meta]

    # Seçili sınavların StudentAnswer kayıtlarını çek (sıralama + kesin net için)
    ans_map: dict[int, StudentAnswer] = {}
    for ans in (
        answers_qs.filter(session__exam_id__in=exam_ids)
        .select_related('session__exam')
        .prefetch_related('section_scores__section')
    ):
        ans_map[ans.session.exam_id] = ans

    kurum_avgs = (
        _compute_exam_kurum_averages(
            exam_ids,
            kurum_id=student.kurum_id,
            sube_id=student.sube_id,
            group=group,
            alan=alan,
        )
        if options['include_kurum_avg']
        else {}
    )

    # Sınav bazlı zaman serisi (ders serilerinden alan uyumlu net)
    subjects_raw = dev.get('subjects') or []
    per_exam_totals: dict[int, dict[str, float]] = defaultdict(
        lambda: {'net': 0.0, 'correct': 0, 'wrong': 0, 'empty': 0, 'questions': 0}
    )
    for subj in subjects_raw:
        for pt in subj.get('series') or []:
            if pt.get('score_included') is False:
                continue
            eid = pt['exam_id']
            per_exam_totals[eid]['net'] += float(pt.get('net') or 0)
            per_exam_totals[eid]['correct'] += int(pt.get('correct') or 0)
            per_exam_totals[eid]['wrong'] += int(pt.get('wrong') or 0)
            per_exam_totals[eid]['empty'] += int(pt.get('empty') or 0)
            per_exam_totals[eid]['questions'] += int(pt.get('question_count') or 0)

    series: list[dict[str, Any]] = []
    latest_rank = None
    latest_total_students = None

    for idx, ex in enumerate(exams_meta):
        eid = ex['exam_id']
        ans = ans_map.get(eid)
        tot = per_exam_totals.get(eid)
        if tot and tot['questions'] > 0:
            net_val = round(tot['net'], 2)
            corr = int(tot['correct'])
            wrng = int(tot['wrong'])
            empt = int(tot['empty'])
            q_cnt = int(tot['questions'])
        elif ans:
            net_val = round(float(ans.total_net or 0), 2)
            corr = int(ans.total_correct or 0)
            wrng = int(ans.total_wrong or 0)
            empt = int(ans.total_empty or 0)
            q_cnt = int(ans.session.exam.total_questions or (corr + wrng + empt))
        else:
            continue

        rank = None
        total_stu = None
        if options['include_ranking'] and ans:
            exam_obj = ans.session.exam
            year = exam_obj.puan_yili or 2026
            blk = blocks_for_answers(exam_obj, [ans], year).get(ans.id) or {}
            if exam_obj.exam_type in ('YKS_AYT', 'AYT_11'):
                pt_key = {'SAYISAL': 'SAY', 'ESIT_AGIRLIK': 'EA', 'SOZEL': 'SOZ'}.get(alan or '', 'SAY')
                rank = (blk.get('ranks') or {}).get(pt_key)
            else:
                rank = blk.get('kurum_ici_sira')
            total_stu = blk.get('toplam_ogrenci') or None
            if rank:
                latest_rank = rank
                latest_total_students = total_stu

        prev_net = series[-1]['net'] if series else None
        series.append({
            'exam_id': eid,
            'name': ex['name'],
            'short_label': _short_exam_label(ex['name'], ex.get('date'), idx),
            'date': ex.get('date'),
            'date_label': _fmt_date_short(ex.get('date')),
            'net': net_val,
            'prev_delta': round(net_val - prev_net, 2) if prev_net is not None else None,
            'kurum_avg_net': kurum_avgs.get(eid),
            'vs_kurum': round(net_val - kurum_avgs[eid], 2) if kurum_avgs.get(eid) is not None else None,
            'correct': corr,
            'wrong': wrng,
            'empty': empt,
            'questions': q_cnt,
            'rank': rank,
            'total_students': total_stu,
        })

    if not series:
        return None, available_exams

    nets = [p['net'] for p in series]
    avg_net = round(sum(nets) / len(nets), 2)
    latest_net = nets[-1]
    max_net = max(nets)
    min_net = min(nets)
    first_net = nets[0]
    trend_delta = round(latest_net - first_net, 2) if len(nets) >= 2 else None
    prev_delta = round(latest_net - nets[-2], 2) if len(nets) >= 2 else None

    k_vals = [p['kurum_avg_net'] for p in series if p['kurum_avg_net'] is not None]
    kurum_avg_overall = round(sum(k_vals) / len(k_vals), 2) if k_vals else None
    vs_kurum_delta = (
        round(avg_net - kurum_avg_overall, 2)
        if kurum_avg_overall is not None
        else None
    )

    # Ders bazlı ortalamalar
    subjects: list[dict[str, Any]] = []
    for subj in subjects_raw:
        pts = [p for p in (subj.get('series') or []) if p.get('score_included') is not False]
        if not pts:
            continue
        s_nets = [float(p.get('net') or 0) for p in pts]
        s_q = max((int(p.get('question_count') or 0) for p in pts), default=0)
        if s_q <= 0:
            continue
        s_avg = round(sum(s_nets) / len(s_nets), 2)
        s_latest = round(s_nets[-1], 2)
        s_vs_avg = round(s_latest - s_avg, 2) if len(s_nets) >= 2 else 0.0
        avg_c = round(sum(int(p.get('correct') or 0) for p in pts) / len(pts), 1)
        avg_w = round(sum(int(p.get('wrong') or 0) for p in pts) / len(pts), 1)
        avg_e = round(sum(int(p.get('empty') or 0) for p in pts) / len(pts), 1)
        perf_pct = max(0, min(100, round((s_avg / s_q) * 100)))

        raw_status = subj.get('development_status') or 'stable'
        if raw_status == 'improving' or s_vs_avg >= 1.25:
            status_code, status_label = 'improving', 'Yükselişte'
        elif raw_status == 'declining' or s_vs_avg <= -1.25 or perf_pct < 35:
            status_code, status_label = 'declining', 'Destek Gerekli'
        else:
            status_code, status_label = 'stable', 'Dengeli'

        subjects.append({
            'name': subj['name'],
            'exam_count': len(pts),
            'question_count': s_q,
            'avg_net': s_avg,
            'latest_net': s_latest,
            'vs_avg_delta': s_vs_avg,
            'avg_correct': avg_c,
            'avg_wrong': avg_w,
            'avg_empty': avg_e,
            'performance_pct': perf_pct,
            'sparkline_nets': [round(x, 2) for x in s_nets[-8:]],
            'status': status_code,
            'status_label': status_label,
        })

    # Hata profili (yanlış vs boş — seçilen veli dil tonuna uyarlı)
    tone = options.get('tone') or 'balanced'
    total_wrong = sum(p['wrong'] for p in series)
    total_empty = sum(p['empty'] for p in series)
    total_loss = total_wrong + total_empty
    wrong_pct = round((total_wrong / total_loss) * 100) if total_loss > 0 else 0
    empty_pct = 100 - wrong_pct if total_loss > 0 else 0
    if total_loss == 0:
        err_profile = 'clean'
        err_text = 'Seçilen dönemde belirgin soru kaybı görünmüyor.'
    elif wrong_pct >= 62:
        err_profile = 'wrong'
        if tone == 'supportive':
            err_text = (
                f'Öğrencimiz soruların büyük kısmına cesaretle yaklaşıyor; kayıpların %{wrong_pct}\'i yanlış işaretlemeden geliyor. '
                'Sakin okuma ve küçük bir son kontrol alışkanlığıyla netlerde hızlı bir sıçrama görebiliriz.'
            )
        elif tone == 'focused':
            err_text = (
                f'Kayıpların %{wrong_pct}\'i doğrudan yanlış işaretlemeden kaynaklanıyor. '
                'Emin olunmayan sorularda tahmin riskini azaltmak ve çeldirici analizi yapmak acil önceliğimiz.'
            )
        else:
            err_text = (
                f'Soru kayıplarının %{wrong_pct}\'i yanlış işaretlemeden kaynaklanıyor. '
                'Dikkatli okuma, çeldirici analizi ve soru kontrol alışkanlığı hızlı net artışı sağlar.'
            )
    elif empty_pct >= 62:
        err_profile = 'empty'
        if tone == 'supportive':
            err_text = (
                f'Öğrencimiz emin olmadığı soruları boş bırakarak netini koruyor (kayıpların %{empty_pct}\'i boş). '
                'Eksik konular adım adım tamamlandıkça bu sorular doğrudan nete dönüşecektir.'
            )
        elif tone == 'focused':
            err_text = (
                f'Kayıpların %{empty_pct}\'i boş bırakılan sorulardan geliyor. '
                'Haftalık planda öncelikli konu tamamlama ve süreli deneme pratiğine hız verilmesi gerekiyor.'
            )
        else:
            err_text = (
                f'Soru kayıplarının %{empty_pct}\'i boş bırakılan sorulardan kaynaklanıyor. '
                'Temel konu tamamlama ve süre yönetimi çalışması öncelikli fayda sağlar.'
            )
    else:
        err_profile = 'balanced'
        if tone == 'supportive':
            err_text = (
                f'Yanlış (%{wrong_pct}) ve boş (%{empty_pct}) dağılımı dengeli ilerliyor. '
                'Kısa tekrarlar ve düzenli soru çözüm rutiniyle çok sağlıklı bir yükseliş potansiyeli var.'
            )
        elif tone == 'focused':
            err_text = (
                f'Yanlış (%{wrong_pct}) ve boş (%{empty_pct}) kayıpları eş zamanlı görülüyor. '
                'Hem temel konu eksiklerini kapatıp hem de yanlış defteri tutarak disiplinli takip yapacağız.'
            )
        else:
            err_text = (
                f'Yanlış (%{wrong_pct}) ve boş (%{empty_pct}) dağılımı dengeli. '
                'Kısa konu tekrarlarıyla birlikte düzenli karma soru çözümü etkilidir.'
            )

    # Güçlü yönler (en yüksek başarı % ile istikrarlı/yükselen ilk 3 ders)
    strength_pool = [
        s for s in subjects
        if s['performance_pct'] >= 50
    ]
    if not strength_pool:
        strength_pool = [s for s in subjects if s['performance_pct'] >= 35]
    strength_pool.sort(
        key=lambda s: (
            -s['performance_pct'],
            s['status'] != 'improving',
            -s['avg_net'],
        )
    )
    strengths = strength_pool[:3]

    # Çalışma odağı (plana alınanlar + nokta atışı en fazla 5 konu)
    agenda_items = (dev.get('agenda') or {}).get('items') or []
    study_focus = _extract_study_focus(agenda_items, exams_meta, group)

    # Katılım oranı (kurumda aynı dönemde yapılan toplam sınav)
    participation = None
    if options['include_attendance']:
        type_list = types_for_group(group)
        exam_qs = Exam.objects.filter(
            kurum_id=student.kurum_id,
            sube_id=student.sube_id,
            exam_type__in=type_list,
            is_active=True,
            sessions__status='COMPLETED',
        ).distinct()
        if egitim_yili_id:
            exam_qs = exam_qs.filter(egitim_yili_id=egitim_yili_id)
        if options['date_from']:
            exam_qs = exam_qs.filter(exam_date__gte=options['date_from'])
        if options['date_to']:
            exam_qs = exam_qs.filter(exam_date__lte=options['date_to'])
        available_count = exam_qs.count()
        attended_all = answers_qs.filter(session__exam_id__in=exam_qs.values('id')).count()
        if available_count > 0:
            participation = {
                'attended': min(attended_all, available_count),
                'available': available_count,
                'rate_pct': min(100, round((attended_all / available_count) * 100)),
            }

    progress_bridge = _compute_progress_bridge(series, subjects)
    consistency = _compute_consistency(nets, group)
    net_breakdown = _compute_net_breakdown(subjects)

    return {
        'group': group,
        'label': TRACK_LABELS.get(group, group),
        'short_label': TRACK_SHORT.get(group, group),
        'alan_label': ALAN_LABELS.get(alan or '', alan or ''),
        'kpi': {
            'exam_count': len(series),
            'latest_net': latest_net,
            'avg_net': avg_net,
            'max_net': max_net,
            'min_net': min_net,
            'trend_delta': trend_delta,
            'prev_delta': prev_delta,
            'kurum_avg_net': kurum_avg_overall,
            'vs_kurum_delta': vs_kurum_delta,
            'latest_rank': latest_rank,
            'latest_total_students': latest_total_students,
        },
        'progress_bridge': progress_bridge,
        'consistency': consistency,
        'net_breakdown': net_breakdown,
        'series': series,
        'subjects': subjects,
        'error_profile': {
            'total_wrong': total_wrong,
            'total_empty': total_empty,
            'total_loss': total_loss,
            'wrong_pct': wrong_pct,
            'empty_pct': empty_pct,
            'profile': err_profile,
            'summary_text': err_text,
        },
        'strengths': strengths,
        'study_focus': study_focus,
        'participation': participation,
    }, available_exams


def _assignment_summary(student: Ogrenci, options: dict[str, Any]) -> dict[str, Any] | None:
    if not options['include_assignments']:
        return None
    try:
        from apps.coaching.assignment_manual.models import ManualAssignment
    except Exception:
        return None

    qs = ManualAssignment.objects.filter(
        student=student,
        is_active=True,
    ).exclude(status__in=['DRAFT', 'CANCELLED'])

    if options['date_from']:
        qs = qs.filter(Q(due_date__date__gte=options['date_from']) | Q(created_at__date__gte=options['date_from']))
    if options['date_to']:
        qs = qs.filter(Q(due_date__date__lte=options['date_to']) | Q(created_at__date__lte=options['date_to']))

    total = qs.count()
    if total == 0:
        return None
    completed = qs.filter(status='COMPLETED').count()
    overdue = qs.filter(status='OVERDUE').count()
    avg_comp = qs.aggregate(avg=Avg('completion_percent')).get('avg')
    avg_pct = round(float(avg_comp)) if avg_comp is not None else round((completed / total) * 100)
    return {
        'total': total,
        'completed': completed,
        'overdue': overdue,
        'avg_completion_pct': max(0, min(100, avg_pct)),
    }


def _student_context(student: Ogrenci, *, egitim_yili_id: int | None, user=None) -> dict[str, str]:
    kayit_qs = OgrenciKayit.objects.filter(ogrenci=student, aktif_mi=True).select_related(
        'sinif', 'sinif_seviyesi', 'alan', 'egitim_yili'
    )
    if egitim_yili_id:
        kayit = kayit_qs.filter(egitim_yili_id=egitim_yili_id).first() or kayit_qs.first()
    else:
        kayit = kayit_qs.order_by('-egitim_yili_id').first()

    sinif_ad = ''
    alan_ad = ''
    egitim_yili_str = ''
    if kayit:
        if kayit.sinif:
            sinif_ad = kayit.sinif.ad
        elif kayit.sinif_seviyesi:
            sinif_ad = getattr(kayit.sinif_seviyesi, 'ad', str(kayit.sinif_seviyesi))
        if kayit.alan:
            alan_ad = getattr(kayit.alan, 'ad', '') or ''
        if kayit.egitim_yili:
            egitim_yili_str = getattr(kayit.egitim_yili, 'yil_str', '') or str(kayit.egitim_yili)

    coach_name = ''
    try:
        from apps.coaching.models import CoachAssignment
        ca = (
            CoachAssignment.objects.filter(student=student, is_active=True)
            .select_related('coach__user')
            .first()
        )
        if ca and ca.coach:
            u = getattr(ca.coach, 'user', None)
            coach_name = (
                f'{u.first_name} {u.last_name}'.strip()
                if u and (u.first_name or u.last_name)
                else str(ca.coach)
            )
    except Exception:
        pass
    if not coach_name and user:
        coach_name = f'{getattr(user, "first_name", "")} {getattr(user, "last_name", "")}'.strip() or getattr(user, 'username', '')

    return {
        'student_id': student.id,
        'student_name': f'{student.ad} {student.soyad}'.strip(),
        'student_no': getattr(student, 'ogrenci_no', '') or '',
        'sinif_ad': sinif_ad,
        'alan_ad': alan_ad,
        'kurum_ad': getattr(getattr(student, 'kurum', None), 'ad', '') or '3K Kampüs',
        'sube_ad': getattr(getattr(student, 'sube', None), 'ad', '') or '',
        'egitim_yili': egitim_yili_str,
        'coach_name': coach_name,
    }


def _tr_genitive(name: str) -> str:
    """Türkçe özel isim iyelik eki: Büşra'nın, Ahmet'in, Yusuf'un, Ömer'in."""
    word = (name or 'Öğrencimiz').strip()
    if not word:
        return "Öğrencimizin"
    vowels = 'aeıioöuüAEIİOÖUÜ'
    last_char = word[-1]
    ends_vowel = last_char in vowels
    last_vowel = ''
    for ch in reversed(word):
        if ch in vowels:
            last_vowel = ch.replace('İ', 'i').replace('I', 'ı').lower()
            break
    suffix_map = {
        'a': 'ın', 'ı': 'ın',
        'e': 'in', 'i': 'in',
        'o': 'un', 'u': 'un',
        'ö': 'ün', 'ü': 'ün',
    }
    base = suffix_map.get(last_vowel, 'in')
    prefix = 'n' if ends_vowel else ''
    return f"{word}'{prefix}{base}"


def _build_note_templates(
    student_name: str,
    tracks: list[dict[str, Any]],
    tone: str = 'balanced',
) -> list[dict[str, str]]:
    first_name = (student_name or 'Öğrencimiz').split()[0]
    first_gen = _tr_genitive(first_name)
    primary = tracks[0] if tracks else None
    focus_names = [f['name'] for f in (primary.get('study_focus') or [])[:2]] if primary else []
    focus_str = ' ve '.join(focus_names) if focus_names else 'öncelikli kazanımlar'
    strength_names = [s['name'] for s in (primary.get('strengths') or [])[:2]] if primary else []
    strength_str = ' ve '.join(strength_names) if strength_names else 'güçlü dersleri'

    if tone == 'supportive':
        return [
            {
                'id': 'growth',
                'label': 'Moral & Gelişim',
                'text': (
                    f'{first_gen} {strength_str} derslerindeki emeği ve olumlu enerjisi bizi çok mutlu ediyor. '
                    f'Önümüzdeki haftalarda {focus_str} konularını adım adım pekiştirerek özgüvenini ve netlerini daha da yukarı taşıyacağız. '
                    'Evde destekleyici ve sakin bir çalışma ortamı sağlamanız büyük katkı sunacaktır.'
                ),
            },
            {
                'id': 'support',
                'label': 'Nazik Destek',
                'text': (
                    f'{first_name} elinden gelen çabayı gösteriyor; son denemelerde birlikte odaklanacağımız {focus_str} alanlarını netleştirdik. '
                    'Acele etmeden, küçük ve ulaşılabilir haftalık hedeflerle ilerleyeceğiz. Süreçte yanındayız.'
                ),
            },
            {
                'id': 'steady',
                'label': 'Tebrik & Devam',
                'text': (
                    f'{first_gen} düzenli deneme katılımı ve çalışma gayreti takdir edilesi. '
                    'Bu güzel ritmi koruduğunda çok daha yüksek netlere rahatlıkla ulaşacağına yürekten inanıyoruz.'
                ),
            },
        ]

    if tone == 'focused':
        return [
            {
                'id': 'growth',
                'label': 'Hedef Odaklı',
                'text': (
                    f'{first_gen} {strength_str} alanlarında yakaladığı seviyeyi korurken, net sıçraması için {focus_str} konularını öncelikli takvime aldık. '
                    'Günlük planlanan soru hedefinin aksatılmadan tamamlanması ve her deneme sonrası yanlış analizi yapılması kritik önem taşıyor.'
                ),
            },
            {
                'id': 'support',
                'label': 'Disiplin & Takip',
                'text': (
                    f'Hedeflenen net bandına ulaşmak için {focus_str} eksiklerini önümüzdeki 2 hafta içinde kapatmayı planladık. '
                    'Evde çalışma saatlerinin düzenli takibi ve telefon/ekran kontrolü konusunda desteğinizi rica ediyoruz.'
                ),
            },
            {
                'id': 'steady',
                'label': 'Tempo Artırma',
                'text': (
                    f'{first_name} temel istikrarı yakaladı; şimdi üst banda geçme zamanı. '
                    'Süreli branş denemeleri ve düzenli tekrar programıyla hedefe kararlı biçimde ilerliyoruz.'
                ),
            },
        ]

    return [
        {
            'id': 'growth',
            'label': 'Gelişim Odaklı',
            'text': (
                f'{first_gen} {strength_str} alanlarındaki istikrarı olumlu ilerliyor. '
                f'Önümüzdeki süreçte özellikle {focus_str} başlıklarına odaklanarak '
                'deneme netlerinde düzenli bir artış hedefliyoruz. Ev ortamında düzenli soru çözüm rutiniyle desteklemeniz çok faydalı olacaktır.'
            ),
        },
        {
            'id': 'support',
            'label': 'Destek ve Planlama',
            'text': (
                f'Son denemeler doğrultusunda {first_name} için öncelikli çalışma alanlarımızı belirledik. '
                f'{focus_str} konularında eksik giderme ve deneme sonrası hata analizi üzerine birebir takip yapacağız. '
                'Süreç içinde birlikte iletişimde kalarak ilerlemeyi yakından izleyeceğiz.'
            ),
        },
        {
            'id': 'steady',
            'label': 'İstikrarlı Gidişat',
            'text': (
                f'{first_name} dönem boyunca düzenli bir deneme performansı sergiliyor. '
                'Mevcut disiplinini koruyarak küçük dikkat kayıplarını azalttığında hedeflenen net bandına rahatlıkla ulaşacaktır. '
                'Göstermiş olduğu çaba için kendisini tebrik ediyoruz.'
            ),
        },
    ]


def list_veli_recipients(student: Ogrenci, kurum_id: int) -> list[dict[str, Any]]:
    """Öğrencinin WhatsApp ile rapor gönderilebilecek veli listesini döndürür."""
    veliler = list(
        OgrenciVeli.objects.filter(ogrenci=student)
        .order_by('-varsayilan', 'veli_turu', 'id')
    )
    out: list[dict[str, Any]] = []
    for v in veliler:
        phone = (effective_veli_phone(v, student) or getattr(v, 'telefon', '') or '').strip()
        allows = ContactResolver.veli_allows_outbound(v, 'duyuru') if phone else False
        skip_reason = None
        if not phone:
            skip_reason = 'Telefon numarası kayıtlı değil'
        elif not allows:
            skip_reason = 'Bildirim izni kapalı'
        display = getattr(v, 'tam_ad', None) or f'{v.ad} {v.soyad}'.strip() or 'Veli'
        relation = v.get_veli_turu_display() if hasattr(v, 'get_veli_turu_display') else ''
        masked = f'{phone[:4]}***{phone[-2:]}' if len(phone) >= 6 else phone
        out.append({
            'veli_id': v.id,
            'display_name': display,
            'relation': relation,
            'phone': phone,
            'masked_phone': masked,
            'is_default': bool(getattr(v, 'varsayilan', False)),
            'can_send': bool(phone and allows),
            'skip_reason': skip_reason,
        })
    return out


def build_parent_exam_report_payload(
    student: Ogrenci,
    *,
    answers_qs,
    raw_options: dict[str, Any] | None = None,
    egitim_yili_id: int | None = None,
    user=None,
) -> dict[str, Any]:
    """Veli Sınav Genel Durum Raporu için eksiksiz, modern veri yükü."""
    options = _normalize_options(raw_options)

    # Mevcut sınav türü gruplarını tespit et
    raw_types = list(
        answers_qs.values_list('session__exam__exam_type', flat=True).distinct()
    )
    available_groups = []
    for g in TRACK_ORDER:
        if any(group_for_exam_type(et) == g for et in raw_types):
            available_groups.append(g)

    if options['scope'] == 'both':
        if 'TYT' in available_groups or 'AYT' in available_groups:
            target_groups = [g for g in ('TYT', 'AYT') if g in available_groups]
        else:
            target_groups = available_groups[:2]
    else:
        target_groups = [options['scope']] if options['scope'] in available_groups else []

    tracks: list[dict[str, Any]] = []
    available_exams: list[dict[str, Any]] = []
    for g in target_groups:
        track, track_exams = _build_track_section(
            student,
            group=g,
            answers_qs=answers_qs,
            options=options,
            egitim_yili_id=egitim_yili_id,
        )
        available_exams.extend(track_exams)
        if track:
            tracks.append(track)

    meta = _student_context(student, egitim_yili_id=egitim_yili_id, user=user)
    assignments = _assignment_summary(student, options)

    if options['date_from'] or options['date_to']:
        d_from = _fmt_date_full(options['date_from']) if options['date_from'] else 'Başlangıç'
        d_to = _fmt_date_full(options['date_to']) if options['date_to'] else 'Bugün'
        period_label = f'{d_from} – {d_to}'
    else:
        period_label = WINDOW_LABELS.get(options['window'], 'Son 5 Sınav')

    now_local = timezone.localtime(timezone.now())
    recipients = list_veli_recipients(student, student.kurum_id)
    groups_str = ' / '.join([t['group'] for t in tracks] or ['Sınav'])
    default_veli_name = (
        options.get('recipient_greeting')
        or next((r['display_name'] for r in recipients if r['is_default']), None)
        or (recipients[0]['display_name'] if recipients else 'Velimiz')
    )
    default_whatsapp_caption = (
        f'Sayın {default_veli_name},\n\n'
        f'{meta["student_name"]} için {period_label} dönemine ait {groups_str} Genel Durum Raporu ekte bilgilerinize sunulmuştur.\n\n'
        f'{meta.get("kurum_ad") or "3K Kampüs"}'
    )

    return {
        'meta': {
            **meta,
            'period_label': period_label,
            'generated_at': now_local.isoformat(),
            'generated_date_label': _fmt_date_full(now_local),
            'available_groups': available_groups,
            'included_groups': [t['group'] for t in tracks],
        },
        'options': options,
        'tracks': tracks,
        'available_exams': available_exams,
        'assignments': assignments,
        'coach_note': options['coach_note'],
        'note_templates': _build_note_templates(meta['student_name'], tracks, tone=options['tone']),
        'recipients': recipients,
        'default_whatsapp_caption': default_whatsapp_caption,
    }


def parent_report_filename(payload: dict[str, Any]) -> str:
    name = (payload.get('meta') or {}).get('student_name') or 'Ogrenci'
    safe = re.sub(r'[^\w\s.\-çğıöşüÇĞİÖŞÜ]', '', name, flags=re.UNICODE).strip()
    safe = re.sub(r'\s+', '-', safe) or 'Ogrenci'
    groups = '-'.join((payload.get('meta') or {}).get('included_groups') or ['Sinav'])
    today = timezone.localdate().strftime('%Y%m%d')
    return f'{safe}-{groups}-Genel-Durum-Raporu-{today}.pdf'


@transaction.atomic
def send_parent_exam_report_whatsapp(
    student: Ogrenci,
    *,
    payload: dict[str, Any],
    pdf_bytes: bytes,
    filename: str,
    veli_ids: list[int],
    custom_caption: str = '',
    sent_by_user_id: int | None = None,
) -> dict[str, Any]:
    """Oluşturulan PDF raporu mevcut WhatsApp iletişim altyapısıyla seçili velilere gönderir."""
    if not pdf_bytes or not pdf_bytes.startswith(b'%PDF'):
        raise ValueError('Geçersiz veya boş PDF dosyası.')
    if not veli_ids:
        raise ValueError('En az bir veli seçilmelidir.')

    recipients = list_veli_recipients(student, student.kurum_id)
    by_id = {r['veli_id']: r for r in recipients}
    meta = payload.get('meta') or {}
    student_name = meta.get('student_name') or f'{student.ad} {student.soyad}'.strip()
    period_label = meta.get('period_label') or ''
    groups_str = ' / '.join(meta.get('included_groups') or ['Sınav'])

    sent = 0
    skipped = 0
    errors: list[str] = []
    sent_details: list[dict[str, Any]] = []
    message_ids: list[str] = []

    ref_stamp = timezone.now().strftime('%Y%m%d%H%M%S')

    for vid in veli_ids:
        info = by_id.get(vid)
        if not info:
            skipped += 1
            errors.append(f'Veli #{vid} bulunamadı.')
            continue
        if not info['can_send']:
            skipped += 1
            errors.append(f'{info["display_name"]}: {info["skip_reason"] or "Gönderilemiyor"}')
            continue

        veli = OgrenciVeli.objects.filter(id=vid, ogrenci=student).first()
        if not veli:
            skipped += 1
            errors.append(f'{info["display_name"]}: Veli kaydı bulunamadı.')
            continue

        caption = (custom_caption or '').strip()
        if not caption:
            caption = (
                f'Sayın {info["display_name"]},\n\n'
                f'{student_name} için {period_label} dönemine ait {groups_str} Genel Durum Raporu ekte bilgilerinize sunulmuştur.\n\n'
                f'{meta.get("kurum_ad") or "3K Kampüs"}'
            )

        ctx = {
            'veli_ad': info['display_name'],
            'ogrenci_ad': student_name,
            'sinav_ad': f'{groups_str} Genel Durum Raporu ({period_label})',
            'kurum_ad': meta.get('kurum_ad') or '',
            'sube': meta.get('sube_ad') or '',
            'pdf_baslik': 'Sınav Genel Durum Raporu',
            'kisa_mesaj': caption,
        }

        result = dispatch_event(
            student.kurum_id,
            'sinav.karne',
            recipient=NotificationRecipient.veli(veli.id),
            context=ctx,
            attachment=NotificationAttachment(filename=filename, file_bytes=pdf_bytes),
            source=MessageSource(
                module=SOURCE_SINAV,
                ref_id=f'parent_report:{student.id}:{ref_stamp}:veli:{veli.id}',
            ),
            sube_id=student.sube_id,
            sent_by_user_id=sent_by_user_id,
            fallback_body=caption,
        )

        if result and result.success:
            sent += 1
            mid = getattr(result, 'message_id', None)
            if mid:
                message_ids.append(str(mid))
            sent_details.append({
                'veli_id': veli.id,
                'display_name': info['display_name'],
                'phone': info['masked_phone'],
                'message_status': result.message_status or 'SENT',
                'message_id': str(mid) if mid else None,
            })
        else:
            skipped += 1
            err_msg = '; '.join(result.errors) if result and result.errors else 'Gönderilemedi'
            errors.append(f'{info["display_name"]}: {err_msg}')

    return {
        'sent': sent,
        'skipped': skipped,
        'errors': errors,
        'sent_details': sent_details,
        'message_ids': message_ids,
        'filename': filename,
    }
