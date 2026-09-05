"""
Ölçme / sınav bildirim Meta + LMS şablon taslakları.

`sinav.*` olayları için veli/öğrenci şablonlarını üretir ve bağlar.
Karne ve cevap anahtarı DOCUMENT header ister.
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
    MODULE_SINAV,
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
from apps.communication.domain.models import MessageTemplate

SINAV_EVENT_KEYS: tuple[str, ...] = (
    'sinav.sonuc',
    'sinav.hatirlatma',
    'sinav.yoklama',
    'sinav.karne',
    'sinav.cevap_anahtari',
)

_APP_NAME_BY_SLOT: dict[tuple[str, str], str] = {
    ('sinav.sonuc', RecipientType.VELI): 'Sınav sonucu — Veli',
    ('sinav.hatirlatma', RecipientType.VELI): 'Sınav bilgilendirmesi — Veli',
    ('sinav.hatirlatma', RecipientType.OGRENCI): 'Sınav bilgilendirmesi — Öğrenci',
    ('sinav.yoklama', RecipientType.VELI): 'Sınav yoklama — Veli',
    ('sinav.yoklama', RecipientType.OGRENCI): 'Sınav yoklama — Öğrenci',
    ('sinav.karne', RecipientType.VELI): 'Sınav karnesi — Veli',
    ('sinav.karne', RecipientType.OGRENCI): 'Sınav karnesi — Öğrenci',
    ('sinav.cevap_anahtari', RecipientType.VELI): 'Sınav cevap anahtarı — Veli',
    ('sinav.cevap_anahtari', RecipientType.OGRENCI): 'Sınav cevap anahtarı — Öğrenci',
}

_CATEGORY_BY_EVENT: dict[str, str] = {
    'sinav.sonuc': TemplateCategory.DENEME_SONUCU,
    'sinav.hatirlatma': TemplateCategory.DUYURU,
    'sinav.yoklama': TemplateCategory.DEVAMSIZLIK,
    'sinav.karne': TemplateCategory.KARNE,
    'sinav.cevap_anahtari': TemplateCategory.DUYURU,
}


@dataclass(frozen=True)
class SinavTemplateDraft:
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


def list_sinav_template_drafts() -> list[SinavTemplateDraft]:
    drafts: list[SinavTemplateDraft] = []
    for event in NOTIFICATION_EVENTS:
        if event.key not in SINAV_EVENT_KEYS or event.module != MODULE_SINAV:
            continue
        for recipient in event.recipients:
            body = build_meta_example_body(event, recipient)
            header = (
                {'type': 'DOCUMENT'}
                if event.has_document
                else {'type': 'TEXT', 'text': event.label}
            )
            issues = validate_template_content(
                body_named=body, header_json=header, footer_text='',
            )
            if issues:
                raise ValueError(
                    f'{event.key}/{recipient} Meta kurallarına uymuyor: {" ".join(issues)}',
                )
            drafts.append(
                SinavTemplateDraft(
                    event_key=event.key,
                    recipient_type=recipient,
                    app_name=_APP_NAME_BY_SLOT[(event.key, recipient)],
                    meta_name=event.suggested_meta_name(recipient),
                    body_named=body,
                    category=_CATEGORY_BY_EVENT.get(event.key, TemplateCategory.DUYURU),
                    audience_scope=TemplateAudienceScope.ADMIN,
                    header_json=header,
                    footer_text='',
                    variables=event.all_variables(),
                    usage_scope=MetaTemplateUsage.SYSTEM,
                    meta_category=MetaTemplateCategory.UTILITY,
                    has_document=bool(event.has_document),
                ),
            )
    return drafts


class SinavTemplateSeedService:
    """Kuruma ölçme/sınav LMS + Meta DRAFT şablonlarını ekler ve bağlar."""

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
        drafts = list_sinav_template_drafts()
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
                meta = MetaTemplateService.find_on_shared_waba(
                    kurum_id,
                    channel_config_id=channel_config_id,
                    name=draft.meta_name,
                    language='tr',
                    prefer_approved=False,
                )
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
                    errors.append(f'binding {draft.recipient_type}: {exc.message}')

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
            'event_keys': list(SINAV_EVENT_KEYS),
            'next_steps': [
                'Karne ve cevap anahtarı şablonlarına örnek PDF yükleyip Meta onayına gönderin.',
                'Onay sonrası Ölçme → Katılımcılar / Yayın ekranlarından gönderin.',
                'Metinleri Bildirim Şablonları → Sınav satırlarından düzenleyebilirsiniz.',
            ],
        }

    @classmethod
    def describe(cls) -> list[dict[str, Any]]:
        rows = []
        for draft in list_sinav_template_drafts():
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
