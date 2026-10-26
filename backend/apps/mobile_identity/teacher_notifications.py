"""Salt okunur öğretmen kutusu. Yazma, mesaj ve veli WhatsApp'ı yok."""
from __future__ import annotations

from datetime import datetime, time

from django.db.models import Q
from django.utils import timezone

from apps.academic.domain.class_schedule_notify_log import (
    ClassScheduleNotifyLog,
    ScheduleNotifyTarget,
)
from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    OturumDurumu,
    OturumTuru,
    TelafiDurumu,
)
from apps.website.models import Duyuru

from .services import MobileAuthError
from .teacher_read import ISTANBUL, _now, _page, _slice

CATEGORIES = (
    ('announcement', 'Kurum duyurusu'),
    ('schedule', 'Program'),
    ('private', 'Özel ders'),
)
CATEGORY_CODES = {code for code, _label in CATEGORIES}
FETCH_CAP = 200

PRIVATE_STATUSES = (
    OturumDurumu.IPTAL,
    OturumDurumu.OGRETMEN_GELMEDI,
    OturumDurumu.OGRENCI_GELMEDI,
    OturumDurumu.ISLENDI,
)
TELAFI_STATUSES = (
    TelafiDurumu.BEKLENIYOR,
    TelafiDurumu.PLANLANDI,
    TelafiDurumu.EDILDI,
    TelafiDurumu.VAZGECILDI,
)


def _at(value: datetime) -> str:
    if timezone.is_naive(value):
        value = value.replace(tzinfo=ISTANBUL)
    return value.astimezone(ISTANBUL).isoformat(timespec='seconds')


def _on(day) -> str:
    moment = datetime.combine(day, time.min, tzinfo=ISTANBUL)
    return _at(moment)


def _category(request) -> str | None:
    raw = (request.GET.get('category') or '').strip()
    if not raw:
        return None
    if raw not in CATEGORY_CODES:
        raise MobileAuthError('validation_error', 'Bu kategori açık değil.', 400)
    return raw


def _addressed_to_teacher(log: ClassScheduleNotifyLog, personel_id: int) -> bool:
    detail = log.detail if isinstance(log.detail, dict) else {}
    recipients = detail.get('recipients')
    if not isinstance(recipients, list):
        return False
    for row in recipients:
        if isinstance(row, dict) and row.get('kind') == 'ogretmen' and row.get('id') == personel_id:
            return True
    return False


def _announcements(scope) -> list[dict]:
    today = _now().date()
    rows = Duyuru.objects.filter(
        kurum_id=scope['context']['kurum_id'],
        aktif=True,
    ).filter(Q(yayin_tarihi__isnull=True) | Q(yayin_tarihi__lte=today)).order_by(
        '-yayin_tarihi', '-created_at', '-id',
    )[:FETCH_CAP]
    items = []
    for row in rows:
        when = row.yayin_tarihi or timezone.localtime(row.created_at, ISTANBUL).date()
        items.append({
            'id': f'announcement:{row.id}',
            'category': 'announcement',
            'title': row.baslik,
            'body': (row.ozet or '')[:280],
            'occurred_at': _on(when),
        })
    return items


def _schedules(scope) -> list[dict]:
    context = scope['context']
    personel_id = scope['personel'].id
    logs = (
        ClassScheduleNotifyLog.objects.filter(
            kurum_id=context['kurum_id'],
            target_kind=ScheduleNotifyTarget.TEACHER,
            term__sube_id=context['sube_id'],
            term__egitim_yili_id=context['egitim_yili_id'],
        )
        .select_related('term')
        .order_by('-sent_at', '-id')[:FETCH_CAP]
    )
    items = []
    for log in logs:
        if not _addressed_to_teacher(log, personel_id):
            continue
        items.append({
            'id': f'schedule:{log.id}',
            'category': 'schedule',
            'title': 'Ders programınız',
            'body': f'{log.term.name} · {log.get_status_display()}',
            'occurred_at': _at(log.sent_at),
        })
    return items


def _private_title(row: BirebirDersOturumu) -> str:
    name = f'{row.ogrenci.ad} {row.ogrenci.soyad}'.strip()
    if row.oturum_turu == OturumTuru.TELAFI or row.telafi_durumu in (
        TelafiDurumu.PLANLANDI,
        TelafiDurumu.BEKLENIYOR,
    ):
        label = 'Telafi'
    else:
        label = row.get_durum_display()
    return f'{label} · {name}'


def _private_lessons(scope) -> list[dict]:
    context = scope['context']
    rows = (
        BirebirDersOturumu.objects.filter(
            ogretmen_id=scope['personel'].id,
            kurum_id=context['kurum_id'],
            sube_id=context['sube_id'],
            egitim_yili_id=context['egitim_yili_id'],
            is_active=True,
        )
        .filter(
            Q(durum__in=PRIVATE_STATUSES)
            | Q(telafi_durumu__in=TELAFI_STATUSES)
            | Q(oturum_turu=OturumTuru.TELAFI)
        )
        .select_related('ogrenci', 'ders')
        .order_by('-updated_at', '-id')[:FETCH_CAP]
    )
    items = []
    for row in rows:
        start = row.start_time.strftime('%H:%M') if row.start_time else ''
        end = row.end_time.strftime('%H:%M') if row.end_time else ''
        items.append({
            'id': f'private:{row.id}',
            'category': 'private',
            'title': _private_title(row),
            'body': f'{row.session_date.isoformat()} {start}–{end} · {row.ders.ad}'.strip(),
            'occurred_at': _at(row.updated_at),
        })
    return items


def list_notifications(request, scope) -> dict:
    selected = _category(request)
    page, size = _page(request)
    loaders = {
        'announcement': _announcements,
        'schedule': _schedules,
        'private': _private_lessons,
    }
    codes = (selected,) if selected else tuple(loaders)
    rows = []
    for code in codes:
        rows.extend(loaders[code](scope))
    rows.sort(key=lambda row: (row['occurred_at'], row['id']), reverse=True)
    payload = _slice(rows, page, size)
    payload['timezone'] = 'Europe/Istanbul'
    payload['categories'] = [{'code': code, 'label': label} for code, label in CATEGORIES]
    return payload
