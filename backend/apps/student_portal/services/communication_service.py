"""
Öğrenci Portalı — Portal İçi Koç Mesajlaşması, Duyurular, Kampüs Story Kapsülleri
ve Saate Duyarlı "Yaşayan Ana Ekran" (Living Home) Servisi.
"""
from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.coaching.models import CoachStudentAssignment
from apps.coaching.services.coach_access import get_coach_profile, user_can_access_student
from apps.website.models import Duyuru

from ..auth import ISTANBUL, StudentPortalError
from ..models import StudentCoachMessage
from .exam_service import build_student_exams_overview, build_upcoming_exam_boarding_pass
from .schedule_service import build_campus_life_and_attendance, build_unified_schedule
from .study_service import build_study_workspace
from .achievement_service import build_student_achievements


def list_student_announcements(scope: dict) -> dict:
    """Kurum duyurularını okunma durumuyla birlikte döndürür."""
    today = timezone.localtime(timezone.now(), ISTANBUL).date()
    account = scope['account']
    read_ids = set(account.read_announcement_ids or []) if isinstance(account.read_announcement_ids, list) else set()

    rows = (
        Duyuru.objects.filter(
            kurum_id=scope['kurum_id'],
            aktif=True,
        )
        .filter(Q(yayin_tarihi__isnull=True) | Q(yayin_tarihi__lte=today))
        .order_by('-yayin_tarihi', '-created_at', '-id')[:50]
    )

    items = []
    unread_count = 0
    for row in rows:
        is_read = row.id in read_ids
        if not is_read:
            unread_count += 1
        pub_date = row.yayin_tarihi or timezone.localtime(row.created_at, ISTANBUL).date()
        items.append({
            'id': row.id,
            'title': row.baslik,
            'summary': row.ozet or '',
            'content': getattr(row, 'icerik', '') or row.ozet or '',
            'published_date': pub_date.isoformat(),
            'is_read': is_read,
        })

    return {
        'unread_count': unread_count,
        'items': items,
    }


def mark_announcements_read(scope: dict, ids: list[int] | None = None) -> dict:
    account = scope['account']
    current = set(account.read_announcement_ids or []) if isinstance(account.read_announcement_ids, list) else set()

    if ids:
        for raw_id in ids:
            try:
                current.add(int(raw_id))
            except (TypeError, ValueError):
                continue
    else:
        today = timezone.localtime(timezone.now(), ISTANBUL).date()
        all_ids = Duyuru.objects.filter(
            kurum_id=scope['kurum_id'],
            aktif=True,
        ).filter(Q(yayin_tarihi__isnull=True) | Q(yayin_tarihi__lte=today)).values_list('id', flat=True)[:100]
        current.update(all_ids)

    account.read_announcement_ids = sorted(current)[-300:]
    account.save(update_fields=['read_announcement_ids', 'updated_at'])
    return list_student_announcements(scope)


# ─────────────────────────────────────────────────────────────────────────────
# Portal İçi Öğrenci <-> Koç Çift Yönlü Mesajlaşma
# ─────────────────────────────────────────────────────────────────────────────

def _serialize_portal_message(msg: StudentCoachMessage) -> dict:
    sender_name = ''
    if msg.sender_user:
        sender_name = msg.sender_user.get_full_name() or msg.sender_user.username
    return {
        'id': msg.id,
        'sender_kind': msg.sender_kind,
        'sender_name': sender_name,
        'body': msg.body,
        'created_at': timezone.localtime(msg.created_at, ISTANBUL).isoformat(timespec='seconds'),
        'read_by_student': msg.read_by_student_at is not None,
        'read_by_coach': msg.read_by_coach_at is not None,
    }


def list_student_coach_messages(scope: dict, *, mark_read: bool = True) -> dict:
    ogrenci = scope['ogrenci']
    coach_asgn = scope['coach_assignment']
    now = timezone.now()

    if mark_read:
        StudentCoachMessage.objects.filter(
            student_id=ogrenci.id,
            sender_kind=StudentCoachMessage.SenderKind.COACH,
            read_by_student_at__isnull=True,
        ).update(read_by_student_at=now)

    rows = list(
        StudentCoachMessage.objects.select_related('sender_user')
        .filter(student_id=ogrenci.id, kurum_id=scope['kurum_id'])
        .order_by('-created_at', '-id')[:120]
    )
    rows.reverse()

    coach_info = None
    if coach_asgn and coach_asgn.coach and coach_asgn.coach.teacher:
        t = coach_asgn.coach.teacher
        coach_info = {
            'coach_id': coach_asgn.coach_id,
            'full_name': f'{t.ad} {t.soyad}'.strip(),
            'photo_url': t.fotograf.url if t.fotograf else None,
        }

    unread_count = StudentCoachMessage.objects.filter(
        student_id=ogrenci.id,
        sender_kind=StudentCoachMessage.SenderKind.COACH,
        read_by_student_at__isnull=True,
    ).count()

    return {
        'coach': coach_info,
        'can_send': coach_info is not None,
        'unread_count': unread_count,
        'messages': [_serialize_portal_message(m) for m in rows],
    }


@transaction.atomic
def send_student_message_to_coach(scope: dict, body_text: str) -> dict:
    text = (body_text or '').strip()
    if not text:
        raise StudentPortalError('validation_error', 'Mesaj boş olamaz.', 400)
    if len(text) > 2000:
        raise StudentPortalError('validation_error', 'Mesaj en fazla 2000 karakter olabilir.', 400)

    coach_asgn = scope['coach_assignment']
    if coach_asgn is None or coach_asgn.coach is None:
        raise StudentPortalError(
            'no_coach',
            'Şu anda aktif bir koç atamanız bulunmadığı için mesaj gönderilemiyor.',
            400,
        )

    now = timezone.now()
    msg = StudentCoachMessage.objects.create(
        kurum_id=scope['kurum_id'],
        sube_id=scope['sube_id'],
        student_id=scope['ogrenci'].id,
        coach_id=coach_asgn.coach_id,
        sender_kind=StudentCoachMessage.SenderKind.STUDENT,
        sender_user=scope['user'],
        body=text,
        read_by_student_at=now,
    )
    return _serialize_portal_message(msg)


# Koç Portalı (Student360) için yardımcı okuma/yazma servisi
def coach_list_portal_messages(coach_user, student_id: int) -> dict:
    if not user_can_access_student(coach_user, student_id):
        raise StudentPortalError('forbidden', 'Bu öğrenciye erişim yetkiniz yok.', 403)

    now = timezone.now()
    StudentCoachMessage.objects.filter(
        student_id=student_id,
        sender_kind=StudentCoachMessage.SenderKind.STUDENT,
        read_by_coach_at__isnull=True,
    ).update(read_by_coach_at=now)

    rows = list(
        StudentCoachMessage.objects.select_related('sender_user')
        .filter(student_id=student_id)
        .order_by('-created_at', '-id')[:120]
    )
    rows.reverse()
    return {
        'student_id': student_id,
        'messages': [_serialize_portal_message(m) for m in rows],
    }


@transaction.atomic
def coach_send_portal_message(coach_user, student_id: int, body_text: str) -> dict:
    if not user_can_access_student(coach_user, student_id):
        raise StudentPortalError('forbidden', 'Bu öğrenciye erişim yetkiniz yok.', 403)

    text = (body_text or '').strip()
    if not text:
        raise StudentPortalError('validation_error', 'Mesaj boş olamaz.', 400)
    if len(text) > 2000:
        raise StudentPortalError('validation_error', 'Mesaj en fazla 2000 karakter olabilir.', 400)

    from apps.ogrenci.domain.models import Ogrenci

    student = Ogrenci.objects.filter(pk=student_id).first()
    if student is None:
        raise StudentPortalError('not_found', 'Öğrenci bulunamadı.', 404)

    cp = get_coach_profile(coach_user)
    if cp is None:
        asgn = (
            CoachStudentAssignment.objects.filter(
                student_id=student.id, is_primary=True, end_date__isnull=True,
            )
            .first()
        )
        cp_id = asgn.coach_id if asgn else None
    else:
        cp_id = cp.id

    now = timezone.now()
    msg = StudentCoachMessage.objects.create(
        kurum_id=student.kurum_id,
        sube_id=student.sube_id,
        student_id=student.id,
        coach_id=cp_id,
        sender_kind=StudentCoachMessage.SenderKind.COACH,
        sender_user=coach_user,
        body=text,
        read_by_coach_at=now,
    )
    return _serialize_portal_message(msg)


# ─────────────────────────────────────────────────────────────────────────────
# Saate Göre Şekil Değiştiren "Yaşayan Ana Ekran" (Context-Aware Living Home)
# ─────────────────────────────────────────────────────────────────────────────

def build_living_home(scope: dict) -> dict:
    """
    Günün saatine ve bağlamına göre ana ekran kokpitini oluşturur:
    - Bağlamsal mod (`exam_day`, `campus_hours`, `evening_focus`)
    - Sıradaki / Şu anki canlı ders kapsülü
    - Dijital Sınav Giriş Kartı (Boarding Pass)
    - Kampüs Story Kapsülleri (Yeni duyuru, koç strateji notu, rekor, son rozet)
    - Bugünün çalışma görevleri ve seri özeti
    - Kütüphane masa & dolap kartı
    """
    now_dt = timezone.localtime(timezone.now(), ISTANBUL)
    today = now_dt.date()

    # 7 günlük yakın takvim (bugün + yaklaşanlar)
    schedule = build_unified_schedule(scope, today, today + timedelta(days=7))
    today_schedule = schedule['days'][0]['items'] if schedule['days'] else []
    upcoming_items = []
    for day_entry in schedule['days'][1:]:
        for it in day_entry['items']:
            if it['kind'] in ('exam', 'private_lesson', 'homework', 'holiday', 'event'):
                upcoming_items.append({**it, 'date': day_entry['date']})
    upcoming_items = upcoming_items[:6]

    # Çalışma programı & bugünün blokları
    study = build_study_workspace(scope)
    today_study_day = None
    if study['active_program']:
        today_study_day = next(
            (d for d in study['active_program']['days'] if d['is_today']),
            None,
        )

    # Sınav özeti ve biniş kartı
    exams_overview = build_student_exams_overview(scope)
    boarding_pass = exams_overview['upcoming_boarding_pass']
    latest_exam = exams_overview['kpi']

    # Kampüs (masa/dolap/devam) + Duyuru + Koç mesaj sayacı + Başarı & Lig spotu
    campus = build_campus_life_and_attendance(scope)
    announcements = list_student_announcements(scope)
    achievements = build_student_achievements(scope, include_leaderboard=True)
    unread_coach_msgs = StudentCoachMessage.objects.filter(
        student_id=scope['ogrenci'].id,
        sender_kind=StudentCoachMessage.SenderKind.COACH,
        read_by_student_at__isnull=True,
    ).count()

    # Şu anki / Sıradaki ders kapsülü
    live_or_next_lesson = next(
        (it for it in today_schedule if it['state'] == 'live'),
        None,
    ) or next(
        (it for it in today_schedule if it['state'] == 'upcoming' and not it['all_day']),
        None,
    )

    # Bağlamsal mod seçimi
    hour = now_dt.hour
    if boarding_pass and boarding_pass['is_today']:
        context_mode = 'exam_day'
        greeting_subtitle = 'Sınav günü! Salon ve sıra numaran hazır, başarılar dileriz.'
    elif hour < 16 and live_or_next_lesson:
        context_mode = 'campus_hours'
        greeting_subtitle = (
            f"Şu an {live_or_next_lesson['title']} dersindesin."
            if live_or_next_lesson['state'] == 'live'
            else f"Sıradaki dersin: {live_or_next_lesson['start_time']} {live_or_next_lesson['title']}"
        )
    else:
        context_mode = 'evening_focus'
        remaining = (
            today_study_day['total_block_count'] - today_study_day['completed_block_count']
            if today_study_day
            else 0
        )
        greeting_subtitle = (
            f'Akşam odak zamanı · Bugün {remaining} çalışma görevin seni bekliyor.'
            if remaining > 0
            else 'Günün dersleri tamamlandı · Tekrar veya soru çözümü için harika bir saat.'
        )

    greeting_title = (
        f"Günaydın, {scope['ogrenci'].ad}" if 5 <= hour < 12
        else f"İyi günler, {scope['ogrenci'].ad}" if 12 <= hour < 18
        else f"İyi akşamlar, {scope['ogrenci'].ad}"
    )

    # Kampüs Story Kapsülleri (kaydırılabilir hikayeler)
    stories = []
    if boarding_pass:
        stories.append({
            'id': f"story-exam-{boarding_pass['exam_id']}",
            'badge': 'Sınav Kartı',
            'tone': 'orange',
            'title': boarding_pass['exam_name'],
            'body': f"{boarding_pass['exam_date']} · Saat {boarding_pass['start_time']} · {boarding_pass['room_name']}"
                    + (f" · Sıra {boarding_pass['seat_no']}" if boarding_pass['seat_no'] else ''),
            'cta_label': 'Sınavlara Git',
            'cta_href': '/ogrenci/sinavlar',
        })

    if study['active_program'] and study['active_program']['coach_note']:
        stories.append({
            'id': f"story-coach-note-{study['active_program']['id']}",
            'badge': 'Koçunun Strateji Notu',
            'tone': 'violet',
            'title': study['active_program']['coach_name'] or 'Koçundan Haftalık Mesaj',
            'body': study['active_program']['coach_note'],
            'cta_label': 'Çalışma Planını Aç',
            'cta_href': '/ogrenci/calisma',
        })

    hw_summary = study.get('assignments_summary') or {}
    next_hw = hw_summary.get('next_due')
    if next_hw:
        due_txt = (
            'Bugün kontrol günü!'
            if next_hw.get('is_due_today')
            else (
                'Kontrol tarihi geçti'
                if next_hw.get('is_overdue')
                else (
                    f"{next_hw['days_left']} gün kaldı ({next_hw['due_date']})"
                    if next_hw.get('days_left') is not None
                    else (next_hw.get('due_date') or '')
                )
            )
        )
        stories.append({
            'id': f"story-hw-{next_hw['id']}",
            'badge': 'Koç Ödevin',
            'tone': 'orange' if (next_hw.get('is_overdue') or next_hw.get('is_due_today')) else 'violet',
            'title': next_hw['title'],
            'body': f"{due_txt} · {next_hw['ready_task_count']}/{next_hw['task_count']} test hazırlandı.",
            'cta_label': 'Ödev İçeriğini Aç',
            'cta_href': f"/ogrenci/calisma?tab=odevler&assignment={next_hw['id']}",
        })

    if latest_exam:
        stories.append({
            'id': f"story-latest-exam-{latest_exam['latest_exam_id']}",
            'badge': 'Son Sınavın',
            'tone': 'blue',
            'title': f"{latest_exam['latest_exam_name']} · {latest_exam['latest_net']} Net",
            'body': (
                f"Kurum sırası: {latest_exam['latest_kurum_rank']}/{latest_exam['latest_kurum_total']}"
                if latest_exam['latest_kurum_rank']
                else f"Kişisel en yüksek netin: {latest_exam['personal_best_net']}"
            ),
            'cta_label': 'Analizi İncele',
            'cta_href': f"/ogrenci/sinavlar?exam={latest_exam['latest_exam_id']}",
        })

    for ann in announcements['items'][:2]:
        stories.append({
            'id': f"story-ann-{ann['id']}",
            'badge': 'Yeni Duyuru' if not ann['is_read'] else 'Kampüs Duyurusu',
            'tone': 'emerald' if not ann['is_read'] else 'slate',
            'title': ann['title'],
            'body': ann['summary'] or ann['content'][:220],
            'cta_label': 'Duyuruları Gör',
            'cta_href': '/ogrenci/iletisim?tab=duyurular',
        })

    if study['badges']:
        top_badge = study['badges'][0]
        stories.append({
            'id': f"story-badge-{top_badge['id']}",
            'badge': 'Son Rozetin',
            'tone': 'gold',
            'title': f"{top_badge['icon']} {top_badge['title']}",
            'body': top_badge['description'] or 'İstikrarlı çalışmanla yeni rozet kazandın!',
            'cta_label': 'Rozetlerim',
            'cta_href': '/ogrenci/calisma',
        })

    return {
        'server_time': now_dt.isoformat(timespec='seconds'),
        'context_mode': context_mode,
        'greeting_title': greeting_title,
        'greeting_subtitle': greeting_subtitle,
        'live_or_next_lesson': live_or_next_lesson,
        'boarding_pass': boarding_pass,
        'stories': stories,
        'today_schedule': today_schedule,
        'upcoming_items': upcoming_items,
        'today_study': today_study_day,
        'study_summary': {
            'has_program': study['active_program'] is not None,
            'week_completion_percent': study['active_program']['completion_percent'] if study['active_program'] else 0,
            'streak_days': study['streak_days'],
            'total_focused_minutes': study['total_focused_minutes'],
            'badges_count': achievements['summary']['unlocked_count'],
            'total_badges_count': achievements['summary']['total_count'],
            'active_homework_count': int(hw_summary.get('active_count') or 0),
        },
        'homework_summary': hw_summary,
        'achievements_spotlight': {
            'level': achievements['level'],
            'student_track': achievements['student_track'],
            'monthly_season': {
                'month_label': achievements['monthly_season']['month_label'],
                'days_remaining': achievements['monthly_season']['days_remaining'],
                'completed_quests_count': achievements['monthly_season']['completed_quests_count'],
                'total_quests_count': achievements['monthly_season']['total_quests_count'],
                'season_medal_unlocked': achievements['monthly_season']['season_medal_unlocked'],
            },
            'pinned_badge': achievements['pinned_badge'],
            'closest_target': achievements['closest_target'],
            'unlocked_count': achievements['summary']['unlocked_count'],
            'total_count': achievements['summary']['total_count'],
            'league': {
                'scope_label': achievements['leaderboard']['scope_label'],
                'my_rank': achievements['leaderboard']['my_rank'],
                'my_weekly_focus_minutes': achievements['leaderboard']['my_weekly_focus_minutes'],
                'minutes_to_overtake_next': achievements['leaderboard']['minutes_to_overtake_next'],
            } if achievements.get('leaderboard') else None,
        },
        'latest_exam': latest_exam,
        'campus': {
            'seat': campus['seat'],
            'locker': campus['locker'],
            'attendance_rate': campus['attendance']['rate_percent'],
        },
        'counters': {
            'unread_coach_messages': unread_coach_msgs,
            'unread_announcements': announcements['unread_count'],
        },
    }
