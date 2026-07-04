"""
Mali Hesap Tip Sabitleri
Şube düzeyinde tanımlanan mali hesapların tip sınıflandırması.
"""


class MaliHesapTipi:
    """
    Mali hesabın türünü belirler.
    KASA: Fiziksel nakit kasası
    BANKA: Banka hesabı (IBAN opsiyonel)
    POS: POS cihazı hesabı (banka seçimi zorunlu)
    SANAL_POS: Sanal POS / Online ödeme hesabı
    E_CUZDAN: E-cüzdan hesabı
    DIGER: Diğer mali hesaplar
    """
    KASA = 'kasa'
    BANKA = 'banka'
    POS = 'pos'
    SANAL_POS = 'sanal_pos'
    E_CUZDAN = 'e_cuzdan'
    DIGER = 'diger'

    CHOICES = [
        (BANKA, 'Banka Hesabı'),
        (KASA, 'Nakit Kasa'),
        (POS, 'POS Hesabı'),
        (SANAL_POS, 'Sanal POS'),
        (E_CUZDAN, 'E-Cüzdan'),
        (DIGER, 'Diğer'),
    ]

    # IBAN zorunluluğu yok — girildiğinde format kontrolü yapılır
    IBAN_ZORUNLU: list[str] = []

    # IBAN / hesap no alanlarının gösterildiği tipler
    BANKA_DETAY = [BANKA]

    # Banka seçimi zorunlu tipler
    BANKA_ZORUNLU = [BANKA, POS]

    @classmethod
    def get_label(cls, value):
        """Enum değerine karşılık gelen label'ı döndürür."""
        return dict(cls.CHOICES).get(value, value)

    @classmethod
    def get_values(cls):
        """Tüm geçerli değerleri döndürür."""
        return [c[0] for c in cls.CHOICES]

    @classmethod
    def banka_detay_mi(cls, tip):
        """Verilen tip için IBAN/hesap no alanları kullanılır mı?"""
        return tip in cls.BANKA_DETAY

    @classmethod
    def banka_zorunlu_mu(cls, tip):
        """Verilen tip için banka seçimi zorunlu mu?"""
        return tip in cls.BANKA_ZORUNLU


class BankaKodu:
    """Türkiye'deki yaygın bankalar — mali hesap banka dropdown'u."""

    VAKIFBANK = 'vakifbank'
    ZIRAAT = 'ziraat'
    HALKBANK = 'halkbank'
    IS_BANKASI = 'is_bankasi'
    GARANTI = 'garanti'
    AKBANK = 'akbank'
    YAPI_KREDI = 'yapi_kredi'
    QNB = 'qnb'
    TEB = 'teb'
    DENIZBANK = 'denizbank'
    ING = 'ing'
    HSBC = 'hsbc'
    FIBABANK = 'fibabank'
    SEKERBANK = 'sekerbank'
    ODEABANK = 'odeabank'
    ALBARAKA = 'albaraka'
    KUVEYT = 'kuveyt'
    DIGER = 'diger'

    CHOICES = [
        (VAKIFBANK, 'VakıfBank'),
        (ZIRAAT, 'Ziraat Bankası'),
        (HALKBANK, 'Halkbank'),
        (IS_BANKASI, 'İş Bankası'),
        (GARANTI, 'Garanti BBVA'),
        (AKBANK, 'Akbank'),
        (YAPI_KREDI, 'Yapı Kredi'),
        (QNB, 'QNB'),
        (TEB, 'TEB'),
        (DENIZBANK, 'Denizbank'),
        (ING, 'ING'),
        (HSBC, 'HSBC'),
        (FIBABANK, 'Fibabanka'),
        (SEKERBANK, 'Şekerbank'),
        (ODEABANK, 'Odea Bank'),
        (ALBARAKA, 'Albaraka Türk'),
        (KUVEYT, 'Kuveyt Türk'),
        (DIGER, 'Diğer'),
    ]

    @classmethod
    def get_label(cls, value):
        return dict(cls.CHOICES).get(value, value or '')

    @classmethod
    def get_values(cls):
        return [c[0] for c in cls.CHOICES]

    @classmethod
    def resolve_from_label(cls, label: str) -> str:
        """Eski serbest metin banka_adi değerini koda çevirir (migration/edit uyumu)."""
        if not label:
            return ''
        normalized = label.strip().casefold()
        for code, bank_label in cls.CHOICES:
            if bank_label.casefold() == normalized:
                return code
        aliases = {
            'vakıfbank': cls.VAKIFBANK,
            'vakifbank': cls.VAKIFBANK,
            'ziraat': cls.ZIRAAT,
            'garanti': cls.GARANTI,
            'garanti bbva': cls.GARANTI,
            'iş bankası': cls.IS_BANKASI,
            'is bankasi': cls.IS_BANKASI,
            'yapı kredi': cls.YAPI_KREDI,
            'yapi kredi': cls.YAPI_KREDI,
        }
        return aliases.get(normalized, '')
