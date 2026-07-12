from __future__ import annotations

from apps.sistem_yonetimi.domain.models import SystemAuditLog, SystemTimelineEvent


def client_ip(request) -> str | None:
    if not request:
        return None
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def write_audit(
    *,
    user=None,
    module: str,
    action: str,
    description: str = '',
    ip_address: str | None = None,
    user_agent: str = '',
    metadata: dict | None = None,
    request=None,
) -> SystemAuditLog:
    if request is not None:
        ip_address = ip_address or client_ip(request)
        user_agent = user_agent or (request.META.get('HTTP_USER_AGENT') or '')[:500]
        if user is None and getattr(request, 'user', None) and request.user.is_authenticated:
            user = request.user
    return SystemAuditLog.objects.create(
        user=user,
        module=module,
        action=action,
        description=description,
        ip_address=ip_address,
        user_agent=user_agent,
        metadata=metadata or {},
    )


def write_timeline(
    *,
    category: str,
    title: str,
    detail: str = '',
    level: str = 'info',
    metadata: dict | None = None,
) -> SystemTimelineEvent:
    return SystemTimelineEvent.objects.create(
        category=category,
        title=title,
        detail=detail,
        level=level,
        metadata=metadata or {},
    )
