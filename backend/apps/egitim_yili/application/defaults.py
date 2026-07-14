"""Eğitim yılı yardımcıları."""

from __future__ import annotations

from datetime import date


def academic_start_year(today: date | None = None) -> int:
    """Türk eğitim takvimi başlangıç yılı (Eyl–Ağu)."""
    today = today or date.today()
    return today.year if today.month >= 9 else today.year - 1


def pick_default_egitim_yili(queryset=None, *, today: date | None = None):
    """Birden fazla aktif yıl varken takvimsel varsayılanı seç."""
    from apps.egitim_yili.domain.models import EgitimYili

    qs = queryset if queryset is not None else EgitimYili.objects.all()
    years = list(qs)
    if not years:
        return None
    aktif = [y for y in years if getattr(y, 'aktif_mi', False)]
    pool = aktif or years
    start = academic_start_year(today)
    exact = next((y for y in pool if y.baslangic_yil == start), None)
    if exact:
        return exact
    past = sorted(
        [y for y in pool if y.baslangic_yil <= start],
        key=lambda y: y.baslangic_yil,
        reverse=True,
    )
    if past:
        return past[0]
    return sorted(pool, key=lambda y: y.baslangic_yil)[0]
