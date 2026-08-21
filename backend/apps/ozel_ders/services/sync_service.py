"""
Özel ders / premium paket → BirebirOgrenciProgrami senkronu.

Slot veya öğretmen oluşturmaz; yalnızca program kaydı + paket ders listesi.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Optional

from django.db import transaction
from django.db.models import Q

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


def _serialize_ders_row(d) -> dict[str, Any]:
    return {
        'id': d.id,
        'ad': d.ad,
        'kisa_ad': (getattr(d, 'kisa_ad', None) or '').strip(),
    }


def _infer_dersler_from_paket(paket, *, kurum_id: int, sube_id: Optional[int]) -> list[dict[str, Any]]:
    """M2M boş paketlerde ad/kod ile katalog dersini eşle (Matematik Özel Ders → Matematik)."""
    from apps.egitim_tanimlari.models import Ders

    raw_ad = (getattr(paket, 'ad', None) or '').strip()
    raw_kod = (getattr(paket, 'kod', None) or '').strip()
    if not raw_ad and not raw_kod:
        return []

    qs = Ders.objects.filter(aktif_mi=True, kurum_id=kurum_id)
    scoped = qs.filter(sube_id=sube_id) if sube_id else qs
    if sube_id and not scoped.exists():
        scoped = qs

    filters = Q()
    if raw_ad:
        filters |= Q(ad__iexact=raw_ad) | Q(kisa_ad__iexact=raw_ad)
    if raw_kod:
        filters |= Q(kod__iexact=raw_kod)
    exact = list(scoped.filter(filters).order_by('ad')[:20]) if filters else []
    if exact:
        return [_serialize_ders_row(d) for d in exact]

    token = re.split(r'[\s\-_/]+', raw_ad, maxsplit=1)[0] if raw_ad else ''
    if len(token) >= 3:
        named = list(
            scoped.filter(Q(ad__iexact=token) | Q(kisa_ad__iexact=token)).order_by('ad')[:5]
        )
        if len(named) == 1:
            return [_serialize_ders_row(named[0])]
    return []


def resolve_paket_dersleri(program: BirebirOgrenciProgrami) -> list[dict[str, Any]]:
    """Paketten gelen ders listesi (öğretmen/saat yok)."""
    if program.ozel_ders_paket_id:
        from apps.egitim_paketleri.models import OzelDers

        try:
            paket = OzelDers.objects.prefetch_related('dersler').get(pk=program.ozel_ders_paket_id)
        except OzelDers.DoesNotExist:
            return []
        rows = [
            _serialize_ders_row(d)
            for d in paket.dersler.filter(aktif_mi=True).order_by('ad')
        ]
        if rows:
            return rows
        return _infer_dersler_from_paket(
            paket, kurum_id=program.kurum_id, sube_id=program.sube_id,
        )

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
        pasif_qs = BirebirOgrenciProgrami.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            ogrenci_id=ogrenci_id,
            durum=ProgramDurumu.PASIF,
        )
        if tur == 'ozel_ders':
            pasif_qs = pasif_qs.filter(ozel_ders_paket_id=paket_id)
        else:
            pasif_qs = pasif_qs.filter(premium_paket_id=paket_id)
        program = pasif_qs.order_by('-id').first()
        if program is not None:
            program.durum = ProgramDurumu.AKTIF
            program.bitis_tarihi = None
            if ogrenci_egitim_paketi_id:
                program.ogrenci_egitim_paketi_id = ogrenci_egitim_paketi_id
            if tur == 'ozel_ders':
                program.ozel_ders_paket_id = paket_id
                program.premium_paket_id = None
            else:
                program.premium_paket_id = paket_id
                program.ozel_ders_paket_id = None
            program.save()
            return program, 'updated'

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


def _ensure_ogrenci_egitim_paketi(
    *,
    ogrenci_id: int,
    paket_turu: str,
    paket_id: int,
    paket_adi: str = '',
    baslangic: Optional[date] = None,
) -> Optional[int]:
    from apps.ogrenci.domain.models import OgrenciEgitimPaketi

    tur = normalize_paket_turu(paket_turu)
    if tur not in SYNCABLE_PAKET_TURLERI or not paket_id:
        return None
    ep = (
        OgrenciEgitimPaketi.objects.filter(
            ogrenci_id=ogrenci_id,
            paket_turu=tur,
            paket_id=paket_id,
        )
        .order_by('-id')
        .first()
    )
    if ep:
        changed = False
        if not ep.aktif_mi:
            ep.aktif_mi = True
            changed = True
        if paket_adi and not ep.paket_adi:
            ep.paket_adi = paket_adi
            changed = True
        if changed:
            ep.save(update_fields=['aktif_mi', 'paket_adi', 'updated_at'])
        return ep.id
    ep = OgrenciEgitimPaketi.objects.create(
        ogrenci_id=ogrenci_id,
        paket_turu=tur,
        paket_id=paket_id,
        paket_adi=paket_adi or '',
        aktif_mi=True,
        baslangic_tarihi=baslangic,
    )
    return ep.id


def _kalem_sync_kind(kalem, sozlesme=None) -> Optional[str]:
    tur = getattr(kalem, 'kalem_turu', None)
    normalized = normalize_paket_turu(tur)
    if normalized in SYNCABLE_PAKET_TURLERI:
        return normalized
    if tur == 'paket' and sozlesme:
        root = normalize_paket_turu(getattr(sozlesme, 'paket_turu', None))
        if root in SYNCABLE_PAKET_TURLERI and getattr(sozlesme, 'paket_id', None) == getattr(kalem, 'kalem_id', None):
            return root
    return None


def iter_sozlesme_syncable_packages(sozlesme) -> list[tuple[str, int, str]]:
    """Sözleşme kökü + kalemlerden özel ders / premium paketleri topla."""
    seen: set[tuple[str, int]] = set()
    items: list[tuple[str, int, str]] = []

    def _add(tur: Optional[str], paket_id, ad: str = ''):
        kind = normalize_paket_turu(tur)
        if kind not in SYNCABLE_PAKET_TURLERI or not paket_id:
            return
        key = (kind, int(paket_id))
        if key in seen:
            return
        seen.add(key)
        items.append((kind, int(paket_id), ad or ''))

    _add(getattr(sozlesme, 'paket_turu', None), getattr(sozlesme, 'paket_id', None), getattr(sozlesme, 'paket_adi', '') or '')
    kalemler = getattr(sozlesme, 'kalemler', None)
    if kalemler is not None:
        for kalem in kalemler.all():
            _add(_kalem_sync_kind(kalem, sozlesme), kalem.kalem_id, kalem.kalem_adi or '')
    return items


def ensure_program_from_sozlesme_kalem(sozlesme, kalem, *, user=None) -> tuple[Optional[BirebirOgrenciProgrami], str]:
    tur = _kalem_sync_kind(kalem, sozlesme)
    if tur not in SYNCABLE_PAKET_TURLERI or not getattr(kalem, 'kalem_id', None):
        return None, 'noop'
    ep_id = _ensure_ogrenci_egitim_paketi(
        ogrenci_id=sozlesme.ogrenci_id,
        paket_turu=tur,
        paket_id=kalem.kalem_id,
        paket_adi=getattr(kalem, 'kalem_adi', '') or '',
        baslangic=getattr(sozlesme, 'baslangic_tarihi', None) or date.today(),
    )
    return ensure_program_for_package(
        ogrenci_id=sozlesme.ogrenci_id,
        kurum_id=sozlesme.kurum_id,
        sube_id=sozlesme.sube_id,
        egitim_yili_id=sozlesme.egitim_yili_id,
        paket_turu=tur,
        paket_id=kalem.kalem_id,
        ogrenci_egitim_paketi_id=ep_id,
        baslangic=getattr(sozlesme, 'baslangic_tarihi', None) or date.today(),
        user=user,
    )


def deactivate_program_for_sozlesme_kalem(sozlesme, kalem, *, user=None) -> str:
    tur = _kalem_sync_kind(kalem, sozlesme)
    if tur not in SYNCABLE_PAKET_TURLERI or not getattr(kalem, 'kalem_id', None):
        return 'noop'

    from apps.ogrenci.domain.models import OgrenciEgitimPaketi

    OgrenciEgitimPaketi.objects.filter(
        ogrenci_id=sozlesme.ogrenci_id,
        paket_turu=tur,
        paket_id=kalem.kalem_id,
        aktif_mi=True,
    ).update(aktif_mi=False)

    qs = BirebirOgrenciProgrami.objects.filter(
        kurum_id=sozlesme.kurum_id,
        sube_id=sozlesme.sube_id,
        egitim_yili_id=sozlesme.egitim_yili_id,
        ogrenci_id=sozlesme.ogrenci_id,
        durum=ProgramDurumu.AKTIF,
    )
    if tur == 'ozel_ders':
        qs = qs.filter(ozel_ders_paket_id=kalem.kalem_id)
    else:
        qs = qs.filter(premium_paket_id=kalem.kalem_id)
    updated = qs.update(durum=ProgramDurumu.PASIF, bitis_tarihi=date.today())
    return 'deactivated' if updated else 'skipped'


def ensure_program_from_sozlesme(sozlesme, *, user=None) -> tuple[Optional[BirebirOgrenciProgrami], str]:
    last_program = None
    last_action = 'noop'
    for tur, paket_id, paket_adi in iter_sozlesme_syncable_packages(sozlesme):
        ep_id = _ensure_ogrenci_egitim_paketi(
            ogrenci_id=sozlesme.ogrenci_id,
            paket_turu=tur,
            paket_id=paket_id,
            paket_adi=paket_adi,
            baslangic=getattr(sozlesme, 'baslangic_tarihi', None) or date.today(),
        )
        last_program, last_action = ensure_program_for_package(
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
    return last_program, last_action


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

    from apps.odeme_takip.domain.enums import SozlesmeDurum
    from apps.odeme_takip.domain.models import Sozlesme

    sozlesmeler = (
        Sozlesme.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            durum__in=[SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS],
        )
        .prefetch_related('kalemler')
        .order_by('id')
    )
    for sozlesme in sozlesmeler:
        _, action = ensure_program_from_sozlesme(sozlesme, user=user)
        summary[action] = summary.get(action, 0) + 1
    return summary
