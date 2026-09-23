"""
Giden kuyruk öğesi işleme.
"""
from __future__ import annotations

import logging
import time

from django.conf import settings

from apps.communication.application.campaign_service import CampaignStatsService
from apps.communication.application.meta_template_mapper import build_send_body_parameters
from apps.communication.application.meta_template_service import MetaTemplateService
from apps.communication.application.session_window import (
    is_account_error,
    is_permanent_send_error,
    is_rate_limit_error,
    is_session_error,
)
from apps.communication.application.template_component_builder import build_template_components
from apps.communication.application.template_media_header import (
    build_media_header_component,
    meta_template_header_type,
    strip_header_components,
)
from apps.communication.application.variable_resolver import build_recipient_context_from_conversation
from apps.communication.domain.enums import CampaignStatus, MessageStatus, MessageType
from apps.communication.infrastructure.channels.base import BaseChannelClient
from apps.communication.infrastructure.channels.dispatcher import ChannelDispatcher
from apps.communication.infrastructure.media_storage import (
    ensure_public_upload,
    get_public_media_url,
    materialize_local_file,
)
from apps.communication.infrastructure.repository import OutboundQueueRepository

logger = logging.getLogger(__name__)


def _safe_refresh_campaign_stats(campaign_id, *, force: bool = False) -> None:
    """İstatistik güncellemesi gönderimi bozmamalı.

    Mesaj başına tam sayım O(n²) idi (H-07); artık kısa süreli tekrar-önleme
    ile planlanır, batch sonunda dokunulan kampanyalar için kesin yenilenir.
    """
    if not campaign_id:
        return
    try:
        if force:
            CampaignStatsService.refresh_campaign_stats(campaign_id)
        else:
            CampaignStatsService.schedule_refresh(campaign_id)
    except Exception:
        logger.exception('Campaign stats refresh failed campaign=%s', campaign_id)


def _start_provider_call(item) -> None:
    """Meta çağrısı başlıyor: süreç buradan sonra düşerse gönderim belirsizdir (C-03)."""
    from django.utils import timezone

    from apps.communication.domain.models import OutboundQueueItem

    now = timezone.now()
    item.provider_call_started_at = now
    OutboundQueueItem.objects.filter(pk=item.pk).update(provider_call_started_at=now, updated_at=now)


UNCERTAIN_SEND_ERROR = (
    'Gönderim durumu belirsiz: sağlayıcı çağrısı başladıktan sonra işlem yarıda kesildi. '
    'Çift teslim riski nedeniyle otomatik yeniden denenmedi; gerekirse kuyruktan elle yeniden deneyin.'
)


def account_error_cache_key(channel_config_id) -> str:
    return f'comm:account:send_error:{channel_config_id}'


def _flag_account_error(item, error: str) -> None:
    from django.core.cache import cache
    from django.utils import timezone

    cfg = _resolve_channel_config(item)
    cfg_id = getattr(cfg, 'id', None)
    logger.error(
        'WhatsApp hesap hatası (token/hat) kurum=%s hesap=%s: %s',
        item.kurum_id, cfg_id, error[:200],
    )
    if cfg_id:
        cache.set(
            account_error_cache_key(cfg_id),
            {'error': error[:300], 'at': timezone.now().isoformat()},
            timeout=6 * 3600,
        )


def _skip_if_cancelled(item, message) -> bool:
    """Gönderimden hemen önce iptal kontrolü (C-02).

    Kampanya iptali / kuyruk iptali kilitli kaydı silmez; worker burada görür,
    kuyruk kaydını temizler ve göndermez. Mesaj CANCELLED olarak kalır.
    """
    from apps.communication.domain.models import Message, OutboundCampaign, OutboundQueueItem

    current = Message.objects.filter(pk=message.pk).values_list('status', flat=True).first()
    cancelled = current == MessageStatus.CANCELLED
    if not cancelled and item.campaign_id:
        camp = OutboundCampaign.objects.filter(pk=item.campaign_id).values_list(
            'status', 'cancel_requested_at',
        ).first()
        if camp and (camp[0] == CampaignStatus.CANCELLED or camp[1] is not None):
            cancelled = True
            Message.objects.filter(pk=message.pk).update(status=MessageStatus.CANCELLED)
            message.status = MessageStatus.CANCELLED
    if cancelled:
        OutboundQueueItem.objects.filter(pk=item.pk).delete()
        return True
    return False


def _throttle_ms() -> int:
    # settings/base.py varsayılanı 200 ms; ayar yoksa da aynı değer (docstring uyumu)
    return int(getattr(settings, 'COMMUNICATION_QUEUE_THROTTLE_MS', 200) or 0)


def _stub_send_allowed() -> bool:
    """Kimlik bilgisi yokken simüle gönderim başarılı sayılsın mı (yalnız test/dev)."""
    return bool(getattr(settings, 'COMMUNICATION_ALLOW_STUB_SEND', False))


def _build_recipient_context_from_message(message) -> dict:
    return build_recipient_context_from_conversation(message.conversation)


def _resolve_media_id(client, kurum_id: int, attachment) -> tuple[str | None, str | None]:
    """
    Meta media_id veya public link döndür.
    provider_media_id varsa kullan; yoksa upload dene, sonra public URL fallback.
    """
    if attachment.provider_media_id:
        return attachment.provider_media_id, None

    path, is_temp = materialize_local_file(attachment.file)
    mime = attachment.mime_type or 'application/octet-stream'
    media_id = None
    try:
        if path and hasattr(client, 'upload_media'):
            fname = getattr(attachment, 'original_name', '') or ''
            try:
                media_id = client.upload_media(
                    kurum_id, path, mime, file_name=fname or None,
                )
            except TypeError:
                media_id = client.upload_media(kurum_id, path, mime)
        if media_id:
            attachment.provider_media_id = media_id
            attachment.save(update_fields=['provider_media_id'])
            return media_id, None
    finally:
        if is_temp and path:
            import os
            try:
                os.unlink(path)
            except OSError:
                pass

    ensure_public_upload(attachment.file, mime_type=mime)
    link = get_public_media_url(attachment.file)
    return None, link


def _reply_context_id(message) -> str | None:
    if not message.reply_to_id:
        return None
    reply = getattr(message, 'reply_to', None)
    if reply is None and message.reply_to_id:
        from apps.communication.domain.models import Message

        reply = Message.objects.filter(id=message.reply_to_id).first()
    if reply and reply.provider_message_id:
        return reply.provider_message_id
    return None


def _send_attachment_message(client, kurum_id, phone, message, attachment) -> dict:
    context_id = _reply_context_id(message)
    media_id, link = _resolve_media_id(client, kurum_id, attachment)
    if not media_id and not link:
        return {
            'success': False,
            'error': 'Medya yüklenemedi ve public URL oluşturulamadı.',
        }

    is_image = (attachment.mime_type or '').startswith('image/')
    if is_image:
        return client.send_image(
            kurum_id,
            phone,
            media_id=media_id,
            link=link,
            caption=message.body,
            context_message_id=context_id,
        )
    return client.send_document(
        kurum_id,
        phone,
        media_id=media_id,
        link=link,
        filename=attachment.original_name or '',
        caption=message.body,
        context_message_id=context_id,
    )


def _send_options(item) -> dict:
    opts = getattr(item, 'send_options', None) or {}
    return opts if isinstance(opts, dict) else {}


def _stamp_conversation_channel(conversation, item) -> None:
    """Gönderilen hattı sohbete yaz — inbox hesabı ile eşleşsin."""
    if conversation is None or conversation.channel_config_id:
        return
    cfg = _resolve_channel_config(item)
    if cfg is None:
        return
    conversation.channel_config_id = cfg.id
    conversation.save(update_fields=['channel_config_id', 'updated_at'])


def _resolve_channel_config(item):
    message = item.message
    conversation = getattr(message, 'conversation', None)
    opts = _send_options(item)
    cfg_id = opts.get('channel_config_id') or opts.get('account_id')
    if cfg_id:
        from apps.communication.domain.models import CommunicationChannelConfig
        cfg = CommunicationChannelConfig.objects.filter(id=cfg_id).first()
        if cfg is not None:
            return cfg
    if item.campaign_id and getattr(item, 'campaign', None):
        cfg = getattr(item.campaign, 'channel_config', None)
        if cfg is not None:
            return cfg
        if item.campaign.channel_config_id:
            from apps.communication.domain.models import CommunicationChannelConfig
            return CommunicationChannelConfig.objects.filter(
                id=item.campaign.channel_config_id,
            ).first()
    if conversation is not None:
        cfg = getattr(conversation, 'channel_config', None)
        if cfg is not None:
            return cfg
        if conversation.channel_config_id:
            from apps.communication.domain.models import CommunicationChannelConfig
            return CommunicationChannelConfig.objects.filter(
                id=conversation.channel_config_id,
            ).first()
    return None


def _build_template_media_header(client, kurum_id, message, meta_tpl) -> dict | None:
    """TEMPLATE + ek varsa Meta DOCUMENT/IMAGE/VIDEO header bileşeni üret."""
    header_type = meta_template_header_type(meta_tpl) if meta_tpl else ''
    if header_type not in ('DOCUMENT', 'IMAGE', 'VIDEO'):
        return None
    attachment = message.attachments.first()
    if not attachment or not attachment.file:
        return None
    media_id, link = _resolve_media_id(client, kurum_id, attachment)
    return build_media_header_component(
        header_type=header_type,
        media_id=media_id,
        link=link,
        filename=attachment.original_name or '',
    )


def _media_header_error(client, message, meta_tpl) -> str:
    header_type = meta_template_header_type(meta_tpl) if meta_tpl else 'DOCUMENT'
    attachment = message.attachments.first() if message else None
    if not attachment or not attachment.file:
        return (
            f'Meta şablon {header_type} header bekliyor ancak PDF/medya eki yok.'
        )
    detail = (getattr(client, 'last_media_error', '') or '').strip()
    base = (
        f'Meta şablon {header_type} header bekliyor ancak PDF/medya '
        'Meta’ya yüklenemedi (media_id yok).'
    )
    if detail:
        return f'{base} {detail}'
    return (
        f'{base} WhatsApp hesabı token/phone_number_id ve sunucu dosya erişimini kontrol edin.'
    )


def _retry_as_template(client, item, message, phone, opts) -> dict | None:
    """
    Serbest mesaj 24 saat kuralına takıldıysa aynı içeriği Meta şablonuyla gönder.

    Gönderim sırasında pencerenin açık olduğunu sanıp yanılmıştık (saat kayması,
    kaçan webhook); kuyruk kaydındaki yedek şablonla tek seferlik yeniden dener.
    """
    fallback = opts.get('session_fallback') or {}
    template_name = fallback.get('template_name')
    if not template_name:
        return None

    meta_tpl = MetaTemplateService.get_approved(
        item.kurum_id,
        name=template_name,
        language=fallback.get('template_language') or 'tr',
        channel_config_id=fallback.get('channel_config_id') or None,
    )
    if meta_tpl is None:
        return None

    context = _build_recipient_context_from_message(message)
    extra_ctx = fallback.get('template_context') or {}
    if isinstance(extra_ctx, dict):
        context = {
            **context,
            **{k: str(v) if v is not None else '' for k, v in extra_ctx.items()},
        }

    components: list[dict] = []
    media_header = _build_template_media_header(client, item.kurum_id, message, meta_tpl)
    if media_header:
        components.append(media_header)
    elif meta_template_header_type(meta_tpl) in ('DOCUMENT', 'IMAGE', 'VIDEO'):
        return None

    body_params = build_send_body_parameters(
        MetaTemplateService.ensure_variable_map(meta_tpl),
        context,
        body_named=meta_tpl.body_named or '',
    )
    if body_params:
        components.append({'type': 'body', 'parameters': body_params})

    logger.info(
        '24 saat penceresi kapalı — mesaj %s şablonla yeniden deneniyor: %s',
        message.id, template_name,
    )
    result = client.send_template(
        item.kurum_id,
        phone,
        template_name=template_name,
        language_code=meta_tpl.language or fallback.get('template_language') or 'tr',
        components=components or None,
    )
    if result.get('success'):
        MetaTemplateService.increment_usage(meta_tpl)
        message.message_type = MessageType.TEMPLATE
        message.save(update_fields=['message_type', 'updated_at'])
    return result


def process_queue_item(item, client: BaseChannelClient | None = None) -> bool:
    """
    Tek kuyruk kaydını işler. Başarılıysa True döner.
    """
    if client is None:
        channel = getattr(item.message.conversation, 'channel', None)
        client = ChannelDispatcher().get_client(
            channel,
            channel_config=_resolve_channel_config(item),
        )
    message = item.message

    # Bayat kilit devralımı: önceki süreç Meta çağrısını başlatmış ama sonucu
    # yazamamışsa mesaj gitmiş olabilir → yeniden GÖNDERME, belirsiz olarak
    # işaretle (C-03, ürün kararı 8).
    if (
        item.provider_call_started_at is not None
        and message.status == MessageStatus.SENDING
        and getattr(item, 'reclaimed_from_other_worker', False)
    ):
        OutboundQueueRepository.mark_failed(item, UNCERTAIN_SEND_ERROR, permanent=True)
        _safe_refresh_campaign_stats(item.campaign_id)
        return False

    OutboundQueueRepository.lock_item(item)

    if _skip_if_cancelled(item, message):
        _safe_refresh_campaign_stats(item.campaign_id)
        return False

    if item.campaign_id and item.campaign:
        campaign = item.campaign
        if campaign.status in (CampaignStatus.QUEUED, CampaignStatus.CONFIRMED):
            campaign.status = CampaignStatus.PROCESSING
            campaign.save(update_fields=['status', 'updated_at'])

    message.status = MessageStatus.SENDING
    message.save(update_fields=['status', 'updated_at'])

    from apps.communication.application.conversation_phone_sync import (
        resolve_outbound_phone,
        sync_conversation_linked_phone,
    )
    from apps.communication.application.debug_trace import debug_trace, mask_phone

    conversation = sync_conversation_linked_phone(message.conversation)
    phone = resolve_outbound_phone(conversation)
    debug_trace(
        'C',
        'outbound_processor.py:process_queue_item',
        'queue_item_sending',
        {
            'queue_item_id': str(item.id),
            'message_id': str(message.id),
            'conversation_id': str(conversation.id),
            'phone': mask_phone(phone),
            'veli_id': conversation.veli_id,
            'ogrenci_id': conversation.ogrenci_id,
        },
    )
    try:
        filter_json = (item.campaign.recipient_filter_json or {}) if item.campaign_id else {}
        opts = _send_options(item)
        template_name = opts.get('template_name') or filter_json.get('template_name', '')
        template_language = (
            opts.get('template_language')
            or filter_json.get('template_language')
            or 'tr'
        )
        extra_components = list(filter_json.get('template_components_json') or [])
        if opts.get('template_components_json'):
            extra_components.extend(opts['template_components_json'])

        if message.message_type == MessageType.IMAGE:
            attachment = message.attachments.first()
            if attachment and attachment.file:
                _start_provider_call(item)
                result = _send_attachment_message(client, item.kurum_id, phone, message, attachment)
            else:
                result = {'success': False, 'error': 'Görsel eki bulunamadı.'}
        elif message.message_type == MessageType.DOCUMENT:
            attachment = message.attachments.first()
            if attachment and attachment.file:
                _start_provider_call(item)
                result = _send_attachment_message(client, item.kurum_id, phone, message, attachment)
            else:
                result = {'success': False, 'error': 'Belge eki bulunamadı.'}
        elif message.message_type == MessageType.TEMPLATE and template_name:
            context = _build_recipient_context_from_message(message)
            extra_ctx = (
                opts.get('template_context')
                or filter_json.get('template_context')
                or {}
            )
            if isinstance(extra_ctx, dict):
                context = {
                    **context,
                    **{k: str(v) if v is not None else '' for k, v in extra_ctx.items()},
                }
            channel_config_id = (
                opts.get('channel_config_id')
                or opts.get('account_id')
                or filter_json.get('channel_config_id')
                or filter_json.get('account_id')
            )
            meta_tpl = MetaTemplateService.get_approved(
                item.kurum_id,
                name=template_name,
                language=template_language or 'tr',
                channel_config_id=channel_config_id,
            )
            # Dil kodu birebir değilse (tr ↔ tr_TR) ada göre APPROVED şablonu bul
            if meta_tpl is None:
                from apps.communication.domain.models import WhatsAppMetaTemplate
                from apps.communication.domain.enums import MetaTemplateStatus
                qs = WhatsAppMetaTemplate.objects.filter(
                    kurum_id=item.kurum_id,
                    name=template_name,
                    status=MetaTemplateStatus.APPROVED,
                )
                if channel_config_id:
                    from apps.communication.application.account_resolver import AccountResolver
                    shared = AccountResolver.shared_waba_account_ids(
                        item.kurum_id, channel_config_id,
                    )
                    scoped = qs.filter(channel_config_id__in=shared or [channel_config_id])
                    meta_tpl = (
                        scoped.select_related('channel_config').first()
                        or qs.select_related('channel_config').first()
                    )
                else:
                    meta_tpl = qs.select_related('channel_config').first()
            if meta_tpl is None:
                # Yerelde kayıt yoksa eski davranış (legacy body_template)
                # ama yerel REJECTED/PAUSED kaydı varsa engelle
                from apps.communication.domain.models import WhatsAppMetaTemplate
                from apps.communication.domain.enums import MetaTemplateStatus
                blocked = WhatsAppMetaTemplate.objects.filter(
                    kurum_id=item.kurum_id,
                    name=template_name,
                    language=template_language or 'tr',
                ).exclude(status=MetaTemplateStatus.APPROVED).first()
                if blocked:
                    result = {
                        'success': False,
                        'error': (
                            f'Meta şablon gönderilemez — durum: {blocked.status}. '
                            'Yalnızca onaylı şablonlar kullanılabilir.'
                        ),
                    }
                    OutboundQueueRepository.mark_failed(
                        item, result['error'], permanent=True,
                    )
                    if item.campaign_id:
                        _safe_refresh_campaign_stats(item.campaign_id)
                    return False
                body_template = ''
                if item.campaign_id and item.campaign:
                    body_template = item.campaign.body_template or ''
                components = build_template_components(
                    body_template,
                    context,
                    extra_components=extra_components,
                )
            else:
                vmap = MetaTemplateService.ensure_variable_map(meta_tpl)
                body_params = build_send_body_parameters(
                    vmap,
                    context,
                    body_named=meta_tpl.body_named or '',
                )
                components = []
                media_header = _build_template_media_header(
                    client, item.kurum_id, message, meta_tpl,
                )
                if media_header:
                    components.append(media_header)
                    extra_components = strip_header_components(extra_components)
                elif meta_template_header_type(meta_tpl) in ('DOCUMENT', 'IMAGE', 'VIDEO'):
                    result = {
                        'success': False,
                        'error': _media_header_error(client, message, meta_tpl),
                    }
                    OutboundQueueRepository.mark_failed(
                        item, result['error'], permanent=True,
                    )
                    if item.campaign_id:
                        _safe_refresh_campaign_stats(item.campaign_id)
                    return False
                if body_params:
                    components.append({'type': 'body', 'parameters': body_params})
                if extra_components:
                    components.extend(extra_components)
                MetaTemplateService.increment_usage(meta_tpl)

            # Dil kodu şablondakiyle birebir olmalı (tr ≠ tr_TR → Invalid parameter)
            lang = template_language or 'tr'
            if meta_tpl is not None and meta_tpl.language:
                lang = meta_tpl.language
            _start_provider_call(item)
            result = client.send_template(
                item.kurum_id,
                phone,
                template_name=template_name,
                language_code=lang,
                components=components or None,
            )
        else:
            _start_provider_call(item)
            result = client.send_text(
                item.kurum_id,
                phone,
                message.body,
                context_message_id=_reply_context_id(message),
            )

        if not result.get('success') and is_session_error(result):
            retried = _retry_as_template(client, item, message, phone, opts)
            if retried is not None:
                result = retried

        if result.get('success') and result.get('stub') and not _stub_send_allowed():
            # Kimlik bilgisi eksik hat: mesaj gitmedi; SENT gibi görünmesin (M-11)
            result = {
                'success': False,
                'error': (
                    'WhatsApp kimlik bilgileri eksik (Phone Number ID / Access Token). '
                    'Hesap ayarlarını tamamlayın; mesaj iletilmedi.'
                ),
                'stub': True,
            }

        if result.get('success'):
            provider_id = ''
            msgs = result.get('messages', [])
            if msgs:
                provider_id = msgs[0].get('id', '')
            OutboundQueueRepository.mark_sent(item, provider_id)
            _stamp_conversation_channel(conversation, item)
            if item.campaign_id:
                _safe_refresh_campaign_stats(item.campaign_id)
            return True

        if is_rate_limit_error(result):
            # Meta 130429: deneme sayılmaz, kısa süre sonra tekrar (W-06)
            OutboundQueueRepository.defer_item(item, str(result.get('error', 'Rate limit')))
            return False

        if is_account_error(result):
            # Token süresi dolmuş / hat kayıtsız: bu hattın tüm gönderimleri düşer;
            # hesap ekranında uyarı göstermek için bayrak bırak (senaryo 17).
            _flag_account_error(item, str(result.get('error', '')))

        # Şablon yok / 24 saat vb. tekrar denemekle çözülmez; kuyruğu boşuna meşgul etme.
        OutboundQueueRepository.mark_failed(
            item,
            str(result.get('error', 'Unknown')),
            permanent=is_permanent_send_error(result) or bool(result.get('stub')),
        )
        if item.campaign_id:
            _safe_refresh_campaign_stats(item.campaign_id)
        return False
    except Exception as exc:
        logger.exception('Queue item processing failed message=%s', message.id)
        OutboundQueueRepository.mark_failed(item, str(exc))
        if item.campaign_id:
            _safe_refresh_campaign_stats(item.campaign_id)
        return False


def process_pending_batch(limit: int | None = None) -> dict[str, int]:
    """Bekleyen kuyruk kayıtlarını işler."""
    batch_size = limit or int(getattr(settings, 'COMMUNICATION_QUEUE_BATCH_SIZE', 20))
    throttle = _throttle_ms()
    dispatcher = ChannelDispatcher()
    OutboundQueueRepository.sweep_cancelled_items()
    pending = list(OutboundQueueRepository.get_pending_batch(limit=batch_size))
    sent = 0
    failed = 0
    touched_campaigns: set = set()
    for idx, item in enumerate(pending):
        if idx > 0 and throttle > 0:
            time.sleep(throttle / 1000.0)
        if item.campaign_id:
            touched_campaigns.add(item.campaign_id)
        try:
            channel = getattr(item.message.conversation, 'channel', None)
            client = dispatcher.get_client(
                channel,
                channel_config=_resolve_channel_config(item),
            )
            ok = process_queue_item(item, client)
        except Exception:
            # Tek kaydın beklenmedik hatası batch'in kalanını kilitli bırakmasın (C-02)
            logger.exception('Queue item crashed item=%s', item.id)
            try:
                OutboundQueueRepository.mark_failed(item, 'İşleme hatası (bkz. sunucu logu)')
            except Exception:
                logger.exception('mark_failed after crash failed item=%s', item.id)
            ok = False
        if ok:
            sent += 1
        else:
            failed += 1
    for campaign_id in touched_campaigns:
        _safe_refresh_campaign_stats(campaign_id, force=True)
    return {'processed': len(pending), 'sent': sent, 'failed': failed}


def _drain_seconds(explicit: float | None) -> float:
    if explicit is not None:
        return max(0.0, float(explicit))
    return max(0.0, float(getattr(settings, 'COMMUNICATION_QUEUE_DRAIN_SECONDS', 50) or 0))


def drain_pending_queue(
    *,
    max_seconds: float | None = None,
    batch_size: int | None = None,
    max_messages: int | None = None,
) -> dict[str, int]:
    """
    Kuyruk boşalana ya da süre bütçesi dolana kadar batch batch işler.

    Tek batch (varsayılan 20) toplu gönderimde yetersiz kalıyordu: 500 kişilik
    bir kampanyanın kalanı bir sonraki cron'a kalıyor, cron yoksa hiç
    gönderilmiyordu. Süre bütçesi cron aralığından kısa tutulmalı ki iki
    çalışma üst üste binmesin.
    """
    budget = _drain_seconds(max_seconds)
    deadline = time.monotonic() + budget if budget else None
    totals = {'processed': 0, 'sent': 0, 'failed': 0, 'batches': 0}

    while True:
        result = process_pending_batch(limit=batch_size)
        totals['processed'] += result['processed']
        totals['sent'] += result['sent']
        totals['failed'] += result['failed']
        totals['batches'] += 1

        if result['processed'] == 0:
            break
        if max_messages is not None and totals['processed'] >= max_messages:
            break
        if deadline is None or time.monotonic() >= deadline:
            break

    totals['pending_left'] = OutboundQueueRepository.count_pending()
    return totals
