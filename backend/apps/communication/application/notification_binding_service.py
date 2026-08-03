"""
Bildirim şablon eşlemesi yönetim servisi — katalog listeleme ve upsert.
"""
from __future__ import annotations

from apps.communication.application.notification_dispatcher import build_preview
from apps.communication.application.notification_events import (
    MODULE_LABELS,
    NOTIFICATION_EVENTS,
    build_meta_example_body,
    get_event,
)
from apps.communication.application.notification_template_resolver import resolve_binding
from apps.communication.domain.enums import Channel, NotificationSendMode
from apps.communication.domain.models import NotificationTemplateBinding


class NotificationBindingError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _binding_payload(binding) -> dict | None:
    if binding is None:
        return None
    return {
        'id': str(binding.id),
        'sube_id': binding.sube_id,
        'channel_config_id': str(binding.channel_config_id) if binding.channel_config_id else None,
        'meta_template_id': str(binding.meta_template_id) if binding.meta_template_id else None,
        'meta_template_name': binding.meta_template.name if binding.meta_template_id else '',
        'message_template_id': (
            str(binding.message_template_id) if binding.message_template_id else None
        ),
        'message_template_name': (
            binding.message_template.name if binding.message_template_id else ''
        ),
        'send_mode': binding.send_mode,
        'is_active': binding.is_active,
    }


def list_event_catalog(
    kurum_id: int,
    *,
    sube_id: int | None = None,
    channel_config_id: str | None = None,
    channel: str = Channel.WHATSAPP,
) -> dict:
    """Katalog + seçili kapsamdaki eşlemeler + çözümleme gerekçesi."""
    scoped = NotificationTemplateBinding.objects.filter(
        kurum_id=kurum_id,
        channel=channel,
        sube_id=sube_id,
        channel_config_id=channel_config_id,
    ).select_related('meta_template', 'message_template')
    by_slot = {(b.event_key, b.recipient_type): b for b in scoped}

    events = []
    for event in NOTIFICATION_EVENTS:
        slots = []
        for recipient_type in event.recipients:
            resolved = resolve_binding(
                kurum_id, event.key, recipient_type,
                sube_id=sube_id, channel_config_id=channel_config_id, channel=channel,
            )
            slots.append({
                'recipient_type': recipient_type,
                'binding': _binding_payload(by_slot.get((event.key, recipient_type))),
                'suggested_meta_name': event.suggested_meta_name(recipient_type),
                'default_body': event.default_body(recipient_type),
                'meta_example_body': build_meta_example_body(event, recipient_type),
                'resolved': {
                    'source': resolved.source,
                    'source_label': resolved.source_label,
                    'send_mode': resolved.send_mode,
                    'meta_template_id': (
                        str(resolved.meta_template.id) if resolved.meta_template else None
                    ),
                    'meta_template_name': (
                        resolved.meta_template.name if resolved.meta_template else ''
                    ),
                    'meta_template_status': (
                        resolved.meta_template.status if resolved.meta_template else ''
                    ),
                    'message_template_name': (
                        resolved.message_template.name if resolved.message_template else ''
                    ),
                    'body': resolved.body,
                    'warnings': resolved.warnings,
                },
            })
        events.append({
            'key': event.key,
            'module': event.module,
            'module_label': event.module_label,
            'label': event.label,
            'description': event.description,
            'has_document': event.has_document,
            'opt_in_category': event.opt_in_category,
            'variables': list(event.all_variables()),
            'meta_name_base': event.meta_name_base,
            'slots': slots,
        })

    return {
        'modules': [
            {'key': key, 'label': label}
            for key, label in MODULE_LABELS.items()
            if any(e['module'] == key for e in events)
        ],
        'events': events,
        'send_modes': [
            {'value': value, 'label': label}
            for value, label in NotificationSendMode.choices
        ],
    }


def upsert_binding(
    kurum_id: int,
    *,
    event_key: str,
    recipient_type: str,
    sube_id: int | None = None,
    channel_config_id: str | None = None,
    channel: str = Channel.WHATSAPP,
    meta_template_id: str | None = None,
    message_template_id: str | None = None,
    send_mode: str = NotificationSendMode.AUTO,
    is_active: bool = True,
    user=None,
) -> NotificationTemplateBinding:
    from apps.communication.domain.models import MessageTemplate, WhatsAppMetaTemplate

    event = get_event(event_key)
    if event is None:
        raise NotificationBindingError(f'Tanımsız bildirim olayı: {event_key}')
    if recipient_type not in event.recipients:
        raise NotificationBindingError(
            f'{event.label} olayı {recipient_type} rolünü desteklemiyor.',
        )
    if send_mode not in NotificationSendMode.values:
        raise NotificationBindingError(f'Geçersiz gönderim modu: {send_mode}')

    meta_template = None
    if meta_template_id:
        meta_template = WhatsAppMetaTemplate.objects.filter(
            id=meta_template_id, kurum_id=kurum_id,
        ).first()
        if meta_template is None:
            raise NotificationBindingError('Meta şablonu bulunamadı.', 404)

    message_template = None
    if message_template_id:
        message_template = MessageTemplate.objects.filter(
            id=message_template_id, kurum_id=kurum_id,
        ).first()
        if message_template is None:
            raise NotificationBindingError('LMS şablonu bulunamadı.', 404)

    binding, _created = NotificationTemplateBinding.objects.update_or_create(
        kurum_id=kurum_id,
        sube_id=sube_id,
        channel_config_id=channel_config_id,
        event_key=event_key,
        recipient_type=recipient_type,
        channel=channel,
        defaults={
            'meta_template': meta_template,
            'message_template': message_template,
            'send_mode': send_mode,
            'is_active': is_active,
            'updated_by': user if user and getattr(user, 'is_authenticated', False) else None,
        },
    )
    return binding


def delete_binding(
    kurum_id: int,
    *,
    event_key: str,
    recipient_type: str,
    sube_id: int | None = None,
    channel_config_id: str | None = None,
    channel: str = Channel.WHATSAPP,
) -> int:
    deleted, _ = NotificationTemplateBinding.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        channel_config_id=channel_config_id,
        event_key=event_key,
        recipient_type=recipient_type,
        channel=channel,
    ).delete()
    return deleted


def preview_binding(
    kurum_id: int,
    *,
    event_key: str,
    recipient_type: str,
    context: dict | None = None,
    sube_id: int | None = None,
    channel_config_id: str | None = None,
) -> dict:
    event = get_event(event_key)
    if event is None:
        raise NotificationBindingError(f'Tanımsız bildirim olayı: {event_key}')

    sample = {name: f'{{{name}}}' for name in event.all_variables()}
    sample.update(context or {})

    preview = build_preview(
        kurum_id, event_key, recipient_type,
        context=sample,
        sube_id=sube_id,
        channel_config_id=channel_config_id,
    )
    return preview.as_dict()
