"""
Cari v2 — Risk hesaplama servisi (tek merkez).

Risk durumu; açık borç, risk limiti ve vadesi geçmiş tutar üzerinden
hesaplanır. Bu mantık yalnızca burada tanımlıdır; liste, dashboard,
panel ve raporlar bu servisi kullanır.
"""
from __future__ import annotations

RISK_NORMAL = 'normal'
RISK_IZLEMEDE = 'izlemede'
RISK_LIMIT_ASILDI = 'limit_asildi'
RISK_RISKLI = 'riskli'
RISK_KRITIK = 'kritik'

RISK_LABELS = {
    RISK_NORMAL: 'Normal',
    RISK_IZLEMEDE: 'İzlemede',
    RISK_LIMIT_ASILDI: 'Limit Aşıldı',
    RISK_RISKLI: 'Riskli',
    RISK_KRITIK: 'Kritik',
}

# Riskli sayılan durumlar (dashboard "riskli cari" sayımı için)
RISKLI_DURUMLAR = {RISK_LIMIT_ASILDI, RISK_RISKLI, RISK_KRITIK}


def hesapla_risk(
    acik_borc: float,
    risk_limiti: float = 0.0,
    vadesi_gecmis: float = 0.0,
    *,
    acik_alacak: float = 0.0,
    hesap_turu: str | None = None,
) -> dict:
    """
    Args:
        acik_borc: Ödenecek açık tutar (net bakiye negatifse mutlak değeri).
        risk_limiti: Tanımlı risk limiti (0 = limit yok).
        vadesi_gecmis: Vadesi geçmiş açık tutar.
        acik_alacak: Tahsil edilecek açık tutar (net bakiye pozitifse).
        hesap_turu: Cari türü ('musteri', 'tedarikci', 'karma', 'gelir_hesabi', 'gider_hesabi', 'diger').

    Returns:
        {risk_durumu, risk_durumu_display, risk_skoru, kullanim_orani,
         limit_asim, vadesi_gecmis, risk_limiti, risk_maruziyeti}
    """
    acik_borc = float(acik_borc or 0)
    acik_alacak = float(acik_alacak or 0)
    risk_limiti = float(risk_limiti or 0)
    vadesi_gecmis = float(vadesi_gecmis or 0)

    if hesap_turu in ('musteri', 'gelir_hesabi'):
        maruziyet = acik_alacak
    elif hesap_turu in ('tedarikci', 'gider_hesabi'):
        maruziyet = acik_borc
    else:
        maruziyet = max(acik_borc, acik_alacak)

    kullanim_orani = 0.0
    limit_asim = 0.0
    if risk_limiti > 0:
        kullanim_orani = round(maruziyet / risk_limiti * 100, 2)
        if maruziyet > risk_limiti:
            limit_asim = round(maruziyet - risk_limiti, 2)

    limit_asildi = risk_limiti > 0 and maruziyet > risk_limiti

    if vadesi_gecmis > 0 and limit_asildi:
        durum = RISK_KRITIK
    elif vadesi_gecmis > 0:
        durum = RISK_RISKLI
    elif limit_asildi:
        durum = RISK_LIMIT_ASILDI
    elif risk_limiti > 0 and kullanim_orani >= 80:
        durum = RISK_IZLEMEDE
    else:
        durum = RISK_NORMAL

    # Risk skoru 0-100
    skor = 0.0
    if risk_limiti > 0:
        skor = min(kullanim_orani, 100.0)
    if vadesi_gecmis > 0:
        skor = max(skor, 70.0)
    if limit_asildi:
        skor = max(skor, 90.0)
    if durum == RISK_KRITIK:
        skor = 100.0

    return {
        'risk_durumu': durum,
        'risk_durumu_display': RISK_LABELS[durum],
        'risk_skoru': round(skor, 2),
        'kullanim_orani': kullanim_orani,
        'limit_asim': limit_asim,
        'vadesi_gecmis': round(vadesi_gecmis, 2),
        'risk_limiti': round(risk_limiti, 2),
        'risk_maruziyeti': round(maruziyet, 2),
    }


def riskli_mi(risk_durumu: str) -> bool:
    return risk_durumu in RISKLI_DURUMLAR
