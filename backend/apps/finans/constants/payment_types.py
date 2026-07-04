"""
Ödeme Yöntemi Tip Sabitleri
Kurum düzeyinde tanımlanan ödeme yöntemlerinin tip sınıflandırması.
"""


class OdemeYontemiTipi:
    """
    Ödeme yönteminin fiziksel/dijital tahsilat kanalını belirler.
    """
    NAKIT = 'nakit'
    POS = 'pos'
    HAVALE_EFT = 'havale_eft'
    ONLINE = 'online'
    CEK = 'cek'
    SENET = 'senet'

    CHOICES = [
        (NAKIT, 'Nakit'),
        (POS, 'POS Cihazı'),
        (HAVALE_EFT, 'Havale / EFT'),
        (ONLINE, 'Online Ödeme'),
        (CEK, 'Çek'),
        (SENET, 'Senet'),
    ]

    @classmethod
    def get_label(cls, value):
        """Enum değerine karşılık gelen label'ı döndürür."""
        return dict(cls.CHOICES).get(value, value)

    @classmethod
    def get_values(cls):
        """Tüm geçerli değerleri döndürür."""
        return [c[0] for c in cls.CHOICES]
