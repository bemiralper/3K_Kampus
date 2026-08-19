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

        if WhatsAppMetaTemplate.objects.filter(
            channel_config=account, name=name, language=language,
        ).exists():
            raise MetaTemplateServiceError(
                'Bu hesapta aynı ad ve dilde şablon zaten var.',
            )

        return WhatsAppMetaTemplate.objects.create(
            kurum_id=kurum_id,
            channel_config=account,
            name=name,
            language=language,
            meta_category=meta_category,
            status=MetaTemplateStatus.DRAFT,
            usage_scope=usage_scope or MetaTemplateUsage.ALL,
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
            # Named gövde korunurken yalnızca header/footer/buttons yapısal alanlar yazılır.
            if not preserve_named or not template.body_named:
                if template.variable_map_json:
                    template.body_named = numbered_to_named(body, template.variable_map_json)
                    if header.get('type') == 'TEXT' and header.get('text'):
                        header['text'] = numbered_to_named(
                            header['text'], template.variable_map_json,
                        )
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
                    preserve_named
                    and template.body_named
                    and prev.get('type') == 'TEXT'
                    and merged.get('type') == 'TEXT'
                    and prev.get('text')
                ):
                    merged['text'] = prev['text']
                template.header_json = merged
        if status == MetaTemplateStatus.APPROVED and not template.approved_at:
            template.approved_at = timezone.now()

    @classmethod
    @transaction.atomic
    def sync_account(
        cls,
        account: CommunicationChannelConfig,
    ) -> dict[str, Any]:
        client = WhatsAppCloudClient(channel_config=account)
        result = client.list_message_templates(account.kurum_id)
        if not result.get('success'):
            return {
                'success': False,
                'error': result.get('error') or 'Senkron başarısız.',
                'upserted': 0,
                'templates': [],
            }

        upserted = 0
        for payload in result.get('templates') or []:
            name = payload.get('name') or ''
            language = payload.get('language') or 'tr'
            if not name:
                continue
            tpl, created = WhatsAppMetaTemplate.objects.get_or_create(
                channel_config=account,
                name=name,
                language=language,
                defaults={
                    'kurum_id': account.kurum_id,
                    'meta_category': (payload.get('category') or MetaTemplateCategory.UTILITY),
                    'status': map_meta_status(payload.get('status') or ''),
                },
            )
            preserve = bool(tpl.variable_map_json) and not created
            cls._apply_meta_payload(tpl, payload, preserve_named=preserve)
            # Sync ile gelenlerde body hâlâ {{1}} olabilir — map yoksa numaralı kalsın
            if created and tpl.body_named and not tpl.variable_map_json:
                # Otomatik map yok; kullanıcı bağlayacak. components zaten set.
                pass
            tpl.save()
            upserted += 1

        account.last_synced_at = timezone.now()
        account.save(update_fields=['last_synced_at', 'updated_at'])
        return {
            'success': True,
            'upserted': upserted,
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
