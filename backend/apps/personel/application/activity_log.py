"""Personel aktivite geçmişi — giriş, çıkış ve hesap olayları."""
from __future__ import annotations

import logging

from apps.personel.domain.models import Personel, PersonelAktiviteLog

logger = logging.getLogger(__name__)

VALID_EYLEMLER = {code for code, _label in PersonelAktiviteLog.EYLEM_CHOICES}


def _client_ip(request) -> str | None:
    if not request:
        return None
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def personel_for_user(user) -> Personel | None:
    if not user or not getattr(user, 'pk', None):
        return None
    return Personel.objects.filter(user_id=user.pk).first()


def log_personel_activity(
    *,
    personel: Personel | None = None,
    user=None,
    eylem: str,
    request=None,
    detay: str = '',
    sayfa_url: str = '',
) -> PersonelAktiviteLog | None:
    """Personel aktivitesini kaydeder. Personel yoksa veya hata olursa sessizce geçer."""
    try:
        if eylem not in VALID_EYLEMLER:
            eylem = 'OTHER'
        if personel is None:
            personel = personel_for_user(user)
        if personel is None:
            return None

        ip_adresi = _client_ip(request)
        user_agent = ''
        oturum_id = ''
        if request is not None:
            user_agent = (request.META.get('HTTP_USER_AGENT') or '')[:500]
            session = getattr(request, 'session', None)
            oturum_id = (getattr(session, 'session_key', None) or '')[:100]
            if not sayfa_url:
                sayfa_url = (request.META.get('HTTP_REFERER') or request.path or '')[:500]

        return PersonelAktiviteLog.objects.create(
            personel=personel,
            eylem=eylem,
            detay=detay or '',
            ip_adresi=ip_adresi,
            user_agent=user_agent,
            sayfa_url=sayfa_url or '',
            oturum_id=oturum_id,
        )
    except Exception:
        logger.exception('Personel aktivite logu yazılamadı')
        return None
