"""
Bildirim şablon eşlemesi yönetim servisi — katalog listeleme ve upsert.
"""
from __future__ import annotations

from django.db.models import Q

from apps.communication.application.notification_dispatcher import build_preview
from apps.communication.application.notification_events import (
    MODULE_LABELS,
    MODULE_YOKLAMA,
    NOTIFICATION_EVENTS,
    build_meta_example_body,
    get_event,
)
from apps.communication.application.notification_template_resolver import (
    display_template_body,
    resolve_binding,
)
from apps.communication.domain.enums import Channel, NotificationSendMode, RecipientType
from apps.communication.domain.models import (
    MessageTemplate,
    NotificationTemplateBinding,
    WhatsAppMetaTemplate,
)

_RECIPIENT_LABELS = {
    RecipientType.VELI: 'Veli',
    RecipientType.OGRENCI: 'Öğrenci',
    RecipientType.PERSONEL: 'Personel',
}


class NotificationBindingError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _usage_label(event_key: str, recipient_type: str) -> str:
    event = get_event(event_key)
    role = _RECIPIENT_LABELS.get(recipient_type, recipient_type)
    if event:
        return f'{event.label} ({role})'
    return f'{event_key} ({role})'


def list_message_template_binding_usages(template: MessageTemplate) -> list[dict]:
    """LMS şablonunun Bildirim Şablonları eşlemelerinde kullanımı."""
    rows = (
        NotificationTemplateBinding.objects.filter(
            message_template_id=template.id,
            is_active=True,
        )
        .exclude(send_mode=NotificationSendMode.DISABLED)
        .order_by('event_key', 'recipient_type')
    )
    return [
        {
            'module': 'communication',
            'role': f'{row.event_key}:{row.recipient_type}',
            'label': _usage_label(row.event_key, row.recipient_type),
            'is_active': True,
            'event_key': row.event_key,
        }
        for row in rows
    ]


def list_meta_template_binding_usages(template: WhatsAppMetaTemplate) -> list[dict]:
    """Meta şablonunun Bildirim Şablonları eşlemelerinde kullanımı."""
    rows = (
        NotificationTemplateBinding.objects.filter(
            meta_template_id=template.id,
            is_active=True,
        )
        .exclude(send_mode=NotificationSendMode.DISABLED)
        .order_by('event_key', 'recipient_type')
    )
    return [
        {
            'module': 'communication',
            'role': f'{row.event_key}:{row.recipient_type}',
            'label': _usage_label(row.event_key, row.recipient_type),
            'is_active': True,
            'event_key': row.event_key,
        }
        for row in rows
    ]


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
        if event.hidden_in_ui:
            continue
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
                    'meta_template_body': (
                        resolved.meta_template.body_named
                        if resolved.meta_template and resolved.meta_template.body_named
                        else ''
                    ),
                    'display_body': display_template_body(resolved) or event.default_body(
                        recipient_type
                    ),
                    'warnings': resolved.warnings,
                },
            })
        events.append({
            'key': event.key,
            'module': event.module,
            'module_label': event.module_label,
            'label': event.label,
            'description': event.description,
            'group': event.group,
            'group_label': event.group_label,
            'has_document': event.has_document,
            'has_image': event.has_image,
            'opt_in_category': event.opt_in_category,
            'variables': list(event.all_variables()),
            'meta_name_base': event.meta_name_base,
            'hidden_in_ui': event.hidden_in_ui,
            'slots': slots,
        })

    modules = []
    for key, label in MODULE_LABELS.items():
        if key == MODULE_YOKLAMA:
            if any(e['module'] == key and e.get('group') == 'kutuphane' for e in events):
                modules.append({'key': 'yoklama:kutuphane', 'label': 'Yoklama — Kütüphane'})
            if any(e['module'] == key and e.get('group') == 'sinif' for e in events):
                modules.append({'key': 'yoklama:sinif', 'label': 'Yoklama — Sınıf'})
            continue
        if any(e['module'] == key for e in events):
            modules.append({'key': key, 'label': label})
    return {
        'modules': modules,
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


def copy_sube_scoped_settings(
    kurum_id: int,
    source_sube_id: int,
    target_sube_ids: list[int],
    *,
    channel_config_id=None,
) -> int:
    """Şube özel bildirim eşlemelerini ve personel alıcılarını yeni şubelere kopyala.

    Kurum / hesap varsayılanları zaten yeni şubeye düşer; yalnızca kaynak şubede
    tanımlanmış satırlar çoğaltılır. Hedefte kayıt varsa üzerine yazılmaz.
    """
    from apps.communication.domain.models import NotificationStaffRecipient

    if not source_sube_id or not target_sube_ids:
        return 0
    targets = [int(sid) for sid in target_sube_ids if sid and int(sid) != int(source_sube_id)]
    if not targets:
        return 0

    copied = 0
    source_bindings = NotificationTemplateBinding.objects.filter(
        kurum_id=kurum_id,
        sube_id=source_sube_id,
    )
    if channel_config_id:
        source_bindings = source_bindings.filter(
            Q(channel_config_id=channel_config_id) | Q(channel_config_id__isnull=True),
        )
    for binding in source_bindings:
        for target_id in targets:
            _, created = NotificationTemplateBinding.objects.get_or_create(
                kurum_id=kurum_id,
                sube_id=target_id,
                channel_config_id=binding.channel_config_id,
                event_key=binding.event_key,
                recipient_type=binding.recipient_type,
                channel=binding.channel,
                defaults={
                    'meta_template_id': binding.meta_template_id,
                    'message_template_id': binding.message_template_id,
                    'send_mode': binding.send_mode,
                    'is_active': binding.is_active,
                    'updated_by_id': binding.updated_by_id,
                },
            )
            if created:
                copied += 1

    for row in NotificationStaffRecipient.objects.filter(
        kurum_id=kurum_id, sube_id=source_sube_id,
    ):
        for target_id in targets:
            _, created = NotificationStaffRecipient.objects.get_or_create(
                kurum_id=kurum_id,
                sube_id=target_id,
                event_key=row.event_key,
                personel_id=row.personel_id,
            )
            if created:
                copied += 1
    return copied


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
