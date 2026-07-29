"""
Konfigüre edilebilir ücret motoru.

Kural tablosu (UcretKurali) + PersonelSozlesme mesai / birim ücret.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time
from decimal import Decimal
from typing import Optional

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    MesaiModu,
    OturumDurumu,
    OturumTuru,
    UcretKurali,
)


DEFAULT_RULES = [
    # oturum_turu, sozlesme_turu, mesai_modu
    (OturumTuru.OZEL, 'TAM_ZAMANLI', MesaiModu.MESAI_DISI_SADECE),
    (OturumTuru.OZEL, 'DERS_UCRETLI', MesaiModu.HER_ZAMAN),
    (OturumTuru.OZEL, 'KARMA', MesaiModu.MESAI_DISI_SADECE),
    (OturumTuru.TELAFI, 'TAM_ZAMANLI', MesaiModu.MESAI_DISI_SADECE),
    (OturumTuru.TELAFI, 'DERS_UCRETLI', MesaiModu.HER_ZAMAN),
    (OturumTuru.TELAFI, 'KARMA', MesaiModu.MESAI_DISI_SADECE),
    (OturumTuru.EK, 'TAM_ZAMANLI', MesaiModu.MESAI_DISI_SADECE),
    (OturumTuru.EK, 'DERS_UCRETLI', MesaiModu.HER_ZAMAN),
    (OturumTuru.EK, 'KARMA', MesaiModu.MESAI_DISI_SADECE),
    (OturumTuru.ETUT, 'TAM_ZAMANLI', MesaiModu.MESAI_DISI_SADECE),
    (OturumTuru.ETUT, 'DERS_UCRETLI', MesaiModu.HER_ZAMAN),
    (OturumTuru.ETUT, 'KARMA', MesaiModu.MESAI_DISI_SADECE),
]


@dataclass
class UcretSonuc:
    payable: bool
    tutar: Decimal
    birim_ucret: Decimal
    sure_dk: int
    reason: str
    mesai_modu: str
    sozlesme_turu: str


def seed_default_rules(*, kurum_id: Optional[int] = None, sube_id: Optional[int] = None) -> int:
    created = 0
    for oturum_turu, sozlesme_turu, mesai_modu in DEFAULT_RULES:
        _, was_created = UcretKurali.objects.get_or_create(
            kurum_id=kurum_id,
            sube_id=sube_id,
            oturum_turu=oturum_turu,
            sozlesme_turu=sozlesme_turu,
            defaults={
                'mesai_modu': mesai_modu,
                'online_ucretlendir': True,
                'aktif': True,
            },
        )
        if was_created:
            created += 1
    return created


def _get_active_contract(ogretmen_id: int, day: date, kurum_id: int, sube_id: Optional[int]):
    from apps.personel.domain.sozlesme_models import PersonelSozlesme, SozlesmeDurumu
    from django.db.models import Q

    qs = PersonelSozlesme.objects.filter(
        personel_id=ogretmen_id,
        kurum_id=kurum_id,
        durum=SozlesmeDurumu.AKTIF,
        baslangic_tarihi__lte=day,
        bitis_tarihi__gte=day,
    ).prefetch_related('mesai_saatleri', 'ders_ucretleri')
    if sube_id:
        qs = qs.filter(Q(sube_id=sube_id) | Q(sube__isnull=True))
    return qs.order_by('-id').first()


def _resolve_rule(
    *,
    kurum_id: int,
    sube_id: int,
    oturum_turu: str,
    sozlesme_turu: str,
) -> Optional[UcretKurali]:
    # En spesifik → global
    for filters in (
        {'kurum_id': kurum_id, 'sube_id': sube_id},
        {'kurum_id': kurum_id, 'sube_id': None},
        {'kurum_id': None, 'sube_id': None},
    ):
        rule = UcretKurali.objects.filter(
            aktif=True,
            oturum_turu=oturum_turu,
            sozlesme_turu=sozlesme_turu,
            **filters,
        ).first()
        if rule:
            return rule
    return None


def _is_outside_mesai(sozlesme, day: date, start: time) -> bool:
    """Ders başlangıcı mesai bitişinden sonra (veya mesai günü değilse) True."""
    weekday = day.isoweekday()
    mesai = None
    for row in sozlesme.mesai_saatleri.all():
        if row.gun == weekday:
            mesai = row
            break

    if not mesai or not mesai.aktif:
        # Çalışma günü değil → mesai dışı say
        return True
    if not mesai.bitis:
        return True
    return start >= mesai.bitis


def _unit_rate(sozlesme) -> Decimal:
    if sozlesme.ders_birim_ucret and sozlesme.ders_birim_ucret > 0:
        return Decimal(sozlesme.ders_birim_ucret)
    first = sozlesme.ders_ucretleri.first() if hasattr(sozlesme, 'ders_ucretleri') else None
    if first and first.birim_ucret:
        return Decimal(first.birim_ucret)
    return Decimal('0.00')


def _calc_amount(sozlesme, birim: Decimal, sure_dk: int) -> Decimal:
    from apps.personel.domain.sozlesme_models import DersUcretTipi

    tip = sozlesme.ders_ucret_tipi or DersUcretTipi.SAAT_BASI
    if tip == DersUcretTipi.DERS_BASI:
        return birim
    # Saat başı
    hours = Decimal(sure_dk) / Decimal('60')
    return (birim * hours).quantize(Decimal('0.01'))


def evaluate(oturum: BirebirDersOturumu) -> UcretSonuc:
    sure_dk = oturum.duration_minutes()
    soz = _get_active_contract(
        oturum.ogretmen_id,
        oturum.session_date,
        oturum.kurum_id,
        oturum.sube_id,
    )
    if not soz:
        return UcretSonuc(
            payable=False,
            tutar=Decimal('0.00'),
            birim_ucret=Decimal('0.00'),
            sure_dk=sure_dk,
            reason='Aktif sözleşme yok',
            mesai_modu='',
            sozlesme_turu='',
        )

    sozlesme_turu = soz.sozlesme_turu
    rule = _resolve_rule(
        kurum_id=oturum.kurum_id,
        sube_id=oturum.sube_id,
        oturum_turu=oturum.oturum_turu,
        sozlesme_turu=sozlesme_turu,
    )
    if not rule:
        # Fallback seed semantics
        if sozlesme_turu == 'DERS_UCRETLI':
            mesai_modu = MesaiModu.HER_ZAMAN
            online_ok = True
        else:
            mesai_modu = MesaiModu.MESAI_DISI_SADECE
            online_ok = True
    else:
        mesai_modu = rule.mesai_modu
        online_ok = rule.online_ucretlendir

    if oturum.durum == OturumDurumu.ONLINE and not online_ok:
        return UcretSonuc(
            payable=False,
            tutar=Decimal('0.00'),
            birim_ucret=_unit_rate(soz),
            sure_dk=sure_dk,
            reason='ONLINE oturumlar bu kuralda ücretlendirilmiyor',
            mesai_modu=mesai_modu,
            sozlesme_turu=sozlesme_turu,
        )

    if oturum.durum not in (OturumDurumu.ISLENDI, OturumDurumu.ONLINE):
        return UcretSonuc(
            payable=False,
            tutar=Decimal('0.00'),
            birim_ucret=_unit_rate(soz),
            sure_dk=sure_dk,
            reason=f'Durum ücretlendirmeye uygun değil ({oturum.durum})',
            mesai_modu=mesai_modu,
            sozlesme_turu=sozlesme_turu,
        )

    if mesai_modu == MesaiModu.HICBIR_ZAMAN:
        return UcretSonuc(
            payable=False,
            tutar=Decimal('0.00'),
            birim_ucret=_unit_rate(soz),
            sure_dk=sure_dk,
            reason='Kural: hiçbir zaman ücretlendirme',
            mesai_modu=mesai_modu,
            sozlesme_turu=sozlesme_turu,
        )

    if mesai_modu == MesaiModu.MESAI_DISI_SADECE:
        if not _is_outside_mesai(soz, oturum.session_date, oturum.start_time):
            return UcretSonuc(
                payable=False,
                tutar=Decimal('0.00'),
                birim_ucret=_unit_rate(soz),
                sure_dk=sure_dk,
                reason='Mesai saatleri içinde — ücret yok',
                mesai_modu=mesai_modu,
                sozlesme_turu=sozlesme_turu,
            )

    birim = _unit_rate(soz)
    if birim <= 0:
        return UcretSonuc(
            payable=False,
            tutar=Decimal('0.00'),
            birim_ucret=birim,
            sure_dk=sure_dk,
            reason='Birim ücret tanımlı değil',
            mesai_modu=mesai_modu,
            sozlesme_turu=sozlesme_turu,
        )

    tutar = _calc_amount(soz, birim, sure_dk)
    return UcretSonuc(
        payable=True,
        tutar=tutar,
        birim_ucret=birim,
        sure_dk=sure_dk,
        reason='Ücret hesaplandı',
        mesai_modu=mesai_modu,
        sozlesme_turu=sozlesme_turu,
    )
