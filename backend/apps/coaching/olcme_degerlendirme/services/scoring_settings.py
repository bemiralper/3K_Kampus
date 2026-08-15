"""
Kurum puan katsayısı seed / çözümleme.
"""
from .scoring import (
    AYT_EA_KATSAYILAR,
    AYT_SAY_KATSAYILAR,
    AYT_SOZ_KATSAYILAR,
    TYT_KATSAYILAR,
    get_factory_coefficients,
)
from ..models.scoring_settings import (
    DEFAULT_PUAN_YILI,
    MANAGED_PUAN_YILLARI,
    OlcmeKatsayiSeti,
    OlcmePuanAyar,
)

KIND_FACTORY = {
    OlcmeKatsayiSeti.Kind.TYT: TYT_KATSAYILAR,
    OlcmeKatsayiSeti.Kind.AYT_SAY: AYT_SAY_KATSAYILAR,
    OlcmeKatsayiSeti.Kind.AYT_EA: AYT_EA_KATSAYILAR,
    OlcmeKatsayiSeti.Kind.AYT_SOZ: AYT_SOZ_KATSAYILAR,
}

AYT_KIND_BY_PUAN_TURU = {
    'SAY': OlcmeKatsayiSeti.Kind.AYT_SAY,
    'EA': OlcmeKatsayiSeti.Kind.AYT_EA,
    'SOZ': OlcmeKatsayiSeti.Kind.AYT_SOZ,
}


def factory_coefficients(year: int, kind: str) -> dict:
    return dict(get_factory_coefficients(kind, year))


def ensure_kurum_defaults(kurum_id: int) -> OlcmePuanAyar:
    """Kurum ayarını ve 2024/2025/2026 setlerini oluşturur."""
    ayar, _ = OlcmePuanAyar.objects.get_or_create(
        kurum_id=kurum_id,
        defaults={'default_puan_yili': DEFAULT_PUAN_YILI},
    )
    for year in MANAGED_PUAN_YILLARI:
        published = year != 2026
        for kind, _table in KIND_FACTORY.items():
            OlcmeKatsayiSeti.objects.get_or_create(
                kurum_id=kurum_id,
                year=year,
                kind=kind,
                defaults={
                    'coefficients': factory_coefficients(year, kind),
                    'is_published': published,
                },
            )
    return ayar


def reset_year_coefficients(kurum_id: int, year: int) -> list:
    """Yılın 4 setini factory tabloya (2026 → 2025 kopyası) sıfırlar."""
    ensure_kurum_defaults(kurum_id)
    published = year != 2026
    updated = []
    for kind in KIND_FACTORY:
        row, _ = OlcmeKatsayiSeti.objects.get_or_create(
            kurum_id=kurum_id,
            year=year,
            kind=kind,
        )
        row.coefficients = factory_coefficients(year, kind)
        row.is_published = published
        row.save(update_fields=['coefficients', 'is_published', 'updated_at'])
        updated.append(row)
    return updated


def get_kurum_default_year(kurum_id: int | None) -> int:
    if not kurum_id:
        return DEFAULT_PUAN_YILI
    ayar = ensure_kurum_defaults(kurum_id)
    return ayar.default_puan_yili or DEFAULT_PUAN_YILI


def resolve_puan_yili(exam, request_year=None) -> int:
    """
    1. İstek ranking_year
    2. Sınav.puan_yili
    3. Kurum varsayılanı
    4. 2025
    """
    if request_year:
        return int(request_year)
    if exam is not None and getattr(exam, 'puan_yili', None):
        return int(exam.puan_yili)
    kurum_id = getattr(exam, 'kurum_id', None) if exam is not None else None
    return get_kurum_default_year(kurum_id)


def resolve_coefficients(kurum_id: int | None, year: int, kind: str) -> dict:
    """DB seti; yoksa factory."""
    if kurum_id:
        ensure_kurum_defaults(kurum_id)
        row = OlcmeKatsayiSeti.objects.filter(
            kurum_id=kurum_id, year=year, kind=kind,
        ).first()
        if row and row.coefficients:
            return dict(row.coefficients)
    return factory_coefficients(year, kind)


def serialize_year_sets(kurum_id: int, year: int) -> dict:
    ensure_kurum_defaults(kurum_id)
    rows = OlcmeKatsayiSeti.objects.filter(kurum_id=kurum_id, year=year)
    by_kind = {r.kind: r for r in rows}
    sets = {}
    published = year != 2026
    for kind in KIND_FACTORY:
        row = by_kind.get(kind)
        sets[kind] = {
            'kind': kind,
            'kind_display': dict(OlcmeKatsayiSeti.Kind.choices).get(kind, kind),
            'coefficients': (row.coefficients if row else factory_coefficients(year, kind)),
            'is_published': row.is_published if row else published,
        }
    return {
        'year': year,
        'is_published': all(s['is_published'] for s in sets.values()) if year != 2026 else False,
        'sets': sets,
    }
