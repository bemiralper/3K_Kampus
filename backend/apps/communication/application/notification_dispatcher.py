"""
Bildirim gönderiminin tek giriş noktası.

Modüller şablon seçmez; olay anahtarı ve bağlam verir. Hangi Meta/LMS şablonunun
kullanılacağına `notification_template_resolver` karar verir.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from apps.communication.application.communication_service import MessageSource, SendResult
from apps.communication.application.notification_events import (
    MODULE_FINANS,
    MODULE_ODEME,
    MODULE_YOKLAMA,
    get_event,
)
from apps.communication.application.notification_template_resolver import (
    ResolvedTemplate,
    resolve_binding,
)
from apps.communication.application.session_window import (
    SessionWindow,
    enforcement_enabled,
    window_for_recipient,
)
from apps.communication.application.variable_resolver import resolve_variables
from apps.communication.domain.enums import Channel, RecipientType

logger = logging.getLogger(__name__)


@dataclass
class NotificationRecipient:
    recipient_type: str
    veli_id: int | None = None
    ogrenci_id: int | None = None
    personel_id: int | None = None
    phone: str | None = None

    @classmethod
    def veli(cls, veli_id: int) -> 'NotificationRecipient':
        return cls(recipient_type=RecipientType.VELI, veli_id=veli_id)

    @classmethod
    def ogrenci(cls, ogrenci_id: int) -> 'NotificationRecipient':
        return cls(recipient_type=RecipientType.OGRENCI, ogrenci_id=ogrenci_id)

    @classmethod
    def personel(cls, personel_id: int | None = None, *, phone: str | None = None):
        return cls(recipient_type=RecipientType.PERSONEL, personel_id=personel_id, phone=phone)


@dataclass
class NotificationAttachment:
    filename: str = 'document.pdf'
    file_path: str | None = None
    file_bytes: bytes | None = None
    mime_type: str = ''

    @property
    def is_empty(self) -> bool:
        return not self.file_path and not self.file_bytes


@dataclass
class NotificationPreview:
    event_key: str
    recipient_type: str
    body: str
    send_mode: str
    uses_meta: bool
    meta_template_name: str = ''
    meta_template_language: str = 'tr'
    message_template_name: str = ''
    channel_config_id: str | None = None
    source: str = ''
    source_label: str = ''
    warnings: list[str] = field(default_factory=list)
    would_send: bool = True
    # 24 saatlik pencere durumu — alıcı bilinmiyorsa 'UNKNOWN'
    session_state: str = 'UNKNOWN'
    session_is_open: bool = True
    meta_available: bool = False
    blocked_reason: str = ''

    def as_dict(self) -> dict[str, Any]:
        return {
            'event_key': self.event_key,
            'recipient_type': self.recipient_type,
            'body': self.body,
            'send_mode': self.send_mode,
            'uses_meta': self.uses_meta,
            'meta_template_name': self.meta_template_name,
            'meta_template_language': self.meta_template_language,
            'message_template_name': self.message_template_name,
            'channel_config_id': self.channel_config_id,
            'source': self.source,
            'source_label': self.source_label,
            'warnings': self.warnings,
            'would_send': self.would_send,
            'session_state': self.session_state,
            'session_is_open': self.session_is_open,
            'meta_available': self.meta_available,
            'blocked_reason': self.blocked_reason,
        }


def build_preview(
    kurum_id: int,
    event_key: str,
    recipient_type: str,
    *,
    context: dict | None = None,
    sube_id: int | None = None,
    channel_config_id: str | None = None,
    has_attachment: bool | None = None,
    resolved: ResolvedTemplate | None = None,
    fallback_body: str = '',
    session: SessionWindow | None = None,
) -> NotificationPreview:
    """
    Gönderim yapmadan hangi şablonun kullanılacağını ve metni döndür.

    `session` verildiğinde karar 24 saatlik pencereye göre verilir: pencere açıkken
    uygulama şablonu serbest mesaj olarak, kapalıyken Meta şablonu olarak gider.
    """
    event = get_event(event_key)
    needs_image = bool(event and event.has_image)
    if has_attachment is None:
        needs_document = bool(event and event.has_document)
        attachment_present = needs_document or needs_image
    else:
        attachment_present = bool(has_attachment)
        needs_document = bool(event and event.has_document and attachment_present and not needs_image)
    resolved = resolved or resolve_binding(
        kurum_id, event_key, recipient_type,
        sube_id=sube_id, channel_config_id=channel_config_id,
    )
    meta_available = resolved.meta_usable(
        needs_document=needs_document,
        needs_image=needs_image and attachment_present,
    )
    session_open = True if session is None else session.is_open
    uses_meta = resolved.use_meta(
        needs_document=needs_document,
        needs_image=needs_image and attachment_present,
        session_open=session_open,
    )
    # Modül metni (ödev planı/rapor vb.) olayla uyumlu kısa mesajı taşır.
    # Binding LMS şablonu yoksa veya plan↔rapor karışmışsa fallback önceliklidir.
    raw_body = resolved.body
    if fallback_body:
        from apps.communication.application.notification_template_resolver import (
            lms_body_matches_event,
        )
        if (
            not resolved.body_from_template
            or not lms_body_matches_event(event_key, resolved.body)
        ):
            raw_body = fallback_body
    body = resolve_variables(raw_body, context or {})

    warnings = list(resolved.warnings)
    would_send = not resolved.is_disabled
    blocked_reason = ''
    if would_send and not uses_meta and not meta_available:
        note = (
            'Bu bildirimin Meta karşılığı yok; alıcının 24 saatlik penceresi '
            'kapalıysa mesaj iletilemez.'
        )
        if session is not None and not session.is_open:
            blocked_reason = (
                '24 saatlik görüşme penceresi kapalı ve bu olay için kullanılabilir '
                'onaylı Meta şablonu yok.'
            )
            if enforcement_enabled():
                would_send = False
            warnings.append(blocked_reason)
        elif session is None:
            warnings.append(note)

    return NotificationPreview(
        event_key=event_key,
        recipient_type=recipient_type,
        body=body,
        send_mode=resolved.send_mode,
        uses_meta=uses_meta,
        meta_template_name=resolved.meta_template.name if resolved.meta_template else '',
        meta_template_language=(
            resolved.meta_template.language if resolved.meta_template else 'tr'
        ),
        message_template_name=(
            resolved.message_template.name if resolved.message_template else ''
        ),
        channel_config_id=resolved.channel_config_id,
        source=resolved.source,
        source_label=resolved.source_label,
        warnings=warnings,
        would_send=would_send,
        session_state=session.state if session is not None else 'UNKNOWN',
        session_is_open=session_open,
        meta_available=meta_available,
        blocked_reason=blocked_reason,
    )


def _send_meta_document(hooks, kurum_id, recipient, *, preview, attachment, opt_in_category, source, sent_by_user_id, context):
    kwargs = dict(
        template_name=preview.meta_template_name,
        template_language=preview.meta_template_language,
        template_context=context,
        channel_config_id=preview.channel_config_id,
        preview_text=preview.body,
        category=opt_in_category,
        source_module=source.module,
        source_id=source.ref_id,
        file_path=attachment.file_path,
        file_bytes=attachment.file_bytes,
        filename=attachment.filename,
        sent_by_user_id=sent_by_user_id,
    )
    if recipient.recipient_type == RecipientType.VELI:
        return hooks.send_template_document_to_veli(kurum_id, recipient.veli_id, **kwargs)
    if recipient.recipient_type == RecipientType.OGRENCI:
        return hooks.send_template_document_to_ogrenci(kurum_id, recipient.ogrenci_id, **kwargs)
    return hooks.send_template_document_to_personel(
        kurum_id, recipient.personel_id, phone=recipient.phone, **kwargs,
    )


def _send_meta_image(hooks, kurum_id, recipient, *, preview, attachment, opt_in_category, source, sent_by_user_id, context):
    kwargs = dict(
        template_name=preview.meta_template_name,
        template_language=preview.meta_template_language,
        template_context=context,
        channel_config_id=preview.channel_config_id,
        preview_text=preview.body,
        category=opt_in_category,
        source_module=source.module,
        source_id=source.ref_id,
        file_path=attachment.file_path,
        file_bytes=attachment.file_bytes,
        filename=attachment.filename,
        mime_type=getattr(attachment, 'mime_type', '') or '',
        sent_by_user_id=sent_by_user_id,
    )
    if recipient.recipient_type == RecipientType.OGRENCI:
        return hooks.send_template_image_to_ogrenci(kurum_id, recipient.ogrenci_id, **kwargs)
    if recipient.recipient_type == RecipientType.VELI:
        return hooks.send_template_image_to_veli(kurum_id, recipient.veli_id, **kwargs)
    return SendResult(success=False, errors=['IMAGE şablon yalnızca öğrenci/veli için desteklenir.'])


def _send_image(
    hooks, kurum_id, recipient, *,
    body, attachment, opt_in_category, source, sent_by_user_id, session_fallback=None,
):
    common = dict(
        file_path=attachment.file_path,
        file_bytes=attachment.file_bytes,
        filename=attachment.filename,
        mime_type=getattr(attachment, 'mime_type', '') or '',
        sent_by_user_id=sent_by_user_id,
        session_fallback=session_fallback,
    )
    if recipient.recipient_type == RecipientType.OGRENCI:
        return hooks.send_image_to_ogrenci(
            kurum_id, recipient.ogrenci_id, body, opt_in_category,
            source.module, source.ref_id, **common,
        )
    if recipient.recipient_type == RecipientType.VELI:
        return hooks.send_image_to_veli(
            kurum_id, recipient.veli_id, body, opt_in_category,
            source.module, source.ref_id, **common,
        )
    return SendResult(success=False, errors=['Görsel gönderimi yalnızca öğrenci/veli için desteklenir.'])


def _send_meta_text(hooks, kurum_id, recipient, *, preview, opt_in_category, source, sent_by_user_id, context):
    kwargs = dict(
        template_name=preview.meta_template_name,
        template_language=preview.meta_template_language,
        template_context=context,
        channel_config_id=preview.channel_config_id,
        preview_text=preview.body,
        category=opt_in_category,
        source_module=source.module,
        source_id=source.ref_id,
        sent_by_user_id=sent_by_user_id,
    )
    if recipient.recipient_type == RecipientType.VELI:
        return hooks.send_template_text_to_veli(kurum_id, recipient.veli_id, **kwargs)
    if recipient.recipient_type == RecipientType.OGRENCI:
        return hooks.send_template_text_to_ogrenci(kurum_id, recipient.ogrenci_id, **kwargs)
    return hooks.send_template_text_to_personel(
        kurum_id, recipient.personel_id, phone=recipient.phone, **kwargs,
    )


def _send_document(
    hooks, kurum_id, recipient, *,
    body, attachment, opt_in_category, source, sent_by_user_id, session_fallback=None,
):
    common = dict(
        file_path=attachment.file_path,
        file_bytes=attachment.file_bytes,
        filename=attachment.filename,
        sent_by_user_id=sent_by_user_id,
        session_fallback=session_fallback,
    )
    if recipient.recipient_type == RecipientType.VELI:
        return hooks.send_document_to_veli(
            kurum_id, recipient.veli_id, body, opt_in_category,
            source.module, source.ref_id, **common,
        )
    if recipient.recipient_type == RecipientType.OGRENCI:
        return hooks.send_document_to_ogrenci(
            kurum_id, recipient.ogrenci_id, body, opt_in_category,
            source.module, source.ref_id, **common,
        )
    return hooks.send_document_to_personel(
        kurum_id, recipient.personel_id, body, source.module, source.ref_id,
        phone=recipient.phone, **common,
    )


def _send_text(
    hooks, kurum_id, recipient, *,
    body, opt_in_category, source, sent_by_user_id, session_fallback=None,
    channel_config_id=None,
):
    if recipient.recipient_type == RecipientType.VELI:
        return hooks.send_text_to_veli(
            kurum_id, recipient.veli_id, body, opt_in_category,
            source.module, source.ref_id, sent_by_user_id=sent_by_user_id,
            session_fallback=session_fallback,
            channel_config_id=channel_config_id,
        )
    if recipient.recipient_type == RecipientType.OGRENCI:
        return hooks.send_text_to_ogrenci(
            kurum_id, recipient.ogrenci_id, body,
            source.module, source.ref_id, sent_by_user_id=sent_by_user_id,
            session_fallback=session_fallback,
            channel_config_id=channel_config_id,
        )
    return hooks.send_text_to_personel(
        kurum_id, recipient.personel_id, body, source.module, source.ref_id,
        phone=recipient.phone, sent_by_user_id=sent_by_user_id,
        session_fallback=session_fallback,
        channel_config_id=channel_config_id,
    )


def _session_fallback(preview: NotificationPreview, context: dict) -> dict | None:
    """Serbest mesaj Meta tarafından 24 saat kuralıyla reddedilirse kullanılacak şablon."""
    if preview.uses_meta or not preview.meta_available or not preview.meta_template_name:
        return None
    return {
        'template_name': preview.meta_template_name,
        'template_language': preview.meta_template_language or 'tr',
        'channel_config_id': preview.channel_config_id or '',
        'template_context': dict(context or {}),
    }


def _preferred_channel_config_id(event, kurum_id, *, sube_id, sent_by_user_id) -> str | None:
    """Olayın departman hattı; yoklama/ödev koçluk, ödeme muhasebe."""
    from apps.communication.application.account_resolver import AccountResolver
    from apps.communication.domain.enums import CommunicationDepartment

    sender = None
    if sent_by_user_id:
        from django.contrib.auth import get_user_model
        sender = get_user_model().objects.filter(id=sent_by_user_id).first()

    event_module = getattr(event, 'module', None)
    if event_module == MODULE_YOKLAMA:
        cfg = AccountResolver.for_department(
            kurum_id,
            CommunicationDepartment.COACHING,
            sube_id=sube_id,
            user=sender,
        )
        if cfg is not None:
            return str(cfg.id)
    if event_module in (MODULE_ODEME, MODULE_FINANS):
        cfg = AccountResolver.for_department(
            kurum_id,
            CommunicationDepartment.ACCOUNTING,
            sube_id=sube_id,
            user=sender,
        )
        if cfg is not None:
            return str(cfg.id)

    if sender is not None:
        cfg = AccountResolver.resolve(
            kurum_id=kurum_id,
            user=sender,
            sube_id=sube_id,
            raise_if_missing=False,
        )
        return str(cfg.id) if cfg else None
    return None


def dispatch_event(
    kurum_id: int,
    event_key: str,
    *,
    recipient: NotificationRecipient,
    context: dict | None = None,
    attachment: NotificationAttachment | None = None,
    source: MessageSource | None = None,
    sube_id: int | None = None,
    channel: str = Channel.WHATSAPP,
    sent_by_user_id: int | None = None,
    fallback_body: str = '',
    dry_run: bool = False,
) -> SendResult | NotificationPreview | None:
    """
    Olay bazlı gönderim.

    `dry_run=True` ise gönderim yapılmaz, `NotificationPreview` döner.
    """
    event = get_event(event_key)
    if event is None:
        message = f'Tanımsız bildirim olayı: {event_key}'
        logger.warning(message)
        if dry_run:
            return NotificationPreview(
                event_key=event_key,
                recipient_type=recipient.recipient_type,
                body='',
                send_mode='',
                uses_meta=False,
                warnings=[message],
                would_send=False,
            )
        return SendResult(success=False, errors=[message])

    context = dict(context or {})
    attachment = attachment or NotificationAttachment()
    source = source or MessageSource(module=event.module, ref_id='')

    session = window_for_recipient(
        kurum_id,
        phone=recipient.phone,
        veli_id=recipient.veli_id,
        ogrenci_id=recipient.ogrenci_id,
        personel_id=recipient.personel_id,
        channel=channel,
    )
    channel_config_id = _preferred_channel_config_id(
        event, kurum_id, sube_id=sube_id, sent_by_user_id=sent_by_user_id,
    )
    resolved = resolve_binding(
        kurum_id, event_key, recipient.recipient_type,
        sube_id=sube_id, channel_config_id=channel_config_id, channel=channel,
    )
    preview = build_preview(
        kurum_id, event_key, recipient.recipient_type,
        context=context,
        sube_id=sube_id,
        channel_config_id=channel_config_id,
        has_attachment=not attachment.is_empty,
        resolved=resolved,
        fallback_body=fallback_body,
        session=session,
    )

    if dry_run:
        return preview

    if not preview.would_send:
        reason = preview.blocked_reason or 'Bu bildirim kapalı.'
        logger.info(
            'Bildirim gönderilmedi event=%s kurum=%s neden=%s', event_key, kurum_id, reason,
        )
        return SendResult(success=False, errors=[reason])

    from apps.communication.application import integration_hooks as hooks

    opt_in_category = event.opt_in_category
    # Pencere açık görünüp Meta kapalı derse (saat kayması, kaçan webhook) kuyruk
    # aynı mesajı bu şablonla tekrar dener.
    session_fallback = _session_fallback(preview, context)

    if preview.uses_meta and not attachment.is_empty:
        if event.has_image:
            return _send_meta_image(
                hooks, kurum_id, recipient,
                preview=preview,
                attachment=attachment,
                opt_in_category=opt_in_category,
                source=source,
                sent_by_user_id=sent_by_user_id,
                context=context,
            )
        return _send_meta_document(
            hooks, kurum_id, recipient,
            preview=preview,
            attachment=attachment,
            opt_in_category=opt_in_category,
            source=source,
            sent_by_user_id=sent_by_user_id,
            context=context,
        )

    if not attachment.is_empty:
        if event.has_image:
            return _send_image(
                hooks, kurum_id, recipient,
                body=preview.body,
                attachment=attachment,
                opt_in_category=opt_in_category,
                source=source,
                sent_by_user_id=sent_by_user_id,
                session_fallback=session_fallback,
            )
        return _send_document(
            hooks, kurum_id, recipient,
            body=preview.body,
            attachment=attachment,
            opt_in_category=opt_in_category,
            source=source,
            sent_by_user_id=sent_by_user_id,
            session_fallback=session_fallback,
        )

    if preview.uses_meta:
        return _send_meta_text(
            hooks, kurum_id, recipient,
            preview=preview,
            opt_in_category=opt_in_category,
            source=source,
            sent_by_user_id=sent_by_user_id,
            context=context,
        )

    if not preview.body.strip():
        return SendResult(success=False, errors=['Gönderilecek mesaj metni boş.'])

    return _send_text(
        hooks, kurum_id, recipient,
        body=preview.body,
        opt_in_category=opt_in_category,
        source=source,
        sent_by_user_id=sent_by_user_id,
        session_fallback=session_fallback,
        channel_config_id=preview.channel_config_id,
    )
