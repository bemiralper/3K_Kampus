"""
WhatsApp hesapları CRUD + test + şablon senkronu.
"""
from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.communication.application.account_resolver import AccountResolveError, AccountResolver
from apps.communication.application.app_id_resolver import ensure_account_app_id
from apps.communication.application.token_crypto import decrypt_access_token, encrypt_access_token
from apps.communication.domain.enums import Channel, WhatsAppAccountScope
from apps.communication.domain.models import CommunicationChannelConfig
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
from apps.communication.infrastructure.repository import ChannelConfigRepository
from apps.communication.interfaces.serializers.config import (
    WhatsAppAccountSerializer,
    WhatsAppAccountWriteSerializer,
)
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationConfigPermission, CommunicationModulePermission


def _serialize_account(cfg: CommunicationChannelConfig, *, kurum_id: int | None = None) -> dict:
    data = WhatsAppAccountSerializer(cfg).data
    data['configured'] = bool(cfg.phone_number_id and cfg.access_token_encrypted)
    data['has_token'] = bool(cfg.access_token_encrypted)
    if kurum_id is not None:
        data['kurum_id'] = kurum_id
    return data


def _maybe_fill_app_id(account: CommunicationChannelConfig, *, plain_token: str | None = None) -> None:
    """App ID boşsa token/env ile doldur (kayıt sonrası)."""
    if (account.app_id or '').strip():
        return
    token = plain_token
    if token is None and account.access_token_encrypted:
        token = decrypt_access_token(account.access_token_encrypted)
    if not token and not str(getattr(settings, 'WHATSAPP_APP_ID', '') or ''):
        return
    try:
        ensure_account_app_id(account, access_token=token or '')
    except Exception:
        # Meta erişilemezse kayıt yine de başarılı kalsın
        pass


class WhatsAppAccountListCreateView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        accessible_only = request.query_params.get('accessible') in ('1', 'true', 'yes')
        if accessible_only:
            accounts = AccountResolver.list_accessible(
                kurum_id=kurum_id,
                user=request.user,
                sube_id=sube_id,
                active_only=request.query_params.get('active') in ('1', 'true', 'yes'),
            )
        else:
            active_only = request.query_params.get('active') in ('1', 'true', 'yes')
            accounts = list(ChannelConfigRepository.list_whatsapp(kurum_id, active_only=active_only))

        return Response({
            'accounts': [_serialize_account(a, kurum_id=kurum_id) for a in accounts],
            'total': len(accounts),
        })

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        serializer = WhatsAppAccountWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = dict(serializer.validated_data)
        token = data.pop('access_token', None)
        app_secret = data.pop('app_secret', None)
        role_ids = data.pop('role_ids', None)
        sube_ids = data.pop('sube_ids', None)
        same_meta = bool(data.pop('same_meta_account', False))
        source_account_id = data.pop('source_account_id', None)

        phone_number_id = data.get('phone_number_id', '')
        if phone_number_id and ChannelConfigRepository.phone_number_id_taken(phone_number_id):
            return Response(
                {'error': 'Bu Phone Number ID başka bir aktif hesapta kullanılıyor.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if token:
            data['access_token_encrypted'] = encrypt_access_token(token)
        if app_secret:
            data['app_secret_encrypted'] = encrypt_access_token(app_secret)

        if same_meta:
            source = AccountResolver.source_for_shared_meta(kurum_id, source_account_id)
            if source is None:
                return Response(
                    {'error': 'Aynı Meta hesabından kopyalanacak mevcut WhatsApp hattı bulunamadı.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            data = AccountResolver.apply_shared_meta_credentials(data, source)
            data.setdefault('is_active', True)

        data.setdefault('name', data.get('display_phone') or 'WhatsApp Hesabı')
        data.setdefault('channel', Channel.WHATSAPP)
        is_default = data.get('is_default', False)

        account = ChannelConfigRepository.create_whatsapp(kurum_id, data)
        if is_default:
            ChannelConfigRepository.clear_other_defaults(kurum_id, account.id)
            account.is_default = True
            account.save(update_fields=['is_default', 'updated_at'])

        if role_ids is not None:
            account.allowed_roles.set(role_ids)
        if sube_ids is not None:
            account.allowed_subes.set(sube_ids)
            if sube_ids and account.scope_type != WhatsAppAccountScope.SELECTED_SUBES:
                account.scope_type = WhatsAppAccountScope.SELECTED_SUBES
                account.save(update_fields=['scope_type', 'updated_at'])

        _maybe_fill_app_id(account, plain_token=token)
        account = ChannelConfigRepository.get_by_id(kurum_id, account.id)
        return Response(_serialize_account(account, kurum_id=kurum_id), status=status.HTTP_201_CREATED)


class WhatsAppAccountDetailView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def get(self, request, account_id):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account = ChannelConfigRepository.get_by_id(kurum_id, account_id)
        if not account:
            return Response({'error': 'Hesap bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_account(account, kurum_id=kurum_id))

    def put(self, request, account_id):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account = ChannelConfigRepository.get_by_id(kurum_id, account_id)
        if not account:
            return Response({'error': 'Hesap bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = WhatsAppAccountWriteSerializer(account, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = dict(serializer.validated_data)
        token = data.pop('access_token', None)
        app_secret = data.pop('app_secret', None)
        role_ids = data.pop('role_ids', None)
        sube_ids = data.pop('sube_ids', None)
        data.pop('same_meta_account', None)
        data.pop('source_account_id', None)

        phone_number_id = data.get('phone_number_id', account.phone_number_id)
        if phone_number_id and ChannelConfigRepository.phone_number_id_taken(
            phone_number_id, exclude_id=account.id,
        ):
            return Response(
                {'error': 'Bu Phone Number ID başka bir aktif hesapta kullanılıyor.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for key, value in data.items():
            setattr(account, key, value)
        if token:
            account.access_token_encrypted = encrypt_access_token(token)
        if app_secret:
            account.app_secret_encrypted = encrypt_access_token(app_secret)
        account.save()

        if data.get('is_default'):
            ChannelConfigRepository.clear_other_defaults(kurum_id, account.id)

        if role_ids is not None:
            account.allowed_roles.set(role_ids)
        if sube_ids is not None:
            account.allowed_subes.set(sube_ids)

        _maybe_fill_app_id(account, plain_token=token)
        account = ChannelConfigRepository.get_by_id(kurum_id, account.id)
        return Response(_serialize_account(account, kurum_id=kurum_id))

    def delete(self, request, account_id):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account = ChannelConfigRepository.get_by_id(kurum_id, account_id)
        if not account:
            return Response({'error': 'Hesap bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        account.is_active = False
        account.save(update_fields=['is_active', 'updated_at'])
        return Response({'success': True, 'id': str(account.id)})


class WhatsAppAccountTestView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def post(self, request, account_id):
        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account = ChannelConfigRepository.get_by_id(kurum_id, account_id)
        if not account:
            return Response({'error': 'Hesap bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        result = WhatsAppCloudClient(channel_config=account).test_connection(kurum_id)
        account.refresh_from_db(fields=['app_id'])
        if account.app_id and 'app_id' not in result:
            result['app_id'] = account.app_id
        return Response(result)


class WhatsAppAccountSyncTemplatesView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def post(self, request, account_id):
        from apps.communication.application.meta_template_service import MetaTemplateService

        kurum_id, _sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        account = ChannelConfigRepository.get_by_id(kurum_id, account_id)
        if not account:
            return Response({'error': 'Hesap bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        result = MetaTemplateService.sync_account(account)
        status_code = status.HTTP_200_OK if result.get('success') else status.HTTP_400_BAD_REQUEST
        return Response(result, status=status_code)


class WhatsAppAccessibleAccountsView(APIView):
    """Kullanıcının rol/şube ile erişebildiği hesaplar (sohbet / toplu gönderim)."""

    permission_classes = [CommunicationModulePermission]

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        try:
            default = AccountResolver.resolve(
                kurum_id=kurum_id,
                user=request.user,
                sube_id=sube_id,
                raise_if_missing=False,
            )
        except AccountResolveError:
            default = None
        accounts = AccountResolver.list_accessible(
            kurum_id=kurum_id,
            user=request.user,
            sube_id=sube_id,
            active_only=True,
        )
        return Response({
            'accounts': [_serialize_account(a, kurum_id=kurum_id) for a in accounts],
            'default_account_id': str(default.id) if default else None,
            'total': len(accounts),
        })
