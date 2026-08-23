"""
Toplu gönderim Meta şablon taslakları (CAMPAIGN).

Aileler: duyuru · hatirlatma · bilgilendirme
Her aile × (veli | öğrenci | personel) × (metin | görsel | pdf) = 27 taslak.

Meta onayında örnek medya yeterli; her kampanyada farklı {{mesaj}} / ek kullanılır.
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
from apps.communication.domain.enums import (
    MetaTemplateCategory,
    MetaTemplateStatus,
    MetaTemplateUsage,
)
from apps.communication.domain.models import WhatsAppMetaTemplate

# (prefix, header_title, topic_label)
_FAMILIES: tuple[tuple[str, str, str], ...] = (
    ('duyuru', 'Duyuru', 'duyurusu'),
    ('hatirlatma', 'Hatırlatma', 'hatırlatması'),
    ('bilgilendirme', 'Bilgilendirme', 'bilgilendirmesi'),
)

_MEDIA: tuple[tuple[str, dict[str, Any], bool], ...] = (
    ('metin', {'type': 'TEXT', 'text': ''}, False),
    ('gorsel', {'type': 'IMAGE'}, False),
    ('pdf', {'type': 'DOCUMENT'}, True),
)

_AUDIENCES: tuple[tuple[str, str], ...] = (
    ('veli', ''),
    ('ogrenci', '_ogrenci'),
    ('personel', '_personel'),
)


@dataclass(frozen=True)
class CampaignDuyuruDraft:
    meta_name: str
    body_named: str
    header_json: dict[str, Any]
    label: str
    audience: str  # 'veli' | 'ogrenci' | 'personel'
    family: str  # 'duyuru' | 'hatirlatma' | 'bilgilendirme'


def _body(*, audience: str, topic: str, with_attachment: bool) -> str:
    if audience == 'veli':
        greet = 'Sayın {{veli_ad}},'
    elif audience == 'personel':
        greet = 'Merhaba {{personel_ad}},'
    else:
        greet = 'Merhaba {{ogrenci_ad}},'
    if with_attachment:
        mid = f'{{{{sube}}}} {topic} ektedir.\n\n{{{{mesaj}}}}'
    else:
        mid = f'{{{{sube}}}} {topic}:\n\n{{{{mesaj}}}}'
    return f'{greet}\n\n{mid}\n\nBilginize sunarız.'


def _audience_label(audience: str) -> str:
    return {
        'veli': 'Veli',
        'ogrenci': 'Öğrenci',
        'personel': 'Personel',
    }.get(audience, audience)


def list_campaign_duyuru_drafts() -> list[CampaignDuyuruDraft]:
    """Tüm kampanya ailelerini (duyuru/hatırlatma/bilgilendirme × kitle × medya) döner."""
    drafts: list[CampaignDuyuruDraft] = []
    for prefix, header_title, topic in _FAMILIES:
        for media_key, header_base, with_att in _MEDIA:
            header = dict(header_base)
            if header.get('type') == 'TEXT':
                header['text'] = header_title
            for audience, suffix in _AUDIENCES:
                name = f'{prefix}_{media_key}{suffix}'
                drafts.append(
                    CampaignDuyuruDraft(
                        meta_name=name,
                        body_named=_body(
                            audience=audience,
                            topic=topic,
                            with_attachment=with_att,
                        ),
                        header_json=header,
                        label=(
                            f'{header_title} — '
                            f'{_audience_label(audience)} — '
                            f'{media_key}'
                        ),
                        audience=audience,
                        family=prefix,
                    ),
                )

    for draft in drafts:
        issues = validate_template_content(
            body_named=draft.body_named,
            header_json=draft.header_json,
            footer_text='',
        )
        if issues:
            raise ValueError(
                f'{draft.meta_name} Meta kurallarına uymuyor: {" ".join(issues)}',
            )
    return drafts


class CampaignDuyuruTemplateSeedService:
    """Seçili WhatsApp hesabına kampanya Meta DRAFT şablonlarını ekler."""

    @classmethod
    def describe(cls) -> list[dict[str, Any]]:
        rows = []
        for draft in list_campaign_duyuru_drafts():
            rows.append({
                'meta_name': draft.meta_name,
                'label': draft.label,
                'audience': draft.audience,
                'family': draft.family,
                'header_type': (draft.header_json.get('type') or '').upper(),
                'usage_scope': MetaTemplateUsage.CAMPAIGN,
                'meta_category': MetaTemplateCategory.UTILITY,
                'body_named': draft.body_named,
            })
        return rows

    @classmethod
    @transaction.atomic
    def seed(
        cls,
        kurum_id: int,
        *,
        channel_config_id,
        user=None,
        dry_run: bool = False,
        skip_existing: bool = True,
    ) -> dict[str, Any]:
        if not channel_config_id:
            raise ValueError('channel_config_id zorunludur.')

        drafts = list_campaign_duyuru_drafts()
        created: list[str] = []
        updated: list[str] = []
        skipped: list[str] = []
        errors: list[str] = []

        for draft in drafts:
            existing = MetaTemplateService.find_on_shared_waba(
                kurum_id,
                channel_config_id=channel_config_id,
                name=draft.meta_name,
                language='tr',
                prefer_approved=False,
            )
            if existing:
                if (
                    existing.status == MetaTemplateStatus.DRAFT
                    and existing.body_named != draft.body_named
                ):
                    if dry_run:
                        updated.append(draft.meta_name)
                        continue
                    try:
                        MetaTemplateService.update_draft(
                            existing,
                            body_named=draft.body_named,
                            header_json=dict(draft.header_json),
                            footer_text='',
                        )
                        updated.append(draft.meta_name)
                    except MetaTemplateServiceError as exc:
                        errors.append(f'{draft.meta_name}: {exc.message}')
                    continue
                if skip_existing:
                    skipped.append(draft.meta_name)
                    continue
            if dry_run:
                created.append(draft.meta_name)
                continue
            try:
                MetaTemplateService.create_draft(
                    kurum_id,
                    channel_config_id=channel_config_id,
                    name=draft.meta_name,
                    language='tr',
                    meta_category=MetaTemplateCategory.UTILITY,
                    body_named=draft.body_named,
                    header_json=dict(draft.header_json),
                    footer_text='',
                    usage_scope=MetaTemplateUsage.CAMPAIGN,
                    template_group='duyuru',
                    user=user,
                )
                created.append(draft.meta_name)
            except MetaTemplateServiceError as exc:
                errors.append(f'{draft.meta_name}: {exc.message}')

        return {
            'kurum_id': kurum_id,
            'channel_config_id': str(channel_config_id),
            'dry_run': dry_run,
            'drafts': len(drafts),
            'created_meta': created,
            'updated_meta': updated,
            'skipped_meta': skipped,
            'errors': errors,
            'next_steps': [
                'IMAGE/DOCUMENT şablonlar için örnek medya yükleyip Meta’ya gönderin.',
                'Onay sonrası Toplu Gönder’de duyuru_*, hatirlatma_*, bilgilendirme_* '
                '(+ _ogrenci / _personel) seçilir.',
                'Her gönderimde {{mesaj}} ve ek (görsel/PDF) dinamik verilir.',
            ],
        }
