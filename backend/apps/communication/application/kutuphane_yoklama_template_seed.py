"""
Kütüphane yoklama Meta + uygulama şablon taslakları.

`yoklama.gelmedi` / `yoklama.gec` / `yoklama.cikis` için veli (ve öğrenci)
metin taslaklarını oluşturur; onaylı kayıt varsa dokunmaz.
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
    WhatsAppMetaTemplate,
)

KUTUPHANE_YOKLAMA_EVENT_KEYS: tuple[str, ...] = (
    'yoklama.gelmedi',
    'yoklama.gec',
    'yoklama.cikis',
)

_APP_NAME_BY_SLOT: dict[tuple[str, str], str] = {
    ('yoklama.gelmedi', RecipientType.VELI): 'Yoklama — Gelmedi (Varsayılan)',
    ('yoklama.gelmedi', RecipientType.OGRENCI): 'Kütüphane yoklama — Gelmedi (Öğrenci)',
    ('yoklama.gec', RecipientType.VELI): 'Yoklama — Geç Kalma (Varsayılan)',
    ('yoklama.gec', RecipientType.OGRENCI): 'Kütüphane yoklama — Geç Kalma (Öğrenci)',
    ('yoklama.cikis', RecipientType.VELI): 'Yoklama — Çıkış (Varsayılan)',
}

_CATEGORY_BY_EVENT: dict[str, str] = {
    'yoklama.gelmedi': TemplateCategory.YOKLAMA_GELMEDI,
    'yoklama.gec': TemplateCategory.YOKLAMA_GEC,
    'yoklama.cikis': TemplateCategory.YOKLAMA_CIKIS,
}


@dataclass(frozen=True)
class KutuphaneYoklamaTemplateDraft:
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


def list_kutuphane_yoklama_template_drafts() -> list[KutuphaneYoklamaTemplateDraft]:
    drafts: list[KutuphaneYoklamaTemplateDraft] = []
    for event in NOTIFICATION_EVENTS:
        if event.key not in KUTUPHANE_YOKLAMA_EVENT_KEYS:
            continue
        if event.module != MODULE_YOKLAMA or event.group != 'kutuphane':
            continue
        for recipient in event.recipients:
            body = build_meta_example_body(event, recipient)
            issues = validate_template_content(body_named=body, header_json={}, footer_text='')
            if issues:
                raise ValueError(
                    f'{event.key}/{recipient} Meta kurallarına uymuyor: {" ".join(issues)}',
                )
            drafts.append(
                KutuphaneYoklamaTemplateDraft(
                    event_key=event.key,
                    recipient_type=recipient,
                    app_name=_APP_NAME_BY_SLOT[(event.key, recipient)],
                    meta_name=event.suggested_meta_name(recipient),
                    body_named=body,
                    category=_CATEGORY_BY_EVENT[event.key],
                    audience_scope=TemplateAudienceScope.COACH,
                    header_json={},
                    footer_text='',
                    variables=event.all_variables(),
                    usage_scope=MetaTemplateUsage.SYSTEM,
                    meta_category=MetaTemplateCategory.UTILITY,
                ),
            )
    return drafts


def _find_active_app_template(kurum_id: int, draft: KutuphaneYoklamaTemplateDraft, *, sube_id):
    """Aktif LMS şablonunu tercih et; pasif varsayılan kopyayı bağlama."""
    qs = MessageTemplate.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        audience_scope=TemplateAudienceScope.COACH,
    )
    active = qs.filter(name=draft.app_name, is_active=True).first()
    if active:
        return active
    by_category = qs.filter(category=draft.category, is_active=True).order_by('created_at').first()
    if by_category:
        return by_category
    return qs.filter(name=draft.app_name).first()


def _find_meta_for_draft(channel_config_id, draft: KutuphaneYoklamaTemplateDraft):
    """Onaylı aday (legacy isimler dahil) varsa onu kullan; yoksa taslak ada bak."""
    event = get_event(draft.event_key)
    names = list(event.meta_name_candidates(draft.recipient_type)) if event else [draft.meta_name]
    if draft.meta_name not in names:
        names.append(draft.meta_name)
    qs = WhatsAppMetaTemplate.objects.filter(
        channel_config_id=channel_config_id,
        language='tr',
        name__in=names,
    )
    order = {name: idx for idx, name in enumerate(names)}
    approved = list(qs.filter(status=MetaTemplateStatus.APPROVED))
    if approved:
        approved.sort(key=lambda tpl: order.get(tpl.name, len(order)))
        return approved[0]
    existing = list(qs)
    if existing:
        existing.sort(key=lambda tpl: order.get(tpl.name, len(order)))
        return existing[0]
    return None


def repair_kutuphane_yoklama_bindings(kurum_id: int) -> dict[str, Any]:
    """Yanlış olaya bağlanmış veya taslağın onaylıyı ezdiği yoklama eşlemelerini düzelt."""
    cleared = 0
    deleted = 0
    updated = 0
    rows = list(
        NotificationTemplateBinding.objects.filter(
            kurum_id=kurum_id,
            event_key__in=KUTUPHANE_YOKLAMA_EVENT_KEYS,
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
            binding.meta_template
            and binding.meta_template.status != MetaTemplateStatus.APPROVED
            and binding.channel_config_id
        ):
            event = get_event(binding.event_key)
            if event:
                approved = WhatsAppMetaTemplate.objects.filter(
                    channel_config_id=binding.channel_config_id,
                    language='tr',
                    status=MetaTemplateStatus.APPROVED,
                    name__in=event.meta_name_candidates(binding.recipient_type),
                ).first()
                if approved:
                    binding.meta_template = approved
                    changed = True
                    updated += 1
        if (
            binding.message_template
            and not binding.message_template.is_active
            and binding.message_template.category
        ):
            active = MessageTemplate.objects.filter(
                kurum_id=kurum_id,
                sube_id=binding.sube_id or binding.message_template.sube_id,
                category=binding.message_template.category,
                is_active=True,
            ).order_by('created_at').first()
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


class KutuphaneYoklamaTemplateSeedService:
    """Kuruma kütüphane yoklama LMS + Meta DRAFT şablonlarını ekler."""

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
        drafts = list_kutuphane_yoklama_template_drafts()
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
        repaired = repair_kutuphane_yoklama_bindings(kurum_id) if not dry_run else {}

        for draft in drafts:
            app_tpl = _find_active_app_template(kurum_id, draft, sube_id=sube_id)

            if app_tpl:
                if skip_existing:
                    skipped_app.append(draft.app_name)
                elif dry_run:
                    updated_app.append(draft.app_name)
                else:
                    app_tpl.body = draft.body_named
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
                    header_json={},
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
                meta = _find_meta_for_draft(channel_config_id, draft)
                if meta:
                    if (
                        meta.status == MetaTemplateStatus.DRAFT
                        and meta.body_named != draft.body_named
                        and not skip_existing
                    ):
                        if dry_run:
                            updated_meta.append(draft.meta_name)
                        else:
                            try:
                                MetaTemplateService.update_draft(
                                    meta,
                                    body_named=draft.body_named,
                                    header_json={},
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
                            header_json={},
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
                        and _meta_template_matches_event(draft.event_key, existing.meta_template)
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
            'event_keys': list(KUTUPHANE_YOKLAMA_EVENT_KEYS),
            'next_steps': [
                'Meta Şablonlar’da yoklama_gelmedi_veli / yoklama_gec_veli / '
                'yoklama_cikis_veli taslaklarını onay için gönderin (onaylı olanlara dokunulmaz).',
                'Bildirim Şablonları → Yoklama → Kütüphane altında bağları kontrol edin.',
            ],
        }

    @classmethod
    def describe(cls) -> list[dict[str, Any]]:
        rows = []
        for draft in list_kutuphane_yoklama_template_drafts():
            event = get_event(draft.event_key)
            rows.append({
                'event_key': draft.event_key,
                'event_label': event.label if event else draft.event_key,
                'recipient_type': draft.recipient_type,
                'app_name': draft.app_name,
                'meta_name': draft.meta_name,
                'category': draft.category,
                'audience_scope': draft.audience_scope,
                'body_named': draft.body_named,
                'variables': list(draft.variables),
            })
        return rows
