"""Mobil oturum. Web `login()` çağrılmaz."""
from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.contrib.auth import authenticate, get_user_model
from django.core import signing
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.auth_custom.application.portals import portals_payload
from apps.auth_custom.interfaces.views import (
    INACTIVE_ACCOUNT_LOGIN_ERROR,
    INACTIVE_PERSONEL_LOGIN_ERROR,
    _resolve_login_username,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.personel.application.activity_log import log_personel_activity
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.personel.domain.user_account import personel_user_login_allowed
from apps.sube.domain.models import Sube
from shared.kurum_access import user_can_access_kurum

from .models import MobileDeviceSession, MobileRefreshToken
from .tokens import ACCESS_MAX_AGE, issue_access_token, read_access_token

User = get_user_model()

REFRESH_DAYS = 30
LOGIN_FAIL_LIMIT = 10
LOGIN_FAIL_WINDOW = 15 * 60
PORTAL_TEACHER = 'teacher'


class MobileAuthError(Exception):
    def __init__(self, code: str, message: str, status: int):
        self.code = code
        self.message = message
        self.status = status


def _hash_secret(raw: str) -> str:
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def _login_cache_key(request, username: str) -> str:
    ip = request.META.get('REMOTE_ADDR') or ''
    return f'mobile-login:{ip}:{username[:80]}'


def _reject_if_rate_limited(request, username: str) -> None:
    if cache.get(_login_cache_key(request, username), 0) >= LOGIN_FAIL_LIMIT:
        raise MobileAuthError(
            'rate_limited',
            'Çok fazla deneme. Bir süre sonra yeniden deneyin.',
            429,
        )


def _note_login_failure(request, username: str) -> None:
    key = _login_cache_key(request, username)
    cache.set(key, cache.get(key, 0) + 1, LOGIN_FAIL_WINDOW)


def _clear_login_failures(request, username: str) -> None:
    cache.delete(_login_cache_key(request, username))


def _active_user(user) -> None:
    if user is None or not personel_user_login_allowed(user):
        raise MobileAuthError('forbidden', INACTIVE_PERSONEL_LOGIN_ERROR, 403)
    if not user.is_active:
        raise MobileAuthError('forbidden', INACTIVE_ACCOUNT_LOGIN_ERROR, 403)


def _personel_for(user) -> Personel | None:
    return Personel.objects.filter(user_id=user.pk).first()


def _revoke_session(session: MobileDeviceSession, now=None) -> None:
    now = now or timezone.now()
    if session.revoked_at is None:
        session.revoked_at = now
        session.save(update_fields=['revoked_at', 'last_used_at'])
    MobileRefreshToken.objects.filter(session=session, revoked_at__isnull=True).update(revoked_at=now)


def _issue_refresh(session: MobileDeviceSession) -> str:
    raw = secrets.token_urlsafe(32)
    MobileRefreshToken.objects.create(
        session=session,
        secret_hash=_hash_secret(raw),
        expires_at=timezone.now() + timedelta(days=REFRESH_DAYS),
    )
    return raw


def _token_payload(user, session: MobileDeviceSession, refresh: str) -> dict:
    return {
        'access': issue_access_token(user.pk, session.id),
        'refresh': refresh,
        'expires_in': ACCESS_MAX_AGE,
        'token_type': 'Bearer',
    }


def _replace_device_session(user, device_key: str) -> MobileDeviceSession:
    now = timezone.now()
    previous = MobileDeviceSession.objects.filter(
        user=user,
        device_key=device_key,
        revoked_at__isnull=True,
    )
    previous_ids = list(previous.values_list('id', flat=True))
    previous.update(revoked_at=now)
    if previous_ids:
        MobileRefreshToken.objects.filter(
            session_id__in=previous_ids,
            revoked_at__isnull=True,
        ).update(revoked_at=now)
    return MobileDeviceSession.objects.create(user=user, device_key=device_key)


def login_with_password(request, raw_username: str, password: str, device_key: str) -> dict:
    username = _resolve_login_username(raw_username)
    _reject_if_rate_limited(request, username or raw_username)
    candidate = User.objects.filter(username=username).first()
    if candidate is not None and candidate.check_password(password):
        if not personel_user_login_allowed(candidate) or not candidate.is_active:
            log_personel_activity(
                user=candidate,
                eylem='LOGIN_FAILED',
                request=request,
                detay='Mobil giriş reddedildi',
            )
            _note_login_failure(request, username)
            _active_user(candidate)
    user = authenticate(request, username=username, password=password)
    if user is None:
        if candidate is not None:
            log_personel_activity(
                user=candidate,
                eylem='LOGIN_FAILED',
                request=request,
                detay='Mobil giriş reddedildi',
            )
        _note_login_failure(request, username or raw_username)
        raise MobileAuthError('unauthenticated', 'Geçersiz kullanıcı adı veya şifre', 401)
    try:
        _active_user(user)
    except MobileAuthError:
        log_personel_activity(
            user=user,
            eylem='LOGIN_FAILED',
            request=request,
            detay='Mobil giriş reddedildi',
        )
        _note_login_failure(request, username)
        raise
    _clear_login_failures(request, username)
    session = _replace_device_session(user, device_key)
    refresh = _issue_refresh(session)
    log_personel_activity(
        user=user,
        eylem='LOGIN',
        request=request,
        detay='Mobil giriş',
    )
    return _token_payload(user, session, refresh)


def _lock_refresh(raw: str) -> tuple[MobileRefreshToken, MobileDeviceSession] | None:
    digest = _hash_secret(raw)
    row = (
        MobileRefreshToken.objects.select_for_update()
        .filter(secret_hash=digest)
        .first()
    )
    if row is None:
        return None
    session = MobileDeviceSession.objects.select_for_update().get(pk=row.session_id)
    return row, session


def rotate_refresh(raw: str) -> dict:
    # Reddetme, atomic bloğun içinde yükselirse iptal geri alınır.
    with transaction.atomic():
        locked = _lock_refresh(raw)
        inactive_error = None
        if locked is None:
            decision = 'missing'
            payload = None
        else:
            row, session = locked
            now = timezone.now()
            reused = (
                row.used_at is not None
                or row.revoked_at is not None
                or session.revoked_at is not None
            )
            if reused:
                _revoke_session(session, now)
                decision = 'reused'
                payload = None
            elif row.expires_at <= now:
                decision = 'expired'
                payload = None
            else:
                user = session.user
                try:
                    _active_user(user)
                except MobileAuthError as exc:
                    _revoke_session(session, now)
                    decision = 'inactive'
                    inactive_error = exc
                    payload = None
                else:
                    row.used_at = now
                    row.save(update_fields=['used_at'])
                    refresh = _issue_refresh(session)
                    session.last_used_at = now
                    session.save(update_fields=['last_used_at'])
                    decision = 'ok'
                    payload = _token_payload(user, session, refresh)
    if decision == 'ok':
        return payload
    if decision == 'inactive':
        raise inactive_error
    if decision == 'reused':
        raise MobileAuthError('unauthenticated', 'Oturum kapatıldı. Yeniden giriş yapın.', 401)
    raise MobileAuthError('unauthenticated', 'Oturum geçersiz veya süresi doldu.', 401)


def logout_refresh(raw: str) -> None:
    with transaction.atomic():
        locked = _lock_refresh(raw)
        if locked is None:
            raise MobileAuthError('unauthenticated', 'Oturum geçersiz veya süresi doldu.', 401)
        row, session = locked
        user = session.user
        _revoke_session(session)
        log_personel_activity(
            user=user,
            eylem='LOGOUT',
            request=None,
            detay='Mobil çıkış',
        )


def user_from_access(raw: str):
    try:
        data = read_access_token((raw or '').strip())
    except signing.BadSignature:
        raise MobileAuthError('unauthenticated', 'Oturum geçersiz veya süresi doldu.', 401)
    try:
        user = User.objects.get(pk=data['uid'])
        session = MobileDeviceSession.objects.get(pk=data['sid'], user_id=user.pk)
    except (User.DoesNotExist, MobileDeviceSession.DoesNotExist, ValueError, TypeError):
        raise MobileAuthError('unauthenticated', 'Oturum geçersiz veya süresi doldu.', 401)
    if session.revoked_at is not None:
        raise MobileAuthError('unauthenticated', 'Oturum geçersiz veya süresi doldu.', 401)
    _active_user(user)
    session.last_used_at = timezone.now()
    session.save(update_fields=['last_used_at'])
    return user, session


def _header_int(request, name: str):
    raw = request.headers.get(name)
    if raw is None or str(raw).strip() == '':
        return None
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        raise MobileAuthError('invalid_context', 'Kurum, şube veya eğitim yılı geçersiz.', 400)


def requested_context(request) -> dict:
    kurum_id = _header_int(request, 'X-Kurum-ID')
    sube_id = _header_int(request, 'X-Sube-ID')
    year_id = _header_int(request, 'X-EgitimYili-ID')
    if kurum_id is None and sube_id is None and year_id is None:
        return {'kurum_id': None, 'sube_id': None, 'egitim_yili_id': None}
    if kurum_id is None or sube_id is None or year_id is None:
        raise MobileAuthError('invalid_context', 'Kurum, şube veya eğitim yılı geçersiz.', 400)
    if not user_can_access_kurum(request.mobile_user, kurum_id):
        raise MobileAuthError('invalid_context', 'Kurum, şube veya eğitim yılı geçersiz.', 400)
    sube_ok = Sube.objects.filter(id=sube_id, kurum_id=kurum_id, aktif_mi=True).exists()
    year_ok = EgitimYili.objects.filter(id=year_id).exists()
    if not sube_ok or not year_ok:
        raise MobileAuthError('invalid_context', 'Kurum, şube veya eğitim yılı geçersiz.', 400)
    return {'kurum_id': kurum_id, 'sube_id': sube_id, 'egitim_yili_id': year_id}


def _teacher_assignments(user):
    personel = _personel_for(user)
    if personel is None:
        return PersonelGorevlendirme.objects.none()
    return PersonelGorevlendirme.objects.filter(
        personel=personel,
        aktif_mi=True,
        rol__code='ogretmen',
        rol__is_active=True,
        rol__silindi_mi=False,
    )


def mobile_context(request) -> dict:
    """Öğretmen görevlendirmesinden kurum, şube ve yıl. Web listesini değiştirmez."""
    rows = (
        _teacher_assignments(request.mobile_user)
        .select_related('gorev_sube', 'kurum', 'egitim_yili')
        .order_by('egitim_yili__baslangic_yil', 'kurum__ad', 'gorev_sube__ad', 'id')
    )
    yillar = {}
    kurumlar = {}
    subeler = []
    seen = set()
    for row in rows:
        if row.egitim_yili_id and row.egitim_yili.aktif_mi:
            yillar[row.egitim_yili_id] = {
                'id': row.egitim_yili_id,
                'ad': f'{row.egitim_yili.baslangic_yil}-{row.egitim_yili.bitis_yil}',
                'aktif_mi': True,
            }
        if row.kurum_id and row.kurum.aktif_mi:
            kurumlar[row.kurum_id] = {
                'id': row.kurum_id,
                'ad': row.kurum.ad,
                'kod': row.kurum.kod or '',
                'aktif_mi': True,
            }
        if not row.gorev_sube_id or not row.gorev_sube.aktif_mi:
            continue
        key = (row.kurum_id, row.gorev_sube_id, row.egitim_yili_id)
        if key in seen:
            continue
        seen.add(key)
        subeler.append({
            'id': row.gorev_sube_id,
            'ad': row.gorev_sube.ad,
            'kod': row.gorev_sube.kod or '',
            'aktif_mi': True,
            'kurum_id': row.kurum_id,
            'egitim_yili_id': row.egitim_yili_id,
        })
    return {
        'yillar': list(yillar.values()),
        'kurumlar': list(kurumlar.values()),
        'subeler': subeler,
    }


def change_mobile_password(request, current_password: str, new_password: str, confirm: str) -> None:
    """Web şifre ucuna dokunmaz. Başarılı değişimde mobil oturumlar kapanır."""
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError

    user = request.mobile_user
    if not current_password or not new_password:
        raise MobileAuthError('validation_error', 'Mevcut şifre ve yeni şifre gereklidir.', 400)
    if new_password != confirm:
        raise MobileAuthError('validation_error', 'Yeni şifreler eşleşmiyor.', 400)
    if not user.check_password(current_password):
        raise MobileAuthError('unauthenticated', 'Mevcut şifre hatalı.', 400)
    try:
        validate_password(new_password, user=user)
    except ValidationError as exc:
        raise MobileAuthError('validation_error', ' '.join(exc.messages), 400)
    user.set_password(new_password)
    user.save(update_fields=['password'])
    try:
        user_role = user.user_role
        if user_role and user_role.must_change_password:
            user_role.must_change_password = False
            user_role.save(update_fields=['must_change_password'])
    except Exception:
        pass
    now = timezone.now()
    session_ids = list(
        MobileDeviceSession.objects.filter(user=user, revoked_at__isnull=True).values_list('id', flat=True)
    )
    MobileDeviceSession.objects.filter(id__in=session_ids).update(revoked_at=now)
    if session_ids:
        MobileRefreshToken.objects.filter(session_id__in=session_ids, revoked_at__isnull=True).update(
            revoked_at=now,
        )
    log_personel_activity(
        user=user,
        eylem='PASSWORD_CHANGE',
        request=request,
        detay='Mobil şifre değiştirildi',
    )


def mobile_me(request) -> dict:
    user = request.mobile_user
    personel = _personel_for(user)
    if personel is not None:
        account = {'id': user.pk, 'ad': personel.ad, 'soyad': personel.soyad}
    else:
        account = {
            'id': user.pk,
            'ad': user.first_name or '',
            'soyad': user.last_name or '',
        }
    portals = []
    for item in portals_payload(user):
        portals.append({
            'code': item['code'],
            'label': item['label'],
            'enterable': False,
        })
    if _teacher_assignments(user).exists():
        portals.append({
            'code': PORTAL_TEACHER,
            'label': 'Öğretmen',
            'enterable': True,
        })
    return {
        'account': account,
        'portals': portals,
        'context': requested_context(request),
    }


def _teacher_permission_summary(personel: Personel, kurum_id: int, sube_id: int, year_id: int) -> list[str]:
    codes = ['schedule.read', 'classes.read']
    from apps.academic.domain.class_lesson_plan import ClassLessonPlan

    primary = ClassLessonPlan.objects.filter(
        ogretmen_id=personel.id,
        is_active=True,
        egitim_yili_id=year_id,
        term__kurum_id=kurum_id,
        term__sube_id=sube_id,
    ).exists()
    if primary:
        codes.append('topics.write')
    return codes


def open_teacher_scope(request):
    """Öğretmen okuması. Başlık yetki değildir; görevlendirme yeniden bakılır."""
    portal = (request.headers.get('X-Portal') or '').strip()
    if portal != PORTAL_TEACHER:
        raise MobileAuthError('portal_unavailable', 'Bu portal şu anda açılamaz.', 403)
    context = requested_context(request)
    if context['kurum_id'] is None:
        raise MobileAuthError('invalid_context', 'Kurum, şube veya eğitim yılı geçersiz.', 400)
    personel = _personel_for(request.mobile_user)
    assignment = None
    if personel is not None:
        assignment = (
            _teacher_assignments(request.mobile_user)
            .filter(
                kurum_id=context['kurum_id'],
                gorev_sube_id=context['sube_id'],
                egitim_yili_id=context['egitim_yili_id'],
            )
            .first()
        )
    if personel is None or assignment is None:
        raise MobileAuthError(
            'teacher_not_assigned',
            'Bu şube ve yılda öğretmen görevlendirmesi yok.',
            403,
        )
    return {'personel': personel, 'context': context, 'assignment': assignment}


def teacher_me(request) -> dict:
    scope = open_teacher_scope(request)
    personel = scope['personel']
    assignment = scope['assignment']
    context = scope['context']
    return {
        'personel_id': personel.id,
        'assignment': {
            'id': assignment.id,
            'sube_id': assignment.gorev_sube_id,
            'egitim_yili_id': assignment.egitim_yili_id,
            'rol': 'ogretmen',
        },
        'permissions': _teacher_permission_summary(
            personel,
            context['kurum_id'],
            context['sube_id'],
            context['egitim_yili_id'],
        ),
    }
