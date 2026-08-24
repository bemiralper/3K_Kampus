"""
Sınıf yoklama Meta + uygulama şablon taslakları.

`sinif.yoklama.gelmedi` / `sinif.yoklama.gec` için veli ve öğrenci metin
taslaklarını oluşturur; onaylı Meta kayıt varsa dokunmaz.
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
    MODULE_YOKLAMA,
    NOTIFICATION_EVENTS,
    build_meta_example_body,
    get_event,
    template_group_for_event_key,
)
from apps.communication.application.notification_template_resolver import (
    _meta_template_matches_event,
)
from apps.communication.application.template_category_service import TemplateCategoryService
from apps.communication.domain.enums import (
    Channel,
    MetaTemplateCategory,
    MetaTemplateStatus,
    MetaTemplateUsage,
    RecipientType,
    TemplateAudienceScope,
    TemplateCategory,
)
from apps.communication.domain.models import (
    MessageTemplate,
    NotificationTemplateBinding,
)

SINIF_YOKLAMA_EVENT_KEYS: tuple[str, ...] = (
    'sinif.yoklama.gelmedi',
    'sinif.yoklama.gec',
)

_APP_NAME_BY_SLOT: dict[tuple[str, str], str] = {
    ('sinif.yoklama.gelmedi', RecipientType.VELI): 'Sınıf yoklama — Gelmedi (Veli)',
    ('sinif.yoklama.gelmedi', RecipientType.OGRENCI): 'Sınıf yoklama — Gelmedi (Öğrenci)',
    ('sinif.yoklama.gec', RecipientType.VELI): 'Sınıf yoklama — Geç Kalma (Veli)',
    ('sinif.yoklama.gec', RecipientType.OGRENCI): 'Sınıf yoklama — Geç Kalma (Öğrenci)',
}

_CATEGORY_BY_EVENT: dict[str, str] = {
    'sinif.yoklama.gelmedi': TemplateCategory.YOKLAMA_GELMEDI,
    'sinif.yoklama.gec': TemplateCategory.YOKLAMA_GEC,
}

_HEADER_BY_EVENT: dict[str, str] = {
    'sinif.yoklama.gelmedi': 'Sınıf Yoklama Bilgilendirmesi',
    'sinif.yoklama.gec': 'Sınıf Yoklama Bilgilendirmesi',
}


@dataclass(frozen=True)
class SinifYoklamaTemplateDraft:
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


def list_sinif_yoklama_template_drafts() -> list[SinifYoklamaTemplateDraft]:
    drafts: list[SinifYoklamaTemplateDraft] = []
    for event in NOTIFICATION_EVENTS:
        if event.key not in SINIF_YOKLAMA_EVENT_KEYS:
            continue
        if event.module != MODULE_YOKLAMA or event.group != 'sinif':
            continue
        for recipient in event.recipients:
            body = build_meta_example_body(event, recipient)
            header = {'type': 'TEXT', 'text': _HEADER_BY_EVENT[event.key]}
            issues = validate_template_content(
                body_named=body, header_json=header, footer_text='',
            )
            if issues:
                raise ValueError(
                    f'{event.key}/{recipient} Meta kurallarına uymuyor: {" ".join(issues)}',
                )
            drafts.append(
                SinifYoklamaTemplateDraft(
                    event_key=event.key,
                    recipient_type=recipient,
                    app_name=_APP_NAME_BY_SLOT[(event.key, recipient)],
                    meta_name=event.suggested_meta_name(recipient),
                    body_named=body,
                    category=_CATEGORY_BY_EVENT[event.key],
                    audience_scope=TemplateAudienceScope.COACH,
                    header_json=header,
                    footer_text='',
                    variables=event.all_variables(),
                    usage_scope=MetaTemplateUsage.SYSTEM,
                    meta_category=MetaTemplateCategory.UTILITY,
                ),
            )
    return drafts


def _find_active_app_template(kurum_id: int, draft: SinifYoklamaTemplateDraft, *, sube_id):
    qs = MessageTemplate.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        audience_scope=TemplateAudienceScope.COACH,
    )
    active = qs.filter(name=draft.app_name, is_active=True).first()
    if active:
        return active
    return qs.filter(name=draft.app_name).first()


def _find_meta_for_draft(kurum_id, channel_config_id, draft: SinifYoklamaTemplateDraft):
    event = get_event(draft.event_key)
    names = [draft.meta_name]
    if event:
        names.extend(event.meta_name_candidates(draft.recipient_type))
    return MetaTemplateService.find_on_shared_waba(
        kurum_id,
        channel_config_id=channel_config_id,
        names=list(dict.fromkeys(names)),
        language='tr',
        prefer_approved=True,
    )


def repair_sinif_yoklama_bindings(kurum_id: int) -> dict[str, Any]:
    from apps.communication.domain.enums import MetaTemplateStatus
    from apps.communication.domain.models import WhatsAppMetaTemplate

    cleared = 0
    deleted = 0
    retargeted = 0
    rows = list(
        NotificationTemplateBinding.objects.filter(
            kurum_id=kurum_id,
            event_key__in=SINIF_YOKLAMA_EVENT_KEYS,
        ).select_related('meta_template', 'message_template')
    )
    named_gelmedi = (
        WhatsAppMetaTemplate.objects.filter(
            kurum_id=kurum_id,
            name='gunluk_ders_yoklama_veli',
            status=MetaTemplateStatus.APPROVED,
        )
        .exclude(body_named__contains='{{1}}')
        .first()
    )
    for binding in rows:
        meta = binding.meta_template
        if (
            binding.send_mode == 'META_ONLY'
            and not meta
            and not binding.message_template_id
        ):
            binding.delete()
            deleted += 1
            continue
        if meta and not _meta_template_matches_event(binding.event_key, meta):
            if binding.message_template_id:
                binding.meta_template = None
                binding.save(update_fields=['meta_template', 'updated_at'])
                cleared += 1
            else:
                binding.delete()
                deleted += 1
            continue
        if (
            binding.event_key == 'sinif.yoklama.gelmedi'
            and named_gelmedi
            and meta
            and (
                meta.name == 'gunluk_ders_yoklama_veli_gelmedi'
                or '{{1}}' in (meta.body_named or '')
            )
        ):
            binding.meta_template = named_gelmedi
            binding.send_mode = 'AUTO'
            binding.save(update_fields=['meta_template', 'send_mode', 'updated_at'])
            retargeted += 1
    return {'cleared': cleared, 'deleted': deleted, 'retargeted': retargeted}


class SinifYoklamaTemplateSeedService:
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
        drafts = list_sinif_yoklama_template_drafts()
        if sube_id is not None:
            TemplateCategoryService.ensure_defaults(kurum_id, sube_id)

        created_app: list[str] = []
        skipped_app: list[str] = []
        created_meta: list[str] = []
        skipped_meta: list[str] = []
        bound: list[str] = []
        errors: list[str] = []
        repaired = repair_sinif_yoklama_bindings(kurum_id) if not dry_run else {}

        for draft in drafts:
            app_tpl = _find_active_app_template(kurum_id, draft, sube_id=sube_id)
            if app_tpl:
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
                    header_json=dict(draft.header_json),
                    footer_text='',
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
                meta = _find_meta_for_draft(kurum_id, channel_config_id, draft)
                if meta:
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
                            header_json=dict(draft.header_json),
                            footer_text='',
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
                existing = NotificationTemplateBinding.objects.filter(
                    kurum_id=kurum_id,
                    event_key=draft.event_key,
                    recipient_type=draft.recipient_type,
                    channel=Channel.WHATSAPP,
                    sube_id=sube_id,
                    channel_config_id=channel_config_id,
                ).select_related('meta_template').first()
                skip_bind = False
                if existing and skip_existing:
                    existing_ok = (
                        existing.meta_template
                        and existing.meta_template.status == MetaTemplateStatus.APPROVED
                    )
                    if existing_ok:
                        skip_bind = True
                if skip_bind:
                    skipped_meta.append(f'bind:{draft.meta_name}')
                else:
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
            'skipped_app': skipped_app,
            'created_meta': created_meta,
            'skipped_meta': skipped_meta,
            'bound': bound,
            'repaired': repaired,
            'errors': errors,
            'event_keys': list(SINIF_YOKLAMA_EVENT_KEYS),
            'next_steps': [
                'Meta Şablonlar’da sinif_yoklama_gelmedi_veli / _ogrenci ve '
                'sinif_yoklama_gec_veli / _ogrenci taslaklarını onay için gönderin '
                '(onaylı olanlara dokunulmaz). {{saat}} geç gelme saatidir.',
                'Bildirim Şablonları → Yoklama — Sınıf altında bağları kontrol edin.',
            ],
        }

    @classmethod
    def describe(cls) -> list[dict[str, Any]]:
        rows = []
        for draft in list_sinif_yoklama_template_drafts():
            event = get_event(draft.event_key)
            rows.append({
                'event_key': draft.event_key,
                'event_label': event.label if event else draft.event_key,
                'recipient_type': draft.recipient_type,
                'app_name': draft.app_name,
                'meta_name': draft.meta_name,
                'header_text': (draft.header_json or {}).get('text') or '',
                'body_named': draft.body_named,
                'variables': list(draft.variables),
            })
        return rows
