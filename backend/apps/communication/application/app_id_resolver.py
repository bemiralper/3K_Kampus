"""Meta App ID — hesap alanı / env / token (debug_token)."""
from __future__ import annotations

from django.conf import settings

from apps.communication.domain.enums import Channel
from apps.communication.domain.models import CommunicationChannelConfig


def public_facebook_app_id_for_kurum(kurum_id: int) -> str:
    """Landing OG meta için — aktif WhatsApp hesabının app_id'si (yoksa env)."""
    cfg = (
        CommunicationChannelConfig.objects.filter(
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
            is_active=True,
        )
        .exclude(app_id='')
        .order_by('-is_default', '-updated_at')
        .only('app_id')
        .first()
    )
    if cfg and cfg.app_id:
        return str(cfg.app_id).strip()
    return str(getattr(settings, 'WHATSAPP_APP_ID', '') or '').strip()


def ensure_account_app_id(
    account: CommunicationChannelConfig,
    *,
    force: bool = False,
    access_token: str | None = None,
) -> str:
    """
    Hesapta app_id yoksa (veya force) Meta'dan / env'den çözüp kaydeder.
    Manuel girilmiş değeri force=False iken korur.
    """
    current = (account.app_id or '').strip()
    if current and not force:
        return current

    from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient

    client = WhatsAppCloudClient(channel_config=account)
    if access_token is None:
        config = client._resolve_config(account.kurum_id, account)
        access_token = config.get('access_token') or ''

    # force: kayıtlı değeri atla (env / debug_token). Aksi halde channel_config kullanılır.
    resolved = client.resolve_app_id(
        access_token,
        stored_app_id='' if force else None,
    ).strip()
    if resolved and resolved != current:
        account.app_id = resolved
        account.save(update_fields=['app_id', 'updated_at'])
        return resolved
    return current or resolved
