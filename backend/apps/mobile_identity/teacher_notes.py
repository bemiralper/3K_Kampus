"""Sınıf ders notu. Dosya Drive'da, kayıt yalnız kimliği tutar. Web tablolarına yazılmaz."""
from __future__ import annotations

import io
import os
import re
import time
from datetime import date
from urllib.parse import quote

from django.contrib.auth import get_user_model
from django.core import signing
from django.db import IntegrityError, transaction

from .drive import DriveError, discard_file, fetch_file, remove_file, store_file
from .models import DersNotu
from .services import MobileAuthError, _personel_for, _teacher_assignments
from .teacher_read import _load_term, _plan_or_404, _role_for

_ASCII_NAMES = str.maketrans({
    'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I',
    'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U',
})
VIEW_SALT = 'ders-notu-view'
VIEW_SECONDS = 180
MAX_PREVIEW_PAGES = 40
_preview_cache: dict[str, tuple[float, list[dict]]] = {}

MAX_BYTES = 20 * 1024 * 1024
ALLOWED = {
    'application/pdf': '.pdf',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
}


def _public(row: DersNotu) -> dict:
    return {
        'id': row.id,
        'plan_id': row.class_lesson_plan_id,
        'session_date': row.session_date.isoformat(),
        'file_name': row.file_name,
        'mime_type': row.mime_type,
        'size': row.size,
        'created_at': row.created_at.isoformat(),
    }


def _date(value) -> date:
    try:
        return date.fromisoformat(str(value or ''))
    except ValueError:
        raise MobileAuthError('validation_error', 'Tarih geçersiz.', 400)


def _folder_name(value: str) -> str:
    text = re.sub(r'[\x00-\x1f]', ' ', value or '').strip()
    text = re.sub(r'\s+', ' ', text)
    return (text or 'Adsız')[:80]


def _file_name(upload_name: str, session_date: date, mime: str) -> str:
    base = os.path.basename(upload_name or '').replace('\x00', '')
    base = re.sub(r'[/\\]+', '-', base).strip().strip('.')
    stem, ext = os.path.splitext(base)
    suffix = ext.lower() if mime == 'image/jpeg' and ext.lower() in {'.jpg', '.jpeg'} else ALLOWED[mime]
    stem = re.sub(r'\s+', ' ', stem).strip() or 'not'
    return f'{session_date.isoformat()} {stem[:80]}{suffix}'[:180]


def _require_primary(plan, personel_id: int) -> None:
    if _role_for(plan, personel_id) != 'PRIMARY':
        raise MobileAuthError('forbidden', 'Ders notu asıl öğretmene açıktır.', 403)


def _term(scope, raw):
    try:
        term_id = int(raw)
    except (TypeError, ValueError):
        raise MobileAuthError('validation_error', 'Dönem seçilmelidir.', 400)
    if term_id < 1:
        raise MobileAuthError('validation_error', 'Dönem seçilmelidir.', 400)
    return _load_term(scope, term_id)


def list_lesson_notes(request, scope, plan_id: int) -> dict:
    term = _term(scope, request.GET.get('term_id'))
    plan = _plan_or_404(scope, term.id, plan_id)
    rows = DersNotu.objects.filter(class_lesson_plan=plan).order_by('-session_date', '-id')
    return {'plan_id': plan.id, 'results': [_public(row) for row in rows]}


def create_lesson_note(request, scope, plan_id: int):
    term = _term(scope, request.POST.get('term_id'))
    plan = _plan_or_404(scope, term.id, plan_id)
    _require_primary(plan, scope['personel'].id)
    session_date = _date(request.POST.get('session_date'))
    key = (request.headers.get('Idempotency-Key') or '').strip()[:80]
    if key:
        existing = DersNotu.objects.filter(created_by=request.mobile_user, idempotency_key=key).first()
        if existing is not None:
            return _public(existing), 200
    upload = request.FILES.get('file')
    if upload is None:
        raise MobileAuthError('validation_error', 'Dosya seçilmedi.', 400)
    mime = (upload.content_type or '').split(';')[0].strip().lower()
    if mime not in ALLOWED:
        raise MobileAuthError('validation_error', 'Yalnız PDF veya görsel yüklenebilir.', 400)
    data = upload.read()
    if not data:
        raise MobileAuthError('validation_error', 'Dosya boş.', 400)
    if len(data) > MAX_BYTES:
        raise MobileAuthError('validation_error', 'Dosya 20 MB sınırını aşıyor.', 400)
    file_name = _file_name(upload.name, session_date, mime)
    year = plan.egitim_yili
    folders = [
        _folder_name(f'{year.baslangic_yil}-{year.bitis_yil}'),
        _folder_name(plan.sinif.ad),
        _folder_name(plan.ders.ad),
    ]
    try:
        drive_id = store_file(folders, file_name, mime, data)
    except DriveError:
        raise MobileAuthError('unavailable', 'Dosya Drive\'a yazılamadı.', 502)
    context = scope['context']
    try:
        with transaction.atomic():
            row = DersNotu.objects.create(
                kurum_id=context['kurum_id'],
                sube_id=context['sube_id'],
                egitim_yili_id=context['egitim_yili_id'],
                term=term,
                class_lesson_plan=plan,
                ogretmen=scope['personel'],
                session_date=session_date,
                file_name=file_name,
                drive_file_id=drive_id,
                mime_type=mime,
                size=len(data),
                idempotency_key=key,
                created_by=request.mobile_user,
            )
    except IntegrityError:
        discard_file(drive_id)
        if key:
            existing = DersNotu.objects.filter(created_by=request.mobile_user, idempotency_key=key).first()
            if existing is not None:
                return _public(existing), 200
        raise MobileAuthError('validation_error', 'Dosya kaydedilemedi.', 400)
    except Exception:
        discard_file(drive_id)
        raise
    return _public(row), 201


def _visible_note(scope, note_id: int) -> DersNotu:
    row = DersNotu.objects.filter(id=note_id).first()
    if row is None:
        raise MobileAuthError('not_found', 'Ders notu bulunamadı.', 404)
    _plan_or_404(scope, row.term_id, row.class_lesson_plan_id)
    return row


def delete_lesson_note(request, scope, note_id: int) -> dict:
    row = _visible_note(scope, note_id)
    plan = _plan_or_404(scope, row.term_id, row.class_lesson_plan_id)
    _require_primary(plan, scope['personel'].id)
    try:
        remove_file(row.drive_file_id)
    except DriveError:
        raise MobileAuthError('unavailable', 'Dosya Drive\'dan silinemedi.', 502)
    drive_id = row.drive_file_id
    row.delete()
    _preview_cache.pop(drive_id, None)
    return {'deleted': True}


def lesson_note_link(request, scope, note_id: int) -> dict:
    """iPad Safari oturum başlığı taşımaz. Kısa imzalı bağlantı yeter."""
    _visible_note(scope, note_id)
    token = signing.dumps({'u': request.mobile_user.id, 'n': note_id}, salt=VIEW_SALT)
    return {'view': token}


def _scope_for_viewer(user, row: DersNotu) -> dict:
    personel = _personel_for(user)
    assignment = None
    if personel is not None:
        assignment = (
            _teacher_assignments(user)
            .filter(
                kurum_id=row.kurum_id,
                gorev_sube_id=row.sube_id,
                egitim_yili_id=row.egitim_yili_id,
            )
            .first()
        )
    if personel is None or assignment is None:
        raise MobileAuthError('teacher_not_assigned', 'Bu şube ve yılda öğretmen görevlendirmesi yok.', 403)
    scope = {
        'personel': personel,
        'assignment': assignment,
        'context': {
            'kurum_id': row.kurum_id,
            'sube_id': row.sube_id,
            'egitim_yili_id': row.egitim_yili_id,
        },
    }
    _plan_or_404(scope, row.term_id, row.class_lesson_plan_id)
    return scope


def open_lesson_note_from_view(request, note_id: int) -> dict:
    token = (request.GET.get('view') or '').strip()
    try:
        payload = signing.loads(token, salt=VIEW_SALT, max_age=VIEW_SECONDS)
    except signing.SignatureExpired:
        raise MobileAuthError('unauthenticated', 'Bağlantının süresi doldu.', 401)
    except signing.BadSignature:
        raise MobileAuthError('unauthenticated', 'Bağlantı geçersiz.', 401)
    if payload.get('n') != note_id:
        raise MobileAuthError('unauthenticated', 'Bağlantı geçersiz.', 401)
    user = get_user_model().objects.filter(id=payload.get('u'), is_active=True).first()
    if user is None:
        raise MobileAuthError('unauthenticated', 'Bağlantı geçersiz.', 401)
    row = DersNotu.objects.filter(id=note_id).first()
    if row is None:
        raise MobileAuthError('not_found', 'Ders notu bulunamadı.', 404)
    scope = _scope_for_viewer(user, row)
    return open_lesson_note(request, scope, note_id)


def render_pages(data: bytes, mime: str) -> list[dict]:
    if mime.startswith('image/'):
        return [_image_page(data, mime)]
    return _pdf_pages(data)


def _image_page(data: bytes, mime: str) -> dict:
    from PIL import Image

    with Image.open(io.BytesIO(data)) as image:
        width, height = image.size
    return {'number': 1, 'width': width, 'height': height, 'mime': mime, 'content': data}


def _pdf_pages(data: bytes) -> list[dict]:
    import pymupdf

    document = pymupdf.open(stream=data, filetype='pdf')
    try:
        if document.page_count < 1:
            raise MobileAuthError('unavailable', 'Önizleme hazırlanamadı.', 502)
        if document.page_count > MAX_PREVIEW_PAGES:
            raise MobileAuthError('validation_error', 'Önizleme 40 sayfayı aşıyor.', 400)
        matrix = pymupdf.Matrix(1.6, 1.6)
        pages = []
        for index, page in enumerate(document, start=1):
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            pages.append({
                'number': index,
                'width': pixmap.width,
                'height': pixmap.height,
                'mime': 'image/jpeg',
                'content': pixmap.tobytes('jpeg', jpg_quality=80),
            })
        return pages
    finally:
        document.close()


def _cached_pages(scope, note_id: int) -> list[dict]:
    row = _visible_note(scope, note_id)
    cached = _preview_cache.get(row.drive_file_id)
    now = time.time()
    if cached is not None and cached[0] > now:
        return cached[1]
    try:
        data = fetch_file(row.drive_file_id)
        pages = render_pages(data, row.mime_type)
    except MobileAuthError:
        raise
    except Exception:
        raise MobileAuthError('unavailable', 'Önizleme hazırlanamadı.', 502)
    _preview_cache[row.drive_file_id] = (now + 600, pages)
    if len(_preview_cache) > 8:
        oldest = min(_preview_cache, key=lambda key: _preview_cache[key][0])
        _preview_cache.pop(oldest, None)
    return pages


def preview_catalog(request, scope, note_id: int) -> dict:
    pages = _cached_pages(scope, note_id)
    return {
        'pages': [
            {'number': page['number'], 'width': page['width'], 'height': page['height']}
            for page in pages
        ],
    }


def preview_page(request, scope, note_id: int, page_number: int) -> dict:
    found = next((page for page in _cached_pages(scope, note_id) if page['number'] == page_number), None)
    if found is None:
        raise MobileAuthError('not_found', 'Sayfa bulunamadı.', 404)
    return {'content': found['content'], 'mime': found['mime']}


def open_lesson_note(request, scope, note_id: int) -> dict:
    row = _visible_note(scope, note_id)
    try:
        content = fetch_file(row.drive_file_id)
    except DriveError:
        raise MobileAuthError('unavailable', 'Dosya Drive\'dan açılamadı.', 502)
    filename = quote(row.file_name)
    ascii_name = row.file_name.translate(_ASCII_NAMES).encode('ascii', 'ignore').decode().replace('"', '') or 'ders-notu'
    return {
        'content': content,
        'mime': row.mime_type,
        'disposition': f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{filename}",
    }
