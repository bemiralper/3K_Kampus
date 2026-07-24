"""Ders görünen adı çözümleme — program / dışa aktarma ortak kuralı."""
from __future__ import annotations

from typing import Any, Optional


def resolve_ders_display_name(
    *,
    ders: Any = None,
    plan: Any = None,
) -> str:
    """
    Öncelik: plan.gorunen_ad → ders.kisa_ad → ders.ad

    Catalog yönetimi (Eğitim Tanımları listesi) tam adı (`ders.ad`) göstermeye devam eder;
    bu yardımcı yalnızca program yüzeyi içindir.
    """
    if plan is not None:
        override = (getattr(plan, 'gorunen_ad', None) or '').strip()
        if override:
            return override
        if ders is None:
            ders = getattr(plan, 'ders', None)
    if ders is None:
        return ''
    kisa = (getattr(ders, 'kisa_ad', None) or '').strip()
    if kisa:
        return kisa
    return (getattr(ders, 'ad', None) or '').strip()


def serialize_lesson_label(
    *,
    ders: Any = None,
    plan: Any = None,
) -> Optional[dict]:
    """Schedule API lesson nesnesi."""
    if plan is not None and ders is None:
        ders = getattr(plan, 'ders', None)
    if ders is None:
        return None
    return {
        'id': ders.id,
        'name': resolve_ders_display_name(ders=ders, plan=plan),
        'full_name': ders.ad,
        'code': getattr(ders, 'kod', None),
    }
