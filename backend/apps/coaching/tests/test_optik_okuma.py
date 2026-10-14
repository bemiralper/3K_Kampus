"""Optik okuma: satır kaydı, yerel arama, boş form düşürme, T.C. kontrolü.

Daire koordinatına ve yazıcı profiline yazmaz.
"""
from io import BytesIO

from django.test import SimpleTestCase
from PIL import Image, ImageDraw

from apps.coaching.olcme_degerlendirme.services.optik_okuma import (
    dogrula,
    dropout_gray,
    sayfa_oku,
    sec_kayit,
    tc_gecerli,
    yerel_merkez,
)


def _png(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format='PNG')
    return output.getvalue()


def _belge():
    rows = [round(30 + index * 4.3, 2) for index in range(16)]
    return {
        'iz': {
            'x_mm': 6,
            'genislik_mm': 3,
            'y0_mm': 30,
            'aralik_mm': 4.3,
            'adet': 16,
            'satirlar_mm': rows,
        },
        'alanlar': [{
            'id': 'rakam',
            'ad': 'Rakam',
            'tur': 'sayisal_kodlama',
            'veri_kaynagi': '',
            'aktif': True,
            'x_mm': 25,
            'y_mm': 30,
            'satir': 10,
            'sutun': 1,
            'cap_mm': 3.2,
            'aralik_x_mm': 4.5,
            'aralik_y_mm': 4.3,
            'kodlama_yonu': 'sutun_karakter',
            'etiketler': list('0123456789'),
        }],
    }


def _sayfa(mark_row=4, dx_mm=0.0, skip_first=0):
    image = Image.new('L', (2100, 2970), 255)
    draw = ImageDraw.Draw(image)
    for index in range(skip_first, 16):
        y = (30 + index * 4.3) * 10
        draw.rectangle((20, y - 8, 55, y + 8), fill=0)
    y = (30 + mark_row * 4.3) * 10
    x = (25 + dx_mm) * 10
    draw.ellipse((x - 8, y - 8, x + 8, y + 8), fill=0)
    return image


class OptikOkumaMotorTest(SimpleTestCase):
    def test_tc_kontrol_hanesi(self):
        self.assertTrue(tc_gecerli('10000000146'))
        self.assertFalse(tc_gecerli('10000000140'))
        self.assertFalse(tc_gecerli('05070000000'))

    def test_yanlis_satir_kaydirmasi_isareti_kacirir_dogru_kaydirma_tutar(self):
        image = _sayfa(mark_row=4)
        gray = __import__('numpy').asarray(image)
        belge = _belge()
        dogru = (1.0, 0.0, 0.0, 0)
        kaymis = (1.0, 2.5, 0.0, 1)
        secim = sec_kayit(gray, belge, [kaymis, dogru], [(25, 30 + 4 * 4.3, 3.2)])
        self.assertEqual(secim['satir_kaydirma'], 0)
        self.assertGreater(secim['en_iyi_skor'], secim['ikinci_skor'])

    def test_yarim_milimetre_kayan_isaret_okunur(self):
        image = _sayfa(mark_row=4, dx_mm=0.7)
        gray = __import__('numpy').asarray(image)
        _x, _y, score = yerel_merkez(gray, 25, 30 + 4 * 4.3, 3.2)
        self.assertGreater(score, 0.3)

    def test_sayfa_dogru_rakami_okur(self):
        result = sayfa_oku(_png(_sayfa(mark_row=4, skip_first=3)), _belge(), 210, 297)
        self.assertEqual(result['decoded']['alanlar']['rakam']['value'], '4')
        self.assertLess(result['registration']['confidence'], 0.97)
        self.assertTrue(result['preview_png'].startswith(b'\x89PNG'))

    def test_bos_form_halkasi_isaret_sayilmaz(self):
        import numpy as np

        blank = Image.new('L', (80, 80), 255)
        scan = blank.copy()
        draw_blank = ImageDraw.Draw(blank)
        draw_scan = ImageDraw.Draw(scan)
        draw_blank.ellipse((20, 20, 60, 60), outline=0, width=3)
        draw_scan.ellipse((20, 20, 60, 60), outline=0, width=3)
        dropped, used = dropout_gray(np.asarray(scan), np.asarray(blank))
        self.assertTrue(used)
        self.assertGreater(float(dropped.mean()), 250)
        draw_scan.ellipse((30, 30, 50, 50), fill=40)
        filled, _used = dropout_gray(np.asarray(scan), np.asarray(blank))
        self.assertLess(float(filled[40, 40]), 80)

    def test_tiklanan_cevap_karsilastirmaya_girer(self):
        decoded = {
            'alanlar': {
                'turkce': {
                    'veri_kaynagi': '',
                    'value': 'A',
                    'cevap_esleme': [1],
                    'states': [{'index': 0, 'value': 'A'}],
                },
            },
            'cevaplar': {'1': 'A'},
        }
        result = dogrula(decoded, {'turkce': {'0': 'B'}}, {'cevaplar': 'B'})
        self.assertTrue(result['uyumlu'])
