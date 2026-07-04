"""
Gider & Ödeme Sabitleri
(Tedarikçi-bağımsız, gider iş akışı sabitleri)
"""


class GiderDurum:
    """Gider kaydı durum akışı."""
    TASLAK = 'taslak'
    ONAY_BEKLIYOR = 'onay_bekliyor'
    ONAYLANDI = 'onaylandi'
    KISMI_ODENDI = 'kismi_odendi'
    ODENDI = 'odendi'
    IPTAL = 'iptal'

    CHOICES = [
        (TASLAK, 'Taslak'),
        (ONAY_BEKLIYOR, 'Onay Bekliyor'),
        (ONAYLANDI, 'Onaylandı'),
        (KISMI_ODENDI, 'Kısmi Ödendi'),
        (ODENDI, 'Ödendi'),
        (IPTAL, 'İptal'),
    ]

    # Durum grupları – domain property'lerinde kullanılır
    ODENEBILIR = {ONAYLANDI, KISMI_ODENDI}
    IPTAL_EDILEBILIR = {TASLAK, ONAY_BEKLIYOR, ONAYLANDI, KISMI_ODENDI}
    DUZENLENEBILIR = {TASLAK}


class GiderTaksitDurum:
    """Gider taksit durum akışı."""
    BEKLEMEDE = 'beklemede'
    KISMI_ODENDI = 'kismi_odendi'
    ODENDI = 'odendi'
    GECIKTI = 'gecikti'
    IPTAL = 'iptal'

    CHOICES = [
        (BEKLEMEDE, 'Beklemede'),
        (KISMI_ODENDI, 'Kısmi Ödendi'),
        (ODENDI, 'Ödendi'),
        (GECIKTI, 'Gecikti'),
        (IPTAL, 'İptal'),
    ]


class OdemeDurum:
    """Ödeme durumu."""
    TAMAMLANDI = 'tamamlandi'
    IPTAL = 'iptal'

    CHOICES = [
        (TAMAMLANDI, 'Tamamlandı'),
        (IPTAL, 'İptal'),
    ]


class KdvOrani:
    """Standart KDV oranları."""
    SIFIR = 0
    BIR = 1
    ON = 10
    YIRMI = 20

    CHOICES = [
        (SIFIR, '%0'),
        (BIR, '%1'),
        (ON, '%10'),
        (YIRMI, '%20'),
    ]


class TekrarSikligi:
    """Tekrarlayan gider sıklıkları."""
    AYLIK = 'aylik'
    UC_AYLIK = 'uc_aylik'
    ALTI_AYLIK = 'alti_aylik'
    YILLIK = 'yillik'

    CHOICES = [
        (AYLIK, 'Aylık'),
        (UC_AYLIK, '3 Aylık'),
        (ALTI_AYLIK, '6 Aylık'),
        (YILLIK, 'Yıllık'),
    ]
