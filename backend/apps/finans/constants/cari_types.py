"""
Cari Hesap & Cari Hareket Sabitleri
"""


class CariHesapTuru:
    """Cari hesap türleri."""
    MUSTERI = 'musteri'
    TEDARIKCI = 'tedarikci'
    KARMA = 'karma'  # Hem müşteri hem tedarikçi
    GELIR_HESABI = 'gelir_hesabi'   # Gelir odaklı cari (satış/tahsilat panosu)
    GIDER_HESABI = 'gider_hesabi'   # Gider odaklı cari (alış/ödeme panosu)
    DIGER = 'diger'                 # Genel amaçlı defter

    CHOICES = [
        (MUSTERI, 'Müşteri'),
        (TEDARIKCI, 'Tedarikçi'),
        (KARMA, 'Karma'),
        (GELIR_HESABI, 'Gelir Hesabı'),
        (GIDER_HESABI, 'Gider Hesabı'),
        (DIGER, 'Diğer'),
    ]

    # Türe göre yetenekler: satim = gelir/satış/tahsilat, alim = gider/alış/ödeme
    YETENEKLER = {
        MUSTERI: {'alim': False, 'satim': True},
        TEDARIKCI: {'alim': True, 'satim': False},
        KARMA: {'alim': True, 'satim': True},
        GELIR_HESABI: {'alim': False, 'satim': True},
        GIDER_HESABI: {'alim': True, 'satim': False},
        DIGER: {'alim': True, 'satim': True},
    }

    @classmethod
    def yetenek(cls, hesap_turu):
        return cls.YETENEKLER.get(hesap_turu, {'alim': True, 'satim': True})


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

    TAHSIL_EDILEBILIR = {ONAYLANDI, KISMI_TAHSIL}
