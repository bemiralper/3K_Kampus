"""
Bakiye Hareketi & Dönem Bakiye Sabitleri
Finansal hareket tiplerini ve dönem durumlarını tanımlar.
"""


class HareketYonu:
    """Bakiye hareketinin yönü — kasaya giriş mi çıkış mı."""
    GIRIS = 'giris'
    CIKIS = 'cikis'

    CHOICES = [
        (GIRIS, 'Giriş (+)'),
        (CIKIS, 'Çıkış (-)'),
    ]

    @classmethod
    def get_label(cls, value):
        return dict(cls.CHOICES).get(value, value)


class HareketKaynagi:
    """
    Hareketin nereden geldiğini belirler.
    Sistem otomatik olarak veya kullanıcı manuel olarak hareket oluşturabilir.
    """
    TAHSILAT = 'tahsilat'
    TAHSILAT_IPTAL = 'tahsilat_iptal'
    IADE = 'iade'
    GIDER = 'gider'
    GIDER_IPTAL = 'gider_iptal'
    GELIR = 'gelir'
    GELIR_IPTAL = 'gelir_iptal'
    AVANS = 'avans'
    MAHSUP = 'mahsup'
    DEVIR = 'devir'
    MANUEL = 'manuel'
    ACILIS = 'acilis'
    TRANSFER = 'transfer'

    CHOICES = [
        (TAHSILAT, 'Tahsilat'),
        (TAHSILAT_IPTAL, 'Tahsilat İptal'),
        (IADE, 'İade'),
        (GIDER, 'Gider'),
        (GIDER_IPTAL, 'Gider İptal'),
        (GELIR, 'Gelir'),
        (GELIR_IPTAL, 'Gelir İptal'),
        (AVANS, 'Avans'),
        (MAHSUP, 'Cari Bakiye Mahsubu'),
        (DEVIR, 'Dönem Devri'),
        (MANUEL, 'Manuel Düzeltme'),
        (ACILIS, 'Açılış Bakiyesi'),
        (TRANSFER, 'Hesaplar Arası Transfer'),
    ]

    # Giriş yapan kaynaklar
    GIRIS_KAYNAKLARI = [TAHSILAT, GIDER_IPTAL, GELIR, DEVIR, MANUEL, ACILIS, TRANSFER]
    # Çıkış yapan kaynaklar
    CIKIS_KAYNAKLARI = [TAHSILAT_IPTAL, IADE, GIDER, GELIR_IPTAL, AVANS, TRANSFER]

    @classmethod
    def get_label(cls, value):
        return dict(cls.CHOICES).get(value, value)

    @classmethod
    def get_values(cls):
        return [c[0] for c in cls.CHOICES]


class TransferTuru:
    """Hesap transferi işleminin etiketlenmesi için tür bilgisi (raporlama amaçlı)."""
    VIRMAN = 'virman'
    KASADAN_BANKAYA = 'kasadan_bankaya'
    BANKADAN_KASAYA = 'bankadan_kasaya'

    CHOICES = [
        (VIRMAN, 'Virman'),
        (KASADAN_BANKAYA, 'Bankaya Para Yatırma'),
        (BANKADAN_KASAYA, 'Bankadan Kasaya Çekme'),
    ]

    @classmethod
    def get_label(cls, value):
        return dict(cls.CHOICES).get(value, value)


class DonemDurum:
    """Dönem bakiye kaydının durumu."""
    ACIK = 'acik'
    KAPANDI = 'kapandi'
    DEVREDILDI = 'devredildi'

    CHOICES = [
        (ACIK, 'Açık'),
        (KAPANDI, 'Kapandı'),
        (DEVREDILDI, 'Devredildi'),
    ]

    @classmethod
    def get_label(cls, value):
        return dict(cls.CHOICES).get(value, value)
