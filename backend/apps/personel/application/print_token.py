"""Personel modülü print token."""
from apps.odeme_takip.application.print_token import (
    create_print_token,
    validate_print_token,
    DEFAULT_TTL_SECONDS,
)

DOC_PERSONEL_SOZLESME = 'personel_sozlesme'

__all__ = [
    'create_print_token',
    'validate_print_token',
    'DEFAULT_TTL_SECONDS',
    'DOC_PERSONEL_SOZLESME',
]
