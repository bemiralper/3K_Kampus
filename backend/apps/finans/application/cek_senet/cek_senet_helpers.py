"""Çek/senet yardımcıları ve feature flag."""
from django.conf import settings

from apps.finans.constants.payment_types import OdemeYontemiTipi


def cek_senet_v2_enabled() -> bool:
    return bool(getattr(settings, 'CEK_SENET_V2_ENABLED', False))


def is_cek_senet_tip(tip: str | None) -> bool:
    return tip in (OdemeYontemiTipi.CEK, OdemeYontemiTipi.SENET)


def is_cek_senet_yontemi(yontem) -> bool:
    if not yontem:
        return False
    return is_cek_senet_tip(getattr(yontem, 'tip', None))


def arac_tipi_from_yontem(yontem) -> str:
    if getattr(yontem, 'tip', None) == OdemeYontemiTipi.SENET:
        return 'senet'
    return 'cek'
