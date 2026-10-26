"""Mobil access jetonu.

SimpleJWT eklenmez. Varsayılan DRF kimliği SessionAuthentication kalır.
Access, Django imzalı kısa ömürlü bir belgedir. İçinde kurum, şube, portal
veya yetki yoktur. Refresh bu modülde üretilmez; o değer sunucuda hash'lenir.
"""
from django.core import signing

ACCESS_SALT = 'lms.mobile.access.v1'
ACCESS_MAX_AGE = 15 * 60


def issue_access_token(user_id: int, session_id) -> str:
    return signing.dumps(
        {'uid': user_id, 'sid': str(session_id), 'typ': 'access'},
        salt=ACCESS_SALT,
    )


def read_access_token(token: str) -> dict:
    data = signing.loads(token, salt=ACCESS_SALT, max_age=ACCESS_MAX_AGE)
    if not isinstance(data, dict) or data.get('typ') != 'access':
        raise signing.BadSignature('access')
    if 'uid' not in data or 'sid' not in data:
        raise signing.BadSignature('access')
    return data
