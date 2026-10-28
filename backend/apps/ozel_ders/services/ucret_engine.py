"""
Konfigüre edilebilir ücret motoru.

Kural tablosu (UcretKurali) + PersonelSozlesme mesai / birim ücret.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time
from decimal import ROUND_HALF_UP, Decimal
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
    ).prefetch_related('mesai_saatleri', 'ders_ucretleri__brans')
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


def _norm(value) -> str:
    return ' '.join(str(value or '').replace('İ', 'i').replace('I', 'ı').lower().split())


def _row_matches_ders(row, ders) -> bool:
    brans = getattr(row, 'brans', None)
    if brans is None or ders is None:
        return False
    brans_ad, brans_kod = _norm(getattr(brans, 'ad', '')), _norm(getattr(brans, 'kod', ''))
    ders_ad, ders_kod = _norm(getattr(ders, 'ad', '')), _norm(getattr(ders, 'kod', ''))
    kisa = _norm(getattr(ders, 'kisa_ad', ''))
    if brans_kod and brans_kod == ders_kod:
        return True
    if not brans_ad:
        return False
    return any(name and (name == brans_ad or name.startswith(brans_ad)) for name in (ders_ad, kisa))


def _rate_row(sozlesme, ders=None):
    """Oturumun dersine uyan ücret satırı; eşleşme yoksa branşsız satır.

    Farklı ücretli birden fazla satır varsa ve hiçbiri derse uymuyorsa None döner —
    yanlış branşın ücretiyle ödeme yapılmasın.
    """
    rows = [r for r in sozlesme.ders_ucretleri.all() if r.birim_ucret and r.birim_ucret > 0]
    if not rows:
        return None
    for row in rows:
        if _row_matches_ders(row, ders):
            return row
    generic = [r for r in rows if getattr(r, 'brans_id', None) is None and getattr(r, 'brans', None) is None]
    if generic:
        return generic[0]
    if len({(Decimal(r.birim_ucret), r.ucret_tipi) for r in rows}) == 1:
        return rows[0]
    return None


def _has_ambiguous_rates(sozlesme) -> bool:
    if sozlesme.ders_birim_ucret and sozlesme.ders_birim_ucret > 0:
        return False
    return any(r.birim_ucret and r.birim_ucret > 0 for r in sozlesme.ders_ucretleri.all())


def _unit_rate(sozlesme, ders=None) -> Decimal:
    if sozlesme.ders_birim_ucret and sozlesme.ders_birim_ucret > 0:
        return Decimal(sozlesme.ders_birim_ucret)
    row = _rate_row(sozlesme, ders)
    if row is not None:
        return Decimal(row.birim_ucret)
    return Decimal('0.00')


def _ucret_tipi(sozlesme, ders=None) -> str:
    from apps.personel.domain.sozlesme_models import DersUcretTipi

    if not (sozlesme.ders_birim_ucret and sozlesme.ders_birim_ucret > 0):
        row = _rate_row(sozlesme, ders)
        if row is not None and row.ucret_tipi in (DersUcretTipi.SAAT_BASI, DersUcretTipi.DERS_BASI):
            return row.ucret_tipi
    return sozlesme.ders_ucret_tipi or DersUcretTipi.SAAT_BASI


def _calc_amount(sozlesme, birim: Decimal, sure_dk: int, ders=None) -> Decimal:
    from apps.personel.domain.sozlesme_models import DersUcretTipi

    if _ucret_tipi(sozlesme, ders) == DersUcretTipi.DERS_BASI:
        return birim
    hours = Decimal(sure_dk) / Decimal('60')
    return (birim * hours).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def evaluate(oturum: BirebirDersOturumu) -> UcretSonuc:
    sure_dk = oturum.duration_minutes()
    ders = getattr(oturum, 'ders', None)
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
            birim_ucret=_unit_rate(soz, ders),
            sure_dk=sure_dk,
            reason='ONLINE oturumlar bu kuralda ücretlendirilmiyor',
            mesai_modu=mesai_modu,
            sozlesme_turu=sozlesme_turu,
        )

    if oturum.durum not in (OturumDurumu.ISLENDI, OturumDurumu.ONLINE):
        return UcretSonuc(
            payable=False,
            tutar=Decimal('0.00'),
            birim_ucret=_unit_rate(soz, ders),
            sure_dk=sure_dk,
            reason=f'Durum ücretlendirmeye uygun değil ({oturum.durum})',
            mesai_modu=mesai_modu,
            sozlesme_turu=sozlesme_turu,
        )

    if mesai_modu == MesaiModu.HICBIR_ZAMAN:
        return UcretSonuc(
            payable=False,
            tutar=Decimal('0.00'),
            birim_ucret=_unit_rate(soz, ders),
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
                birim_ucret=_unit_rate(soz, ders),
                sure_dk=sure_dk,
                reason='Mesai saatleri içinde — ücret yok',
                mesai_modu=mesai_modu,
                sozlesme_turu=sozlesme_turu,
            )

    birim = _unit_rate(soz, ders)
    if birim <= 0:
        return UcretSonuc(
            payable=False,
            tutar=Decimal('0.00'),
            birim_ucret=birim,
            sure_dk=sure_dk,
            reason=(
                'Bu derse uyan ders ücreti satırı yok (sözleşmede farklı branş ücretleri var)'
                if _has_ambiguous_rates(soz)
                else 'Birim ücret tanımlı değil'
            ),
            mesai_modu=mesai_modu,
            sozlesme_turu=sozlesme_turu,
        )

    tutar = _calc_amount(soz, birim, sure_dk, ders)
    return UcretSonuc(
        payable=True,
        tutar=tutar,
        birim_ucret=birim,
        sure_dk=sure_dk,
        reason='Ücret hesaplandı',
        mesai_modu=mesai_modu,
        sozlesme_turu=sozlesme_turu,
    )
