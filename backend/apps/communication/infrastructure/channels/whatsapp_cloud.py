"""
WhatsApp Business Cloud API client.
"""
from __future__ import annotations

import logging
import mimetypes
from typing import Any

import httpx
from django.conf import settings

from apps.communication.application.token_crypto import decrypt_access_token
from apps.communication.domain.enums import Channel
from apps.communication.infrastructure.channels.base import BaseChannelClient
from apps.communication.infrastructure.repository import ChannelConfigRepository

logger = logging.getLogger(__name__)

GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'
REQUEST_TIMEOUT = 30.0

META_ERROR_HINTS = {
    130429: 'Meta rate limit — gönderimi yavaşlatın.',
    132015: 'Şablon duraklatıldı — Meta Business Manager\'dan kontrol edin.',
    131026: 'Mesaj teslim edilemedi — alıcı numarası geçersiz olabilir.',
    131047: '24 saatlik oturum dışı — onaylı şablon kullanın.',
}


class WhatsAppCloudClient(BaseChannelClient):
    channel = Channel.WHATSAPP

    def _resolve_config(self, kurum_id: int) -> dict[str, str]:
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
        params = {'limit': min(limit, 250)}

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
