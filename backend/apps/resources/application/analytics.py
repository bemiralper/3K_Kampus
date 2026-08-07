"""Kaynak yönetim analizleri — aggregate sorgular."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from django.db.models import Count, Q, F
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.resources.models import ResourceBook, ResourcePublisher
from apps.resources.scoping import filter_books_for_request


def priority_band(student_count: int, incomplete: bool) -> str:
    if not incomplete:
        return 'dusuk'
    if student_count >= 10:
        return 'kritik'
    if student_count >= 5:
        return 'yuksek'
    if student_count >= 1:
        return 'orta'
    return 'dusuk'


def _parse_filters(request) -> dict[str, Any]:
    qp = request.query_params
    return {
        'ders_id': qp.get('ders') or None,
        'sinif_id': qp.get('sinif_seviyesi') or None,
        'publisher_id': qp.get('publisher') or None,
        'coach_id': qp.get('coach') or None,
        'icerik': qp.get('icerik') or None,  # tamam|eksik
        'date_from': qp.get('date_from') or None,
        'date_to': qp.get('date_to') or None,
        'min_students': qp.get('min_students') or None,
    }


def scoped_books(request, *, include_inactive: bool = False):
    qs = ResourceBook.objects.select_related('ders', 'publisher', 'book_type')
    qs = filter_books_for_request(qs, request)
    if not include_inactive:
        qs = qs.filter(aktif_mi=True)
    f = _parse_filters(request)
    if f['ders_id']:
        qs = qs.filter(ders_id=f['ders_id'])
    if f['sinif_id']:
        qs = qs.filter(
            Q(sinif_seviyesi_id=f['sinif_id']) | Q(sinif_seviyeleri__id=f['sinif_id'])
        ).distinct()
    if f['publisher_id']:
        if str(f['publisher_id']).lower() in ('null', 'none', 'empty', '0'):
            qs = qs.filter(publisher__isnull=True)
        else:
            qs = qs.filter(publisher_id=f['publisher_id'])
    if f['icerik'] == 'tamam':
        qs = qs.filter(icerik_tamamlandi_mi=True)
    elif f['icerik'] == 'eksik':
        qs = qs.filter(icerik_tamamlandi_mi=False)
    return qs


def _assignment_filter(request, book_qs_ids=None):
    from apps.student_resources.models import StudentResourceAssignment

    qs = StudentResourceAssignment.objects.filter(is_active=True)
    f = _parse_filters(request)
    if f['coach_id']:
        qs = qs.filter(coach_id=f['coach_id'])
    if f['ders_id']:
        qs = qs.filter(lesson_id=f['ders_id'])
    if f['date_from']:
        qs = qs.filter(assigned_at__date__gte=f['date_from'])
    if f['date_to']:
        qs = qs.filter(assigned_at__date__lte=f['date_to'])
    if book_qs_ids is not None:
        qs = qs.filter(resource_book_id__in=book_qs_ids)
    else:
        book_ids = scoped_books(request).values_list('id', flat=True)
        qs = qs.filter(resource_book_id__in=book_ids)
    return qs


def _intensity_map(book_ids):
    """Ödev/çalışma programında resource_book kullanım sayısı."""
    if not book_ids:
        return {}
    try:
        from apps.coaching.assignment_manual.models import AssignmentLesson
    except Exception:
        return {}
    rows = (
        AssignmentLesson.objects.filter(resource_book_id__in=book_ids)
        .values('resource_book_id')
        .annotate(c=Count('id'))
    )
    return {r['resource_book_id']: r['c'] for r in rows}


def summary(request) -> dict:
    books = scoped_books(request)
    book_ids = list(books.values_list('id', flat=True))
    assignments = _assignment_filter(request, book_ids)
    used_ids = set(assignments.values_list('resource_book_id', flat=True).distinct())
    tamam = books.filter(icerik_tamamlandi_mi=True).count()
    eksik = books.filter(icerik_tamamlandi_mi=False).count()
    from apps.resources.scoping import get_request_kurum_id
    kurum_id = get_request_kurum_id(request)
    pub_count = ResourcePublisher.objects.filter(kurum_id=kurum_id, aktif_mi=True).count() if kurum_id else 0
    unmatched = books.filter(publisher__isnull=True).count()
    return {
        'total_books': len(book_ids),
        'used_books': len(used_ids),
        'student_assignments': assignments.count(),
        'publisher_count': pub_count,
        'content_complete': tamam,
        'content_incomplete': eksik,
        'unmatched_publisher': unmatched,
        'idle_books': len(book_ids) - len(used_ids),
        'hot_incomplete': books.filter(
            icerik_tamamlandi_mi=False, id__in=used_ids,
        ).count(),
    }


def book_usage_rows(request) -> list[dict]:
    books = list(scoped_books(request))
    book_ids = [b.id for b in books]
    assignments = (
        _assignment_filter(request, book_ids)
        .values('resource_book_id')
        .annotate(
            student_count=Count('student_id', distinct=True),
            assignment_count=Count('id'),
        )
    )
    usage = {r['resource_book_id']: r for r in assignments}
    intensity = _intensity_map(book_ids)
    rows = []
    for b in books:
        u = usage.get(b.id, {})
        sc = u.get('student_count', 0) or 0
        incomplete = not b.icerik_tamamlandi_mi
        rows.append({
            'id': b.id,
            'ad': b.ad,
            'ders_id': b.ders_id,
            'ders_ad': getattr(b.ders, 'ad', '') or '',
            'publisher_id': b.publisher_id,
            'publisher_ad': b.yayinevi or '',
            'icerik_tamamlandi_mi': b.icerik_tamamlandi_mi,
            'student_count': sc,
            'assignment_count': u.get('assignment_count', 0) or 0,
            'intensity': intensity.get(b.id, 0),
            'priority': priority_band(sc, incomplete),
        })
    return rows


def top_books(request, metric: str = 'students', limit: int = 20) -> list[dict]:
    rows = book_usage_rows(request)
    key = 'intensity' if metric == 'intensity' else 'student_count'
    rows.sort(key=lambda r: (-r[key], r['ad']))
    return rows[:limit]


def publishers_report(request) -> list[dict]:
    rows = book_usage_rows(request)
    agg: dict[Any, dict] = {}
    for r in rows:
        pid = r['publisher_id'] or 0
        if pid not in agg:
            agg[pid] = {
                'publisher_id': r['publisher_id'],
                'publisher_ad': r['publisher_ad'] or 'Yayınevi yok',
                'book_count': 0,
                'student_count': 0,
                'intensity': 0,
            }
        agg[pid]['book_count'] += 1
        agg[pid]['student_count'] += r['student_count']
        agg[pid]['intensity'] += r['intensity']
    total_students = sum(a['student_count'] for a in agg.values()) or 1
    out = list(agg.values())
    for a in out:
        a['share_percent'] = round(100 * a['student_count'] / total_students, 1)
    out.sort(key=lambda x: -x['student_count'])
    return out


def by_lesson(request) -> list[dict]:
    rows = book_usage_rows(request)
    agg: dict[Any, dict] = {}
    for r in rows:
        did = r['ders_id']
        if did not in agg:
            agg[did] = {
                'ders_id': did,
                'ders_ad': r['ders_ad'],
                'book_count': 0,
                'used_books': 0,
                'content_complete': 0,
                'content_incomplete': 0,
                'student_assignments': 0,
            }
        a = agg[did]
        a['book_count'] += 1
        if r['student_count'] > 0:
            a['used_books'] += 1
        if r['icerik_tamamlandi_mi']:
            a['content_complete'] += 1
        else:
            a['content_incomplete'] += 1
        a['student_assignments'] += r['assignment_count']
    out = list(agg.values())
    out.sort(key=lambda x: -x['book_count'])
    return out


def incomplete_books(request) -> list[dict]:
    rows = [r for r in book_usage_rows(request) if not r['icerik_tamamlandi_mi']]
    rows.sort(key=lambda r: (-(r['student_count']), r['ad']))
    return rows


def intervention(request) -> list[dict]:
    rows = [
        r for r in book_usage_rows(request)
        if not r['icerik_tamamlandi_mi'] and r['student_count'] > 0
    ]
    rows.sort(key=lambda r: (-(r['student_count']), r['ad']))
    return rows


def priority_summary(request) -> dict:
    counts = {'kritik': 0, 'yuksek': 0, 'orta': 0, 'dusuk': 0}
    for r in book_usage_rows(request):
        counts[r['priority']] = counts.get(r['priority'], 0) + 1
    return counts


def usage_trend(request, months: int = 6) -> list[dict]:
    from apps.student_resources.models import StudentResourceAssignment

    book_ids = list(scoped_books(request).values_list('id', flat=True))
    start = timezone.now() - timedelta(days=31 * months)
    assigns = (
        StudentResourceAssignment.objects.filter(
            resource_book_id__in=book_ids,
            assigned_at__gte=start,
        )
        .annotate(month=TruncMonth('assigned_at'))
        .values('month')
        .annotate(c=Count('id'))
        .order_by('month')
    )
    intensity_by_month: dict[str, int] = defaultdict(int)
    try:
        from apps.coaching.assignment_manual.models import AssignmentLesson
        lessons = (
            AssignmentLesson.objects.filter(
                resource_book_id__in=book_ids,
                assignment__created_at__gte=start,
            )
            .annotate(month=TruncMonth('assignment__created_at'))
            .values('month')
            .annotate(c=Count('id'))
        )
        for row in lessons:
            if row['month']:
                intensity_by_month[row['month'].strftime('%Y-%m')] = row['c']
    except Exception:
        pass

    out = []
    for row in assigns:
        m = row['month']
        key = m.strftime('%Y-%m') if m else ''
        out.append({
            'month': key,
            'assignments': row['c'],
            'intensity': intensity_by_month.get(key, 0),
        })
    return out


def avg_per_student(request) -> list[dict]:
    from apps.student_resources.models import StudentResourceAssignment

    book_ids = list(scoped_books(request).values_list('id', flat=True))
    rows = (
        StudentResourceAssignment.objects.filter(
            is_active=True,
            resource_book_id__in=book_ids,
        )
        .values('lesson_id', 'lesson__ad')
        .annotate(
            student_count=Count('student_id', distinct=True),
            assignment_count=Count('id'),
        )
    )
    out = []
    for r in rows:
        sc = r['student_count'] or 1
        out.append({
            'ders_id': r['lesson_id'],
            'ders_ad': r['lesson__ad'] or '',
            'student_count': r['student_count'],
            'assignment_count': r['assignment_count'],
            'avg_resources': round(r['assignment_count'] / sc, 2),
        })
    out.sort(key=lambda x: -x['avg_resources'])
    return out


def by_coach(request) -> list[dict]:
    from apps.student_resources.models import StudentResourceAssignment

    book_ids = list(scoped_books(request).values_list('id', flat=True))
    rows = (
        StudentResourceAssignment.objects.filter(
            is_active=True,
            resource_book_id__in=book_ids,
            coach__isnull=False,
        )
        .values('coach_id', 'coach__first_name', 'coach__last_name')
        .annotate(
            student_count=Count('student_id', distinct=True),
            resource_count=Count('id'),
        )
    )
    out = []
    for r in rows:
        sc = r['student_count'] or 1
        name = f"{r['coach__first_name'] or ''} {r['coach__last_name'] or ''}".strip()
        out.append({
            'coach_id': r['coach_id'],
            'coach_ad': name or f"#{r['coach_id']}",
            'student_count': r['student_count'],
            'resource_count': r['resource_count'],
            'avg_resources': round(r['resource_count'] / sc, 2),
        })
    out.sort(key=lambda x: x['avg_resources'])
    return out


def lesson_publisher_matrix(request) -> dict:
    rows = book_usage_rows(request)
    publishers = sorted({
        (r['publisher_id'], r['publisher_ad'] or 'Yayınevi yok')
        for r in rows
    }, key=lambda x: x[1])
    lessons = sorted({
        (r['ders_id'], r['ders_ad']) for r in rows
    }, key=lambda x: x[1])
    cell: dict[tuple, int] = defaultdict(int)
    for r in rows:
        cell[(r['ders_id'], r['publisher_id'])] += r['student_count']
    matrix = []
    for did, dad in lessons:
        row = {'ders_id': did, 'ders_ad': dad, 'values': {}}
        for pid, pad in publishers:
            row['values'][str(pid or 0)] = cell[(did, pid)]
        matrix.append(row)
    return {
        'publishers': [
            {'id': pid, 'ad': pad} for pid, pad in publishers
        ],
        'rows': matrix,
    }


def usage_rate(request) -> dict:
    s = summary(request)
    total = s['total_books'] or 1
    return {
        'total_books': s['total_books'],
        'used_books': s['used_books'],
        'idle_books': s['idle_books'],
        'usage_rate_percent': round(100 * s['used_books'] / total, 1),
    }


def idle_books(request, days: int | None = None) -> list[dict]:
    """days=None: hiç kullanılmayan; days=90/180: son N günde atama yok."""
    rows = book_usage_rows(request)
    if days is None:
        return [r for r in rows if r['student_count'] == 0 and r['intensity'] == 0]

    from apps.student_resources.models import StudentResourceAssignment
    cutoff = timezone.now() - timedelta(days=days)
    book_ids = [r['id'] for r in rows]
    recent = set(
        StudentResourceAssignment.objects.filter(
            resource_book_id__in=book_ids,
            assigned_at__gte=cutoff,
        ).values_list('resource_book_id', flat=True)
    )
    # Ayrıca intensity recent sayılabilir; basit: atama yoksa atıl
    return [r for r in rows if r['id'] not in recent]


def hot_incomplete(request, min_students: int = 5) -> list[dict]:
    rows = [
        r for r in book_usage_rows(request)
        if not r['icerik_tamamlandi_mi'] and r['student_count'] >= min_students
    ]
    rows.sort(key=lambda r: (-r['student_count'], -r['intensity']))
    return rows


def pool_growth(request, months: int = 6) -> list[dict]:
    from apps.student_resources.models import StudentResourceAssignment

    book_ids = list(scoped_books(request).values_list('id', flat=True))
    start = timezone.now() - timedelta(days=31 * months)
    added = (
        StudentResourceAssignment.objects.filter(
            resource_book_id__in=book_ids,
            assigned_at__gte=start,
        )
        .annotate(month=TruncMonth('assigned_at'))
        .values('month')
        .annotate(c=Count('id'))
        .order_by('month')
    )
    removed = (
        StudentResourceAssignment.objects.filter(
            resource_book_id__in=book_ids,
            is_active=False,
            deleted_at__gte=start,
        )
        .annotate(month=TruncMonth('deleted_at'))
        .values('month')
        .annotate(c=Count('id'))
        .order_by('month')
    )
    rem_map = {
        (r['month'].strftime('%Y-%m') if r['month'] else ''): r['c']
        for r in removed
    }
    out = []
    prev = None
    for r in added:
        key = r['month'].strftime('%Y-%m') if r['month'] else ''
        add_c = r['c']
        rem_c = rem_map.get(key, 0)
        net = add_c - rem_c
        growth = None
        if prev is not None and prev != 0:
            growth = round(100 * (add_c - prev) / prev, 1)
        out.append({
            'month': key,
            'added': add_c,
            'removed': rem_c,
            'net': net,
            'growth_percent': growth,
        })
        prev = add_c
    return out


def churn(request) -> list[dict]:
    from apps.student_resources.models import StudentResourceAssignment

    book_ids = list(scoped_books(request).values_list('id', flat=True))
    books = {b.id: b for b in ResourceBook.objects.filter(id__in=book_ids).select_related('publisher', 'ders')}
    added = {
        r['resource_book_id']: r['c']
        for r in StudentResourceAssignment.objects.filter(
            resource_book_id__in=book_ids,
        ).values('resource_book_id').annotate(c=Count('id'))
    }
    removed = {
        r['resource_book_id']: r['c']
        for r in StudentResourceAssignment.objects.filter(
            resource_book_id__in=book_ids,
            is_active=False,
            deleted_at__isnull=False,
        ).values('resource_book_id').annotate(c=Count('id'))
    }
    out = []
    for bid in book_ids:
        a = added.get(bid, 0)
        r = removed.get(bid, 0)
        if a == 0 and r == 0:
            continue
        b = books.get(bid)
        out.append({
            'id': bid,
            'ad': b.ad if b else '',
            'publisher_ad': b.yayinevi if b else '',
            'ders_ad': getattr(b.ders, 'ad', '') if b else '',
            'added': a,
            'removed': r,
            'net': a - r,
        })
    out.sort(key=lambda x: -abs(x['net']))
    return out[:50]


def global_search(request, q: str) -> dict:
    q = (q or '').strip()
    if not q:
        return {'books': [], 'publishers': [], 'lessons': []}
    books = scoped_books(request).filter(
        Q(ad__icontains=q) | Q(publisher__ad__icontains=q) | Q(ders__ad__icontains=q)
    )[:20]
    from apps.resources.scoping import get_request_kurum_id
    kurum_id = get_request_kurum_id(request)
    pubs = ResourcePublisher.objects.filter(
        kurum_id=kurum_id, ad__icontains=q,
    )[:10] if kurum_id else []
    lessons = (
        scoped_books(request)
        .filter(ders__ad__icontains=q)
        .values('ders_id', 'ders__ad')
        .annotate(book_count=Count('id'))
        .order_by('-book_count')[:10]
    )
    return {
        'books': [
            {
                'id': b.id,
                'ad': b.ad,
                'publisher_ad': b.yayinevi,
                'ders_ad': getattr(b.ders, 'ad', ''),
                'icerik_tamamlandi_mi': b.icerik_tamamlandi_mi,
            }
            for b in books
        ],
        'publishers': [
            {'id': p.id, 'ad': p.ad, 'kisa_ad': p.kisa_ad}
            for p in pubs
        ],
        'lessons': [
            {
                'ders_id': r['ders_id'],
                'ders_ad': r['ders__ad'],
                'book_count': r['book_count'],
            }
            for r in lessons
        ],
    }


def students_for_book(request, book_id: int) -> list[dict]:
    from apps.student_resources.models import StudentResourceAssignment

    qs = _assignment_filter(request, [book_id]).select_related('student')
    return [
        {
            'assignment_id': a.id,
            'student_id': a.student_id,
            'ad': getattr(a.student, 'ad', ''),
            'soyad': getattr(a.student, 'soyad', ''),
            'assigned_at': a.assigned_at.isoformat() if a.assigned_at else None,
        }
        for a in qs[:200]
    ]


def action_items(request) -> dict:
    s = summary(request)
    return {
        'hot_incomplete': s['hot_incomplete'],
        'content_incomplete': s['content_incomplete'],
        'idle_books': s['idle_books'],
        'unmatched_publisher': s['unmatched_publisher'],
    }
