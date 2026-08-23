"""
WhatsApp Meta şablon yaşam döngüsü — create/submit/sync/status.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from django.db import transaction
from django.db.models import F, QuerySet
from django.utils import timezone

from apps.communication.application.meta_template_mapper import (
    build_meta_components,
    build_variable_map,
    infer_named_body_from_meta_components,
    map_meta_status,
    numbered_to_named,
)
from apps.communication.application.meta_template_validation import (
    validate_template_content,
)
from apps.communication.domain.enums import (
    MetaTemplateCategory,
    MetaTemplateStatus,
    MetaTemplateUsage,
)
from apps.communication.domain.models import CommunicationChannelConfig, WhatsAppMetaTemplate
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
from apps.communication.infrastructure.repository import ChannelConfigRepository

logger = logging.getLogger(__name__)

_NAME_RE = re.compile(r'^[a-z0-9_]+$')
_SEMANTIC_VAR_RE = re.compile(r'\{\{[A-Za-z_][A-Za-z0-9_]*\}\}')
_NUMBERED_VAR_RE = re.compile(r'\{\{\d+\}\}')


class MetaTemplateServiceError(Exception):
    def __init__(self, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class MetaTemplateService:
    @staticmethod
    def _normalize_name(name: str) -> str:
        cleaned = (name or '').strip().lower().replace(' ', '_').replace('-', '_')
        cleaned = re.sub(r'[^a-z0-9_]', '', cleaned)
        return cleaned

    @staticmethod
    def _has_semantic_named_vars(text: str) -> bool:
        """{{ogrenci_ad}} gibi anlamlı değişken var mı? ({{1}} sayılmaz)."""
        return bool(_SEMANTIC_VAR_RE.search(text or ''))

    @staticmethod
    def _has_numbered_vars(text: str) -> bool:
        return bool(_NUMBERED_VAR_RE.search(text or ''))

    @classmethod
    def _ensure_named_body(cls, template: WhatsAppMetaTemplate) -> None:
        """
        Meta sync sonrası gövde {{1}} kalmasın.
        variable_map varsa numaralı → named; map yoksa named gövdeden map üret.
        """
        body = template.body_named or ''
        vmap = dict(template.variable_map_json or {})
        if not vmap and cls._has_semantic_named_vars(body):
            vmap = build_variable_map(body)
            template.variable_map_json = vmap
        if vmap and cls._has_numbered_vars(body):
            template.body_named = numbered_to_named(body, vmap)

    @classmethod
    def validate_name(cls, name: str) -> str:
        normalized = cls._normalize_name(name)
        if not normalized or not _NAME_RE.match(normalized):
            raise MetaTemplateServiceError(
                'Şablon adı yalnızca küçük harf, rakam ve alt çizgi içermelidir.',
            )
        if len(normalized) > 512:
            raise MetaTemplateServiceError('Şablon adı çok uzun.')
        return normalized

    @staticmethod
    def get(kurum_id: int, template_id) -> WhatsAppMetaTemplate | None:
        return (
            WhatsAppMetaTemplate.objects
            .select_related('channel_config', 'created_by')
            .filter(kurum_id=kurum_id, id=template_id)
            .first()
        )

    @staticmethod
    def _status_rank(status: str) -> int:
        order = {
            MetaTemplateStatus.APPROVED: 0,
            MetaTemplateStatus.PENDING: 1,
            MetaTemplateStatus.SUBMITTED: 2,
            MetaTemplateStatus.DRAFT: 3,
            MetaTemplateStatus.PAUSED: 4,
            MetaTemplateStatus.REJECTED: 5,
            MetaTemplateStatus.DISABLED: 6,
        }
        return order.get(status, 9)

    @classmethod
    def dedupe_by_name_language(
        cls,
        templates: list[WhatsAppMetaTemplate],
        *,
        preferred_account_id=None,
    ) -> list[WhatsAppMetaTemplate]:
        """Aynı (name, language) için tek satır — seçili hesap / onay / güncellik öncelikli."""
        preferred = str(preferred_account_id) if preferred_account_id else ''

        def score(tpl: WhatsAppMetaTemplate) -> tuple:
            exact = 0 if preferred and str(tpl.channel_config_id) == preferred else 1
            has_map = 0 if tpl.variable_map_json else 1
            ts = -(tpl.updated_at.timestamp() if tpl.updated_at else 0)
            return (exact, cls._status_rank(tpl.status), has_map, ts)

        winners: dict[tuple[str, str], WhatsAppMetaTemplate] = {}
        for tpl in templates:
            key = (tpl.name, tpl.language)
            prev = winners.get(key)
            if prev is None or score(tpl) < score(prev):
                winners[key] = tpl
        return list(winners.values())

    @staticmethod
    def shared_account_ids(kurum_id: int, channel_config_id) -> list:
        if not channel_config_id:
            return []
        from apps.communication.application.account_resolver import AccountResolver
        return AccountResolver.shared_waba_account_ids(kurum_id, channel_config_id)

    @classmethod
    def find_on_shared_waba(
        cls,
        kurum_id: int,
        *,
        channel_config_id,
        name: str | None = None,
        names: list[str] | None = None,
        language: str = 'tr',
        prefer_approved: bool = True,
    ) -> WhatsAppMetaTemplate | None:
        """Aynı WABA’daki hesaplarda name/language ile şablon bul."""
        shared = cls.shared_account_ids(kurum_id, channel_config_id)
        if not shared:
            return None
        qs = WhatsAppMetaTemplate.objects.filter(
            kurum_id=kurum_id,
            channel_config_id__in=shared,
            language=language or 'tr',
        )
        name_list = list(names or [])
        if name and name not in name_list:
            name_list.append(name)
        if name_list:
            qs = qs.filter(name__in=name_list)
        order = {n: idx for idx, n in enumerate(name_list)}
        rows = list(qs.select_related('channel_config'))
        if not rows:
            return None
        if prefer_approved:
            approved = [r for r in rows if r.status == MetaTemplateStatus.APPROVED]
            if approved:
                rows = approved
        rows.sort(
            key=lambda tpl: (
                order.get(tpl.name, len(order)),
                0 if str(tpl.channel_config_id) == str(channel_config_id) else 1,
                cls._status_rank(tpl.status),
            ),
        )
        return rows[0]

    @staticmethod
    def list_templates(
        kurum_id: int,
        *,
        channel_config_id=None,
        status: str | None = None,
        meta_category: str | None = None,
        language: str | None = None,
        search: str | None = None,
        approved_only: bool = False,
        usage: str | None = None,
        template_group: str | None = None,
        include_shared_waba: bool = True,
        dedupe: bool = True,
    ) -> QuerySet[WhatsAppMetaTemplate]:
        qs = (
            WhatsAppMetaTemplate.objects
            .select_related('channel_config', 'created_by')
            .prefetch_related('app_templates')
            .filter(kurum_id=kurum_id)
        )
        if usage:
            # ALL kapsamı her ekranda görünür
            qs = qs.filter(usage_scope__in=[usage, MetaTemplateUsage.ALL])
        if channel_config_id:
            if include_shared_waba:
                shared = MetaTemplateService.shared_account_ids(kurum_id, channel_config_id)
                qs = qs.filter(channel_config_id__in=shared or [channel_config_id])
            else:
                qs = qs.filter(channel_config_id=channel_config_id)
        if status:
            qs = qs.filter(status=status)
        if meta_category:
            qs = qs.filter(meta_category=meta_category)
        if language:
            qs = qs.filter(language=language)
        if approved_only:
            qs = qs.filter(status=MetaTemplateStatus.APPROVED)
        if search:
            qs = qs.filter(name__icontains=search.strip())
        if template_group:
            qs = qs.filter(template_group=template_group.strip())

        if dedupe and channel_config_id:
            winners = MetaTemplateService.dedupe_by_name_language(
                list(qs),
                preferred_account_id=channel_config_id,
            )
            winner_ids = [tpl.id for tpl in winners]
            return (
                WhatsAppMetaTemplate.objects
                .select_related('channel_config', 'created_by')
                .prefetch_related('app_templates')
                .filter(id__in=winner_ids)
                .order_by('-updated_at')
            )
        return qs.order_by('-updated_at')

    @classmethod
    def create_draft(
        cls,
        kurum_id: int,
        *,
        channel_config_id,
        name: str,
        language: str = 'tr',
        meta_category: str = MetaTemplateCategory.UTILITY,
        body_named: str = '',
        header_json: dict | None = None,
        footer_text: str = '',
        buttons_json: list | None = None,
        usage_scope: str = MetaTemplateUsage.ALL,
        template_group: str = '',
        user=None,
    ) -> WhatsAppMetaTemplate:
        account = ChannelConfigRepository.get_by_id(kurum_id, channel_config_id)
        if not account:
            raise MetaTemplateServiceError('WhatsApp hesabı bulunamadı.', status_code=404)

        name = cls.validate_name(name)
        language = (language or 'tr').strip() or 'tr'
        if meta_category not in MetaTemplateCategory.values:
            raise MetaTemplateServiceError('Geçersiz Meta kategori.')

        components, vmap = build_meta_components(
            body_named=body_named or '',
            header_json=header_json or {},
            footer_text=footer_text or '',
            buttons_json=buttons_json or [],
        )

        shared = cls.shared_account_ids(kurum_id, account.id)
        existing = (
            WhatsAppMetaTemplate.objects
            .filter(
                channel_config_id__in=shared or [account.id],
                name=name,
                language=language,
            )
            .select_related('channel_config')
            .first()
        )
        if existing:
            owner = existing.channel_config
            owner_label = (owner.name or owner.display_phone or 'başka hesap') if owner else 'başka hesap'
            raise MetaTemplateServiceError(
                f'Aynı WABA altında bu ad ve dilde şablon zaten var ({owner_label}). '
                'Yeni kopya oluşturmak yerine mevcut kaydı kullanın veya düzenleyin.',
            )

        return WhatsAppMetaTemplate.objects.create(
            kurum_id=kurum_id,
            channel_config=account,
            name=name,
            language=language,
            meta_category=meta_category,
            status=MetaTemplateStatus.DRAFT,
            usage_scope=usage_scope or MetaTemplateUsage.ALL,
            template_group=(template_group or '').strip()[:64],
            body_named=body_named or '',
            header_json=header_json or {},
            footer_text=(footer_text or '')[:60],
            buttons_json=buttons_json or [],
            components_json=components,
            variable_map_json=vmap,
            created_by=user,
        )

    @staticmethod
    def set_usage_scope(template: WhatsAppMetaTemplate, usage_scope: str | None) -> WhatsAppMetaTemplate:
        """Şablonun hangi ekranlarda seçilebileceği — Meta'ya gönderilmeyen yerel alan."""
        if not usage_scope or usage_scope not in MetaTemplateUsage.values:
            raise MetaTemplateServiceError('Geçersiz kullanım alanı.')
        if template.usage_scope != usage_scope:
            template.usage_scope = usage_scope
            template.save(update_fields=['usage_scope', 'updated_at'])
        return template

    @staticmethod
    def set_template_group(template: WhatsAppMetaTemplate, template_group: str | None) -> WhatsAppMetaTemplate:
        """Yerel şablon grubu — Meta'ya gönderilmez, onaylı şablonda da değişebilir."""
        next_group = (template_group or '').strip()[:64]
        if template.template_group != next_group:
            template.template_group = next_group
            template.save(update_fields=['template_group', 'updated_at'])
        return template

    @classmethod
    def update_draft(
        cls,
        template: WhatsAppMetaTemplate,
        *,
        body_named: str | None = None,
        header_json: dict | None = None,
        footer_text: str | None = None,
        buttons_json: list | None = None,
        meta_category: str | None = None,
        language: str | None = None,
        name: str | None = None,
    ) -> WhatsAppMetaTemplate:
        if template.status == MetaTemplateStatus.APPROVED:
            raise MetaTemplateServiceError(
                'Onaylı şablon düzenlenemez. Kopyalayıp yeni adla gönderin.',
            )
        if template.status in (
            MetaTemplateStatus.PENDING,
            MetaTemplateStatus.SUBMITTED,
        ):
            raise MetaTemplateServiceError(
                'İncelemedeki şablon düzenlenemez. Ret sonrası veya kopya ile devam edin.',
            )

        if name is not None:
            template.name = cls.validate_name(name)
        if language is not None:
            template.language = (language or 'tr').strip() or 'tr'
        if meta_category is not None:
            if meta_category not in MetaTemplateCategory.values:
                raise MetaTemplateServiceError('Geçersiz Meta kategori.')
            template.meta_category = meta_category
        if body_named is not None:
            template.body_named = body_named
        if header_json is not None:
            template.header_json = header_json
        if footer_text is not None:
            template.footer_text = footer_text[:60]
        if buttons_json is not None:
            template.buttons_json = buttons_json

        components, vmap = build_meta_components(
            body_named=template.body_named,
            header_json=template.header_json or {},
            footer_text=template.footer_text or '',
            buttons_json=template.buttons_json or [],
        )
        template.components_json = components
        template.variable_map_json = vmap
        template.save()
        return template

    @classmethod
    def submit(cls, template: WhatsAppMetaTemplate) -> WhatsAppMetaTemplate:
        content_errors = validate_template_content(
            body_named=template.body_named,
            header_json=template.header_json or {},
            footer_text=template.footer_text or '',
            buttons_json=template.buttons_json or [],
        )
        if content_errors:
            raise MetaTemplateServiceError(' '.join(content_errors))

        header = template.header_json or {}
        header_type = (header.get('type') or '').upper()
        if header_type in ('IMAGE', 'VIDEO', 'DOCUMENT'):
            handle = header.get('example_handle') or header.get('media_handle') or ''
            if not handle:
                raise MetaTemplateServiceError(
                    'Medya başlığı için örnek dosya yükleyin; Meta onay sürecinde örnek görsel zorunludur.',
                )

        components, vmap = build_meta_components(
            body_named=template.body_named,
            header_json=template.header_json or {},
            footer_text=template.footer_text or '',
            buttons_json=template.buttons_json or [],
        )
        template.components_json = components
        template.variable_map_json = vmap

        client = WhatsAppCloudClient(channel_config=template.channel_config)
        result = client.create_message_template(
            template.kurum_id,
            name=template.name,
            language=template.language,
            category=template.meta_category,
            components=components,
        )
        if not result.get('success'):
            raise MetaTemplateServiceError(
                result.get('error') or 'Meta şablon gönderimi başarısız.',
            )

        template.meta_template_id = str(result.get('id') or template.meta_template_id or '')
        template.status = map_meta_status(result.get('status') or MetaTemplateStatus.PENDING)
        if template.status == MetaTemplateStatus.DRAFT:
            template.status = MetaTemplateStatus.SUBMITTED
        template.last_submitted_at = timezone.now()
        template.rejected_reason = ''
        template.rejected_detail = ''
        if template.status == MetaTemplateStatus.APPROVED:
            template.approved_at = timezone.now()
        template.save()
        return template

    @classmethod
    def resubmit(cls, template: WhatsAppMetaTemplate) -> WhatsAppMetaTemplate:
        """Ret / taslak sonrası yeniden gönder. Onaylıda engellenir."""
        if template.status == MetaTemplateStatus.APPROVED:
            raise MetaTemplateServiceError(
                'Onaylı şablon yeniden gönderilemez. Kopyalayın.',
            )
        if template.status in (MetaTemplateStatus.PENDING, MetaTemplateStatus.SUBMITTED):
            raise MetaTemplateServiceError('Şablon zaten incelemede.')
        return cls.submit(template)

    @classmethod
    def refresh_status(cls, template: WhatsAppMetaTemplate) -> WhatsAppMetaTemplate:
        client = WhatsAppCloudClient(channel_config=template.channel_config)
        result = client.get_message_template(
            template.kurum_id,
            name=template.name,
            language=template.language,
        )
        if not result.get('success') or not result.get('template'):
            raise MetaTemplateServiceError(
                result.get('error') or 'Meta durumu alınamadı.',
                status_code=404,
            )
        cls._apply_meta_payload(template, result['template'], preserve_named=True)
        template.save()
        return template

    @classmethod
    def clone_as_draft(
        cls,
        template: WhatsAppMetaTemplate,
        *,
        new_name: str,
        user=None,
    ) -> WhatsAppMetaTemplate:
        return cls.create_draft(
            template.kurum_id,
            channel_config_id=template.channel_config_id,
            name=new_name,
            language=template.language,
            meta_category=template.meta_category,
            body_named=template.body_named,
            header_json=dict(template.header_json or {}),
            footer_text=template.footer_text,
            buttons_json=list(template.buttons_json or []),
            user=user,
        )

    @classmethod
    def delete_local(cls, template: WhatsAppMetaTemplate, *, delete_on_meta: bool = False) -> None:
        if delete_on_meta and template.status != MetaTemplateStatus.DRAFT:
            client = WhatsAppCloudClient(channel_config=template.channel_config)
            client.delete_message_template(
                template.kurum_id,
                name=template.name,
                hsm_id=template.meta_template_id or '',
            )
        template.delete()

    @classmethod
    def _apply_meta_payload(
        cls,
        template: WhatsAppMetaTemplate,
        payload: dict[str, Any],
        *,
        preserve_named: bool,
    ) -> None:
        template.meta_template_id = str(payload.get('id') or template.meta_template_id or '')
        status = map_meta_status(payload.get('status') or '')
        template.status = status
        category = (payload.get('category') or template.meta_category or '').upper()
        if category in MetaTemplateCategory.values:
            template.meta_category = category
        template.rejected_reason = str(payload.get('rejected_reason') or '')[:255]
        components = payload.get('components') or []
        if components:
            template.components_json = components
            body, header, footer, buttons, _ = infer_named_body_from_meta_components(components)
            # Header tipi (DOCUMENT/IMAGE/…) her sync'te güncellenir — UI filtreleri buna bakar.
            prior_body = template.body_named or ''
            keep_named = preserve_named and bool(prior_body) and (
                cls._has_semantic_named_vars(prior_body) or bool(template.variable_map_json)
            )
            if keep_named:
                if not template.buttons_json and buttons:
                    template.buttons_json = buttons
                if not template.footer_text and footer:
                    template.footer_text = footer[:60]
            else:
                vmap = dict(template.variable_map_json or {})
                if not vmap and cls._has_semantic_named_vars(prior_body):
                    vmap = build_variable_map(prior_body)
                    template.variable_map_json = vmap
                if vmap:
                    template.body_named = numbered_to_named(body, vmap)
                    if header.get('type') == 'TEXT' and header.get('text'):
                        header['text'] = numbered_to_named(header['text'], vmap)
                elif cls._has_semantic_named_vars(prior_body):
                    # Map yok ama yerel named gövde var — Meta numaralarını yazma.
                    pass
                else:
                    template.body_named = body
                template.footer_text = footer[:60]
                template.buttons_json = buttons
            if header:
                # Mevcut example_handle'ı koru (sync payload'da olmayabilir)
                prev = template.header_json or {}
                merged = dict(header)
                if prev.get('example_handle') and not merged.get('example_handle'):
                    merged['example_handle'] = prev['example_handle']
                if prev.get('media_handle') and not merged.get('media_handle'):
                    merged['media_handle'] = prev['media_handle']
                if (
                    keep_named
                    and prev.get('type') == 'TEXT'
                    and merged.get('type') == 'TEXT'
                    and prev.get('text')
                ):
                    merged['text'] = prev['text']
                template.header_json = merged
        if status == MetaTemplateStatus.APPROVED and not template.approved_at:
            template.approved_at = timezone.now()
        # Sync sonrası {{1}} kaldıysa map ile named'e çevir (bozuk kayıtları da iyileştirir)
        cls._ensure_named_body(template)

    @classmethod
    @transaction.atomic
    def sync_account(
        cls,
        account: CommunicationChannelConfig,
    ) -> dict[str, Any]:
        """
        Meta WABA şablonlarını çeker; aynı WABA’daki tüm yerel hesaplara yazar.

        Böylece ikinci numaraya ayrıca sync gerekmez ve listede eksik kalmaz.
        Yerel alanlar (usage_scope, template_group, variable_map, named body)
        kardeş kayıttan kopyalanır.
        """
        client = WhatsAppCloudClient(channel_config=account)
        result = client.list_message_templates(account.kurum_id)
        if not result.get('success'):
            return {
                'success': False,
                'error': result.get('error') or 'Senkron başarısız.',
                'upserted': 0,
                'accounts_synced': 0,
                'templates': [],
            }

        sibling_ids = cls.shared_account_ids(account.kurum_id, account.id) or [account.id]
        siblings = list(
            CommunicationChannelConfig.objects.filter(
                kurum_id=account.kurum_id,
                id__in=sibling_ids,
                channel=account.channel,
            )
        )
        if not siblings:
            siblings = [account]

        donor_by_key: dict[tuple[str, str], WhatsAppMetaTemplate] = {}
        for existing in WhatsAppMetaTemplate.objects.filter(channel_config_id__in=sibling_ids):
            key = (existing.name, existing.language)
            prev = donor_by_key.get(key)

            def _donor_score(tpl: WhatsAppMetaTemplate) -> tuple:
                return (
                    0 if cls._has_semantic_named_vars(tpl.body_named or '') else 1,
                    0 if tpl.variable_map_json else 1,
                    -(tpl.updated_at.timestamp() if tpl.updated_at else 0),
                )

            if prev is None or _donor_score(existing) < _donor_score(prev):
                donor_by_key[key] = existing

        payloads = result.get('templates') or []
        upserted = 0
        now = timezone.now()

        for sibling in siblings:
            for payload in payloads:
                name = payload.get('name') or ''
                language = payload.get('language') or 'tr'
                if not name:
                    continue
                key = (name, language)
                donor = donor_by_key.get(key)
                defaults: dict[str, Any] = {
                    'kurum_id': account.kurum_id,
                    'meta_category': (payload.get('category') or MetaTemplateCategory.UTILITY),
                    'status': map_meta_status(payload.get('status') or ''),
                }
                if donor and donor.channel_config_id != sibling.id:
                    defaults['usage_scope'] = donor.usage_scope or MetaTemplateUsage.ALL
                    defaults['template_group'] = donor.template_group or ''
                    if donor.variable_map_json:
                        defaults['variable_map_json'] = donor.variable_map_json
                    if donor.body_named:
                        defaults['body_named'] = donor.body_named

                tpl, created = WhatsAppMetaTemplate.objects.get_or_create(
                    channel_config=sibling,
                    name=name,
                    language=language,
                    defaults=defaults,
                )
                if created and donor and donor.channel_config_id != sibling.id:
                    if donor.variable_map_json and not tpl.variable_map_json:
                        tpl.variable_map_json = donor.variable_map_json
                    if donor.body_named:
                        tpl.body_named = donor.body_named
                    if donor.usage_scope:
                        tpl.usage_scope = donor.usage_scope
                    if donor.template_group:
                        tpl.template_group = donor.template_group

                preserve = (
                    cls._has_semantic_named_vars(tpl.body_named or '')
                    or bool(tpl.variable_map_json)
                    or bool(
                        donor and (
                            cls._has_semantic_named_vars(donor.body_named or '')
                            or donor.variable_map_json
                        )
                    )
                )
                cls._apply_meta_payload(tpl, payload, preserve_named=preserve)
                # Kardeş named gövdeyi numaralı kopyanın üzerine yaz
                if (
                    donor
                    and cls._has_semantic_named_vars(donor.body_named or '')
                    and (
                        not cls._has_semantic_named_vars(tpl.body_named or '')
                        or cls._has_numbered_vars(tpl.body_named or '')
                    )
                ):
                    tpl.body_named = donor.body_named
                    if donor.variable_map_json:
                        tpl.variable_map_json = donor.variable_map_json
                cls._ensure_named_body(tpl)
                tpl.save()
                upserted += 1
                cur = donor_by_key.get(key)
                if cur is None or (
                    cls._has_semantic_named_vars(tpl.body_named or '')
                    and not cls._has_semantic_named_vars(cur.body_named or '')
                ) or (tpl.variable_map_json and not cur.variable_map_json):
                    donor_by_key[key] = tpl

            sibling.last_synced_at = now
            sibling.save(update_fields=['last_synced_at', 'updated_at'])

        # Son geçiş: numbered kalanları en iyi donor ile düzelt
        for key, donor in donor_by_key.items():
            if not (
                cls._has_semantic_named_vars(donor.body_named or '')
                or donor.variable_map_json
            ):
                continue
            for sibling in siblings:
                row = WhatsAppMetaTemplate.objects.filter(
                    channel_config=sibling,
                    name=key[0],
                    language=key[1],
                ).first()
                if row is None:
                    continue
                changed = False
                if donor.variable_map_json and not row.variable_map_json:
                    row.variable_map_json = donor.variable_map_json
                    changed = True
                if cls._has_semantic_named_vars(donor.body_named or '') and (
                    not cls._has_semantic_named_vars(row.body_named or '')
                    or cls._has_numbered_vars(row.body_named or '')
                ):
                    row.body_named = donor.body_named
                    changed = True
                before = row.body_named
                cls._ensure_named_body(row)
                if row.body_named != before or changed:
                    row.save(update_fields=[
                        'body_named', 'variable_map_json', 'updated_at',
                    ])

        return {
            'success': True,
            'upserted': upserted,
            'accounts_synced': len(siblings),
            'shared_waba_account_ids': [str(s.id) for s in siblings],
            'templates': list(
                cls.list_templates(account.kurum_id, channel_config_id=account.id)
                .values('id', 'name', 'language', 'status', 'meta_category')[:200]
            ),
        }

    @classmethod
    def apply_webhook_status(
        cls,
        *,
        phone_number_id: str = '',
        waba_id: str = '',
        event: dict[str, Any],
    ) -> int:
        """message_template_status_update webhook değeri."""
        name = event.get('message_template_name') or event.get('name') or ''
        language = event.get('message_template_language') or event.get('language') or ''
        meta_status = event.get('event') or event.get('message_template_status') or event.get('status') or ''
        reason = event.get('reason') or event.get('rejected_reason') or ''

        qs = WhatsAppMetaTemplate.objects.all()
        if phone_number_id:
            account = ChannelConfigRepository.get_by_phone_number_id(phone_number_id)
            if account:
                qs = qs.filter(channel_config=account)
        elif waba_id:
            qs = qs.filter(channel_config__waba_id=waba_id)

        if name:
            qs = qs.filter(name=name)
        if language:
            qs = qs.filter(language=language)

        updated = 0
        for tpl in qs:
            mapped = map_meta_status(meta_status)
            # Webhook event alanları bazen APPROVED/REJECTED string
            if meta_status.upper() in MetaTemplateStatus.values:
                mapped = meta_status.upper()
            elif meta_status.upper() in ('APPROVED', 'REJECTED', 'PENDING', 'PAUSED', 'DISABLED'):
                mapped = meta_status.upper()
            tpl.status = mapped
            if reason:
                tpl.rejected_reason = str(reason)[:255]
                tpl.rejected_detail = str(event.get('other_info') or event.get('description') or reason)
            if mapped == MetaTemplateStatus.APPROVED:
                tpl.approved_at = timezone.now()
                tpl.rejected_reason = ''
            tpl.save(update_fields=[
                'status', 'rejected_reason', 'rejected_detail', 'approved_at', 'updated_at',
            ])
            updated += 1
        return updated

    @staticmethod
    def increment_usage(template: WhatsAppMetaTemplate) -> None:
        WhatsAppMetaTemplate.objects.filter(pk=template.pk).update(
            usage_count=F('usage_count') + 1,
        )

    @staticmethod
    def get_approved(
        kurum_id: int,
        *,
        name: str,
        language: str,
        channel_config_id=None,
    ) -> WhatsAppMetaTemplate | None:
        qs = WhatsAppMetaTemplate.objects.filter(
            kurum_id=kurum_id,
            name=name,
            language=language or 'tr',
            status=MetaTemplateStatus.APPROVED,
        )
        if channel_config_id:
            exact = qs.filter(channel_config_id=channel_config_id).select_related('channel_config').first()
            if exact:
                return exact
            from apps.communication.application.account_resolver import AccountResolver
            shared = AccountResolver.shared_waba_account_ids(kurum_id, channel_config_id)
            if shared:
                found = qs.filter(channel_config_id__in=shared).select_related('channel_config').first()
                if found:
                    return found
            return qs.select_related('channel_config').first()
        return qs.select_related('channel_config').first()

    @staticmethod
    def rebuild_components(template: WhatsAppMetaTemplate) -> WhatsAppMetaTemplate:
        components, vmap = build_meta_components(
            body_named=template.body_named,
            header_json=template.header_json or {},
            footer_text=template.footer_text or '',
            buttons_json=template.buttons_json or [],
        )
        template.components_json = components
        template.variable_map_json = vmap
        template.save(update_fields=['components_json', 'variable_map_json', 'updated_at'])
        return template

    @staticmethod
    def ensure_variable_map(template: WhatsAppMetaTemplate) -> dict[str, str]:
        if template.variable_map_json:
            return template.variable_map_json
        header_text = ''
        header = template.header_json or {}
        if (header.get('type') or '').upper() == 'TEXT':
            header_text = header.get('text') or ''
        vmap = build_variable_map(template.body_named, header_text)
        template.variable_map_json = vmap
        template.save(update_fields=['variable_map_json', 'updated_at'])
        return vmap
