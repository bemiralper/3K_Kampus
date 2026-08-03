"""
Geçiş köprüsü — merkezi eşleme öncesi modül config'leri.

`NotificationTemplateBinding` kaydı bulunmayan olaylar için eski
`AssignmentNotificationConfig` / `AttendanceNotificationConfig` alanları okunur.
Veri göçü sonrası bu yol yalnızca elle oluşturulmuş eski kayıtlar için devrededir.
"""
from __future__ import annotations

from django.db import connection

from apps.communication.domain.enums import RecipientType

# (event_key, recipient_type) → AssignmentNotificationConfig alan adları
_ASSIGNMENT_FIELDS: dict[tuple[str, str], tuple[str, str]] = {
    ('odev.plan', RecipientType.VELI): ('plan_veli_meta_template', 'plan_veli_template'),
    ('odev.plan', RecipientType.OGRENCI): ('plan_ogrenci_meta_template', 'plan_ogrenci_template'),
    ('odev.rapor', RecipientType.VELI): ('report_veli_meta_template', 'report_veli_template'),
    ('odev.rapor', RecipientType.OGRENCI): ('report_ogrenci_meta_template', 'report_ogrenci_template'),
}

# (event_key, recipient_type) → AttendanceNotificationConfig alan adı
_ATTENDANCE_FIELDS: dict[tuple[str, str], str] = {
    ('yoklama.gelmedi', RecipientType.VELI): 'absent_template',
    ('yoklama.gec', RecipientType.VELI): 'late_template',
    ('yoklama.cikis', RecipientType.VELI): 'exit_template',
}


def _table_exists(model) -> bool:
    try:
        return model._meta.db_table in connection.introspection.table_names()
    except Exception:
        return False


def _assignment_templates(kurum_id: int, fields: tuple[str, str]):
    from apps.coaching.assignment_manual.models import AssignmentNotificationConfig

    if not _table_exists(AssignmentNotificationConfig):
        return None, None
    config = AssignmentNotificationConfig.objects.filter(kurum_id=kurum_id).first()
    if not config:
        return None, None
    meta_field, msg_field = fields
    meta_tpl = getattr(config, meta_field, None) if hasattr(config, meta_field) else None
    msg_tpl = getattr(config, msg_field, None) if hasattr(config, msg_field) else None
    return meta_tpl, msg_tpl


def _attendance_template(kurum_id: int, field: str):
    from apps.kutuphane.domain.models import AttendanceNotificationConfig

    if not _table_exists(AttendanceNotificationConfig):
        return None
    config = AttendanceNotificationConfig.objects.filter(kurum_id=kurum_id).first()
    if not config:
        return None
    return getattr(config, field, None)


def legacy_templates_for_event(kurum_id: int, event_key: str, recipient_type: str):
    """Eski config modellerinden (meta_template, message_template) döndür."""
    assignment_fields = _ASSIGNMENT_FIELDS.get((event_key, recipient_type))
    if assignment_fields:
        return _assignment_templates(kurum_id, assignment_fields)

    attendance_field = _ATTENDANCE_FIELDS.get((event_key, recipient_type))
    if attendance_field:
        return None, _attendance_template(kurum_id, attendance_field)

    return None, None


def legacy_binding_rows(kurum_id: int) -> list[dict]:
    """Veri göçü için: eski config'lerdeki dolu alanları binding sözlüğü olarak ver."""
    rows: list[dict] = []
    for (event_key, recipient_type), fields in _ASSIGNMENT_FIELDS.items():
        meta_tpl, msg_tpl = _assignment_templates(kurum_id, fields)
        if meta_tpl or msg_tpl:
            rows.append({
                'event_key': event_key,
                'recipient_type': recipient_type,
                'meta_template': meta_tpl,
                'message_template': msg_tpl,
            })
    for (event_key, recipient_type), field in _ATTENDANCE_FIELDS.items():
        msg_tpl = _attendance_template(kurum_id, field)
        if msg_tpl:
            rows.append({
                'event_key': event_key,
                'recipient_type': recipient_type,
                'meta_template': None,
                'message_template': msg_tpl,
            })
    return rows
