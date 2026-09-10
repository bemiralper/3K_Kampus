"""Kayıt türü yardımcıları — Deneme Kulübü vb."""
from __future__ import annotations

from functools import lru_cache


def _fold_tr(value: str) -> str:
    table = str.maketrans('Iİıi', 'iiii')
    return (value or '').translate(table).casefold()


def looks_like_deneme_kulubu(code: str, label: str = '') -> bool:
    blob = _fold_tr(f'{code} {label}')
    compact = blob.replace(' ', '').replace('_', '').replace('-', '')
    if compact == 'denemekulubu':
        return True
    return 'deneme' in blob and 'kulub' in blob


@lru_cache(maxsize=1)
def deneme_kulubu_codes() -> frozenset[str]:
    codes = {'deneme_kulubu'}
    try:
        from apps.ogrenci_kayit.domain.models import LookupOption

        for code, label in LookupOption.objects.filter(
            category__code='registration_type',
        ).values_list('code', 'label'):
            if looks_like_deneme_kulubu(code, label):
                codes.add(code)
    except Exception:
        pass
    return frozenset(codes)


def is_deneme_kulubu_kayit(ogrenci) -> bool:
    """Kayıt türü Deneme Kulübü mü? (Ogrenci.kayit_turu)."""
    if not ogrenci:
        return False
    code = (getattr(ogrenci, 'kayit_turu', None) or '').strip()
    if not code:
        return False
    if looks_like_deneme_kulubu(code):
        return True
    return code in deneme_kulubu_codes()
