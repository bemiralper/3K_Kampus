"""
Cari Hesap & Cari Hareket Sabitleri
"""


class CariHesapTuru:
    """Cari hesap türleri."""
    MUSTERI = 'musteri'
    TEDARIKCI = 'tedarikci'
    KARMA = 'karma'  # Hem müşteri hem tedarikçi

    CHOICES = [
        (MUSTERI, 'Müşteri'),
        (TEDARIKCI, 'Tedarikçi'),
        (KARMA, 'Karma'),
    ]


class CariHareketTuru:
    """Cari hareket işlem türleri."""
    SATIS = 'satis'              # Satış → Borç artar
    ALIS = 'alis'                # Alış/Gider → Alacak artar
    TAHSILAT = 'tahsilat'        # Müşteriden tahsilat → Borç azalır
    ODEME = 'odeme'              # Tedarikçiye ödeme → Alacak azalır
    AVANS = 'avans'              # Verilen/Alınan avans
    IADE = 'iade'                # İade işlemi
    DUZELTME = 'duzeltme'        # Manuel düzeltme
    MAHSUP = 'mahsup'            # Bakiyeden mahsup
    DEVIR = 'devir'              # Dönem devri
    ACILIS = 'acilis'            # Açılış bakiyesi

    CHOICES = [
        (SATIS, 'Satış'),
        (ALIS, 'Alış'),
        (TAHSILAT, 'Tahsilat'),
        (ODEME, 'Ödeme'),
        (AVANS, 'Avans'),
        (IADE, 'İade'),
        (DUZELTME, 'Düzeltme'),
        (MAHSUP, 'Bakiye Mahsubu'),
        (DEVIR, 'Devir'),
        (ACILIS, 'Açılış Bakiyesi'),
    ]


class CariHareketYonu:
    """Cari hareket yönü — borç mu alacak mı?"""
    BORC = 'borc'       # Karşı tarafın bize borcu artar
    ALACAK = 'alacak'   # Karşı tarafın bize borcu azalır

    CHOICES = [
        (BORC, 'Borç'),
        (ALACAK, 'Alacak'),
    ]


class GelirDurum:
    """Gelir kaydı durum akışı."""
    TASLAK = 'taslak'
    ONAYLANDI = 'onaylandi'
    KISMI_TAHSIL = 'kismi_tahsil'
    TAHSIL_EDILDI = 'tahsil_edildi'
    IPTAL = 'iptal'

    CHOICES = [
        (TASLAK, 'Taslak'),
        (ONAYLANDI, 'Onaylandı'),
        (KISMI_TAHSIL, 'Kısmi Tahsil'),
        (TAHSIL_EDILDI, 'Tahsil Edildi'),
        (IPTAL, 'İptal'),
    ]
