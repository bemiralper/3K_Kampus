"""
İşlem Masrafı (Kesinti) sabitleri — banka/POS komisyon ve masraf türleri.
Kullanıcı tarafından manuel girilir; otomatik hesaplama yapılmaz.
"""
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.constants.account_types import MaliHesapTipi


class KesintiTuru:
    HAVALE_MASRAFI = 'havale_masrafi'
    EFT_MASRAFI = 'eft_masrafi'
    FAST_UCRETI = 'fast_ucreti'
    POS_KOMISYONU = 'pos_komisyonu'
    SANAL_POS_KOMISYONU = 'sanal_pos_komisyonu'
    ONLINE_ODEME_KOMISYONU = 'online_odeme_komisyonu'
    HESAP_ISLETIM_UCRETI = 'hesap_isletim_ucreti'
    DOVIZ_CEVRIM_MASRAFI = 'doviz_cevrim_masrafi'
    DIGER_BANKA_MASRAFLARI = 'diger_banka_masraflari'

    CHOICES = [
        (HAVALE_MASRAFI, 'Havale Masrafı'),
        (EFT_MASRAFI, 'EFT Masrafı'),
        (FAST_UCRETI, 'FAST Ücreti'),
        (POS_KOMISYONU, 'POS Komisyonu'),
        (SANAL_POS_KOMISYONU, 'Sanal POS Komisyonu'),
        (ONLINE_ODEME_KOMISYONU, 'Online Ödeme Komisyonu'),
        (HESAP_ISLETIM_UCRETI, 'Hesap İşletim Ücreti'),
        (DOVIZ_CEVRIM_MASRAFI, 'Döviz Çevrim Masrafı'),
        (DIGER_BANKA_MASRAFLARI, 'Diğer Banka Masrafları'),
    ]

    @classmethod
    def get_label(cls, value):
        return dict(cls.CHOICES).get(value, value)

    @classmethod
    def get_values(cls):
        return [c[0] for c in cls.CHOICES]


# Kesinti türü → Banka Giderleri alt kategori adı
KESINTI_ALT_KATEGORI = {
    KesintiTuru.HAVALE_MASRAFI: 'Havale Masrafı',
    KesintiTuru.EFT_MASRAFI: 'EFT Masrafı',
    KesintiTuru.FAST_UCRETI: 'FAST Ücreti',
    KesintiTuru.POS_KOMISYONU: 'POS Komisyonu',
    KesintiTuru.SANAL_POS_KOMISYONU: 'Sanal POS Komisyonu',
    KesintiTuru.ONLINE_ODEME_KOMISYONU: 'Online Ödeme Komisyonu',
    KesintiTuru.HESAP_ISLETIM_UCRETI: 'Hesap İşletim Ücreti',
    KesintiTuru.DOVIZ_CEVRIM_MASRAFI: 'Döviz Çevrim Masrafı',
    KesintiTuru.DIGER_BANKA_MASRAFLARI: 'Diğer Banka Masrafları',
}

BANKA_GIDERLERI_ANA_KATEGORI = 'Banka Giderleri'

# Ödeme yöntemi / mali hesap tipleri — masraf alanları gösterilir
MASRAF_GEREKLI_ODEME_TIPS = frozenset({
    OdemeYontemiTipi.POS,
    OdemeYontemiTipi.HAVALE_EFT,
    OdemeYontemiTipi.ONLINE,
})

MASRAF_GEREKLI_HESAP_TIPS = frozenset({
    MaliHesapTipi.BANKA,
    MaliHesapTipi.POS,
    MaliHesapTipi.SANAL_POS,
})


def islem_masrafi_gerekli(odeme_yontemi_tip=None, mali_hesap_tip=None):
    """Masraf alanlarının gösterilip gösterilmeyeceğini belirler."""
    if odeme_yontemi_tip in MASRAF_GEREKLI_ODEME_TIPS:
        return True
    if mali_hesap_tip in MASRAF_GEREKLI_HESAP_TIPS:
        return True
    return False
