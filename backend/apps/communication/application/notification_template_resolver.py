"""
Bildirim olayı → şablon çözümleme.

Kapsam en özelden en genele taranır (şube+hesap → şube → hesap → kurum).
Eşleme kaydı yoksa eski modül config'leri, ardından Meta şablon adı keşfi ve
son olarak katalogdaki varsayılan metin kullanılır.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from apps.communication.application.notification_events import (
    NotificationEvent,
    get_event,
)
from apps.communication.application.template_media_header import meta_template_header_type
from apps.communication.domain.enums import (
    Channel,
    MetaTemplateStatus,
    NotificationSendMode,
)
from apps.communication.domain.models import NotificationTemplateBinding

logger = logging.getLogger(__name__)

# Çözümlemenin hangi kuralla sonuçlandığı — UI'da gösterilir.
SOURCE_BINDING_SUBE_ACCOUNT = 'binding_sube_account'
SOURCE_BINDING_SUBE = 'binding_sube'
SOURCE_BINDING_ACCOUNT = 'binding_account'
SOURCE_BINDING_KURUM = 'binding_kurum'
SOURCE_LEGACY_CONFIG = 'legacy_config'
SOURCE_META_NAME = 'meta_name_discovery'
SOURCE_EVENT_DEFAULT = 'event_default'
SOURCE_UNKNOWN_EVENT = 'unknown_event'

SOURCE_LABELS: dict[str, str] = {
    SOURCE_BINDING_SUBE_ACCOUNT: 'Şube + hesap eşlemesi',
    SOURCE_BINDING_SUBE: 'Şube eşlemesi',
    SOURCE_BINDING_ACCOUNT: 'Hesap eşlemesi',
    SOURCE_BINDING_KURUM: 'Kurum varsayılanı',
    SOURCE_LEGACY_CONFIG: 'Eski modül ayarı',
    SOURCE_META_NAME: 'Meta şablon adından otomatik',
    SOURCE_EVENT_DEFAULT: 'Kod varsayılanı',
    SOURCE_UNKNOWN_EVENT: 'Tanımsız olay',
}


@dataclass
class ResolvedTemplate:
    event_key: str
    recipient_type: str
    send_mode: str = NotificationSendMode.AUTO
    meta_template: Any = None
    message_template: Any = None
    body: str = ''
    channel_config_id: str | None = None
    source: str = SOURCE_EVENT_DEFAULT
    binding_id: str | None = None
    body_from_template: bool = False
    warnings: list[str] = field(default_factory=list)

    @property
    def source_label(self) -> str:
        return SOURCE_LABELS.get(self.source, self.source)

    @property
    def is_disabled(self) -> bool:
        return self.send_mode == NotificationSendMode.DISABLED

    def meta_usable(
        self,
        *,
        needs_document: bool = False,
        needs_image: bool = False,
    ) -> bool:
        """Bağlı Meta şablonu bu gönderim biçimiyle uyumlu ve onaylı mı?"""
        if not self.meta_template:
            return False
        if self.meta_template.status != MetaTemplateStatus.APPROVED:
            return False
        header_type = meta_template_header_type(self.meta_template)
        if needs_document:
            return header_type == 'DOCUMENT'
        if needs_image:
            return header_type == 'IMAGE'
        # Medya başlıklı şablon ek olmadan gönderilemez
        return header_type not in ('DOCUMENT', 'IMAGE', 'VIDEO')

    def use_meta(
        self,
        *,
        needs_document: bool = False,
        needs_image: bool = False,
        session_open: bool = False,
    ) -> bool:
        """
        Bu çözümleme Meta şablonuyla mı gönderilmeli?

        AUTO modunda karar 24 saatlik pencereye bağlıdır: pencere açıkken uygulama
        şablonu serbest mesaj olarak gider, kapalıyken Meta şablonuna geçilir.
        """
        if self.is_disabled or self.send_mode == NotificationSendMode.FREEFORM_ONLY:
            return False
        if not self.meta_usable(needs_document=needs_document, needs_image=needs_image):
            return False
        if self.send_mode == NotificationSendMode.META_ONLY:
            return True
        return not session_open


def _binding_queryset(kurum_id: int, event_key: str, recipient_type: str, channel: str):
    return NotificationTemplateBinding.objects.filter(
        kurum_id=kurum_id,
        event_key=event_key,
        recipient_type=recipient_type,
        channel=channel,
        is_active=True,
    ).select_related(
        'meta_template',
        'meta_template__channel_config',
        'message_template',
        'message_template__meta_template',
    )


def _find_binding(kurum_id, event_key, recipient_type, channel, *, sube_id, channel_config_id):
    """Kapsam özgüllüğüne göre ilk eşleşen binding ve kaynağı."""
    qs = _binding_queryset(kurum_id, event_key, recipient_type, channel)
    candidates: list[tuple[dict, str]] = []
    if sube_id and channel_config_id:
        candidates.append(
            ({'sube_id': sube_id, 'channel_config_id': channel_config_id}, SOURCE_BINDING_SUBE_ACCOUNT),
        )
    if sube_id:
        candidates.append(
            ({'sube_id': sube_id, 'channel_config_id': None}, SOURCE_BINDING_SUBE),
        )
    if channel_config_id:
        candidates.append(
            ({'sube_id': None, 'channel_config_id': channel_config_id}, SOURCE_BINDING_ACCOUNT),
        )
    candidates.append(({'sube_id': None, 'channel_config_id': None}, SOURCE_BINDING_KURUM))

    for filters, source in candidates:
        binding = qs.filter(**filters).first()
        if binding:
            return binding, source
    return None, ''


def _legacy_templates(kurum_id: int, event_key: str, recipient_type: str):
    """
    Geçiş dönemi: merkezi eşleme yoksa eski modül config'lerine bak.

    Dönüş: (meta_template, message_template)
    """
    from apps.communication.application.legacy_notification_config import (
        legacy_templates_for_event,
    )

    try:
        return legacy_templates_for_event(kurum_id, event_key, recipient_type)
    except Exception:
        logger.exception(
            'Eski bildirim config okunamadı kurum=%s event=%s', kurum_id, event_key,
        )
        return None, None


def _meta_template_matches_event(event_key: str, meta_tpl) -> bool:
    """
    Plan/rapor Meta şablonlarının yanlış olaya bağlanmasını engelle.

    Örn. odev.plan → odev_raporu_* veya gövdede «kontrol raporu» → reddet.
    """
    if not meta_tpl or event_key not in ('odev.plan', 'odev.rapor'):
        return True
    name = (getattr(meta_tpl, 'name', None) or '').lower()
    body = (getattr(meta_tpl, 'body_named', None) or '').lower()
    blob = f'{name} {body}'

    if event_key == 'odev.plan':
        if any(token in name for token in ('odev_raporu', 'odev-raporu', 'haftalik_odev_raporu')):
            return False
        if 'kontrol rapor' in body and 'plan' not in body:
            return False
        return True

    # odev.rapor
    if any(token in name for token in ('odev_plani', 'odev-plani', 'haftalik_odev_plani')):
        return False
    if ('ödev planı' in body or 'odev plani' in body) and 'rapor' not in blob:
        return False
    return True


def lms_body_matches_event(event_key: str, body: str) -> bool:
    """Bağlı LMS şablon metni olayla çelişiyor mu? (plan↔rapor karışması)."""
    if not body or event_key not in ('odev.plan', 'odev.rapor'):
        return True
    text = body.lower()
    if event_key == 'odev.plan' and 'kontrol rapor' in text and 'plan' not in text:
        return False
    if event_key == 'odev.rapor' and (
        'ödev planı' in text or 'odev plani' in text
    ) and 'rapor' not in text:
        return False
    return True


def _discover_meta_by_name(
    kurum_id: int,
    event: NotificationEvent,
    recipient_type: str,
    *,
    channel_config_id=None,
):
    from apps.communication.domain.models import WhatsAppMetaTemplate

    names = event.meta_name_candidates(recipient_type)
    if not names:
        return None
    qs = WhatsAppMetaTemplate.objects.filter(
        kurum_id=kurum_id,
        status=MetaTemplateStatus.APPROVED,
        name__in=names,
    ).select_related('channel_config')
    if channel_config_id:
        from apps.communication.application.account_resolver import AccountResolver
        ids = AccountResolver.shared_waba_account_ids(kurum_id, channel_config_id)
        scoped = qs.filter(channel_config_id__in=ids or [channel_config_id])
        # Aynı WABA / başka hesap kaydındaki onaylı şablon da geçerli
        candidates = list(scoped) if scoped.exists() else list(qs)
    else:
        candidates = list(qs)
    if not candidates:
        return None
    # Katalogdaki isim sırası önceliklidir
    order = {name: idx for idx, name in enumerate(names)}
    candidates.sort(key=lambda tpl: order.get(tpl.name, len(order)))
    if event.has_document:
        for tpl in candidates:
            if meta_template_header_type(tpl) == 'DOCUMENT':
                return tpl
        return None
    if event.has_image:
        for tpl in candidates:
            if meta_template_header_type(tpl) == 'IMAGE':
                return tpl
        return None
    return candidates[0]


def _align_meta_to_account(resolved: ResolvedTemplate, kurum_id: int, channel_config_id) -> None:
    """Gönderim hattını rol numarasına sabitle; şablonu aynı WABA'da paylaş."""
    from apps.communication.application.account_resolver import AccountResolver
    from apps.communication.domain.models import WhatsAppMetaTemplate

    resolved.channel_config_id = str(channel_config_id)
    meta = resolved.meta_template
    if meta is None:
        return
    if str(meta.channel_config_id) == str(channel_config_id):
        return
    shared_ids = {
        str(item)
        for item in AccountResolver.shared_waba_account_ids(kurum_id, channel_config_id)
    }
    if str(meta.channel_config_id) in shared_ids:
        return
    twin = WhatsAppMetaTemplate.objects.filter(
        kurum_id=kurum_id,
        name=meta.name,
        status=MetaTemplateStatus.APPROVED,
        channel_config_id__in=[channel_config_id, *shared_ids],
    ).select_related('channel_config')
    if meta.language:
        lang_twin = twin.filter(language=meta.language).first()
        if lang_twin:
            resolved.meta_template = lang_twin
            return
    found = twin.first()
    if found:
        resolved.meta_template = found
        return
    # Onaylı şablonu düşürme — 24 saat kapalıyken gönderim kilitlenmesin.
    # Gönderim yine rolün numarasından (channel_config_id) yapılır.


def resolve_binding(
    kurum_id: int,
    event_key: str,
    recipient_type: str,
    *,
    sube_id: int | None = None,
    channel_config_id: str | None = None,
    channel: str = Channel.WHATSAPP,
) -> ResolvedTemplate:
    """Bir olay + alıcı rolü için kullanılacak şablonu belirle."""
    event = get_event(event_key)
    if event is None:
        return ResolvedTemplate(
            event_key=event_key,
            recipient_type=recipient_type,
            source=SOURCE_UNKNOWN_EVENT,
            warnings=[f'Tanımsız bildirim olayı: {event_key}'],
        )

    resolved = ResolvedTemplate(event_key=event_key, recipient_type=recipient_type)
    if not event.supports(recipient_type):
        resolved.warnings.append(
            f'{event.label} olayı {recipient_type} rolünü desteklemiyor.',
        )

    binding, source = _find_binding(
        kurum_id, event_key, recipient_type, channel,
        sube_id=sube_id, channel_config_id=channel_config_id,
    )
    if binding:
        resolved.binding_id = str(binding.id)
        resolved.source = source
        resolved.send_mode = binding.send_mode
        resolved.meta_template = binding.meta_template
        resolved.message_template = binding.message_template
        if binding.channel_config_id:
            resolved.channel_config_id = str(binding.channel_config_id)
    else:
        legacy_meta, legacy_msg = _legacy_templates(kurum_id, event_key, recipient_type)
        if legacy_meta or legacy_msg:
            resolved.source = SOURCE_LEGACY_CONFIG
            resolved.meta_template = legacy_meta
            resolved.message_template = legacy_msg

    if resolved.is_disabled:
        return resolved

    # Uygulama şablonuna Meta karşılığı bağlanmışsa ayrıca eşleme gerekmez
    if not resolved.meta_template and resolved.message_template is not None:
        paired = getattr(resolved.message_template, 'meta_template', None)
        if paired is not None:
            resolved.meta_template = paired

    # Plan↔rapor karışmış Meta eşlemesini düşür; doğru isimle yeniden dene
    rejected_bound_meta = False
    if resolved.meta_template and not _meta_template_matches_event(
        event_key, resolved.meta_template,
    ):
        resolved.warnings.append(
            f'Bağlı Meta şablonu ({resolved.meta_template.name}) bu olay için uygun değil; '
            'yok sayılıyor.',
        )
        resolved.meta_template = None
        rejected_bound_meta = True

    if not resolved.meta_template and resolved.send_mode != NotificationSendMode.FREEFORM_ONLY:
        discovered = _discover_meta_by_name(
            kurum_id, event, recipient_type, channel_config_id=channel_config_id,
        )
        if discovered and _meta_template_matches_event(event_key, discovered):
            resolved.meta_template = discovered
            if resolved.source == SOURCE_EVENT_DEFAULT or rejected_bound_meta:
                resolved.source = SOURCE_META_NAME

    if channel_config_id:
        _align_meta_to_account(resolved, kurum_id, channel_config_id)
    elif resolved.meta_template and not resolved.channel_config_id:
        resolved.channel_config_id = str(resolved.meta_template.channel_config_id)

    body = ''
    if resolved.message_template and resolved.message_template.is_active:
        candidate = resolved.message_template.body or ''
        if lms_body_matches_event(event_key, candidate):
            body = candidate
        else:
            resolved.warnings.append(
                'Bağlı LMS şablon metni bu olayla uyuşmuyor; varsayılan/modül metni kullanılacak.',
            )
            resolved.message_template = None
    resolved.body_from_template = bool(body)
    if not body:
        body = event.default_body(recipient_type)
    resolved.body = body

    if resolved.meta_template:
        if resolved.meta_template.status != MetaTemplateStatus.APPROVED:
            resolved.warnings.append(
                'Seçili Meta şablonu onaylı değil; serbest mesaj kullanılacak.',
            )
        elif event.has_document and meta_template_header_type(resolved.meta_template) != 'DOCUMENT':
            resolved.warnings.append(
                'Bu olay PDF gönderiyor ancak seçili Meta şablonunda DOCUMENT başlığı yok.',
            )
        elif event.has_image and meta_template_header_type(resolved.meta_template) != 'IMAGE':
            resolved.warnings.append(
                'Bu olay görsel gönderiyor ancak seçili Meta şablonunda IMAGE başlığı yok.',
            )
    elif resolved.send_mode == NotificationSendMode.META_ONLY:
        resolved.warnings.append(
            'Gönderim modu "yalnızca Meta şablonu" ancak bağlı onaylı şablon yok.',
        )

    return resolved
