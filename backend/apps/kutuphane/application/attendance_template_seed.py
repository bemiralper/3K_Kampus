"""
Yoklama veli bildirimi — varsayılan şablon ve kategori seed.
"""
from __future__ import annotations

from apps.communication.application.template_category_service import TemplateCategoryService
from apps.communication.domain.enums import TemplateAudienceScope, TemplateCategory
from apps.communication.domain.models import MessageTemplate, MessageTemplateCategory
from apps.kutuphane.domain.models import AttendanceNotificationConfig

DEFAULT_TEMPLATES: dict[str, tuple[str, str]] = {
    TemplateCategory.YOKLAMA_GELMEDI: (
        'Yoklama — Gelmedi (Varsayılan)',
        (
            'Sayın {{veli_ad}},\n\n'
            '{{ogrenci_ad}} bugün {{yoklama_tarihi}} tarihinde {{oturum_ad}} oturumuna '
            '{{salon_ad}} salonunda gelmemiştir.\n\n'
            '{{kurum_ad}}'
        ),
    ),
    TemplateCategory.YOKLAMA_GEC: (
        'Yoklama — Geç Kalma (Varsayılan)',
        (
            'Sayın {{veli_ad}},\n\n'
            '{{ogrenci_ad}} bugün {{oturum_ad}} oturumuna {{giris_saati}} saatinde '
            'geç giriş yapmıştır. ({{salon_ad}} — {{yoklama_tarihi}})\n\n'
            '{{kurum_ad}}'
        ),
    ),
    TemplateCategory.YOKLAMA_CIKIS: (
        'Yoklama — Çıkış (Varsayılan)',
        (
            'Sayın {{veli_ad}},\n\n'
            '{{ogrenci_ad}} {{oturum_ad}} oturumunda {{cikis_saati}} saatinde '
            'çıkış yapmıştır. ({{salon_ad}} — {{yoklama_tarihi}})\n\n'
            '{{kurum_ad}}'
        ),
    ),
}

EVENT_TO_CATEGORY = {
    'ABSENT': TemplateCategory.YOKLAMA_GELMEDI,
    'LATE': TemplateCategory.YOKLAMA_GEC,
    'EXIT': TemplateCategory.YOKLAMA_CIKIS,
}

EVENT_TO_TEMPLATE_FIELD = {
    'ABSENT': 'absent_template_id',
    'LATE': 'late_template_id',
    'EXIT': 'exit_template_id',
}


def ensure_yoklama_categories(kurum_id: int, *, sube_id: int | None = None) -> None:
    """Mevcut kurumlara yoklama kategorilerini ekle."""
    if sube_id is None:
        from apps.sube.domain.models import Sube
        sube_id = Sube.objects.filter(kurum_id=kurum_id).order_by('id').values_list('id', flat=True).first()
    if not sube_id:
        return
    TemplateCategoryService.ensure_defaults(kurum_id, sube_id)
    seeds = [
        (TemplateCategory.YOKLAMA_GELMEDI, 'Yoklama — Gelmedi', 31, TemplateAudienceScope.COACH),
        (TemplateCategory.YOKLAMA_GEC, 'Yoklama — Geç Kalma', 32, TemplateAudienceScope.COACH),
        (TemplateCategory.YOKLAMA_CIKIS, 'Yoklama — Çıkış', 33, TemplateAudienceScope.COACH),
    ]
    for slug, label, order, scope in seeds:
        MessageTemplateCategory.objects.get_or_create(
            kurum_id=kurum_id,
            sube_id=sube_id,
            slug=slug,
            defaults={
                'label': label,
                'sort_order': order,
                'audience_scope': scope,
                'is_active': True,
            },
        )


def ensure_attendance_notification_setup(kurum_id: int, *, sube_id: int | None = None) -> AttendanceNotificationConfig:
    """Kategoriler, varsayılan şablonlar ve kurum config."""
    if sube_id is None:
        from apps.sube.domain.models import Sube
        sube_id = Sube.objects.filter(kurum_id=kurum_id).order_by('id').values_list('id', flat=True).first()
    if not sube_id:
        raise ValueError(f'Kurum {kurum_id} için şube bulunamadı.')
    ensure_yoklama_categories(kurum_id, sube_id=sube_id)

    templates_by_category: dict[str, MessageTemplate] = {}
    for category, (name, body) in DEFAULT_TEMPLATES.items():
        tpl = MessageTemplate.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            category=category,
            is_active=True,
        ).order_by('created_at').first()
        if not tpl:
            tpl = MessageTemplate.objects.create(
                kurum_id=kurum_id,
                sube_id=sube_id,
                name=name,
                category=category,
                body=body,
                audience_scope=TemplateAudienceScope.COACH,
                is_active=True,
            )
        templates_by_category[category] = tpl

    config, _ = AttendanceNotificationConfig.objects.get_or_create(
        kurum_id=kurum_id,
        defaults={'is_active': True},
    )
    updated = False
    if not config.absent_template_id:
        config.absent_template = templates_by_category[TemplateCategory.YOKLAMA_GELMEDI]
        updated = True
    if not config.late_template_id:
        config.late_template = templates_by_category[TemplateCategory.YOKLAMA_GEC]
        updated = True
    if not config.exit_template_id:
        config.exit_template = templates_by_category[TemplateCategory.YOKLAMA_CIKIS]
        updated = True
    if updated:
        config.save()
    return config
