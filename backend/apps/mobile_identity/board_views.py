"""Tahta ekranı. Öğretmen jetonu istemez. Bayrak kapalıyken 404."""
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .services import MobileAuthError
from .teacher_boards import poll_display, start_display
from .views import _disabled, _error

PAGE = """<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>3K Tahta</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
      background: #0E1C36; color: #F4F6F8; font-family: sans-serif; text-align: center; }
    #code { font-size: 64px; letter-spacing: 0.2em; margin: 16px 0; }
    #lesson { font-size: 42px; }
    p { color: #9AABBE; }
  </style>
</head>
<body>
  <main>
    <p id="hint">Kod bekleniyor</p>
    <div id="code"></div>
    <div id="lesson"></div>
  </main>
  <script>
    const hint = document.getElementById('hint');
    const code = document.getElementById('code');
    const lesson = document.getElementById('lesson');
    const storageKey = 'kampus-board-device';
    let device = localStorage.getItem(storageKey);
    if (!device) {
      device = crypto.randomUUID();
      localStorage.setItem(storageKey, device);
    }
    let token = sessionStorage.getItem('kampus-board-token') || '';
    async function start() {
      const response = await fetch('/api/board/display/start/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_key: device }),
      });
      if (!response.ok) {
        hint.textContent = 'Tahta açılamadı.';
        return;
      }
      const body = await response.json();
      if (body.state === 'waiting' && body.poll_token) {
        token = body.poll_token;
        sessionStorage.setItem('kampus-board-token', token);
        code.textContent = body.pair_code || '';
        lesson.textContent = '';
        hint.textContent = 'Öğretmen bu kodu girer';
      }
    }
    async function poll() {
      if (!token) return;
      const response = await fetch('/api/board/display/?token=' + encodeURIComponent(token));
      if (!response.ok) return;
      const body = await response.json();
      if (body.state === 'showing' || body.state === 'connected') {
        code.textContent = '';
        lesson.textContent = body.lesson || '';
        hint.textContent = body.lesson ? 'Ders açık' : 'Bağlandı';
      } else if (!code.textContent) {
        await start();
      }
    }
    start().then(function () { setInterval(poll, 2000); });
  </script>
</body>
</html>
"""


def _json(handler, request):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        return JsonResponse(handler(request))
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)


@csrf_exempt
@require_POST
def board_start_api(request):
    return _json(start_display, request)


@csrf_exempt
@require_GET
def board_poll_api(request):
    return _json(poll_display, request)


@require_GET
def board_page_api(request):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    return HttpResponse(PAGE, content_type='text/html; charset=utf-8')
