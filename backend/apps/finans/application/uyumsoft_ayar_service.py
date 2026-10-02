"""Kurum bazlı Uyumsoft ayarını okur, kaydeder ve bağlantıyı dener."""
from __future__ import annotations

from django.utils import timezone

from apps.communication.application.token_crypto import decrypt_access_token, encrypt_access_token
from apps.finans.domain.uyumsoft_ayar import UyumsoftAyar
from apps.finans.infrastructure.uyumsoft_client import (
    DEFAULT_PORTAL_URL,
    DEFAULT_WS_URL,
    UyumsoftError,
    assert_uyumsoft_url,
    whoami,
)


def empty_payload(kurum_id: int) -> dict:
    return {
        'kurum_id': kurum_id,
        'kayitli': False,
        'web_servis_url': DEFAULT_WS_URL,
        'portal_url': DEFAULT_PORTAL_URL,
        'kullanici_adi': '',
        'vkn': '',
        'gonderici_birim': '',
        'posta_kutusu': '',
        'aktif': True,
        'sifre_kayitli': False,
        'son_test_at': None,
        'son_test_basarili': None,
        'son_test_mesaji': '',
        'son_test_ozet': {},
    }


def serialize_ayar(ayar: UyumsoftAyar) -> dict:
    return {
        'kurum_id': ayar.kurum_id,
        'kayitli': True,
        'web_servis_url': ayar.web_servis_url,
        'portal_url': ayar.portal_url,
        'kullanici_adi': ayar.kullanici_adi,
        'vkn': ayar.vkn,
        'gonderici_birim': ayar.gonderici_birim,
        'posta_kutusu': ayar.posta_kutusu,
        'aktif': ayar.aktif,
        'sifre_kayitli': bool(ayar.sifre_encrypted),
        'son_test_at': ayar.son_test_at.isoformat() if ayar.son_test_at else None,
        'son_test_basarili': ayar.son_test_basarili,
        'son_test_mesaji': ayar.son_test_mesaji,
        'son_test_ozet': ayar.son_test_ozet or {},
    }


def get_ayar(kurum_id: int) -> dict:
    ayar = UyumsoftAyar.objects.filter(kurum_id=kurum_id).first()
    if not ayar:
        return empty_payload(kurum_id)
    return serialize_ayar(ayar)


def save_ayar(kurum_id: int, data: dict, user) -> dict:
    cleaned = _validate(data, kurum_id=kurum_id, require_password=False)
    ayar = UyumsoftAyar.objects.filter(kurum_id=kurum_id).first()
    password = cleaned.pop('sifre')
    if ayar is None:
        if not password:
            raise UyumsoftError('Web servis şifresi zorunludur.')
        ayar = UyumsoftAyar(kurum_id=kurum_id, sifre_encrypted=encrypt_access_token(password))
    elif password:
        ayar.sifre_encrypted = encrypt_access_token(password)
    elif not ayar.sifre_encrypted:
        raise UyumsoftError('Web servis şifresi zorunludur.')

    for field, value in cleaned.items():
        setattr(ayar, field, value)
    ayar.guncelleyen = user if getattr(user, 'is_authenticated', False) else None
    ayar.save()
    return serialize_ayar(ayar)


def test_ayar(kurum_id: int, data: dict, user) -> dict:
    """Formdaki bilgilerle WhoAmI dener. Şifre boşsa kayıtlı şifreyi kullanır; yeni şifreyi kaydetmez."""
    cleaned = _validate(data, kurum_id=kurum_id, require_password=False)
    ayar = UyumsoftAyar.objects.filter(kurum_id=kurum_id).first()
    password = cleaned['sifre']
    if not password:
        if not ayar or not ayar.sifre_encrypted:
            raise UyumsoftError('Bağlantı denemesi için web servis şifresi gerekli.')
        password = decrypt_access_token(ayar.sifre_encrypted)

    try:
        summary = whoami(cleaned['web_servis_url'], cleaned['kullanici_adi'], password)
    except UyumsoftError as exc:
        _remember_test(ayar, user, ok=False, message=str(exc), summary={})
        raise

    warning = ''
    remote_vkn = (summary.get('vkn') or '').strip()
    if remote_vkn and remote_vkn != cleaned['vkn']:
        warning = (
            f'Uyumsoft hesabının vergi numarası {remote_vkn}. '
            f'Formdaki numara {cleaned["vkn"]}.'
        )

    message = summary.get('unvan') or 'Bağlantı kuruldu.'
    if warning:
        message = f'{message} {warning}'
    _remember_test(ayar, user, ok=True, message=message, summary=summary)
    return {
        'basarili': True,
        'uyari': warning,
        'ozet': summary,
    }


def _remember_test(ayar, user, *, ok: bool, message: str, summary: dict) -> None:
    if ayar is None:
        return
    ayar.son_test_at = timezone.now()
    ayar.son_test_basarili = ok
    ayar.son_test_mesaji = message[:2000]
    ayar.son_test_ozet = summary or {}
    if getattr(user, 'is_authenticated', False):
        ayar.guncelleyen = user
    ayar.save(update_fields=[
        'son_test_at', 'son_test_basarili', 'son_test_mesaji', 'son_test_ozet',
        'guncelleyen', 'updated_at',
    ])


def _validate(data: dict, *, kurum_id: int, require_password: bool) -> dict:
    web_servis_url = assert_uyumsoft_url(data.get('web_servis_url') or DEFAULT_WS_URL, kind='Web servis adresi')
    portal_url = assert_uyumsoft_url(data.get('portal_url') or DEFAULT_PORTAL_URL, kind='Portal adresi')
    kullanici_adi = (data.get('kullanici_adi') or '').strip()
    if not kullanici_adi:
        raise UyumsoftError('Web servis kullanıcısı zorunludur.')
    vkn = ''.join(ch for ch in str(data.get('vkn') or '') if ch.isdigit())
    if len(vkn) not in (10, 11):
        raise UyumsoftError('VKN 10, TCKN 11 haneli olmalıdır.')
    gonderici = (data.get('gonderici_birim') or '').strip()
    posta = (data.get('posta_kutusu') or '').strip()
    _assert_alias(gonderici, 'Gönderici birim')
    _assert_alias(posta, 'Posta kutusu')
    sifre = data.get('sifre') or ''
    if require_password and not sifre:
        raise UyumsoftError('Web servis şifresi zorunludur.')
    aktif = data.get('aktif')
    if isinstance(aktif, str):
        aktif = aktif.lower() in ('1', 'true', 'evet', 'yes')
    return {
        'web_servis_url': web_servis_url,
        'portal_url': portal_url,
        'kullanici_adi': kullanici_adi,
        'vkn': vkn,
        'gonderici_birim': gonderici,
        'posta_kutusu': posta,
        'aktif': True if aktif is None else bool(aktif),
        'sifre': sifre,
    }


def _assert_alias(value: str, label: str) -> None:
    if not value.startswith('urn:mail:') or '@' not in value:
        raise UyumsoftError(f'{label} urn:mail:...@alanadi biçiminde olmalıdır.')
