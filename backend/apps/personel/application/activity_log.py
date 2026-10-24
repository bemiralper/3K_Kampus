"""Personel aktivite geçmişi — giriş, çıkış ve hesap olayları."""
from __future__ import annotations

import logging
import re

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


_WINDOWS = (
    ('windows nt 10.0', 'Windows 10/11'),
    ('windows nt 6.3', 'Windows 8.1'),
    ('windows nt 6.2', 'Windows 8'),
    ('windows nt 6.1', 'Windows 7'),
    ('windows nt 6.0', 'Windows Vista'),
    ('windows nt 5.2', 'Windows XP'),
    ('windows nt 5.1', 'Windows XP'),
)


def _os_label(user_agent: str, pattern: str, name: str) -> str:
    match = re.search(pattern, user_agent)
    if not match:
        return name
    parts = [part for part in match.group(1).replace('_', '.').split('.') if part]
    version = '.'.join(parts[:3])
    return f'{name} {version}' if version else name


def describe_user_agent(user_agent: str) -> dict[str, str]:
    """Kayıtlı tarayıcı bilgisinden cihaz türü ve işletim sistemi okur.

    Yeni alan yazılmaz. Eski giriş kayıtları da aynı metinden çözülür.
    """
    raw = (user_agent or '').strip()
    empty = {'cihaz': '', 'isletim_sistemi': ''}
    if not raw:
        return empty
    ua = raw.lower()

    if 'ipad' in ua:
        return {
            'cihaz': 'Tablet',
            'isletim_sistemi': _os_label(ua, r'cpu os\s+(\d+(?:[._]\d+)*)', 'iPadOS'),
        }
    if 'iphone' in ua or 'ipod' in ua:
        return {
            'cihaz': 'Telefon',
            'isletim_sistemi': _os_label(ua, r'iphone os\s+(\d+(?:[._]\d+)*)', 'iOS'),
        }
    if 'android' in ua:
        return {
            'cihaz': 'Telefon' if 'mobile' in ua else 'Tablet',
            'isletim_sistemi': _os_label(ua, r'android\s+(\d+(?:\.\d+)*)', 'Android'),
        }
    if 'windows phone' in ua:
        return {'cihaz': 'Telefon', 'isletim_sistemi': 'Windows Phone'}
    if 'cros' in ua:
        return {'cihaz': 'Bilgisayar', 'isletim_sistemi': 'ChromeOS'}
    if 'windows' in ua:
        os_name = 'Windows'
        for needle, label in _WINDOWS:
            if needle in ua:
                os_name = label
                break
        return {'cihaz': 'Bilgisayar', 'isletim_sistemi': os_name}
    if 'macintosh' in ua or 'mac os x' in ua:
        return {
            'cihaz': 'Bilgisayar',
            'isletim_sistemi': _os_label(ua, r'mac os x\s+(\d+(?:[._]\d+)*)', 'macOS'),
        }
    if 'linux' in ua or 'x11' in ua:
        return {'cihaz': 'Bilgisayar', 'isletim_sistemi': 'Linux'}
    if 'mobile' in ua:
        return {'cihaz': 'Telefon', 'isletim_sistemi': ''}
    return empty


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
