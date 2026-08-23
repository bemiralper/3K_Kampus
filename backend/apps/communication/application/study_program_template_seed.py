"""
Haftalık çalışma programı Meta + uygulama şablon taslakları.

`koc.calisma_programi` olayı için veli/öğrenci DOCUMENT şablonları üretir.
İsteğe bağlı olarak Bildirim Şablonları eşlemesini de kurar.
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
from apps.communication.application.notification_binding_service import (
    NotificationBindingError,
    upsert_binding,
)
from apps.communication.application.notification_events import (
    MODULE_KOC,
    NOTIFICATION_EVENTS,
    build_meta_example_body,
    get_event,
    template_group_for_event_key,
)
from apps.communication.application.template_category_service import TemplateCategoryService
from apps.communication.domain.enums import (
    MetaTemplateCategory,
    MetaTemplateStatus,
    MetaTemplateUsage,
    RecipientType,
    TemplateAudienceScope,
    TemplateCategory,
)
from apps.communication.domain.models import MessageTemplate, WhatsAppMetaTemplate

STUDY_PROGRAM_EVENT_KEY = 'koc.calisma_programi'

_APP_NAME_BY_RECIPIENT: dict[str, str] = {
    RecipientType.VELI: 'Çalışma programı — Veli',
    RecipientType.OGRENCI: 'Çalışma programı — Öğrenci',
}


@dataclass(frozen=True)
class StudyProgramTemplateDraft:
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


def list_study_program_template_drafts() -> list[StudyProgramTemplateDraft]:
    drafts: list[StudyProgramTemplateDraft] = []
    for event in NOTIFICATION_EVENTS:
        if event.key != STUDY_PROGRAM_EVENT_KEY:
            continue
        if event.module != MODULE_KOC:
            continue
        for recipient in event.recipients:
            body = build_meta_example_body(event, recipient)
            issues = validate_template_content(
                body_named=body,
                header_json={'type': 'DOCUMENT'},
                footer_text='',
            )
            if issues:
                raise ValueError(
                    f'{event.key}/{recipient} Meta kurallarına uymuyor: {" ".join(issues)}',
                )
            drafts.append(
                StudyProgramTemplateDraft(
                    event_key=event.key,
                    recipient_type=recipient,
                    app_name=_APP_NAME_BY_RECIPIENT[recipient],
                    meta_name=event.suggested_meta_name(recipient),
                    body_named=body,
                    category=TemplateCategory.DUYURU,
                    audience_scope=TemplateAudienceScope.ADMIN,
                    header_json={'type': 'DOCUMENT'},
                    footer_text='',
                    variables=event.all_variables(),
                    usage_scope=MetaTemplateUsage.SYSTEM,
                    meta_category=MetaTemplateCategory.UTILITY,
                    has_document=True,
                ),
            )
    return drafts


class StudyProgramTemplateSeedService:
    """Kuruma çalışma programı uygulama (+ isteğe bağlı Meta DRAFT) şablonlarını ekler."""

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
        bind: bool = True,
    ) -> dict[str, Any]:
        drafts = list_study_program_template_drafts()
        if sube_id is not None:
            TemplateCategoryService.ensure_defaults(kurum_id, sube_id)

        created_app: list[str] = []
        updated_app: list[str] = []
        skipped_app: list[str] = []
        created_meta: list[str] = []
        updated_meta: list[str] = []
        skipped_meta: list[str] = []
        bound: list[str] = []
        errors: list[str] = []

        for draft in drafts:
            app_tpl = MessageTemplate.objects.filter(
                kurum_id=kurum_id,
                sube_id=sube_id,
                name=draft.app_name,
                audience_scope=TemplateAudienceScope.ADMIN,
            ).first()

            if app_tpl:
                stale = (
                    (app_tpl.body or '') != draft.body_named
                    or (app_tpl.header_json or {}) != (draft.header_json or {})
                )
                if stale:
                    if dry_run:
                        updated_app.append(draft.app_name)
                    else:
                        app_tpl.body = draft.body_named
                        app_tpl.header_json = dict(draft.header_json or {})
                        app_tpl.footer_text = draft.footer_text or ''
                        app_tpl.variables_json = list(draft.variables)
                        app_tpl.category = draft.category
                        app_tpl.is_active = True
                        app_tpl.save()
                        updated_app.append(draft.app_name)
                elif skip_existing:
                    skipped_app.append(draft.app_name)
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
                    template_group=template_group_for_event_key(draft.event_key),
                    variables_json=list(draft.variables),
                    created_by=user,
                    is_active=True,
                )
                created_app.append(draft.app_name)

            meta = None
            if channel_config_id:
                meta = WhatsAppMetaTemplate.objects.filter(
                    channel_config_id=channel_config_id,
                    name=draft.meta_name,
                    language='tr',
                ).first()
                if meta:
                    if (
                        meta.status == MetaTemplateStatus.DRAFT
                        and meta.body_named != draft.body_named
                    ):
                        if dry_run:
                            updated_meta.append(draft.meta_name)
                        else:
                            try:
                                MetaTemplateService.update_draft(
                                    meta,
                                    body_named=draft.body_named,
                                    header_json=dict(draft.header_json or {}),
                                    footer_text=draft.footer_text or '',
                                )
                                updated_meta.append(draft.meta_name)
                            except MetaTemplateServiceError as exc:
                                errors.append(f'{draft.meta_name}: {exc.message}')
                    elif skip_existing:
                        skipped_meta.append(draft.meta_name)
                elif dry_run:
                    created_meta.append(draft.meta_name)
                else:
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
                            template_group=template_group_for_event_key(draft.event_key),
                            user=user,
                        )
                        created_meta.append(draft.meta_name)
                        if app_tpl is not None and app_tpl.meta_template_id is None:
                            app_tpl.meta_template = meta
                            app_tpl.save(update_fields=['meta_template', 'updated_at'])
                    except MetaTemplateServiceError as exc:
                        errors.append(f'{draft.meta_name}: {exc.message}')
                        meta = None

            if bind and not dry_run and (meta or app_tpl):
                try:
                    upsert_binding(
                        kurum_id,
                        event_key=draft.event_key,
                        recipient_type=draft.recipient_type,
                        sube_id=sube_id,
                        channel_config_id=str(channel_config_id) if channel_config_id else None,
                        meta_template_id=str(meta.id) if meta else None,
                        message_template_id=str(app_tpl.id) if app_tpl else None,
                        user=user,
                    )
                    bound.append(f'{draft.meta_name}:{draft.recipient_type}')
                except NotificationBindingError as exc:
                    errors.append(
                        f'binding {draft.recipient_type}: {exc.message}',
                    )

        return {
            'kurum_id': kurum_id,
            'sube_id': sube_id,
            'channel_config_id': str(channel_config_id) if channel_config_id else None,
            'dry_run': dry_run,
            'drafts': len(drafts),
            'created_app': created_app,
            'updated_app': updated_app,
            'skipped_app': skipped_app,
            'created_meta': created_meta,
            'updated_meta': updated_meta,
            'skipped_meta': skipped_meta,
            'bound': bound,
            'errors': errors,
            'event_keys': [STUDY_PROGRAM_EVENT_KEY],
            'next_steps': [
                'Meta şablonlarına örnek PDF yükleyip onay için gönderin '
                '(calisma_programi_veli / calisma_programi_ogrenci).',
                'Onay sonrası Çalışma Programı → Yazdır → WhatsApp ile gönder kullanın.',
                'process_communication_queue cron’unun çalıştığından emin olun.',
            ],
        }

    @classmethod
    def describe(cls) -> list[dict[str, Any]]:
        rows = []
        for draft in list_study_program_template_drafts():
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
