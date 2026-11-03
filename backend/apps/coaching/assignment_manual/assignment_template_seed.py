"""
Haftalık ödev — WhatsApp PDF eki kısa mesaj şablonları (Haftalık Ödev kategorisi).
"""
from __future__ import annotations
from django.db import transaction

from apps.communication.application.template_category_service import TemplateCategoryService
from apps.communication.domain.enums import TemplateAudienceScope, TemplateCategory
from apps.communication.domain.models import MessageTemplate

from .assignment_template_roles import (
    DEFAULT_PDF_BODIES,
    ROLE_PLAN_OGRENCI,
    ROLE_PLAN_VELI,
    ROLE_REPORT_OGRENCI,
    ROLE_REPORT_VELI,
    set_config_template,
    role_variables_json,
)

TEMPLATE_NAME_PLAN_VELI = 'Ödev Planı — PDF Mesajı (Veli)'
TEMPLATE_NAME_PLAN_OGRENCI = 'Ödev Planı — PDF Mesajı (Öğrenci)'
TEMPLATE_NAME_REPORT_VELI = 'Ödev Kontrol Raporu — PDF Mesajı (Veli)'
TEMPLATE_NAME_REPORT_OGRENCI = 'Ödev Kontrol Raporu — PDF Mesajı (Öğrenci)'

_ROLE_SPECS: list[tuple[str, str, str, str]] = [
    (ROLE_PLAN_VELI, TEMPLATE_NAME_PLAN_VELI, DEFAULT_PDF_BODIES[('plan', 'veli')], 'plan_veli_template'),
    (ROLE_PLAN_OGRENCI, TEMPLATE_NAME_PLAN_OGRENCI, DEFAULT_PDF_BODIES[('plan', 'ogrenci')], 'plan_ogrenci_template'),
    (ROLE_REPORT_VELI, TEMPLATE_NAME_REPORT_VELI, DEFAULT_PDF_BODIES[('report', 'veli')], 'report_veli_template'),
    (ROLE_REPORT_OGRENCI, TEMPLATE_NAME_REPORT_OGRENCI, DEFAULT_PDF_BODIES[('report', 'ogrenci')], 'report_ogrenci_template'),
]

_ROLE_TO_NOTIFY: dict[str, tuple[str, str]] = {
    ROLE_PLAN_VELI: ('plan', 'veli'),
    ROLE_PLAN_OGRENCI: ('plan', 'ogrenci'),
    ROLE_REPORT_VELI: ('report', 'veli'),
    ROLE_REPORT_OGRENCI: ('report', 'ogrenci'),
}


def _default_sube_id(kurum_id: int) -> int | None:
    from apps.sube.domain.models import Sube
    return Sube.objects.filter(kurum_id=kurum_id).order_by('id').values_list('id', flat=True).first()


@transaction.atomic
def ensure_role_template(
    kurum_id: int,
    role: str,
    *,
    sube_id: int | None = None,
    link_config: bool = True,
) -> MessageTemplate:
    """Belirli rol için varsayılan şablonu oluştur; isteğe bağlı config'e bağla."""
    spec = next((row for row in _ROLE_SPECS if row[0] == role), None)
    if not spec:
        raise ValueError(f'Bilinmeyen ödev şablon rolü: {role}')

    from apps.kurum.domain.models import Kurum
    Kurum.objects.select_for_update().get(pk=kurum_id)

    if sube_id is None:
        sube_id = _default_sube_id(kurum_id)
    if not sube_id:
        raise ValueError(f'Kurum {kurum_id} için şube bulunamadı.')

    _role, name, body, _field = spec
    TemplateCategoryService.ensure_defaults(kurum_id, sube_id)

    tpl = MessageTemplate.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        category=TemplateCategory.HAFTALIK_ODEV,
        name=name,
    ).first()
    if not tpl:
        tpl = MessageTemplate.objects.create(
            kurum_id=kurum_id,
            sube_id=sube_id,
            name=name,
            category=TemplateCategory.HAFTALIK_ODEV,
            body=body,
            audience_scope=TemplateAudienceScope.COACH,
            variables_json=role_variables_json(role),
            is_active=True,
        )
    if link_config:
        # Explicit setup only: serialize initial binding and preserve user choices.
        from .assignment_template_roles import get_or_create_config, ROLE_CONFIG_FIELDS
        with transaction.atomic():
            config = get_or_create_config(kurum_id)
            if config:
                config = type(config).objects.select_for_update().get(pk=config.pk)
                field = ROLE_CONFIG_FIELDS[role]
                if not getattr(config, f'{field}_id'):
                    setattr(config, field, tpl)
                    config.save(update_fields=[field, 'updated_at'])
    return tpl


def ensure_assignment_pdf_templates(kurum_id: int, *, link_config: bool = True) -> None:
    """Kurum için tüm ödev PDF mesaj şablonlarını oluştur; isteğe bağlı config'e bağla."""
    for role, _name, _body, _field in _ROLE_SPECS:
        ensure_role_template(kurum_id, role, link_config=link_config)


def get_template_role(template: MessageTemplate) -> str | None:
    from .assignment_template_roles import get_template_odev_role
    return get_template_odev_role(template)


def get_pdf_message_template(
    kurum_id: int,
    notify_type: str,
    recipient_type: str,
) -> MessageTemplate | None:
    """notify_type: plan|report — recipient_type: veli|ogrenci"""
    return get_pdf_message_templates(kurum_id).get((notify_type, recipient_type))


def get_pdf_message_templates(kurum_id: int) -> dict:
    """Read the four slots once, never seed, reactivate or alter a mapping."""
    from .models import AssignmentNotificationConfig
    from .assignment_template_roles import ROLE_CONFIG_FIELDS
    config = AssignmentNotificationConfig.objects.select_related(
        *ROLE_CONFIG_FIELDS.values()
    ).filter(kurum_id=kurum_id).first()
    result = {}
    missing = {}
    for role, pair in _ROLE_TO_NOTIFY.items():
        tpl = getattr(config, ROLE_CONFIG_FIELDS[role], None) if config else None
        if tpl and tpl.kurum_id == kurum_id and tpl.is_active:
            result[pair] = tpl
        elif not config or not getattr(config, f'{ROLE_CONFIG_FIELDS[role]}_id'):
            missing[role] = pair
    # Legacy installations may have customized named templates but no config
    # row yet. Preserve their text without seeding or changing an inactive slot.
    if missing:
        names = {name: missing[role] for role, name, _, _ in _ROLE_SPECS if role in missing}
        branch_id = _default_sube_id(kurum_id)
        if branch_id:
            for template in MessageTemplate.objects.filter(
                kurum_id=kurum_id, sube_id=branch_id,
                category=TemplateCategory.HAFTALIK_ODEV, name__in=names, is_active=True,
            ):
                result.setdefault(names[template.name], template)
    return result


def default_pdf_message_body(notify_type: str, recipient_type: str) -> str:
    return DEFAULT_PDF_BODIES.get(
        (notify_type, recipient_type),
        'PDF ektedir.',
    )
