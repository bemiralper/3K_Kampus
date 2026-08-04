"""
Meta ↔ uygulama şablon eşlemesi.

24s pencere açıkken uygulama şablonu (serbest mesaj), kapalıyken Meta şablonu
kullanılır. İki tarafın metni aynı tutulmalıdır.
"""
from __future__ import annotations

import re
import unicodedata

from django.core.exceptions import ValidationError

from apps.communication.application.meta_template_mapper import extract_named_variables_in_order
from apps.communication.application.meta_template_service import (
    MetaTemplateService,
    MetaTemplateServiceError,
)
from apps.communication.application.meta_template_validation import validate_template_content
from apps.communication.application.template_service import TemplateService
from apps.communication.domain.enums import (
    MetaTemplateCategory,
    MetaTemplateUsage,
    TemplateAudienceScope,
    TemplateCategory,
)
from apps.communication.domain.models import MessageTemplate, WhatsAppMetaTemplate

PAIRING_INFO = (
    '24 saatlik görüşme penceresi açıkken uygulama şablonu serbest mesaj olarak, '
    'kapalıyken eşleşen Meta şablonu kullanılır. İki şablonun metni aynı tutulmalıdır.'
)

_TR_MAP = str.maketrans({
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'I': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u',
})


def slugify_meta_name(value: str) -> str:
    """Görünen addan Meta şablon adı üret (küçük harf_altçizgi)."""
    text = (value or '').translate(_TR_MAP)
    text = unicodedata.normalize('NFKD', text)
    text = ''.join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace(' ', '_').replace('-', '_')
    text = re.sub(r'[^a-z0-9_]+', '', text)
    text = re.sub(r'_+', '_', text).strip('_')
    return text[:512]


def humanize_meta_name(name: str) -> str:
    """Meta adını uygulama şablon adı için okunur hale getir."""
    cleaned = (name or '').replace('_', ' ').strip()
    return cleaned[:200] if cleaned else 'Meta şablonu'


class TemplatePairingService:
    """Çift yönlü şablon oluşturma / bağlama."""

    @staticmethod
    def create_app_from_meta(
        meta: WhatsAppMetaTemplate,
        *,
        sube_id: int | None,
        user,
        category: str | None = None,
        audience_scope: str | None = None,
        display_name: str | None = None,
    ) -> MessageTemplate:
        """Meta şablonundan aynı metinli uygulama şablonu oluştur ve bağla."""
        if MessageTemplate.objects.filter(meta_template_id=meta.id).exists():
            raise ValidationError('Bu Meta şablonuna zaten bağlı bir uygulama şablonu var.')

        body = (meta.body_named or '').strip()
        if not body:
            raise ValidationError('Uygulama şablonu için Meta gövde metni boş olamaz.')

        name = (display_name or '').strip() or humanize_meta_name(meta.name)
        variables = extract_named_variables_in_order(body)
        # Uygulama şablonunda yalnızca metin başlığı tutulur
        header = meta.header_json or {}
        if (header.get('type') or '').upper() != 'TEXT':
            header = {}
        return TemplateService().create(
            meta.kurum_id,
            sube_id=sube_id,
            user=user,
            name=name,
            body=body,
            header_json=header,
            footer_text=meta.footer_text or '',
            category=category or TemplateCategory.OZEL,
            audience_scope=audience_scope or TemplateAudienceScope.GENEL,
            variables_json=variables,
            meta_template_id=meta.id,
        )

    @staticmethod
    def create_meta_from_app(
        template: MessageTemplate,
        *,
        channel_config_id,
        user,
        meta_name: str | None = None,
        language: str = 'tr',
        meta_category: str = MetaTemplateCategory.UTILITY,
        usage_scope: str = MetaTemplateUsage.ALL,
        header_json: dict | None = None,
        footer_text: str | None = None,
    ) -> WhatsAppMetaTemplate:
        """Uygulama şablonundan Meta taslağı oluştur ve bağla."""
        if template.meta_template_id:
            raise ValidationError('Bu uygulama şablonunun zaten bir Meta karşılığı var.')

        body = (template.body or '').strip()
        if not body:
            raise ValidationError('Meta şablonu için uygulama gövde metni boş olamaz.')

        resolved_header = (
            header_json if header_json is not None else (template.header_json or {})
        )
        resolved_footer = (
            footer_text if footer_text is not None else (template.footer_text or '')
        )

        issues = validate_template_content(
            body_named=body,
            header_json=resolved_header or {},
            footer_text=resolved_footer or '',
        )
        if issues:
            raise ValidationError('Meta kuralları: ' + ' '.join(issues))

        name = meta_name or slugify_meta_name(template.name)
        try:
            meta = MetaTemplateService.create_draft(
                template.kurum_id,
                channel_config_id=channel_config_id,
                name=name,
                language=language or 'tr',
                meta_category=meta_category or MetaTemplateCategory.UTILITY,
                body_named=body,
                header_json=resolved_header or {},
                footer_text=resolved_footer or '',
                usage_scope=usage_scope or MetaTemplateUsage.ALL,
                user=user,
            )
        except MetaTemplateServiceError as exc:
            raise ValidationError(exc.message) from exc

        template.meta_template = meta
        template.save(update_fields=['meta_template', 'updated_at'])
        return meta

    @classmethod
    def import_unpaired_meta_templates(
        cls,
        kurum_id: int,
        *,
        sube_id: int | None,
        user,
        channel_config_id=None,
        category: str | None = None,
        audience_scope: str | None = None,
    ) -> dict:
        """Henüz uygulama karşılığı olmayan Meta şablonlarını toplu aktar."""
        paired_ids = MessageTemplate.objects.filter(
            kurum_id=kurum_id,
            meta_template_id__isnull=False,
        ).values_list('meta_template_id', flat=True)
        qs = WhatsAppMetaTemplate.objects.filter(kurum_id=kurum_id).exclude(id__in=paired_ids)
        if channel_config_id:
            qs = qs.filter(channel_config_id=channel_config_id)

        created: list[MessageTemplate] = []
        skipped: list[dict] = []
        for meta in qs.order_by('name', 'language'):
            if not (meta.body_named or '').strip():
                skipped.append({
                    'meta_template_id': str(meta.id),
                    'name': meta.name,
                    'reason': 'Gövde metni boş',
                })
                continue
            try:
                app = cls.create_app_from_meta(
                    meta,
                    sube_id=sube_id,
                    user=user,
                    category=category,
                    audience_scope=audience_scope,
                )
                created.append(app)
            except ValidationError as exc:
                skipped.append({
                    'meta_template_id': str(meta.id),
                    'name': meta.name,
                    'reason': str(exc),
                })

        return {
            'created_count': len(created),
            'skipped_count': len(skipped),
            'created': [
                {'id': str(t.id), 'name': t.name, 'meta_template_id': str(t.meta_template_id)}
                for t in created
            ],
            'skipped': skipped,
            'info': PAIRING_INFO,
        }
