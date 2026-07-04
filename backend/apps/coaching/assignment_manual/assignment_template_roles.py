"""
Ödev PDF WhatsApp şablon rolleri ve kurum config eşlemesi.
"""
from __future__ import annotations

from apps.coaching.assignment_manual.models import AssignmentNotificationConfig
from apps.communication.domain.enums import TemplateCategory
from apps.communication.domain.models import MessageTemplate

ROLE_PLAN_VELI = 'plan_veli'
ROLE_PLAN_OGRENCI = 'plan_ogrenci'
ROLE_REPORT_VELI = 'report_veli'
ROLE_REPORT_OGRENCI = 'report_ogrenci'

ODEV_PDF_ROLE_VAR = 'odev_pdf_role'

ROLE_LABELS: dict[str, str] = {
    ROLE_PLAN_VELI: 'Ödev planı PDF — Veli WhatsApp',
    ROLE_PLAN_OGRENCI: 'Ödev planı PDF — Öğrenci WhatsApp',
    ROLE_REPORT_VELI: 'Ödev kontrol raporu PDF — Veli WhatsApp',
    ROLE_REPORT_OGRENCI: 'Ödev kontrol raporu PDF — Öğrenci WhatsApp',
}

NOTIFY_RECIPIENT_TO_ROLE: dict[tuple[str, str], str] = {
    ('plan', 'veli'): ROLE_PLAN_VELI,
    ('plan', 'ogrenci'): ROLE_PLAN_OGRENCI,
    ('report', 'veli'): ROLE_REPORT_VELI,
    ('report', 'ogrenci'): ROLE_REPORT_OGRENCI,
}

ROLE_CONFIG_FIELDS: dict[str, str] = {
    ROLE_PLAN_VELI: 'plan_veli_template',
    ROLE_PLAN_OGRENCI: 'plan_ogrenci_template',
    ROLE_REPORT_VELI: 'report_veli_template',
    ROLE_REPORT_OGRENCI: 'report_ogrenci_template',
}

DEFAULT_PDF_BODIES: dict[tuple[str, str], str] = {
    ('plan', 'veli'): '{{ogrenci_ad}} — Ödev planı ektedir.',
    ('plan', 'ogrenci'): 'Ödev planı ektedir.',
    ('report', 'veli'): '{{ogrenci_ad}} — Ödev kontrol raporu ektedir.',
    ('report', 'ogrenci'): 'Ödev kontrol raporu ektedir.',
}


def role_variables_json(role: str) -> list[dict]:
    return [{'key': ODEV_PDF_ROLE_VAR, 'value': role}]


def get_template_odev_role(template: MessageTemplate) -> str | None:
    for item in template.variables_json or []:
        if isinstance(item, dict) and item.get('key') == ODEV_PDF_ROLE_VAR:
            value = (item.get('value') or '').strip()
            if value in ROLE_LABELS:
                return value
    return None


def _config_table_available() -> bool:
    try:
        from django.db import connection
        return AssignmentNotificationConfig._meta.db_table in connection.introspection.table_names()
    except Exception:
        return False


def get_or_create_config(kurum_id: int) -> AssignmentNotificationConfig | None:
    if not _config_table_available():
        return None
    config, _ = AssignmentNotificationConfig.objects.get_or_create(kurum_id=kurum_id)
    return config


def get_config_template(config: AssignmentNotificationConfig, role: str) -> MessageTemplate | None:
    field = ROLE_CONFIG_FIELDS.get(role)
    if not field:
        return None
    return getattr(config, field, None)


def set_config_template(
    kurum_id: int,
    role: str,
    template: MessageTemplate | None,
) -> AssignmentNotificationConfig | None:
    config = get_or_create_config(kurum_id)
    if config is None:
        return None
    field = ROLE_CONFIG_FIELDS[role]
    setattr(config, field, template)
    config.save(update_fields=[field, 'updated_at'])
    return config


def get_active_template_for_notify(
    kurum_id: int,
    notify_type: str,
    recipient_type: str,
) -> MessageTemplate | None:
    if not _config_table_available():
        return _fallback_template_by_notify(kurum_id, notify_type, recipient_type)
    role = NOTIFY_RECIPIENT_TO_ROLE.get((notify_type, recipient_type))
    if not role:
        return None
    config = AssignmentNotificationConfig.objects.filter(kurum_id=kurum_id).first()
    if not config:
        return None
    tpl = get_config_template(config, role)
    if tpl and tpl.is_active:
        return tpl
    return None


def _fallback_template_by_notify(
    kurum_id: int,
    notify_type: str,
    recipient_type: str,
) -> MessageTemplate | None:
    """Config tablosu yokken şablon adına göre bul."""
    from .assignment_template_seed import (
        TEMPLATE_NAME_PLAN_OGRENCI,
        TEMPLATE_NAME_PLAN_VELI,
        TEMPLATE_NAME_REPORT_OGRENCI,
        TEMPLATE_NAME_REPORT_VELI,
    )

    name_map = {
        ('plan', 'veli'): TEMPLATE_NAME_PLAN_VELI,
        ('plan', 'ogrenci'): TEMPLATE_NAME_PLAN_OGRENCI,
        ('report', 'veli'): TEMPLATE_NAME_REPORT_VELI,
        ('report', 'ogrenci'): TEMPLATE_NAME_REPORT_OGRENCI,
    }
    name = name_map.get((notify_type, recipient_type))
    if not name:
        return None
    return MessageTemplate.objects.filter(
        kurum_id=kurum_id,
        category=TemplateCategory.HAFTALIK_ODEV,
        name=name,
        is_active=True,
    ).first()


def list_template_system_usages(template: MessageTemplate) -> list[dict]:
    """Şablonun hangi otomasyonlarda aktif olduğunu döndür."""
    usages: list[dict] = []
    kurum_id = template.kurum_id

    config = AssignmentNotificationConfig.objects.filter(kurum_id=kurum_id).first()
    if config:
        for role, field in ROLE_CONFIG_FIELDS.items():
            active_tpl = getattr(config, field, None)
            if active_tpl and active_tpl.id == template.id:
                usages.append({
                    'module': 'assignment_manual',
                    'role': role,
                    'label': ROLE_LABELS[role],
                    'is_active': True,
                })

    from apps.kutuphane.domain.models import AttendanceNotificationConfig

    att = AttendanceNotificationConfig.objects.filter(kurum_id=kurum_id).first()
    if att:
        attendance_map = {
            'absent_template': 'Yoklama — Gelmedi bildirimi',
            'late_template': 'Yoklama — Geç kalma bildirimi',
            'exit_template': 'Yoklama — Çıkış bildirimi',
        }
        for field, label in attendance_map.items():
            active_tpl = getattr(att, field, None)
            if active_tpl and active_tpl.id == template.id:
                usages.append({
                    'module': 'kutuphane',
                    'role': field,
                    'label': label,
                    'is_active': True,
                })

    return usages


def find_replacement_template(
    kurum_id: int,
    role: str,
    *,
    exclude_id,
) -> MessageTemplate | None:
    """Aynı ödev rolüne sahip başka aktif şablon."""
    qs = MessageTemplate.objects.filter(
        kurum_id=kurum_id,
        category=TemplateCategory.HAFTALIK_ODEV,
        is_active=True,
    ).exclude(id=exclude_id).order_by('-updated_at')
    for tpl in qs:
        if get_template_odev_role(tpl) == role:
            return tpl
    return qs.first()


def recreate_default_template_for_role(kurum_id: int, role: str) -> MessageTemplate:
    from .assignment_template_seed import ensure_role_template

    return ensure_role_template(kurum_id, role)
