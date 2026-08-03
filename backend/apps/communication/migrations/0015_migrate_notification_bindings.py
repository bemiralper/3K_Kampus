"""Eski modül şablon ayarlarını merkezi bildirim eşlemesine taşır."""
from django.db import migrations

# (config alanı) -> (event_key, recipient_type)
ASSIGNMENT_MAP = [
    ('plan_veli_meta_template', 'plan_veli_template', 'odev.plan', 'VELI'),
    ('plan_ogrenci_meta_template', 'plan_ogrenci_template', 'odev.plan', 'OGRENCI'),
    ('report_veli_meta_template', 'report_veli_template', 'odev.rapor', 'VELI'),
    ('report_ogrenci_meta_template', 'report_ogrenci_template', 'odev.rapor', 'OGRENCI'),
]

ATTENDANCE_MAP = [
    ('absent_template', 'yoklama.gelmedi', 'VELI'),
    ('late_template', 'yoklama.gec', 'VELI'),
    ('exit_template', 'yoklama.cikis', 'VELI'),
]


def _create_binding(Binding, kurum_id, event_key, recipient_type, *, meta_id=None, message_id=None):
    if not meta_id and not message_id:
        return
    exists = Binding.objects.filter(
        kurum_id=kurum_id,
        sube__isnull=True,
        channel_config__isnull=True,
        event_key=event_key,
        recipient_type=recipient_type,
        channel='WHATSAPP',
    ).exists()
    if exists:
        return
    Binding.objects.create(
        kurum_id=kurum_id,
        event_key=event_key,
        recipient_type=recipient_type,
        channel='WHATSAPP',
        meta_template_id=meta_id,
        message_template_id=message_id,
        send_mode='AUTO',
        is_active=True,
    )


def forwards(apps, schema_editor):
    Binding = apps.get_model('communication', 'NotificationTemplateBinding')
    Kurum = apps.get_model('kurum', 'Kurum')
    kurum_ids = set(Kurum.objects.values_list('id', flat=True))

    AssignmentConfig = apps.get_model('assignment_manual', 'AssignmentNotificationConfig')
    for config in AssignmentConfig.objects.all():
        if config.kurum_id not in kurum_ids:
            continue
        for meta_field, msg_field, event_key, recipient_type in ASSIGNMENT_MAP:
            _create_binding(
                Binding,
                config.kurum_id,
                event_key,
                recipient_type,
                meta_id=getattr(config, f'{meta_field}_id', None),
                message_id=getattr(config, f'{msg_field}_id', None),
            )

    AttendanceConfig = apps.get_model('kutuphane', 'AttendanceNotificationConfig')
    for config in AttendanceConfig.objects.all():
        if config.kurum_id not in kurum_ids:
            continue
        for msg_field, event_key, recipient_type in ATTENDANCE_MAP:
            _create_binding(
                Binding,
                config.kurum_id,
                event_key,
                recipient_type,
                message_id=getattr(config, f'{msg_field}_id', None),
            )


def backwards(apps, schema_editor):
    Binding = apps.get_model('communication', 'NotificationTemplateBinding')
    event_keys = {event for _, _, event, _ in ASSIGNMENT_MAP}
    event_keys |= {event for _, event, _ in ATTENDANCE_MAP}
    Binding.objects.filter(
        event_key__in=event_keys,
        sube__isnull=True,
        channel_config__isnull=True,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0014_notificationtemplatebinding_and_more'),
        ('assignment_manual', '0014_assignment_notify_meta_templates'),
        ('kutuphane', '0002_attendance_notifications'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
