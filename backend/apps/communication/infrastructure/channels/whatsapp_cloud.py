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

META_ERROR_HINTS = {
    130429: 'Meta rate limit — gönderimi yavaşlatın.',
    132015: 'Şablon duraklatıldı — Meta Business Manager\'dan kontrol edin.',
    131026: 'Mesaj teslim edilemedi — alıcı numarası geçersiz olabilir.',
    131047: '24 saatlik oturum dışı — onaylı şablon kullanın.',
}


class WhatsAppCloudClient(BaseChannelClient):
    channel = Channel.WHATSAPP

    def __init__(self, channel_config=None):
        self.channel_config = channel_config

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
        return {
            'phone_number_id': (
                (db_config.phone_number_id if db_config else '')
                or settings.WHATSAPP_PHONE_NUMBER_ID
            ),
            'waba_id': (
                (db_config.waba_id if db_config else '')
                or settings.WHATSAPP_WABA_ID
            ),
            'access_token': decrypt_access_token(raw_token),
            'verify_token': (
                (db_config.webhook_verify_token if db_config else '')
                or settings.WHATSAPP_VERIFY_TOKEN
            ),
        }

    @staticmethod
    def _format_api_error(data: dict[str, Any], fallback: str) -> str:
        error = data.get('error', {})
        code = error.get('code')
        message = error.get('message', fallback)
        hint = META_ERROR_HINTS.get(code)
        if hint:
            return f'{message} ({hint})'
        return message

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

    def upload_media(self, kurum_id: int, file_path: str, mime_type: str) -> str | None:
        """Graph POST /{phone_number_id}/media — media_id döndürür."""
        config = self._resolve_config(kurum_id)
        phone_number_id = config['phone_number_id']
        access_token = config['access_token']

        if not phone_number_id or not access_token:
            logger.info('WhatsApp stub upload — kurum=%s', kurum_id)
            return f'stub_media_{kurum_id}'

        url = f'{GRAPH_API_BASE}/{phone_number_id}/media'
        headers = {'Authorization': f'Bearer {access_token}'}
        guessed = mime_type or mimetypes.guess_type(file_path)[0] or 'application/octet-stream'

        try:
            with open(file_path, 'rb') as fh, httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                response = client.post(
                    url,
                    headers=headers,
                    data={'messaging_product': 'whatsapp', 'type': guessed},
                    files={'file': (file_path.rsplit('/', 1)[-1], fh, guessed)},
                )
                data = response.json()
                if response.is_success:
                    return data.get('id') or None
                error_msg = self._format_api_error(data, response.text)
                logger.warning('WhatsApp media upload failed kurum=%s: %s', kurum_id, error_msg)
                return None
        except (OSError, httpx.HTTPError) as exc:
            logger.exception('WhatsApp media upload error kurum=%s', kurum_id)
            return None

    def resolve_app_id(self, access_token: str) -> str:
        """Şablon medya yüklemesi için Meta App ID (ayar yoksa token'dan çözülür)."""
        configured = str(getattr(settings, 'WHATSAPP_APP_ID', '') or '')
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
                    'Meta App ID belirlenemedi. Sunucuda WHATSAPP_APP_ID ayarını tanımlayın '
                    'veya access token yetkilerini kontrol edin.'
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
                    return {
                        'success': True,
                        'configured': True,
                        'phone_number_id': phone_number_id,
                        'waba_id': config['waba_id'] or None,
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
