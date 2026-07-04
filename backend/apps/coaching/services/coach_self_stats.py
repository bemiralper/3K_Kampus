"""
Koç portalı — giriş yapmış koçun kendi performans istatistikleri.
"""
from datetime import date, timedelta

from django.utils import timezone

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.coaching.models import CoachStudentAssignment, GorusmeKaydi
from apps.coaching.services.coach_student_service import (
    _last_meeting_map,
    _needs_meeting_map,
    _risk_map,
)
from apps.gorev.domain.models import GorevAtama
from apps.gorev.domain.enums import GorevDurum

KONTROL_STATUSES = (
    ManualAssignment.Status.ASSIGNED,
    ManualAssignment.Status.IN_PROGRESS,
    ManualAssignment.Status.OVERDUE,
)

ACTIVE_GOREV_DURUMLAR = (
    GorevDurum.BEKLIYOR,
    GorevDurum.BASLADI,
    GorevDurum.DEVAM_EDIYOR,
)


def gorev_stats_for_user(user_id: int) -> dict:
    """Koç / personel için görev atama özeti."""
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    qs = GorevAtama.objects.filter(
        atanan_user_id=user_id,
        gorev__is_deleted=False,
    )

    active_qs = qs.filter(durum__in=ACTIVE_GOREV_DURUMLAR)

    return {
        'bekleyen': active_qs.count(),
        'bugun': active_qs.filter(
            gorev__son_tarih__gte=today_start,
            gorev__son_tarih__lt=today_end,
        ).count(),
        'geciken': active_qs.filter(gorev__son_tarih__lt=now).count(),
        'tamamlanan': qs.filter(durum=GorevDurum.TAMAMLANDI).count(),
        'tamamlanamayan': qs.filter(durum=GorevDurum.TAMAMLANMADI).count(),
    }

KONTROL_STATUSES = (
    ManualAssignment.Status.ASSIGNED,
    ManualAssignment.Status.IN_PROGRESS,
    ManualAssignment.Status.OVERDUE,
)


def _period_bounds():
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    month_start = today.replace(day=1)
    if today.month == 12:
        month_end = today.replace(day=31)
    else:
        month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    return week_start, week_end, month_start, month_end


def _count_in_period(qs, date_field, week_start, week_end, month_start, month_end):
    return {
        'toplam': qs.count(),
        'bu_hafta': qs.filter(**{
            f'{date_field}__gte': week_start,
            f'{date_field}__lte': week_end,
        }).count(),
        'bu_ay': qs.filter(**{
            f'{date_field}__gte': month_start,
            f'{date_field}__lte': month_end,
        }).count(),
    }


def get_coach_self_stats(coach_profile, user):
    """Giriş yapmış koç için özet istatistikler."""
    week_start, week_end, month_start, month_end = _period_bounds()
    today = date.today()

    student_ids = list(
        CoachStudentAssignment.objects.filter(
            coach=coach_profile,
            end_date__isnull=True,
        ).values_list('student_id', flat=True)
    )

    last_meeting = _last_meeting_map(student_ids)
    needs_meeting = _needs_meeting_map(student_ids, last_meeting)
    risk_map = _risk_map(student_ids)
    riskli = sum(
        1 for sid in student_ids
        if risk_map.get(sid, {}).get('risk_label') in ('high', 'medium', 'critical')
    )

    ogrenciler = {
        'aktif_ogrenci': coach_profile.current_student_count,
        'kapasite': coach_profile.capacity,
        'bos_kapasite': coach_profile.available_capacity,
        'riskli_ogrenci': riskli,
        'gorusme_bekleyen': sum(1 for sid in student_ids if needs_meeting.get(sid, False)),
    }

    base_assignments = ManualAssignment.objects.filter(
        coach=user,
        is_active=True,
    ).exclude(status__in=(ManualAssignment.Status.DRAFT, ManualAssignment.Status.CANCELLED))

    dated_assignments = base_assignments.filter(assigned_date__isnull=False)
    null_assigned = base_assignments.filter(assigned_date__isnull=True)
    dated_counts = _count_in_period(
        dated_assignments,
        'assigned_date__date',
        week_start,
        week_end,
        month_start,
        month_end,
    )
    created_counts = _count_in_period(
        null_assigned,
        'created_at__date',
        week_start,
        week_end,
        month_start,
        month_end,
    )
    verilen = {
        key: dated_counts[key] + created_counts[key]
        for key in ('toplam', 'bu_hafta', 'bu_ay')
    }

    odevler = {
        'verilen': verilen,
        'tamamlanan': base_assignments.filter(status=ManualAssignment.Status.COMPLETED).count(),
        'devam_eden': base_assignments.filter(
            status__in=(ManualAssignment.Status.ASSIGNED, ManualAssignment.Status.IN_PROGRESS),
        ).count(),
        'geciken': base_assignments.filter(status=ManualAssignment.Status.OVERDUE).count(),
        'bekleyen_kontrol': base_assignments.filter(status__in=KONTROL_STATUSES).count(),
    }

    gorusme_qs = GorusmeKaydi.objects.filter(koc=coach_profile)

    gorusmeler = {
        'ogrenci': _count_in_period(
            gorusme_qs.filter(gorusme_turu='ogrenci', durum='tamamlandi'),
            'gorusme_tarihi',
            week_start,
            week_end,
            month_start,
            month_end,
        ),
        'veli': _count_in_period(
            gorusme_qs.filter(gorusme_turu='veli', durum='tamamlandi'),
            'gorusme_tarihi',
            week_start,
            week_end,
            month_start,
            month_end,
        ),
        'tamamlanan_toplam': gorusme_qs.filter(durum='tamamlandi').count(),
        'bugun_planli': gorusme_qs.filter(
            gorusme_tarihi=today,
            durum='planlandi',
        ).count(),
    }

    return {
        'ogrenciler': ogrenciler,
        'odevler': odevler,
        'gorusmeler': gorusmeler,
        'gorevler': gorev_stats_for_user(user.id),
    }
