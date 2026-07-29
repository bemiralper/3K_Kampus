"""
Özel ders / premium paket → BirebirOgrenciProgrami senkronu.

Slot veya öğretmen oluşturmaz; yalnızca program kaydı + paket ders listesi.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from django.db import transaction

from apps.ozel_ders.domain.models import (
    BirebirOgrenciProgrami,
    PremiumPaketDersKota,
    ProgramDurumu,
)
from apps.ozel_ders.services.errors import OzelDersError

SYNCABLE_PAKET_TURLERI = frozenset({'ozel_ders', 'premium'})

# Kayıt / sözleşme tarafında görülebilen alternatif kodlar
_PAKET_TURU_NORMALIZE = {
    'ozel_ders': 'ozel_ders',
    'ozel_dersler': 'ozel_ders',
    'premium': 'premium',
    'premium_paketler': 'premium',
}


def normalize_paket_turu(paket_turu: Optional[str]) -> Optional[str]:
    if not paket_turu:
        return None
    return _PAKET_TURU_NORMALIZE.get(str(paket_turu).strip().lower())


def resolve_paket_dersleri(program: BirebirOgrenciProgrami) -> list[dict[str, Any]]:
    """Paketten gelen ders listesi (öğretmen/saat yok)."""
    if program.ozel_ders_paket_id:
        from apps.egitim_paketleri.models import OzelDers

        try:
            paket = OzelDers.objects.prefetch_related('dersler').get(pk=program.ozel_ders_paket_id)
        except OzelDers.DoesNotExist:
            return []
        return [
            {
                'id': d.id,
                'ad': d.ad,
                'kisa_ad': (d.kisa_ad or '').strip(),
            }
            for d in paket.dersler.filter(aktif_mi=True).order_by('ad')
        ]

    if program.premium_paket_id:
        kotalar = (
            PremiumPaketDersKota.objects.filter(premium_paket_id=program.premium_paket_id)
            .select_related('ders')
            .order_by('ders__ad')
        )
        return [
            {
                'id': k.ders_id,
                'ad': k.ders.ad,
                'kisa_ad': (getattr(k.ders, 'kisa_ad', None) or '').strip(),
                'haftalik_adet': k.haftalik_adet,
                'varsayilan_sure_dk': k.varsayilan_sure_dk,
            }
            for k in kotalar
            if k.ders_id
        ]

    return []


@transaction.atomic
def ensure_program_for_package(
    *,
    ogrenci_id: int,
    kurum_id: int,
    sube_id: int,
    egitim_yili_id: int,
    paket_turu: str,
    paket_id: int,
    ogrenci_egitim_paketi_id: Optional[int] = None,
    baslangic: Optional[date] = None,
    user=None,
) -> tuple[Optional[BirebirOgrenciProgrami], str]:
    """
    Aktif birebir program yoksa oluşturur; varsa paket FK'lerini günceller.

    Returns: (program|None, action) where action in created|updated|skipped|noop
    """
    tur = normalize_paket_turu(paket_turu)
    if tur not in SYNCABLE_PAKET_TURLERI or not paket_id:
        return None, 'noop'

    if not all([ogrenci_id, kurum_id, sube_id, egitim_yili_id]):
        raise OzelDersError('Senkron için öğrenci/kurum/şube/yıl zorunlu.', 'sync_context')

    qs = BirebirOgrenciProgrami.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
        ogrenci_id=ogrenci_id,
        durum=ProgramDurumu.AKTIF,
    )
    if tur == 'ozel_ders':
        qs = qs.filter(ozel_ders_paket_id=paket_id)
    else:
        qs = qs.filter(premium_paket_id=paket_id)

    program = qs.first()
    start = baslangic or date.today()

    if program is None:
        program = BirebirOgrenciProgrami.objects.create(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            ogrenci_id=ogrenci_id,
            ogrenci_egitim_paketi_id=ogrenci_egitim_paketi_id,
            premium_paket_id=paket_id if tur == 'premium' else None,
            ozel_ders_paket_id=paket_id if tur == 'ozel_ders' else None,
            baslangic_tarihi=start,
            durum=ProgramDurumu.AKTIF,
            notlar='',
            created_by=user if user and getattr(user, 'is_authenticated', False) else None,
        )
        return program, 'created'

    changed = False
    if ogrenci_egitim_paketi_id and program.ogrenci_egitim_paketi_id != ogrenci_egitim_paketi_id:
        program.ogrenci_egitim_paketi_id = ogrenci_egitim_paketi_id
        changed = True
    if tur == 'ozel_ders' and program.ozel_ders_paket_id != paket_id:
        program.ozel_ders_paket_id = paket_id
        program.premium_paket_id = None
        changed = True
    if tur == 'premium' and program.premium_paket_id != paket_id:
        program.premium_paket_id = paket_id
        program.ozel_ders_paket_id = None
        changed = True
    if changed:
        program.save()
        return program, 'updated'
    return program, 'skipped'


def ensure_program_from_enrollment(
    *,
    ogrenci,
    egitim_yili_id: int,
    paket_turu: str,
    paket_id: int,
    ogrenci_egitim_paketi_id: Optional[int] = None,
    baslangic: Optional[date] = None,
    user=None,
) -> tuple[Optional[BirebirOgrenciProgrami], str]:
    """Kayıt finalize sonrası çağrı — ogrenci modelinden kurum/şube alır."""
    return ensure_program_for_package(
        ogrenci_id=ogrenci.id if hasattr(ogrenci, 'id') else int(ogrenci),
        kurum_id=getattr(ogrenci, 'kurum_id', None),
        sube_id=getattr(ogrenci, 'sube_id', None),
        egitim_yili_id=egitim_yili_id,
        paket_turu=paket_turu,
        paket_id=paket_id,
        ogrenci_egitim_paketi_id=ogrenci_egitim_paketi_id,
        baslangic=baslangic,
        user=user,
    )


def ensure_program_from_sozlesme(sozlesme, *, user=None) -> tuple[Optional[BirebirOgrenciProgrami], str]:
    tur = normalize_paket_turu(getattr(sozlesme, 'paket_turu', None))
    paket_id = getattr(sozlesme, 'paket_id', None)
    if tur not in SYNCABLE_PAKET_TURLERI or not paket_id:
        return None, 'noop'

    ep_id = None
    try:
        from apps.ogrenci.domain.models import OgrenciEgitimPaketi

        ep = (
            OgrenciEgitimPaketi.objects.filter(
                ogrenci_id=sozlesme.ogrenci_id,
                paket_turu=tur,
                paket_id=paket_id,
                aktif_mi=True,
            )
            .order_by('-id')
            .first()
        )
        if ep:
            ep_id = ep.id
    except Exception:
        pass

    return ensure_program_for_package(
        ogrenci_id=sozlesme.ogrenci_id,
        kurum_id=sozlesme.kurum_id,
        sube_id=sozlesme.sube_id,
        egitim_yili_id=sozlesme.egitim_yili_id,
        paket_turu=tur,
        paket_id=paket_id,
        ogrenci_egitim_paketi_id=ep_id,
        baslangic=getattr(sozlesme, 'baslangic_tarihi', None) or date.today(),
        user=user,
    )


@transaction.atomic
def sync_sube_programs(
    *,
    kurum_id: int,
    sube_id: int,
    egitim_yili_id: int,
    user=None,
) -> dict[str, int]:
    """Aktif özel ders / premium OgrenciEgitimPaketi kayıtlarından program üret."""
    from apps.ogrenci.domain.models import OgrenciEgitimPaketi

    if not egitim_yili_id:
        raise OzelDersError('egitim_yili_id zorunlu.', 'egitim_yili_id')

    packages = (
        OgrenciEgitimPaketi.objects.filter(
            aktif_mi=True,
            paket_turu__in=list(SYNCABLE_PAKET_TURLERI),
            ogrenci__kurum_id=kurum_id,
            ogrenci__sube_id=sube_id,
        )
        .select_related('ogrenci')
        .order_by('id')
    )

    summary = {'created': 0, 'updated': 0, 'skipped': 0, 'noop': 0}
    for ep in packages:
        _, action = ensure_program_for_package(
            ogrenci_id=ep.ogrenci_id,
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            paket_turu=ep.paket_turu,
            paket_id=ep.paket_id,
            ogrenci_egitim_paketi_id=ep.id,
            baslangic=ep.baslangic_tarihi or date.today(),
            user=user,
        )
        summary[action] = summary.get(action, 0) + 1
    return summary
