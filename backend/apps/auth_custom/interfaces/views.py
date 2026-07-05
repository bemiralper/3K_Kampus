"""
Authentication API Views
"""
from django.http import JsonResponse
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.middleware.csrf import get_token
import json

from shared.permissions import user_permission_codes

User = get_user_model()


def _resolve_login_username(raw: str) -> str:
    """
    Giriş alanına yazılan değeri Django username'e çevirir.
    Kullanıcı adı, e-posta veya personel TC kimlik no ile giriş desteklenir.
    """
    identifier = raw.strip()
    if not identifier:
        return identifier

    User = get_user_model()
    if User.objects.filter(username=identifier).exists():
        return identifier

    by_email = User.objects.filter(email__iexact=identifier).values_list('username', flat=True).first()
    if by_email:
        return by_email

    try:
        from apps.personel.domain.models import Personel

        personel = (
            Personel.objects.filter(tc_kimlik_no=identifier, user__isnull=False)
            .select_related('user')
            .first()
        )
        if personel and personel.user:
            return personel.user.username
    except Exception:
        pass

    return identifier


@csrf_exempt
@require_http_methods(["POST"])
def login_api(request):
    """
    Login API endpoint
    """
    try:
        data = json.loads(request.body)
        raw_username = data.get('username', '')
        username = _resolve_login_username(raw_username)
        password = (data.get('password') or '').strip()
        
        if not raw_username.strip() or not password:
            return JsonResponse({
                'success': False,
                'error': 'Kullanıcı adı ve şifre gereklidir'
            }, status=400)
        
        user = authenticate(request, username=username, password=password)
        
        if user is not None:
            if user.is_active:
                login(request, user)
                get_token(request)
                return JsonResponse({
                    'success': True,
                    'user': _build_user_data(user),
                })
            else:
                return JsonResponse({
                    'success': False,
                    'error': 'Bu hesap devre dışı bırakılmış'
                }, status=403)
        else:
            return JsonResponse({
                'success': False,
                'error': 'Geçersiz kullanıcı adı veya şifre'
            }, status=401)
            
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Geçersiz JSON formatı'
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def logout_api(request):
    """
    Logout API endpoint
    """
    try:
        logout(request)
        return JsonResponse({
            'success': True,
            'message': 'Başarıyla çıkış yapıldı'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


def _build_user_data(user):
    """
    Kullanıcı verisini oluştur — rol, personel, koç bilgisi dahil.
    me_api ve login_api'den ortak kullanılır.
    """
    data = {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'full_name': user.get_full_name() or user.username,
        'is_staff': user.is_staff,
        'is_superuser': user.is_superuser,
        'role_code': None,
        'personel_id': None,
        'coach_profile_id': None,
        'personel_fotograf': None,
        'personel_telefon': None,
        'personel_email': None,
        'must_change_password': False,
        'permissions': [],
    }

    # Rol bilgisi (roller.UserRole → OneToOne)
    try:
        user_role = user.user_role  # related_name='user_role'
        if user_role and user_role.role:
            data['role_code'] = user_role.role.code
            data['must_change_password'] = user_role.must_change_password
    except Exception:
        pass

    # Personel bilgisi (personel.Personel.user → OneToOne, related_name='personel')
    try:
        personel = user.personel  # related_name='personel'
        if personel:
            data['personel_id'] = personel.id
            if personel.fotograf:
                data['personel_fotograf'] = personel.fotograf.url
            data['personel_telefon'] = personel.cep_telefon or personel.telefon or ''
            data['personel_email'] = personel.email or user.email or ''
            # Koç profili (coaching.CoachProfile.teacher → OneToOne, related_name='coach_profile')
            try:
                cp = personel.coach_profile
                if cp and cp.is_active and cp.is_coach:
                    data['coach_profile_id'] = cp.id
            except Exception:
                pass
    except Exception:
        pass

    data['permissions'] = sorted(user_permission_codes(user))

    return data


@ensure_csrf_cookie
@require_http_methods(["GET", "PATCH"])
def me_api(request):
    """
    Get / update current user info — rol, personel, koç bilgisi dahil.
    PATCH: username, email, first_name, last_name (+ personel telefon alanları).
    """
    if not request.user.is_authenticated:
        return JsonResponse({
            'success': True,
            'authenticated': False,
            'user': None
        })

    if request.method == 'PATCH':
        return _update_profile(request)

    return JsonResponse({
        'success': True,
        'authenticated': True,
        'user': _build_user_data(request.user),
    })


def _update_profile(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON formatı'}, status=400)

    user = request.user
    update_user_fields = []

    username = (data.get('username') or '').strip()
    if username and username != user.username:
        if User.objects.filter(username=username).exclude(pk=user.pk).exists():
            return JsonResponse({'success': False, 'error': 'Bu kullanıcı adı zaten kullanılıyor.'}, status=400)
        user.username = username
        update_user_fields.append('username')

    if 'email' in data:
        user.email = (data.get('email') or '').strip()
        update_user_fields.append('email')
    if 'first_name' in data:
        user.first_name = (data.get('first_name') or '').strip()
        update_user_fields.append('first_name')
    if 'last_name' in data:
        user.last_name = (data.get('last_name') or '').strip()
        update_user_fields.append('last_name')

    if update_user_fields:
        user.save(update_fields=update_user_fields)

    personel_fields = {}
    for field in ('telefon', 'cep_telefon'):
        if field in data:
            personel_fields[field] = (data.get(field) or '').strip()
    if 'personel_email' in data:
        personel_fields['email'] = (data.get('personel_email') or '').strip()

    if personel_fields:
        try:
            personel = user.personel
            if personel:
                for k, v in personel_fields.items():
                    setattr(personel, k, v)
                personel.save(update_fields=list(personel_fields.keys()))
        except Exception:
            pass

    return JsonResponse({
        'success': True,
        'message': 'Profil güncellendi.',
        'user': _build_user_data(user),
    })


@csrf_exempt
@require_http_methods(["POST"])
def change_password_api(request):
    """Koç / personel kendi şifresini değiştirir."""
    if not request.user.is_authenticated:
        return JsonResponse({
            'success': False,
            'error': 'Oturum açmanız gerekiyor.',
        }, status=401)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Geçersiz JSON formatı',
        }, status=400)

    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')
    new_password_confirm = data.get('new_password_confirm', '')

    if not current_password or not new_password:
        return JsonResponse({
            'success': False,
            'error': 'Mevcut şifre ve yeni şifre gereklidir.',
        }, status=400)

    if new_password != new_password_confirm:
        return JsonResponse({
            'success': False,
            'error': 'Yeni şifreler eşleşmiyor.',
        }, status=400)

    user = authenticate(
        request,
        username=request.user.username,
        password=current_password,
    )
    if user is None:
        return JsonResponse({
            'success': False,
            'error': 'Mevcut şifre hatalı.',
        }, status=400)

    try:
        validate_password(new_password, user=user)
    except ValidationError as exc:
        return JsonResponse({
            'success': False,
            'error': ' '.join(exc.messages),
        }, status=400)

    user.set_password(new_password)
    user.save(update_fields=['password'])

    try:
        user_role = user.user_role
        if user_role and user_role.must_change_password:
            user_role.must_change_password = False
            user_role.save(update_fields=['must_change_password'])
    except Exception:
        pass

    login(request, user)

    return JsonResponse({
        'success': True,
        'message': 'Şifreniz güncellendi.',
        'user': _build_user_data(user),
    })
