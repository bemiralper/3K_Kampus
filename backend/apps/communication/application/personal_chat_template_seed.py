"""
Personel–veli/öğrenci sohbet açılış Meta şablonları (PERSONAL).

24s pencere kapalıyken / ilk temasta kullanılır. QUICK_REPLY ile cevap alınabilir.
Bildirim Şablonları bağlama yapılmaz — sohbet kataloğu account + usage=PERSONAL ile dolar.
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
    CommunicationDepartment,
    MetaTemplateCategory,
    MetaTemplateStatus,
    MetaTemplateUsage,
)
from apps.communication.domain.models import WhatsAppMetaTemplate
from apps.communication.infrastructure.repository import ChannelConfigRepository

QUICK_REPLY_BUTTONS: list[dict[str, str]] = [
    {'type': 'QUICK_REPLY', 'text': 'Uygunum'},
    {'type': 'QUICK_REPLY', 'text': 'Daha sonra'},
    {'type': 'QUICK_REPLY', 'text': 'Arayın'},
]

# (meta_name, audience, family, body_named)
_ALL_DRAFTS: tuple[tuple[str, str, str, str], ...] = (
    (
        'sohbet_muhasebe_veli',
        'veli',
        'muhasebe',
        'Sayın {{veli_ad}}, ben {{sube}} muhasebe biriminden {{personel_ad}}. '
        'Müsait misiniz? Sizinle kısa bir görüşmek isterim.',
    ),
    (
        'sohbet_muhasebe_ogrenci',
        'ogrenci',
        'muhasebe',
        'Merhaba {{ogrenci_ad}}, ben {{sube}} muhasebe biriminden {{personel_ad}}. '
        'Müsait misin? Kısa bir görüşmek isterim.',
    ),
    (
        'sohbet_kocluk_veli',
        'veli',
        'kocluk',
        'Sayın {{veli_ad}}, ben {{ogrenci_ad}} öğrencimizin koçu {{personel_ad}}. '
        'Müsait misiniz? Sizinle kısa bir görüşmek isterim.',
    ),
    (
        'sohbet_kocluk_ogrenci',
        'ogrenci',
        'kocluk',
        'Merhaba {{ogrenci_ad}}, ben koçun {{personel_ad}}. '
        'Müsait misin? Kısa bir görüşmek isterim.',
    ),
    (
        'sohbet_yonetim_veli',
        'veli',
        'yonetim',
        'Sayın {{veli_ad}}, ben {{sube}} yönetiminden {{personel_ad}}. '
        'Müsait misiniz? Sizinle kısa bir görüşmek isterim.',
    ),
    (
        'sohbet_yonetim_ogrenci',
        'ogrenci',
        'yonetim',
        'Merhaba {{ogrenci_ad}}, ben {{sube}} yönetiminden {{personel_ad}}. '
        'Müsait misin? Kısa bir görüşmek isterim.',
    ),
    (
        'sohbet_genel_veli',
        'veli',
        'genel',
        'Sayın {{veli_ad}}, ben {{sube}} biriminden {{personel_ad}}. '
        'Müsait misiniz? Sizinle kısa bir görüşmek isterim.',
    ),
    (
        'sohbet_genel_ogrenci',
        'ogrenci',
        'genel',
        'Merhaba {{ogrenci_ad}}, ben {{sube}} biriminden {{personel_ad}}. '
        'Müsait misin? Kısa bir görüşmek isterim.',
    ),
)

_FAMILIES_BY_DEPARTMENT: dict[str, frozenset[str]] = {
    CommunicationDepartment.ACCOUNTING: frozenset({'muhasebe', 'genel'}),
    CommunicationDepartment.COACHING: frozenset({'kocluk', 'genel'}),
    CommunicationDepartment.MANAGEMENT: frozenset({'yonetim', 'genel'}),
}

_PRIMARY_FAMILY_BY_DEPARTMENT: dict[str, str] = {
    CommunicationDepartment.ACCOUNTING: 'muhasebe',
    CommunicationDepartment.COACHING: 'kocluk',
    CommunicationDepartment.MANAGEMENT: 'yonetim',
}


def personal_chat_families_for_department(department: str | None) -> frozenset[str]:
    """Birimin sohbet şablon aileleri. Aynı WABA'da olsa bile diğer rolün ailesi yok."""
    return _FAMILIES_BY_DEPARTMENT.get(
        (department or '').upper(),
        frozenset({'genel'}),
    )


def personal_chat_family_from_name(name: str) -> str | None:
    """sohbet_kocluk_veli → kocluk. Eşleşmezse None."""
    parts = (name or '').strip().lower().split('_')
    if len(parts) < 3 or parts[0] != 'sohbet':
        return None
    return parts[1]


def preferred_personal_chat_template_name(
    department: str | None,
    audience: str | None,
) -> str | None:
    """
    Birim + alıcı için tercih edilen sohbet şablon adı.
    Örn. COACHING + veli → sohbet_kocluk_veli
    """
    aud = (audience or '').strip().lower()
    if aud not in ('veli', 'ogrenci'):
        return None
    family = _PRIMARY_FAMILY_BY_DEPARTMENT.get(
        (department or '').upper(),
        'genel',
    )
    return f'sohbet_{family}_{aud}'


@dataclass(frozen=True)
class PersonalChatTemplateDraft:
    meta_name: str
    audience: str  # veli | ogrenci
    family: str
    body_named: str
    buttons_json: list[dict[str, str]]
    header_json: dict[str, Any]


def list_personal_chat_template_drafts(
    *,
    department: str | None = None,
) -> list[PersonalChatTemplateDraft]:
    families = _FAMILIES_BY_DEPARTMENT.get(
        (department or '').upper(),
        frozenset({'genel'}),
    )
    drafts: list[PersonalChatTemplateDraft] = []
    for name, audience, family, body in _ALL_DRAFTS:
        if family not in families:
            continue
        issues = validate_template_content(
            body_named=body,
            header_json={},
            footer_text='',
            buttons_json=QUICK_REPLY_BUTTONS,
        )
        if issues:
            raise ValueError(f'{name} Meta kurallarına uymuyor: {" ".join(issues)}')
        drafts.append(
            PersonalChatTemplateDraft(
                meta_name=name,
                audience=audience,
                family=family,
                body_named=body,
                buttons_json=list(QUICK_REPLY_BUTTONS),
                header_json={},
            ),
        )
    return drafts


class PersonalChatTemplateSeedService:
    """Seçili WhatsApp hesabına birime uygun PERSONAL sohbet DRAFT şablonlarını ekler."""

    @classmethod
    def describe(cls, department: str | None = None) -> list[dict[str, Any]]:
        return [
            {
                'meta_name': d.meta_name,
                'audience': d.audience,
                'family': d.family,
                'body_named': d.body_named,
                'usage_scope': MetaTemplateUsage.PERSONAL,
                'meta_category': MetaTemplateCategory.UTILITY,
                'buttons': [b.get('text') for b in d.buttons_json],
            }
            for d in list_personal_chat_template_drafts(department=department)
        ]

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

        account = ChannelConfigRepository.get_by_id(kurum_id, channel_config_id)
        if not account:
            raise ValueError('WhatsApp hesabı bulunamadı.')

        department = getattr(account, 'department', None) or ''
        drafts = list_personal_chat_template_drafts(department=department)

        created: list[str] = []
        updated: list[str] = []
        skipped: list[str] = []
        errors: list[str] = []

        for draft in drafts:
            existing = MetaTemplateService.find_on_shared_waba(
                kurum_id,
                channel_config_id=account.id,
                name=draft.meta_name,
                language='tr',
                prefer_approved=False,
            )
            if existing:
                stale = (
                    existing.status == MetaTemplateStatus.DRAFT
                    and (
                        existing.body_named != draft.body_named
                        or (existing.buttons_json or []) != draft.buttons_json
                        or existing.usage_scope != MetaTemplateUsage.PERSONAL
                    )
                )
                if stale:
                    if dry_run:
                        updated.append(draft.meta_name)
                        continue
                    try:
                        MetaTemplateService.update_draft(
                            existing,
                            body_named=draft.body_named,
                            header_json=dict(draft.header_json),
                            footer_text='',
                            buttons_json=list(draft.buttons_json),
                        )
                        MetaTemplateService.set_usage_scope(
                            existing, MetaTemplateUsage.PERSONAL,
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
                    channel_config_id=account.id,
                    name=draft.meta_name,
                    language='tr',
                    meta_category=MetaTemplateCategory.UTILITY,
                    body_named=draft.body_named,
                    header_json=dict(draft.header_json),
                    footer_text='',
                    buttons_json=list(draft.buttons_json),
                    usage_scope=MetaTemplateUsage.PERSONAL,
                    user=user,
                )
                created.append(draft.meta_name)
            except MetaTemplateServiceError as exc:
                errors.append(f'{draft.meta_name}: {exc.message}')

        return {
            'kurum_id': kurum_id,
            'channel_config_id': str(account.id),
            'department': department,
            'dry_run': dry_run,
            'drafts': len(drafts),
            'created_meta': created,
            'updated_meta': updated,
            'skipped_meta': skipped,
            'errors': errors,
            'next_steps': [
                'Sohbet şablonlarını Meta’ya gönderip onaylatın.',
                'Öğrenci/veli detayından WhatsApp ile deneyin (pencere kapalıyken liste dolu olmalı).',
                'process_communication_queue cron’unun çalıştığından emin olun.',
            ],
        }
