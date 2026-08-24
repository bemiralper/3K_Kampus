"""
Akademik sınıf yoklama WhatsApp bildirimi — ders / günlük periyot.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Iterable

from django.db import transaction
from django.utils import timezone

from apps.academic.domain.class_period_attendance import (
    ClassAttendanceNotificationLog,
    ClassAttendanceNotifySource,
    ClassPeriodAttendanceRecord,
    ClassPeriodAttendanceSession,
)
from apps.academic.domain.lesson_attendance import (
    LessonAttendanceRecord,
    StudentAttendanceStatus,
)
from apps.academic.domain.lesson_session import LessonSession
from apps.communication.application.communication_service import MessageSource
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.notification_dispatcher import (
    NotificationRecipient,
    dispatch_event,
)
from apps.communication.application.variable_resolver import (
    aktif_sinif_ad,
    resolve_variables,
)
from apps.communication.domain.enums import RecipientType

logger = logging.getLogger(__name__)

SOURCE_MODULE = 'akademik_yoklama'
OPT_IN_CATEGORY = 'devamsizlik'

STATUS_TO_EVENT = {
    StudentAttendanceStatus.ABSENT: 'sinif.yoklama.gelmedi',
    StudentAttendanceStatus.LATE: 'sinif.yoklama.gec',
}

NOTIFY_STATUSES = frozenset(STATUS_TO_EVENT)


@dataclass
class ClassNotifyItem:
    ogrenci_id: int
    ogrenci_ad: str
    recipient_type: str
    recipient_id: int
    recipient_ad: str
    telefon: str
    event_key: str
    status: str
    body: str
    skip_reason: str = ''
    late_time: Any = None


@dataclass
class ClassNotifyPreview:
    source_type: str
    source_id: int
    oturum_ad: str
    recipients: list[ClassNotifyItem] = field(default_factory=list)
    pending_count: int = 0


@dataclass
class ClassNotifySendResult:
    sent: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)


def _mask_phone(phone: str) -> str:
    if len(phone) > 6:
        return phone[:4] + '***' + phone[-2:]
    return '***'


def _session_label_lesson(session: LessonSession) -> str:
    ders = getattr(session.ders, 'ad', None) or 'Ders'
    start = session.start_time.strftime('%H:%M') if session.start_time else ''
    return f'{ders} {start}'.strip()


def _session_label_period(session: ClassPeriodAttendanceSession) -> str:
    return session.period_label


def _format_hm(value) -> str:
    if not value:
        return ''
    if hasattr(value, 'strftime'):
        return value.strftime('%H:%M')
    raw = str(value).strip()
    return raw[:5] if raw else ''


def _build_context(
    *,
    ogrenci,
    veli=None,
    kurum=None,
    sinif_ad: str = '',
    oturum_ad: str = '',
    session_date=None,
    late_time=None,
    status: str = '',
) -> dict[str, str]:
    now = timezone.localtime()
    tarih = session_date.strftime('%d.%m.%Y') if session_date else now.strftime('%d.%m.%Y')
    giris = _format_hm(late_time)
    saat = giris if status == StudentAttendanceStatus.LATE else now.strftime('%H:%M')
    if status == StudentAttendanceStatus.LATE and not saat:
        saat = now.strftime('%H:%M')
    ctx = {
        'ogrenci_ad': f'{getattr(ogrenci, "ad", "")} {getattr(ogrenci, "soyad", "")}'.strip(),
        'veli_ad': getattr(veli, 'tam_ad', '') if veli else '',
        'kurum_ad': getattr(kurum, 'ad', '') if kurum else '',
        'sube': getattr(getattr(ogrenci, 'sube', None), 'ad', '') or '',
        'sinif': sinif_ad or aktif_sinif_ad(ogrenci),
        'tarih': tarih,
        'yoklama_tarihi': tarih,
        'saat': saat,
        'oturum_ad': oturum_ad,
        'giris_saati': giris or saat if status == StudentAttendanceStatus.LATE else '',
        'cikis_saati': '',
        'salon_ad': '',
        'ders_no': '',
    }
    return ctx


_NUMBERED_FALLBACK = {'1': 'ogrenci_ad', '2': 'tarih', '3': 'sinif', '4': 'saat'}


def _apply_variable_map(body: str, mapping) -> str:
    if not body:
        return ''
    merged = dict(_NUMBERED_FALLBACK)
    if isinstance(mapping, dict):
        merged.update({str(k): str(v) for k, v in mapping.items() if v})
    for num, name in merged.items():
        body = body.replace('{{' + num + '}}', '{{' + name + '}}')
    return body


def _default_body(event_key: str, recipient_type: str, ctx: dict[str, str]) -> str:
    from apps.communication.application.notification_events import get_event

    event = get_event(event_key)
    if not event:
        return ''
    template = (event.default_bodies or {}).get(recipient_type) or ''
    return resolve_variables(template, ctx)


def _resolved_body(
    kurum_id: int,
    event_key: str,
    recipient_type: str,
    ctx: dict[str, str],
    *,
    sube_id: int | None = None,
) -> str:
    """Bağlı / keşfedilen Meta (veya LMS) gövdesi; yoksa katalog varsayılanı."""
    from apps.communication.application.notification_template_resolver import (
        display_template_body,
        resolve_binding,
    )

    resolved = resolve_binding(
        kurum_id, event_key, recipient_type, sube_id=sube_id,
    )
    raw = display_template_body(resolved) or resolved.body or ''
    mapping = getattr(resolved.meta_template, 'variable_map_json', None)
    raw = _apply_variable_map(raw, mapping)
    filled = resolve_variables(raw, ctx)
    return filled or _default_body(event_key, recipient_type, ctx)


def _already_sent(
    *,
    source_type: str,
    source_id: int,
    ogrenci_id: int,
    recipient_type: str,
    recipient_id: int,
    event_key: str,
) -> bool:
    return ClassAttendanceNotificationLog.objects.filter(
        source_type=source_type,
        source_id=source_id,
        ogrenci_id=ogrenci_id,
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        event_key=event_key,
    ).exists()


class ClassAttendanceNotificationService:
    def _load_source(
        self,
        source_type: str,
        source_id: int,
    ) -> tuple[Any, str, Any, int | None, list[tuple[int, str, str, Any]]]:
        """
        Returns: source_obj, oturum_ad, session_date, sinif_id,
        list of (student_id, status, student_name, late_time) for notify statuses.
        """
        if source_type == ClassAttendanceNotifySource.LESSON:
            try:
                session = LessonSession.objects.select_related(
                    'ders', 'sinif',
                ).get(pk=source_id, is_active=True)
            except LessonSession.DoesNotExist as exc:
                raise ValueError('Ders oturumu bulunamadı.') from exc
            records = LessonAttendanceRecord.objects.filter(
                session=session,
                status__in=NOTIFY_STATUSES,
            ).select_related('student')
            rows = [
                (
                    r.student_id,
                    r.status,
                    f'{r.student.ad} {r.student.soyad}'.strip(),
                    getattr(r, 'late_time', None),
                )
                for r in records
                if r.student_id
            ]
            return (
                session,
                _session_label_lesson(session),
                session.session_date,
                session.sinif_id,
                rows,
            )

        if source_type == ClassAttendanceNotifySource.PERIOD:
            try:
                session = ClassPeriodAttendanceSession.objects.select_related(
                    'sinif',
                ).get(pk=source_id, is_active=True)
            except ClassPeriodAttendanceSession.DoesNotExist as exc:
                raise ValueError('Günlük yoklama oturumu bulunamadı.') from exc
            records = ClassPeriodAttendanceRecord.objects.filter(
                session=session,
                status__in=NOTIFY_STATUSES,
            ).select_related('student')
            rows = [
                (
                    r.student_id,
                    r.status,
                    f'{r.student.ad} {r.student.soyad}'.strip(),
                    getattr(r, 'late_time', None),
                )
                for r in records
                if r.student_id
            ]
            return (
                session,
                _session_label_period(session),
                session.session_date,
                session.sinif_id,
                rows,
            )

        raise ValueError('Geçersiz kaynak tipi.')

    def preview(
        self,
        kurum_id: int,
        *,
        source_type: str,
        source_id: int,
        recipient_types: Iterable[str] | None = None,
    ) -> ClassNotifyPreview:
        from apps.kurum.domain.models import Kurum
        from apps.ogrenci.domain.models import Ogrenci
        from apps.ogrenci.application.veli_contact import list_outbound_veliler

        types = [t.upper() for t in (recipient_types or [RecipientType.VELI])]
        if not types:
            types = [RecipientType.VELI]
        for t in types:
            if t not in (RecipientType.VELI, RecipientType.OGRENCI):
                raise ValueError(f'Geçersiz alıcı tipi: {t}')

        source, oturum_ad, session_date, sinif_id, rows = self._load_source(
            source_type, source_id,
        )
        sinif_ad = ''
        if sinif_id and getattr(source, 'sinif', None):
            sinif_ad = getattr(source.sinif, 'ad', '') or ''

        kurum = Kurum.objects.filter(id=kurum_id).first()
        items: list[ClassNotifyItem] = []

        for student_id, status, student_name, late_time in rows:
            event_key = STATUS_TO_EVENT[status]
            ogrenci = Ogrenci.objects.select_related('sube').filter(
                id=student_id, kurum_id=kurum_id,
            ).first()
            if not ogrenci:
                continue

            if RecipientType.VELI in types:
                veli_pairs = list_outbound_veliler(ogrenci)
                if not veli_pairs:
                    items.append(ClassNotifyItem(
                        ogrenci_id=student_id,
                        ogrenci_ad=student_name,
                        recipient_type=RecipientType.VELI,
                        recipient_id=0,
                        recipient_ad='',
                        telefon='',
                        event_key=event_key,
                        status=status,
                        body='',
                        skip_reason='Veli telefonu bulunamadı',
                        late_time=late_time,
                    ))
                else:
                    for veli, phone in veli_pairs:
                        ctx = _build_context(
                            ogrenci=ogrenci,
                            veli=veli,
                            kurum=kurum,
                            sinif_ad=sinif_ad,
                            oturum_ad=oturum_ad,
                            session_date=session_date,
                            late_time=late_time,
                            status=status,
                        )
                        body = _resolved_body(
                            kurum_id, event_key, RecipientType.VELI, ctx,
                            sube_id=getattr(ogrenci, 'sube_id', None),
                        )
                        skip = ''
                        if _already_sent(
                            source_type=source_type,
                            source_id=source_id,
                            ogrenci_id=student_id,
                            recipient_type=RecipientType.VELI,
                            recipient_id=veli.id,
                            event_key=event_key,
                        ):
                            skip = 'Daha önce gönderildi'
                        elif not ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                            skip = 'Veli devamsızlık bildirimini kabul etmemiş'
                        items.append(ClassNotifyItem(
                            ogrenci_id=student_id,
                            ogrenci_ad=student_name,
                            recipient_type=RecipientType.VELI,
                            recipient_id=veli.id,
                            recipient_ad=veli.tam_ad,
                            telefon=_mask_phone(phone),
                            event_key=event_key,
                            status=status,
                            body=body,
                            skip_reason=skip,
                            late_time=late_time,
                        ))

            if RecipientType.OGRENCI in types:
                phone = str(getattr(ogrenci, 'telefon', None) or '').strip()
                ctx = _build_context(
                    ogrenci=ogrenci,
                    kurum=kurum,
                    sinif_ad=sinif_ad,
                    oturum_ad=oturum_ad,
                    session_date=session_date,
                    late_time=late_time,
                    status=status,
                )
                body = _resolved_body(
                    kurum_id, event_key, RecipientType.OGRENCI, ctx,
                    sube_id=getattr(ogrenci, 'sube_id', None),
                )
                skip = ''
                if not phone:
                    skip = 'Öğrenci telefonu bulunamadı'
                elif _already_sent(
                    source_type=source_type,
                    source_id=source_id,
                    ogrenci_id=student_id,
                    recipient_type=RecipientType.OGRENCI,
                    recipient_id=student_id,
                    event_key=event_key,
                ):
                    skip = 'Daha önce gönderildi'
                items.append(ClassNotifyItem(
                    ogrenci_id=student_id,
                    ogrenci_ad=student_name,
                    recipient_type=RecipientType.OGRENCI,
                    recipient_id=student_id,
                    recipient_ad=student_name,
                    telefon=_mask_phone(phone) if phone else '',
                    event_key=event_key,
                    status=status,
                    body=body,
                    skip_reason=skip,
                    late_time=late_time,
                ))

        pending = [i for i in items if not i.skip_reason]
        return ClassNotifyPreview(
            source_type=source_type,
            source_id=source_id,
            oturum_ad=oturum_ad,
            recipients=items,
            pending_count=len(pending),
        )

    @transaction.atomic
    def send(
        self,
        kurum_id: int,
        *,
        source_type: str,
        source_id: int,
        recipient_types: Iterable[str] | None = None,
        sent_by_user_id: int | None = None,
        force_resend: bool = False,
    ) -> ClassNotifySendResult:
        from apps.kurum.domain.models import Kurum
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
        from apps.communication.domain.models import Message

        preview = self.preview(
            kurum_id,
            source_type=source_type,
            source_id=source_id,
            recipient_types=recipient_types,
        )
        source, oturum_ad, session_date, sinif_id, _rows = self._load_source(
            source_type, source_id,
        )
        sinif_ad = ''
        if sinif_id and getattr(source, 'sinif', None):
            sinif_ad = getattr(source.sinif, 'ad', '') or ''
        kurum = Kurum.objects.filter(id=kurum_id).first()
        result = ClassNotifySendResult()

        for item in preview.recipients:
            if item.skip_reason and not (force_resend and item.recipient_id):
                result.skipped += 1
                continue
            if not item.recipient_id:
                result.skipped += 1
                continue
            if not force_resend and _already_sent(
                source_type=source_type,
                source_id=source_id,
                ogrenci_id=item.ogrenci_id,
                recipient_type=item.recipient_type,
                recipient_id=item.recipient_id,
                event_key=item.event_key,
            ):
                result.skipped += 1
                continue

            ogrenci = Ogrenci.objects.select_related('sube').filter(
                id=item.ogrenci_id,
            ).first()
            if not ogrenci:
                result.skipped += 1
                continue

            veli = None
            if item.recipient_type == RecipientType.VELI:
                veli = OgrenciVeli.objects.filter(id=item.recipient_id).first()
                if not veli:
                    result.skipped += 1
                    continue
                if not ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                    result.skipped += 1
                    continue
                recipient = NotificationRecipient.veli(veli.id)
            else:
                recipient = NotificationRecipient.ogrenci(ogrenci.id)

            ctx = _build_context(
                ogrenci=ogrenci,
                veli=veli,
                kurum=kurum,
                sinif_ad=sinif_ad,
                oturum_ad=oturum_ad,
                session_date=session_date,
                late_time=item.late_time,
                status=item.status,
            )
            source_ref = (
                f'{source_type}:{source_id}:{item.ogrenci_id}:'
                f'{item.event_key}:{item.recipient_type}:{item.recipient_id}'
            )
            send_result = dispatch_event(
                kurum_id,
                item.event_key,
                recipient=recipient,
                context=ctx,
                source=MessageSource(module=SOURCE_MODULE, ref_id=source_ref),
                sube_id=getattr(ogrenci, 'sube_id', None),
                sent_by_user_id=sent_by_user_id,
                fallback_body=item.body or _default_body(
                    item.event_key, item.recipient_type, ctx,
                ),
            )
            if not send_result or not send_result.success:
                errors = getattr(send_result, 'errors', None) if send_result else None
                result.errors.extend(errors or ['Gönderim başarısız'])
                result.skipped += 1
                continue

            message = None
            if send_result.message_id:
                message = Message.objects.filter(id=send_result.message_id).first()

            ClassAttendanceNotificationLog.objects.update_or_create(
                source_type=source_type,
                source_id=source_id,
                ogrenci_id=item.ogrenci_id,
                recipient_type=item.recipient_type,
                recipient_id=item.recipient_id,
                event_key=item.event_key,
                defaults={
                    'message': message,
                    'sent_by_id': sent_by_user_id,
                },
            )
            result.sent += 1

        return result
