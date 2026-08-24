"""
Özel ders yoklama Meta + uygulama şablon taslakları.

Beş olay için ayrı veli metin taslaklarını oluşturur; onaylı kayıt varsa
dokunmaz. Eski paylaşılan `ozel_ders_bilgi_veli` adına yeni taslak yazılmaz.
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
    MODULE_OZEL_DERS,
    NOTIFICATION_EVENTS,
    build_meta_example_body,
    get_event,
    template_group_for_event_key,
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

OZEL_DERS_EVENT_KEYS: tuple[str, ...] = (
    'ozel_ders.ogretmen_gelmedi',
    'ozel_ders.ogrenci_gelmedi',
    'ozel_ders.iptal',
    'ozel_ders.telafi_planlandi',
    'ozel_ders.islendi',
)

_APP_NAME_BY_SLOT: dict[tuple[str, str], str] = {
    ('ozel_ders.ogretmen_gelmedi', RecipientType.VELI): (
        'Özel Ders Bilgilendirmesi — Öğretmen Gelmedi'
    ),
    ('ozel_ders.ogrenci_gelmedi', RecipientType.VELI): (
        'Özel Ders Bilgilendirmesi — Öğrenci Gelmedi'
    ),
    ('ozel_ders.iptal', RecipientType.VELI): 'Özel Ders İptal Bilgilendirmesi',
    ('ozel_ders.telafi_planlandi', RecipientType.VELI): 'Özel Ders Telafi Bilgilendirmesi',
    ('ozel_ders.islendi', RecipientType.VELI): (
        'Özel Ders Bilgilendirmesi — Ders Gerçekleşti'
    ),
}

_HEADER_BY_EVENT: dict[str, str] = {
    'ozel_ders.ogretmen_gelmedi': 'Özel Ders Bilgilendirmesi',
    'ozel_ders.ogrenci_gelmedi': 'Özel Ders Bilgilendirmesi',
    'ozel_ders.iptal': 'Özel Ders İptal Bilgilendirmesi',
    'ozel_ders.telafi_planlandi': 'Özel Ders Telafi Bilgilendirmesi',
    'ozel_ders.islendi': 'Özel Ders Bilgilendirmesi',
}


@dataclass(frozen=True)
class OzelDersTemplateDraft:
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


def list_ozel_ders_template_drafts() -> list[OzelDersTemplateDraft]:
    drafts: list[OzelDersTemplateDraft] = []
    for event in NOTIFICATION_EVENTS:
        if event.key not in OZEL_DERS_EVENT_KEYS:
            continue
        if event.module != MODULE_OZEL_DERS:
            continue
        for recipient in event.recipients:
            body = build_meta_example_body(event, recipient)
            header = {
                'type': 'TEXT',
                'text': _HEADER_BY_EVENT[event.key],
            }
            issues = validate_template_content(
                body_named=body, header_json=header, footer_text='',
            )
            if issues:
                raise ValueError(
                    f'{event.key}/{recipient} Meta kurallarına uymuyor: {" ".join(issues)}',
                )
            drafts.append(
                OzelDersTemplateDraft(
                    event_key=event.key,
                    recipient_type=recipient,
                    app_name=_APP_NAME_BY_SLOT[(event.key, recipient)],
                    meta_name=event.suggested_meta_name(recipient),
                    body_named=body,
                    category=TemplateCategory.OZEL,
                    audience_scope=TemplateAudienceScope.ADMIN,
                    header_json=header,
                    footer_text='',
                    variables=event.all_variables(),
                    usage_scope=MetaTemplateUsage.SYSTEM,
                    meta_category=MetaTemplateCategory.UTILITY,
                ),
            )
    return drafts


def _find_active_app_template(kurum_id: int, draft: OzelDersTemplateDraft, *, sube_id):
    qs = MessageTemplate.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        audience_scope=TemplateAudienceScope.ADMIN,
    )
    active = qs.filter(name=draft.app_name, is_active=True).first()
    if active:
        return active
    return qs.filter(name=draft.app_name).first()


def _find_meta_for_draft(kurum_id, channel_config_id, draft: OzelDersTemplateDraft):
    """Yalnızca yeni benzersiz adı ara; eski ortak ozel_ders_bilgi_veli'yi yeniden kullanma."""
    return MetaTemplateService.find_on_shared_waba(
        kurum_id,
        channel_config_id=channel_config_id,
        names=[draft.meta_name],
        language='tr',
        prefer_approved=True,
    )


def repair_ozel_ders_bindings(kurum_id: int) -> dict[str, Any]:
    """Yanlış olaya bağlanmış özel ders eşlemelerini temizle."""
    from apps.communication.application.notification_template_resolver import (
        _meta_template_matches_event,
    )

    cleared = 0
    deleted = 0
    updated = 0
    rows = list(
        NotificationTemplateBinding.objects.filter(
            kurum_id=kurum_id,
            event_key__in=OZEL_DERS_EVENT_KEYS,
        ).select_related('meta_template', 'message_template')
    )
    for binding in rows:
        changed = False
        if binding.meta_template and not _meta_template_matches_event(
            binding.event_key, binding.meta_template,
        ):
            binding.meta_template = None
            changed = True
            cleared += 1
        if (
            binding.message_template
            and not binding.message_template.is_active
        ):
            active = MessageTemplate.objects.filter(
                kurum_id=kurum_id,
                sube_id=binding.sube_id or binding.message_template.sube_id,
                name=binding.message_template.name,
                is_active=True,
            ).first()
            if active:
                binding.message_template = active
                changed = True
                updated += 1
        if changed:
            if not binding.meta_template_id and not binding.message_template_id:
                binding.delete()
                deleted += 1
            else:
                binding.save()
    return {'cleared': cleared, 'updated': updated, 'deleted': deleted}


class OzelDersTemplateSeedService:
    """Kuruma özel ders LMS + Meta DRAFT şablonlarını ekler."""

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
        drafts = list_ozel_ders_template_drafts()
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
        repaired = repair_ozel_ders_bindings(kurum_id) if not dry_run else {}

        for draft in drafts:
            app_tpl = _find_active_app_template(kurum_id, draft, sube_id=sube_id)

            stale_telafi = (
                draft.event_key in (
                    'ozel_ders.ogretmen_gelmedi',
                    'ozel_ders.ogrenci_gelmedi',
                )
                and '{{telafi_notu}}' not in (getattr(app_tpl, 'body', '') or '')
            ) if app_tpl else False

            if app_tpl:
                if skip_existing and not stale_telafi:
                    skipped_app.append(draft.app_name)
                elif dry_run:
                    updated_app.append(draft.app_name)
                else:
                    app_tpl.body = draft.body_named
                    app_tpl.header_json = dict(draft.header_json)
                    app_tpl.variables_json = list(draft.variables)
                    app_tpl.is_active = True
                    app_tpl.save()
                    updated_app.append(draft.app_name)
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
                    stale_meta = (
                        meta.status == MetaTemplateStatus.DRAFT
                        and draft.event_key in (
                            'ozel_ders.ogretmen_gelmedi',
                            'ozel_ders.ogrenci_gelmedi',
                        )
                        and '{{telafi_notu}}' not in (meta.body_named or '')
                    )
                    if (
                        meta.status == MetaTemplateStatus.DRAFT
                        and (
                            meta.body_named != draft.body_named
                            or (meta.header_json or {}) != draft.header_json
                        )
                        and (not skip_existing or stale_meta)
                    ):
                        if dry_run:
                            updated_meta.append(draft.meta_name)
                        else:
                            try:
                                MetaTemplateService.update_draft(
                                    meta,
                                    body_named=draft.body_named,
                                    header_json=dict(draft.header_json),
                                    footer_text='',
                                )
                                updated_meta.append(draft.meta_name)
                            except MetaTemplateServiceError as exc:
                                errors.append(f'{draft.meta_name}: {exc.message}')
                    else:
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
                        and existing.meta_template.name == draft.meta_name
                    )
                    new_is_draft = (
                        meta is None or meta.status != MetaTemplateStatus.APPROVED
                    )
                    if existing_ok and new_is_draft:
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
            'updated_app': updated_app,
            'skipped_app': skipped_app,
            'created_meta': created_meta,
            'updated_meta': updated_meta,
            'skipped_meta': skipped_meta,
            'bound': bound,
            'repaired': repaired,
            'errors': errors,
            'event_keys': list(OZEL_DERS_EVENT_KEYS),
            'next_steps': [
                'Meta Şablonlar’da ozel_ders_ogretmen_gelmedi_veli, '
                'ozel_ders_ogrenci_gelmedi_veli, ozel_ders_iptal_veli, '
                'ozel_ders_telafi_veli, ozel_ders_islendi_veli taslaklarını '
                'onay için gönderin (onaylı olanlara dokunulmaz).',
                'Bildirim Şablonları → Özel Ders altında bağları kontrol edin.',
            ],
        }

    @classmethod
    def describe(cls) -> list[dict[str, Any]]:
        rows = []
        for draft in list_ozel_ders_template_drafts():
            event = get_event(draft.event_key)
            rows.append({
                'event_key': draft.event_key,
                'event_label': event.label if event else draft.event_key,
                'recipient_type': draft.recipient_type,
                'app_name': draft.app_name,
                'meta_name': draft.meta_name,
                'category': draft.category,
                'audience_scope': draft.audience_scope,
                'header_text': (draft.header_json or {}).get('text') or '',
                'body_named': draft.body_named,
                'variables': list(draft.variables),
            })
        return rows
