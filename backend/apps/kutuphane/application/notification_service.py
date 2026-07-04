"""
Yoklama veli bildirimi — önizleme, toplu gönderim, dedup.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from django.db import transaction

from apps.communication.application.communication_service import (
    CommunicationService,
    MessageContent,
    MessageSource,
    RecipientQuery,
)
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.variable_resolver import build_attendance_context, resolve_variables
from apps.kutuphane.application.attendance_template_seed import (
    EVENT_TO_CATEGORY,
    ensure_attendance_notification_setup,
)
from apps.kutuphane.domain.models import (
    AttendanceNotificationEventType,
    AttendanceNotificationLog,
    AttendanceRecord,
    AttendanceSession,
    AttendanceStatus,
)
from apps.kutuphane.infrastructure.repository import AttendanceRepository

logger = logging.getLogger(__name__)

SOURCE_MODULE = 'yoklama_bildirim'
OPT_IN_CATEGORY = 'devamsizlik'

EXIT_ELIGIBLE_STATUSES = {
    AttendanceStatus.PRESENT,
    AttendanceStatus.LATE,
    AttendanceStatus.NOT_AT_DESK,
}


@dataclass
class NotifyRecipientPreview:
    ogrenci_id: int
    ogrenci_ad: str
    veli_id: int
    veli_ad: str
    telefon: str
    body: str
    skip_reason: str = ''


@dataclass
class NotifyPreviewResult:
    event_type: str
    template_id: str | None
    template_body: str
    recipients: list[NotifyRecipientPreview] = field(default_factory=list)
    eligible_count: int = 0
    pending_count: int = 0


@dataclass
class NotifySendResult:
    sent: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)


class AttendanceNotificationService:
    def __init__(self):
        self._comm = CommunicationService()

    def get_config(self, kurum_id: int):
        return ensure_attendance_notification_setup(kurum_id)

    def _get_session(self, session_id) -> AttendanceSession | None:
        return (
            AttendanceSession.objects.select_related('library')
            .filter(id=session_id)
            .first()
        )

    def _template_for_event(self, config, event_type: str):
        mapping = {
            AttendanceNotificationEventType.ABSENT: config.absent_template,
            AttendanceNotificationEventType.LATE: config.late_template,
            AttendanceNotificationEventType.EXIT: config.exit_template,
        }
        return mapping.get(event_type)

    def _sent_veli_ids(self, session_id, ogrenci_id: int, event_type: str) -> set[int]:
        return set(
            AttendanceNotificationLog.objects.filter(
                attendance_session_id=session_id,
                ogrenci_id=ogrenci_id,
                event_type=event_type,
            ).values_list('veli_id', flat=True)
        )

    def _record_qualifies(self, record: AttendanceRecord, event_type: str) -> bool:
        if record.izinli_mi or record.durum == AttendanceStatus.EXCUSED:
            return False
        if event_type == AttendanceNotificationEventType.ABSENT:
            return record.durum == AttendanceStatus.ABSENT
        if event_type == AttendanceNotificationEventType.LATE:
            return record.durum == AttendanceStatus.LATE and bool(record.giris_saati)
        if event_type == AttendanceNotificationEventType.EXIT:
            return record.durum in EXIT_ELIGIBLE_STATUSES and bool(record.cikis_saati)
        return False

    def _eligible_records(
        self,
        session_id,
        event_type: str,
        ogrenci_ids: list[int] | None = None,
    ) -> list[AttendanceRecord]:
        qs = AttendanceRecord.objects.filter(attendance_session_id=session_id)
        if ogrenci_ids:
            qs = qs.filter(ogrenci_id__in=ogrenci_ids)
        return [r for r in qs if self._record_qualifies(r, event_type)]

    def get_notification_status(self, session_id) -> dict:
        """Oturum bildirim özeti."""
        summary = {
            'ABSENT': {'eligible': 0, 'sent': 0, 'pending': 0},
            'LATE': {'eligible': 0, 'sent': 0, 'pending': 0},
            'EXIT': {'eligible': 0, 'sent': 0, 'pending': 0},
        }
        per_ogrenci: dict[int, dict] = {}

        for event_type in AttendanceNotificationEventType.values:
            records = self._eligible_records(session_id, event_type)
            sent_logs = AttendanceNotificationLog.objects.filter(
                attendance_session_id=session_id,
                event_type=event_type,
            )
            sent_ogrenci = set(sent_logs.values_list('ogrenci_id', flat=True))

            summary[event_type]['eligible'] = len(records)
            summary[event_type]['sent'] = len(sent_ogrenci)
            summary[event_type]['pending'] = max(0, len(records) - len(sent_ogrenci))

            for record in records:
                og_key = record.ogrenci_id
                if og_key not in per_ogrenci:
                    per_ogrenci[og_key] = {'ABSENT': 'none', 'LATE': 'none', 'EXIT': 'none'}
                if record.ogrenci_id in sent_ogrenci:
                    per_ogrenci[og_key][event_type] = 'sent'
                else:
                    per_ogrenci[og_key][event_type] = 'pending'

        EVENT_LABELS = {
            AttendanceNotificationEventType.ABSENT: 'Gelmedi',
            AttendanceNotificationEventType.LATE: 'Geç kalma',
            AttendanceNotificationEventType.EXIT: 'Çıkış',
        }

        recent_sends = []
        logs = (
            AttendanceNotificationLog.objects.filter(attendance_session_id=session_id)
            .order_by('-sent_at')[:50]
        )
        if logs.exists():
            from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli

            ogrenci_ids = {log.ogrenci_id for log in logs}
            veli_ids = {log.veli_id for log in logs}
            ogrenci_map = {
                o.id: f'{o.ad} {o.soyad}'.strip()
                for o in Ogrenci.objects.filter(id__in=ogrenci_ids)
            }
            veli_map = {
                v.id: v.tam_ad
                for v in OgrenciVeli.objects.filter(id__in=veli_ids)
            }
            for log in logs:
                recent_sends.append({
                    'ogrenci_id': log.ogrenci_id,
                    'ogrenci_ad': ogrenci_map.get(log.ogrenci_id, f'Öğrenci #{log.ogrenci_id}'),
                    'veli_ad': veli_map.get(log.veli_id, ''),
                    'event_type': log.event_type,
                    'event_label': EVENT_LABELS.get(log.event_type, log.event_type),
                    'sent_at': log.sent_at.isoformat() if log.sent_at else '',
                })

        return {
            'summary': summary,
            'by_ogrenci': per_ogrenci,
            'recent_sends': recent_sends,
            'has_unsent': any(s['pending'] > 0 for s in summary.values()),
        }

    def preview(
        self,
        kurum_id: int,
        session_id,
        event_type: str,
        ogrenci_ids: list[int] | None = None,
    ) -> NotifyPreviewResult:
        from apps.kurum.domain.models import Kurum
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli

        session = self._get_session(session_id)
        if not session:
            raise ValueError('Yoklama oturumu bulunamadı')

        config = self.get_config(kurum_id)
        if not config.is_active:
            raise ValueError('Yoklama bildirimleri bu kurumda kapalı.')

        template = self._template_for_event(config, event_type)
        if not template:
            raise ValueError(f'{event_type} için şablon tanımlı değil.')

        kurum = Kurum.objects.filter(id=kurum_id).first()
        records = self._eligible_records(session_id, event_type, ogrenci_ids)
        recipients: list[NotifyRecipientPreview] = []

        for record in records:
            ogrenci = Ogrenci.objects.select_related('sube').filter(
                id=record.ogrenci_id, kurum_id=kurum_id,
            ).first()
            if not ogrenci:
                continue

            sent_veli = self._sent_veli_ids(session_id, record.ogrenci_id, event_type)
            from apps.ogrenci.application.veli_contact import list_outbound_veliler

            veli_pairs = list_outbound_veliler(ogrenci)

            if not veli_pairs:
                recipients.append(NotifyRecipientPreview(
                    ogrenci_id=record.ogrenci_id,
                    ogrenci_ad=f'{ogrenci.ad} {ogrenci.soyad}'.strip(),
                    veli_id=0,
                    veli_ad='',
                    telefon='',
                    body='',
                    skip_reason='Veli telefonu bulunamadı',
                ))
                continue

            for veli, phone in veli_pairs:
                ctx = build_attendance_context(
                    session=session,
                    record=record,
                    ogrenci=ogrenci,
                    veli=veli,
                    kurum=kurum,
                )
                body = resolve_variables(template.body, ctx)
                skip = ''
                if veli.id in sent_veli:
                    skip = 'Daha önce gönderildi'
                elif not ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                    skip = 'Veli devamsızlık bildirimini kabul etmemiş'

                recipients.append(NotifyRecipientPreview(
                    ogrenci_id=record.ogrenci_id,
                    ogrenci_ad=f'{ogrenci.ad} {ogrenci.soyad}'.strip(),
                    veli_id=veli.id,
                    veli_ad=veli.tam_ad,
                    telefon=phone[:4] + '***' + phone[-2:] if len(phone) > 6 else '***',
                    body=body,
                    skip_reason=skip,
                ))

        pending = [r for r in recipients if not r.skip_reason]
        return NotifyPreviewResult(
            event_type=event_type,
            template_id=str(template.id),
            template_body=template.body,
            recipients=recipients,
            eligible_count=len(records),
            pending_count=len({(r.ogrenci_id, r.veli_id) for r in pending if r.veli_id}),
        )

    @transaction.atomic
    def send(
        self,
        kurum_id: int,
        session_id,
        event_type: str,
        *,
        ogrenci_ids: list[int] | None = None,
        exclude_veli_ids: list[int] | None = None,
        sent_by_user_id: int | None = None,
        force_resend: bool = False,
    ) -> NotifySendResult:
        from apps.kurum.domain.models import Kurum
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
        from apps.communication.domain.models import Message

        preview = self.preview(kurum_id, session_id, event_type, ogrenci_ids)
        config = self.get_config(kurum_id)
        template = self._template_for_event(config, event_type)
        session = self._get_session(session_id)
        kurum = Kurum.objects.filter(id=kurum_id).first()

        result = NotifySendResult()
        exclude = set(exclude_veli_ids or [])

        records_by_ogrenci = {
            r.ogrenci_id: r
            for r in self._eligible_records(session_id, event_type, ogrenci_ids)
        }

        for item in preview.recipients:
            if item.skip_reason and not force_resend:
                result.skipped += 1
                continue
            if not item.veli_id or item.veli_id in exclude:
                result.skipped += 1
                continue

            record = records_by_ogrenci.get(item.ogrenci_id)
            if not record:
                result.skipped += 1
                continue

            if not force_resend and item.veli_id in self._sent_veli_ids(
                session_id, item.ogrenci_id, event_type,
            ):
                result.skipped += 1
                continue

            veli = OgrenciVeli.objects.filter(id=item.veli_id).first()
            ogrenci = Ogrenci.objects.select_related('sube').filter(id=item.ogrenci_id).first()
            if not veli or not ogrenci:
                result.skipped += 1
                continue
            if not ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                result.skipped += 1
                continue

            ctx = build_attendance_context(
                session=session,
                record=record,
                ogrenci=ogrenci,
                veli=veli,
                kurum=kurum,
            )
            body = resolve_variables(template.body, ctx)
            source_ref = f'{session_id}:{item.ogrenci_id}:{event_type}:{veli.id}'

            send_result = self._comm.send(
                kurum_id,
                recipients=RecipientQuery(veli_id=veli.id, opt_in_category=OPT_IN_CATEGORY),
                content=MessageContent(text=body),
                source=MessageSource(module=SOURCE_MODULE, ref_id=source_ref),
                sender_user_id=sent_by_user_id,
                process_immediately=True,
            )

            if not send_result.success:
                result.errors.extend(send_result.errors or ['Gönderim başarısız'])
                result.skipped += 1
                continue

            message = None
            if send_result.message_id:
                message = Message.objects.filter(id=send_result.message_id).first()

            AttendanceNotificationLog.objects.update_or_create(
                attendance_session_id=session_id,
                ogrenci_id=item.ogrenci_id,
                event_type=event_type,
                veli_id=veli.id,
                defaults={
                    'attendance_record': record,
                    'message': message,
                    'template_id': template.id if template else None,
                    'sent_by_id': sent_by_user_id,
                },
            )
            result.sent += 1

        if result.sent:
            try:
                from apps.communication.application.celery_dispatch import dispatch_process_outbound_queue
                dispatch_process_outbound_queue()
            except Exception:
                logger.exception('Outbound queue dispatch failed after yoklama notify')

        return result

    def detect_pending_after_save(
        self,
        session_id,
        old_records: dict[int, AttendanceRecord],
        new_records: list[AttendanceRecord],
    ) -> list[dict]:
        """Kayıt sonrası önizleme/onay için bekleyen olaylar."""
        pending_events: list[dict] = []
        buckets: dict[str, set[int]] = {
            AttendanceNotificationEventType.ABSENT: set(),
            AttendanceNotificationEventType.LATE: set(),
            AttendanceNotificationEventType.EXIT: set(),
        }

        for record in new_records:
            old = old_records.get(record.ogrenci_id)
            if record.izinli_mi or record.durum == AttendanceStatus.EXCUSED:
                continue

            if self._record_qualifies(record, AttendanceNotificationEventType.ABSENT):
                if not old or old.durum != AttendanceStatus.ABSENT:
                    if not self._sent_veli_ids(session_id, record.ogrenci_id, AttendanceNotificationEventType.ABSENT):
                        buckets[AttendanceNotificationEventType.ABSENT].add(record.ogrenci_id)

            if self._record_qualifies(record, AttendanceNotificationEventType.LATE):
                changed = (
                    not old
                    or old.durum != AttendanceStatus.LATE
                    or old.giris_saati != record.giris_saati
                )
                if changed and not self._sent_veli_ids(session_id, record.ogrenci_id, AttendanceNotificationEventType.LATE):
                    buckets[AttendanceNotificationEventType.LATE].add(record.ogrenci_id)

            if self._record_qualifies(record, AttendanceNotificationEventType.EXIT):
                changed = not old or old.cikis_saati != record.cikis_saati
                if changed and not self._sent_veli_ids(session_id, record.ogrenci_id, AttendanceNotificationEventType.EXIT):
                    buckets[AttendanceNotificationEventType.EXIT].add(record.ogrenci_id)

        labels = {
            AttendanceNotificationEventType.ABSENT: 'Gelmedi',
            AttendanceNotificationEventType.LATE: 'Geç kalma',
            AttendanceNotificationEventType.EXIT: 'Çıkış',
        }
        for event_type, ids in buckets.items():
            if ids:
                pending_events.append({
                    'event_type': event_type,
                    'label': labels[event_type],
                    'ogrenci_ids': list(ids),
                    'count': len(ids),
                })
        return pending_events

    def update_config(
        self,
        kurum_id: int,
        *,
        absent_template_id=None,
        late_template_id=None,
        exit_template_id=None,
        is_active: bool | None = None,
    ):
        config = self.get_config(kurum_id)
        if absent_template_id is not None:
            config.absent_template_id = absent_template_id or None
        if late_template_id is not None:
            config.late_template_id = late_template_id or None
        if exit_template_id is not None:
            config.exit_template_id = exit_template_id or None
        if is_active is not None:
            config.is_active = is_active
        config.save()
        return config

    def serialize_config(self, config) -> dict:
        def tpl_info(tpl):
            if not tpl:
                return None
            return {'id': str(tpl.id), 'name': tpl.name, 'body': tpl.body, 'category': tpl.category}

        return {
            'kurum_id': config.kurum_id,
            'is_active': config.is_active,
            'absent_template': tpl_info(config.absent_template),
            'late_template': tpl_info(config.late_template),
            'exit_template': tpl_info(config.exit_template),
        }
