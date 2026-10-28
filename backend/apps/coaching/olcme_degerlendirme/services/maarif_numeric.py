"""Maarif harfli kodunu yayınevi sayısal koduna çevirir.

KİM.10.1.11.a → 10.21.11.1.1

- İlk sayı sınıf.
- İkinci sayı temanın 20 fazlası (tema 1 → 21). 2018 ünite numarasıyla çakışmasın.
- Üçüncü sayı öğrenme çıktısının sırası.
- Dördüncü sayı çıktının kendisi; her çıktıda 1'dir.
- Beşinci sayı süreç bileşeni: a=1, b=2, c=3, ç=4, … ğ=9.

Fen bilimlerinde bölüm numarası da vardır: FB.5.1.2.1.a → 5.21.2.1.1

İngilizcede çıktı sırası beceri harfiyle verilir: ENG.5.1.L2 → 5.21.12.1
(L=1 R=2 S=3 W=4 V=5 G=6 P=7; harf onlar, sıra birler basamağı.)
"""
from __future__ import annotations

import re

_LETTERS = 'abcçdefgğhıijklmnoöprsştuüvyz'
_LETTER_INDEX = {ch: i + 1 for i, ch in enumerate(_LETTERS)}

_TURKCE_AREA = {'D': 1, 'O': 2, 'K': 3, 'Y': 4}
_ENG_AREA = {'L': 1, 'R': 2, 'S': 3, 'W': 4, 'V': 5, 'G': 6, 'P': 7}

_TOPIC_STD = re.compile(r'^[A-ZÇĞİÖŞÜ]+\.(\d+)\.(\d+)$')
_TOPIC_FEN = re.compile(r'^FB\.(\d+)\.(\d+)\.(\d+)$')
_TOPIC_TURKCE = re.compile(r'^T\.([DOKY])\.(\d+)$')
_TOPIC_TDE = re.compile(r'^TDE\.(\d+)\.(\d+)$')

_OUT_STD = re.compile(r'^[A-ZÇĞİÖŞÜ]+\.(\d+)\.(\d+)\.(\d+)$')
_OUT_FEN = re.compile(r'^FB\.(\d+)\.(\d+)\.(\d+)\.(\d+)$')
_OUT_TURKCE = re.compile(r'^T\.([DOKY])\.(\d+)\.(\d+)$')
_OUT_TDE = re.compile(r'^TDE\d+\.(\d+)\.(\d+)$')
_OUT_ENG = re.compile(r'^ENG\.?(\d+)\.(\d+)\.([A-Z])(\d+)$')

_SUB_LETTER = re.compile(r'\.([a-zçğıöşü])$')
_SUB_DIGIT = re.compile(r'\.(\d+)$')


def letter_index(letter: str) -> int:
    idx = _LETTER_INDEX.get(letter.casefold())
    if idx is None:
        raise ValueError(f'bilinmeyen süreç harfi: {letter}')
    return idx


def numeric_topic(code: str) -> str:
    code = (code or '').strip()
    m = _TOPIC_TURKCE.fullmatch(code)
    if m:
        return f'{m.group(2)}.{20 + _TURKCE_AREA[m.group(1)]}'
    m = _TOPIC_FEN.fullmatch(code)
    if m:
        grade, theme, section = m.groups()
        return f'{grade}.{20 + int(theme)}.{section}'
    m = _TOPIC_STD.fullmatch(code) or _TOPIC_TDE.fullmatch(code)
    if m:
        grade, theme = m.groups()
        return f'{grade}.{20 + int(theme)}'
    return code


def numeric_outcome(code: str, topic_code: str = '') -> str:
    code = (code or '').strip()
    m = _OUT_TURKCE.fullmatch(code)
    if m:
        return f'{m.group(2)}.{20 + _TURKCE_AREA[m.group(1)]}.{m.group(3)}.1'
    m = _OUT_FEN.fullmatch(code)
    if m:
        grade, theme, section, n = m.groups()
        return f'{grade}.{20 + int(theme)}.{section}.{n}'
    m = _OUT_ENG.fullmatch(code)
    if m:
        grade, theme, area, n = m.groups()
        area_index = _ENG_AREA.get(area)
        if area_index:
            return f'{grade}.{20 + int(theme)}.{area_index * 10 + int(n)}.1'
    m = _OUT_TDE.fullmatch(code)
    if m:
        theme, seq = m.groups()
        grade_m = _TOPIC_TDE.fullmatch((topic_code or '').strip())
        grade = grade_m.group(1) if grade_m else theme
        return f'{grade}.{20 + int(theme)}.{seq}.1'
    m = _OUT_STD.fullmatch(code)
    if m:
        grade, theme, n = m.groups()
        return f'{grade}.{20 + int(theme)}.{n}.1'
    return code


_OFFICIAL_LEAD = re.compile(
    r'^([A-ZÇĞİÖŞÜ]{2,12}(?:\.\d+){2,4})(?:\.([A-ZÇĞİÖŞÜ]))?(?:\s+\S.*)?$',
)
_ASCII_PREFIX = str.maketrans({
    'İ': 'I', 'ı': 'I', 'I': 'I', 'i': 'I',
    'Ç': 'C', 'ç': 'C', 'Ğ': 'G', 'ğ': 'G',
    'Ö': 'O', 'ö': 'O', 'Ş': 'S', 'ş': 'S',
    'Ü': 'U', 'ü': 'U',
})
# Katalog öneki → ders kodu. MAT.11.3.1 Matematik ağacında aranır, Tarih'te değil.
_PREFIX_SUBJECT = {
    'MAT': 'MATEMATIK',
    'FIZ': 'FIZIK',
    'KIM': 'KIMYA',
    'BIY': 'BIYOLOJI',
    'TAR': 'TARIH',
    'COG': 'COGRAFYA',
    'FEL': 'FELSEFE',
    'TDE': 'TDE',
    'DKAB': 'DKAB',
    'DIN': 'DKAB',
    'FB': 'FEN',
    'FEN': 'FEN',
    'TUR': 'TURKCE',
    'SOS': 'SOSYAL',
    'ENG': 'INGILIZCE',
    'ING': 'INGILIZCE',
    'INK': 'INKILAP',
}


def _fold_official(text: str) -> str:
    return (text or '').strip().replace('i', 'İ').replace('ı', 'I').upper()


def _ascii_prefix(value: str) -> str:
    return (value or '').translate(_ASCII_PREFIX).upper()


def prefix_fits_subject(prefix: str, subject_code: str) -> bool:
    """MAT, Matematik dersine uyar; Tarih dersine uymaz."""
    key = _ascii_prefix(prefix)
    expected = _PREFIX_SUBJECT.get(key)
    actual = _ascii_prefix(subject_code)
    if not expected or not actual:
        return False
    if actual == expected or actual == key:
        return True
    return actual.startswith(key) or expected.startswith(actual)


def official_stored_codes(query: str) -> list[str] | None:
    """Resmi Maarif kodunun aranacak halleri.

    None: noktalı sayı ya da serbest metin; normal eşleştirme sürer.
    Liste: önce katalogdaki yazılış (MAT.8.1.1), sonra sayısal kayıt (11.23.1.1).
    Sondaki kazanım cümlesi koda dahil edilmez.
    """
    folded = _fold_official(query).rstrip('.')
    if not folded or re.fullmatch(r'\d+(?:\.\d+)+', folded):
        return None
    match = _OFFICIAL_LEAD.fullmatch(folded)
    if not match:
        return None
    head, letter = match.group(1), match.group(2)
    official = head + (f'.{letter.casefold()}' if letter else '')
    codes = [official]
    if letter:
        parent = numeric_outcome(head)
        if parent != head:
            codes.append(numeric_sub(f'{head}.{letter.casefold()}', parent))
    else:
        converted = numeric_outcome(head)
        if converted != head:
            codes.append(converted)
    seen: set[str] = set()
    unique: list[str] = []
    for code in codes:
        key = code.strip().rstrip('.').lower()
        if key and key not in seen:
            seen.add(key)
            unique.append(code.strip().rstrip('.'))
    return unique


def numeric_sub(code: str, outcome_numeric: str) -> str:
    code = (code or '').strip()
    m = _SUB_LETTER.search(code)
    if m:
        return f'{outcome_numeric}.{letter_index(m.group(1))}'
    m = _SUB_DIGIT.search(code)
    if m and outcome_numeric:
        return f'{outcome_numeric}.{int(m.group(1))}'
    return code
