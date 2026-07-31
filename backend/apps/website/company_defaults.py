"""3K Kampüs ticari / yasal şirket bilgileri (footer)."""
from __future__ import annotations

DEFAULT_COMPANY_INFO = {
    'ticari_unvan': 'ÖZGÜN SINAV ÖĞRETİM EĞİTİM ANONİM ŞİRKETİ',
    'mersis_no': '0692037476300018',
    'vergi_no': '6920374763',
    'ticaret_sicil_no': '14305',
    'adres': 'LALAPAŞA MAH. MENDERES CAD. ERTURAN İNŞAAT NO: 23 YAKUTİYE/ ERZURUM',
    'telefon': '0442 233 1234',
    'eposta': 'info@3kkampus.com',
}

COMPANY_FIELD_NAMES = (
    'ticari_unvan',
    'mersis_no',
    'vergi_no',
    'ticaret_sicil_no',
)

# Eski seed / placeholder değerleri — gerçek şirket bilgisiyle değiştirilir
_PLACEHOLDER_ADRES = frozenset({
    '',
    'ataşehir, i̇stanbul',
    'ataşehir, istanbul',
    'istanbul, türkiye',
})
_PLACEHOLDER_TELEFON_DIGITS = frozenset({
    '',
    '02125550000',
    '04422331234',  # aynı numaranın farklı yazımlarını da normalize et
})


def _norm(value: str) -> str:
    return (value or '').strip().casefold()


def _digits(value: str) -> str:
    return ''.join(ch for ch in (value or '') if ch.isdigit())


def apply_company_defaults(settings, *, overwrite: bool = False) -> list[str]:
    """SiteSettings üzerine şirket bilgilerini yazar. Dönüş: değişen alan adları."""
    changed: list[str] = []
    for key in COMPANY_FIELD_NAMES:
        current = (getattr(settings, key, None) or '').strip()
        if overwrite or not current:
            setattr(settings, key, DEFAULT_COMPANY_INFO[key])
            changed.append(key)

    adres = (settings.adres or '').strip()
    if overwrite or _norm(adres) in _PLACEHOLDER_ADRES:
        settings.adres = DEFAULT_COMPANY_INFO['adres']
        changed.append('adres')

    telefon = (settings.telefon or '').strip()
    tel_digits = _digits(telefon)
    desired_tel = DEFAULT_COMPANY_INFO['telefon']
    if overwrite or tel_digits in _PLACEHOLDER_TELEFON_DIGITS or (
        tel_digits == _digits(desired_tel) and telefon != desired_tel
    ):
        settings.telefon = desired_tel
        changed.append('telefon')

    eposta = (settings.eposta or '').strip()
    if overwrite or not eposta:
        settings.eposta = DEFAULT_COMPANY_INFO['eposta']
        changed.append('eposta')
    return changed
