"""Google Kişiler bağlantısı ve senkron API."""
from __future__ import annotations

from urllib.parse import quote

from django.http import HttpResponseRedirect
from django.views import View
from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.google_contacts.oauth import (
    CALLBACK_PATH,
    GoogleOAuthError,
    build_authorization_url,
    connect_account,
    credentials_for,
    load_state,
    missing_settings,
    oauth_configured,
    redirect_uri_override,
    safe_return_origin,
    save_app_credentials,
)
from apps.communication.application.google_contacts.sync import (
    account_counts,
    disconnect_account,
    sync_batch,
)
from apps.communication.domain.models import GoogleContactsAccount
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.permissions import CommunicationConfigPermission


def _account_payload(account: GoogleContactsAccount) -> dict:
    return {
        'id': str(account.id),
        'email': account.email,
        'account_type': account.account_type,
        'account_type_label': account.get_account_type_display(),
        'is_default': account.is_default,
        'is_active': account.is_active,
        'connected': bool(account.refresh_token_encrypted) and account.is_active,
        'last_synced_at': account.last_synced_at.isoformat() if account.last_synced_at else None,
        'last_sync_error': account.last_sync_error,
        'last_sync_stats': account.last_sync_stats or {},
        'counts': account_counts(account),
    }


class GoogleContactsStatusView(CommunicationAPIView):
    permission_classes = [CommunicationConfigPermission]

    def get(self, request):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        accounts = GoogleContactsAccount.objects.filter(kurum_id=kurum_id).order_by('-is_default', 'email')
        client_id, _secret, source = credentials_for(kurum_id)
        return Response({
            'oauth_configured': oauth_configured(kurum_id),
            'missing_settings': missing_settings(kurum_id),
            'credential_source': source,
            'client_id': client_id,
            'has_client_secret': 'client_secret' not in missing_settings(kurum_id),
            'redirect_path': CALLBACK_PATH,
            'redirect_uri_override': redirect_uri_override(),
            'accounts': [_account_payload(account) for account in accounts],
        })


class GoogleContactsCredentialsView(CommunicationAPIView):
    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        try:
            save_app_credentials(
                kurum_id=kurum_id,
                client_id=(request.data.get('client_id') or ''),
                client_secret=(request.data.get('client_secret') or ''),
            )
        except GoogleOAuthError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        client_id, _secret, source = credentials_for(kurum_id)
        return Response({
            'oauth_configured': True,
            'credential_source': source,
            'client_id': client_id,
            'has_client_secret': True,
        })


class GoogleContactsConnectView(CommunicationAPIView):
    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        if not oauth_configured(kurum_id):
            return Response(
                {
                    'error': 'Önce istemci kimliği ve sırrını kaydedin.',
                    'missing_settings': missing_settings(kurum_id),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        origin = (request.data.get('origin') or '').strip()
        try:
            authorization_url = build_authorization_url(
                kurum_id=kurum_id,
                user_id=request.user.id,
                origin=origin,
            )
        except GoogleOAuthError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'authorization_url': authorization_url})


class GoogleContactsSyncView(CommunicationAPIView):
    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account_id = request.data.get('account_id') or None
        enqueue = bool(request.data.get('enqueue'))
        retry_failed = bool(request.data.get('retry_failed'))
        try:
            limit = int(request.data.get('limit') or 25)
        except (TypeError, ValueError):
            limit = 25
        if account_id:
            exists = GoogleContactsAccount.objects.filter(kurum_id=kurum_id, id=account_id).exists()
            if not exists:
                return Response({'error': 'Google hesabı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        result = sync_batch(
            kurum_id=kurum_id,
            account_id=account_id,
            limit=limit,
            enqueue=enqueue,
            retry_failed=retry_failed,
        )
        return Response(result)


class GoogleContactsDisconnectView(CommunicationAPIView):
    permission_classes = [CommunicationConfigPermission]

    def post(self, request, account_id):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account = GoogleContactsAccount.objects.filter(kurum_id=kurum_id, id=account_id).first()
        if account is None:
            return Response({'error': 'Google hesabı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            limit = int(request.data.get('limit') or 25)
        except (TypeError, ValueError):
            limit = 25
        result = disconnect_account(
            account,
            purge=bool(request.data.get('purge')),
            limit=limit,
        )
        result['account'] = _account_payload(account)
        return Response(result)


class GoogleContactsCallbackView(View):
    """Google, kullanıcı izin verdikten sonra tarayıcıyı buraya döndürür."""

    def get(self, request):
        state = request.GET.get('state') or ''
        origin = None
        redirect_uri = ''
        kurum_id = None
        user_id = None
        try:
            payload = load_state(state) if state else {}
            origin = payload.get('origin')
            redirect_uri = payload.get('redirect_uri') or ''
            kurum_id = payload.get('kurum_id')
            user_id = payload.get('user_id')
        except GoogleOAuthError as exc:
            return _redirect(None, error=str(exc))

        google_error = request.GET.get('error')
        if google_error:
            description = request.GET.get('error_description') or 'Google bağlantısı iptal edildi.'
            return _redirect(origin, error=description)
        code = request.GET.get('code') or ''
        if not code or not kurum_id or not redirect_uri:
            return _redirect(origin, error='Google yetki kodu alınamadı.')
        try:
            account = connect_account(
                kurum_id=int(kurum_id),
                user_id=int(user_id) if user_id else None,
                code=code,
                redirect_uri=redirect_uri,
            )
        except GoogleOAuthError as exc:
            return _redirect(origin, error=str(exc))
        except Exception:
            return _redirect(origin, error='Google hesabı bağlanamadı.')
        return _redirect(origin, email=account.email)


def _redirect(origin: str | None, *, email: str = '', error: str = '') -> HttpResponseRedirect:
    base = safe_return_origin(origin)
    if error:
        target = f'{base}/admin/iletisim/google-kisiler?google=error&message={quote(error[:180])}'
    else:
        target = f'{base}/admin/iletisim/google-kisiler?google=connected&email={quote(email)}'
    return HttpResponseRedirect(target)
