"""İstek gövdesinden gelen id'lerin aktif kurum / şube bağlamına ait olduğunu doğrular."""
from __future__ import annotations

from typing import Any, Iterable, Optional

from apps.ozel_ders.services.errors import OzelDersError


def _as_int(value: Any, field: str) -> Optional[int]:
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise OzelDersError(f'{field} geçersiz.', field)


def _deny(field: str) -> OzelDersError:
    return OzelDersError('Seçilen kayıt bu kuruma ait değil.', field, 403)


def ensure_ogrenci(ogrenci_id: Any, *, kurum_id: int) -> Optional[int]:
    from apps.ogrenci.domain.models import Ogrenci

    pk = _as_int(ogrenci_id, 'ogrenci_id')
    if pk is not None and not Ogrenci.objects.filter(pk=pk, kurum_id=kurum_id).exists():
        raise _deny('ogrenci_id')
    return pk


def ensure_ogretmen(ogretmen_id: Any, *, kurum_id: int) -> Optional[int]:
    from apps.personel.domain.models import Personel

    pk = _as_int(ogretmen_id, 'ogretmen_id')
    if pk is not None and not Personel.objects.filter(pk=pk, kurum_id=kurum_id).exists():
        raise _deny('ogretmen_id')
    return pk


def ensure_ders(ders_id: Any, *, kurum_id: int) -> Optional[int]:
    from apps.egitim_tanimlari.models import Ders

    pk = _as_int(ders_id, 'ders_id')
    if pk is not None and not Ders.objects.filter(pk=pk, kurum_id=kurum_id).exists():
        raise _deny('ders_id')
    return pk


def ensure_dersler(ders_ids: Iterable[Any], *, kurum_id: int) -> list[int]:
    from apps.egitim_tanimlari.models import Ders

    ids = {pk for pk in (_as_int(v, 'ders_id') for v in ders_ids) if pk is not None}
    if ids and Ders.objects.filter(pk__in=ids, kurum_id=kurum_id).count() != len(ids):
        raise _deny('ders_id')
    return sorted(ids)


def ensure_oda(oda_id: Any, *, kurum_id: int) -> Optional[int]:
    from django.db.models import Q

    from apps.oda.domain.models import Oda

    pk = _as_int(oda_id, 'oda_id')
    if pk is not None and not Oda.objects.filter(
        Q(kurum_id=kurum_id) | Q(kurum__isnull=True), pk=pk,
    ).exists():
        raise _deny('oda_id')
    return pk


def ensure_program(program_id: Any, *, kurum_id: int, sube_id: int, ogrenci_id: Optional[int] = None) -> Optional[int]:
    from apps.ozel_ders.domain.models import BirebirOgrenciProgrami

    pk = _as_int(program_id, 'program_id')
    if pk is None:
        return None
    qs = BirebirOgrenciProgrami.objects.filter(pk=pk, kurum_id=kurum_id, sube_id=sube_id)
    if ogrenci_id is not None:
        qs = qs.filter(ogrenci_id=ogrenci_id)
    if not qs.exists():
        raise _deny('program_id')
    return pk


def ensure_oturum(oturum_id: Any, *, kurum_id: int, sube_id: int, ogrenci_id: Optional[int] = None) -> Optional[int]:
    from apps.ozel_ders.domain.models import BirebirDersOturumu

    pk = _as_int(oturum_id, 'replaces_oturum_id')
    if pk is None:
        return None
    qs = BirebirDersOturumu.objects.filter(pk=pk, kurum_id=kurum_id, sube_id=sube_id)
    if ogrenci_id is not None:
        qs = qs.filter(ogrenci_id=ogrenci_id)
    if not qs.exists():
        raise _deny('replaces_oturum_id')
    return pk


def ensure_paketler(
    *,
    kurum_id: int,
    ogrenci_id: Optional[int],
    ogrenci_egitim_paketi_id: Any = None,
    premium_paket_id: Any = None,
    ozel_ders_paket_id: Any = None,
) -> None:
    from django.db.models import Q

    from apps.egitim_paketleri.models import OzelDers, PremiumPaket
    from apps.ogrenci.domain.models import OgrenciEgitimPaketi

    oep = _as_int(ogrenci_egitim_paketi_id, 'ogrenci_egitim_paketi_id')
    if oep is not None:
        qs = OgrenciEgitimPaketi.objects.filter(pk=oep, ogrenci__kurum_id=kurum_id)
        if ogrenci_id is not None:
            qs = qs.filter(ogrenci_id=ogrenci_id)
        if not qs.exists():
            raise _deny('ogrenci_egitim_paketi_id')
    global_or_own = Q(kurum_id=kurum_id) | Q(kurum__isnull=True)
    pp = _as_int(premium_paket_id, 'premium_paket_id')
    if pp is not None and not PremiumPaket.objects.filter(global_or_own, pk=pp).exists():
        raise _deny('premium_paket_id')
    od = _as_int(ozel_ders_paket_id, 'ozel_ders_paket_id')
    if od is not None and not OzelDers.objects.filter(global_or_own, pk=od).exists():
        raise _deny('ozel_ders_paket_id')
