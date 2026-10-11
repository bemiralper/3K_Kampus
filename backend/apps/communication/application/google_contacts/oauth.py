"""Google OAuth: yetki bağlantısı, token değişimi ve yenileme."""
from __future__ import annotations

import logging
from datetime import timedelta
from urllib.parse import urlencode, urlparse

import httpx
from django.conf import settings
from django.core import signing
from django.utils import timezone

from apps.communication.application.token_crypto import decrypt_access_token, encrypt_access_token

logger = logging.getLogger(__name__)

AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
TOKEN_URL = 'https://oauth2.googleapis.com/token'
USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
CALLBACK_PATH = '/api/communication/google-contacts/oauth/callback/'
STATE_SALT = 'google-contacts-oauth'
STATE_MAX_AGE = 900
SCOPES = (
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/contacts',
)


class GoogleOAuthError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _env_client_id() -> str:
    return (getattr(settings, 'GOOGLE_CONTACTS_CLIENT_ID', '') or '').strip()


def _env_client_secret() -> str:
    return (getattr(settings, 'GOOGLE_CONTACTS_CLIENT_SECRET', '') or '').strip()


def credentials_for(kurum_id: int) -> tuple[str, str, str]:
    """İstemci kimliği, sır ve kaynak. Sayfa kaydı sunucu ortamının önüne geçer."""
    from apps.communication.domain.models import GoogleContactsAppCredential

    row = GoogleContactsAppCredential.objects.filter(kurum_id=kurum_id).first()
    if row and (row.client_id or '').strip() and (row.client_secret_encrypted or '').strip():
        secret = decrypt_access_token(row.client_secret_encrypted).strip()
        if secret:
            return row.client_id.strip(), secret, 'database'
    client_id = _env_client_id()
    secret = _env_client_secret()
    if client_id and secret:
        return client_id, secret, 'environment'
    return '', '', 'none'


def oauth_configured(kurum_id: int | None = None) -> bool:
    if kurum_id is not None:
        client_id, secret, _source = credentials_for(kurum_id)
        return bool(client_id and secret)
    return bool(_env_client_id() and _env_client_secret())


def missing_settings(kurum_id: int | None = None) -> list[str]:
    if kurum_id is not None:
        client_id, secret, _source = credentials_for(kurum_id)
    else:
        client_id, secret = _env_client_id(), _env_client_secret()
    missing = []
    if not client_id:
        missing.append('client_id')
    if not secret:
        missing.append('client_secret')
    return missing


def save_app_credentials(*, kurum_id: int, client_id: str, client_secret: str = '') -> None:
    from apps.communication.domain.models import GoogleContactsAppCredential

    client_id = (client_id or '').strip()
    if not client_id:
        raise GoogleOAuthError('İstemci kimliği gerekli.')
    secret = (client_secret or '').strip()
    row = GoogleContactsAppCredential.objects.filter(kurum_id=kurum_id).first()
    if not secret and row and row.client_secret_encrypted:
        secret = decrypt_access_token(row.client_secret_encrypted).strip()
    if not secret:
        _current_id, current_secret, _source = credentials_for(kurum_id)
        if current_secret and (not row or not row.client_secret_encrypted):
            secret = current_secret
    if not secret:
        raise GoogleOAuthError('İstemci sırrı gerekli.')
    if row is None:
        row = GoogleContactsAppCredential(kurum_id=kurum_id)
    row.client_id = client_id[:255]
    row.client_secret_encrypted = encrypt_access_token(secret)
    row.save()


def redirect_uri_override() -> str:
    return (getattr(settings, 'GOOGLE_CONTACTS_REDIRECT_URI', '') or '').strip()


def normalize_origin(origin: str) -> str:
    parsed = urlparse((origin or '').strip())
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise GoogleOAuthError('Geçersiz site adresi.')
    return f'{parsed.scheme}://{parsed.netloc}'.rstrip('/')


def origin_allowed(origin: str) -> bool:
    try:
        normalized = normalize_origin(origin)
    except GoogleOAuthError:
        return False
    allowed = {item.rstrip('/') for item in getattr(settings, 'CSRF_TRUSTED_ORIGINS', []) if item}
    frontend = (getattr(settings, 'FRONTEND_URL', '') or '').strip().rstrip('/')
    if frontend:
        allowed.add(frontend)
    override = redirect_uri_override()
    if override:
        allowed.add(normalize_origin(override))
    if normalized in allowed:
        return True
    if getattr(settings, 'DEBUG', False):
        host = urlparse(normalized).hostname or ''
        if host in ('localhost', '127.0.0.1') or host.startswith('192.168.') or host.startswith('10.'):
            return True
    return False


def callback_uri(origin: str) -> str:
    override = redirect_uri_override()
    if override:
        return override
    return normalize_origin(origin) + CALLBACK_PATH


def safe_return_origin(origin: str | None) -> str:
    if origin and origin_allowed(origin):
        return normalize_origin(origin)
    frontend = (getattr(settings, 'FRONTEND_URL', '') or 'http://localhost:3000').strip()
    return frontend.rstrip('/')


def build_authorization_url(*, kurum_id: int, user_id: int, origin: str) -> str:
    client_id, _secret, _source = credentials_for(kurum_id)
    if not client_id or not oauth_configured(kurum_id):
        raise GoogleOAuthError('Google istemci bilgileri bu sayfadan henüz kaydedilmedi.')
    if not origin_allowed(origin):
        raise GoogleOAuthError('Bu adres için Google bağlantısına izin verilmiyor.')
    redirect_uri = callback_uri(origin)
    state = signing.dumps(
        {
            'kurum_id': int(kurum_id),
            'user_id': int(user_id),
            'origin': normalize_origin(origin),
            'redirect_uri': redirect_uri,
        },
        salt=STATE_SALT,
    )
    query = urlencode({
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': ' '.join(SCOPES),
        'access_type': 'offline',
        'prompt': 'consent',
        'include_granted_scopes': 'true',
        'state': state,
    })
    return f'{AUTH_URL}?{query}'


def load_state(state: str) -> dict:
    try:
        payload = signing.loads(state, salt=STATE_SALT, max_age=STATE_MAX_AGE)
    except signing.SignatureExpired as exc:
        raise GoogleOAuthError('Bağlantı süresi doldu. Tekrar deneyin.') from exc
    except signing.BadSignature as exc:
        raise GoogleOAuthError('Bağlantı doğrulanamadı. Tekrar deneyin.') from exc
    if not isinstance(payload, dict) or not payload.get('kurum_id') or not payload.get('redirect_uri'):
        raise GoogleOAuthError('Bağlantı doğrulanamadı. Tekrar deneyin.')
    return payload


def _token_request(data: dict) -> dict:
    try:
        response = httpx.post(TOKEN_URL, data=data, timeout=20)
    except httpx.HTTPError as exc:
        raise GoogleOAuthError('Google token servisine ulaşılamadı.') from exc
    if response.status_code >= 400:
        detail = ''
        try:
            body = response.json()
            detail = body.get('error_description') or body.get('error') or ''
        except Exception:
            detail = response.text[:200]
        raise GoogleOAuthError(detail or 'Google token alınamadı.', response.status_code)
    return response.json()


def _fetch_userinfo(access_token: str) -> dict:
    try:
        response = httpx.get(
            USERINFO_URL,
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=20,
        )
    except httpx.HTTPError as exc:
        raise GoogleOAuthError('Google hesap bilgisi alınamadı.') from exc
    if response.status_code >= 400:
        raise GoogleOAuthError('Google hesap bilgisi alınamadı.', response.status_code)
    return response.json()


def connect_account(*, kurum_id: int, user_id: int | None, code: str, redirect_uri: str):
    from apps.communication.domain.models import GoogleContactsAccount, GoogleContactsAccountType

    client_id, client_secret, _source = credentials_for(kurum_id)
    if not client_id or not client_secret:
        raise GoogleOAuthError('Google istemci bilgileri bu sayfadan henüz kaydedilmedi.')
    token = _token_request({
        'code': code,
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code',
    })
    access = token.get('access_token') or ''
    if not access:
        raise GoogleOAuthError('Google erişim anahtarı dönmedi.')
    profile = _fetch_userinfo(access)
    email = (profile.get('email') or '').strip().lower()
    if not email:
        raise GoogleOAuthError('Google hesabının e-posta adresi okunamadı.')
    refresh = token.get('refresh_token') or ''
    expires_in = int(token.get('expires_in') or 3600)
    account = GoogleContactsAccount.objects.filter(kurum_id=kurum_id, email=email).first()
    if account is None:
        has_default = GoogleContactsAccount.objects.filter(
            kurum_id=kurum_id, is_default=True, is_active=True,
        ).exists()
        account = GoogleContactsAccount(
            kurum_id=kurum_id,
            email=email,
            account_type=GoogleContactsAccountType.CENTRAL,
            is_default=not has_default,
        )
    elif not refresh:
        refresh = decrypt_access_token(account.refresh_token_encrypted)
    if not refresh:
        raise GoogleOAuthError(
            'Google yenileme anahtarı vermedi. Hesabı Google izinlerinden kaldırıp tekrar bağlayın.'
        )
    account.google_sub = str(profile.get('id') or '')[:64]
    account.is_active = True
    account.access_token_encrypted = encrypt_access_token(access)
    account.refresh_token_encrypted = encrypt_access_token(refresh)
    account.token_expires_at = timezone.now() + timedelta(seconds=max(expires_in - 60, 30))
    account.scopes = ' '.join(SCOPES)
    account.last_sync_error = ''
    if user_id:
        account.connected_by_id = user_id
    account.save()
    return account


def ensure_access_token(account) -> str:
    """Süresi dolmuşsa refresh token ile yeniler ve düz metin access token döner."""
    access = decrypt_access_token(account.access_token_encrypted)
    expires = account.token_expires_at
    if access and expires and expires > timezone.now() + timedelta(seconds=30):
        return access
    refresh = decrypt_access_token(account.refresh_token_encrypted)
    if not refresh:
        raise GoogleOAuthError('Google hesabının yenileme anahtarı yok. Tekrar bağlayın.')
    client_id, client_secret, _source = credentials_for(account.kurum_id)
    if not client_id or not client_secret:
        raise GoogleOAuthError('Google istemci bilgileri bu sayfadan henüz kaydedilmedi.')
    token = _token_request({
        'client_id': client_id,
        'client_secret': client_secret,
        'refresh_token': refresh,
        'grant_type': 'refresh_token',
    })
    access = token.get('access_token') or ''
    if not access:
        raise GoogleOAuthError('Google erişim anahtarı yenilenemedi.')
    expires_in = int(token.get('expires_in') or 3600)
    account.access_token_encrypted = encrypt_access_token(access)
    account.token_expires_at = timezone.now() + timedelta(seconds=max(expires_in - 60, 30))
    new_refresh = token.get('refresh_token') or ''
    update_fields = ['access_token_encrypted', 'token_expires_at', 'updated_at']
    if new_refresh:
        account.refresh_token_encrypted = encrypt_access_token(new_refresh)
        update_fields.append('refresh_token_encrypted')
    account.save(update_fields=update_fields)
    return access
