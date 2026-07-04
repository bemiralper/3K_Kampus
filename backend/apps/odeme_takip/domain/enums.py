"""
Ödeme Takip Domain Enums
Tüm sabit değerler ve seçenek listeleri
"""


class SozlesmeDurum:
    """Sözleşme statüleri — State Machine kurallarına tabi"""
    TASLAK = 'taslak'
    AKTIF = 'aktif'
    IPTAL = 'iptal'
    DONDURULMUS = 'dondurulmus'
    FESHEDILMIS = 'feshedilmis'
    TAMAMLANDI = 'tamamlandi'

    CHOICES = [
        (TASLAK, 'Taslak'),
        (AKTIF, 'Aktif'),
        (IPTAL, 'İptal'),
        (DONDURULMUS, 'Dondurulmuş'),
        (FESHEDILMIS, 'Feshedilmiş'),
        (TAMAMLANDI, 'Tamamlandı'),
    ]

    # İzin verilen statü geçişleri (State Machine)
    GECIS_KURALLARI = {
        TASLAK: [AKTIF, IPTAL],
        AKTIF: [DONDURULMUS, FESHEDILMIS, TAMAMLANDI, IPTAL],
        DONDURULMUS: [AKTIF, FESHEDILMIS, IPTAL],
        # Bunlardan geri dönüş yok:
        FESHEDILMIS: [],
        TAMAMLANDI: [],
        IPTAL: [],
    }

    @classmethod
    def gecis_izinli_mi(cls, eski, yeni):
        return yeni in cls.GECIS_KURALLARI.get(eski, [])


class OdemeTuru:
    """Borcun yapısı"""
    PESIN = 'pesin'
    TAKSITLI = 'taksitli'
    CEK_SENET = 'cek_senet'
    KARMA = 'karma'

    CHOICES = [
        (PESIN, 'Peşin'),
        (TAKSITLI, 'Taksitli'),
        (CEK_SENET, 'Çek / Senet'),
        (KARMA, 'Karma'),
    ]

    @classmethod
    def taksit_plani_gerektirir(cls, odeme_turu: str) -> bool:
        return odeme_turu in (cls.TAKSITLI, cls.CEK_SENET, cls.KARMA)


class TaksitPeriyodu:
    AYLIK = 'aylik'
    IKI_AYLIK = 'iki_aylik'
    UC_AYLIK = 'uc_aylik'
    OZEL = 'ozel'

    CHOICES = [
        (AYLIK, 'Aylık'),
        (IKI_AYLIK, '2 Aylık'),
        (UC_AYLIK, '3 Aylık'),
        (OZEL, 'Özel Plan'),
    ]


class TaksitDurum:
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


class TahsilatTuru:
    NORMAL = 'normal'
    MAHSUP = 'mahsup'
    IADE = 'iade'
    EMANET = 'emanet'

    CHOICES = [
        (NORMAL, 'Normal'),
        (MAHSUP, 'Mahsup'),
        (IADE, 'İade'),
        (EMANET, 'Emanet'),
    ]


class TahsilatDurum:
    AKTIF = 'aktif'
    IPTAL_EDILDI = 'iptal_edildi'

    CHOICES = [
        (AKTIF, 'Aktif'),
        (IPTAL_EDILDI, 'İptal Edildi'),
    ]


class OnayDurum:
    BEKLEMEDE = 'beklemede'
    ONAYLANDI = 'onaylandi'
    REDDEDILDI = 'reddedildi'

    CHOICES = [
        (BEKLEMEDE, 'Beklemede'),
        (ONAYLANDI, 'Onaylandı'),
        (REDDEDILDI, 'Reddedildi'),
    ]


class PaketTuru:
    GRUP_DERSI = 'grup_dersi'
    OZEL_DERS = 'ozel_ders'
    DENEME = 'deneme'
    DAVRANIS = 'davranis'
    EK_HIZMET = 'ek_hizmet'

    CHOICES = [
        (GRUP_DERSI, 'Grup Dersi'),
        (OZEL_DERS, 'Özel Ders'),
        (DENEME, 'Deneme'),
        (DAVRANIS, 'Davranış Paketi'),
        (EK_HIZMET, 'Ek Hizmet'),
    ]


class KalemTuru:
    PAKET = 'paket'
    EK_HIZMET = 'ek_hizmet'
    GRUP_DERSI = 'grup_dersi'
    OZEL_DERS = 'ozel_ders'
    DENEME = 'deneme'
    EK_HIZMET_SATISI = 'ek_hizmet_satisi'

    CHOICES = [
        (PAKET, 'Paket'),
        (EK_HIZMET, 'Ek Hizmet'),
        (GRUP_DERSI, 'Grup Dersi'),
        (OZEL_DERS, 'Özel Ders'),
        (DENEME, 'Deneme'),
        (EK_HIZMET_SATISI, 'Ek Hizmet Satışı'),
    ]


class GecmisIslemTuru:
    OLUSTURMA = 'olusturma'
    GUNCELLEME = 'guncelleme'
    DURUM_DEGISIKLIGI = 'durum_degisikligi'
    INDIRIM = 'indirim'
    TAKSIT = 'taksit'
    TAHSILAT = 'tahsilat'
    IPTAL = 'iptal'
    IADE = 'iade'
    FESIH = 'fesih'
    KALEM_EKLEME = 'kalem_ekleme'
    KALEM_CIKARMA = 'kalem_cikarma'
    REVIZYON = 'revizyon'

    CHOICES = [
        (OLUSTURMA, 'Oluşturma'),
        (GUNCELLEME, 'Güncelleme'),
        (DURUM_DEGISIKLIGI, 'Durum Değişikliği'),
        (INDIRIM, 'İndirim'),
        (TAKSIT, 'Taksit'),
        (TAHSILAT, 'Tahsilat'),
        (IPTAL, 'İptal'),
        (IADE, 'İade'),
        (FESIH, 'Fesih'),
        (KALEM_EKLEME, 'Kalem Ekleme'),
        (KALEM_CIKARMA, 'Kalem Çıkarma'),
        (REVIZYON, 'Revizyon'),
    ]


class EgitimTuru:
    """Sözleşmedeki eğitim türü"""
    YKS = 'yks'
    LGS = 'lgs'
    ARA_SINIF = 'ara_sinif'
    MEZUN = 'mezun'
    DIGER = 'diger'

    CHOICES = [
        (YKS, 'YKS'),
        (LGS, 'LGS'),
        (ARA_SINIF, 'Ara Sınıf'),
        (MEZUN, 'Mezun'),
        (DIGER, 'Diğer'),
    ]


class FesihNedeni:
    """Fesih nedeni seçenekleri"""
    VELI_TALEBI = 'veli_talebi'
    KURUM_KARARI = 'kurum_karari'
    DISIPLIN = 'disiplin'
    DEVAMSIZLIK = 'devamsizlik'
    DIGER = 'diger'

    CHOICES = [
        (VELI_TALEBI, 'Veli / Vasi Talebi'),
        (KURUM_KARARI, 'Kurum Kararı'),
        (DISIPLIN, 'Disiplin'),
        (DEVAMSIZLIK, 'Devamsızlık'),
        (DIGER, 'Diğer'),
    ]
