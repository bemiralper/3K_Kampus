"""
Öğrenci Portalı — Sınav Analizi, Dijital Sınav Giriş Kartı (Boarding Pass),
En Kolay Net Artışı Radarı, Dönemlik Konu Hakimiyet Isı Haritası ve Karne PDF.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from django.db.models import Exists, F, Max, OuterRef, Q
from django.utils import timezone

from apps.coaching.application.olcme_karne_pdf import karne_filename, render_karne_pdf
from apps.coaching.olcme_degerlendirme.models import Exam, ExamParticipant, StudentAnswer
from apps.coaching.olcme_degerlendirme.services.scoring_settings import resolve_puan_yili
from apps.coaching.olcme_degerlendirme.services.stored_scores import blocks_for_answers
from apps.coaching.olcme_degerlendirme.views.analysis_views import (
    _build_topic_blocks,
    _get_student_alan,
    _mark_alan_inclusion,
    _section_in_alan,
    build_student_detail_payload,
    is_unattempted_optional_section,
)
from apps.coaching.olcme_degerlendirme.views.student_exam_views import _present_answer

from ..auth import ISTANBUL, StudentPortalError
from .schedule_service import (
    resolve_student_classroom,
    resolve_student_schedule_group_readonly,
    session_matches_student_group,
    subject_color,
)

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
    Öğrencinin kendi oturum günü (`ExamParticipant.exam_session.session_date`),
    salon adı, sıra numarası, masa kodu, saat ve geri sayım.
    """
    now_dt = timezone.localtime(timezone.now(), ISTANBUL)
    today = now_dt.date()
    now_hm = now_dt.strftime('%H:%M')
    ogrenci = scope['ogrenci']
    kayit = scope['kayit']
    classroom, _ = resolve_student_classroom(scope)

    parts = list(
        ExamParticipant.objects.select_related('exam', 'room', 'exam_session')
        .filter(
            student_id=ogrenci.id,
            exam__kurum_id=scope['kurum_id'],
            exam__is_active=True,
        )
        .filter(Q(exam__sube_id__isnull=True) | Q(exam__sube_id=scope['sube_id']))
        .filter(
            Q(exam_session__session_date__gte=today)
            | Q(exam_session__session_date__isnull=True, exam__exam_date__gte=today)
        )
    )

    candidates: list[tuple[date, str, str, Exam, object | None, ExamParticipant | None]] = []
    for p in parts:
        ex = p.exam
        sess = p.exam_session
        eff_date = (sess.session_date if (sess and sess.session_date) else ex.exam_date)
        if not eff_date or eff_date < today:
            continue
        start_s = sess.start_time.strftime('%H:%M') if (sess and getattr(sess, 'start_time', None)) else '09:30'
        end_s = sess.end_time.strftime('%H:%M') if (sess and getattr(sess, 'end_time', None)) else ''
        if not end_s:
            eff_dur = (sess.duration_minutes if (sess and sess.duration_minutes) else ex.duration_minutes)
            if eff_dur:
                try:
                    hh, mm = [int(x) for x in start_s.split(':')]
                    end_s = (datetime.combine(eff_date, time(hh, mm)) + timedelta(minutes=int(eff_dur))).strftime('%H:%M')
                except Exception:
                    end_s = ''
        candidates.append((eff_date, start_s, end_s, ex, sess, p))

    # Katılımcı listesi henüz üretilmemiş sınıf sınavları için oturum grubuna göre yedek çözüm
    if not candidates and classroom is not None:
        has_any_participants = ExamParticipant.objects.filter(exam=OuterRef('pk'))
        unrostered = (
            Exam.objects.prefetch_related('exam_sessions')
            .annotate(_has_roster=Exists(has_any_participants))
            .filter(
                kurum_id=scope['kurum_id'],
                is_active=True,
                _has_roster=False,
                siniflar=classroom,
            )
            .filter(Q(sube_id__isnull=True) | Q(sube_id=scope['sube_id']))
            .filter(Q(exam_sessions__session_date__gte=today) | Q(exam_date__gte=today))
            .distinct()
        )
        student_group = None
        for ex in unrostered:
            all_sessions = list(ex.exam_sessions.all())
            if all_sessions:
                if student_group is None:
                    student_group = resolve_student_schedule_group_readonly(scope)
                matched = [
                    s for s in all_sessions
                    if session_matches_student_group(student_group, s.schedule_preference)
                ] or all_sessions
                for sess in matched:
                    eff_date = sess.session_date or ex.exam_date
                    if eff_date and eff_date >= today:
                        start_s = sess.start_time.strftime('%H:%M') if sess.start_time else '09:30'
                        end_s = sess.end_time.strftime('%H:%M') if sess.end_time else ''
                        candidates.append((eff_date, start_s, end_s, ex, sess, None))
            elif ex.exam_date and ex.exam_date >= today:
                candidates.append((ex.exam_date, '09:30', '', ex, None, None))

    if not candidates:
        return None

    candidates.sort(key=lambda c: (c[0], c[1], c[3].id))

    # Bugünkü oturum bittiyse ve sırada başka bir oturum/yarınki sınav varsa onu öne al
    chosen = next(
        (c for c in candidates if c[0] > today or not c[2] or c[2] > now_hm),
        candidates[0],
    )
    eff_date, start_time_str, end_time_str, exam, sess, part = chosen
    eff_duration = (
        sess.duration_minutes
        if (sess and getattr(sess, 'duration_minutes', None))
        else exam.duration_minutes
    )
    days_left = (eff_date - today).days
    return {
        'exam_id': exam.id,
        'exam_name': exam.name,
        'exam_type': exam.exam_type,
        'exam_type_label': exam.get_exam_type_display(),
        'exam_date': eff_date.isoformat(),
        'days_left': days_left,
        'is_today': days_left == 0,
        'start_time': start_time_str,
        'end_time': end_time_str,
        'duration_minutes': eff_duration,
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


EXAM_TYPE_SHORT_LABELS = {
    'YKS_TYT': 'TYT',
    'YKS_AYT': 'AYT',
    'AYT_11': '11. Sınıf AYT',
    'LGS': 'LGS',
    'STS': 'STS / Ara Sınıf',
}


def _short_exam_type_label(exam_type: str, fallback_label: str) -> str:
    if exam_type in EXAM_TYPE_SHORT_LABELS:
        return EXAM_TYPE_SHORT_LABELS[exam_type]
    upper = (exam_type or '').upper()
    if 'TYT' in upper:
        return 'TYT'
    if 'AYT' in upper:
        return 'AYT'
    if 'LGS' in upper:
        return 'LGS'
    return fallback_label


def _build_mastery_heatmap(answers: list[StudentAnswer], alan_kodu: str | None = None) -> list[dict]:
    """
    Son sınavlardaki kazanım/konu performanslarını birleştirerek
    öğrencinin kendi alanına uygun ders bazlı Konu Hakimiyet Isı Haritası üretir.
    """
    recent = answers[-8:]
    agg: dict[tuple[str, str], dict] = {}
    for ans in recent:
        comparison = ans.comparison or {}
        if not comparison:
            continue
        exam = ans.session.exam
        try:
            blocks = _build_topic_blocks(exam, comparison, ans.booklet or '')
        except Exception:
            blocks = []
        for tb in blocks or []:
            sec_name = tb.get('section_name') or 'Genel'
            topics_raw = tb.get('topics') or []
            sec_attempted = sum(int(t.get('correct') or 0) + int(t.get('wrong') or 0) for t in topics_raw)
            if is_unattempted_optional_section({
                'section_name': sec_name,
                'correct': sec_attempted,
                'wrong': 0,
            }):
                continue
            if exam.exam_type in ('YKS_AYT', 'AYT_11') and not _section_in_alan(sec_name, alan_kodu) and sec_attempted == 0:
                continue

            for topic in topics_raw:
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
    type_counts: dict[str, int] = defaultdict(int)
    type_labels: dict[str, str] = {}
    type_order: list[str] = []
    for ans in all_answers:
        ex = ans.session.exam
        type_counts[ex.exam_type] += 1
        if ex.exam_type not in type_labels:
            type_labels[ex.exam_type] = ex.get_exam_type_display()
            type_order.append(ex.exam_type)

    available_types = [
        {
            'code': code,
            'label': type_labels[code],
            'short_label': _short_exam_type_label(code, type_labels[code]),
            'count': type_counts[code],
        }
        for code in type_order
    ]

    recommended_type = ''
    if all_answers:
        # En son girilen sınavın türünü öner (farklı soru sayılı TYT ve AYT tek çizgide karışmasın)
        recommended_type = all_answers[-1].session.exam.exam_type

    filtered_answers = [
        a for a in all_answers
        if not exam_type or a.session.exam.exam_type == exam_type
    ]

    alan_kodu = _get_student_alan(scope['ogrenci'], scope['kayit'].egitim_yili)
    student_session_dates = {
        exam_id: sess_date
        for exam_id, sess_date in ExamParticipant.objects.filter(
            student_id=scope['ogrenci'].id,
            exam_id__in=[a.session.exam_id for a in filtered_answers],
            exam_session__session_date__isnull=False,
        )
        .order_by('exam_session__session_date')
        .values_list('exam_id', 'exam_session__session_date')
    }
    chronological: list[dict] = []

    for ans in filtered_answers:
        exam = ans.session.exam
        fallback_created_date = (
            timezone.localtime(exam.created_at, ISTANBUL).date()
            if getattr(exam, 'created_at', None)
            else None
        )
        eff_exam_date = student_session_dates.get(exam.id) or exam.exam_date or fallback_created_date
        year = resolve_puan_yili(exam)
        block = blocks_for_answers(exam, [ans], year).get(ans.id)
        score_data, ranking_data, _pt, kurum_ici_sira, toplam_ogrenci = _present_answer(
            exam, ans, year, block, alan_kodu=alan_kodu,
        )

        raw_ss_list = list(ans.section_scores.all())
        parent_ids_with_kids = {
            ss.section.parent_section_id
            for ss in raw_ss_list
            if ss.section.is_sub_section and ss.section.parent_section_id
        }
        section_rows = []
        for ss in raw_ss_list:
            q_cnt = int(ss.correct + ss.wrong + ss.empty) or int(ss.section.question_count or 0)
            is_sub = bool(ss.section.is_sub_section)
            is_parent_group = (not is_sub) and (ss.section_id in parent_ids_with_kids)
            section_rows.append({
                'section_id': ss.section_id,
                'section_name': ss.section.name,
                'name': ss.section.name,
                'display_name': f'{ss.section.name} (Toplam)' if is_parent_group else ss.section.name,
                'metric_key': f'grup:{ss.section.name}' if is_parent_group else f'ders:{ss.section.name}',
                'is_sub_section': is_sub,
                'is_parent_group': is_parent_group,
                'parent_id': ss.section.parent_section_id,
                'color': subject_color(ss.section.name),
                'correct': ss.correct,
                'wrong': ss.wrong,
                'empty': ss.empty,
                'question_count': q_cnt,
                'net': round(float(ss.net), 2),
            })

        _mark_alan_inclusion(section_rows, exam.exam_type, alan_kodu)
        sections = []
        for row in section_rows:
            attempted = (row['correct'] + row['wrong']) > 0
            if is_unattempted_optional_section(row):
                row['alana_dahil'] = False
            row['attempted'] = attempted
            row.pop('section_name', None)
            sections.append(row)

        chronological.append({
            'exam_id': exam.id,
            'answer_id': ans.id,
            'exam_name': exam.name,
            'exam_type': exam.exam_type,
            'exam_type_label': exam.get_exam_type_display(),
            'exam_type_short': _short_exam_type_label(exam.exam_type, exam.get_exam_type_display()),
            'exam_date': eff_exam_date.isoformat() if eff_exam_date else None,
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

    chronological.sort(key=lambda item: (item['exam_date'] or '', item['exam_id']))

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
        latest = chronological[-1]
        # Birden fazla sınav türü bir aradaysa ortalama ve kişisel rekoru en son girilen sınav türü üzerinden hesapla
        same_type_items = [c for c in chronological if c['exam_type'] == latest['exam_type']] or chronological
        nets = [c['total_net'] for c in same_type_items]
        scores = [c['score'] for c in same_type_items if c['score'] > 0]
        kpi = {
            'exam_count': len(chronological),
            'same_type_exam_count': len(same_type_items),
            'kpi_type_label': latest['exam_type_short'],
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
        'recommended_type': recommended_type,
        'student_alan': alan_kodu or '',
        'selected_type': exam_type or '',
        'kpi': kpi,
        'trend': chronological,
        'exams': list(reversed(chronological)),
        'mastery_heatmap': _build_mastery_heatmap(filtered_answers or all_answers, alan_kodu=alan_kodu),
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


def _build_quick_net_gain_radar(
    detail_payload: dict,
    *,
    exam_type: str = '',
    alan_kodu: str | None = None,
) -> list[dict]:
    """
    "En Kolay Net Artışı Radarı":
    Öğrencinin kendi sınav alanındaki yanlış/boş bıraktığı ama küçük dokunuşla
    en çok net getirecek öncelikli konuları puanlar.
    """
    opportunities: list[dict] = []
    penalty = float(detail_payload.get('wrong_answer_count') or 4)
    wrong_cost = (1.0 / penalty) if penalty > 0 else 0.0

    for tb in detail_payload.get('topic_blocks') or []:
        sec_name = tb.get('section_name') or 'Ders'
        topics_raw = tb.get('topics') or []
        sec_attempted = sum(int(t.get('correct') or 0) + int(t.get('wrong') or 0) for t in topics_raw)
        if is_unattempted_optional_section({
            'section_name': sec_name,
            'correct': sec_attempted,
            'wrong': 0,
        }):
            continue
        if exam_type in ('YKS_AYT', 'AYT_11') and not _section_in_alan(sec_name, alan_kodu) and sec_attempted == 0:
            continue

        for t in topics_raw:
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
    return opportunities[:8]


def build_student_exam_detail(scope: dict, exam_id: int) -> dict:
    """Tek sınavın tam interaktif analizi."""
    exam, answer = _load_verified_student_answer(scope, exam_id)
    ranking_year = resolve_puan_yili(exam)
    alan_kodu = _get_student_alan(scope['ogrenci'], scope['kayit'].egitim_yili)
    detail = build_student_detail_payload(exam, answer, ranking_year, include_trend=True)

    raw_sections = detail.get('section_details') or []
    parent_ids_with_kids = {
        sec.get('parent_id')
        for sec in raw_sections
        if sec.get('is_sub_section') and sec.get('parent_id') and sec.get('source') != 'tyt'
    }
    enriched_sections = []
    for sec in raw_sections:
        is_opt_unattempted = is_unattempted_optional_section(sec)
        is_parent_group = (not sec.get('is_sub_section')) and (sec.get('section_id') in parent_ids_with_kids)
        enriched_sections.append({
            **sec,
            'color': subject_color(sec.get('section_name') or ''),
            'is_parent_group': is_parent_group,
            'is_optional_unattempted': is_opt_unattempted,
            'alana_dahil': False if is_opt_unattempted else bool(sec.get('alana_dahil', True)),
        })

    fallback_created = (
        timezone.localtime(exam.created_at, ISTANBUL).date().isoformat()
        if getattr(exam, 'created_at', None)
        else None
    )

    return {
        'exam_id': exam.id,
        'answer_id': answer.id,
        'exam_name': exam.name,
        'exam_type': exam.exam_type,
        'exam_type_label': detail.get('exam_type_label') or exam.get_exam_type_display(),
        'exam_type_short': _short_exam_type_label(exam.exam_type, exam.get_exam_type_display()),
        'exam_date': detail.get('session_date') or (exam.exam_date.isoformat() if exam.exam_date else fallback_created),
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
        'section_details': enriched_sections,
        'strong_areas': detail.get('strong_areas') or [],
        'weak_areas': detail.get('weak_areas') or [],
        'difficulty': detail.get('difficulty'),
        'topic_blocks': detail.get('topic_blocks') or [],
        'quick_gain_radar': _build_quick_net_gain_radar(
            detail, exam_type=exam.exam_type, alan_kodu=alan_kodu,
        ),
    }


def render_student_exam_karne_pdf(scope: dict, exam_id: int) -> tuple[bytes, str]:
    """Öğrencinin yalnızca kendi sınavı için resmi 3K Karne PDF çıktısını üretir."""
    exam, answer = _load_verified_student_answer(scope, exam_id)
    ranking_year = resolve_puan_yili(exam)
    detail = build_student_detail_payload(exam, answer, ranking_year, include_trend=False)
    return render_karne_pdf(detail), karne_filename(detail)
