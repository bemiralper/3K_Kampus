"""
Toplu gönderim şablon kataloğu.

Kullanım alanı CAMPAIGN olan şablonlar kitleye göre seçilir:
veli / ogrenci / personel yalnızca o kitlede; genel her kitlede.
Medya türü Meta header'dan gelir.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from apps.communication.domain.enums import (
    CampaignAudience,
    CampaignMedia,
    MetaTemplateUsage,
)
from apps.communication.application.template_media_header import meta_template_header_type


@dataclass(frozen=True)
class CampaignTemplateClass:
    eligible: bool
    audience: str
    media: str
    audience_label: str
    media_label: str


def infer_campaign_audience(name: str) -> str:
    n = (name or '').lower()
    if 'ogretmen' in n or 'öğretmen' in n or '_personel' in n or n.startswith('personel'):
        return CampaignAudience.PERSONEL
    if 'ogrenci' in n or 'öğrenci' in n:
        return CampaignAudience.OGRENCI
    if 'veli' in n:
        return CampaignAudience.VELI
    if n.startswith(('duyuru_', 'hatirlatma_', 'bilgilendirme_')) or n == 'toplu_duyuru':
        return CampaignAudience.VELI
    return CampaignAudience.GENEL


def infer_campaign_media(header_json: dict | None = None, header_type: str = '') -> str:
    htype = (header_type or '').upper()
    if not htype:
        header = header_json if isinstance(header_json, dict) else {}
        htype = (header.get('type') or '').upper()
    if htype == 'IMAGE':
        return CampaignMedia.GORSEL
    if htype == 'VIDEO':
        return CampaignMedia.VIDEO
    if htype == 'DOCUMENT':
        return CampaignMedia.PDF
    return CampaignMedia.METIN


def is_campaign_eligible(*, usage_scope: str, **_unused: Any) -> bool:
    return (usage_scope or '').upper() == MetaTemplateUsage.CAMPAIGN


def needed_campaign_audience(person_types: list[str] | tuple[str, ...] | None) -> str:
    """Tek tür → o kitle; birden fazla → genel; boş → filtresiz."""
    unique = [item for item in dict.fromkeys(person_types or []) if item]
    if not unique:
        return ''
    if len(unique) > 1:
        return CampaignAudience.GENEL
    return unique[0]


def audience_matches(template_audience: str, needed: str) -> bool:
    """Genel şablon her kitlede görünür; özel kitle yalnızca kendi seçiminde."""
    if not needed:
        return True
    audience = (template_audience or '').strip() or CampaignAudience.GENEL
    if audience == CampaignAudience.GENEL:
        return True
    return audience == needed


def classify_campaign_template(
    *,
    name: str,
    usage_scope: str = MetaTemplateUsage.ALL,
    header_json: dict | None = None,
    campaign_audience: str = '',
    campaign_family: str = '',
    template_group: str = '',
    header_type: str = '',
) -> CampaignTemplateClass:
    del campaign_family, template_group
    audience = (campaign_audience or '').strip() or infer_campaign_audience(name)
    media = infer_campaign_media(header_json, header_type)
    return CampaignTemplateClass(
        eligible=is_campaign_eligible(usage_scope=usage_scope),
        audience=audience or CampaignAudience.GENEL,
        media=media,
        audience_label=dict(CampaignAudience.choices).get(audience, audience or 'Genel'),
        media_label=dict(CampaignMedia.choices).get(media, media),
    )


def classify_meta_template(tpl: Any) -> CampaignTemplateClass:
    return classify_campaign_template(
        name=getattr(tpl, 'name', '') or '',
        usage_scope=getattr(tpl, 'usage_scope', '') or '',
        header_json=getattr(tpl, 'header_json', None) or {},
        campaign_audience=getattr(tpl, 'campaign_audience', '') or '',
        header_type=meta_template_header_type(tpl),
    )
