"""
Meta WhatsApp webhook endpoint — auth dışı, CSRF exempt.
"""
import json

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.communication.application.inbound_processor import InboundProcessor
from apps.communication.infrastructure.repository import ChannelConfigRepository


def _verify_webhook_token(token: str) -> bool:
    if not token:
        return False
    if settings.WHATSAPP_VERIFY_TOKEN and token == settings.WHATSAPP_VERIFY_TOKEN:
        return True
    return ChannelConfigRepository.verify_token_exists(token)


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
    signature = request.headers.get('X-Hub-Signature-256', '')
    signature_valid = processor.verify_signature(
        request.body,
        signature,
        settings.WHATSAPP_APP_SECRET,
    )

    try:
        payload = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    if not signature_valid and settings.WHATSAPP_APP_SECRET:
        processor.process_webhook(
            payload,
            signature_valid=False,
            raw_body=raw_body,
        )
        return JsonResponse({'error': 'Invalid signature'}, status=403)

    result = processor.process_webhook(
        payload,
        signature_valid=True,
        raw_body=raw_body,
    )
    return JsonResponse({'success': True, **result})
