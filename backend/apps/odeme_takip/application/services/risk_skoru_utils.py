"""
Öğrenci mali risk skoru yardımcıları.

Risk skoru 0–100 arasıdır; yüksek skor = düşük ödeme riski (iyi davranış).
Skor; gecikme, ortalama gecikme günü, kısmi ödeme ve vadesi gelmiş taksitlere uyumu ölçer.
Toplam sözleşme tahsilat oranı (henüz vadesi gelmemiş taksitler dahil) risk hesabına dahil edilmez.
"""


def hesapla_vade_uyum_orani(vadesi_gelen_tutar: float, vadesi_gelen_odenen: float) -> float:
    """Vadesi gelmiş taksitlerde tahsilat oranı. Vadesi gelen yoksa %100 (plan dahilinde)."""
    if vadesi_gelen_tutar <= 0:
        return 100.0
    oran = vadesi_gelen_odenen / vadesi_gelen_tutar * 100
    return round(min(100.0, max(0.0, oran)), 1)


def hesapla_risk_skoru(
    gecikme_sayisi: int,
    ort_gecikme_gun: float,
    kismi_oran: float,
    vade_uyum_orani: float,
) -> int:
    """Davranışsal ödeme riski — vadesi gelmemiş taksitler cezalandırılmaz."""
    gecikme_puan = max(0, 100 - (gecikme_sayisi * 15))
    gun_puan = max(0, 100 - (ort_gecikme_gun * 2))
    kismi_puan = max(0, 100 - (kismi_oran * 1.5))
    vade_puan = vade_uyum_orani

    risk_skoru = round(
        gecikme_puan * 0.3 + gun_puan * 0.25 + kismi_puan * 0.15 + vade_puan * 0.3
    )
    return max(0, min(100, risk_skoru))


def risk_seviyesi(risk_skoru: int) -> str:
    if risk_skoru >= 80:
        return 'dusuk'
    if risk_skoru >= 60:
        return 'orta'
    if risk_skoru >= 40:
        return 'yuksek'
    return 'kritik'
