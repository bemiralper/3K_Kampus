"""Panelden bakım modu aç/kapat."""

from __future__ import annotations

from shared.maintenance import MaintenanceControlError, maintenance_status, set_maintenance_enabled

from apps.sistem_yonetimi.services.audit import write_audit, write_timeline

CONFIRM_ENABLE = 'BAKIM_AC'
CONFIRM_DISABLE = 'BAKIM_KAPAT'


def get_maintenance_panel_status() -> dict:
    return maintenance_status()


def set_maintenance_mode(*, enabled: bool, confirm: str = '', request=None, user=None) -> dict:
    expected = CONFIRM_ENABLE if enabled else CONFIRM_DISABLE
    if (confirm or '').strip() != expected:
        raise ValueError(f'Onay metni hatalı. Beklenen: {expected}')

    try:
        result = set_maintenance_enabled(enabled, reload_nginx=True)
    except MaintenanceControlError as exc:
        raise ValueError(str(exc)) from exc

    action = 'maintenance_on' if enabled else 'maintenance_off'
    description = 'Bakım modu açıldı' if enabled else 'Bakım modu kapatıldı'
    write_audit(
        request=request,
        user=user,
        module='sistem_yonetimi',
        action=action,
        description=description,
        metadata={
            'flag_path': result.get('flag_path'),
            'nginx_reloaded': result.get('nginx_reloaded'),
            'nginx_reload_error': result.get('nginx_reload_error'),
        },
    )
    write_timeline(
        category='system',
        title=description,
        detail=result.get('nginx_reload_error') or 'Nginx yeniden yüklendi' if result.get('nginx_reloaded') else 'Flag dosyası güncellendi',
        level='warning' if enabled else 'success',
        metadata={'enabled': enabled},
    )
    return result
