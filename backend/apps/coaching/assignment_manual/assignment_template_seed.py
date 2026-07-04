"""
Haftalık ödev — WhatsApp PDF eki kısa mesaj şablonları (Haftalık Ödev kategorisi).
"""
from __future__ import annotations

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
    else:
        updates: list[str] = []
        if not tpl.is_active:
            tpl.is_active = True
            updates.append('is_active')
        if get_template_role(tpl) != role:
            tpl.variables_json = role_variables_json(role)
            updates.append('variables_json')
        if updates:
            updates.append('updated_at')
            tpl.save(update_fields=updates)

    if link_config:
        set_config_template(kurum_id, role, tpl)
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
    from .assignment_template_roles import _config_table_available

    link_config = _config_table_available()
    ensure_assignment_pdf_templates(kurum_id, link_config=link_config)
    from .assignment_template_roles import get_active_template_for_notify

    tpl = get_active_template_for_notify(kurum_id, notify_type, recipient_type)
    if tpl:
        return tpl

    role = next(
        (r for r, pair in _ROLE_TO_NOTIFY.items() if pair == (notify_type, recipient_type)),
        None,
    )
    if role:
        return ensure_role_template(kurum_id, role, link_config=link_config)
    return None


def default_pdf_message_body(notify_type: str, recipient_type: str) -> str:
    return DEFAULT_PDF_BODIES.get(
        (notify_type, recipient_type),
        'PDF ektedir.',
    )
