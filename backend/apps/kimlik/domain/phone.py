"""Telefon normalizasyonu — kimlik çözümleme ve kayıt akışlarında ortak."""
import re


def normalize_phone(value: str | None) -> str:
    """(532) 123 45 67 -> 05321234567"""
    if not value:
        return ''
    digits = re.sub(r'\D', '', value)
    if len(digits) == 10 and digits.startswith('5'):
        digits = '0' + digits
    return digits


def phone_lookup_variants(normalized: str) -> list[str]:
    """Arama için olası telefon varyantları."""
    if not normalized:
        return []
    variants = {normalized}
    if normalized.startswith('0') and len(normalized) == 11:
        variants.add(normalized[1:])
    elif len(normalized) == 10 and normalized.startswith('5'):
        variants.add('0' + normalized)
    return list(variants)
