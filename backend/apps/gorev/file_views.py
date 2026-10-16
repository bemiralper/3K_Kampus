"""Görev dosyası yükleme ve yetkili indirme."""
import json
from urllib.parse import quote

from django.http import FileResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from apps.gorev.application.files import (
    GorevDosyaError, delete_stored, serialize_dosya, store_remote_image, store_upload,
)
from apps.gorev.domain.models import GorevDosya
from apps.gorev.helpers import _get_kurum_id, _get_user_id
from apps.personel.domain.models import Personel
from apps.roller.models import UserRole
from shared.permissions import require_gorev_api

_ADMIN_ROLES = {'super_admin', 'kurum_yoneticisi', 'sube_yoneticisi', 'egitim_yoneticisi'}


def _role_code(user):
    try:
        return UserRole.objects.select_related('role').get(user_id=user.id).role.code
    except UserRole.DoesNotExist:
        return None


def _user_in_kurum(user, kurum_id: int) -> bool:
    if user.is_superuser or user.is_staff:
        return True
    return Personel.objects.filter(user_id=user.id, kurum_id=kurum_id, aktif_mi=True).exists()


def _can_read_file(request, dosya: GorevDosya) -> bool:
    user = request.user
    if not _user_in_kurum(user, dosya.kurum_id):
        return False
    context_kurum = _get_kurum_id(request)
    if context_kurum and context_kurum != dosya.kurum_id:
        return False
    if dosya.gorev_id is None:
        return dosya.yukleyen_id == user.id
    gorev = dosya.gorev
    if not gorev or gorev.is_deleted or gorev.kurum_id != dosya.kurum_id:
        return False
    if user.is_superuser or user.is_staff or _role_code(user) in _ADMIN_ROLES:
        return True
    return gorev.atamalar.filter(atanan_user_id=user.id).exists()


def _can_delete_file(request, dosya: GorevDosya) -> bool:
    user = request.user
    if dosya.gorev_id is None:
        return dosya.yukleyen_id == user.id and _user_in_kurum(user, dosya.kurum_id)
    if not _can_read_file(request, dosya):
        return False
    return bool(
        user.is_superuser or user.is_staff or _role_code(user) in _ADMIN_ROLES or dosya.yukleyen_id == user.id
    )


@csrf_exempt
@require_gorev_api
def api_gorev_dosya_collection(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    kurum_id = _get_kurum_id(request)
    user_id = _get_user_id(request)
    if not kurum_id or not user_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)
    try:
        dosya = store_upload(kurum_id=kurum_id, user_id=user_id, uploaded=request.FILES.get('dosya'))
    except GorevDosyaError as exc:
        return JsonResponse({'success': False, 'error': str(exc)}, status=400)
    return JsonResponse({'success': True, 'data': serialize_dosya(dosya)})


@csrf_exempt
@require_gorev_api
def api_gorev_dosya_remote(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    kurum_id = _get_kurum_id(request)
    user_id = _get_user_id(request)
    if not kurum_id or not user_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)
    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz istek'}, status=400)
    url = payload.get('url') if isinstance(payload, dict) else None
    if not isinstance(url, str) or not url.strip():
        return JsonResponse({'success': False, 'error': 'Görsel adresi gerekli'}, status=400)
    try:
        dosya = store_remote_image(kurum_id=kurum_id, user_id=user_id, url=url.strip())
    except GorevDosyaError as exc:
        return JsonResponse({'success': False, 'error': str(exc)}, status=400)
    return JsonResponse({'success': True, 'data': serialize_dosya(dosya)})


@csrf_exempt
@require_gorev_api
def api_gorev_dosya_detail(request, pk):
    dosya = GorevDosya.objects.select_related('gorev').filter(id=pk).first()
    if not dosya:
        return JsonResponse({'success': False, 'error': 'Dosya bulunamadı'}, status=404)

    if request.method == 'GET':
        if not _can_read_file(request, dosya):
            return JsonResponse({'success': False, 'error': 'Bu dosyaya erişim yetkiniz yok.'}, status=403)
        inline = dosya.tur == GorevDosya.TUR_GORSEL
        disposition = 'inline' if inline else 'attachment'
        filename = quote(dosya.orijinal_ad)
        response = FileResponse(
            dosya.dosya.open('rb'),
            content_type=dosya.icerik_turu or 'application/octet-stream',
        )
        response['Content-Disposition'] = f"{disposition}; filename*=UTF-8''{filename}"
        response['X-Content-Type-Options'] = 'nosniff'
        response['Content-Security-Policy'] = "default-src 'none'"
        response['Cache-Control'] = 'private, no-store'
        return response

    if request.method == 'DELETE':
        if not _can_delete_file(request, dosya):
            return JsonResponse({'success': False, 'error': 'Bu dosyayı kaldırma yetkiniz yok.'}, status=403)
        delete_stored(dosya)
        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
