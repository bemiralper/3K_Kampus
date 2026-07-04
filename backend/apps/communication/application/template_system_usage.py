"""
Sistem tarafından kullanılan şablonların silinmesi / yeniden atanması.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.communication.domain.models import MessageTemplate
from apps.kutuphane.domain.models import AttendanceNotificationConfig


def deactivate_template_with_reassignment(template: MessageTemplate) -> dict:
    """
    Şablonu pasifleştir. Sistem kullanımı varsa başka şablona aktar veya varsayılanı oluştur.
    """
    from apps.coaching.assignment_manual.assignment_template_roles import (
        ROLE_CONFIG_FIELDS,
        ROLE_LABELS,
        find_replacement_template,
        get_template_odev_role,
        list_template_system_usages,
        recreate_default_template_for_role,
        set_config_template,
    )

    usages = list_template_system_usages(template)
    if not usages:
        template.is_active = False
        template.save(update_fields=['is_active', 'updated_at'])
        return {'reassigned': [], 'warning': ''}

    reassigned: list[dict] = []
    warnings: list[str] = []

    with transaction.atomic():
        for usage in usages:
            if usage['module'] == 'assignment_manual':
                role = usage['role']
                replacement = find_replacement_template(
                    template.kurum_id,
                    role,
                    exclude_id=template.id,
                )
                if not replacement:
                    try:
                        replacement = recreate_default_template_for_role(template.kurum_id, role)
                        warnings.append(
                            f'{ROLE_LABELS[role]} için yeni varsayılan şablon oluşturuldu.',
                        )
                    except Exception as exc:
                        raise ValidationError(
                            f'Bu şablon "{ROLE_LABELS[role]}" gönderiminde aktif kullanılıyor. '
                            f'Alternatif şablon bulunamadı: {exc}',
                        ) from exc
                set_config_template(template.kurum_id, role, replacement)
                reassigned.append({
                    'role': role,
                    'label': ROLE_LABELS[role],
                    'template_id': str(replacement.id),
                    'template_name': replacement.name,
                })

            elif usage['module'] == 'kutuphane':
                att = AttendanceNotificationConfig.objects.filter(
                    kurum_id=template.kurum_id,
                ).select_for_update().first()
                if not att:
                    continue
                field = usage['role']
                replacement = (
                    MessageTemplate.objects.filter(
                        kurum_id=template.kurum_id,
                        category=template.category,
                        is_active=True,
                    )
                    .exclude(id=template.id)
                    .order_by('-updated_at')
                    .first()
                )
                if not replacement:
                    from apps.kutuphane.application.attendance_template_seed import (
                        ensure_attendance_notification_setup,
                    )

                    setup = ensure_attendance_notification_setup(template.kurum_id)
                    att = setup
                    replacement = getattr(att, field, None)
                    if replacement and replacement.id == template.id:
                        replacement = None
                    if replacement:
                        warnings.append(f'{usage["label"]} için varsayılan şablon atandı.')
                if replacement:
                    setattr(att, field, replacement)
                    att.save(update_fields=[field, 'updated_at'])
                    reassigned.append({
                        'role': field,
                        'label': usage['label'],
                        'template_id': str(replacement.id),
                        'template_name': replacement.name,
                    })
                else:
                    raise ValidationError(
                        f'Bu şablon "{usage["label"]}" için aktif kullanılıyor. '
                        'Silmeden önce aynı kategoride başka bir şablonu aktif yapın.',
                    )

        template.is_active = False
        template.save(update_fields=['is_active', 'updated_at'])

    warning_text = ' '.join(warnings)
    if reassigned:
        names = ', '.join(f'"{r["label"]}" → {r["template_name"]}' for r in reassigned)
        warning_text = (warning_text + ' ' if warning_text else '') + f'Yeni aktif şablonlar: {names}'

    return {'reassigned': reassigned, 'warning': warning_text.strip()}


def activate_assignment_template_role(template: MessageTemplate, role: str) -> None:
    from apps.coaching.assignment_manual.assignment_template_roles import (
        ROLE_LABELS,
        role_variables_json,
        set_config_template,
    )

    if role not in ROLE_LABELS:
        raise ValidationError('Geçersiz ödev şablon rolü.')

    template.is_active = True
    template.variables_json = role_variables_json(role)
    if template.category != 'haftalik_odev':
        template.category = 'haftalik_odev'
    template.save(update_fields=['is_active', 'variables_json', 'category', 'updated_at'])
    set_config_template(template.kurum_id, role, template)
