"""3K Kampüs ticari / yasal şirket bilgileri (footer)."""
from __future__ import annotations

DEFAULT_TELEFONLAR = (
    '0442 233 12 34\n'
    '0540 233 12 34\n'
    '0530 944 99 25'
)

DEFAULT_COMPANY_INFO = {
    'ticari_unvan': 'ÖZGÜN SINAV ÖĞRETİM EĞİTİM ANONİM ŞİRKETİ',
    'mersis_no': '0692037476300018',
    'vergi_no': '6920374763',
    'ticaret_sicil_no': '14305',
    'adres': 'LALAPAŞA MAH. MENDERES CAD. ERTURAN İNŞAAT NO: 23 YAKUTİYE/ ERZURUM',
    'telefon': DEFAULT_TELEFONLAR,
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
    '04422331234',
})
_LEGACY_EPOSTA = frozenset({
    '',
    '3kkampus@gmail.com',
    'info@example.com',
    'ornek@email.com',
})
_DESIRED_TELEFON_DIGITS = frozenset({
    '04422331234',
    '05402331234',
    '05309449925',
})


def _norm(value: str) -> str:
    return (value or '').strip().casefold()


def _digits(value: str) -> str:
    return ''.join(ch for ch in (value or '') if ch.isdigit())


def parse_telefon_list(raw: str | None) -> list[str]:
    import re
    text = (raw or '').strip()
    if not text:
        return []
    parts = re.split(r'[\n,;|]+|(?<=\d)\s*[-–—]\s*(?=\d)', text)
    seen: set[str] = set()
    out: list[str] = []
    for part in parts:
        part = part.strip()
        d = _digits(part)
        if len(d) < 10 or d in seen:
            continue
        seen.add(d)
        out.append(part)
    return out


def _should_replace_eposta(eposta: str) -> bool:
    """Yalnızca bilinen eski 3K iletişim maillerini yükselt (çok kiracılı güvenli)."""
    return _norm(eposta) in _LEGACY_EPOSTA


def _should_replace_telefon(telefon: str) -> bool:
    phones = parse_telefon_list(telefon)
    if not phones:
        return True
    digits = {_digits(p) for p in phones}
    if digits <= _PLACEHOLDER_TELEFON_DIGITS:
        return True
    # Tek eski sabit numara — güncel sabit+cep listesine yükselt
    if digits == {'04422331234'}:
        return True
    # Eksik kurumsal numaralar varsa tamamla
    if not _DESIRED_TELEFON_DIGITS.issubset(digits) and digits & _DESIRED_TELEFON_DIGITS:
        return True
    return False


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
    desired_tel = DEFAULT_COMPANY_INFO['telefon']
    if overwrite or _should_replace_telefon(telefon):
        if telefon != desired_tel:
            settings.telefon = desired_tel
            changed.append('telefon')

    eposta = (settings.eposta or '').strip()
    desired_mail = DEFAULT_COMPANY_INFO['eposta']
    if overwrite or _should_replace_eposta(eposta):
        if eposta != desired_mail:
            settings.eposta = desired_mail
            changed.append('eposta')
    return changed
