"""
Finans / muhasebe Meta + uygulama şablon taslakları.

Finans modülündeki bildirim olaylarından Meta kurallarına uygun taslaklar üretir.
Telefon bağlandıktan sonra --channel-config-id ile Meta DRAFT kayıtları da
oluşturulabilir; yalnızca uygulama şablonları için hesap gerekmez.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db import transaction

from apps.communication.application.meta_template_service import (
    MetaTemplateService,
    MetaTemplateServiceError,
)
from apps.communication.application.meta_template_validation import validate_template_content
from apps.communication.application.notification_events import (
    MODULE_FINANS,
    MODULE_ODEME,
    NOTIFICATION_EVENTS,
    build_meta_example_body,
    get_event,
)
from apps.communication.application.template_category_service import TemplateCategoryService
from apps.communication.domain.enums import (
    MetaTemplateCategory,
    MetaTemplateUsage,
    RecipientType,
    TemplateAudienceScope,
    TemplateCategory,
)
from apps.communication.domain.models import MessageTemplate, WhatsAppMetaTemplate

FINANCE_EVENT_KEYS: tuple[str, ...] = (
    'odeme.hatirlatma',
    'odeme.gecikme',
    'odeme.plan',
    'odeme.makbuz',
    'odeme.sozlesme',
    'finans.gun_sonu',
)

# Eski ortak "Ödeme belgesi" taslakları — seed sırasında temizlenir.
LEGACY_APP_TEMPLATE_NAMES: tuple[str, ...] = (
    'Ödeme belgesi — Veli',
    'Ödeme belgesi — Öğrenci',
)

_APP_NAME_BY_SLOT: dict[tuple[str, str], str] = {
    ('odeme.hatirlatma', RecipientType.VELI): 'Ödeme hatırlatma — Veli',
    ('odeme.gecikme', RecipientType.VELI): 'Ödeme gecikme — Veli',
    ('odeme.plan', RecipientType.VELI): 'Ödeme planı — Veli',
    ('odeme.plan', RecipientType.OGRENCI): 'Ödeme planı — Öğrenci',
    ('odeme.makbuz', RecipientType.VELI): 'Tahsilat makbuzu — Veli',
    ('odeme.makbuz', RecipientType.OGRENCI): 'Tahsilat makbuzu — Öğrenci',
    ('odeme.sozlesme', RecipientType.VELI): 'Sözleşme belgesi — Veli',
    ('odeme.sozlesme', RecipientType.OGRENCI): 'Sözleşme belgesi — Öğrenci',
    ('finans.gun_sonu', RecipientType.PERSONEL): 'Gün sonu raporu — Personel',
}

_CATEGORY_BY_EVENT: dict[str, str] = {
    'odeme.hatirlatma': TemplateCategory.ODEME,
    'odeme.gecikme': TemplateCategory.ODEME_GECIKME,
    'odeme.plan': TemplateCategory.ODEME,
    'odeme.makbuz': TemplateCategory.ODEME,
    'odeme.sozlesme': TemplateCategory.ODEME,
    'finans.gun_sonu': TemplateCategory.ODEME,
}


@dataclass(frozen=True)
class FinanceTemplateDraft:
    event_key: str
    recipient_type: str
    app_name: str
    meta_name: str
    body_named: str
    category: str
    audience_scope: str
    header_json: dict[str, Any]
    footer_text: str
    variables: tuple[str, ...]
    usage_scope: str
    meta_category: str
    has_document: bool


def list_finance_template_drafts() -> list[FinanceTemplateDraft]:
    """Finans olaylarından Meta/uygulama taslak tanımlarını döner."""
    drafts: list[FinanceTemplateDraft] = []
    for event in NOTIFICATION_EVENTS:
        if event.key not in FINANCE_EVENT_KEYS:
            continue
        if event.module not in (MODULE_ODEME, MODULE_FINANS):
            continue
        for recipient in event.recipients:
            body = build_meta_example_body(event, recipient)
            issues = validate_template_content(
                body_named=body,
                header_json={'type': 'DOCUMENT'} if event.has_document else {},
                footer_text='',
            )
            if issues:
                raise ValueError(
                    f'{event.key}/{recipient} Meta kurallarına uymuyor: {" ".join(issues)}',
                )
            drafts.append(
                FinanceTemplateDraft(
                    event_key=event.key,
                    recipient_type=recipient,
                    app_name=_APP_NAME_BY_SLOT[(event.key, recipient)],
                    meta_name=event.suggested_meta_name(recipient),
                    body_named=body,
                    category=_CATEGORY_BY_EVENT[event.key],
                    audience_scope=TemplateAudienceScope.MUHASEBE,
                    header_json={'type': 'DOCUMENT'} if event.has_document else {},
                    footer_text='',
                    variables=event.all_variables(),
                    usage_scope=MetaTemplateUsage.SYSTEM,
                    meta_category=MetaTemplateCategory.UTILITY,
                    has_document=event.has_document,
                ),
            )
    return drafts


class FinanceTemplateSeedService:
    """Kuruma finans uygulama (+ isteğe bağlı Meta DRAFT) şablonlarını ekler."""

    @classmethod
    def _purge_legacy_app_templates(
        cls,
        kurum_id: int,
        *,
        sube_id: int | None,
        dry_run: bool,
    ) -> list[str]:
        qs = MessageTemplate.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            audience_scope=TemplateAudienceScope.MUHASEBE,
            name__in=LEGACY_APP_TEMPLATE_NAMES,
        )
        names = list(qs.values_list('name', flat=True))
        if names and not dry_run:
            qs.delete()
        return names

    @classmethod
    @transaction.atomic
    def seed(
        cls,
        kurum_id: int,
        *,
        sube_id: int | None = None,
        channel_config_id=None,
        user=None,
        dry_run: bool = False,
        skip_existing: bool = True,
    ) -> dict[str, Any]:
        drafts = list_finance_template_drafts()
        if sube_id is not None:
            TemplateCategoryService.ensure_defaults(kurum_id, sube_id)

        removed_legacy = cls._purge_legacy_app_templates(
            kurum_id, sube_id=sube_id, dry_run=dry_run,
        )
        created_app: list[str] = []
        skipped_app: list[str] = []
        created_meta: list[str] = []
        skipped_meta: list[str] = []
        errors: list[str] = []

        for draft in drafts:
            app_exists = MessageTemplate.objects.filter(
                kurum_id=kurum_id,
                sube_id=sube_id,
                name=draft.app_name,
                audience_scope=TemplateAudienceScope.MUHASEBE,
            ).exists()
            if app_exists and skip_existing:
                skipped_app.append(draft.app_name)
                app_tpl = None
            elif dry_run:
                created_app.append(draft.app_name)
                app_tpl = None
            else:
                app_tpl = MessageTemplate.objects.create(
                    kurum_id=kurum_id,
                    sube_id=sube_id,
                    name=draft.app_name,
                    body=draft.body_named,
                    header_json=dict(draft.header_json or {}),
                    footer_text=draft.footer_text or '',
                    category=draft.category,
                    audience_scope=draft.audience_scope,
                    variables_json=list(draft.variables),
                    created_by=user,
                    is_active=True,
                )
                created_app.append(draft.app_name)

            if not channel_config_id:
                continue

            meta_exists = WhatsAppMetaTemplate.objects.filter(
                channel_config_id=channel_config_id,
                name=draft.meta_name,
                language='tr',
            ).exists()
            if meta_exists and skip_existing:
                skipped_meta.append(draft.meta_name)
                continue
            if dry_run:
                created_meta.append(draft.meta_name)
                continue
            try:
                meta = MetaTemplateService.create_draft(
                    kurum_id,
                    channel_config_id=channel_config_id,
                    name=draft.meta_name,
                    language='tr',
                    meta_category=draft.meta_category,
                    body_named=draft.body_named,
                    header_json=dict(draft.header_json or {}),
                    footer_text=draft.footer_text or '',
                    usage_scope=draft.usage_scope,
                    user=user,
                )
                created_meta.append(draft.meta_name)
                if app_tpl is not None and app_tpl.meta_template_id is None:
                    app_tpl.meta_template = meta
                    app_tpl.save(update_fields=['meta_template', 'updated_at'])
            except MetaTemplateServiceError as exc:
                errors.append(f'{draft.meta_name}: {exc.message}')

        return {
            'kurum_id': kurum_id,
            'sube_id': sube_id,
            'channel_config_id': str(channel_config_id) if channel_config_id else None,
            'dry_run': dry_run,
            'drafts': len(drafts),
            'created_app': created_app,
            'skipped_app': skipped_app,
            'created_meta': created_meta,
            'skipped_meta': skipped_meta,
            'removed_legacy': removed_legacy,
            'errors': errors,
            'event_keys': list(FINANCE_EVENT_KEYS),
        }

    @classmethod
    def describe(cls) -> list[dict[str, Any]]:
        """CLI / UI için insan okunur özet."""
        rows = []
        for draft in list_finance_template_drafts():
            event = get_event(draft.event_key)
            rows.append({
                'event_key': draft.event_key,
                'event_label': event.label if event else draft.event_key,
                'recipient_type': draft.recipient_type,
                'app_name': draft.app_name,
                'meta_name': draft.meta_name,
                'category': draft.category,
                'audience_scope': draft.audience_scope,
                'has_document': draft.has_document,
                'body_named': draft.body_named,
                'variables': list(draft.variables),
            })
        return rows
