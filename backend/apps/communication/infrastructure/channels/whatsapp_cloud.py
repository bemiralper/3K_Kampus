"""
WhatsApp Business Cloud API client.
"""
from __future__ import annotations

import hashlib
import logging
import mimetypes
import os
from typing import Any

import httpx
from django.conf import settings
from django.core.cache import cache

from apps.communication.application.token_crypto import decrypt_access_token
from apps.communication.domain.enums import Channel
from apps.communication.infrastructure.channels.base import BaseChannelClient
from apps.communication.infrastructure.repository import ChannelConfigRepository

logger = logging.getLogger(__name__)

GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'
REQUEST_TIMEOUT = 30.0
UPLOAD_TIMEOUT = 120.0
APP_ID_CACHE_TTL = 60 * 60 * 24


def phone_digits(value: str) -> str:
    return ''.join(ch for ch in (value or '') if ch.isdigit())


def phone_tail(value: str, length: int = 10) -> str:
    digits = phone_digits(value)
    return digits[-length:] if len(digits) >= length else digits


def looks_like_msisdn(value: str) -> bool:
    """Meta Phone Number ID değil, görünen telefon numarası gibi mi?"""
    raw = (value or '').strip()
    if not raw:
        return False
    if raw.startswith('+') or raw.startswith('00'):
        return True
    digits = phone_digits(raw)
    if digits.startswith('90') and 10 <= len(digits) <= 13:
        return True
    if digits.startswith('0') and 10 <= len(digits) <= 11:
        return True
    return False

META_ERROR_HINTS = {
    100: (
        'Geçersiz parametre — şablon değişken sayısı/adı, dil kodu (tr/tr_TR), '
        'başlıkta yeni satır/emoji/yıldız, DOCUMENT header medyası veya boş body '
        'değerini kontrol edin.'
    ),
    130429: 'Meta rate limit — gönderimi yavaşlatın.',
    132012: 'Şablon bileşen formatı uyuşmuyor — DOCUMENT header bekleniyorsa PDF ekleyin.',
    132015: 'Şablon duraklatıldı — Meta Business Manager\'dan kontrol edin.',
    131026: 'Mesaj teslim edilemedi — alıcı numarası geçersiz olabilir.',
    131047: '24 saatlik oturum dışı — onaylı şablon kullanın.',
    133010: (
        'Bu Phone Number ID Meta Cloud API’de kayıtlı değil. '
        'Görünen telefon numarasını değil, WhatsApp Manager → Telefon numaraları '
        'içindeki Phone number ID değerini yazın. Numara yeni eklendiyse önce '
        'Meta’da Cloud API kaydını tamamlayın.'
    ),
}

# Meta'nın İngilizce detay metinleri → uygulanabilir Türkçe açıklama.
# Kod bazlı ipucundan (META_ERROR_HINTS) önce gelir.
META_MESSAGE_HINTS = (
    (
        "variables can't be at the start or end",
        'Mesaj metni değişkenle başlayamaz veya bitemez. Başına/sonuna sabit metin '
        'ekleyin — örn. "Sayın {{veli_ad}}, …" veya "… bilgilerinize sunulur.".',
    ),
    (
        'variables are not allowed next to each other',
        'İki değişken yan yana olamaz; aralarına açıklayıcı metin ekleyin.',
    ),
    (
        'template name already exists',
        'Bu ad ve dilde şablon Meta tarafında zaten var. Farklı bir ad kullanın veya '
        'Meta\'dan güncelleyin.',
    ),
    (
        'invalid parameter format',
        'Şablon değişken sayısı/sırası gönderilen parametrelerle uyuşmuyor.',
    ),
    (
        'newlines, formatting characters, emojis or asterisks',
        'Başlık metninde yeni satır, emoji, yıldız (*) veya biçimlendirme '
        '(*kalın* _italik_) kullanılamaz. Düz tek satır yazın.',
    ),
    (
        'yeni satırlar, biçimlendirme karakterleri, ifade simgeleri veya yıldız',
        'Başlık metninde yeni satır, emoji, yıldız (*) veya biçimlendirme '
        'karakterleri kullanılamaz. Düz tek satır yazın.',
    ),
    (
        'formatting characters, emojis or asterisks',
        'Başlık metninde yeni satır, emoji, yıldız (*) veya biçimlendirme '
        'karakterleri kullanılamaz. Düz tek satır yazın.',
    ),
    (
        'account not registered',
        'Phone Number ID Cloud API’de kayıtlı değil — görünen numara değil, '
        'Meta’daki Phone number ID kullanılmalı.',
    ),
    (
        'does not exist in the cloud api',
        'Phone Number ID Cloud API’de yok. WhatsApp Manager’dan doğru ID’yi kopyalayın '
        'veya numarayı Cloud API’ye kaydedin.',
    ),
)


class WhatsAppCloudClient(BaseChannelClient):
    channel = Channel.WHATSAPP

    def __init__(self, channel_config=None):
        self.channel_config = channel_config
        self.last_media_error = ''
        self._phone_number_id_override = ''

    def with_config(self, channel_config) -> 'WhatsAppCloudClient':
        """Hesap bazlı client kopyası (paylaşılan dispatcher için)."""
        return WhatsAppCloudClient(channel_config=channel_config)

    def _resolve_config(self, kurum_id: int, channel_config=None) -> dict[str, str]:
        db_config = channel_config or self.channel_config
        if db_config is None:
            db_config = ChannelConfigRepository.get_whatsapp_config(kurum_id)
        raw_token = (
            (db_config.access_token_encrypted if db_config else '')
            or settings.WHATSAPP_ACCESS_TOKEN
        )
        access_token = decrypt_access_token(raw_token)
        if not access_token and db_config is not None:
            from apps.communication.application.account_resolver import AccountResolver
            access_token = AccountResolver.sibling_access_token(db_config)
        return {
            'phone_number_id': (
                self._phone_number_id_override
                or (db_config.phone_number_id if db_config else '')
                or settings.WHATSAPP_PHONE_NUMBER_ID
            ),
            'waba_id': (
                (db_config.waba_id if db_config else '')
                or settings.WHATSAPP_WABA_ID
            ),
            'access_token': access_token,
            'verify_token': (
                (db_config.webhook_verify_token if db_config else '')
                or settings.WHATSAPP_VERIFY_TOKEN
            ),
        }

    @staticmethod
    def _format_api_error(data: dict[str, Any], fallback: str) -> str:
        error = data.get('error', {})
        code = error.get('code')
        message = error.get('message', fallback) or fallback
        details = ''
        error_data = error.get('error_data') or {}
        if isinstance(error_data, dict):
            details = (error_data.get('details') or '').strip()
        if not details:
            details = (error.get('error_user_msg') or error.get('error_subcode') or '')
            if details is not None:
                details = str(details).strip()
        haystack = f'{message} {details}'.lower()
        hint = next(
            (text for needle, text in META_MESSAGE_HINTS if needle in haystack),
            None,
        ) or META_ERROR_HINTS.get(code)
        parts = [f'{message} (#{code})' if code else message]
        if details:
            parts.append(str(details))
        if hint:
            parts.append(hint)
        return ' — '.join(parts)

    def _post_message(self, kurum_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        config = self._resolve_config(kurum_id)
        phone_number_id = config['phone_number_id']
        access_token = config['access_token']

        if not phone_number_id or not access_token:
            logger.info(
                'WhatsApp stub send — kurum=%s (credentials missing)',
                kurum_id,
            )
            to = payload.get('to', '')
            return {
                'success': True,
                'stub': True,
                'messages': [{'id': f'stub_{kurum_id}_{to}'}],
            }

        url = f'{GRAPH_API_BASE}/{phone_number_id}/messages'
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
        }

        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.post(url, json=payload, headers=headers)
                data = response.json()
                if response.is_success:
                    return {'success': True, **data}
                error_msg = self._format_api_error(data, response.text)
                logger.warning(
                    'WhatsApp API error kurum=%s status=%s error=%s',
                    kurum_id,
                    response.status_code,
                    error_msg,
                )
                return {
                    'success': False,
                    'error': error_msg,
                    'status_code': response.status_code,
                    'error_code': data.get('error', {}).get('code'),
                }
        except httpx.HTTPError as exc:
            logger.exception('WhatsApp HTTP error kurum=%s', kurum_id)
            return {'success': False, 'error': str(exc)}

    def _apply_context(self, payload: dict[str, Any], context_message_id: str | None) -> dict[str, Any]:
        if context_message_id:
            payload['context'] = {'message_id': context_message_id}
        return payload

    def send_text(
        self,
        kurum_id: int,
        to_e164: str,
        text: str,
        *,
        context_message_id: str | None = None,
    ) -> dict[str, Any]:
        to = to_e164.lstrip('+')
        payload = {
            'messaging_product': 'whatsapp',
            'recipient_type': 'individual',
            'to': to,
            'type': 'text',
            'text': {'preview_url': True, 'body': text},
        }
        return self._post_message(kurum_id, self._apply_context(payload, context_message_id))

    def send_template(
        self,
        kurum_id: int,
        to_e164: str,
        *,
        template_name: str,
        language_code: str = 'tr',
        components: list | None = None,
    ) -> dict[str, Any]:
        to = to_e164.lstrip('+')
        template_payload: dict[str, Any] = {
            'name': template_name,
            'language': {'code': language_code},
        }
        if components:
            template_payload['components'] = components

        payload = {
            'messaging_product': 'whatsapp',
            'recipient_type': 'individual',
            'to': to,
            'type': 'template',
            'template': template_payload,
        }
        return self._post_message(kurum_id, payload)

    def send_image(
        self,
        kurum_id: int,
        to_e164: str,
        *,
        media_id: str | None = None,
        link: str | None = None,
        caption: str = '',
        context_message_id: str | None = None,
    ) -> dict[str, Any]:
        to = to_e164.lstrip('+')
        image_payload: dict[str, str] = {}
        if media_id:
            image_payload['id'] = media_id
        elif link:
            image_payload['link'] = link
        else:
            return {'success': False, 'error': 'media_id veya link gerekli'}

        if caption:
            image_payload['caption'] = caption

        payload = {
            'messaging_product': 'whatsapp',
            'to': to,
            'type': 'image',
            'image': image_payload,
        }
        return self._post_message(kurum_id, self._apply_context(payload, context_message_id))

    def send_document(
        self,
        kurum_id: int,
        to_e164: str,
        *,
        media_id: str | None = None,
        link: str | None = None,
        filename: str = '',
        caption: str = '',
        context_message_id: str | None = None,
    ) -> dict[str, Any]:
        to = to_e164.lstrip('+')
        doc_payload: dict[str, str] = {}
        if media_id:
            doc_payload['id'] = media_id
        elif link:
            doc_payload['link'] = link
        else:
            return {'success': False, 'error': 'media_id veya link gerekli'}

        if filename:
            doc_payload['filename'] = filename
        if caption:
            doc_payload['caption'] = caption

        payload = {
            'messaging_product': 'whatsapp',
            'to': to,
            'type': 'document',
            'document': doc_payload,
        }
        return self._post_message(kurum_id, self._apply_context(payload, context_message_id))

    def send_reaction(
        self,
        kurum_id: int,
        to_e164: str,
        *,
        message_id: str,
        emoji: str,
    ) -> dict[str, Any]:
        to = to_e164.lstrip('+')
        payload = {
            'messaging_product': 'whatsapp',
            'to': to,
            'type': 'reaction',
            'reaction': {
                'message_id': message_id,
                'emoji': emoji or '',
            },
        }
        return self._post_message(kurum_id, payload)

    def upload_media(
        self,
        kurum_id: int,
        file_path: str,
        mime_type: str,
        *,
        file_name: str | None = None,
    ) -> str | None:
        """Graph POST /{phone_number_id}/media — media_id döndürür."""
        self.last_media_error = ''
        config = self._resolve_config(kurum_id)
        media_id = self._post_media_upload(
            config, file_path, mime_type, file_name=file_name,
        )
        if media_id:
            return media_id
        # Seçili hatta bozuk token varsa aynı kurumdaki geçerli token ile tekrar dene.
        # phone_number_id değişmez — medya gönderen numaraya ait olmalı.
        db_config = self.channel_config
        if db_config is not None:
            from apps.communication.application.account_resolver import AccountResolver
            alt = AccountResolver.sibling_access_token(db_config)
            if alt and alt != config.get('access_token'):
                retry_config = {**config, 'access_token': alt}
                media_id = self._post_media_upload(
                    retry_config, file_path, mime_type, file_name=file_name,
                )
                if media_id:
                    return media_id
                config = retry_config
        if '133010' in (self.last_media_error or ''):
            resolved = self.resolve_cloud_phone_number_id(kurum_id, config)
            if resolved and resolved != config.get('phone_number_id'):
                self._phone_number_id_override = resolved
                retry_config = {**config, 'phone_number_id': resolved}
                media_id = self._post_media_upload(
                    retry_config, file_path, mime_type, file_name=file_name,
                )
                if media_id:
                    self._persist_phone_number_id(resolved)
                    return media_id
            if looks_like_msisdn(config.get('phone_number_id') or ''):
                extra = (
                    ' Girilen değer görünen telefon numarasına benziyor; '
                    'Meta Phone number ID (uzun sayı) olmalı.'
                )
                if extra not in (self.last_media_error or ''):
                    self.last_media_error = f'{self.last_media_error}{extra}'
        return None

    def _post_media_upload(
        self,
        config: dict[str, str],
        file_path: str,
        mime_type: str,
        *,
        file_name: str | None = None,
    ) -> str | None:
        from apps.communication.application.template_media_header import sanitize_document_filename

        phone_number_id = config['phone_number_id']
        access_token = config['access_token']

        if not phone_number_id or not access_token:
            logger.info('WhatsApp stub upload — phone/token missing')
            return f'stub_media_{phone_number_id or "missing"}'

        url = f'{GRAPH_API_BASE}/{phone_number_id}/media'
        headers = {'Authorization': f'Bearer {access_token}'}
        guessed = mime_type or mimetypes.guess_type(file_path)[0] or 'application/octet-stream'
        upload_name = file_name or file_path.rsplit('/', 1)[-1]
        if guessed == 'application/pdf' or (upload_name or '').lower().endswith('.pdf'):
            upload_name = sanitize_document_filename(upload_name, default='document.pdf')
            guessed = 'application/pdf'

        try:
            with open(file_path, 'rb') as fh, httpx.Client(timeout=UPLOAD_TIMEOUT) as client:
                response = client.post(
                    url,
                    headers=headers,
                    data={'messaging_product': 'whatsapp', 'type': guessed},
                    files={'file': (upload_name, fh, guessed)},
                )
                data = response.json()
                if response.is_success:
                    return data.get('id') or None
                error_msg = self._format_api_error(data, response.text)
                self.last_media_error = error_msg
                logger.warning('WhatsApp media upload failed: %s', error_msg)
                return None
        except (OSError, httpx.HTTPError) as exc:
            self.last_media_error = str(exc)
            logger.exception('WhatsApp media upload error')
            return None

    def list_waba_phone_numbers(self, kurum_id: int) -> list[dict[str, Any]]:
        """GET /{waba_id}/phone_numbers — Cloud API hatları."""
        config = self._resolve_config(kurum_id)
        waba_id = (config.get('waba_id') or '').strip()
        access_token = config.get('access_token') or ''
        if not waba_id or not access_token:
            return []
        url = f'{GRAPH_API_BASE}/{waba_id}/phone_numbers'
        headers = {'Authorization': f'Bearer {access_token}'}
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.get(
                    url,
                    headers=headers,
                    params={'fields': 'id,display_phone_number,verified_name'},
                )
                data = response.json()
                if response.is_success:
                    return list(data.get('data') or [])
        except httpx.HTTPError:
            logger.exception('WABA phone_numbers list failed')
        return []

    def resolve_cloud_phone_number_id(
        self, kurum_id: int, config: dict[str, str],
    ) -> str | None:
        """Kayıtlı görünen numarayı WABA listesindeki gerçek Phone Number ID’ye çevir."""
        current = (config.get('phone_number_id') or '').strip()
        display = ''
        if self.channel_config is not None:
            display = (getattr(self.channel_config, 'display_phone', None) or '').strip()
        needles = {
            tail for tail in (phone_tail(current), phone_tail(display)) if tail
        }
        if not needles:
            return None
        for item in self.list_waba_phone_numbers(kurum_id):
            item_id = str(item.get('id') or '').strip()
            item_display = str(item.get('display_phone_number') or '')
            if item_id and phone_tail(item_display) in needles:
                return item_id
        return None

    def _persist_phone_number_id(self, phone_number_id: str) -> None:
        cfg = self.channel_config
        if cfg is None or not phone_number_id:
            return
        if (cfg.phone_number_id or '') == phone_number_id:
            return
        cfg.phone_number_id = phone_number_id
        cfg.save(update_fields=['phone_number_id', 'updated_at'])

    def resolve_app_id(self, access_token: str, *, stored_app_id: str | None = None) -> str:
        """Meta App ID: hesap alanı → env → token (debug_token).

        stored_app_id=None → channel_config.app_id kullan.
        stored_app_id='' → kayıtlı değeri atla (zorla yeniden çöz).
        """
        if stored_app_id is None:
            stored = ''
            if self.channel_config is not None:
                stored = str(getattr(self.channel_config, 'app_id', '') or '').strip()
        else:
            stored = stored_app_id.strip()
        if stored:
            return stored

        configured = str(getattr(settings, 'WHATSAPP_APP_ID', '') or '').strip()
        if configured:
            return configured
        if not access_token:
            return ''

        cache_key = 'wa:app_id:' + hashlib.sha256(access_token.encode()).hexdigest()[:24]
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        app_id = ''
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.get(
                    f'{GRAPH_API_BASE}/debug_token',
                    params={'input_token': access_token, 'access_token': access_token},
                )
                data = response.json()
                if response.is_success:
                    app_id = str(data.get('data', {}).get('app_id') or '')
                else:
                    logger.warning(
                        'Meta debug_token failed: %s',
                        self._format_api_error(data, response.text),
                    )
        except httpx.HTTPError:
            logger.exception('Meta debug_token error')

        if app_id:
            cache.set(cache_key, app_id, APP_ID_CACHE_TTL)
        return app_id

    def upload_template_media_handle(
        self,
        kurum_id: int,
        file_path: str,
        mime_type: str,
        *,
        file_name: str = '',
    ) -> dict[str, Any]:
        """
        Resumable Upload API — şablon HEADER örneği için `header_handle` üretir.
        /{phone_number_id}/media'nın döndürdüğü media_id şablon oluştururken
        geçersizdir ("Parameter value is not valid"); Meta burada ayrı bir
        upload session handle'ı bekler.
        """
        config = self._resolve_config(kurum_id)
        access_token = config['access_token']
        if not access_token:
            logger.info('WhatsApp stub template media upload — kurum=%s', kurum_id)
            return {'success': True, 'stub': True, 'handle': f'stub_handle_{kurum_id}'}

        app_id = self.resolve_app_id(access_token)
        if not app_id:
            return {
                'success': False,
                'error': (
                    'Meta App ID belirlenemedi. WhatsApp hesabına App ID girin, '
                    'sunucuda WHATSAPP_APP_ID tanımlayın veya access token yetkilerini kontrol edin.'
                ),
            }

        name = file_name or os.path.basename(file_path)
        guessed = mime_type or mimetypes.guess_type(name)[0] or 'application/octet-stream'
        try:
            file_length = os.path.getsize(file_path)
            with open(file_path, 'rb') as fh:
                payload = fh.read()
        except OSError as exc:
            logger.exception('Template media read error kurum=%s', kurum_id)
            return {'success': False, 'error': str(exc)}

        try:
            with httpx.Client(timeout=UPLOAD_TIMEOUT) as client:
                session_response = client.post(
                    f'{GRAPH_API_BASE}/{app_id}/uploads',
                    params={
                        'file_name': name,
                        'file_length': file_length,
                        'file_type': guessed,
                        'access_token': access_token,
                    },
                )
                session_data = session_response.json()
                if not session_response.is_success:
                    return {
                        'success': False,
                        'error': self._format_api_error(session_data, session_response.text),
                    }
                session_id = session_data.get('id') or ''
                if not session_id:
                    return {'success': False, 'error': 'Meta upload session oluşturulamadı.'}

                upload_response = client.post(
                    f'{GRAPH_API_BASE}/{session_id}',
                    headers={
                        'Authorization': f'OAuth {access_token}',
                        'file_offset': '0',
                        'Content-Type': 'application/octet-stream',
                    },
                    content=payload,
                )
                upload_data = upload_response.json()
                if not upload_response.is_success:
                    return {
                        'success': False,
                        'error': self._format_api_error(upload_data, upload_response.text),
                    }
                handle = upload_data.get('h') or ''
                if not handle:
                    return {'success': False, 'error': 'Meta upload handle döndürmedi.'}
                return {'success': True, 'handle': handle}
        except httpx.HTTPError as exc:
            logger.exception('Template media upload error kurum=%s', kurum_id)
            return {'success': False, 'error': str(exc)}

    def get_media_download_url(self, kurum_id: int, media_id: str) -> str | None:
        """Graph GET /{media_id} — geçici download URL."""
        config = self._resolve_config(kurum_id)
        access_token = config['access_token']
        if not access_token or not media_id:
            return None

        url = f'{GRAPH_API_BASE}/{media_id}'
        headers = {'Authorization': f'Bearer {access_token}'}
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.get(url, headers=headers)
                data = response.json()
                if response.is_success:
                    return data.get('url')
                logger.warning(
                    'WhatsApp media URL fetch failed kurum=%s media=%s: %s',
                    kurum_id,
                    media_id,
                    self._format_api_error(data, response.text),
                )
        except httpx.HTTPError:
            logger.exception('WhatsApp media URL error kurum=%s', kurum_id)
        return None

    def download_media(self, kurum_id: int, media_id: str) -> tuple[bytes, str] | None:
        """Medya bytes ve mime_type döndür."""
        download_url = self.get_media_download_url(kurum_id, media_id)
        if not download_url:
            return None

        config = self._resolve_config(kurum_id)
        headers = {'Authorization': f'Bearer {config["access_token"]}'}
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT, follow_redirects=True) as client:
                response = client.get(download_url, headers=headers)
                if response.is_success:
                    mime = response.headers.get('content-type', 'application/octet-stream')
                    return response.content, mime.split(';')[0].strip()
        except httpx.HTTPError:
            logger.exception('WhatsApp media download error kurum=%s', kurum_id)
        return None

    def list_message_templates(self, kurum_id: int, *, limit: int = 100) -> dict[str, Any]:
        """Graph GET /{waba_id}/message_templates"""
        config = self._resolve_config(kurum_id)
        waba_id = config['waba_id']
        access_token = config['access_token']

        if not waba_id or not access_token:
            return {
                'success': False,
                'error': 'WABA ID veya access token eksik.',
                'templates': [],
            }

        url = f'{GRAPH_API_BASE}/{waba_id}/message_templates'
        headers = {'Authorization': f'Bearer {access_token}'}
        params = {
            'limit': min(limit, 250),
            'fields': (
                'id,name,status,language,category,rejected_reason,'
                'components,quality_score,previous_category'
            ),
        }

        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.get(url, headers=headers, params=params)
                data = response.json()
                if response.is_success:
                    templates = data.get('data', [])
                    return {'success': True, 'templates': templates}
                return {
                    'success': False,
                    'error': self._format_api_error(data, response.text),
                    'templates': [],
                }
        except httpx.HTTPError as exc:
            return {'success': False, 'error': str(exc), 'templates': []}

    def create_message_template(
        self,
        kurum_id: int,
        *,
        name: str,
        language: str,
        category: str,
        components: list[dict[str, Any]],
        allow_category_change: bool = True,
    ) -> dict[str, Any]:
        """Graph POST /{waba_id}/message_templates"""
        config = self._resolve_config(kurum_id)
        waba_id = config['waba_id']
        access_token = config['access_token']

        if not waba_id or not access_token:
            return {
                'success': True,
                'stub': True,
                'id': f'stub_tpl_{name}',
                'status': 'PENDING',
                'category': category,
            }

        url = f'{GRAPH_API_BASE}/{waba_id}/message_templates'
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
        }
        payload = {
            'name': name,
            'language': language,
            'category': category,
            'components': components,
            'allow_category_change': allow_category_change,
        }
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.post(url, json=payload, headers=headers)
                data = response.json()
                if response.is_success:
                    return {'success': True, **data}
                return {
                    'success': False,
                    'error': self._format_api_error(data, response.text),
                    'status_code': response.status_code,
                    'raw': data,
                }
        except httpx.HTTPError as exc:
            return {'success': False, 'error': str(exc)}

    def delete_message_template(self, kurum_id: int, *, name: str, hsm_id: str = '') -> dict[str, Any]:
        """Graph DELETE /{waba_id}/message_templates"""
        config = self._resolve_config(kurum_id)
        waba_id = config['waba_id']
        access_token = config['access_token']

        if not waba_id or not access_token:
            return {'success': True, 'stub': True}

        url = f'{GRAPH_API_BASE}/{waba_id}/message_templates'
        headers = {'Authorization': f'Bearer {access_token}'}
        params: dict[str, str] = {'name': name}
        if hsm_id:
            params['hsm_id'] = hsm_id
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.delete(url, headers=headers, params=params)
                data = response.json() if response.content else {}
                if response.is_success:
                    return {'success': True, **data}
                return {
                    'success': False,
                    'error': self._format_api_error(data, response.text),
                }
        except httpx.HTTPError as exc:
            return {'success': False, 'error': str(exc)}

    def get_message_template(
        self,
        kurum_id: int,
        *,
        name: str,
        language: str = '',
    ) -> dict[str, Any]:
        """Listeden name (+ optional language) ile tek şablon bul."""
        result = self.list_message_templates(kurum_id)
        if not result.get('success'):
            return result
        for tpl in result.get('templates') or []:
            if tpl.get('name') != name:
                continue
            if language and tpl.get('language') != language:
                continue
            return {'success': True, 'template': tpl}
        return {'success': False, 'error': 'Şablon Meta üzerinde bulunamadı.', 'template': None}

    def test_connection(self, kurum_id: int) -> dict[str, Any]:
        config = self._resolve_config(kurum_id)
        phone_number_id = config['phone_number_id']
        access_token = config['access_token']
        has_credentials = bool(phone_number_id and access_token)

        if not has_credentials:
            return {
                'success': False,
                'configured': False,
                'phone_number_id': phone_number_id or None,
                'waba_id': config['waba_id'] or None,
                'token_preview': self.mask_token(access_token),
                'message': 'WHATSAPP_* env veya kurum config eksik.',
            }

        url = f'{GRAPH_API_BASE}/{phone_number_id}'
        headers = {'Authorization': f'Bearer {access_token}'}
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.get(url, headers=headers, params={'fields': 'id,display_phone_number'})
                data = response.json()
                if response.is_success:
                    app_id = ''
                    if self.channel_config is not None:
                        from apps.communication.application.app_id_resolver import (
                            ensure_account_app_id,
                        )
                        app_id = ensure_account_app_id(
                            self.channel_config,
                            force=True,
                            access_token=access_token,
                        )
                    else:
                        app_id = self.resolve_app_id(access_token)
                    return {
                        'success': True,
                        'configured': True,
                        'phone_number_id': phone_number_id,
                        'waba_id': config['waba_id'] or None,
                        'app_id': app_id or None,
                        'display_phone': data.get('display_phone_number'),
                        'token_preview': self.mask_token(access_token),
                        'message': 'Meta API bağlantısı başarılı.',
                    }
                error_msg = self._format_api_error(data, response.text)
                return {
                    'success': False,
                    'configured': True,
                    'error': error_msg,
                    'message': f'Meta API hatası: {error_msg}',
                }
        except httpx.HTTPError as exc:
            return {
                'success': False,
                'configured': True,
                'error': str(exc),
                'message': f'Bağlantı hatası: {exc}',
            }
