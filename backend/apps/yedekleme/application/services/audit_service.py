from apps.yedekleme.domain.models import BackupOperationLog


def log_backup_operation(
    *,
    user,
    action: str,
    ip_address=None,
    artifact=None,
    success: bool = True,
    error_message: str = '',
    duration_ms=None,
    metadata=None,
) -> BackupOperationLog:
    return BackupOperationLog.objects.create(
        user=user if getattr(user, 'is_authenticated', False) else None,
        ip_address=ip_address,
        action=action,
        artifact=artifact,
        success=success,
        error_message=error_message or '',
        duration_ms=duration_ms,
        metadata=metadata or {},
    )
