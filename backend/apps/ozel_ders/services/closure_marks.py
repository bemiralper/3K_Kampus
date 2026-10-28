"""Bilinçli kapatılmış (is_active=False) planlı derslerin kapanma nedeni.

Ayrı bir alan eklenene kadar pasif PLANLANDI kayıtlarında kullanılmayan
`sebep_aciklama` alanında tutulur; pasif kayıtlar listelenmediği için ekrana yansımaz.
Bu işaretli dersler şablon üretimiyle kendiliğinden yeniden açılmaz.
"""
from __future__ import annotations

PREFIX = 'kapatma:'
OGRENCI_TATIL = f'{PREFIX}ogrenci_tatil'
TATIL_KARARI = f'{PREFIX}tatil_karari'


def is_marked(oturum, mark: str | None = None) -> bool:
    value = (getattr(oturum, 'sebep_aciklama', '') or '')
    if mark is None:
        return value.startswith(PREFIX)
    return value == mark


def close_with_mark(oturum, mark: str) -> None:
    oturum.is_active = False
    oturum.sebep_aciklama = mark
    oturum.save(update_fields=['is_active', 'sebep_aciklama', 'updated_at'])


def clear_mark_fields(oturum) -> list[str]:
    """Yeniden açılan dersin işaretini temizler; kaydedilecek alanları döner."""
    if is_marked(oturum):
        oturum.sebep_aciklama = ''
        return ['sebep_aciklama']
    return []
