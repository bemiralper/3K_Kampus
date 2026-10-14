"""OPTİK-129 boş formunun yazı kutuları ve kimlik balonları.

Koordinatlar sayfanın sol üstünden milimetredir. Metinde Y, harfin oturduğu
noktalı çizgidir. Balonda X/Y ilk dairenin merkezidir; genişlik sütun
aralığı, yükseklik satır aralığıdır. Ölçü, formun gömülü taramasından
(2481×3507, sayfa 210×297 mm) alınmıştır.
"""
from decimal import Decimal

PRESET_OPTIK_129 = 'OPTIK-129'
# Formdaki harf sırası. Q, W ve X bu kağıtta yok.
HARF_KUMESI = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'
RAKAM_KUMESI = '0123456789'


def _d(value):
    return Decimal(str(value))


def optik_129_geometry():
    return {
        'sayfa_genislik_mm': _d('210.00'),
        'sayfa_yukseklik_mm': _d('297.00'),
        'sol_bas_mm': _d('9.50'),
        'ust_bas_mm': _d('24.70'),
        'sol_pay_mm': _d('10.00'),
        'sag_pay_mm': _d('10.00'),
        'ust_pay_mm': _d('10.00'),
        'alt_pay_mm': _d('3.00'),
        'balon_cap_mm': _d('1.60'),
    }


def optik_129_alanlar():
    """Öğrenci bilgileri kutusu ve deneme adı / sınav no hücreleri."""
    rows = [
        ('adi', 'Adı', 112.0, 24.15, 37.5, 8),
        ('soyadi', 'Soyadı', 118.0, 30.35, 31.5, 8),
        ('sinif_sube', 'Sınıf / Şube', 126.5, 36.35, 23.0, 8),
        ('numara', 'Numara', 120.5, 42.70, 29.0, 8),
        ('okul', 'Okul', 114.5, 48.75, 35.0, 7.5),
        ('salon', 'Salon', 108.5, 55.05, 41.0, 8),
        ('il_ilce', 'İl / İlçe', 119.0, 60.45, 30.5, 8),
        ('deneme_adi', 'Deneme adı', 155.4, 20.70, 26.8, 6.5),
        ('sinav_no', 'Sınav no', 187.4, 20.70, 14.8, 7),
    ]
    templates = {
        'adi': '#ad#',
        'soyadi': '#soyad#',
        'sinif_sube': '#sinif_sube#',
        'numara': '#numara#',
        'okul': '#okul#',
        'salon': '#salon#',
        'il_ilce': '#il_ilce#',
        'deneme_adi': '#deneme_adi#',
        'sinav_no': '#sinav_no#',
    }
    alanlar = []
    for sira, (kod, etiket, x, y, gen, punto) in enumerate(rows):
        alanlar.append({
            'kod': kod,
            'etiket': etiket,
            'tur': 'metin',
            'x_mm': _d(f'{x:.2f}'),
            'y_mm': _d(f'{y:.2f}'),
            'genislik_mm': _d(f'{gen:.2f}'),
            'yukseklik_mm': _d('4.00'),
            'punto': _d(f'{punto:.1f}'),
            'sablon': templates[kod],
            'karakter_kumesi': '',
            'sutun_sayisi': 1,
            'aktif': True,
            'sira': sira,
        })
    # x/y ilk dairenin merkezi, genişlik sütun aralığı, yükseklik satır aralığı.
    balonlar = [
        ('kod_ad_soyad', 'Ad soyad kodu', 13.59, 164.80, 4.28, 4.29, 20, HARF_KUMESI, '#ad# #soyad#'),
        ('kod_tc', 'T.C. kodu', 13.67, 109.06, 4.28, 4.29, 11, RAKAM_KUMESI, '#tc#'),
        ('kod_numara', 'Öğrenci no kodu', 56.46, 27.92, 4.27, 4.30, 4, RAKAM_KUMESI, '#numara#'),
        ('kod_sinif', 'Sınıf kodu', 82.15, 27.97, 8.57, 8.57, 1, '9,10,11,12,M', '#sinif#'),
        ('kod_sube', 'Şube kodu', 86.44, 27.99, 4.29, 4.29, 1, HARF_KUMESI, '#sube#'),
    ]
    for offset, (kod, etiket, x, y, px, py, sutun, kume, sablon) in enumerate(balonlar, start=len(alanlar)):
        alanlar.append({
            'kod': kod,
            'etiket': etiket,
            'tur': 'balon',
            'x_mm': _d(f'{x:.2f}'),
            'y_mm': _d(f'{y:.2f}'),
            'genislik_mm': _d(f'{px:.2f}'),
            'yukseklik_mm': _d(f'{py:.2f}'),
            'punto': _d('8.0'),
            'sablon': sablon,
            'karakter_kumesi': kume,
            'sutun_sayisi': sutun,
            'aktif': True,
            'sira': offset,
        })
    return alanlar


PRESETS = {
    PRESET_OPTIK_129: {
        'label': 'OPTİK-129',
        'geometry': optik_129_geometry,
        'alanlar': optik_129_alanlar,
    },
}


def preset_or_none(kod):
    key = (kod or '').strip().upper().replace('İ', 'I').replace(' ', '-')
    if key in ('OPTIK-129', 'OPTİK-129', 'OPTIK129'):
        key = PRESET_OPTIK_129
    return PRESETS.get(key)
