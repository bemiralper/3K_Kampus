"""Kayıt türü yardımcıları — Deneme Kulübü vb.

Karar her zaman öğrencinin güncel `Ogrenci.kayit_turu` alanından okunur.
Lookup etiketleri süreç boyunca değişebildiği için kod kümesi önbelleğe alınmaz.
"""
from __future__ import annotations

_TR_FOLD = str.maketrans('IİıiÇĞÖŞÜçğıöşü', 'iiiicgosucgiosu')

GUNU_BIRLIK_CODE = 'gunu_birlik'


def _fold_tr(value: str) -> str:
    return (value or '').translate(_TR_FOLD).casefold()


def is_gunu_birlik_kayit(ogrenci) -> bool:
    """Kayıt türü günü birlik misafir mi? Yıllık kaydı yoktur, ana listede görünmez."""
    if not ogrenci:
        return False
    return (getattr(ogrenci, 'kayit_turu', None) or '').strip() == GUNU_BIRLIK_CODE


def looks_like_deneme_kulubu(code: str, label: str = '') -> bool:
    blob = _fold_tr(f'{code} {label}')
    compact = blob.replace(' ', '').replace('_', '').replace('-', '')
    if compact == 'denemekulubu':
        return True
    return 'deneme' in blob and 'kulub' in blob


def deneme_kulubu_codes() -> frozenset[str]:
    """Güncel kayıt türü tanımlarından Deneme Kulübü kodları.

    Süreç ömrü boyunca önbelleğe alınmaz: ilk çağrı lookup tablosu hazır
    değilken yalnızca varsayılan kodu kilitlemesin.
    """
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


def registration_type_label(code: str | None) -> str:
    """Kayıt türü kodunun güncel etiketini döndürür.

    Tanımda karşılığı yoksa kodun kendisi kalır. Bilinmeyen kod 'Asil'
    sayılmaz; aksi halde deneme kulübü öğrencisi asil görünür.
    """
    cleaned = (code or '').strip()
    if not cleaned:
        return ''
    try:
        from apps.ogrenci_kayit.domain.models import LookupOption

        label = (
            LookupOption.objects.filter(
                category__code='registration_type',
                code=cleaned,
            )
            .values_list('label', flat=True)
            .first()
        )
        if label:
            return label
    except Exception:
        pass
    from apps.ogrenci.domain.models import Ogrenci

    return dict(Ogrenci.KAYIT_TURU_CHOICES).get(cleaned) or cleaned
