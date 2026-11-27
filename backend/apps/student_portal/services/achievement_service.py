"""
Öğrenci Portalı — Tam Sezon YKS/LGS Başarı Vitrini v2:
- 65+ Kademeli Evrimleşen Rozet (Bronz -> Gümüş -> Altın -> Platin -> Elmas -> Efsane/Mythic)
- Öğrencinin Kendi Alanına (`SAYISAL`, `ESIT_AGIRLIK`, `SOZEL`, `LGS`) Özel Dinamik Deneme & Branş Rozetleri
- Her Ayın 1'inde Yenilenen "Aylık Sezon Meydan Okumaları" ve Kalıcı Sezon Madalyaları
- 50 Seviyeli Yıllık Rütbe Yolu ve KVKK Dostu Şube Haftalık Odak Ligi

Sıfır şema değişikliği (`0` migration):
- Mevcut `study_badge` tablosu ile gerçek LMS verilerini (`WeeklyProgram`,
  `ProgramBlock`, `ManualAssignment`, `AssignmentTask`, `StudentAnswer`,
  `StudentSectionScore`, `StudentStoredScore`, `Campus Attendance`) birleştirir.
- Kazanılan portal rozetleri (`unlocked_portal_badges`), kazanılan aylık sezon
  madalyaları (`monthly_season_medals`), vitrin rozeti (`pinned_badge_code`) ve
  lig gizlilik ayarı (`leaderboard_opt_in`) `StudentPortalAccount.preferences` içinde saklanır.
"""
from __future__ import annotations

import calendar
import re
from collections import defaultdict
from datetime import date, datetime, timedelta

from django.db import transaction
from django.db.models import Max, Sum
from django.utils import timezone

from apps.coaching.assignment_manual.models import AssignmentLesson, AssignmentTask, ManualAssignment
from apps.coaching.olcme_degerlendirme.models import StudentStoredScore
from apps.coaching.olcme_degerlendirme.services.scoring import (
    LGS_EXAM_TYPES,
    _normalize_section_name,
    calculate_lgs_score,
)
from apps.coaching.olcme_degerlendirme.services.scoring_settings import resolve_puan_yili
from apps.coaching.olcme_degerlendirme.views.analysis_views import (
    _get_student_alan,
    _normalize_alan_kodu,
)
from apps.coaching.services.coach_access import user_can_access_student
from apps.coaching.study_program.models import Badge, ProgramBlock, ProgramDay, WeeklyProgram
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit

from ..auth import ISTANBUL, StudentPortalError
from ..models import StudentPortalAccount
from .exam_service import _student_published_answers
from .schedule_service import build_campus_life_and_attendance
from .study_service import _compute_global_streak

TR_MONTH_NAMES = {
    1: 'Ocak',
    2: 'Şubat',
    3: 'Mart',
    4: 'Nisan',
    5: 'Mayıs',
    6: 'Haziran',
    7: 'Temmuz',
    8: 'Ağustos',
    9: 'Eylül',
    10: 'Ekim',
    11: 'Kasım',
    12: 'Aralık',
}

# 9-10 aylık YKS/LGS maratonuna yayılan 50 Seviyeli 10 Rütbe
RANK_TIERS: list[tuple[int, str, str]] = [
    (1, 'Başlangıç Adayı', '🌱'),
    (4, 'Odak Çırağı', '⚡'),
    (8, 'Plan Takipçisi', '🧭'),
    (13, 'Soru Avcısı', '🏹'),
    (19, 'Branş Ustası', '🎯'),
    (25, 'Kampüs Ustası', '🛡️'),
    (32, 'Zirve Koşucusu', '🚀'),
    (39, 'Kampüs Eliti', '💎'),
    (45, 'Türkiye Derece Adayı', '🔥'),
    (50, 'YKS / LGS Efsanesi', '👑'),
]

_ALAN_TO_PT = {'SAYISAL': 'SAY', 'ESIT_AGIRLIK': 'EA', 'SOZEL': 'SOZ'}


def _resolve_level_and_rank(total_xp: int) -> dict:
    """
    50 Seviyeli Yıllık Maraton Eğrisi:
    Seviye 1 -> 0 XP, Seviye 2 -> 150 XP, Seviye 3 -> 345 XP...
    Her seviye için gereken ek XP: `150 + (level - 1) * 45` (Seviye 50 ~ 58.950 XP).
    """
    safe_xp = max(0, int(total_xp))
    level = 1
    floor_xp = 0
    step = 150

    while safe_xp >= floor_xp + step and level < 50:
        floor_xp += step
        level += 1
        step = 150 + (level - 1) * 45

    next_level_xp = floor_xp + step
    in_level_xp = safe_xp - floor_xp
    needed_in_level = max(1, next_level_xp - floor_xp)
    progress_pct = 100 if level >= 50 else min(100, round((in_level_xp / needed_in_level) * 100))

    rank_title = RANK_TIERS[0][1]
    rank_icon = RANK_TIERS[0][2]
    next_rank_title = None
    next_rank_level = None
    for min_lvl, title, icon in RANK_TIERS:
        if level >= min_lvl:
            rank_title = title
            rank_icon = icon
        elif next_rank_title is None:
            next_rank_title = title
            next_rank_level = min_lvl

    return {
        'level': level,
        'max_level': 50,
        'total_xp': safe_xp,
        'current_level_xp': in_level_xp,
        'next_level_xp_span': needed_in_level,
        'xp_to_next_level': 0 if level >= 50 else max(0, next_level_xp - safe_xp),
        'level_progress_percent': progress_pct,
        'rank_title': rank_title,
        'rank_icon': rank_icon,
        'next_rank_title': next_rank_title,
        'next_rank_level': next_rank_level,
    }


def _as_local_date(val) -> date | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        if timezone.is_aware(val):
            return timezone.localtime(val, ISTANBUL).date()
        return val.date()
    if isinstance(val, date):
        return val
    return None


def _mask_peer_name(ad: str, soyad: str) -> str:
    first = (ad or '').strip()
    last = (soyad or '').strip()
    if not first:
        return 'Öğrenci'
    masked_first = f'{first[0].upper()}***'
    masked_last = f'{last[0].upper()}.' if last else ''
    return f'{masked_first} {masked_last}'.strip()


def _detect_is_middle_school(kayit: OgrenciKayit | None, answers: list) -> bool:
    """Öğrencinin sınıf seviyesi (5-8) veya sınav geçmişine göre LGS grubunda olup olmadığını çözer."""
    if kayit is not None:
        seviye_obj = getattr(kayit, 'sinif_seviyesi', None) or (
            getattr(kayit.sinif, 'sinif_seviyesi', None) if getattr(kayit, 'sinif_id', None) else None
        )
        texts = []
        if seviye_obj and getattr(seviye_obj, 'ad', None):
            texts.append(str(seviye_obj.ad))
        if getattr(kayit, 'sinif_id', None) and getattr(kayit.sinif, 'ad', None):
            texts.append(str(kayit.sinif.ad))
        joined = ' '.join(texts).lower()
        if 'lgs' in joined or 'ortaokul' in joined:
            return True
        nums = [int(m) for m in re.findall(r'\b(\d{1,2})\b', joined)]
        if any(5 <= n <= 8 for n in nums) and not any(9 <= n <= 12 for n in nums):
            return True

    if answers:
        exam_types = {a.session.exam.exam_type for a in answers if getattr(a, 'session_id', None)}
        if exam_types and exam_types.issubset(LGS_EXAM_TYPES):
            return True
    return False


def _resolve_student_track_profile(scope: dict, answers: list) -> dict:
    """
    Öğrencinin kendi alanını (`SAYISAL`, `ESIT_AGIRLIK`, `SOZEL`, `LGS` veya `YKS_GENEL`)
    çözer. Sadece kendi kulvarına ait deneme/branş rozetleri üretilir.
    """
    kayit: OgrenciKayit | None = scope.get('kayit')
    ogrenci: Ogrenci = scope['ogrenci']

    alan_kodu = None
    if kayit is not None:
        if getattr(kayit, 'alan_id', None) and kayit.alan:
            alan_kodu = _normalize_alan_kodu(kayit.alan.kod) or _normalize_alan_kodu(kayit.alan.ad)
        if not alan_kodu and getattr(kayit, 'sinif_id', None) and kayit.sinif and getattr(kayit.sinif, 'alan_id', None):
            alan_kodu = (
                _normalize_alan_kodu(kayit.sinif.alan.kod)
                or _normalize_alan_kodu(kayit.sinif.alan.ad)
            )
        if not alan_kodu and getattr(kayit, 'egitim_yili', None):
            alan_kodu = _get_student_alan(ogrenci, kayit.egitim_yili)

    if not alan_kodu and _detect_is_middle_school(kayit, answers):
        return {
            'code': 'LGS',
            'group': 'LGS',
            'label': 'LGS Hazırlık Kulvarı',
            'short_label': 'LGS',
            'tab_label': 'LGS Deneme & Branş',
        }

    if alan_kodu == 'SAYISAL':
        return {
            'code': 'SAYISAL',
            'group': 'YKS',
            'label': 'YKS Sayısal (SAY)',
            'short_label': 'SAY',
            'tab_label': 'SAY Alan & Branş',
        }
    if alan_kodu == 'ESIT_AGIRLIK':
        return {
            'code': 'ESIT_AGIRLIK',
            'group': 'YKS',
            'label': 'YKS Eşit Ağırlık (EA)',
            'short_label': 'EA',
            'tab_label': 'EA Alan & Branş',
        }
    if alan_kodu == 'SOZEL':
        return {
            'code': 'SOZEL',
            'group': 'YKS',
            'label': 'YKS Sözel (SÖZ)',
            'short_label': 'SÖZ',
            'tab_label': 'SÖZ Alan & Branş',
        }

    return {
        'code': 'YKS_GENEL',
        'group': 'YKS',
        'label': 'YKS Ortak (TYT)',
        'short_label': 'TYT',
        'tab_label': 'TYT Deneme & Branş',
    }


def _extract_ayt_sections(section_scores) -> dict[str, float]:
    """
    Bir AYT oturumundaki bölüm netlerini ÖSYM alan anahtarlarına normaller.
    Matematik (30q) + Geometri (10q) ayrı verilmişse 40 soruluk `Matematik` netinde birleştirir.
    """
    by_name: dict[str, float] = {}
    mat_parent = 0.0
    mat_sub = 0.0
    geo_net = 0.0
    mat_parent_q = 0

    for ss in section_scores:
        raw_name = (ss.section.name or '').strip()
        norm = _normalize_section_name(raw_name, context='ayt')
        compact = norm.replace(' ', '').replace('-', '').lower()
        net_val = float(ss.net or 0.0)
        q_cnt = int((ss.correct or 0) + (ss.wrong or 0) + (ss.empty or 0))

        if norm == 'Matematik':
            if net_val > mat_parent:
                mat_parent = net_val
                mat_parent_q = q_cnt
        elif compact in {'matematik2', 'mat2', 'temelmatematik'}:
            mat_sub += net_val
        elif norm == 'Geometri':
            geo_net += net_val
        else:
            by_name[norm] = max(by_name.get(norm, 0.0), net_val)

    if mat_sub > 0 and (mat_sub + geo_net) > mat_parent:
        by_name['Matematik'] = round(mat_sub + geo_net, 2)
    elif geo_net > 0 and mat_parent_q <= 32:
        by_name['Matematik'] = round(mat_parent + geo_net, 2)
    else:
        by_name['Matematik'] = round(mat_parent, 2)

    by_name['Geometri'] = round(geo_net, 2)
    return by_name


def _collect_raw_metrics(scope: dict, today: date) -> dict:
    ogrenci: Ogrenci = scope['ogrenci']
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    month_start = today.replace(day=1)
    last_dom = calendar.monthrange(today.year, today.month)[1]
    month_end = today.replace(day=last_dom)

    # 1. Çalışma programı, seri ve soru metrikleri
    study_badges = {
        b.code: (b.earned_date.isoformat() if b.earned_date else today.isoformat())
        for b in Badge.objects.filter(student_id=ogrenci.id).order_by('earned_date', 'id')
    }

    streak_days = _compute_global_streak(ogrenci.id, today)
    full_days_qs = ProgramDay.objects.filter(
        program__student_id=ogrenci.id,
        program__is_template=False,
        total_block_count__gt=0,
        completion_percent__gte=100,
    )
    full_days_count = full_days_qs.count()
    month_full_days = full_days_qs.filter(day_date__gte=month_start, day_date__lte=month_end).count()

    # Tüm sezon boyunca en uzun kesintisiz seri (365 gün penceresi)
    season_days = list(
        ProgramDay.objects.filter(
            program__student_id=ogrenci.id,
            program__is_template=False,
            day_date__lte=today,
            total_block_count__gt=0,
        )
        .order_by('day_date')
        .values_list('completion_percent', flat=True)[:365]
    )
    best_streak = streak_days
    running = 0
    for pct in season_days:
        if pct >= 100:
            running += 1
            if running > best_streak:
                best_streak = running
        else:
            running = 0

    best_week_pct = (
        WeeklyProgram.objects.filter(student_id=ogrenci.id, is_template=False)
        .aggregate(mx=Max('completion_percent'))['mx']
        or 0
    )
    best_week_questions = (
        WeeklyProgram.objects.filter(student_id=ogrenci.id, is_template=False)
        .aggregate(mx=Max('total_question_count'))['mx']
        or 0
    )

    completed_blocks_qs = ProgramBlock.objects.filter(
        day__program__student_id=ogrenci.id,
        day__program__is_template=False,
        is_completed=True,
    )
    completed_blocks_count = completed_blocks_qs.count()

    total_block_questions = int(completed_blocks_qs.aggregate(s=Sum('question_count'))['s'] or 0)
    week_solved_block_q = int(
        completed_blocks_qs.filter(day__day_date__gte=monday, day__day_date__lte=sunday)
        .aggregate(s=Sum('question_count'))['s']
        or 0
    )
    month_block_questions = int(
        completed_blocks_qs.filter(day__day_date__gte=month_start, day__day_date__lte=month_end)
        .aggregate(s=Sum('question_count'))['s']
        or 0
    )

    # 2. Odak (Pomodoro) metrikleri
    block_focus_rows = list(
        ProgramBlock.objects.filter(
            day__program__student_id=ogrenci.id,
            day__program__is_template=False,
            actual_duration__gt=0,
        ).values('day__day_date', 'actual_duration', 'completed_at')
    )
    hw_task_focus_rows = list(
        AssignmentTask.objects.filter(
            lesson_block__assignment__student_id=ogrenci.id,
            lesson_block__assignment__is_active=True,
            actual_duration_minutes__gt=0,
        ).values('actual_duration_minutes', 'updated_at', 'lesson_block__k3_mode')
    )

    total_focus_minutes = sum(int(r['actual_duration'] or 0) for r in block_focus_rows) + sum(
        int(r['actual_duration_minutes'] or 0) for r in hw_task_focus_rows
    )

    daily_focus_map: dict[date, int] = {}
    month_focus_minutes = 0
    early_bird_hits = 1 if 'ERKEN_KUSU' in study_badges else 0
    night_owl_hits = 0

    for r in block_focus_rows:
        d_val = _as_local_date(r['day__day_date'])
        dur = int(r['actual_duration'] or 0)
        if d_val:
            daily_focus_map[d_val] = daily_focus_map.get(d_val, 0) + dur
            if month_start <= d_val <= month_end:
                month_focus_minutes += dur
        comp_dt = r['completed_at']
        if comp_dt:
            loc = timezone.localtime(comp_dt, ISTANBUL) if timezone.is_aware(comp_dt) else comp_dt
            if loc.hour < 8:
                early_bird_hits += 1
            if loc.hour >= 21 and (loc.hour > 21 or loc.minute >= 30):
                night_owl_hits += 1

    hizlan_focus_count = 0
    tekrarla_focus_count = 0
    for r in hw_task_focus_rows:
        upd = r['updated_at']
        dur = int(r['actual_duration_minutes'] or 0)
        if upd:
            loc = timezone.localtime(upd, ISTANBUL) if timezone.is_aware(upd) else upd
            loc_date = loc.date()
            daily_focus_map[loc_date] = daily_focus_map.get(loc_date, 0) + dur
            if month_start <= loc_date <= month_end:
                month_focus_minutes += dur
            if loc.hour < 8:
                early_bird_hits += 1
            if loc.hour >= 21 and (loc.hour > 21 or loc.minute >= 30):
                night_owl_hits += 1
        k3 = r['lesson_block__k3_mode']
        if k3 == AssignmentLesson.K3Mode.HIZLAN:
            hizlan_focus_count += 1
        elif k3 == AssignmentLesson.K3Mode.TEKRARLA:
            tekrarla_focus_count += 1

    max_single_day_focus = max(daily_focus_map.values(), default=0)

    # 3. Koç Ödev (`ManualAssignment`) & 3K Soru metrikleri
    completed_hw_rows = list(
        ManualAssignment.objects.filter(
            student_id=ogrenci.id,
            is_active=True,
            status=ManualAssignment.Status.COMPLETED,
        )
        .order_by('-completed_date', '-id')
        .values('id', 'completion_percent', 'completed_date', 'due_date', 'non_submission_reason')[:250]
    )
    completed_hw_count = len(completed_hw_rows)
    ontime_full_streak = 0
    best_ontime_hw_streak = 0
    running_hw_streak = 0
    streak_broken = False
    month_completed_hw = 0

    for hw in completed_hw_rows:
        comp_d = hw['completed_date']
        due_d = hw['due_date']
        comp_day = _as_local_date(comp_d)
        due_day = _as_local_date(due_d)
        if comp_day and month_start <= comp_day <= month_end:
            month_completed_hw += 1
        try:
            is_late = bool(comp_d and due_d and comp_d > due_d)
        except TypeError:
            is_late = bool(comp_day and due_day and comp_day > due_day)
        is_clean = (
            not is_late
            and not hw['non_submission_reason']
            and int(hw['completion_percent'] or 0) >= 90
        )
        if is_clean:
            running_hw_streak += 1
            if running_hw_streak > best_ontime_hw_streak:
                best_ontime_hw_streak = running_hw_streak
            if not streak_broken:
                ontime_full_streak += 1
        else:
            streak_broken = True
            running_hw_streak = 0

    evaluated_tasks_qs = AssignmentTask.objects.filter(
        lesson_block__assignment__student_id=ogrenci.id,
        lesson_block__assignment__is_active=True,
        completed_question_count__gt=0,
    )
    total_hw_questions = int(evaluated_tasks_qs.aggregate(s=Sum('completed_question_count'))['s'] or 0)
    week_hw_solved_q = int(
        evaluated_tasks_qs.filter(evaluated_at__date__gte=monday, evaluated_at__date__lte=sunday)
        .aggregate(s=Sum('completed_question_count'))['s']
        or 0
    )
    month_hw_questions = int(
        evaluated_tasks_qs.filter(evaluated_at__date__gte=month_start, evaluated_at__date__lte=month_end)
        .aggregate(s=Sum('completed_question_count'))['s']
        or 0
    )

    total_season_questions = total_block_questions + total_hw_questions
    month_questions = month_block_questions + month_hw_questions
    effective_weekly_questions = max(
        week_solved_block_q + week_hw_solved_q,
        int(best_week_questions),
    )

    # 4. Deneme Sınavı (`StudentAnswer`, `StudentSectionScore`, `StudentStoredScore`) & Alan metrikleri
    answers = _student_published_answers(scope)
    track = _resolve_student_track_profile(scope, answers)
    pt_for_rank = _ALAN_TO_PT.get(track['code'], 'SAY')

    stored_by_ans_id = {
        row.student_answer_id: (row.by_year or {})
        for row in StudentStoredScore.objects.filter(student_answer_id__in=[a.id for a in answers])
    }

    exam_count = len(answers)
    month_exams_count = 0
    max_net_jump = 0.0
    beat_prev_best = False
    max_rising_exam_streak = 0
    best_accuracy_pct = 0.0
    best_kurum_rank: int | None = None

    # Tür bazlı geçmiş (TYT ile AYT netleri birbirine karışmasın!)
    nets_by_type: dict[str, list[float]] = defaultdict(list)

    # YKS - TYT metrikleri
    max_tyt_net = 0.0
    max_tyt_turkce = 0.0
    max_tyt_mat = 0.0
    max_tyt_fen = 0.0
    max_tyt_sosyal = 0.0

    # YKS - AYT alan metrikleri
    max_ayt_say_net = 0.0
    max_ayt_ea_net = 0.0
    max_ayt_soz_net = 0.0
    max_ayt_mat = 0.0
    max_ayt_fizik = 0.0
    max_ayt_kimya = 0.0
    max_ayt_biyoloji = 0.0
    max_ayt_edebiyat = 0.0
    max_ayt_tar1_cog1 = 0.0
    max_ayt_ed_sos1 = 0.0
    max_ayt_sos2 = 0.0
    best_fen_triatlon_parts = 0
    best_ea_balance_parts = 0
    best_soz_full_parts = 0

    # LGS metrikleri
    max_lgs_net = 0.0
    max_lgs_puan = 0.0
    max_lgs_mat = 0.0
    max_lgs_fen = 0.0
    max_lgs_turkce = 0.0

    for ans in answers:
        exam = ans.session.exam
        ex_type = exam.exam_type
        ex_date = _as_local_date(exam.exam_date) or _as_local_date(ans.created_at)
        if ex_date and month_start <= ex_date <= month_end:
            month_exams_count += 1

        net_val = round(float(ans.total_net or 0.0), 2)
        prev_list = nets_by_type[ex_type]
        if prev_list:
            jump = round(net_val - prev_list[-1], 2)
            if jump > max_net_jump:
                max_net_jump = jump
            if net_val > max(prev_list):
                beat_prev_best = True
        prev_list.append(net_val)

        # Yükseliş serisi (aynı sınav türünde arka arkaya artış)
        streak_here = 0
        for j in range(len(prev_list) - 1, 0, -1):
            if prev_list[j] > prev_list[j - 1]:
                streak_here += 1
            else:
                break
        if streak_here > max_rising_exam_streak:
            max_rising_exam_streak = streak_here

        # Keskin Nişancı isabet oranı (en az 50 soru işaretlenmişse)
        attempted = int(ans.total_correct or 0) + int(ans.total_wrong or 0)
        if attempted >= 50:
            acc = round((int(ans.total_correct or 0) / attempted) * 100, 1)
            if acc > best_accuracy_pct:
                best_accuracy_pct = acc

        # Kurum içi sıra & kayıtlı puan (`StudentStoredScore` üzerinden 0 maliyetle)
        year_key = str(int(resolve_puan_yili(exam)))
        by_year = stored_by_ans_id.get(ans.id) or {}
        year_block = by_year.get(year_key) or (next(iter(by_year.values()), {}) if by_year else {})
        if isinstance(year_block, dict):
            if ex_type in ('YKS_AYT', 'AYT_11'):
                sira = (year_block.get('ranks') or {}).get(pt_for_rank) or year_block.get('kurum_ici_sira')
            else:
                sira = year_block.get('kurum_ici_sira')
            if isinstance(sira, int) and sira >= 1:
                if best_kurum_rank is None or sira < best_kurum_rank:
                    best_kurum_rank = sira

        sec_scores = list(ans.section_scores.all())

        # A) LGS Branş & Puan Analizi
        if ex_type in LGS_EXAM_TYPES:
            max_lgs_net = max(max_lgs_net, net_val)
            sec_dict = {}
            for ss in sec_scores:
                s_name = (ss.section.name or '').strip()
                s_net = round(float(ss.net or 0.0), 2)
                sec_dict[s_name] = s_net
                low = s_name.lower()
                if 'matematik' in low:
                    max_lgs_mat = max(max_lgs_mat, s_net)
                elif 'fen' in low:
                    max_lgs_fen = max(max_lgs_fen, s_net)
                elif 'türkçe' in low or 'turkce' in low:
                    max_lgs_turkce = max(max_lgs_turkce, s_net)

            stored_puan = float((year_block or {}).get('puan') or 0.0) if isinstance(year_block, dict) else 0.0
            if stored_puan <= 0 and sec_dict:
                kind = 'LGS_7' if ex_type == 'LGS_7' else 'LGS'
                stored_puan = float(calculate_lgs_score(sec_dict, kind=kind).get('puan') or 0.0)
            max_lgs_puan = max(max_lgs_puan, round(stored_puan, 1))

        # B) YKS AYT Alan & Branş Analizi
        elif ex_type in ('YKS_AYT', 'AYT_11'):
            ayt_map = _extract_ayt_sections(sec_scores)
            mat_n = ayt_map.get('Matematik', 0.0)
            fiz_n = ayt_map.get('Fizik', 0.0)
            kim_n = ayt_map.get('Kimya', 0.0)
            bio_n = ayt_map.get('Biyoloji', 0.0)
            edeb_n = ayt_map.get('Edebiyat', 0.0)
            tar1_n = ayt_map.get('Tarih-1', 0.0)
            cog1_n = ayt_map.get('Coğrafya-1', 0.0)
            tar2_n = ayt_map.get('Tarih-2', 0.0)
            cog2_n = ayt_map.get('Coğrafya-2', 0.0)
            fel_n = ayt_map.get('Felsefe Grubu', 0.0)
            dkab_n = ayt_map.get('DKAB', 0.0)

            say_total = round(mat_n + fiz_n + kim_n + bio_n, 2)
            tar1_cog1 = round(tar1_n + cog1_n, 2)
            ed_sos1 = round(edeb_n + tar1_cog1, 2)
            ea_total = round(mat_n + ed_sos1, 2)
            sos2_total = round(tar2_n + cog2_n + fel_n + dkab_n, 2)
            soz_total = round(ed_sos1 + sos2_total, 2)

            max_ayt_mat = max(max_ayt_mat, mat_n)
            max_ayt_fizik = max(max_ayt_fizik, fiz_n)
            max_ayt_kimya = max(max_ayt_kimya, kim_n)
            max_ayt_biyoloji = max(max_ayt_biyoloji, bio_n)
            max_ayt_edebiyat = max(max_ayt_edebiyat, edeb_n)
            max_ayt_tar1_cog1 = max(max_ayt_tar1_cog1, tar1_cog1)
            max_ayt_ed_sos1 = max(max_ayt_ed_sos1, ed_sos1)
            max_ayt_sos2 = max(max_ayt_sos2, sos2_total)

            max_ayt_say_net = max(max_ayt_say_net, say_total)
            max_ayt_ea_net = max(max_ayt_ea_net, ea_total)
            max_ayt_soz_net = max(max_ayt_soz_net, soz_total)

            fen_parts = (1 if fiz_n >= 12 else 0) + (1 if kim_n >= 11 else 0) + (1 if bio_n >= 11 else 0)
            best_fen_triatlon_parts = max(best_fen_triatlon_parts, fen_parts)

            ea_parts = (1 if mat_n >= 30 else 0) + (1 if ed_sos1 >= 32 else 0)
            best_ea_balance_parts = max(best_ea_balance_parts, ea_parts)

            soz_parts = (1 if ed_sos1 >= 34 else 0) + (1 if sos2_total >= 34 else 0)
            best_soz_full_parts = max(best_soz_full_parts, soz_parts)

        # C) YKS TYT & Genel Deneme Analizi
        elif ex_type in ('YKS_TYT', 'TYT_11', 'DENEME', 'KURUM_ICI'):
            max_tyt_net = max(max_tyt_net, net_val)
            for ss in sec_scores:
                norm_tyt = _normalize_section_name(ss.section.name or '', context='tyt')
                s_net = round(float(ss.net or 0.0), 2)
                if norm_tyt == 'Türkçe':
                    max_tyt_turkce = max(max_tyt_turkce, s_net)
                elif norm_tyt == 'Temel Matematik':
                    max_tyt_mat = max(max_tyt_mat, s_net)
                elif norm_tyt == 'Fen Bilimleri':
                    max_tyt_fen = max(max_tyt_fen, s_net)
                elif norm_tyt == 'Sosyal Bilimler':
                    max_tyt_sosyal = max(max_tyt_sosyal, s_net)

    campus = build_campus_life_and_attendance(scope)
    att_total = int(campus['attendance']['total_records'] or 0)
    att_rate = float(campus['attendance']['rate_percent'] or 0.0)

    return {
        'today': today,
        'track': track,
        'study_badges': study_badges,
        'streak_days': streak_days,
        'best_streak': max(streak_days, best_streak),
        'full_days_count': full_days_count,
        'best_week_pct': int(best_week_pct),
        'effective_weekly_questions': effective_weekly_questions,
        'total_season_questions': total_season_questions,
        'completed_blocks_count': completed_blocks_count,
        'total_focus_minutes': total_focus_minutes,
        'max_single_day_focus': max_single_day_focus,
        'early_bird_hits': early_bird_hits,
        'night_owl_hits': night_owl_hits,
        'completed_hw_count': completed_hw_count,
        'ontime_full_streak': max(ontime_full_streak, best_ontime_hw_streak),
        'hizlan_focus_count': hizlan_focus_count,
        'tekrarla_focus_count': tekrarla_focus_count,
        'exam_count': exam_count,
        'max_net_jump': round(max_net_jump, 2),
        'beat_prev_best': beat_prev_best,
        'max_rising_exam_streak': max_rising_exam_streak,
        'best_accuracy_pct': round(best_accuracy_pct, 1),
        'best_kurum_rank': best_kurum_rank,
        # TYT
        'max_tyt_net': round(max_tyt_net, 2),
        'max_tyt_turkce': round(max_tyt_turkce, 2),
        'max_tyt_mat': round(max_tyt_mat, 2),
        'max_tyt_fen': round(max_tyt_fen, 2),
        'max_tyt_sosyal': round(max_tyt_sosyal, 2),
        # AYT
        'max_ayt_say_net': round(max_ayt_say_net, 2),
        'max_ayt_ea_net': round(max_ayt_ea_net, 2),
        'max_ayt_soz_net': round(max_ayt_soz_net, 2),
        'max_ayt_mat': round(max_ayt_mat, 2),
        'max_ayt_fizik': round(max_ayt_fizik, 2),
        'max_ayt_kimya': round(max_ayt_kimya, 2),
        'max_ayt_biyoloji': round(max_ayt_biyoloji, 2),
        'max_ayt_edebiyat': round(max_ayt_edebiyat, 2),
        'max_ayt_tar1_cog1': round(max_ayt_tar1_cog1, 2),
        'max_ayt_ed_sos1': round(max_ayt_ed_sos1, 2),
        'max_ayt_sos2': round(max_ayt_sos2, 2),
        'best_fen_triatlon_parts': best_fen_triatlon_parts,
        'best_ea_balance_parts': best_ea_balance_parts,
        'best_soz_full_parts': best_soz_full_parts,
        # LGS
        'max_lgs_net': round(max_lgs_net, 2),
        'max_lgs_puan': round(max_lgs_puan, 1),
        'max_lgs_mat': round(max_lgs_mat, 2),
        'max_lgs_fen': round(max_lgs_fen, 2),
        'max_lgs_turkce': round(max_lgs_turkce, 2),
        # Yoklama
        'att_total': att_total,
        'att_rate': round(att_rate, 1),
        # Aylık Sezon (her ayın 1'inde sıfırlanan metrikler)
        'month_key': f'{today.year:04d}-{today.month:02d}',
        'month_label': f"{TR_MONTH_NAMES[today.month]} {today.year}",
        'month_days_remaining': max(0, (month_end - today).days),
        'month_focus_minutes': month_focus_minutes,
        'month_questions': month_questions,
        'month_discipline_units': month_full_days + (month_completed_hw * 3),
        'month_exams_count': month_exams_count,
    }


def _build_monthly_season(
    metrics: dict,
    season_medals_history: dict[str, dict],
    today_iso: str,
) -> tuple[dict, bool, list[dict]]:
    """
    Her ayın 1'inde yenilenen 4 Aylık Meydan Okuma (Sezon Görevi).
    4 görevin en az 3'ünü tamamlayan öğrenci kalıcı Ayın Sezon Şampiyonu madalyasını (+350 XP) kazanır!
    """
    month_key = metrics['month_key']
    month_label = metrics['month_label']

    def _quest(code: str, icon: str, title: str, desc: str, current: int, target: int, unit: str) -> dict:
        done = current >= target
        shown = min(target, max(0, int(current)))
        pct = 100 if done else min(99, round((shown / max(1, target)) * 100))
        return {
            'code': f'{month_key}_{code}',
            'icon': icon,
            'title': title,
            'description': desc,
            'current_value': shown,
            'target_value': target,
            'remaining_value': 0 if done else max(0, target - shown),
            'unit': unit,
            'progress_percent': pct,
            'is_completed': done,
        }

    quests = [
        _quest(
            'ODAK',
            '⏱️',
            f'{month_label} Odak Maratonu',
            'Bu ay toplam 30 saat (1.800 dk) odak sayacıyla çalış.',
            metrics['month_focus_minutes'],
            1800,
            'dk',
        ),
        _quest(
            'SORU',
            '🏹',
            f'{month_label} Soru Avcısı',
            'Bu ay çalışma planı ve ödevlerde toplam 2.500 soru çöz.',
            metrics['month_questions'],
            2500,
            'soru',
        ),
        _quest(
            'DISIPLIN',
            '🔥',
            f'{month_label} Disiplin Yıldızı',
            'Bu ay 12 disiplin puanı topla (her eksiksiz gün +1, her tam koç ödevi +3).',
            metrics['month_discipline_units'],
            12,
            'puan',
        ),
        _quest(
            'DENEME',
            '🧭',
            f'{month_label} Deneme Hamlesi',
            'Bu ay en az 2 kurumsal deneme sınavına katıl.',
            metrics['month_exams_count'],
            2,
            'deneme',
        ),
    ]

    completed_count = sum(1 for q in quests if q['is_completed'])
    already_medal = season_medals_history.get(month_key)
    medal_unlocked = bool(already_medal or completed_count >= 3)
    dirty_medal = False
    newly_minted_season: list[dict] = []

    if medal_unlocked and not already_medal:
        medal_title = f'{month_label} Sezon Şampiyonu'
        season_medals_history[month_key] = {
            'month_key': month_key,
            'title': medal_title,
            'icon': '🏅',
            'earned_at': today_iso,
            'completed_quests': completed_count,
            'xp_reward': 350,
        }
        dirty_medal = True
        newly_minted_season.append({
            'id': abs(hash(f'SEASON_{month_key}')) % 100000,
            'badge_type': f'SEASON_{month_key}',
            'title': medal_title,
            'description': f'{month_label} ayındaki sezon görevlerini başarıyla tamamladın!',
            'icon': '🏅',
            'earned_at': today_iso,
            'week_start': None,
        })

    earned_medals = sorted(
        list(season_medals_history.values()),
        key=lambda m: str(m.get('month_key') or ''),
        reverse=True,
    )

    payload = {
        'month_key': month_key,
        'month_label': month_label,
        'days_remaining': metrics['month_days_remaining'],
        'required_quests_for_medal': 3,
        'completed_quests_count': completed_count,
        'total_quests_count': len(quests),
        'season_medal_xp': 350,
        'season_medal_unlocked': medal_unlocked,
        'season_medal_title': f'{month_label} Sezon Şampiyonu',
        'quests': quests,
        'earned_medals': earned_medals,
    }
    return payload, dirty_medal, newly_minted_season


def _build_catalog(metrics: dict, unlocked_history: dict[str, str], today_iso: str) -> list[dict]:
    sb = metrics['study_badges']
    track = metrics['track']
    track_code = track['code']
    track_cat_label = track['tab_label']

    def _entry(
        *,
        code: str,
        category: str,
        category_label: str,
        rarity: str,
        xp_reward: int,
        icon: str,
        title: str,
        description: str,
        current: float,
        target: float,
        unit: str,
        hint_when_locked: str,
        force_unlocked: bool = False,
        tier_group: str | None = None,
        tier_level: int | None = None,
        tier_total: int | None = None,
        tier_label: str | None = None,
        track_badge_label: str | None = None,
    ) -> dict:
        already_earned_date = sb.get(code) or unlocked_history.get(code)
        is_unlocked = bool(force_unlocked or already_earned_date or current >= target)
        shown_current = target if is_unlocked else min(target, max(0.0, float(current)))
        pct = 100 if is_unlocked else min(99, round((shown_current / max(1.0, float(target))) * 100))
        remaining = max(0.0, round(float(target) - shown_current, 1))
        remaining_disp = int(remaining) if float(remaining).is_integer() else remaining
        curr_disp = int(shown_current) if float(shown_current).is_integer() else round(shown_current, 1)
        targ_disp = int(target) if float(target).is_integer() else target

        return {
            'code': code,
            'category': category,
            'category_label': category_label,
            'rarity': rarity,
            'xp_reward': xp_reward,
            'icon': icon,
            'title': title,
            'description': description,
            'is_unlocked': is_unlocked,
            'earned_at': already_earned_date or (today_iso if is_unlocked else None),
            'current_value': curr_disp,
            'target_value': targ_disp,
            'remaining_value': 0 if is_unlocked else remaining_disp,
            'unit': unit,
            'progress_percent': pct,
            'motivation_text': (
                'Kazanıldı! Koleksiyonunda parlıyor.'
                if is_unlocked
                else hint_when_locked.format(remaining=remaining_disp, current=curr_disp, target=targ_disp)
            ),
            'tier_group': tier_group,
            'tier_level': tier_level,
            'tier_total': tier_total,
            'tier_label': tier_label,
            'is_active_tier': True,
            'track_badge_label': track_badge_label,
        }

    def _chain(
        *,
        group_code: str,
        category: str,
        category_label: str,
        current: float,
        unit: str,
        steps: list[tuple[str, str, str, int, str, str, str, float, str]],
        track_badge_label: str | None = None,
    ) -> list[dict]:
        """
        `steps`: [(code, tier_label, rarity, xp, icon, title, desc, target, hint), ...]
        """
        total = len(steps)
        out = []
        for idx, (code, t_label, rarity, xp, icon, title, desc, target, hint) in enumerate(steps, start=1):
            out.append(
                _entry(
                    code=code,
                    category=category,
                    category_label=category_label,
                    rarity=rarity,
                    xp_reward=xp,
                    icon=icon,
                    title=title,
                    description=desc,
                    current=current,
                    target=target,
                    unit=unit,
                    hint_when_locked=hint,
                    tier_group=group_code,
                    tier_level=idx,
                    tier_total=total,
                    tier_label=t_label,
                    track_badge_label=track_badge_label,
                )
            )
        return out

    catalog: list[dict] = []

    # ═══════════════════════════════════════════════════════════════════════════
    # 1. İSTİKRAR & SERİ (Tüm Sezona Yayılan 13 Rozet)
    # ═══════════════════════════════════════════════════════════════════════════
    catalog.extend(
        _chain(
            group_code='FULL_DAYS_CHAIN',
            category='streak',
            category_label='İstikrar & Seri',
            current=metrics['full_days_count'],
            unit='gün',
            steps=[
                ('EKSIKSIZ_GUN', 'Bronz', 'common', 50, '⚡', 'İlk Kıvılcım (1 Eksiksiz Gün)', 'Bir günün tüm çalışma görevlerini %100 tamamla.', 1, 'Bugünkü görevlerinin tamamını bitirdiğinde anında açılır!'),
                ('EKSIKSIZ_GUN_15', 'Gümüş', 'rare', 150, '🌟', '15 Eksiksiz Gün', 'Toplam 15 farklı günde günlük planını %100 bitir.', 15, '15 eksiksiz güne ulaşmak için {remaining} tam gün kaldı!'),
                ('EKSIKSIZ_GUN_45', 'Altın', 'epic', 300, '🏅', '45 Eksiksiz Gün Ustası', 'Dönem boyunca toplam 45 günü %100 tamamlamayla kapat.', 45, '{remaining} eksiksiz gün daha tamamladığında Altın kademe senin!'),
                ('EKSIKSIZ_GUN_100', 'Elmas', 'legendary', 550, '💎', '100 Eksiksiz Gün (Yüzler Kulübü)', 'Sınav maratonunda tam 100 günü eksiksiz tamamla.', 100, 'Yüzler Kulübü’ne {remaining} eksiksiz gün kaldı ({current}/{target}).'),
                ('EKSIKSIZ_GUN_180', 'Efsane', 'mythic', 950, '👑', '180 Eksiksiz Gün (Tam Sezon Hakimi)', 'YKS/LGS maratonunda 180 tam günü %100 başarıyla kapat.', 180, 'Tam Sezon Efsanesi olmaya {remaining} gün kaldı!'),
            ],
        )
    )

    catalog.extend(
        _chain(
            group_code='STREAK_CHAIN',
            category='streak',
            category_label='İstikrar & Seri',
            current=metrics['best_streak'],
            unit='gün',
            steps=[
                ('SERI_3', 'Bronz', 'common', 90, '🔥', '3 Günlük Ateş', 'Arka arkaya 3 gün çalışma planını eksiksiz tamamla.', 3, 'Açmak için sadece {remaining} eksiksiz gün kaldı!'),
                ('SERI_5', 'Gümüş', 'rare', 140, '💥', '5 Gün Ritim Ustası', '5 gün boyunca seriyi hiç bozmadan hedeflerini bitir.', 5, '{remaining} gün daha dayanırsan Ritim Ustası rozeti senin!'),
                ('SERI_7', 'Altın', 'epic', 220, '🛡️', '7 Gün Demir İrade', 'Tam 1 hafta boyunca her gün %100 tamamlama serisi yakala.', 7, 'Demir İrade için {remaining} gün daha seriyi koru!'),
                ('SERI_14', 'Platin', 'legendary', 400, '⚔️', '14 Gün Kampüs Savaşçısı', '2 hafta aralıksız tüm günlük planlarını eksiksiz tamamla.', 14, '14 günlük seriye {remaining} gün kaldı ({current}/{target}).'),
                ('SERI_30', 'Elmas', 'legendary', 680, '💎', '30 Gün Çelik Disiplin', 'Tam 1 ay boyunca tek bir gün bile aksatmadan seriyi koru.', 30, '30 günlük Çelik Disiplin kilidine {remaining} gün kaldı!'),
                ('SERI_60', 'Usta', 'mythic', 1000, '🌋', '60 Gün Durdurulamaz', '2 ay boyunca aralıksız %100 günlük plan serisi yakala.', 60, '60 günlük efsanevi seriye {remaining} gün kaldı!'),
                ('SERI_100', 'Efsane', 'mythic', 1500, '👑', '100 Gün Maraton Efsanesi', '100 gün kesintisiz çalışma serisiyle adını zirveye yazdır.', 100, '100 Günlük Efsane seriye {remaining} gün kaldı!'),
            ],
        )
    )

    catalog.append(
        _entry(
            code='HAFTA_SAMPIYONU',
            category='streak',
            category_label='İstikrar & Seri',
            rarity='epic',
            xp_reward=200,
            icon='🏆',
            title='Hafta Şampiyonu (%90+)',
            description='Haftalık çalışma programını en az %90 oranında tamamla.',
            current=metrics['best_week_pct'],
            target=90,
            unit='%',
            hint_when_locked='Haftalık tamamlamada %{target} hedefine %{remaining} kaldı!',
        )
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # 2. ODAK & SORU MARATONU (500 Saate ve 100.000 Soruya Uzanan 18 Rozet)
    # ═══════════════════════════════════════════════════════════════════════════
    catalog.append(
        _entry(
            code='ERKEN_KUSU',
            category='focus',
            category_label='Odak & Maraton',
            rarity='rare',
            xp_reward=100,
            icon='🌅',
            title='Erken Kuşu',
            description='Sabah 08:00’den önce bir odak oturumunu tamamla.',
            current=metrics['early_bird_hits'],
            target=1,
            unit='oturum',
            hint_when_locked='Sabah 08:00 öncesi ilk Pomodoro’nu bitirdiğinde açılır!',
        )
    )
    catalog.append(
        _entry(
            code='GECE_BAYKUSU',
            category='focus',
            category_label='Odak & Maraton',
            rarity='rare',
            xp_reward=100,
            icon='🦉',
            title='Gece Baykuşu',
            description='Akşam 21:30’dan sonra odak sayacıyla görev tamamla.',
            current=metrics['night_owl_hits'],
            target=1,
            unit='oturum',
            hint_when_locked='21:30 sonrası bir akşam odak oturumuyla kilidi kır!',
        )
    )

    catalog.extend(
        _chain(
            group_code='DAILY_FOCUS_CHAIN',
            category='focus',
            category_label='Odak & Maraton',
            current=metrics['max_single_day_focus'],
            unit='dk',
            steps=[
                ('DERIN_ODAK_120', 'Bronz', 'rare', 150, '🧘', 'Derin Odak (120 dk/gün)', 'Tek bir günde toplam 2 saat (120 dk) kayıtlı odak süresine ulaş.', 120, 'Bir günde 120 dk odak hedefine {remaining} dk kaldı!'),
                ('DERIN_ODAK_240', 'Altın', 'epic', 300, '🔥', 'Tam Kamp Günü (240 dk/gün)', 'Tek bir günde tam 4 saat (240 dk) odaklanarak çalış.', 240, 'En yüksek günün {current} dk · 4 saatlik kampa {remaining} dk kaldı!'),
                ('DERIN_ODAK_360', 'Efsane', 'legendary', 520, '⚡', 'Ultra Kamp (360 dk/gün)', 'Tek bir günde 6 saat (360 dk) kayıtlı odak barajını aş.', 360, '6 saatlik Ultra Kamp rekoruna {remaining} dk kaldı!'),
            ],
        )
    )

    catalog.extend(
        _chain(
            group_code='TOTAL_FOCUS_CHAIN',
            category='focus',
            category_label='Odak & Maraton',
            current=metrics['total_focus_minutes'],
            unit='dk',
            steps=[
                ('ODAK_500', 'Bronz', 'common', 200, '⏱️', '500 Dakika Kulübü (~8 Saat)', 'Portalda toplam 500 dakika odaklanarak çalış.', 500, '500 Dakika Kulübü’ne girmene {remaining} dk kaldı!'),
                ('ODAK_1500', 'Gümüş', 'rare', 380, '🧭', '25 Saat Odak (1.500 dk)', 'Toplam 25 saat (1.500 dk) odaklanmış çalışma barajını aş.', 1500, '25 saatlik odak hedefine {remaining} dk kaldı!'),
                ('ODAK_3000', 'Altın', 'epic', 550, '🛡️', '50 Saat Odak Savaşçısı (3.000 dk)', 'Toplam 50 saat (3.000 dk) kayıtlı odak süresini tamamla.', 3000, '50 saatlik Altın kademeye {remaining} dk kaldı!'),
                ('ODAK_6000', 'Platin', 'legendary', 800, '💎', '100 Saat Odak Ustası (6.000 dk)', 'Toplam 100 saat (6.000 dk) odaklanarak büyük barajı devir.', 6000, '100 Saat Kulübü’ne {remaining} dk kaldı!'),
                ('ODAK_15000', 'Elmas', 'mythic', 1200, '🚀', '250 Saat Maraton Eliti (15.000 dk)', 'Dönem boyunca tam 250 saat (15.000 dk) odaklan.', 15000, '250 Saatlik Elmas zirveye {remaining} dk kaldı!'),
                ('ODAK_30000', 'Efsane', 'mythic', 1800, '👑', '500 Saat YKS/LGS Efsanesi (30.000 dk)', 'Sınav maratonunda 500 saat (30.000 dk) odak barajına ulaş.', 30000, '500 Saatlik Efsane ünvanına {remaining} dk kaldı!'),
            ],
        )
    )

    catalog.extend(
        _chain(
            group_code='WEEKLY_QUESTION_CHAIN',
            category='focus',
            category_label='Odak & Maraton',
            current=metrics['effective_weekly_questions'],
            unit='soru',
            steps=[
                ('SORU_AVCISI', 'Bronz', 'rare', 220, '🏹', 'Haftalık Soru Avcısı (500+)', 'Bir haftada toplam 500 soru barajını geç.', 500, 'Bir haftada 500 soru için {remaining} soru kaldı!'),
                ('HAFTALIK_SORU_1000', 'Altın', 'epic', 380, '🎯', 'Haftalık 1.000 Soru Temposu', 'Tek bir haftada toplam 1.000 soru çözerek vites yükselt.', 1000, 'Haftalık 1.000 soru barajına {remaining} soru kaldı!'),
                ('HAFTALIK_SORU_1750', 'Efsane', 'legendary', 600, '🔥', 'Haftalık 1.750 Soru Fırtınası', 'Tek bir haftada 1.750 soru çözerek kamp temposuna çık.', 1750, '1.750 soruluk haftalık fırtınaya {remaining} soru kaldı!'),
            ],
        )
    )

    catalog.extend(
        _chain(
            group_code='SEASON_QUESTIONS_CHAIN',
            category='focus',
            category_label='Odak & Maraton',
            current=metrics['total_season_questions'],
            unit='soru',
            steps=[
                ('SEZON_SORU_1K', 'Bronz', 'common', 150, '✏️', '1.000 Soru Başlangıcı', 'Dönem boyunca toplam 1.000 çözülmüş soruya ulaş.', 1000, 'İlk 1.000 soru barajına {remaining} soru kaldı!'),
                ('SEZON_SORU_5K', 'Gümüş', 'rare', 300, '📘', '5.000 Soru Kulübü', 'Dönem boyunca toplam 5.000 soru barajını devir.', 5000, '5.000 Soru Kulübü’ne {remaining} soru kaldı!'),
                ('SEZON_SORU_15K', 'Altın', 'epic', 500, '⚔️', '15.000 Soru Savaşçısı', 'Dönem boyunca toplam 15.000 soru çöz.', 15000, '15.000 soru barajına {remaining} soru kaldı!'),
                ('SEZON_SORU_30K', 'Platin', 'legendary', 750, '🛡️', '30.000 Soru Ustası', 'Sınav yolculuğunda 30.000 soru barajını geride bırak.', 30000, '30.000 soru hedefine {remaining} soru kaldı!'),
                ('SEZON_SORU_60K', 'Elmas', 'mythic', 1100, '💎', '60.000 Soru Derece Temposu', 'Dönem genelinde 60.000 soru çözerek derece ritmini yakala.', 60000, '60.000 soru zirvesine {remaining} soru kaldı!'),
                ('SEZON_SORU_100K', 'Efsane', 'mythic', 1650, '👑', '100.000 Soru Efsanesi', 'Tam 100.000 soru çözerek sezonun en büyük maraton kilidini kır!', 100000, '100.000 Soru Efsanesi olmaya {remaining} soru kaldı!'),
            ],
        )
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # 3. KOÇ ÖDEV & 3K DİSİPLİNİ (12 Rozet)
    # ═══════════════════════════════════════════════════════════════════════════
    catalog.extend(
        _chain(
            group_code='HOMEWORK_COUNT_CHAIN',
            category='homework',
            category_label='Koç Ödev & 3K',
            current=metrics['completed_hw_count'],
            unit='ödev',
            steps=[
                ('ILK_ODEV_ZAFERI', 'Bronz', 'common', 80, '📕', 'İlk Ödev Zaferi', 'Koçunun atadığı ilk ödev kontrolünü başarıyla tamamla.', 1, 'İlk koç ödev kontrolün tamamlandığında açılır!'),
                ('ODEV_5', 'Gümüş', 'rare', 180, '📗', '5 Koç Ödevi Tamam', 'Toplam 5 koç ödevini kontrol sürecinden başarıyla geçir.', 5, '5 ödev hedefine {remaining} ödev kaldı!'),
                ('ODEV_12', 'Altın', 'epic', 320, '📘', '12 Koç Ödevi İstikrarı', 'Dönem içinde 12 koç ödevini tamamla.', 12, '12 ödev barajına {remaining} ödev kaldı!'),
                ('ODEV_25', 'Platin', 'legendary', 520, '📙', '25 Koç Ödevi Sadakati', '25 koç ödevini tamamlayarak örnek disiplin sergile.', 25, '25 ödev kademesine {remaining} ödev kaldı!'),
                ('ODEV_45', 'Efsane', 'mythic', 850, '👑', '45 Koç Ödevi (Tam Sezon Disiplini)', 'Sınav sezonunda tam 45 koç ödevini eksiksiz kapat.', 45, 'Tam Sezon Ödev Efsanesi olmaya {remaining} ödev kaldı!'),
            ],
        )
    )

    catalog.extend(
        _chain(
            group_code='ONTIME_HW_CHAIN',
            category='homework',
            category_label='Koç Ödev & 3K',
            current=metrics['ontime_full_streak'],
            unit='ödev',
            steps=[
                ('SIFIR_ROTAR_3', 'Bronz', 'epic', 240, '🎯', 'Sıfır Rötar (3/3 Ödev)', 'Üst üste 3 koç ödevini geciktirmeden %90+ başarıyla teslim et.', 3, 'Sıfır Rötar serisi için {remaining} eksiksiz ödev kaldı!'),
                ('SIFIR_ROTAR_7', 'Altın', 'legendary', 460, '⚡', 'Sıfır Rötar (7/7 Kusursuz Seri)', 'Üst üste 7 koç ödevini gecikmesiz ve %90+ başarıyla bitir.', 7, '7/7 kusursuz seri için {remaining} ödev kaldı!'),
                ('SIFIR_ROTAR_15', 'Efsane', 'mythic', 800, '💎', 'Sıfır Rötar (15/15 Demir Söz)', 'Üst üste 15 koç ödevinde tek bir gecikme bile yaşama.', 15, '15/15 Demir Söz serisine {remaining} ödev kaldı!'),
            ],
        )
    )

    catalog.extend(
        _chain(
            group_code='K3_HIZLAN_CHAIN',
            category='homework',
            category_label='Koç Ödev & 3K',
            current=metrics['hizlan_focus_count'],
            unit='test',
            steps=[
                ('HIZ_USTASI_3K', 'Bronz', 'rare', 160, '⚡', '3K Hız Ustası (3 Test)', '3K HIZLAN modlu 3 testi odak sayacıyla bitir.', 3, 'HIZLAN modlu {remaining} testi daha odak sayacıyla çöz!'),
                ('HIZ_USTASI_3K_10', 'Altın', 'epic', 320, '🚀', '3K Kronometre Hakimi (10 Test)', '3K HIZLAN modlu 10 testi odak sayacıyla tamamla.', 10, 'Kronometre Hakimi olmak için {remaining} HIZLAN testi kaldı!'),
                ('HIZ_USTASI_3K_25', 'Efsane', 'legendary', 550, '🏎️', '3K Süre Şampiyonu (25 Test)', '3K HIZLAN modlu 25 testi odak sayacıyla bitirerek hızını kanıtla.', 25, '25 HIZLAN testi hedefine {remaining} test kaldı!'),
            ],
        )
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # 4. ÖĞRENCİNİN KENDİ ALANINA ÖZEL DENEME & BRANŞ ROZETLERİ (`track_exam`)
    # ═══════════════════════════════════════════════════════════════════════════
    if track_code == 'LGS':
        # ── LGS (7. & 8. Sınıf) Kulvarı ────────────────────────────────────────
        catalog.extend(
            _chain(
                group_code='LGS_NET_CHAIN',
                category='track_exam',
                category_label=track_cat_label,
                current=metrics['max_lgs_net'],
                unit='net',
                track_badge_label='LGS',
                steps=[
                    ('LGS_NET_65', 'Bronz', 'common', 180, '🎯', 'LGS 65+ Net Barajı', 'Bir LGS denemesinde 90 soruda 65 ve üzeri toplam nete ulaş.', 65, 'En yüksek LGS netin {current} · 65 nete {remaining} net kaldı!'),
                    ('LGS_NET_75', 'Gümüş', 'rare', 300, '🚀', 'LGS 75+ Net Kulübü', 'LGS denemesinde 75 ve üzeri toplam net yakala.', 75, '75+ Net Kulübü’ne {remaining} net kaldı!'),
                    ('LGS_NET_82', 'Altın', 'epic', 480, '💎', 'LGS 82+ Net (%2 Dilim Temposu)', 'LGS denemesinde 82 ve üzeri netle nitelikli lise potasına gir.', 82, '82+ Net barajına {remaining} net kaldı!'),
                    ('LGS_NET_87', 'Efsane', 'mythic', 850, '👑', 'LGS 87+ Net (Türkiye Zirve Bandı)', '90 soruluk LGS denemesinde 87+ netle şampiyonluk bandına çık!', 87, '87+ Net Zirve Bandı’na {remaining} net kaldı!'),
                ],
            )
        )
        catalog.extend(
            _chain(
                group_code='LGS_PUAN_CHAIN',
                category='track_exam',
                category_label=track_cat_label,
                current=metrics['max_lgs_puan'],
                unit='puan',
                track_badge_label='LGS',
                steps=[
                    ('LGS_PUAN_420', 'Bronz', 'rare', 220, '🏅', 'LGS 420+ Puan', 'Kurumsal LGS denemesinde 420 puan barajını aş.', 420, 'En yüksek puanın {current} · 420 puana {remaining} puan kaldı!'),
                    ('LGS_PUAN_450', 'Altın', 'epic', 380, '🌟', 'LGS 450+ Puan Kulübü', 'Kurumsal LGS denemesinde 450 ve üzeri puana ulaş.', 450, '450 Puan Kulübü’ne {remaining} puan kaldı!'),
                    ('LGS_PUAN_480', 'Efsane', 'mythic', 750, '👑', 'LGS 480+ Puan (%1 Dilim)', 'Kurumsal LGS denemesinde 480+ puanla %1’lik dilim sinyali ver!', 480, '480+ Puan hedefine {remaining} puan kaldı!'),
                ],
            )
        )
        catalog.extend([
            _entry(
                code='LGS_MAT_18',
                category='track_exam',
                category_label=track_cat_label,
                rarity='epic',
                xp_reward=340,
                icon='📐',
                title='LGS Matematik Kalesi (18+/20)',
                description='LGS Matematik bölümünde 20 soruda en az 18 net yap.',
                current=metrics['max_lgs_mat'],
                target=18,
                unit='net',
                hint_when_locked='En yüksek Matematik netin {current}/20 · {remaining} net kaldı!',
                track_badge_label='LGS Branş',
            ),
            _entry(
                code='LGS_FEN_18',
                category='track_exam',
                category_label=track_cat_label,
                rarity='epic',
                xp_reward=320,
                icon='🔬',
                title='LGS Fen Bilimleri Ustası (18+/20)',
                description='LGS Fen Bilimleri bölümünde 20 soruda en az 18 net yap.',
                current=metrics['max_lgs_fen'],
                target=18,
                unit='net',
                hint_when_locked='En yüksek Fen netin {current}/20 · {remaining} net kaldı!',
                track_badge_label='LGS Branş',
            ),
            _entry(
                code='LGS_TURKCE_18',
                category='track_exam',
                category_label=track_cat_label,
                rarity='rare',
                xp_reward=280,
                icon='📖',
                title='LGS Türkçe Ustası (18+/20)',
                description='LGS Türkçe bölümünde 20 soruda en az 18 net yap.',
                current=metrics['max_lgs_turkce'],
                target=18,
                unit='net',
                hint_when_locked='En yüksek Türkçe netin {current}/20 · {remaining} net kaldı!',
                track_badge_label='LGS Branş',
            ),
        ])
    else:
        # ── YKS Ortak TYT Merdiveni & TYT Branş Kaleleri (Tüm YKS Öğrencileri) ─
        catalog.extend(
            _chain(
                group_code='TYT_NET_CHAIN',
                category='track_exam',
                category_label=track_cat_label,
                current=metrics['max_tyt_net'],
                unit='net',
                track_badge_label='TYT Ortak',
                steps=[
                    ('TYT_NET_55', 'Bronz', 'common', 160, '🧭', 'TYT 55+ Net Barajı', '120 soruluk TYT denemesinde 55 ve üzeri nete ulaş.', 55, 'En yüksek TYT netin {current} · 55 barajına {remaining} net kaldı!'),
                    ('TYT_NET_70', 'Gümüş', 'rare', 260, '⚡', 'TYT 70+ Net İvmesi', 'TYT denemesinde 70 net barajını aşarak üst lige adım at.', 70, 'TYT 70+ Net için {remaining} net kaldı!'),
                    ('TYT_NET_85', 'Altın', 'epic', 420, '🔥', 'TYT 85+ Net Kulübü', 'TYT denemesinde 85 ve üzeri net yakala.', 85, 'TYT 85+ Net Kulübü’ne {remaining} net kaldı!'),
                    ('TYT_NET_95', 'Platin', 'legendary', 600, '🛡️', 'TYT 95+ Net (İlk 25 Bin Ruhu)', 'TYT denemesinde 95 net barajını geç.', 95, 'TYT 95+ Net hedefine {remaining} net kaldı!'),
                    ('TYT_NET_105', 'Elmas', 'mythic', 850, '💎', 'TYT 105+ Net (İlk 5 Bin Bandı)', 'TYT denemesinde 105+ netle elit derece kulübüne gir.', 105, 'TYT 105+ Elmas kademeye {remaining} net kaldı!'),
                    ('TYT_NET_112', 'Efsane', 'mythic', 1250, '👑', 'TYT 112+ Net (Türkiye Derece Bandı)', '120 soruluk TYT’de 112+ netle zirveye bayrak dik!', 112, 'Türkiye Derece Bandı’na {remaining} net kaldı!'),
                ],
            )
        )

        catalog.extend(
            _chain(
                group_code='TYT_TURKCE_CHAIN',
                category='track_exam',
                category_label=track_cat_label,
                current=metrics['max_tyt_turkce'],
                unit='net',
                track_badge_label='TYT Branş',
                steps=[
                    ('TYT_TURKCE_32', 'Gümüş', 'rare', 220, '📖', 'Paragraf Avcısı (TYT Türkçe 32+)', 'TYT Türkçe testinde 40 soruda 32+ nete ulaş.', 32, 'En iyi TYT Türkçe netin {current}/40 · {remaining} net kaldı!'),
                    ('TYT_TURKCE_36', 'Altın', 'epic', 380, '🖋️', 'Dil & Anlam Ustası (TYT Türkçe 36+)', 'TYT Türkçe testinde 36+ net yakala.', 36, 'TYT Türkçe 36+ nete {remaining} net kaldı!'),
                    ('TYT_TURKCE_40', 'Efsane', 'mythic', 700, '👑', 'TYT Türkçe 40/40 Full!', 'TYT Türkçe testini sıfır yanlış ve sıfır boşla tam kapat!', 40, '40/40 Full Türkçe rekoruna {remaining} net kaldı!'),
                ],
            )
        )

        catalog.extend(
            _chain(
                group_code='TYT_MAT_CHAIN',
                category='track_exam',
                category_label=track_cat_label,
                current=metrics['max_tyt_mat'],
                unit='net',
                track_badge_label='TYT Branş',
                steps=[
                    ('TYT_MAT_25', 'Bronz', 'rare', 220, '📐', 'Problem Çözücü (TYT Mat 25+)', 'TYT Temel Matematik testinde 40 soruda 25+ net yap.', 25, 'En iyi TYT Mat netin {current}/40 · {remaining} net kaldı!'),
                    ('TYT_MAT_33', 'Altın', 'epic', 400, '🧠', 'Sayısal Zeka (TYT Mat 33+)', 'TYT Temel Matematik testinde 33+ net barajını aş.', 33, 'TYT Mat 33+ nete {remaining} net kaldı!'),
                    ('TYT_MAT_38', 'Efsane', 'mythic', 750, '👑', 'TYT Matematik Kalesi (38+/40)', 'TYT Matematikte 38 ve üzeri netle kusursuza yaklaş!', 38, 'TYT Mat 38+ hedefine {remaining} net kaldı!'),
                ],
            )
        )

        catalog.extend([
            _entry(
                code='TYT_FEN_16',
                category='track_exam',
                category_label=track_cat_label,
                rarity='epic',
                xp_reward=300,
                icon='🧪',
                title='TYT Fen Kalkanı (16+/20)',
                description='20 soruluk TYT Fen Bilimleri testinde en az 16 nete ulaş.',
                current=metrics['max_tyt_fen'],
                target=16,
                unit='net',
                hint_when_locked='En iyi TYT Fen netin {current}/20 · {remaining} net kaldı!',
                track_badge_label='TYT Branş',
            ),
            _entry(
                code='TYT_SOSYAL_16',
                category='track_exam',
                category_label=track_cat_label,
                rarity='epic',
                xp_reward=280,
                icon='🌍',
                title='TYT Sosyal Kalkanı (16+/20)',
                description='20 soruluk TYT Sosyal Bilimler testinde en az 16 nete ulaş.',
                current=metrics['max_tyt_sosyal'],
                target=16,
                unit='net',
                hint_when_locked='En iyi TYT Sosyal netin {current}/20 · {remaining} net kaldı!',
                track_badge_label='TYT Branş',
            ),
        ])

        # ── AYT SAYISAL (`SAY`) Öğrencisine Özel Rozetler ──────────────────────
        if track_code == 'SAYISAL':
            catalog.extend(
                _chain(
                    group_code='AYT_SAY_NET_CHAIN',
                    category='track_exam',
                    category_label=track_cat_label,
                    current=metrics['max_ayt_say_net'],
                    unit='net',
                    track_badge_label='AYT SAY',
                    steps=[
                        ('AYT_SAY_35', 'Bronz', 'common', 200, '🔬', 'AYT Sayısal 35+ Net', '80 soruluk AYT Sayısal alanında 35+ toplam nete ulaş.', 35, 'En iyi AYT SAY netin {current}/80 · {remaining} net kaldı!'),
                        ('AYT_SAY_50', 'Gümüş', 'rare', 340, '⚙️', 'AYT Sayısal 50+ Net', 'AYT Sayısal alanında 50 net barajını devir.', 50, 'AYT SAY 50+ Net için {remaining} net kaldı!'),
                        ('AYT_SAY_62', 'Altın', 'epic', 520, '🚀', 'AYT Sayısal 62+ Net (Mühendislik/Tıp Rotası)', 'AYT Sayısal alanında 62+ net yakala.', 62, 'AYT SAY 62+ Net hedefine {remaining} net kaldı!'),
                        ('AYT_SAY_70', 'Elmas', 'legendary', 800, '💎', 'AYT Sayısal 70+ Net (Derece Kulvarı)', '80 soruda 70+ AYT Sayısal netiyle zirveye ortak ol.', 70, 'AYT SAY 70+ Elmas kademeye {remaining} net kaldı!'),
                        ('AYT_SAY_76', 'Efsane', 'mythic', 1300, '👑', 'AYT Sayısal 76+/80 (Türkiye Zirvesi)', '80 soruluk AYT Sayısalda 76 ve üzeri netle efsaneleş!', 76, 'AYT SAY 76+ Efsane kilidine {remaining} net kaldı!'),
                    ],
                )
            )
            catalog.extend(
                _chain(
                    group_code='AYT_MAT_SAY_CHAIN',
                    category='track_exam',
                    category_label=track_cat_label,
                    current=metrics['max_ayt_mat'],
                    unit='net',
                    track_badge_label='AYT SAY Branş',
                    steps=[
                        ('AYT_MAT_25', 'Bronz', 'rare', 240, '∫', 'AYT Matematik 25+ Net', '40 soruluk AYT Matematik-Geometri testinde 25+ net yap.', 25, 'En iyi AYT Mat netin {current}/40 · {remaining} net kaldı!'),
                        ('AYT_MAT_33', 'Altın', 'epic', 440, '📐', 'AYT Matematik Duayeni (33+/40)', 'AYT Matematik-Geometri testinde 33+ nete ulaş.', 33, 'AYT Mat 33+ nete {remaining} net kaldı!'),
                        ('AYT_MAT_38', 'Efsane', 'mythic', 820, '👑', 'AYT Matematik İmparatoru (38+/40)', 'AYT Matematikte 38+ netle rakiplerine fark at!', 38, 'AYT Mat 38+ hedefine {remaining} net kaldı!'),
                    ],
                )
            )
            catalog.extend([
                _entry(
                    code='AYT_FIZIK_12',
                    category='track_exam',
                    category_label=track_cat_label,
                    rarity='epic',
                    xp_reward=340,
                    icon='⚛️',
                    title='Fizik Ustası (12+/14 Net)',
                    description='AYT Fizik testinde 14 soruda en az 12 net yap.',
                    current=metrics['max_ayt_fizik'],
                    target=12,
                    unit='net',
                    hint_when_locked='En iyi AYT Fizik netin {current}/14 · {remaining} net kaldı!',
                    track_badge_label='AYT SAY Branş',
                ),
                _entry(
                    code='AYT_KIMYA_11',
                    category='track_exam',
                    category_label=track_cat_label,
                    rarity='epic',
                    xp_reward=320,
                    icon='🧪',
                    title='Kimya Ustası (11+/13 Net)',
                    description='AYT Kimya testinde 13 soruda en az 11 net yap.',
                    current=metrics['max_ayt_kimya'],
                    target=11,
                    unit='net',
                    hint_when_locked='En iyi AYT Kimya netin {current}/13 · {remaining} net kaldı!',
                    track_badge_label='AYT SAY Branş',
                ),
                _entry(
                    code='AYT_BIYOLOJI_11',
                    category='track_exam',
                    category_label=track_cat_label,
                    rarity='epic',
                    xp_reward=320,
                    icon='🧬',
                    title='Biyoloji Ustası (11+/13 Net)',
                    description='AYT Biyoloji testinde 13 soruda en az 11 net yap.',
                    current=metrics['max_ayt_biyoloji'],
                    target=11,
                    unit='net',
                    hint_when_locked='En iyi AYT Biyoloji netin {current}/13 · {remaining} net kaldı!',
                    track_badge_label='AYT SAY Branş',
                ),
                _entry(
                    code='FEN_TRIATLONU',
                    category='track_exam',
                    category_label=track_cat_label,
                    rarity='mythic',
                    xp_reward=900,
                    icon='🔱',
                    title='Fen Triatlonu (Aynı Sınavda 3/3 Branş)',
                    description='Tek bir AYT sınavında Fizik (12+), Kimya (11+) ve Biyoloji (11+) barajlarının üçünü birden aş!',
                    current=metrics['best_fen_triatlon_parts'],
                    target=3,
                    unit='branş',
                    hint_when_locked='Tek sınavda en iyi {current}/3 fen branşı barajını aştın · {remaining} branş kaldı!',
                    track_badge_label='AYT SAY Özel',
                ),
            ])

        # ── AYT EŞİT AĞIRLIK (`EA`) Öğrencisine Özel Rozetler ─────────────────
        elif track_code == 'ESIT_AGIRLIK':
            catalog.extend(
                _chain(
                    group_code='AYT_EA_NET_CHAIN',
                    category='track_exam',
                    category_label=track_cat_label,
                    current=metrics['max_ayt_ea_net'],
                    unit='net',
                    track_badge_label='AYT EA',
                    steps=[
                        ('AYT_EA_35', 'Bronz', 'common', 200, '⚖️', 'AYT Eşit Ağırlık 35+ Net', '80 soruluk AYT EA alanında 35+ toplam nete ulaş.', 35, 'En iyi AYT EA netin {current}/80 · {remaining} net kaldı!'),
                        ('AYT_EA_50', 'Gümüş', 'rare', 340, '🏛️', 'AYT Eşit Ağırlık 50+ Net', 'AYT EA alanında 50 net barajını aş.', 50, 'AYT EA 50+ Net için {remaining} net kaldı!'),
                        ('AYT_EA_62', 'Altın', 'epic', 520, '🚀', 'AYT EA 62+ Net (Hukuk/İktisat Rotası)', 'AYT EA alanında 62+ net yakala.', 62, 'AYT EA 62+ Net hedefine {remaining} net kaldı!'),
                        ('AYT_EA_70', 'Elmas', 'legendary', 800, '💎', 'AYT EA 70+ Net (Derece Kulvarı)', '80 soruda 70+ AYT EA netiyle zirveye ortak ol.', 70, 'AYT EA 70+ Elmas kademeye {remaining} net kaldı!'),
                        ('AYT_EA_76', 'Efsane', 'mythic', 1300, '👑', 'AYT EA 76+/80 (Türkiye Zirvesi)', '80 soruluk AYT EA alanında 76+ netle efsaneleş!', 76, 'AYT EA 76+ Efsane kilidine {remaining} net kaldı!'),
                    ],
                )
            )
            catalog.extend(
                _chain(
                    group_code='AYT_MAT_EA_CHAIN',
                    category='track_exam',
                    category_label=track_cat_label,
                    current=metrics['max_ayt_mat'],
                    unit='net',
                    track_badge_label='AYT EA Branş',
                    steps=[
                        ('AYT_EA_MAT_25', 'Bronz', 'rare', 250, '📐', 'EA Matematik Lokomotifi (25+/40)', 'AYT Matematik-Geometri testinde 25+ net yap.', 25, 'En iyi AYT Mat netin {current}/40 · {remaining} net kaldı!'),
                        ('AYT_EA_MAT_33', 'Altın', 'epic', 460, '🧠', 'EA Matematik Gücü (33+/40)', 'AYT Matematikte 33+ netle EA sıralamanı uçur.', 33, 'AYT Mat 33+ nete {remaining} net kaldı!'),
                        ('AYT_EA_MAT_38', 'Efsane', 'mythic', 850, '👑', 'EA Matematik Şampiyonu (38+/40)', 'AYT Matematikte 38+ net yap!', 38, 'AYT Mat 38+ hedefine {remaining} net kaldı!'),
                    ],
                )
            )
            catalog.extend([
                _entry(
                    code='AYT_EDEBIYAT_21',
                    category='track_exam',
                    category_label=track_cat_label,
                    rarity='epic',
                    xp_reward=340,
                    icon='📜',
                    title='Edebiyat Kalemi (21+/24 Net)',
                    description='AYT Türk Dili ve Edebiyatı testinde 24 soruda en az 21 net yap.',
                    current=metrics['max_ayt_edebiyat'],
                    target=21,
                    unit='net',
                    hint_when_locked='En iyi Edebiyat netin {current}/24 · {remaining} net kaldı!',
                    track_badge_label='AYT EA Branş',
                ),
                _entry(
                    code='AYT_TAR1_COG1_13',
                    category='track_exam',
                    category_label=track_cat_label,
                    rarity='rare',
                    xp_reward=280,
                    icon='🗺️',
                    title='Tarih-1 & Coğrafya-1 Hakimi (13+/16)',
                    description='Tarih-1 (10) ve Coğrafya-1 (6) toplamında en az 13 nete ulaş.',
                    current=metrics['max_ayt_tar1_cog1'],
                    target=13,
                    unit='net',
                    hint_when_locked='En iyi Sos-1 (Tar1+Coğ1) netin {current}/16 · {remaining} net kaldı!',
                    track_badge_label='AYT EA Branş',
                ),
                _entry(
                    code='TM_DENGE_USTASI',
                    category='track_exam',
                    category_label=track_cat_label,
                    rarity='mythic',
                    xp_reward=900,
                    icon='⚖️',
                    title='TM Denge Ustası (Mat 30+ & Ed-Sos1 32+)',
                    description='Tek bir AYT sınavında hem Matematik 30+ hem Edebiyat-Sos1 32+ barajını aynı anda geç!',
                    current=metrics['best_ea_balance_parts'],
                    target=2,
                    unit='blok',
                    hint_when_locked='Aynı sınavda {current}/2 blok barajı aşıldı · ikisini tek sınavda birleştir!',
                    track_badge_label='AYT EA Özel',
                ),
            ])

        # ── AYT SÖZEL (`SÖZ`) Öğrencisine Özel Rozetler ───────────────────────
        elif track_code == 'SOZEL':
            catalog.extend(
                _chain(
                    group_code='AYT_SOZ_NET_CHAIN',
                    category='track_exam',
                    category_label=track_cat_label,
                    current=metrics['max_ayt_soz_net'],
                    unit='net',
                    track_badge_label='AYT SÖZ',
                    steps=[
                        ('AYT_SOZ_40', 'Bronz', 'common', 200, '📜', 'AYT Sözel 40+ Net', '80 soruluk AYT Sözel alanında 40+ toplam nete ulaş.', 40, 'En iyi AYT SÖZ netin {current}/80 · {remaining} net kaldı!'),
                        ('AYT_SOZ_55', 'Gümüş', 'rare', 350, '🏛️', 'AYT Sözel 55+ Net', 'AYT Sözel alanında 55 net barajını aş.', 55, 'AYT SÖZ 55+ Net için {remaining} net kaldı!'),
                        ('AYT_SOZ_66', 'Altın', 'epic', 560, '💎', 'AYT Sözel 66+ Net (Derece Rotası)', 'AYT Sözel alanında 66+ net yakala.', 66, 'AYT SÖZ 66+ Net hedefine {remaining} net kaldı!'),
                        ('AYT_SOZ_74', 'Efsane', 'mythic', 1200, '👑', 'AYT Sözel 74+/80 (Türkiye Zirvesi)', '80 soruluk AYT Sözelde 74+ netle zirveye çık!', 74, 'AYT SÖZ 74+ Efsane kilidine {remaining} net kaldı!'),
                    ],
                )
            )
            catalog.extend([
                _entry(
                    code='AYT_SOZ_EDSOS1_34',
                    category='track_exam',
                    category_label=track_cat_label,
                    rarity='epic',
                    xp_reward=380,
                    icon='🖋️',
                    title='Edebiyat & Sosyal-1 Ustası (34+/40)',
                    description='40 soruluk Edebiyat + Tarih-1 + Coğrafya-1 testinde 34+ net yap.',
                    current=metrics['max_ayt_ed_sos1'],
                    target=34,
                    unit='net',
                    hint_when_locked='En iyi Ed-Sos1 netin {current}/40 · {remaining} net kaldı!',
                    track_badge_label='AYT SÖZ Branş',
                ),
                _entry(
                    code='AYT_SOZ_SOS2_34',
                    category='track_exam',
                    category_label=track_cat_label,
                    rarity='epic',
                    xp_reward=380,
                    icon='🌍',
                    title='Sosyal-2 Ansiklopedisi (34+/40)',
                    description='40 soruluk Sosyal Bilimler-2 testinde 34+ net yap.',
                    current=metrics['max_ayt_sos2'],
                    target=34,
                    unit='net',
                    hint_when_locked='En iyi Sosyal-2 netin {current}/40 · {remaining} net kaldı!',
                    track_badge_label='AYT SÖZ Branş',
                ),
                _entry(
                    code='SOZEL_TAM_SAHA',
                    category='track_exam',
                    category_label=track_cat_label,
                    rarity='mythic',
                    xp_reward=900,
                    icon='👑',
                    title='Sözel Tam Saha (Ed-Sos1 34+ & Sos2 34+)',
                    description='Tek bir AYT sınavında hem Ed-Sos1 hem Sosyal-2 testlerinde 34+ neti aynı anda yakala!',
                    current=metrics['best_soz_full_parts'],
                    target=2,
                    unit='blok',
                    hint_when_locked='Tek sınavda {current}/2 sözel blok barajı aşıldı!',
                    track_badge_label='AYT SÖZ Özel',
                ),
            ])

    # ═══════════════════════════════════════════════════════════════════════════
    # 5. SINAV STRATEJİSİ, KÜRSÜ & KAMPÜS (15 Rozet)
    # ═══════════════════════════════════════════════════════════════════════════
    catalog.extend(
        _chain(
            group_code='EXAM_PARTICIPATION_CHAIN',
            category='exam',
            category_label='Sınav Strateji & Kampüs',
            current=metrics['exam_count'],
            unit='deneme',
            steps=[
                ('ILK_DENEME', 'Bronz', 'common', 70, '🧭', 'Sahnede İlk Adım', 'İlk kurumsal deneme sınavı sonucunu radarına ekle.', 1, 'İlk deneme sınavı sonucun açıklandığında açılır!'),
                ('DENEME_5', 'Gümüş', 'rare', 160, '📝', '5 Deneme Tecrübesi', '5 kurumsal deneme sınavını tamamla.', 5, '5. denemeye {remaining} sınav kaldı!'),
                ('DENEME_15', 'Altın', 'epic', 320, '📊', '15 Deneme Maratoncusu', '15 kurumsal deneme sınavıyla sınav kondisyonunu oturt.', 15, '15 deneme barajına {remaining} sınav kaldı!'),
                ('DENEME_30', 'Platin', 'legendary', 540, '🛡️', '30 Deneme Gladyatörü', '30 kurumsal denemeyi geride bırakarak gerçek sınav provasını tamamla.', 30, '30 deneme kademesine {remaining} sınav kaldı!'),
                ('DENEME_50', 'Efsane', 'mythic', 900, '👑', '50 Deneme (Tam Sezon Sınav Ustası)', 'Sınav sezonunda tam 50 kurumsal denemeye katıl.', 50, '50 Deneme Efsanesi olmaya {remaining} sınav kaldı!'),
            ],
        )
    )

    catalog.append(
        _entry(
            code='KISISEL_REKOR',
            category='exam',
            category_label='Sınav Strateji & Kampüs',
            rarity='epic',
            xp_reward=250,
            icon='🚀',
            title='Kişisel Rekor (PR)',
            description='Yeni bir denemede kendi sınav türündeki en yüksek net rekorunu kır.',
            current=1 if metrics['beat_prev_best'] else 0,
            target=1,
            unit='rekor',
            hint_when_locked='Sıradaki denemede en yüksek netini geçerek bu rozeti kap!',
            force_unlocked=metrics['beat_prev_best'],
        )
    )

    catalog.extend(
        _chain(
            group_code='NET_JUMP_CHAIN',
            category='exam',
            category_label='Sınav Strateji & Kampüs',
            current=max(0.0, metrics['max_net_jump']),
            unit='net',
            steps=[
                ('NET_SICRAMA_5', 'Bronz', 'rare', 260, '📈', 'Sıçrama Tahtası (+5 Net)', 'Aynı sınav türünde bir önceki denemeye göre +5.0 net artışı yakala.', 5.0, 'En iyi sıçraman +{current} net · +5 nete {remaining} net kaldı!'),
                ('NET_SICRAMA_10', 'Altın', 'epic', 450, '🚀', 'Büyük Patlama (+10 Net)', 'Bir önceki denemeye göre tek seferde +10.0 net sıçrama yap.', 10.0, 'En iyi sıçraman +{current} net · +10 nete {remaining} net kaldı!'),
                ('NET_SICRAMA_15', 'Efsane', 'mythic', 780, '☄️', 'Süpernova (+15 Net Sıçrama)', 'Tek bir denemede bir öncekine göre +15.0 net artış yakala!', 15.0, 'En iyi sıçraman +{current} net · +15 nete {remaining} net kaldı!'),
            ],
        )
    )

    catalog.extend(
        _chain(
            group_code='RISING_STREAK_CHAIN',
            category='exam',
            category_label='Sınav Strateji & Kampüs',
            current=metrics['max_rising_exam_streak'],
            unit='artış',
            steps=[
                ('YUKSELIS_SERISI_2', 'Bronz', 'rare', 220, '📊', 'İstikrarlı Tırmanış (Üst Üste 2 Artış)', 'Aynı sınav türünde arka arkaya 2 denemede netini artır.', 2, 'Üst üste 2 net artışı için {remaining} yükseliş kaldı!'),
                ('YUKSELIS_SERISI_3', 'Altın', 'epic', 420, '🔥', 'Durdurulamaz İvme (Üst Üste 3 Artış)', 'Arka arkaya 3 denemede hiç düşmeden netini yükselt.', 3, 'Üst üste 3 deneme yükselişine {remaining} adım kaldı!'),
                ('YUKSELIS_SERISI_5', 'Efsane', 'mythic', 850, '👑', 'Kusursuz Trend (Üst Üste 5 Artış)', 'Arka arkaya 5 deneme boyunca netini sürekli artır!', 5, '5 sınavlık efsane yükseliş serisine {remaining} adım kaldı!'),
            ],
        )
    )

    catalog.append(
        _entry(
            code='KESKIN_NISANCI_92',
            category='exam',
            category_label='Sınav Strateji & Kampüs',
            rarity='legendary',
            xp_reward=420,
            icon='🎯',
            title='Keskin Nişancı (%92+ İsabet)',
            description='En az 50 soru işaretlediğin bir denemede %92 ve üzeri doğruluk oranı yakala.',
            current=metrics['best_accuracy_pct'],
            target=92.0,
            unit='%',
            hint_when_locked='En yüksek doğruluk oranın %{current} · %92 isabete %{remaining} kaldı!',
        )
    )

    best_rank = metrics['best_kurum_rank']
    catalog.extend(
        _chain(
            group_code='CAMPUS_PODIUM_CHAIN',
            category='exam',
            category_label='Sınav Strateji & Kampüs',
            current=1 if (best_rank is not None and best_rank <= 10) else 0,
            unit='kürsü',
            steps=[
                (
                    'KAMPUS_ILK_10',
                    'Gümüş',
                    'epic',
                    350,
                    '🏅',
                    'Kampüs İlk 10',
                    'Kendi puan türünde bir kurumsal denemede ilk 10 sıraya gir.',
                    1,
                    f'En iyi kurum sıran #{best_rank} · İlk 10 potasına çok yakınsın!' if best_rank else 'İlk kurumsal deneme sıralamanda ilk 10’u hedefle!',
                ),
            ],
        )
    )
    # İlk 3 ve Şampiyonluk kademelerini aynı `CAMPUS_PODIUM_CHAIN` altında bağla
    podium_3 = _entry(
        code='KAMPUS_ILK_3',
        category='exam',
        category_label='Sınav Strateji & Kampüs',
        rarity='legendary',
        xp_reward=600,
        icon='🥈',
        title='Kampüs Kürsüsü (İlk 3)',
        description='Kendi puan türünde bir kurumsal denemede ilk 3 kürsüsüne çık.',
        current=1 if (best_rank is not None and best_rank <= 3) else 0,
        target=1,
        unit='kürsü',
        hint_when_locked=(
            f'En iyi kurum sıran #{best_rank} · Kürsüye çıkmana çok az kaldı!'
            if best_rank
            else 'Denemede ilk 3 kürsüsüne çıktığında açılır!'
        ),
        force_unlocked=bool(best_rank is not None and best_rank <= 3),
        tier_group='CAMPUS_PODIUM_CHAIN',
        tier_level=2,
        tier_total=3,
        tier_label='Elmas',
    )
    podium_1 = _entry(
        code='KAMPUS_SAMPIYONU_1',
        category='exam',
        category_label='Sınav Strateji & Kampüs',
        rarity='mythic',
        xp_reward=1100,
        icon='🥇',
        title='Kampüs Şampiyonu (#1)',
        description='Kendi alanında kurumsal bir denemede 1. olarak zirveye adını yazdır!',
        current=1 if best_rank == 1 else 0,
        target=1,
        unit='zirve',
        hint_when_locked=(
            f'En iyi kurum sıran #{best_rank} · #1 Şampiyonluk seni bekliyor!'
            if best_rank
            else 'Denemede #1 olduğunda efsane rozet açılır!'
        ),
        force_unlocked=(best_rank == 1),
        tier_group='CAMPUS_PODIUM_CHAIN',
        tier_level=3,
        tier_total=3,
        tier_label='Efsane',
    )
    # İlk kademenin `tier_total` değerini 3'e eşitle
    for item in catalog:
        if item['code'] == 'KAMPUS_ILK_10':
            item['tier_total'] = 3
    catalog.extend([podium_3, podium_1])

    catalog.append(
        _entry(
            code='TAM_KADRO',
            category='exam',
            category_label='Sınav Strateji & Kampüs',
            rarity='rare',
            xp_reward=180,
            icon='🏫',
            title='Tam Kadro (%95+ Devam)',
            description='En az 5 yoklama kaydında %95 ve üzeri ders/etüt katılımını koru.',
            current=metrics['att_rate'] if metrics['att_total'] >= 5 else metrics['att_total'],
            target=95 if metrics['att_total'] >= 5 else 5,
            unit='%' if metrics['att_total'] >= 5 else 'yoklama',
            hint_when_locked=(
                'Devam oranını %95 üzerine çıkarmak için ders kaçırma!'
                if metrics['att_total'] >= 5
                else '{remaining} yoklama kaydı daha eklendiğinde değerlendirilecek.'
            ),
            force_unlocked=(metrics['att_total'] >= 5 and metrics['att_rate'] >= 95.0),
        )
    )

    # Kademeli zincirlerde yalnızca ilk kilitli basamak `is_active_tier=True` olarak işaretlenir;
    # kazanılmış olan tüm basamaklar her zaman görünür kalır.
    seen_locked_group: set[str] = set()
    for item in catalog:
        grp = item.get('tier_group')
        if not grp or item['is_unlocked']:
            item['is_active_tier'] = True
            continue
        if grp not in seen_locked_group:
            item['is_active_tier'] = True
            seen_locked_group.add(grp)
        else:
            item['is_active_tier'] = False

    return catalog


def build_weekly_focus_leaderboard(scope: dict, today: date) -> dict:
    """
    Aynı kurum + şubedeki aktif öğrencilerin bu haftaki (Pazartesi–Pazar)
    toplam odak dakikalarını (`ProgramBlock.actual_duration` + `AssignmentTask.actual_duration_minutes`)
    KVKK dostu maskeli isimlerle (`Z*** K.`) sıralar.
    """
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    me_id = scope['ogrenci'].id

    active_student_rows = list(
        OgrenciKayit.objects.select_related('ogrenci', 'sinif')
        .filter(
            kurum_id=scope['kurum_id'],
            sube_id=scope['sube_id'],
            egitim_yili_id=scope['egitim_yili_id'],
            aktif_mi=True,
            ogrenci__aktif_mi=True,
        )
        .values(
            'ogrenci_id',
            'ogrenci__ad',
            'ogrenci__soyad',
            'sinif__ad',
        )
    )
    student_map: dict[int, dict] = {}
    for row in active_student_rows:
        sid = row['ogrenci_id']
        if sid not in student_map:
            student_map[sid] = {
                'student_id': sid,
                'ad': row['ogrenci__ad'] or '',
                'soyad': row['ogrenci__soyad'] or '',
                'classroom': row['sinif__ad'] or '',
            }

    if me_id not in student_map:
        student_map[me_id] = {
            'student_id': me_id,
            'ad': scope['ogrenci'].ad,
            'soyad': scope['ogrenci'].soyad,
            'classroom': scope['kayit'].sinif.ad if scope['kayit'].sinif else '',
        }

    all_sids = list(student_map.keys())

    # Gizlilik tercihini kontrol et (`leaderboard_opt_in=False` olan diğer öğrencileri gizle)
    opt_out_ids: set[int] = set()
    for acc in StudentPortalAccount.objects.filter(ogrenci_id__in=all_sids).only('ogrenci_id', 'preferences'):
        if isinstance(acc.preferences, dict) and acc.preferences.get('leaderboard_opt_in') is False:
            if acc.ogrenci_id != me_id:
                opt_out_ids.add(acc.ogrenci_id)

    block_sums = dict(
        ProgramBlock.objects.filter(
            day__program__student_id__in=all_sids,
            day__program__is_template=False,
            day__day_date__gte=monday,
            day__day_date__lte=sunday,
            actual_duration__gt=0,
        )
        .values('day__program__student_id')
        .annotate(total=Sum('actual_duration'))
        .values_list('day__program__student_id', 'total')
    )

    hw_sums = dict(
        AssignmentTask.objects.filter(
            lesson_block__assignment__student_id__in=all_sids,
            lesson_block__assignment__is_active=True,
            updated_at__date__gte=monday,
            updated_at__date__lte=sunday,
            actual_duration_minutes__gt=0,
        )
        .values('lesson_block__assignment__student_id')
        .annotate(total=Sum('actual_duration_minutes'))
        .values_list('lesson_block__assignment__student_id', 'total')
    )

    scored: list[dict] = []
    for sid, info in student_map.items():
        if sid in opt_out_ids:
            continue
        mins = int(block_sums.get(sid) or 0) + int(hw_sums.get(sid) or 0)
        if mins <= 0 and sid != me_id:
            continue
        scored.append({
            'student_id': sid,
            'is_me': sid == me_id,
            'display_name': (
                f"{info['ad']} {info['soyad']} (Sen)".strip()
                if sid == me_id
                else _mask_peer_name(info['ad'], info['soyad'])
            ),
            'classroom': info['classroom'],
            'weekly_focus_minutes': mins,
        })

    scored.sort(key=lambda r: (-r['weekly_focus_minutes'], 0 if r['is_me'] else 1, r['student_id']))

    my_rank = 1
    my_minutes = 0
    minutes_to_overtake = None
    for idx, entry in enumerate(scored, start=1):
        entry['rank'] = idx
        if entry['is_me']:
            my_rank = idx
            my_minutes = entry['weekly_focus_minutes']
            if idx > 1:
                above_mins = scored[idx - 2]['weekly_focus_minutes']
                minutes_to_overtake = max(1, (above_mins - my_minutes) + 1)

    top_entries = scored[:10]
    if not any(e['is_me'] for e in top_entries):
        me_entry = next((e for e in scored if e['is_me']), None)
        if me_entry:
            top_entries.append(me_entry)

    # Public payload: diğer öğrencilerin gerçek `student_id` değerini bile sızdırma
    safe_rows = [
        {
            'rank': e['rank'],
            'is_me': e['is_me'],
            'display_name': e['display_name'],
            'classroom': e['classroom'],
            'weekly_focus_minutes': e['weekly_focus_minutes'],
        }
        for e in top_entries
    ]

    account: StudentPortalAccount | None = scope.get('account')
    prefs = account.preferences if (account and isinstance(account.preferences, dict)) else {}
    return {
        'scope_label': f"{scope['kayit'].sube.ad} Şubesi" if scope['kayit'].sube else 'Kampüs',
        'week_start': monday.isoformat(),
        'week_end': sunday.isoformat(),
        'my_rank': my_rank,
        'my_weekly_focus_minutes': my_minutes,
        'active_competitors': len(scored),
        'minutes_to_overtake_next': minutes_to_overtake,
        'opt_in': bool(prefs.get('leaderboard_opt_in', True)),
        'entries': safe_rows,
    }


def build_student_achievements(scope: dict, *, include_leaderboard: bool = True) -> dict:
    """
    Öğrencinin tam başarı profilini (50 Seviye/XP, Alanına Özel Rozetler, Kademeli Zincirler,
    Aylık Sezon Meydan Okumaları, Açılmaya En Yakın Rozet ve Şube Haftalık Odak Ligi) döndürür.
    """
    today = timezone.localtime(timezone.now(), ISTANBUL).date()
    today_iso = today.isoformat()
    account: StudentPortalAccount | None = scope.get('account')
    prefs = dict(account.preferences) if (account and isinstance(account.preferences, dict)) else {}
    unlocked_history = (
        dict(prefs.get('unlocked_portal_badges'))
        if isinstance(prefs.get('unlocked_portal_badges'), dict)
        else {}
    )
    season_medals_history = (
        dict(prefs.get('monthly_season_medals'))
        if isinstance(prefs.get('monthly_season_medals'), dict)
        else {}
    )

    metrics = _collect_raw_metrics(scope, today)
    catalog = _build_catalog(metrics, unlocked_history, today_iso)
    monthly_season, dirty_season, newly_minted_season = _build_monthly_season(
        metrics, season_medals_history, today_iso,
    )

    newly_minted: list[dict] = list(newly_minted_season)
    dirty_prefs = dirty_season
    for item in catalog:
        if item['is_unlocked'] and item['code'] not in unlocked_history:
            unlocked_history[item['code']] = item['earned_at'] or today_iso
            dirty_prefs = True
            newly_minted.append({
                'id': abs(hash(item['code'])) % 100000,
                'badge_type': item['code'],
                'title': item['title'],
                'description': item['description'],
                'icon': item['icon'],
                'earned_at': item['earned_at'] or today_iso,
                'week_start': None,
            })

    if dirty_prefs and account is not None:
        prefs['unlocked_portal_badges'] = unlocked_history
        prefs['monthly_season_medals'] = season_medals_history
        account.preferences = prefs
        account.save(update_fields=['preferences', 'updated_at'])

    unlocked_items = [b for b in catalog if b['is_unlocked']]
    locked_items = [b for b in catalog if not b['is_unlocked']]
    active_locked_items = [b for b in locked_items if b.get('is_active_tier', True)]

    # Açılmaya en yakın kilitli rozet: yalnızca aktif sıradaki kademelerden seçilir!
    candidate_pool = active_locked_items or locked_items
    closest_locked = None
    if candidate_pool:
        closest_locked = sorted(
            candidate_pool,
            key=lambda b: (-b['progress_percent'], -b['xp_reward']),
        )[0]

    # Toplam XP: rozetler + kazanılan aylık sezon madalyaları + odak + blok + ödev + sınav + soru
    badge_xp = sum(int(b['xp_reward']) for b in unlocked_items)
    season_xp = sum(int(m.get('xp_reward') or 350) for m in season_medals_history.values())
    activity_xp = (
        int(metrics['total_focus_minutes']) * 2
        + int(metrics['completed_blocks_count']) * 15
        + int(metrics['completed_hw_count']) * 45
        + int(metrics['exam_count']) * 30
        + (int(metrics['total_season_questions']) // 25)
    )
    level_info = _resolve_level_and_rank(badge_xp + season_xp + activity_xp)

    pinned_code = prefs.get('pinned_badge_code')
    pinned_badge = next(
        (b for b in unlocked_items if b['code'] == pinned_code),
        unlocked_items[0] if unlocked_items else None,
    )

    track = metrics['track']
    active_view_count = sum(1 for b in catalog if b['is_unlocked'] or b.get('is_active_tier', True))

    return {
        'level': level_info,
        'student_track': track,
        'monthly_season': monthly_season,
        'summary': {
            'unlocked_count': len(unlocked_items),
            'total_count': len(catalog),
            'active_view_count': active_view_count,
            'completion_percent': round((len(unlocked_items) / max(1, len(catalog))) * 100),
            'streak_days': metrics['streak_days'],
            'best_streak': metrics['best_streak'],
            'total_focus_minutes': metrics['total_focus_minutes'],
            'total_season_questions': metrics['total_season_questions'],
            'season_medals_count': len(season_medals_history),
        },
        'pinned_badge': pinned_badge,
        'closest_target': closest_locked,
        'newly_unlocked': newly_minted,
        'categories': [
            {'code': 'all', 'label': 'Tüm Rozetler'},
            {'code': 'track_exam', 'label': track['tab_label']},
            {'code': 'streak', 'label': 'İstikrar & Seri'},
            {'code': 'focus', 'label': 'Odak & Soru Maratonu'},
            {'code': 'homework', 'label': 'Koç Ödev & 3K'},
            {'code': 'exam', 'label': 'Sınav Strateji & Kürsü'},
        ],
        'badges': catalog,
        'leaderboard': build_weekly_focus_leaderboard(scope, today) if include_leaderboard else None,
    }


@transaction.atomic
def update_student_achievement_preferences(
    scope: dict,
    *,
    pinned_badge_code: str | None = None,
    leaderboard_opt_in: bool | None = None,
) -> dict:
    account: StudentPortalAccount = scope['account']
    prefs = dict(account.preferences) if isinstance(account.preferences, dict) else {}

    if pinned_badge_code is not None:
        clean_code = str(pinned_badge_code).strip()
        if clean_code:
            current_bundle = build_student_achievements(scope, include_leaderboard=False)
            unlocked_codes = {
                b['code'] for b in current_bundle['badges'] if b['is_unlocked']
            }
            if clean_code not in unlocked_codes:
                raise StudentPortalError(
                    'badge_locked',
                    'Yalnızca kilidini açtığın bir rozeti profiline iğneleyebilirsin.',
                    400,
                )
            prefs['pinned_badge_code'] = clean_code
        else:
            prefs.pop('pinned_badge_code', None)

    if leaderboard_opt_in is not None:
        prefs['leaderboard_opt_in'] = bool(leaderboard_opt_in)

    account.preferences = prefs
    account.save(update_fields=['preferences', 'updated_at'])
    return build_student_achievements(scope, include_leaderboard=True)


def build_coach_student_achievements_preview(coach_user, student_id: int) -> dict:
    """
    Koçun `Student360` ekranında öğrencinin 50 seviyeli rütbesini, alan kulvarını,
    aylık sezon görev ilerlemesini ve kazandığı rozetleri görmesi için salt-okunur özet üretir.
    """
    if not user_can_access_student(coach_user, student_id):
        raise StudentPortalError('forbidden', 'Bu öğrenciye erişim yetkiniz yok.', 403)

    ogrenci = Ogrenci.objects.filter(pk=student_id).first()
    if ogrenci is None:
        raise StudentPortalError('not_found', 'Öğrenci bulunamadı.', 404)

    kayit = (
        OgrenciKayit.objects.select_related(
            'kurum', 'sube', 'egitim_yili', 'sinif', 'sinif__alan', 'sinif__sinif_seviyesi', 'alan', 'sinif_seviyesi',
        )
        .filter(ogrenci_id=ogrenci.id, aktif_mi=True)
        .order_by('-egitim_yili__aktif_mi', '-id')
        .first()
    )
    if kayit is None:
        return {
            'has_data': False,
            'level': _resolve_level_and_rank(0),
            'unlocked_badges': [],
            'closest_target': None,
        }

    account = StudentPortalAccount.objects.filter(ogrenci_id=ogrenci.id).first()
    synthetic_scope = {
        'ogrenci': ogrenci,
        'kayit': kayit,
        'account': account,
        'kurum_id': kayit.kurum_id,
        'sube_id': kayit.sube_id,
        'egitim_yili_id': kayit.egitim_yili_id,
        'term': None,
    }
    bundle = build_student_achievements(synthetic_scope, include_leaderboard=False)
    unlocked = sorted(
        [b for b in bundle['badges'] if b['is_unlocked']],
        key=lambda b: -int(b.get('xp_reward') or 0),
    )
    return {
        'has_data': True,
        'level': bundle['level'],
        'student_track': bundle['student_track'],
        'monthly_season': {
            'month_label': bundle['monthly_season']['month_label'],
            'completed_quests_count': bundle['monthly_season']['completed_quests_count'],
            'total_quests_count': bundle['monthly_season']['total_quests_count'],
            'season_medal_unlocked': bundle['monthly_season']['season_medal_unlocked'],
        },
        'summary': bundle['summary'],
        'pinned_badge': bundle['pinned_badge'],
        'unlocked_badges': unlocked[:8],
        'closest_target': bundle['closest_target'],
    }
