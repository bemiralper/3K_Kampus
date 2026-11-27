"""
Öğrenci Portalı — HTTP görünümleri (`/api/student/*`, koç mesaj panosu ve personel hesap yönetimi).
"""
from __future__ import annotations

from datetime import date, timedelta
import json
from typing import Callable

from django.contrib.auth import authenticate, login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .auth import (
    ISTANBUL,
    StudentPortalError,
    _enforce_csrf_if_unsafe,
    create_portal_account_for_student,
    ensure_portal_enabled,
    portal_error_response,
    reset_portal_password_for_student,
    resolve_student_scope,
    serialize_portal_account_for_staff,
    set_portal_account_enabled,
)
from .services.communication_service import (
    build_living_home,
    coach_list_portal_messages,
    coach_send_portal_message,
    list_student_announcements,
    list_student_coach_messages,
    mark_announcements_read,
    send_student_message_to_coach,
)
from .services.exam_service import (
    build_student_exam_detail,
    build_student_exams_overview,
    render_student_exam_karne_pdf,
)
from .services.schedule_service import (
    build_campus_life_and_attendance,
    build_courses_and_notes,
    build_unified_schedule,
    get_student_note_preview_catalog,
    get_student_note_preview_page,
    open_student_note_file,
)
from .services.study_service import (
    build_study_workspace,
    submit_daily_feedback,
    toggle_or_complete_study_block,
)
from .services.homework_service import (
    get_student_assignment_detail,
    list_student_assignments,
    render_student_assignment_pdf,
    update_student_assignment_note,
    update_student_assignment_task,
)
from .services.achievement_service import (
    build_coach_student_achievements_preview,
    build_student_achievements,
    update_student_achievement_preferences,
)


def parse_json_body(request) -> dict:
    try:
        data = json.loads(request.body or b'{}')
    except json.JSONDecodeError:
        raise StudentPortalError('validation_error', 'Geçersiz JSON formatı.', 400)
    if not isinstance(data, dict):
        raise StudentPortalError('validation_error', 'Geçersiz istek gövdesi.', 400)
    return data


def student_endpoint(handler: Callable, *, allow_password_gate: bool = False):
    """Standart öğrenci kapsam kapısı sarıcısı."""
    def _wrapped(request, *args, **kwargs):
        blocked = ensure_portal_enabled()
        if blocked is not None:
            return blocked
        try:
            scope = resolve_student_scope(request, allow_password_gate=allow_password_gate)
            return handler(request, scope, *args, **kwargs)
        except StudentPortalError as exc:
            return portal_error_response(exc.code, exc.message, exc.status)

    return _wrapped


def _file_url(field, request) -> str | None:
    if not field:
        return None
    try:
        return field.url
    except Exception:
        return None


def _parse_iso_date(raw: str | None, fallback: date) -> date:
    if not raw:
        return fallback
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise StudentPortalError('validation_error', 'Geçersiz tarih formatı (YYYY-MM-DD bekleniyor).', 400)


from apps.kurum.branding import serialize_kurum_branding, serialize_sube_branding


def _resolve_portal_branding(request, kayit) -> dict:
    sube_b = serialize_sube_branding(kayit.sube, request) if kayit.sube else {}
    kurum_b = serialize_kurum_branding(kayit.kurum, request) if kayit.kurum else {}

    sube_has_logo = bool(sube_b.get('app_logo_url') or sube_b.get('login_logo_url'))
    kurum_has_logo = bool(kurum_b.get('app_logo_url') or kurum_b.get('login_logo_url'))
    logo_entity = sube_b if sube_has_logo else kurum_b

    return {
        'logo_source': 'sube' if sube_has_logo else ('kurum' if kurum_has_logo else 'default'),
        'app_logo_url': logo_entity.get('app_logo_url') or logo_entity.get('login_logo_url'),
        'dark_logo_url': logo_entity.get('login_logo_url') or logo_entity.get('app_logo_url'),
        'favicon_url': sube_b.get('favicon_url') or kurum_b.get('favicon_url'),
        'display_name': (
            sube_b.get('gorunen_ad')
            or (kayit.sube.ad if kayit.sube else '')
            or kurum_b.get('gorunen_ad')
            or (kayit.kurum.ad if kayit.kurum else '3K Kampüs')
        ),
    }


def _normalize_focus_presets(raw_presets, focus_minutes: int) -> list[int]:
    cleaned: list[int] = []
    if isinstance(raw_presets, list):
        for val in raw_presets:
            try:
                iv = int(val)
            except (TypeError, ValueError):
                continue
            if 5 <= iv <= 180 and iv not in cleaned:
                cleaned.append(iv)
    if not cleaned:
        cleaned = [25, 40, 50]
    if 5 <= focus_minutes <= 180 and focus_minutes not in cleaned:
        cleaned.append(focus_minutes)
    cleaned.sort()
    return cleaned[:8]


def _serialize_preferences(prefs: dict) -> dict:
    fm = int(prefs.get('focus_minutes') or 25)
    if fm < 5 or fm > 180:
        fm = 25
    presets = _normalize_focus_presets(prefs.get('focus_presets'), fm)
    return {
        'theme': prefs.get('theme') or 'light',
        'focus_minutes': fm,
        'focus_presets': presets,
        'notifications_enabled': bool(prefs.get('notifications_enabled', True)),
    }


def _serialize_student_identity(request, scope: dict) -> dict:
    ogrenci = scope['ogrenci']
    kayit = scope['kayit']
    account = scope['account']
    term = scope['term']
    coach_asgn = scope['coach_assignment']

    coach_payload = None
    if coach_asgn and coach_asgn.coach and coach_asgn.coach.teacher:
        teacher = coach_asgn.coach.teacher
        coach_payload = {
            'coach_id': coach_asgn.coach_id,
            'personel_id': teacher.id,
            'full_name': f'{teacher.ad} {teacher.soyad}'.strip(),
            'photo_url': _file_url(teacher.fotograf, request),
            'start_date': coach_asgn.start_date.isoformat() if coach_asgn.start_date else None,
        }

    sinif = kayit.sinif
    seviye = kayit.sinif_seviyesi or (sinif.sinif_seviyesi if sinif else None)
    alan = kayit.alan

    prefs = account.preferences if isinstance(account.preferences, dict) else {}
    branding = _resolve_portal_branding(request, kayit)
    gamification_mini = None
    if not scope['must_change_password']:
        try:
            ach = build_student_achievements(scope, include_leaderboard=False)
            gamification_mini = {
                'level': ach['level'],
                'pinned_badge': ach['pinned_badge'],
                'unlocked_count': ach['summary']['unlocked_count'],
                'total_count': ach['summary']['total_count'],
            }
        except Exception:
            gamification_mini = None
    return {
        'student': {
            'id': ogrenci.id,
            'first_name': ogrenci.ad,
            'last_name': ogrenci.soyad,
            'full_name': ogrenci.tam_ad,
            'okul_no': kayit.okul_no or '',
            'photo_url': _file_url(ogrenci.profil_foto, request),
            'telefon': ogrenci.telefon or '',
            'email': ogrenci.email or scope['user'].email or '',
            'dogum_tarihi': ogrenci.dogum_tarihi.isoformat() if ogrenci.dogum_tarihi else None,
            'kayit_turu': ogrenci.kayit_turu or 'asil',
            'school_name': (kayit.school.ad if kayit.school else '') or kayit.geldigi_okul or '',
            'sinif': {'id': sinif.id, 'name': sinif.ad} if sinif else None,
            'sinif_seviyesi': {'id': seviye.id, 'name': seviye.ad} if seviye else None,
            'alan': {'id': alan.id, 'name': alan.ad} if alan else None,
        },
        'institution': {
            'kurum_id': kayit.kurum_id,
            'kurum_name': kayit.kurum.ad if kayit.kurum else '',
            'sube_id': kayit.sube_id,
            'sube_name': kayit.sube.ad if kayit.sube else '',
            'egitim_yili_id': kayit.egitim_yili_id,
            'egitim_yili_name': kayit.egitim_yili.yil_str if kayit.egitim_yili else '',
            'branding': branding,
        },
        'active_term': {
            'id': term.id,
            'name': term.name,
            'code': term.code,
            'start_date': term.start_date.isoformat(),
            'end_date': term.end_date.isoformat(),
        } if term else None,
        'terms': [
            {
                'id': t.id,
                'name': t.name,
                'code': t.code,
                'start_date': t.start_date.isoformat(),
                'end_date': t.end_date.isoformat(),
            }
            for t in scope['terms']
        ],
        'coach': coach_payload,
        'must_change_password': scope['must_change_password'],
        'username': scope['user'].username,
        'preferences': _serialize_preferences(prefs),
        'gamification': gamification_mini,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 1. Kimlik, Tercihler ve İlk Giriş Şifre Değiştirme
# ─────────────────────────────────────────────────────────────────────────────

@ensure_csrf_cookie
@require_GET
@student_endpoint
def student_me_api(request, scope: dict):
    return JsonResponse({
        'success': True,
        'data': _serialize_student_identity(request, scope),
    })


@ensure_csrf_cookie
@require_GET
def student_bootstrap_api(request):
    return student_endpoint(
        lambda req, scope: JsonResponse({
            'success': True,
            'data': _serialize_student_identity(req, scope),
        }),
        allow_password_gate=True,
    )(request)


@csrf_exempt
@require_http_methods(['PATCH', 'POST'])
@student_endpoint
def student_preferences_api(request, scope: dict):
    body = parse_json_body(request)
    account = scope['account']
    prefs = dict(account.preferences) if isinstance(account.preferences, dict) else {}

    if 'theme' in body:
        theme = str(body.get('theme') or '').strip().lower()
        if theme in ('light', 'dark', 'system'):
            prefs['theme'] = theme

    if 'focus_presets' in body:
        raw_list = body.get('focus_presets')
        if not isinstance(raw_list, list) or len(raw_list) == 0:
            raise StudentPortalError('validation_error', 'En az bir odak süresi bulunmalıdır.', 400)
        if len(raw_list) > 8:
            raise StudentPortalError('validation_error', 'En fazla 8 hazır odak süresi kaydedebilirsiniz.', 400)
        parsed_list: list[int] = []
        for item in raw_list:
            try:
                iv = int(item)
            except (TypeError, ValueError):
                raise StudentPortalError('validation_error', 'Odak süreleri sayı olmalıdır.', 400)
            if iv < 5 or iv > 180:
                raise StudentPortalError('validation_error', 'Her odak süresi 5 ile 180 dakika arasında olmalıdır.', 400)
            if iv not in parsed_list:
                parsed_list.append(iv)
        parsed_list.sort()
        prefs['focus_presets'] = parsed_list
        if 'focus_minutes' not in body and int(prefs.get('focus_minutes') or 25) not in parsed_list:
            prefs['focus_minutes'] = parsed_list[0]

    if 'focus_minutes' in body:
        try:
            fm = int(body['focus_minutes'])
        except (TypeError, ValueError):
            raise StudentPortalError('validation_error', 'Odak süresi sayı olmalıdır.', 400)
        if fm < 5 or fm > 180:
            raise StudentPortalError('validation_error', 'Odak süresi 5 ile 180 dakika arasında olmalıdır.', 400)
        prefs['focus_minutes'] = fm
        prefs['focus_presets'] = _normalize_focus_presets(prefs.get('focus_presets'), fm)

    if 'notifications_enabled' in body:
        prefs['notifications_enabled'] = bool(body['notifications_enabled'])

    account.preferences = prefs
    account.save(update_fields=['preferences', 'updated_at'])

    return JsonResponse({
        'success': True,
        'data': _serialize_preferences(prefs),
    })


@csrf_exempt
@require_POST
def student_first_password_api(request):
    def _handle(req, scope: dict):
        body = parse_json_body(req)
        user = scope['user']
        current_password = body.get('current_password') or ''
        new_password = body.get('new_password') or ''
        new_password_confirm = body.get('new_password_confirm') or ''

        if not new_password:
            raise StudentPortalError('validation_error', 'Yeni şifre gereklidir.', 400)
        if new_password != new_password_confirm:
            raise StudentPortalError('validation_error', 'Yeni şifreler eşleşmiyor.', 400)

        if not scope['must_change_password']:
            if not current_password:
                raise StudentPortalError('validation_error', 'Mevcut şifrenizi girmelisiniz.', 400)
            verified = authenticate(req, username=user.username, password=current_password)
            if verified is None:
                raise StudentPortalError('invalid_password', 'Mevcut şifre hatalı.', 400)
        elif current_password:
            verified = authenticate(req, username=user.username, password=current_password)
            if verified is None:
                raise StudentPortalError('invalid_password', 'Mevcut şifre hatalı.', 400)

        try:
            validate_password(new_password, user=user)
        except ValidationError as exc:
            raise StudentPortalError('weak_password', ' '.join(exc.messages), 400)

        user.set_password(new_password)
        user.save(update_fields=['password'])

        try:
            ur = user.user_role
            if ur and ur.must_change_password:
                ur.must_change_password = False
                ur.save(update_fields=['must_change_password'])
        except Exception:
            pass

        login(req, user)
        scope['must_change_password'] = False
        return JsonResponse({
            'success': True,
            'message': 'Şifreniz başarıyla güncellendi.',
            'data': _serialize_student_identity(req, scope),
        })

    return student_endpoint(_handle, allow_password_gate=True)(request)


# ─────────────────────────────────────────────────────────────────────────────
# 2. Yaşayan Ana Ekran ve Cmd+K Komut Paleti
# ─────────────────────────────────────────────────────────────────────────────

@require_GET
@student_endpoint
def student_home_api(request, scope: dict):
    return JsonResponse({
        'success': True,
        'data': build_living_home(scope),
    })


@require_GET
@student_endpoint
def student_command_palette_api(request, scope: dict):
    """PC / Tablet `Cmd+K` hızlı komut paleti için sınav, ders notu, konu ve görev dizini."""
    courses = build_courses_and_notes(scope)
    exams = build_student_exams_overview(scope)
    study = build_study_workspace(scope)

    items = []
    for ex in exams['exams'][:20]:
        items.append({
            'id': f"exam-{ex['exam_id']}",
            'category': 'Sınavlar',
            'title': ex['exam_name'],
            'subtitle': f"{ex['exam_type_label']} · {ex['total_net']} Net",
            'href': f"/ogrenci/sinavlar?exam={ex['exam_id']}",
        })
    for note in courses['notes'][:25]:
        items.append({
            'id': f"note-{note['id']}",
            'category': 'Ders Notları',
            'title': note['title'],
            'subtitle': f"{note['course_name']} · {note['teacher_name']}",
            'href': f"/ogrenci/dersler?note={note['id']}",
            'note_id': note['id'],
        })
    for top in courses['topics'][:25]:
        items.append({
            'id': f"topic-{top['id']}",
            'category': 'İşlenen Konular',
            'title': top['topic'],
            'subtitle': f"{top['course_name']} · {top['date']}",
            'href': '/ogrenci/dersler?tab=konular',
        })
    if study['active_program']:
        for day in study['active_program']['days']:
            for blk in day['blocks']:
                if not blk['is_completed']:
                    items.append({
                        'id': f"block-{blk['id']}",
                        'category': 'Çalışma Görevleri',
                        'title': f"{blk['subject']} — {blk['topic'] or blk['task_type_label']}",
                        'subtitle': f"{day['day_label']} · {blk['duration_minutes']} dk",
                        'href': '/ogrenci/calisma',
                        'focus_block': blk,
                    })
    for hw in study.get('assignments', [])[:20]:
        items.append({
            'id': f"hw-{hw['id']}",
            'category': 'Koç Ödevleri',
            'title': hw['title'],
            'subtitle': f"{hw['subject']} · {hw['ready_task_count']}/{hw['task_count']} test · {hw['status_label']}",
            'href': f"/ogrenci/calisma?tab=odevler&assignment={hw['id']}",
        })

    return JsonResponse({'success': True, 'data': {'items': items}})


# ─────────────────────────────────────────────────────────────────────────────
# 3. Takvim, Dersler, Google Drive PDF Notlar, Kaynaklar ve Kampüs Yaşamı
# ─────────────────────────────────────────────────────────────────────────────

@require_GET
@student_endpoint
def student_schedule_api(request, scope: dict):
    today = timezone.localtime(timezone.now(), ISTANBUL).date()
    monday = today - timedelta(days=today.weekday())
    start_date = _parse_iso_date(request.GET.get('start'), monday)
    end_date = _parse_iso_date(request.GET.get('end'), start_date + timedelta(days=6))
    return JsonResponse({
        'success': True,
        'data': build_unified_schedule(scope, start_date, end_date),
    })


@require_GET
@student_endpoint
def student_courses_api(request, scope: dict):
    return JsonResponse({
        'success': True,
        'data': build_courses_and_notes(scope),
    })


@require_GET
@student_endpoint
def student_note_preview_api(request, scope: dict, note_id: int):
    return JsonResponse({
        'success': True,
        'data': get_student_note_preview_catalog(scope, note_id),
    })


@require_GET
@student_endpoint
def student_note_preview_page_api(request, scope: dict, note_id: int, page_no: int):
    page = get_student_note_preview_page(scope, note_id, page_no)
    resp = HttpResponse(page['content'], content_type=page['mime'])
    resp['Cache-Control'] = 'private, max-age=300'
    resp['X-Content-Type-Options'] = 'nosniff'
    return resp


@require_GET
@student_endpoint
def student_note_open_api(request, scope: dict, note_id: int):
    file_data = open_student_note_file(scope, note_id)
    resp = HttpResponse(file_data['content'], content_type=file_data['mime'])
    disposition = file_data['disposition']
    if request.GET.get('download') == '1' and disposition.startswith('inline;'):
        disposition = 'attachment;' + disposition[len('inline;'):]
    resp['Content-Disposition'] = disposition
    resp['Cache-Control'] = 'private, max-age=120'
    resp['X-Content-Type-Options'] = 'nosniff'
    return resp


@require_GET
@student_endpoint
def student_campus_api(request, scope: dict):
    return JsonResponse({
        'success': True,
        'data': build_campus_life_and_attendance(scope),
    })


# ─────────────────────────────────────────────────────────────────────────────
# 4. Aktif Çalışma Programı, Tam Ekran Odak Sayacı, Check-in ve Rozetler
# ─────────────────────────────────────────────────────────────────────────────

@require_GET
@student_endpoint
def student_study_program_api(request, scope: dict):
    prog_id = None
    if request.GET.get('program_id'):
        try:
            prog_id = int(request.GET['program_id'])
        except (TypeError, ValueError):
            raise StudentPortalError('validation_error', 'Geçersiz program kimliği.', 400)
    return JsonResponse({
        'success': True,
        'data': build_study_workspace(scope, requested_program_id=prog_id),
    })


@csrf_exempt
@require_POST
@student_endpoint
def student_study_block_complete_api(request, scope: dict, block_id: int):
    body = parse_json_body(request)
    is_completed = bool(body.get('is_completed', True))
    focus_minutes = body.get('focus_minutes_added')
    actual_duration = body.get('actual_duration')
    try:
        fm_int = int(focus_minutes) if focus_minutes is not None else None
        ad_int = int(actual_duration) if actual_duration is not None else None
    except (TypeError, ValueError):
        raise StudentPortalError('validation_error', 'Süre sayısal olmalıdır.', 400)

    data = toggle_or_complete_study_block(
        scope,
        block_id,
        is_completed=is_completed,
        add_duration_minutes=fm_int,
        actual_duration_minutes=ad_int,
    )
    ach_after = build_student_achievements(scope, include_leaderboard=False)
    existing_codes = {b.get('badge_type') or b.get('code') for b in data['earned_badges']}
    merged_badges = list(data['earned_badges'])
    for nb in ach_after.get('newly_unlocked') or []:
        if nb.get('badge_type') not in existing_codes:
            merged_badges.append(nb)
    return JsonResponse({
        'success': True,
        'data': {
            **data,
            'block_id': block_id,
            'is_completed': data['block']['is_completed'],
            'actual_duration': data['block']['actual_duration'],
            'new_badges': merged_badges,
        },
    })


@csrf_exempt
@require_POST
@student_endpoint
def student_study_day_feedback_api(request, scope: dict, day_id: int):
    body = parse_json_body(request)
    if 'struggled' in body:
        struggled = body.get('struggled')
    else:
        diff = str(body.get('difficulty') or '').upper()
        struggled = True if diff == 'ZOR' else (False if diff in ('KOLAY', 'ORTA') else None)

    time_enough = (
        body.get('time_enough')
        if 'time_enough' in body
        else body.get('time_sufficient')
    )
    comment = str(body.get('comment') if 'comment' in body else (body.get('note') or ''))
    data = submit_daily_feedback(
        scope,
        day_id,
        struggled=struggled if isinstance(struggled, bool) else None,
        time_enough=time_enough if isinstance(time_enough, bool) else None,
        unclear_topic=str(body.get('unclear_topic') or ''),
        comment=comment,
    )
    return JsonResponse({'success': True, 'data': data['feedback']})


# ─────────────────────────────────────────────────────────────────────────────
# 4B. Koç Ödevlerim & İçerik Ağacı (`/api/student/assignments/*`)
# ─────────────────────────────────────────────────────────────────────────────

@require_GET
@student_endpoint
def student_assignments_api(request, scope: dict):
    return JsonResponse({
        'success': True,
        'data': list_student_assignments(scope),
    })


@require_GET
@student_endpoint
def student_assignment_detail_api(request, scope: dict, assignment_id: int):
    return JsonResponse({
        'success': True,
        'data': get_student_assignment_detail(scope, assignment_id),
    })


@csrf_exempt
@require_http_methods(['PATCH', 'POST'])
@student_endpoint
def student_assignment_note_api(request, scope: dict, assignment_id: int):
    body = parse_json_body(request)
    data = update_student_assignment_note(
        scope,
        assignment_id,
        student_notes=str(body.get('student_notes') or ''),
    )
    return JsonResponse({'success': True, 'data': data})


@csrf_exempt
@require_http_methods(['PATCH', 'POST'])
@student_endpoint
def student_assignment_task_api(request, scope: dict, task_id: int):
    body = parse_json_body(request)
    prepared = body.get('prepared') if 'prepared' in body else None
    if prepared is not None and not isinstance(prepared, bool):
        prepared = bool(prepared)

    add_mins_raw = body.get('focus_minutes_added')
    actual_mins_raw = body.get('actual_duration_minutes')
    try:
        add_mins = int(add_mins_raw) if add_mins_raw is not None else None
        actual_mins = int(actual_mins_raw) if actual_mins_raw is not None else None
    except (TypeError, ValueError):
        raise StudentPortalError('validation_error', 'Odak süresi sayısal olmalıdır.', 400)

    feedback = str(body.get('student_feedback')) if 'student_feedback' in body else None

    data = update_student_assignment_task(
        scope,
        task_id,
        prepared=prepared,
        add_duration_minutes=add_mins,
        actual_duration_minutes=actual_mins,
        student_feedback=feedback,
    )
    ach_after = build_student_achievements(scope, include_leaderboard=False)
    data['new_badges'] = ach_after.get('newly_unlocked') or []
    return JsonResponse({'success': True, 'data': data})


@require_GET
@student_endpoint
def student_assignment_pdf_api(request, scope: dict, assignment_id: int):
    kind = (request.GET.get('kind') or 'plan').strip().lower()
    orientation = (request.GET.get('orientation') or 'portrait').strip().lower()
    pdf_bytes, filename = render_student_assignment_pdf(
        scope,
        assignment_id,
        kind=kind,
        orientation=orientation,
    )
    resp = HttpResponse(pdf_bytes, content_type='application/pdf')
    disposition = 'attachment' if request.GET.get('download') == '1' else 'inline'
    resp['Content-Disposition'] = f'{disposition}; filename="{filename}"'
    resp['Cache-Control'] = 'private, no-store'
    return resp


# ─────────────────────────────────────────────────────────────────────────────
# 4C. Başarı Vitrini, Seviye/XP ve Şube Haftalık Odak Ligi (`/api/student/achievements/*`)
# ─────────────────────────────────────────────────────────────────────────────

@require_GET
@student_endpoint
def student_achievements_api(request, scope: dict):
    return JsonResponse({
        'success': True,
        'data': build_student_achievements(scope, include_leaderboard=True),
    })


@csrf_exempt
@require_http_methods(['PATCH', 'POST'])
@student_endpoint
def student_achievements_preferences_api(request, scope: dict):
    body = parse_json_body(request)
    pinned = body.get('pinned_badge_code') if 'pinned_badge_code' in body else None
    opt_in = body.get('leaderboard_opt_in') if 'leaderboard_opt_in' in body else None
    if opt_in is not None and not isinstance(opt_in, bool):
        opt_in = bool(opt_in)
    return JsonResponse({
        'success': True,
        'data': update_student_achievement_preferences(
            scope,
            pinned_badge_code=str(pinned) if pinned is not None else None,
            leaderboard_opt_in=opt_in,
        ),
    })


@require_GET
def coach_student_achievements_api(request, student_id: int):
    blocked = ensure_portal_enabled()
    if blocked is not None:
        return blocked

    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return portal_error_response('unauthenticated', 'Oturum açmanız gerekiyor.', 401)

    from apps.ogrenci.domain.models import Ogrenci
    from shared.sube_context import assert_record_sube_access

    student = Ogrenci.objects.filter(pk=student_id).first()
    if student is None:
        return portal_error_response('not_found', 'Öğrenci bulunamadı.', 404)

    sube_err = assert_record_sube_access(request, student.kurum_id, student.sube_id)
    if sube_err is not None:
        return JsonResponse({'success': False, 'error': sube_err['error']}, status=sube_err['status'])

    try:
        return JsonResponse({
            'success': True,
            'data': build_coach_student_achievements_preview(user, student_id),
        })
    except StudentPortalError as exc:
        return portal_error_response(exc.code, exc.message, exc.status)


# ─────────────────────────────────────────────────────────────────────────────
# 5. Sınav Analizi, En Kolay Net Artışı Radarı, Isı Haritası ve Karne PDF
# ─────────────────────────────────────────────────────────────────────────────

@require_GET
@student_endpoint
def student_exams_api(request, scope: dict):
    exam_type = (request.GET.get('exam_type') or '').strip() or None
    return JsonResponse({
        'success': True,
        'data': build_student_exams_overview(scope, exam_type=exam_type),
    })


@require_GET
@student_endpoint
def student_exam_detail_api(request, scope: dict, exam_id: int):
    return JsonResponse({
        'success': True,
        'data': build_student_exam_detail(scope, exam_id),
    })


@require_GET
@student_endpoint
def student_exam_karne_pdf_api(request, scope: dict, exam_id: int):
    pdf_bytes, filename = render_student_exam_karne_pdf(scope, exam_id)
    resp = HttpResponse(pdf_bytes, content_type='application/pdf')
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
    resp['Cache-Control'] = 'private, no-store'
    return resp


# ─────────────────────────────────────────────────────────────────────────────
# 6. Portal İçi Koç Mesajlaşması & Kurum Duyuruları
# ─────────────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
@student_endpoint
def student_messages_api(request, scope: dict):
    if request.method == 'GET':
        mark_read = request.GET.get('mark_read', '1') != '0'
        return JsonResponse({
            'success': True,
            'data': list_student_coach_messages(scope, mark_read=mark_read),
        })
    body = parse_json_body(request)
    msg = send_student_message_to_coach(scope, str(body.get('body') or ''))
    return JsonResponse({'success': True, 'data': msg}, status=201)


@require_GET
@student_endpoint
def student_announcements_api(request, scope: dict):
    return JsonResponse({
        'success': True,
        'data': list_student_announcements(scope),
    })


@csrf_exempt
@require_POST
@student_endpoint
def student_announcements_read_api(request, scope: dict):
    body = parse_json_body(request)
    raw_ids = body.get('ids')
    ids = raw_ids if isinstance(raw_ids, list) else None
    return JsonResponse({
        'success': True,
        'data': mark_announcements_read(scope, ids=ids),
    })


# ─────────────────────────────────────────────────────────────────────────────
# Koç Tarafı (Student360) Portal Mesajlaşma Ucu (`/api/student/coach-threads/<id>/`)
# ─────────────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def coach_portal_thread_api(request, student_id: int):
    blocked = ensure_portal_enabled()
    if blocked is not None:
        return blocked

    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return portal_error_response('unauthenticated', 'Oturum açmanız gerekiyor.', 401)

    from apps.ogrenci.domain.models import Ogrenci
    from shared.sube_context import assert_record_sube_access

    student = Ogrenci.objects.filter(pk=student_id).first()
    if student is None:
        return portal_error_response('not_found', 'Öğrenci bulunamadı.', 404)

    sube_err = assert_record_sube_access(request, student.kurum_id, student.sube_id)
    if sube_err is not None:
        return JsonResponse({'success': False, 'error': sube_err['error']}, status=sube_err['status'])

    try:
        _enforce_csrf_if_unsafe(request)
        if request.method == 'GET':
            return JsonResponse({
                'success': True,
                'data': coach_list_portal_messages(user, student_id),
            })
        body = parse_json_body(request)
        msg = coach_send_portal_message(user, student_id, str(body.get('body') or ''))
        return JsonResponse({'success': True, 'data': msg}, status=201)
    except StudentPortalError as exc:
        return portal_error_response(exc.code, exc.message, exc.status)


# ─────────────────────────────────────────────────────────────────────────────
# Personel / Yönetici Tarafı Öğrenci Hesap Yönetimi (`/ogrenciler/api/<pk>/portal-account/`)
# ─────────────────────────────────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST', 'PATCH'])
def staff_student_portal_account_api(request, pk: int):
    """
    GET   -> `ogrenci.read`  : Öğrencinin portal hesap durumunu getirir
    POST  -> `ogrenci.write` : Hesap oluşturur (`action="create"`) veya şifre sıfırlar (`action="reset_password"`)
    PATCH -> `ogrenci.write` : Portal erişimini açar/kapatır (`is_enabled`)
    """
    from apps.ogrenci.application.services import OgrenciService
    from apps.ogrenci.interfaces.views import _ogrenci_sube_gate, require_ogrenci_api

    @require_ogrenci_api
    def _inner(req, student_pk: int):
        service = OgrenciService()
        ogrenci = service.get_by_id(student_pk)
        if not ogrenci:
            return JsonResponse({'success': False, 'error': 'Öğrenci bulunamadı'}, status=404)

        gate = _ogrenci_sube_gate(req, ogrenci)
        if gate:
            return gate

        try:
            if req.method == 'GET':
                return JsonResponse({
                    'success': True,
                    'data': serialize_portal_account_for_staff(ogrenci),
                })

            body = parse_json_body(req)
            if req.method == 'POST':
                action = (body.get('action') or 'create').strip().lower()
                if action == 'reset_password':
                    account_data, temp_password = reset_portal_password_for_student(ogrenci)
                    return JsonResponse({
                        'success': True,
                        'message': 'Geçici şifre yenilendi.',
                        'data': {
                            **account_data,
                            'temp_password': temp_password,
                        },
                    })

                custom_username = (body.get('username') or '').strip() or None
                account_data, temp_password = create_portal_account_for_student(
                    ogrenci,
                    actor=req.user,
                    custom_username=custom_username,
                )
                return JsonResponse({
                    'success': True,
                    'message': 'Öğrenci portal hesabı oluşturuldu.',
                    'data': {
                        **account_data,
                        'temp_password': temp_password,
                    },
                })

            if 'is_enabled' not in body:
                raise StudentPortalError('validation_error', 'is_enabled alanı gereklidir.', 400)
            account_data = set_portal_account_enabled(ogrenci, enabled=bool(body['is_enabled']))
            return JsonResponse({
                'success': True,
                'message': 'Portal erişim durumu güncellendi.',
                'data': account_data,
            })
        except StudentPortalError as exc:
            return JsonResponse({'success': False, 'code': exc.code, 'error': exc.message}, status=exc.status)

    return _inner(request, pk)
