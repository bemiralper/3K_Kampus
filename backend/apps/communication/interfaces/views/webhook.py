"""
Meta WhatsApp webhook endpoint — auth dışı, CSRF exempt.

İmza doğrulaması hesap bazlıdır: payload'daki `phone_number_id` ile hat bulunur,
o hattın `app_secret_encrypted` değeri kullanılır; boşsa global
`WHATSAPP_APP_SECRET`. Hiç secret yoksa istek reddedilir (W-01). Geçersiz
imzalı istek yalnız loglanır; veritabanına yazılmaz (W-02). Doğrulanan
payload Celery varsa arka planda işlenir (B-03).
"""
from __future__ import annotations

import json
import logging

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.communication.application.inbound_processor import InboundProcessor
from apps.communication.infrastructure.repository import ChannelConfigRepository

logger = logging.getLogger(__name__)


def _verify_webhook_token(token: str) -> bool:
    if not token:
        return False
    if settings.WHATSAPP_VERIFY_TOKEN and token == settings.WHATSAPP_VERIFY_TOKEN:
        return True
    return ChannelConfigRepository.verify_token_exists(token)


def _payload_phone_number_ids(payload: dict) -> list[str]:
    ids: list[str] = []
    for entry in payload.get('entry', []) or []:
        for change in entry.get('changes', []) or []:
            pn = ((change.get('value') or {}).get('metadata') or {}).get('phone_number_id')
            if pn and pn not in ids:
                ids.append(str(pn))
    return ids


def _candidate_secrets(payload: dict) -> list[str]:
    """Hat bazlı app secret'lar (varsa) + global secret."""
    from apps.communication.application.token_crypto import decrypt_access_token

    secrets: list[str] = []
    if getattr(settings, 'COMMUNICATION_WEBHOOK_ACCOUNT_SECRET', True):
        for pn in _payload_phone_number_ids(payload):
            cfg = ChannelConfigRepository.get_by_phone_number_id(pn)
            if cfg is None or not cfg.app_secret_encrypted:
                continue
            secret = decrypt_access_token(cfg.app_secret_encrypted)
            if secret and secret not in secrets:
                secrets.append(secret)
    if settings.WHATSAPP_APP_SECRET and settings.WHATSAPP_APP_SECRET not in secrets:
        secrets.append(settings.WHATSAPP_APP_SECRET)
    return secrets


def _signature_valid(processor: InboundProcessor, body: bytes, signature: str, secrets: list[str]) -> bool:
    return any(processor.verify_signature(body, signature, secret) for secret in secrets)


def _webhook_secret_required() -> bool:
    """Secret'sız kabul yalnız DEBUG/test ortamında (dev)."""
    if getattr(settings, 'COMMUNICATION_WEBHOOK_ALLOW_UNSIGNED', None) is not None:
        return not settings.COMMUNICATION_WEBHOOK_ALLOW_UNSIGNED
    return not getattr(settings, 'DEBUG', False)


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def whatsapp_webhook_view(request):
    processor = InboundProcessor()

    if request.method == 'GET':
        mode = request.GET.get('hub.mode', '')
        token = request.GET.get('hub.verify_token', '')
        challenge = request.GET.get('hub.challenge', '')
        if mode == 'subscribe' and _verify_webhook_token(token):
            return HttpResponse(challenge, content_type='text/plain')
        return HttpResponse('Forbidden', status=403)

    raw_body = request.body.decode('utf-8') if request.body else '{}'
    try:
        payload = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    if not isinstance(payload, dict):
        return JsonResponse({'error': 'Invalid payload'}, status=400)

    signature = request.headers.get('X-Hub-Signature-256', '')
    secrets = _candidate_secrets(payload)

    if not secrets:
        if _webhook_secret_required():
            logger.error('webhook: app secret tanımlı değil, istek reddedildi')
            return JsonResponse({'error': 'Webhook secret not configured'}, status=403)
        signature_valid = True
    else:
        signature_valid = _signature_valid(processor, request.body, signature, secrets)

    if not signature_valid:
        # Geçersiz imza DB'ye yazılmaz — sahte istek log tablolarını şişirmesin (W-02)
        logger.warning(
            'webhook: geçersiz imza phone_number_ids=%s', _payload_phone_number_ids(payload),
        )
        return JsonResponse({'error': 'Invalid signature'}, status=403)

    from apps.communication.application.celery_dispatch import dispatch_process_webhook

    queued = dispatch_process_webhook(payload, raw_body)
    if queued:
        return JsonResponse({'success': True, 'accepted': True})

    result = processor.process_webhook(payload, signature_valid=True, raw_body=raw_body)
    return JsonResponse({'success': True, **result})
