"""
Öğrenci Portalı — Kimlik doğrulama, kapsam izolasyonu ve personel hesap yönetimi.
"""
from __future__ import annotations

import re
import secrets
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.middleware.csrf import CsrfViewMiddleware
from django.utils import timezone

from apps.coaching.models import CoachStudentAssignment
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.roller.models import Role, UserRole
from apps.term.domain.models import Term

from .models import StudentPortalAccount

User = get_user_model()
ISTANBUL = ZoneInfo('Europe/Istanbul')

STUDENT_INACTIVE_ERROR = 'Öğrenci kaydınız pasif durumda olduğu için portala giriş yapılamaz.'
STUDENT_NO_ENROLLMENT_ERROR = 'Aktif dönem öğrenci kaydınız bulunmadığı için portala giriş yapılamaz.'
STUDENT_PORTAL_DISABLED_FOR_USER = 'Öğrenci portal erişiminiz kurum tarafından kapatılmış.'


class StudentPortalError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def portal_error_response(code: str, message: str, status: int = 400) -> JsonResponse:
    return JsonResponse(
        {'success': False, 'code': code, 'error': message, 'message': message},
        status=status,
    )


def ensure_portal_enabled() -> JsonResponse | None:
    if not getattr(settings, 'STUDENT_PORTAL_ENABLED', True):
        return portal_error_response('not_found', 'Öğrenci portalı şu anda kapalı.', 404)
    return None


def is_student_role_user(user) -> bool:
    if not user or not getattr(user, 'pk', None):
        return False
    try:
        ur = user.user_role
        if ur and ur.role and (ur.role.code or '').strip().lower() == 'ogrenci':
            return True
    except Exception:
        pass
    return StudentPortalAccount.objects.filter(user_id=user.pk).exists()


def _active_enrollment_qs(ogrenci_id: int):
    qs = OgrenciKayit.objects.filter(ogrenci_id=ogrenci_id, aktif_mi=True).select_related(
        'egitim_yili', 'sinif', 'sinif__sinif_seviyesi', 'sinif__alan', 'sinif_seviyesi', 'alan', 'kurum', 'sube', 'school',
    )
    active_year_qs = qs.filter(egitim_yili__aktif_mi=True)
    if active_year_qs.exists():
        return active_year_qs.order_by('-egitim_yili__baslangic_yil', '-id')
    return qs.order_by('-egitim_yili__baslangic_yil', '-id')


def student_user_login_allowed(user) -> tuple[bool, str | None]:
    """
    Personel/yönetici/koç kullanıcıları için her zaman (True, None) döner.
    Öğrenci rolündeki kullanıcılar için aktiflik ve kayıt durumunu doğrular.
    """
    if not user:
        return False, 'Geçersiz kullanıcı'
    if not is_student_role_user(user):
        return True, None

    account = (
        StudentPortalAccount.objects.select_related('ogrenci')
        .filter(user_id=user.pk)
        .first()
    )
    if account is None:
        return False, 'Bu hesap aktif bir öğrenci kaydına bağlı değil.'
    if not account.is_enabled:
        return False, STUDENT_PORTAL_DISABLED_FOR_USER
    if not account.ogrenci.aktif_mi:
        return False, STUDENT_INACTIVE_ERROR
    if not _active_enrollment_qs(account.ogrenci_id).exists():
        return False, STUDENT_NO_ENROLLMENT_ERROR
    return True, None


def resolve_student_login_username(raw_identifier: str) -> str | None:
    """
    Öğrenci TC kimlik numarası veya tekil okul numarası ile giriş yaptığında
    bağlı User.username değerini güvenli şekilde döndürür.
    Çoklu kurum/şubede çakışma varsa belirsiz eşleşme yapmaz (None döner).
    """
    identifier = (raw_identifier or '').strip()
    if not identifier:
        return None

    # 1. TC Kimlik No (11 hane) üzerinden aktif portal hesabı
    if len(identifier) == 11 and identifier.isdigit():
        tc_matches = list(
            StudentPortalAccount.objects.filter(
                ogrenci__tc_kimlik_no=identifier,
                ogrenci__aktif_mi=True,
                is_enabled=True,
                user__is_active=True,
            )
            .select_related('user')
            .values_list('user__username', flat=True)[:2]
        )
        if len(tc_matches) == 1:
            return tc_matches[0]

    # 2. Okul numarası üzerinden aktif portal hesabı (yalnızca tekil ise)
    no_matches = list(
        OgrenciKayit.objects.filter(
            okul_no__iexact=identifier,
            aktif_mi=True,
            ogrenci__aktif_mi=True,
            ogrenci__portal_account__is_enabled=True,
            ogrenci__portal_account__user__is_active=True,
        )
        .values_list('ogrenci__portal_account__user__username', flat=True)
        .distinct()[:2]
    )
    if len(no_matches) == 1:
        return no_matches[0]

    return None


def _csrf_dummy_view(_request):
    return HttpResponse()


def _enforce_csrf_if_unsafe(request) -> None:
    if request.method in ('GET', 'HEAD', 'OPTIONS', 'TRACE'):
        return
    rejected = CsrfViewMiddleware(lambda _req: HttpResponse()).process_view(
        request, _csrf_dummy_view, (), {},
    )
    if rejected is not None:
        raise StudentPortalError('csrf_failed', 'Oturum güvenlik doğrulaması başarısız oldu.', 403)


def resolve_student_scope(request, *, allow_password_gate: bool = False) -> dict:
    """
    Her `/api/student/*` isteğinde sunucu tarafında öğrenciyi doğrular.
    İstemciden gelen X-Sube-ID veya student_id parametrelerine ASLA güvenmez.
    """
    if not getattr(settings, 'STUDENT_PORTAL_ENABLED', True):
        raise StudentPortalError('not_found', 'Öğrenci portalı şu anda kapalı.', 404)

    user = getattr(request, 'user', None)
    if user is None or not getattr(user, 'is_authenticated', False) or not user.is_active:
        raise StudentPortalError('unauthenticated', 'Oturum açmanız gerekiyor.', 401)

    _enforce_csrf_if_unsafe(request)

    if not is_student_role_user(user):
        raise StudentPortalError('forbidden', 'Bu alan yalnızca öğrenciler içindir.', 403)

    allowed, reason = student_user_login_allowed(user)
    if not allowed:
        raise StudentPortalError('forbidden', reason or STUDENT_INACTIVE_ERROR, 403)

    account = (
        StudentPortalAccount.objects.select_related('ogrenci', 'ogrenci__kurum', 'ogrenci__sube')
        .filter(user_id=user.pk)
        .first()
    )
    if account is None:
        raise StudentPortalError('forbidden', 'Öğrenci portalı kaydı bulunamadı.', 403)

    must_change_password = False
    try:
        ur = user.user_role
        if ur and ur.must_change_password:
            must_change_password = True
    except Exception:
        pass

    if must_change_password and not allow_password_gate:
        raise StudentPortalError(
            'must_change_password',
            'Devam etmeden önce geçici şifrenizi değiştirmeniz gerekiyor.',
            403,
        )

    kayit = _active_enrollment_qs(account.ogrenci_id).first()
    if kayit is None:
        raise StudentPortalError('forbidden', STUDENT_NO_ENROLLMENT_ERROR, 403)

    today = timezone.localtime(timezone.now(), ISTANBUL).date()
    terms_qs = Term.objects.filter(
        kurum_id=kayit.kurum_id,
        sube_id=kayit.sube_id,
        egitim_yili_id=kayit.egitim_yili_id,
        is_active=True,
    ).order_by('order_no', 'start_date', 'id')
    terms = list(terms_qs)

    requested_term_id = request.GET.get('term_id')
    active_term = None
    if requested_term_id:
        try:
            tid = int(requested_term_id)
            active_term = next((t for t in terms if t.id == tid), None)
        except (TypeError, ValueError):
            active_term = None

    if active_term is None:
        active_term = next(
            (t for t in terms if t.start_date <= today <= t.end_date),
            None,
        )
    if active_term is None and terms:
        active_term = terms[-1]

    coach_assignment = (
        CoachStudentAssignment.objects.filter(
            student_id=account.ogrenci_id,
            is_primary=True,
            end_date__isnull=True,
            coach__is_active=True,
        )
        .select_related('coach', 'coach__teacher', 'coach__teacher__user')
        .first()
    )

    now = timezone.now()
    if account.last_seen_at is None or (now - account.last_seen_at) > timedelta(minutes=5):
        StudentPortalAccount.objects.filter(pk=account.pk).update(last_seen_at=now)
        account.last_seen_at = now

    return {
        'user': user,
        'account': account,
        'ogrenci': account.ogrenci,
        'kayit': kayit,
        'kurum_id': kayit.kurum_id,
        'sube_id': kayit.sube_id,
        'egitim_yili_id': kayit.egitim_yili_id,
        'term': active_term,
        'terms': terms,
        'coach_assignment': coach_assignment,
        'must_change_password': must_change_password,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Personel / Yönetici Tarafı Öğrenci Portal Hesabı Yönetimi
# ─────────────────────────────────────────────────────────────────────────────

def ensure_student_role() -> Role:
    role = Role.objects.filter(code__iexact='ogrenci').first()
    if role is not None:
        return role
    return Role.objects.create(
        code='ogrenci',
        name='Öğrenci',
        description='Öğrenci portalı — sınırlı erişim',
        level=1000,
        is_system_role=True,
        is_active=True,
    )


def generate_student_temp_password() -> str:
    """Telefonda kolay yazılan, karışmayan karakterlerden oluşan güvenli geçici şifre."""
    upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    lower = 'abcdefghijkmnopqrstuvwxyz'
    digits = '23456789'
    part_a = ''.join(secrets.choice(upper) for _ in range(2))
    part_b = ''.join(secrets.choice(lower) for _ in range(3))
    part_c = ''.join(secrets.choice(digits) for _ in range(4))
    return f'{part_a}{part_b}!{part_c}'


def _clean_slug(raw: str) -> str:
    cleaned = re.sub(r'[^a-z0-9_]', '', (raw or '').strip().lower())
    return cleaned[:24]


def suggest_student_username(ogrenci: Ogrenci) -> str:
    """Öğrenci için benzersiz kullanıcı adı üretir."""
    if ogrenci.tc_kimlik_no and not User.objects.filter(username=ogrenci.tc_kimlik_no).exists():
        return ogrenci.tc_kimlik_no

    kayit = _active_enrollment_qs(ogrenci.id).first()
    kurum_kod = _clean_slug(getattr(ogrenci.kurum, 'kod', '') or '')
    okul_no = _clean_slug(kayit.okul_no if kayit else '')

    candidates = []
    if kurum_kod and okul_no:
        candidates.append(f'{kurum_kod}.{okul_no}')
    if okul_no:
        candidates.append(f'ogr.{okul_no}')
    candidates.append(f'ogrenci.{ogrenci.id}')

    for base in candidates:
        if not User.objects.filter(username=base).exists():
            return base

    suffix = 2
    while User.objects.filter(username=f'ogrenci.{ogrenci.id}.{suffix}').exists():
        suffix += 1
    return f'ogrenci.{ogrenci.id}.{suffix}'


def serialize_portal_account_for_staff(ogrenci: Ogrenci) -> dict:
    account = (
        StudentPortalAccount.objects.select_related('user')
        .filter(ogrenci_id=ogrenci.id)
        .first()
    )
    kayit = _active_enrollment_qs(ogrenci.id).first()
    if account is None:
        return {
            'has_account': False,
            'suggested_username': suggest_student_username(ogrenci),
            'student_active': bool(ogrenci.aktif_mi and kayit is not None),
            'tc_kimlik_no': ogrenci.tc_kimlik_no or '',
            'okul_no': kayit.okul_no if kayit else '',
        }

    must_change = False
    try:
        ur = account.user.user_role
        must_change = bool(ur and ur.must_change_password)
    except Exception:
        pass

    can_login, block_reason = student_user_login_allowed(account.user)
    return {
        'has_account': True,
        'username': account.user.username,
        'is_enabled': account.is_enabled,
        'user_is_active': account.user.is_active,
        'can_login': can_login,
        'block_reason': block_reason,
        'must_change_password': must_change,
        'last_login': account.user.last_login.isoformat() if account.user.last_login else None,
        'last_seen_at': account.last_seen_at.isoformat() if account.last_seen_at else None,
        'created_at': account.created_at.isoformat() if account.created_at else None,
        'tc_kimlik_no': ogrenci.tc_kimlik_no or '',
        'okul_no': kayit.okul_no if kayit else '',
    }


@transaction.atomic
def create_portal_account_for_student(
    ogrenci: Ogrenci,
    *,
    actor=None,
    custom_username: str | None = None,
) -> tuple[dict, str]:
    existing = StudentPortalAccount.objects.filter(ogrenci_id=ogrenci.id).first()
    if existing is not None:
        raise StudentPortalError('already_exists', 'Bu öğrencinin zaten bir portal hesabı bulunuyor.', 400)

    if not ogrenci.aktif_mi:
        raise StudentPortalError('student_inactive', 'Pasif öğrenci için portal hesabı açılamaz.', 400)

    if not _active_enrollment_qs(ogrenci.id).exists():
        raise StudentPortalError(
            'no_enrollment',
            'Öğrencinin aktif eğitim yılı kaydı olmadan portal hesabı açılamaz.',
            400,
        )

    username = (custom_username or '').strip() or suggest_student_username(ogrenci)
    if len(username) < 3 or len(username) > 150 or ' ' in username:
        raise StudentPortalError(
            'invalid_username',
            'Kullanıcı adı boşluk içermemeli ve en az 3 karakter olmalıdır.',
            400,
        )
    if User.objects.filter(username=username).exists():
        raise StudentPortalError('username_taken', f'"{username}" kullanıcı adı zaten kullanılıyor.', 400)

    temp_password = generate_student_temp_password()
    user = User.objects.create_user(
        username=username,
        email=ogrenci.email or '',
        password=temp_password,
        first_name=ogrenci.ad,
        last_name=ogrenci.soyad,
        is_active=True,
    )
    role = ensure_student_role()
    UserRole.objects.update_or_create(
        user=user,
        defaults={
            'role': role,
            'kurum_id': ogrenci.kurum_id,
            'must_change_password': True,
            'assigned_by': actor if getattr(actor, 'is_authenticated', False) else None,
        },
    )
    StudentPortalAccount.objects.create(
        user=user,
        ogrenci=ogrenci,
        kurum_id=ogrenci.kurum_id,
        is_enabled=True,
        created_by=actor if getattr(actor, 'is_authenticated', False) else None,
    )
    return serialize_portal_account_for_staff(ogrenci), temp_password


@transaction.atomic
def reset_portal_password_for_student(ogrenci: Ogrenci) -> tuple[dict, str]:
    account = (
        StudentPortalAccount.objects.select_related('user')
        .filter(ogrenci_id=ogrenci.id)
        .first()
    )
    if account is None:
        raise StudentPortalError('not_found', 'Bu öğrencinin henüz bir portal hesabı yok.', 404)

    temp_password = generate_student_temp_password()
    account.user.set_password(temp_password)
    account.user.is_active = True
    account.user.save(update_fields=['password', 'is_active'])

    role = ensure_student_role()
    UserRole.objects.update_or_create(
        user=account.user,
        defaults={
            'role': role,
            'kurum_id': ogrenci.kurum_id,
            'must_change_password': True,
        },
    )
    return serialize_portal_account_for_staff(ogrenci), temp_password


@transaction.atomic
def set_portal_account_enabled(ogrenci: Ogrenci, *, enabled: bool) -> dict:
    account = (
        StudentPortalAccount.objects.select_related('user')
        .filter(ogrenci_id=ogrenci.id)
        .first()
    )
    if account is None:
        raise StudentPortalError('not_found', 'Bu öğrencinin henüz bir portal hesabı yok.', 404)

    account.is_enabled = bool(enabled)
    account.save(update_fields=['is_enabled', 'updated_at'])
    return serialize_portal_account_for_staff(ogrenci)
