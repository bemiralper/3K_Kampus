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
    ILERI_TARIHLI = 'ileri_tarihli'
    KISMI_ODENDI = 'kismi_odendi'
    ODENDI = 'odendi'
    GECIKTI = 'gecikti'
    IPTAL = 'iptal'

    CHOICES = [
        (BEKLEMEDE, 'Bekliyor'),
        (ILERI_TARIHLI, 'İleri Tarihli'),
        (KISMI_ODENDI, 'Kısmi Ödendi'),
        (ODENDI, 'Ödendi'),
        (GECIKTI, 'Gecikmiş'),
        (IPTAL, 'İptal'),
    ]

    ACIK = {BEKLEMEDE, ILERI_TARIHLI, KISMI_ODENDI, GECIKTI}


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


class GiderOdemeDurumu:
    """Gider kaydı ödeme durumu (hesaplanan; kasa hareketinden bağımsız)."""
    BEKLIYOR = 'bekliyor'
    ILERI_TARIHLI = 'ileri_tarihli'
    KISMI_ODENDI = 'kismi_odendi'
    ODENDI = 'odendi'
    GECIKTI = 'gecikti'
    IPTAL = 'iptal'

    CHOICES = [
        (BEKLIYOR, 'Bekliyor'),
        (ILERI_TARIHLI, 'İleri Tarihli'),
        (KISMI_ODENDI, 'Kısmi Ödendi'),
        (ODENDI, 'Ödendi'),
        (GECIKTI, 'Gecikmiş'),
        (IPTAL, 'İptal'),
    ]

    LABEL = dict(CHOICES)


class GiderOdemeTakibiDurum:
    """
    Ödeme Takibi görünümü için satır durumu.
    Saklanan GiderTaksitDurum'u değiştirmez; vade tarihine göre hesaplanır.
    """
    BEKLIYOR = 'bekliyor'
    ILERI_TARIHLI = 'ileri_tarihli'
    YAKLASIYOR = 'yaklasiyor'
    BUGUN = 'bugun'
    GECIKTI = 'gecikti'
    KISMI_ODENDI = 'kismi_odendi'
    ODENDI = 'odendi'
    IPTAL = 'iptal'

    YAKLASAN_GUN = 7

    CHOICES = [
        (GECIKTI, 'Gecikmiş'),
        (BUGUN, 'Bugün'),
        (YAKLASIYOR, 'Yaklaşıyor'),
        (BEKLIYOR, 'Bekliyor'),
        (ILERI_TARIHLI, 'İleri Tarihli'),
        (KISMI_ODENDI, 'Kısmi Ödendi'),
        (ODENDI, 'Ödendi'),
        (IPTAL, 'İptal'),
    ]

    LABEL = dict(CHOICES)
    ACIK = {BEKLIYOR, ILERI_TARIHLI, YAKLASIYOR, BUGUN, GECIKTI, KISMI_ODENDI}
