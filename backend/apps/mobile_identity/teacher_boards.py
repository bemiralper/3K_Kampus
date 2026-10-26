"""Şube tahtası. Kod ve yoklama jetonunun düz metni saklanmaz.

Ekran yakalama yoktur. Tahta yalnız bu öğretmenin görebildiği dersin adını gösterir.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.utils import timezone

from .models import BoardDisplay
from .services import MobileAuthError
from .teacher_read import _plan_or_404
from .views import _body

PAIR_TTL = timedelta(minutes=10)
CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def _new_code() -> str:
    return ''.join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def _public(board: BoardDisplay, personel_id: int) -> dict:
    mine = board.holder_id == personel_id
    return {
        'id': str(board.id),
        'state': 'busy' if board.holder_id else 'idle',
        'mine': mine,
        'lesson': board.lesson_label if mine else '',
    }


def start_display(request) -> dict:
    body = _body(request)
    device_key = str(body.get('device_key') or '').strip()
    if len(device_key) < 16 or len(device_key) > 128:
        raise MobileAuthError('validation_error', 'Tahta kimliği geçersiz.', 400)
    board = BoardDisplay.objects.filter(device_key=device_key).first()
    if board is not None and board.holder_id:
        return {'state': 'busy'}
    code = _new_code()
    token = secrets.token_urlsafe(32)
    expires = timezone.now() + PAIR_TTL
    if board is None:
        board = BoardDisplay(device_key=device_key)
    board.poll_token_hash = _digest(token)
    board.pair_code_hash = _digest(code)
    board.pair_code_expires_at = expires
    board.holder = None
    board.class_lesson_plan = None
    board.lesson_label = ''
    board.save()
    return {
        'state': 'waiting',
        'pair_code': code,
        'poll_token': token,
        'expires_in': int(PAIR_TTL.total_seconds()),
    }


def poll_display(request) -> dict:
    token = (request.GET.get('token') or '').strip()
    if not token:
        raise MobileAuthError('not_found', 'Tahta bulunamadı.', 404)
    board = BoardDisplay.objects.filter(poll_token_hash=_digest(token)).first()
    if board is None:
        raise MobileAuthError('not_found', 'Tahta bulunamadı.', 404)
    if board.holder_id and board.lesson_label:
        return {'state': 'showing', 'lesson': board.lesson_label}
    if board.holder_id:
        return {'state': 'connected', 'lesson': ''}
    return {'state': 'waiting', 'lesson': ''}


def list_boards(request, scope) -> dict:
    context = scope['context']
    rows = BoardDisplay.objects.filter(
        kurum_id=context['kurum_id'],
        sube_id=context['sube_id'],
    ).order_by('created_at')
    personel_id = scope['personel'].id
    return {'results': [_public(row, personel_id) for row in rows]}


def pair_board(request, scope) -> dict:
    code = str(_body(request).get('code') or '').strip().upper()
    if len(code) != 8:
        raise MobileAuthError('validation_error', 'Eşleştirme kodu geçersiz.', 400)
    board = BoardDisplay.objects.filter(
        pair_code_hash=_digest(code),
        pair_code_expires_at__gte=timezone.now(),
    ).first()
    if board is None:
        raise MobileAuthError('not_found', 'Tahta bulunamadı.', 404)
    context = scope['context']
    if board.kurum_id and board.kurum_id != context['kurum_id']:
        raise MobileAuthError('not_found', 'Tahta bulunamadı.', 404)
    if board.sube_id and board.sube_id != context['sube_id']:
        raise MobileAuthError('not_found', 'Tahta bulunamadı.', 404)
    if board.holder_id and board.holder_id != scope['personel'].id:
        raise MobileAuthError('conflict', 'Bu tahta kullanımda.', 409)
    board.kurum_id = context['kurum_id']
    board.sube_id = context['sube_id']
    board.holder = scope['personel']
    board.pair_code_hash = None
    board.pair_code_expires_at = None
    board.class_lesson_plan = None
    board.lesson_label = ''
    board.save()
    return _public(board, scope['personel'].id)


def _held(scope, board_id) -> BoardDisplay:
    context = scope['context']
    board = BoardDisplay.objects.filter(
        id=board_id,
        kurum_id=context['kurum_id'],
        sube_id=context['sube_id'],
        holder_id=scope['personel'].id,
    ).first()
    if board is None:
        raise MobileAuthError('not_found', 'Tahta bulunamadı.', 404)
    return board


def show_lesson(request, scope, board_id) -> dict:
    board = _held(scope, board_id)
    body = _body(request)
    try:
        term_id = int(body.get('term_id'))
        plan_id = int(body.get('plan_id'))
    except (TypeError, ValueError):
        raise MobileAuthError('validation_error', 'Ders seçilmelidir.', 400)
    plan = _plan_or_404(scope, term_id, plan_id)
    board.class_lesson_plan = plan
    board.lesson_label = f'{plan.ders.ad} · {plan.sinif.ad}'[:200]
    board.save(update_fields=['class_lesson_plan', 'lesson_label', 'updated_at'])
    return _public(board, scope['personel'].id)


def end_board(request, scope, board_id) -> dict:
    board = _held(scope, board_id)
    board.holder = None
    board.class_lesson_plan = None
    board.lesson_label = ''
    board.save(update_fields=['holder', 'class_lesson_plan', 'lesson_label', 'updated_at'])
    return {'code': 'ok', 'message': 'Bağlantı sonlandı.'}
