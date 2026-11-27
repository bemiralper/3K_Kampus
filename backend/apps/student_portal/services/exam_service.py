"""
Öğrenci Portalı — Sınav Analizi, Dijital Sınav Giriş Kartı (Boarding Pass),
En Kolay Net Artışı Radarı, Dönemlik Konu Hakimiyet Isı Haritası ve Karne PDF.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from django.db.models import F, Max, Q
from django.utils import timezone

from apps.coaching.application.olcme_karne_pdf import karne_filename, render_karne_pdf
from apps.coaching.olcme_degerlendirme.models import Exam, ExamParticipant, StudentAnswer
from apps.coaching.olcme_degerlendirme.services.scoring_settings import resolve_puan_yili
from apps.coaching.olcme_degerlendirme.services.stored_scores import blocks_for_answers
from apps.coaching.olcme_degerlendirme.views.analysis_views import (
    _build_topic_blocks,
    _get_student_alan,
    build_student_detail_payload,
)
from apps.coaching.olcme_degerlendirme.views.student_exam_views import _present_answer

from ..auth import ISTANBUL, StudentPortalError
from .schedule_service import resolve_student_classroom, subject_color

PUBLISHED_EXAM_STATUSES = ('RESULTS_UPLOADED', 'COMPLETED')


def _is_exam_result_visible(exam: Exam, now_dt: datetime) -> bool:
    if not exam.is_active or exam.status not in PUBLISHED_EXAM_STATUSES:
        return False
    if exam.result_publish_date and exam.result_publish_date > now_dt:
        return False
    return True


def _student_published_answers(scope: dict) -> list[StudentAnswer]:
    now_dt = timezone.now()
    ogrenci = scope['ogrenci']
    qs = (
        StudentAnswer.objects.filter(
            student_id=ogrenci.id,
            session__status='COMPLETED',
            session__exam__kurum_id=scope['kurum_id'],
            session__exam__egitim_yili_id=scope['egitim_yili_id'],
            session__exam__is_active=True,
            session__exam__status__in=PUBLISHED_EXAM_STATUSES,
        )
        .filter(
            Q(session__exam__sube_id__isnull=True) | Q(session__exam__sube_id=scope['sube_id']),
        )
        .filter(
            Q(session__exam__result_publish_date__isnull=True)
            | Q(session__exam__result_publish_date__lte=now_dt),
        )
    )
    latest_ids = qs.order_by().values('session__exam_id').annotate(last_id=Max('id')).values('last_id')
    return list(
        qs.filter(id__in=latest_ids)
        .select_related('session__exam', 'session__exam__egitim_yili', 'student')
        .prefetch_related('section_scores__section')
        .order_by(
            F('session__exam__exam_date').asc(nulls_first=True),
            'session__exam__created_at',
            'session__exam_id',
            'id',
        )
    )


def build_upcoming_exam_boarding_pass(scope: dict) -> dict | None:
    """
    Yaklaşan ilk sınav için uçak biniş kartı (Boarding Pass) verisi üretir:
    Salon adı, sıra numarası, masa kodu, tarih/saat ve geri sayım.
    """
    today = timezone.localtime(timezone.now(), ISTANBUL).date()
    ogrenci = scope['ogrenci']
    kayit = scope['kayit']
    classroom, _ = resolve_student_classroom(scope)

    part = (
        ExamParticipant.objects.select_related('exam', 'room', 'exam_session')
        .filter(
            student_id=ogrenci.id,
            exam__kurum_id=scope['kurum_id'],
            exam__is_active=True,
            exam__exam_date__gte=today,
        )
        .filter(Q(exam__sube_id__isnull=True) | Q(exam__sube_id=scope['sube_id']))
        .order_by('exam__exam_date', 'id')
        .first()
    )

    exam = part.exam if part else None
    if exam is None and classroom is not None:
        exam = (
            Exam.objects.filter(
                kurum_id=scope['kurum_id'],
                is_active=True,
                exam_date__gte=today,
                siniflar=classroom,
            )
            .filter(Q(sube_id__isnull=True) | Q(sube_id=scope['sube_id']))
            .order_by('exam_date', 'id')
            .first()
        )

    if exam is None or not exam.exam_date:
        return None

    sess = part.exam_session if part else None
    start_time_str = ''
    if sess and getattr(sess, 'start_time', None):
        start_time_str = sess.start_time.strftime('%H:%M')
    else:
        start_time_str = '09:30'

    days_left = (exam.exam_date - today).days
    return {
        'exam_id': exam.id,
        'exam_name': exam.name,
        'exam_type': exam.exam_type,
        'exam_type_label': exam.get_exam_type_display(),
        'exam_date': exam.exam_date.isoformat(),
        'days_left': days_left,
        'is_today': days_left == 0,
        'start_time': start_time_str,
        'duration_minutes': exam.duration_minutes,
        'session_name': getattr(sess, 'name', '') if sess else '',
        'room_name': part.room.name if (part and part.room) else 'Atama Bekleniyor',
        'seat_no': part.seat_no if part else None,
        'desk_no': part.desk_no if (part and part.desk_no) else '',
        'student_no': kayit.okul_no or str(ogrenci.id),
        'student_name': ogrenci.tam_ad,
        'booklet_type': exam.booklet_type,
    }


def _compute_exam_badges(exams_chronological: list[dict], index: int) -> list[dict]:
    current = exams_chronological[index]
    same_type_prev = [
        e for e in exams_chronological[:index]
        if e['exam_type'] == current['exam_type']
    ]
    badges = []
    if same_type_prev and all(current['total_net'] > p['total_net'] for p in same_type_prev):
        badges.append({'code': 'PERSONAL_BEST', 'label': 'Kişisel Net Rekoru', 'tone': 'gold'})

    # Ardışık yükseliş serisi
    same_type_up_to_now = same_type_prev + [current]
    streak = 0
    for j in range(len(same_type_up_to_now) - 1, 0, -1):
        if same_type_up_to_now[j]['total_net'] > same_type_up_to_now[j - 1]['total_net']:
            streak += 1
        else:
            break
    if streak >= 2:
        badges.append({'code': 'STREAK_UP', 'label': f'{streak} Sınavdır Yükselişte', 'tone': 'emerald'})

    # Ders rekoru
    prev_sec_max: dict[str, float] = {}
    for p in same_type_prev:
        for sec in p['sections']:
            prev_sec_max[sec['name']] = max(prev_sec_max.get(sec['name'], -999.0), sec['net'])
    for sec in current['sections']:
        if sec['name'] in prev_sec_max and sec['net'] > prev_sec_max[sec['name']] and sec['net'] > 0:
            badges.append({
                'code': f"BEST_{sec['name']}",
                'label': f"{sec['name']} Rekoru",
                'tone': 'indigo',
            })
            break

    return badges


def _build_mastery_heatmap(answers: list[StudentAnswer]) -> list[dict]:
    """
    Son sınavlardaki kazanım/konu performanslarını birleştirerek
    ders bazlı Konu Hakimiyet Isı Haritası (Mastery Heatmap) üretir.
    """
    recent = answers[-8:]
    agg: dict[tuple[str, str], dict] = {}
    for ans in recent:
        comparison = ans.comparison or {}
        if not comparison:
            continue
        try:
            blocks = _build_topic_blocks(ans.session.exam, comparison, ans.booklet or '')
        except Exception:
            blocks = []
        for tb in blocks or []:
            sec_name = tb.get('section_name') or 'Genel'
            for topic in tb.get('topics') or []:
                t_name = (topic.get('topic_name') or topic.get('name') or '').strip()
                if not t_name:
                    continue
                c = int(topic.get('correct') or 0)
                w = int(topic.get('wrong') or 0)
                e = int(topic.get('empty') or 0)
                q_total = c + w + e
                if q_total <= 0:
                    continue
                key = (sec_name, t_name)
                bucket = agg.setdefault(key, {
                    'section_name': sec_name,
                    'topic_name': t_name,
                    'correct': 0,
                    'wrong': 0,
                    'empty': 0,
                    'total': 0,
                    'exam_hits': 0,
                })
                bucket['correct'] += c
                bucket['wrong'] += w
                bucket['empty'] += e
                bucket['total'] += q_total
                bucket['exam_hits'] += 1

    by_section: dict[str, list[dict]] = defaultdict(list)
    for (_sec, _top), row in agg.items():
        mastery_pct = round(row['correct'] / row['total'] * 100) if row['total'] else 0
        level = (
            'strong' if mastery_pct >= 75
            else 'good' if mastery_pct >= 55
            else 'developing' if mastery_pct >= 35
            else 'critical'
        )
        by_section[row['section_name']].append({
            'topic_name': row['topic_name'],
            'correct': row['correct'],
            'wrong': row['wrong'],
            'empty': row['empty'],
            'total': row['total'],
            'exam_hits': row['exam_hits'],
            'mastery_percent': mastery_pct,
            'level': level,
        })

    result = []
    for sec_name, topics in by_section.items():
        topics.sort(key=lambda t: (t['mastery_percent'], -t['total']))
        avg_mastery = round(sum(t['mastery_percent'] for t in topics) / len(topics)) if topics else 0
        result.append({
            'section_name': sec_name,
            'color': subject_color(sec_name),
            'average_mastery_percent': avg_mastery,
            'topics': topics[:18],
        })
    result.sort(key=lambda s: s['section_name'])
    return result


def build_student_exams_overview(scope: dict, exam_type: str | None = None) -> dict:
    """
    Öğrencinin tüm yayınlanmış sınavları, net/puan gelişim trendi,
    kişisel rekor rozetleri ve dönemlik Konu Hakimiyet Isı Haritası.
    """
    all_answers = _student_published_answers(scope)
    available_types = []
    seen_types = set()
    for ans in all_answers:
        ex = ans.session.exam
        if ex.exam_type not in seen_types:
            seen_types.add(ex.exam_type)
            available_types.append({
                'code': ex.exam_type,
                'label': ex.get_exam_type_display(),
            })

    filtered_answers = [
        a for a in all_answers
        if not exam_type or a.session.exam.exam_type == exam_type
    ]

    alan_kodu = _get_student_alan(scope['ogrenci'], scope['kayit'].egitim_yili)
    chronological: list[dict] = []

    for ans in filtered_answers:
        exam = ans.session.exam
        year = resolve_puan_yili(exam)
        block = blocks_for_answers(exam, [ans], year).get(ans.id)
        score_data, ranking_data, _pt, kurum_ici_sira, toplam_ogrenci = _present_answer(
            exam, ans, year, block, alan_kodu=alan_kodu,
        )
        sections = []
        for ss in ans.section_scores.all():
            q_cnt = int(ss.correct + ss.wrong + ss.empty)
            sections.append({
                'section_id': ss.section_id,
                'name': ss.section.name,
                'color': subject_color(ss.section.name),
                'correct': ss.correct,
                'wrong': ss.wrong,
                'empty': ss.empty,
                'question_count': q_cnt,
                'net': round(float(ss.net), 2),
            })

        chronological.append({
            'exam_id': exam.id,
            'answer_id': ans.id,
            'exam_name': exam.name,
            'exam_type': exam.exam_type,
            'exam_type_label': exam.get_exam_type_display(),
            'exam_date': exam.exam_date.isoformat() if exam.exam_date else None,
            'total_correct': ans.total_correct,
            'total_wrong': ans.total_wrong,
            'total_empty': ans.total_empty,
            'total_net': round(float(ans.total_net), 2),
            'score': round(float(score_data.get('puan') or 0), 2),
            'kurum_rank': kurum_ici_sira,
            'kurum_total': toplam_ogrenci,
            'estimated_national_rank': ranking_data.get('tahmini_siralama'),
            'percentile': ranking_data.get('yuzdelik_dilim'),
            'sections': sections,
        })

    # Önceki aynı tür sınava göre değişim + rozetler
    prev_net_by_type: dict[str, float] = {}
    for idx, item in enumerate(chronological):
        etype = item['exam_type']
        prev_val = prev_net_by_type.get(etype)
        item['net_delta'] = round(item['total_net'] - prev_val, 2) if prev_val is not None else None
        prev_net_by_type[etype] = item['total_net']
        item['badges'] = _compute_exam_badges(chronological, idx)

    kpi = None
    if chronological:
        nets = [c['total_net'] for c in chronological]
        scores = [c['score'] for c in chronological if c['score'] > 0]
        latest = chronological[-1]
        kpi = {
            'exam_count': len(chronological),
            'latest_exam_id': latest['exam_id'],
            'latest_exam_name': latest['exam_name'],
            'latest_net': latest['total_net'],
            'latest_net_delta': latest['net_delta'],
            'latest_score': latest['score'],
            'latest_kurum_rank': latest['kurum_rank'],
            'latest_kurum_total': latest['kurum_total'],
            'personal_best_net': max(nets),
            'average_net': round(sum(nets) / len(nets), 2),
            'personal_best_score': max(scores) if scores else 0,
            'latest_badges': latest['badges'],
        }

    return {
        'available_types': available_types,
        'selected_type': exam_type or '',
        'kpi': kpi,
        'trend': chronological,
        'exams': list(reversed(chronological)),
        'mastery_heatmap': _build_mastery_heatmap(filtered_answers or all_answers),
        'upcoming_boarding_pass': build_upcoming_exam_boarding_pass(scope),
    }


def _load_verified_student_answer(scope: dict, exam_id: int) -> tuple[Exam, StudentAnswer]:
    now_dt = timezone.now()
    answer = (
        StudentAnswer.objects.select_related('session__exam', 'student')
        .prefetch_related('section_scores__section')
        .filter(
            student_id=scope['ogrenci'].id,
            session__exam_id=exam_id,
            session__status='COMPLETED',
            session__exam__kurum_id=scope['kurum_id'],
        )
        .filter(Q(session__exam__sube_id__isnull=True) | Q(session__exam__sube_id=scope['sube_id']))
        .order_by('-id')
        .first()
    )
    if answer is None:
        raise StudentPortalError('not_found', 'Sınav sonucu bulunamadı.', 404)

    exam = answer.session.exam
    if not _is_exam_result_visible(exam, now_dt):
        raise StudentPortalError('not_published', 'Bu sınavın sonuçları henüz yayınlanmadı.', 403)
    return exam, answer


def _build_quick_net_gain_radar(detail_payload: dict) -> list[dict]:
    """
    "En Kolay Net Artışı Radarı":
    Öğrencinin bu sınavda yanlış/boş bıraktığı ama genel olarak erişilebilir olan
    (veya küçük dokunuşla en çok net getirecek) öncelikli konuları puanlar.
    """
    opportunities: list[dict] = []
    penalty = float(detail_payload.get('wrong_answer_count') or 4)
    wrong_cost = (1.0 / penalty) if penalty > 0 else 0.0

    for tb in detail_payload.get('topic_blocks') or []:
        sec_name = tb.get('section_name') or 'Ders'
        for t in tb.get('topics') or []:
            t_name = (t.get('topic_name') or t.get('name') or '').strip()
            if not t_name:
                continue
            c = int(t.get('correct') or 0)
            w = int(t.get('wrong') or 0)
            e = int(t.get('empty') or 0)
            missed = w + e
            if missed <= 0:
                continue
            potential_net_gain = round(w * (1.0 + wrong_cost) + e * 1.0, 2)
            total_q = c + w + e
            accuracy = round(c / total_q * 100) if total_q else 0
            opportunities.append({
                'section_name': sec_name,
                'color': subject_color(sec_name),
                'topic_name': t_name,
                'correct': c,
                'wrong': w,
                'empty': e,
                'potential_net_gain': potential_net_gain,
                'accuracy_percent': accuracy,
                'hint': (
                    f'{w} yanlış ve {e} boş kapandığında +{potential_net_gain:.2f} net potansiyeli'
                    if w and e
                    else f'{w} yanlış düzeltildiğinde +{potential_net_gain:.2f} net potansiyeli'
                    if w
                    else f'{e} boş çözüldüğünde +{potential_net_gain:.2f} net potansiyeli'
                ),
            })

    opportunities.sort(key=lambda item: (-item['potential_net_gain'], item['accuracy_percent']))
    return opportunities[:6]


def build_student_exam_detail(scope: dict, exam_id: int) -> dict:
    """Tek sınavın tam interaktif analizi."""
    exam, answer = _load_verified_student_answer(scope, exam_id)
    ranking_year = resolve_puan_yili(exam)
    detail = build_student_detail_payload(exam, answer, ranking_year, include_trend=True)

    return {
        'exam_id': exam.id,
        'answer_id': answer.id,
        'exam_name': exam.name,
        'exam_type': exam.exam_type,
        'exam_type_label': detail.get('exam_type_label') or exam.get_exam_type_display(),
        'exam_date': exam.exam_date.isoformat() if exam.exam_date else None,
        'total_net': detail.get('toplam_net', 0),
        'field_net': detail.get('alan_net', 0),
        'net_label': detail.get('net_etiket', 'NET'),
        'score': detail.get('puan', 0),
        'score_types': detail.get('puan_turleri'),
        'total_correct': detail.get('total_correct', 0),
        'total_wrong': detail.get('total_wrong', 0),
        'total_empty': detail.get('total_empty', 0),
        'accuracy_percent': detail.get('dogruluk_orani', 0),
        'kurum_rank': detail.get('kurum_ici_sira'),
        'kurum_total': detail.get('toplam_ogrenci'),
        'kurum_avg_net': detail.get('kurum_avg_net'),
        'sinif_rank': detail.get('sinif_rank'),
        'sinif_total': detail.get('sinif_student_count'),
        'sinif_avg_net': detail.get('sinif_avg_net'),
        'estimated_national_rank': detail.get('tahmini_siralama'),
        'percentile': detail.get('yuzdelik_dilim'),
        'section_details': [
            {
                **sec,
                'color': subject_color(sec.get('section_name') or ''),
            }
            for sec in (detail.get('section_details') or [])
        ],
        'strong_areas': detail.get('strong_areas') or [],
        'weak_areas': detail.get('weak_areas') or [],
        'difficulty': detail.get('difficulty'),
        'topic_blocks': detail.get('topic_blocks') or [],
        'quick_gain_radar': _build_quick_net_gain_radar(detail),
    }


def render_student_exam_karne_pdf(scope: dict, exam_id: int) -> tuple[bytes, str]:
    """Öğrencinin yalnızca kendi sınavı için resmi 3K Karne PDF çıktısını üretir."""
    exam, answer = _load_verified_student_answer(scope, exam_id)
    ranking_year = resolve_puan_yili(exam)
    detail = build_student_detail_payload(exam, answer, ranking_year, include_trend=False)
    return render_karne_pdf(detail), karne_filename(detail)
