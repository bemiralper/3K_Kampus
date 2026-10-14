"""Daire dizisi optik şablonu.

Koordinat editörünün kayıtlarına ve baskısına dokunulmaz.
"""
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from PIL import Image, ImageDraw
from pypdf import PdfReader
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    ExamSession,
    OmrTaramaOturumu,
    OptikDaireSablon,
    OptikForm,
    OptikFormAlani,
    OptikYaziciProfili,
    StudentAnswer,
)
from apps.coaching.olcme_degerlendirme.services.daire_dizisi_detect import daireleri_algila, izleri_algila
from apps.coaching.olcme_degerlendirme.services.daire_dizisi_fmt import fmt_uygula
from apps.coaching.olcme_degerlendirme.services.daire_dizisi_print import layout_daire, render_daire_pdf
from apps.coaching.olcme_degerlendirme.services.daire_dizisi_raster import kaynak_olcusu, raster_kaynak
from apps.coaching.olcme_degerlendirme.services.daire_dizisi_tarama import tarama_kalibrasyon
from apps.coaching.olcme_degerlendirme.services.omr_engine import omr_oku
from apps.coaching.olcme_degerlendirme.services.daire_dizisi_schema import (
    HARFLER,
    ad_soyad_sigdir,
    belge_dogrula,
    bos_belge,
    isaret_merkezleri,
    kalibrasyon_uygula,
    kodla,
    kutu_dilimleri,
)

FMT_129 = Path(__file__).resolve().parent / 'fixtures' / 'optik129.fmt'
from apps.coaching.olcme_degerlendirme.services.daire_dizisi_values import SAMPLE_DAIRE, daire_value_rows
from apps.coaching.tests.olcme_helpers import grant_olcme_write
from apps.coaching.tests.test_olcme_optik_form import _blank_pdf
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.coaching.olcme_degerlendirme.models import Exam, ExamParticipant, ExamRoom

User = get_user_model()
BASE = '/api/coaching/olcme-degerlendirme/optik-daire-sablonlar/'


def _pdf(text='KAYNAKFORM') -> bytes:
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.drawString(72, 720, text)
    c.showPage()
    c.drawString(72, 720, 'SAYFA2')
    c.save()
    return buf.getvalue()


def _png(width=600, height=800, dpi=300) -> bytes:
    image = Image.new('RGB', (width, height), (255, 255, 255))
    buf = BytesIO()
    image.save(buf, format='PNG', dpi=(dpi, dpi))
    return buf.getvalue()


def _tc_alan(**extra):
    alan = {
        'id': 'tc',
        'ad': 'T.C. Kimlik No',
        'tur': 'tc_kimlik',
        'veri_kaynagi': 'tc',
        'aktif': True,
        'x_mm': 10,
        'y_mm': 20,
        'satir': 11,
        'sutun': 10,
        'cap_mm': 3.2,
        'aralik_x_mm': 4.5,
        'aralik_y_mm': 4.8,
        'kodlama_yonu': 'satir_karakter',
        'kod_hizasi': 'sol',
        'etiketler': [],
    }
    alan.update(extra)
    return alan


def _belge(*alanlar, **kalibrasyon):
    belge = bos_belge()
    belge['alanlar'] = list(alanlar)
    belge['kalibrasyon'].update(kalibrasyon)
    return belge


def _sablon(belge, tur='pdf'):
    return SimpleNamespace(
        sayfa_genislik_mm=210,
        sayfa_yukseklik_mm=297,
        kaynak_tur=tur,
        sayfa_no=1,
        belge=belge,
    )


class DaireKodlamaTest(TestCase):
    def test_cap_and_spacing_stay_independent(self):
        belge, _uyari = belge_dogrula(_belge({
            'ad': 'Izgara',
            'tur': 'daire_dizisi',
            'x_mm': 12,
            'y_mm': 18,
            'satir': 3,
            'sutun': 4,
            'cap_mm': 3.2,
            'aralik_x_mm': 8.5,
            'aralik_y_mm': 6.25,
        }), 210, 297)
        alan = belge['alanlar'][0]
        self.assertEqual(alan['cap_mm'], 3.2)
        self.assertEqual(alan['isaret_cap_mm'], 2.18)
        self.assertEqual(alan['aralik_x_mm'], 8.5)
        self.assertEqual(alan['aralik_y_mm'], 6.25)
        self.assertNotEqual(alan['cap_mm'], alan['aralik_x_mm'])

    def test_tc_keeps_leading_zero_and_digit_order(self):
        alan = _tc_alan()
        cells, status = kodla(alan, '01234567890')
        self.assertEqual(status, 'ok')
        self.assertEqual(''.join(cells), '01234567890')
        marks, _ = isaret_merkezleri(alan, '01234567890')
        self.assertEqual(marks[0], (10.0, 20.0))
        self.assertEqual(marks[1], (10.0 + 4.5, 20.0 + 4.8))

    def test_tc_sample_marks_column_for_digit_and_row_for_character(self):
        marks, status = isaret_merkezleri(_tc_alan(), '10000000146')
        self.assertEqual(status, 'ok')
        self.assertEqual(len(marks), 11)
        self.assertEqual(marks[0], (10.0 + 4.5, 20.0))
        self.assertEqual(marks[1], (10.0, 20.0 + 4.8))
        self.assertEqual(marks[-1], (10.0 + 6 * 4.5, 20.0 + 10 * 4.8))

    def test_invalid_or_empty_values_leave_no_marks(self):
        alan = _tc_alan()
        for raw in ('', '123', '1000000014A', None):
            marks, status = isaret_merkezleri(alan, raw)
            self.assertEqual(marks, [], raw)
            self.assertIn(status, ('empty', 'invalid'))
        numara = {
            'tur': 'ogrenci_numarasi', 'satir': 5, 'sutun': 10,
            'x_mm': 30, 'y_mm': 40, 'aralik_x_mm': 4, 'aralik_y_mm': 4,
            'kodlama_yonu': 'satir_karakter', 'kod_hizasi': 'sol', 'etiketler': [],
        }
        cells, status = kodla(numara, '01042')
        self.assertEqual(status, 'ok')
        self.assertEqual(cells[0], '0')
        marks, status = isaret_merkezleri(numara, '123456')
        self.assertEqual(status, 'invalid')
        self.assertEqual(marks, [])

    def test_right_align_shifts_short_number_without_dropping_zeros(self):
        alan = _tc_alan(tur='ogrenci_numarasi', satir=5, sutun=10, kod_hizasi='sag', ad='No')
        cells, status = kodla(alan, '01042')
        self.assertEqual(status, 'ok')
        self.assertEqual(cells, ['0', '1', '0', '4', '2'])
        cells, _ = kodla(alan, '1042')
        self.assertEqual(cells, ['', '1', '0', '4', '2'])

    def test_kitapcik_order(self):
        alan = {
            'tur': 'kitapcik_turu', 'satir': 1, 'sutun': 4,
            'x_mm': 50, 'y_mm': 60, 'aralik_x_mm': 5, 'aralik_y_mm': 5,
            'kodlama_yonu': 'satir_karakter', 'etiketler': ['A', 'B', 'C', 'D'],
        }
        marks, status = isaret_merkezleri(alan, 'C')
        self.assertEqual(status, 'ok')
        self.assertEqual(marks, [(50 + 10, 60)])
        marks, status = isaret_merkezleri(alan, 'E')
        self.assertEqual(status, 'invalid')
        self.assertEqual(marks, [])

    def test_name_grid_codes_each_letter_and_keeps_spaces(self):
        alan = _tc_alan(
            tur='daire_dizisi', veri_kaynagi='ad_soyad', ad='Ad Soyad',
            kodlama_yonu='sutun_karakter', satir=29, sutun=20,
            etiketler=['A', 'B', 'Ğ.H', 'İJ'],
        )
        marks, status = isaret_merkezleri(alan, 'Ayşe Yılmaz')
        self.assertEqual(status, 'ok')
        self.assertEqual(marks[0], (10, 20))
        self.assertEqual(marks[1], (14.5, 20 + 27 * 4.8))
        self.assertEqual(marks[2], (19, 20 + 22 * 4.8))
        self.assertEqual(marks[3], (23.5, 20 + 5 * 4.8))
        self.assertEqual(marks[4], (32.5, 20 + 27 * 4.8))
        self.assertEqual(len(marks), 10)
        normalized, _ = belge_dogrula(_belge(alan), 210, 297)
        self.assertEqual(normalized['alanlar'][0]['etiketler'], list('ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'))
        bos, bos_durum = isaret_merkezleri({**alan, 'veri_kaynagi': ''}, 'Ayşe Yılmaz')
        self.assertEqual(bos, [])
        self.assertEqual(bos_durum, 'empty')

    def test_wrong_tc_grid_is_rejected_on_print(self):
        belge = _belge(_tc_alan(satir=10))
        with self.assertRaises(ValueError):
            layout_daire(belge, SAMPLE_DAIRE)

    def test_calibration_moves_print_only(self):
        alan = _tc_alan()
        belge = _belge(alan, ofset_x_mm=2, ofset_y_mm=-1, olcek=1)
        lines, marks, _ = layout_daire(belge, {'tc': '10000000146'})
        self.assertEqual(lines, [])
        self.assertEqual(marks[0]['x_mm'], 10 + 4.5 + 2)
        self.assertEqual(marks[0]['y_mm'], 20 - 1)
        self.assertEqual(belge['alanlar'][0]['x_mm'], 10)
        self.assertEqual(belge['alanlar'][0]['cap_mm'], 3.2)
        scaled = _belge(alan, olcek=1.1)
        _lines, scaled_marks, _ = layout_daire(scaled, {'tc': '10000000146'})
        self.assertAlmostEqual(scaled_marks[0]['x_mm'], (10 + 4.5) * 1.1, places=2)
        self.assertAlmostEqual(scaled_marks[0]['cap_mm'], 3.2 * 0.68 * 1.1, places=2)
        self.assertEqual(scaled['alanlar'][0]['aralik_x_mm'], 4.5)
        x_mm, y_mm = kalibrasyon_uygula(10, 100, {'olcek': 1, 'olcek_y': 1.01, 'ofset_x_mm': 0, 'ofset_y_mm': 0.5})
        self.assertEqual(x_mm, 10)
        self.assertAlmostEqual(y_mm, 101.5, places=2)

    def test_each_row_uses_saved_pitch_not_the_timing_track(self):
        alan = _tc_alan(y_mm=10, aralik_y_mm=5, iz_satir=0)
        belge = _belge(alan)
        belge['iz'] = {
            'x_mm': 7,
            'genislik_mm': 4,
            'y0_mm': 10,
            'aralik_mm': 4,
            'adet': 11,
            'satirlar_mm': [10, 12.5, 18, 22, 26, 30, 34, 38, 42, 46, 50],
        }
        _lines, marks, _ = layout_daire(belge, {'tc': '10000000146'})
        self.assertTrue(any(mark['y_mm'] == 15 for mark in marks))
        self.assertFalse(any(mark['y_mm'] == 12.5 for mark in marks))

    def test_text_boxes_match_each_slice_and_stay_flush(self):
        alan = _tc_alan(tur='daire_dizisi', satir=3, sutun=10, x_mm=10, y_mm=20, cap_mm=3.2, aralik_x_mm=5, aralik_y_mm=4.8)
        values = {'tc': '1234567890'}
        lines, _marks, _ = layout_daire(_belge(alan), values)
        self.assertEqual(lines, [])
        kapali = {'aktif': False, 'yon': 'ust', 'olcu_mm': 6, 'punto': 8, 'veri_kaynagi': 'tc'}
        kapali_belge, _ = belge_dogrula(_belge(_tc_alan(**alan, metin_kutusu=kapali)), 210, 297)
        self.assertEqual(layout_daire(kapali_belge, values)[0], [])
        acik = {**kapali, 'aktif': True}
        acik_alan = _tc_alan(**{**alan, 'metin_kutusu': acik})
        dilimler = kutu_dilimleri(acik_alan, '1234567890')
        self.assertEqual(len(dilimler), 10)
        self.assertEqual([item['genislik_mm'] for item in dilimler], [5] * 10)
        self.assertAlmostEqual(dilimler[1]['x_mm'], dilimler[0]['x_mm'] + dilimler[0]['genislik_mm'])
        self.assertEqual(dilimler[0]['yukseklik_mm'], 6)
        self.assertAlmostEqual(dilimler[0]['y_mm'] + dilimler[0]['yukseklik_mm'], 20 - 1.6)
        aralikli = {**acik, 'bosluk_mm': 2}
        aralik_dilimleri = kutu_dilimleri(_tc_alan(**{**alan, 'metin_kutusu': aralikli}), '1234567890')
        self.assertAlmostEqual(aralik_dilimleri[0]['y_mm'] + aralik_dilimleri[0]['yukseklik_mm'], 20 - 1.6 - 2)
        acik_belge, _ = belge_dogrula(_belge(acik_alan), 210, 297)
        lines, _marks, _ = layout_daire(acik_belge, values)
        self.assertEqual([line['text'] for line in lines], list('1234567890'))
        yan = {**acik, 'yon': 'sag', 'olcu_mm': 12}
        yan_alan = _tc_alan(tur='daire_dizisi', satir=10, sutun=2, x_mm=10, y_mm=20, cap_mm=3.2, aralik_x_mm=5, aralik_y_mm=4.8, metin_kutusu=yan)
        yan_dilimler = kutu_dilimleri(yan_alan, '1234567890')
        self.assertEqual(len(yan_dilimler), 10)
        self.assertEqual(yan_dilimler[0]['yukseklik_mm'], 4.8)
        self.assertAlmostEqual(yan_dilimler[1]['y_mm'], yan_dilimler[0]['y_mm'] + yan_dilimler[0]['yukseklik_mm'])
        self.assertEqual(yan_dilimler[0]['genislik_mm'], 12)
        self.assertAlmostEqual(yan_dilimler[0]['x_mm'], 10 + 5 + 1.6)
        bos, _ = belge_dogrula(_belge(_tc_alan()), 210, 297)
        self.assertIsNone(bos['alanlar'][0]['metin_kutusu'])

    def test_long_student_name_keeps_other_names_and_surname(self):
        self.assertEqual(ad_soyad_sigdir('Ayşe Nur Yılmaz', 20), 'Ayşe Nur Yılmaz')
        self.assertEqual(ad_soyad_sigdir('Ayşe Nur Yılmaz', 12), 'A Nur Yılmaz')
        self.assertEqual(ad_soyad_sigdir('Ayşe Yılmaz', 10), 'A Yılmaz')
        self.assertEqual(ad_soyad_sigdir('ışıl Yılmaz', 8), 'I Yılmaz')
        self.assertEqual(ad_soyad_sigdir('Ayşe', 2), 'Ayşe')
        alan = _tc_alan(
            tur='daire_dizisi', satir=1, sutun=10, x_mm=10, y_mm=20,
            cap_mm=3.2, aralik_x_mm=5, aralik_y_mm=4.8,
            metin_kutusu={
                'aktif': True, 'yon': 'ust', 'olcu_mm': 5, 'punto': 8,
                'veri_kaynagi': 'ad_soyad',
            },
        )
        belge, _ = belge_dogrula(_belge(alan), 210, 297)
        lines, _, _ = layout_daire(belge, {'ad_soyad': 'Ayşe Nur Yılmaz'})
        self.assertEqual([line['text'] for line in lines], ['A', 'N', 'U', 'R', 'Y', 'I', 'L', 'M'])
        numara = _tc_alan(
            tur='ogrenci_numarasi', veri_kaynagi='ogrenci_no',
            kodlama_yonu='sutun_karakter', kod_hizasi='sag', satir=10, sutun=5,
            metin_kutusu={'aktif': True, 'yon': 'ust', 'olcu_mm': 4, 'punto': 8, 'veri_kaynagi': ''},
        )
        numara_belge, _ = belge_dogrula(_belge(numara), 210, 297)
        numara_satir, _, _ = layout_daire(numara_belge, {'ogrenci_no': '1042'})
        self.assertEqual([line['text'] for line in numara_satir], ['1', '0', '4', '2'])
        self.assertGreater(numara_satir[0]['x_mm'], numara_belge['alanlar'][0]['x_mm'])
        dar = _belge({
            'ad': 'Ad', 'tur': 'metin', 'veri_kaynagi': 'ad_soyad',
            'x_mm': 10, 'y_mm': 20, 'genislik_mm': 28, 'yukseklik_mm': 8, 'punto': 11,
        })
        genis = _belge({
            'ad': 'Ad', 'tur': 'metin', 'veri_kaynagi': 'ad_soyad',
            'x_mm': 10, 'y_mm': 20, 'genislik_mm': 70, 'yukseklik_mm': 8, 'punto': 11,
        })
        self.assertEqual(layout_daire(dar, {'ad_soyad': 'Ayşe Nur Yılmaz'})[0][0]['text'], 'A NUR YILMAZ')
        self.assertEqual(layout_daire(genis, {'ad_soyad': 'Ayşe Nur Yılmaz'})[0][0]['text'], 'AYŞE NUR YILMAZ')

    def test_unknown_schema_is_refused(self):
        with self.assertRaises(ValueError):
            belge_dogrula({'surum': 'koordinat-v1', 'alanlar': []}, 210, 297)

    def test_complete_grid_must_stay_inside_page(self):
        with self.assertRaisesRegex(ValueError, 'tamamı sayfa'):
            belge_dogrula(_belge(_tc_alan(x_mm=200, sutun=10)), 210, 297)

    def test_answer_block_and_multiple_timing_tracks_are_additive_v1_keys(self):
        raw = _belge({
            'ad': 'Cevap 1-2', 'tur': 'cevap_bloku',
            'x_mm': 20, 'y_mm': 30, 'satir': 2, 'sutun': 5,
            'cap_mm': 3, 'aralik_x_mm': 4, 'aralik_y_mm': 5,
            'kodlama_yonu': 'satir_karakter', 'etiketler': ['A', 'B', 'C', 'D', 'E'],
            'iz_id': 'sag', 'iz_satirlar': [0, 2],
            'cevap_bloku': {
                'soru_baslangic': 1, 'soru_sayisi': 2,
                'secenekler': ['A', 'B', 'C', 'D', 'E'],
            },
        })
        raw['izler'] = [{
            'id': 'sag', 'kenar': 'sag', 'x_mm': 205, 'genislik_mm': 4,
            'y0_mm': 30, 'aralik_mm': 4, 'adet': 4,
            'satirlar_mm': [30, 34.2, 39, 43.4],
        }]
        belge, warnings = belge_dogrula(raw, 210, 297)
        self.assertEqual(belge['surum'], 'daire-dizisi-v1')
        self.assertEqual(warnings, [])
        self.assertEqual(belge['alanlar'][0]['cevap_bloku']['soru_sayisi'], 2)
        _lines, marks, _notes = layout_daire(belge, {'cevaplar': ''})
        self.assertEqual(marks, [])

    def test_omr_engine_decodes_answer_block_without_writing_results(self):
        image = Image.new('RGB', (400, 400), 'white')
        draw = ImageDraw.Draw(image)
        for row, col in ((0, 0), (1, 2)):
            x = (10 + col * 4) * 10
            y = (10 + row * 5) * 10
            draw.ellipse((x - 10, y - 10, x + 10, y + 10), fill='black')
        buf = BytesIO()
        image.save(buf, format='PNG')
        belge, _ = belge_dogrula(_belge({
            'ad': 'Cevaplar', 'tur': 'cevap_bloku',
            'x_mm': 10, 'y_mm': 10, 'satir': 2, 'sutun': 5,
            'cap_mm': 3, 'aralik_x_mm': 4, 'aralik_y_mm': 5,
            'kodlama_yonu': 'satir_karakter',
            'etiketler': ['A', 'B', 'C', 'D', 'E'],
            'cevap_bloku': {
                'soru_baslangic': 1, 'soru_sayisi': 2,
                'secenekler': ['A', 'B', 'C', 'D', 'E'],
            },
        }), 40, 40)
        result = omr_oku(buf.getvalue(), belge, 40, 40)
        self.assertEqual(result['decoded']['cevaplar'], {'1': 'A', '2': 'C'})
        self.assertGreater(result['confidence'], 0.5)
        self.assertEqual(result['registration']['method'], 'page_resize')

    def test_omr_locks_to_the_timing_track_when_the_scan_shifts(self):
        px = 10
        width_mm, height_mm = 80, 50
        shift_x, shift_y = 0.4, 2.1
        rows = [round(4 + index * 4.5, 2) for index in range(8)]
        image = Image.new('L', (width_mm * px, height_mm * px), 255)
        draw = ImageDraw.Draw(image)
        for y in rows:
            yy = (y + shift_y) * px
            draw.rectangle((8 + shift_x * px, yy - 6, 28 + shift_x * px, yy + 6), fill=0)
        for row, col in ((0, 0), (1, 2)):
            x = (18 + col * 4 + shift_x) * px
            y = (10 + row * 5 + shift_y) * px
            draw.ellipse((x - 11, y - 11, x + 11, y + 11), fill=0)
        buf = BytesIO()
        image.save(buf, format='PNG')
        belge, _ = belge_dogrula(_belge({
            'ad': 'Cevaplar', 'tur': 'cevap_bloku',
            'x_mm': 18, 'y_mm': 10, 'satir': 2, 'sutun': 5,
            'cap_mm': 3, 'aralik_x_mm': 4, 'aralik_y_mm': 5,
            'kodlama_yonu': 'satir_karakter',
            'etiketler': ['A', 'B', 'C', 'D', 'E'],
            'cevap_bloku': {
                'soru_baslangic': 1, 'soru_sayisi': 2,
                'secenekler': ['A', 'B', 'C', 'D', 'E'],
            },
        }), width_mm, height_mm)
        belge['iz'] = {
            'x_mm': 2.8, 'genislik_mm': 2, 'y0_mm': rows[0], 'aralik_mm': 4.5,
            'adet': len(rows), 'satirlar_mm': rows,
        }
        result = omr_oku(buf.getvalue(), belge, width_mm, height_mm)
        self.assertEqual(result['registration']['method'], 'timing_track')
        self.assertEqual(result['decoded']['cevaplar'], {'1': 'A', '2': 'C'})

    def test_omr_flags_two_dark_bubbles_in_one_question(self):
        image = Image.new('RGB', (400, 400), 'white')
        draw = ImageDraw.Draw(image)
        for col in (0, 1):
            x = (10 + col * 4) * 10
            y = 10 * 10
            draw.ellipse((x - 10, y - 10, x + 10, y + 10), fill='black')
        buf = BytesIO()
        image.save(buf, format='PNG')
        belge, _ = belge_dogrula(_belge({
            'ad': 'Cevaplar', 'tur': 'cevap_bloku',
            'x_mm': 10, 'y_mm': 10, 'satir': 1, 'sutun': 5,
            'cap_mm': 3, 'aralik_x_mm': 4, 'aralik_y_mm': 5,
            'kodlama_yonu': 'satir_karakter',
            'etiketler': ['A', 'B', 'C', 'D', 'E'],
            'cevap_bloku': {
                'soru_baslangic': 1, 'soru_sayisi': 1,
                'secenekler': ['A', 'B', 'C', 'D', 'E'],
            },
        }), 40, 40)
        result = omr_oku(buf.getvalue(), belge, 40, 40)
        self.assertEqual(result['decoded']['cevaplar'], {'1': ''})
        self.assertTrue(any('birden fazla' in note for note in result['warnings']))

    def test_zoom_and_pan_cancel_before_millimetres_are_stored(self):
        def to_mm(local, pan, zoom, base, page):
            return ((local - pan) / zoom) / base * page

        page = 210
        base = 1000
        mm = 40
        for zoom in (0.5, 1, 2.5):
            for pan in (0, 30, -12):
                local = pan + (mm / page * base) * zoom
                self.assertAlmostEqual(to_mm(local, pan, zoom, base, page), mm)


class DaireBaskiTest(TestCase):
    def test_pdf_keeps_real_page_size_and_prints_name_without_source(self):
        raw = _pdf()
        olcu = kaynak_olcusu(raw, 'pdf', 1)
        self.assertEqual(olcu['sayfa_sayisi'], 2)
        self.assertAlmostEqual(olcu['genislik_mm'], A4[0] * 25.4 / 72, places=2)
        self.assertAlmostEqual(olcu['yukseklik_mm'], A4[1] * 25.4 / 72, places=2)
        belge, _ = belge_dogrula(_belge({
            'ad': 'Ad Soyad',
            'tur': 'metin',
            'veri_kaynagi': 'ad_soyad',
            'x_mm': 20,
            'y_mm': 40,
            'genislik_mm': 80,
            'punto': 10,
            'satir': 1,
            'sutun': 1,
        }), olcu['genislik_mm'], olcu['yukseklik_mm'])
        sablon = _sablon(belge)
        sablon.sayfa_genislik_mm = olcu['genislik_mm']
        sablon.sayfa_yukseklik_mm = olcu['yukseklik_mm']
        pdf, _uyari = render_daire_pdf(raw, sablon, [SAMPLE_DAIRE], formu_bas=False)
        reader = PdfReader(BytesIO(pdf))
        self.assertEqual(len(reader.pages), 1)
        self.assertAlmostEqual(float(reader.pages[0].mediabox.width), 595, places=2)
        self.assertAlmostEqual(float(reader.pages[0].mediabox.height), 842, places=2)
        prefs = reader.trailer['/Root']['/ViewerPreferences']
        self.assertEqual(str(prefs['/PrintScaling']), '/None')
        text = reader.pages[0].extract_text()
        self.assertIn('AYŞE YILMAZ', text)
        self.assertNotIn('KAYNAKFORM', text)
        preview, _ = render_daire_pdf(raw, sablon, [SAMPLE_DAIRE], formu_bas=True)
        onizleme = PdfReader(BytesIO(preview)).pages[0]
        self.assertAlmostEqual(float(onizleme.mediabox.width), 595, places=2)
        self.assertAlmostEqual(float(onizleme.mediabox.height), 842, places=2)
        self.assertEqual(len(onizleme.images), 1)

    def test_near_a4_form_prints_on_exact_a4(self):
        belge, _ = belge_dogrula(_belge({
            'ad': 'Ad', 'tur': 'metin', 'veri_kaynagi': 'ad_soyad',
            'x_mm': 20, 'y_mm': 40, 'genislik_mm': 80, 'punto': 10,
        }), 210.06, 296.93)
        sablon = _sablon(belge, tur='png')
        sablon.sayfa_genislik_mm = 210.06
        sablon.sayfa_yukseklik_mm = 296.93
        pdf, _ = render_daire_pdf(b'', sablon, [SAMPLE_DAIRE], formu_bas=False)
        page = PdfReader(BytesIO(pdf)).pages[0]
        self.assertAlmostEqual(float(page.mediabox.width), 595, places=2)
        self.assertAlmostEqual(float(page.mediabox.height), 842, places=2)
        self.assertAlmostEqual(float(page.cropbox.width), float(page.mediabox.width), places=2)
        self.assertAlmostEqual(float(page.trimbox.height), float(page.mediabox.height), places=2)
        sablon.sayfa_genislik_mm = 200
        sablon.sayfa_yukseklik_mm = 250
        ozel, _ = render_daire_pdf(b'', sablon, [SAMPLE_DAIRE], formu_bas=False)
        ozel_sayfa = PdfReader(BytesIO(ozel)).pages[0]
        self.assertAlmostEqual(float(ozel_sayfa.mediabox.width), 200 * 72 / 25.4, places=2)
        self.assertAlmostEqual(float(ozel_sayfa.mediabox.height), 250 * 72 / 25.4, places=2)

    def test_png_page_size_comes_from_dpi(self):
        olcu = kaynak_olcusu(_png(), 'png')
        self.assertAlmostEqual(olcu['genislik_mm'], 600 / 300 * 25.4, places=2)
        self.assertAlmostEqual(olcu['yukseklik_mm'], 800 / 300 * 25.4, places=2)
        info = raster_kaynak(_png(), 'png')
        self.assertTrue(info['png'].startswith(b'\x89PNG'))

    def test_detection_finds_a_regular_grid_and_does_not_need_a_saved_template(self):
        image = Image.new('L', (420, 360), 255)
        draw = ImageDraw.Draw(image)
        for row in range(3):
            for col in range(4):
                cx = 40 + col * 48
                cy = 36 + row * 44
                draw.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), outline=0, width=2)
        buf = BytesIO()
        image.save(buf, format='PNG')
        width_mm = 210
        height_mm = 180
        sonuc = daireleri_algila(buf.getvalue(), width_mm, height_mm)
        self.assertGreaterEqual(len(sonuc['daireler']), 12)
        self.assertEqual(len(sonuc['diziler']), 1)
        dizi = sonuc['diziler'][0]
        self.assertEqual(dizi['satir'], 3)
        self.assertEqual(dizi['sutun'], 4)
        self.assertAlmostEqual(dizi['aralik_x_mm'], 48 / 420 * width_mm, delta=0.8)
        self.assertAlmostEqual(dizi['aralik_y_mm'], 44 / 360 * height_mm, delta=0.8)
        self.assertGreater(dizi['aralik_x_mm'], dizi['cap_mm'])

    def test_detection_returns_separate_grids(self):
        image = Image.new('L', (800, 500), 255)
        draw = ImageDraw.Draw(image)
        for origin_x, rows, cols in ((60, 4, 5), (500, 3, 4)):
            for row in range(rows):
                for col in range(cols):
                    cx, cy = origin_x + col * 42, 80 + row * 40
                    draw.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), outline=0, width=2)
        buf = BytesIO()
        image.save(buf, format='PNG')
        result = daireleri_algila(buf.getvalue(), 320, 200)
        self.assertGreaterEqual(len(result['diziler']), 2)
        sizes = {(grid['satir'], grid['sutun']) for grid in result['diziler']}
        self.assertIn((4, 5), sizes)
        self.assertIn((3, 4), sizes)

    def test_scanned_test_print_measures_printer_scale(self):
        px = 10
        satirlar = [round(30 + i * 4.3, 2) for i in range(40)]
        belge = _belge(_tc_alan(x_mm=20, y_mm=30, aralik_x_mm=4.3, aralik_y_mm=4.3, iz_satir=0))
        belge['iz'] = {
            'x_mm': 7, 'genislik_mm': 4, 'y0_mm': 30, 'aralik_mm': 4.3,
            'adet': 40, 'satirlar_mm': satirlar,
        }
        tarama_x, tarama_y = 0.3, 0.2
        image = Image.new('RGB', (210 * px, 297 * px), (252, 252, 250))
        draw = ImageDraw.Draw(image)
        for y in satirlar:
            yy = (y + tarama_y) * px
            draw.rectangle(((3 + tarama_x) * px, yy - 8, (7 + tarama_x) * px, yy + 8), fill=(10, 10, 10))
        for row in range(11):
            col = (row * 3) % 10
            qx, qy = 20 + col * 4.3, 30 + row * 4.3
            ix = (1.012 * qx - 1.5 + tarama_x) * px
            iy = (1.010 * qy - 1.2 + tarama_y) * px
            draw.ellipse((ix - 12, iy - 12, ix + 12, iy + 12), fill=(45, 45, 48))
        buf = BytesIO()
        image.save(buf, format='PNG', dpi=(254, 254))
        sonuc = tarama_kalibrasyon(buf.getvalue(), belge, 210, 297)
        kal = sonuc['kalibrasyon']
        self.assertEqual(sonuc['isaret'], 11)
        self.assertAlmostEqual(kal['olcek'], 1 / 1.012, delta=0.002)
        self.assertAlmostEqual(kal['olcek_y'], 1 / 1.010, delta=0.002)
        self.assertAlmostEqual(kal['ofset_x_mm'], 1.5 / 1.012, delta=0.15)
        self.assertAlmostEqual(kal['ofset_y_mm'], 1.2 / 1.010, delta=0.15)
        self.assertLess(sonuc['sonra_mm']['en_cok'], 0.2)
        self.assertGreater(sonuc['once_mm']['medyan'], 0.5)

    def test_scanned_test_print_measures_a_wide_printer_scale(self):
        px = 10
        satirlar = [round(30 + i * 4.3, 2) for i in range(40)]
        belge = _belge(_tc_alan(x_mm=20, y_mm=30, aralik_x_mm=4.3, aralik_y_mm=4.3, iz_satir=0))
        belge['iz'] = {
            'x_mm': 7, 'genislik_mm': 4, 'y0_mm': 30, 'aralik_mm': 4.3,
            'adet': 40, 'satirlar_mm': satirlar,
        }
        image = Image.new('RGB', (210 * px, 297 * px), (252, 252, 250))
        draw = ImageDraw.Draw(image)
        for y in satirlar:
            yy = y * px
            draw.rectangle((3 * px, yy - 8, 7 * px, yy + 8), fill=(10, 10, 10))
        for row in range(11):
            col = (row * 3) % 10
            qx, qy = 20 + col * 4.3, 30 + row * 4.3
            ix = (1.064 * qx + 1.2) * px
            iy = (1.016 * qy - 2.0) * px
            draw.ellipse((ix - 12, iy - 12, ix + 12, iy + 12), fill=(45, 45, 48))
        buf = BytesIO()
        image.save(buf, format='PNG', dpi=(254, 254))
        sonuc = tarama_kalibrasyon(buf.getvalue(), belge, 210, 297)
        kal = sonuc['kalibrasyon']
        self.assertAlmostEqual(kal['olcek'], 1 / 1.064, delta=0.004)
        self.assertAlmostEqual(kal['olcek_y'], 1 / 1.016, delta=0.004)
        self.assertAlmostEqual(kal['ofset_x_mm'], -1.2 / 1.064, delta=0.2)
        self.assertAlmostEqual(kal['ofset_y_mm'], 2.0 / 1.016, delta=0.2)

    def test_left_timing_marks_set_the_row_clock(self):
        image = Image.new('L', (200, 700), 255)
        draw = ImageDraw.Draw(image)
        for index in range(20):
            top = 80 + index * 24
            draw.rectangle((12, top, 36, top + 8), fill=0)
        draw.rectangle((8, 20, 40, 32), fill=0)
        buf = BytesIO()
        image.save(buf, format='PNG')
        iz = izleri_algila(buf.getvalue(), 50, 175)
        self.assertIsNotNone(iz)
        self.assertEqual(iz['adet'], 20)
        self.assertAlmostEqual(iz['aralik_mm'], 24 / 200 * 50, delta=0.15)
        self.assertAlmostEqual(iz['y0_mm'], (80 + 4) / 700 * 175, delta=0.4)
        self.assertGreater(iz['y0_mm'], 15)


class DaireApiTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Daire Kurum', kod='DAI')
        self.diger = Kurum.objects.create(ad='Diger Kurum', kod='DIG')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DAI-M')
        self.diger_sube = Sube.objects.create(kurum=self.diger, ad='Diger', kod='DIG-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='daire', password='test')
        grant_olcme_write(self.user, self.kurum)
        self.client.force_authenticate(user=self.user)
        self.exam = Exam.objects.create(
            name='TYT Deneme', exam_type='YKS_TYT',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        self.room = ExamRoom.objects.create(exam=self.exam, name='Salon 1', capacity=30)
        self.sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil, ad='11-A',
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Yılmaz',
            tc_kimlik_no='01234567890',
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci, sinif=self.sinif, egitim_yili=self.yil,
            kurum=self.kurum, sube=self.sube, okul_no='01042',
        )
        self.participant = ExamParticipant.objects.create(
            exam=self.exam, student=self.ogrenci, room=self.room, seat_no=12,
        )

    @property
    def headers(self):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.yil.id),
        }

    def _upload(self, ad='TYT form', raw=None):
        dosya = SimpleUploadedFile('form.pdf', raw or _pdf(), content_type='application/pdf')
        return self.client.post(BASE, {'ad': ad, 'kaynak': dosya}, format='multipart', **self.headers)

    def test_upload_save_reopen_and_leave_coordinate_templates_alone(self):
        eski = OptikForm.objects.create(
            kurum=self.kurum, ad='Eski optik',
            pdf=SimpleUploadedFile('eski.pdf', _blank_pdf(), content_type='application/pdf'),
        )
        OptikFormAlani.objects.create(
            form=eski, kod='adi', etiket='Adı', tur='metin',
            x_mm=10, y_mm=10, genislik_mm=40, yukseklik_mm=4, punto=8, sablon='#ad#',
        )
        created = self._upload()
        self.assertEqual(created.status_code, 201, created.content[:400])
        body = created.json()
        self.assertEqual(body['yontem'], 'daire-dizisi-v1')
        self.assertEqual(body['belge']['surum'], 'daire-dizisi-v1')
        clash = self._upload()
        self.assertEqual(clash.status_code, 400)
        self.assertEqual(OptikDaireSablon.objects.filter(kurum=self.kurum).count(), 1)

        belge = _belge(
            _tc_alan(),
            {
                'ad': 'Ad Soyad', 'tur': 'metin', 'veri_kaynagi': 'ad_soyad',
                'x_mm': 20, 'y_mm': 30, 'genislik_mm': 70, 'punto': 9,
            },
        )
        saved = self.client.put(
            f'{BASE}{body["id"]}/belge/', {'belge': belge}, format='json', **self.headers,
        )
        self.assertEqual(saved.status_code, 200, saved.content[:400])
        again = self.client.get(f'{BASE}{body["id"]}/', **self.headers)
        alan = again.json()['belge']['alanlar'][0]
        self.assertEqual(alan['satir'], 11)
        self.assertEqual(alan['sutun'], 10)
        self.assertEqual(alan['cap_mm'], 3.2)
        self.assertEqual(alan['aralik_x_mm'], 4.5)
        self.assertEqual(eski.alanlar.count(), 1)
        self.assertFalse(OptikForm.objects.filter(ad='TYT form').exists())

        copy = self.client.post(f'{BASE}{body["id"]}/kopyala/', {}, format='json', **self.headers)
        self.assertEqual(copy.status_code, 201, copy.content[:400])
        self.assertNotEqual(copy.json()['id'], body['id'])
        self.assertEqual(OptikDaireSablon.objects.get(pk=body['id']).ad, 'TYT form')

    def test_layout_endpoint_and_default_printer_profile(self):
        profile = OptikYaziciProfili.objects.create(
            kurum=self.kurum,
            ad='Canon',
            varsayilan=True,
            kalibrasyon={'ofset_x_mm': 1, 'ofset_y_mm': 2, 'olcek': 1, 'olcek_y': 1},
        )
        created = self._upload()
        pk = created.json()['id']
        self.assertEqual(created.json()['yazici_profili_id'], profile.id)
        belge = _belge(_tc_alan(iz_satir=0))
        belge['iz'] = {
            'x_mm': 7, 'genislik_mm': 4, 'y0_mm': 20, 'aralik_mm': 4.5,
            'adet': 12, 'satirlar_mm': [20, 24.2, 28.7, 33.1, 37.6, 42, 46.5, 50.9, 55.4, 59.8, 64.3, 68.7],
        }
        response = self.client.post(
            f'{BASE}{pk}/layout/', {'belge': belge}, format='json', **self.headers,
        )
        self.assertEqual(response.status_code, 200, response.content[:400])
        circles = response.json()['alanlar'][0]['daireler']
        self.assertEqual(circles[10]['x_mm'], 11)
        self.assertAlmostEqual(circles[10]['y_mm'], 26.8, places=2)
        self.assertTrue(response.json()['hazir'])
        form_uzayi = self.client.post(
            f'{BASE}{pk}/layout/', {'belge': belge, 'form_uzayi': True}, format='json', **self.headers,
        )
        self.assertEqual(form_uzayi.status_code, 200, form_uzayi.content[:400])
        form_circles = form_uzayi.json()['alanlar'][0]['daireler']
        self.assertEqual(form_circles[10]['x_mm'], 10)
        self.assertAlmostEqual(form_circles[10]['y_mm'], 24.8, places=2)

    def test_exam_session_source_defaults_to_dat(self):
        session = ExamSession.objects.create(exam=self.exam)
        self.assertEqual(session.source_type, ExamSession.SourceType.DAT)

    def test_omr_upload_and_process_stages_without_student_answers(self):
        pk = self._upload().json()['id']
        belge = _belge({
            'ad': 'Cevaplar', 'tur': 'cevap_bloku',
            'x_mm': 10, 'y_mm': 10, 'satir': 2, 'sutun': 5,
            'cap_mm': 3, 'aralik_x_mm': 4, 'aralik_y_mm': 5,
            'kodlama_yonu': 'satir_karakter',
            'etiketler': ['A', 'B', 'C', 'D', 'E'],
            'cevap_bloku': {
                'soru_baslangic': 1, 'soru_sayisi': 2,
                'secenekler': ['A', 'B', 'C', 'D', 'E'],
            },
        })
        saved = self.client.put(f'{BASE}{pk}/belge/', {'belge': belge}, format='json', **self.headers)
        self.assertEqual(saved.status_code, 200, saved.content[:400])
        image = Image.new('RGB', (2100, 2970), 'white')
        draw = ImageDraw.Draw(image)
        for row, col in ((0, 0), (1, 2)):
            x, y = (10 + col * 4) * 10, (10 + row * 5) * 10
            draw.ellipse((x - 10, y - 10, x + 10, y + 10), fill='black')
        raw = BytesIO()
        image.save(raw, format='PNG', dpi=(254, 254))
        uploaded = self.client.post(
            f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/omr/',
            {
                'sablon_id': pk,
                'files': SimpleUploadedFile('ogrenci.png', raw.getvalue(), content_type='image/png'),
            },
            format='multipart',
            **self.headers,
        )
        self.assertEqual(uploaded.status_code, 201, uploaded.content[:400])
        job_id = uploaded.json()['id']
        self.assertEqual(StudentAnswer.objects.filter(session__exam=self.exam).count(), 0)
        processed = self.client.post(
            f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/omr/{job_id}/process/',
            {'batch_size': 1},
            format='json',
            **self.headers,
        )
        self.assertEqual(processed.status_code, 200, processed.content[:500])
        page = processed.json()['pages'][0]
        self.assertEqual(page['decoded']['cevaplar'], {'1': 'A', '2': 'C'})
        self.assertEqual(page['status'], 'REVIEW')
        self.assertEqual(StudentAnswer.objects.filter(session__exam=self.exam).count(), 0)
        self.assertEqual(OmrTaramaOturumu.objects.get(pk=job_id).status, 'REVIEW')
        premature = self.client.post(
            f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/omr/{job_id}/confirm/',
            {},
            format='json',
            **self.headers,
        )
        self.assertEqual(premature.status_code, 400, premature.content[:400])
        self.assertIn('inceleyip onaylayın', premature.json()['error'])

    def test_scan_calibration_needs_timing_marks_and_saves_nothing(self):
        pk = self._upload().json()['id']
        once = OptikDaireSablon.objects.get(pk=pk).belge
        tarama = SimpleUploadedFile('tarama.pdf', _pdf(), content_type='application/pdf')
        response = self.client.post(
            f'{BASE}{pk}/tarama-kalibrasyon/', {'tarama': tarama}, format='multipart', **self.headers,
        )
        self.assertEqual(response.status_code, 400, response.content[:400])
        self.assertIn('iz', response.json()['error'].lower())
        self.assertEqual(OptikDaireSablon.objects.get(pk=pk).belge, once)

    def test_other_institution_cannot_read_or_print(self):
        created = self._upload()
        pk = created.json()['id']
        other = User.objects.create_user(username='diger', password='test')
        grant_olcme_write(other, self.diger)
        client = APIClient()
        client.force_authenticate(user=other)
        headers = {
            'HTTP_X_KURUM_ID': str(self.diger.id),
            'HTTP_X_SUBE_ID': str(self.diger_sube.id),
        }
        self.assertEqual(client.get(f'{BASE}{pk}/', **headers).status_code, 404)
        listed = client.get(BASE, **headers)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json(), [])

    def test_reader_cannot_create(self):
        reader = User.objects.create_user(username='okur-daire', password='test')
        client = APIClient()
        client.force_authenticate(user=reader)
        dosya = SimpleUploadedFile('form.pdf', _pdf(), content_type='application/pdf')
        res = client.post(BASE, {'ad': 'Yeni', 'kaynak': dosya}, format='multipart', **self.headers)
        self.assertEqual(res.status_code, 403)

    def test_participant_print_preserves_identity_strings(self):
        rows = daire_value_rows(self.exam, [self.participant])
        self.assertEqual(rows[0]['tc'], '01234567890')
        self.assertEqual(rows[0]['ogrenci_no'], '01042')
        self.assertEqual(rows[0]['ad_soyad'], 'Ayşe Yılmaz')
        self.assertEqual(rows[0]['kitapcik'], '')
        alternating = daire_value_rows(
            self.exam, [self.participant, self.participant],
            booklet_mode='alternating_ab',
        )
        self.assertEqual([row['kitapcik'] for row in alternating], ['A', 'B'])
        fixed = daire_value_rows(self.exam, [self.participant], booklet_mode='fixed', booklet='D')
        self.assertEqual(fixed[0]['kitapcik'], 'D')
        created = self._upload()
        pk = created.json()['id']
        belge = _belge(_tc_alan(), {
            'ad': 'Ad Soyad', 'tur': 'metin', 'veri_kaynagi': 'ad_soyad',
            'x_mm': 15, 'y_mm': 25, 'genislik_mm': 80,
        })
        self.client.put(f'{BASE}{pk}/belge/', {'belge': belge}, format='json', **self.headers)
        res = self.client.post(
            f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/optik-daire-yazdir/',
            {'sablon_id': pk, 'participant_ids': [self.participant.id]},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertEqual(res['Content-Type'], 'application/pdf')
        reader = PdfReader(BytesIO(res.content))
        self.assertAlmostEqual(float(reader.pages[0].mediabox.width), 595, places=2)
        self.assertIn('AYŞE YILMAZ', reader.pages[0].extract_text())
        self.assertNotIn('KAYNAKFORM', reader.pages[0].extract_text())

    def test_page_image_and_second_page_size(self):
        created = self._upload()
        pk = created.json()['id']
        image = self.client.get(f'{BASE}{pk}/sayfa/?no=1', **self.headers)
        self.assertEqual(image.status_code, 200, image.content[:200])
        self.assertEqual(image['Content-Type'], 'image/png')
        self.assertTrue(image.content.startswith(b'\x89PNG'))
        patched = self.client.patch(
            f'{BASE}{pk}/', {'sayfa_no': 2}, format='json', **self.headers,
        )
        self.assertEqual(patched.status_code, 200, patched.content[:300])
        self.assertEqual(patched.json()['sayfa_no'], 2)

    def test_fmt_import_does_not_save_the_template(self):
        created = self._upload(ad='FMT deneme')
        pk = created.json()['id']
        belge = _belge({
            'ad': 'Ad Soyad',
            'tur': 'daire_dizisi',
            'veri_kaynagi': 'ad_soyad',
            'x_mm': 13.57,
            'y_mm': 165.26,
            'satir': 29,
            'sutun': 20,
            'cap_mm': 3.2,
            'aralik_x_mm': 4.287,
            'aralik_y_mm': 4.295,
            'kodlama_yonu': 'sutun_karakter',
        })
        saved = self.client.put(
            f'{BASE}{pk}/belge/', {'belge': belge}, format='json', **self.headers,
        )
        self.assertEqual(saved.status_code, 200, saved.content[:400])
        once = OptikDaireSablon.objects.get(pk=pk).belge
        dosya = SimpleUploadedFile('optik129.fmt', FMT_129.read_bytes(), content_type='text/plain')
        res = self.client.post(f'{BASE}{pk}/fmt/', {'dosya': dosya}, format='multipart', **self.headers)
        self.assertEqual(res.status_code, 200, res.content[:500])
        body = res.json()
        self.assertEqual(body['fmt']['bagli'], 'ADI SOYADI')
        self.assertEqual(len(body['alanlar']), 17)
        self.assertEqual(OptikDaireSablon.objects.get(pk=pk).belge, once)


class FmtOptik129Test(SimpleTestCase):
    def test_name_anchor_places_identity_and_166_questions(self):
        belge = _belge({
            'ad': 'Ad Soyad',
            'tur': 'daire_dizisi',
            'veri_kaynagi': 'ad_soyad',
            'x_mm': 13.57,
            'y_mm': 165.26,
            'satir': 29,
            'sutun': 20,
            'cap_mm': 3.2,
            'isaret_cap_mm': 2.18,
            'aralik_x_mm': 4.287,
            'aralik_y_mm': 4.295,
            'kodlama_yonu': 'sutun_karakter',
        })
        sonuc = fmt_uygula(FMT_129.read_bytes(), 'OPTİK-129_SEKONIC.fmt', belge, 210, 297)
        alanlar = {alan['veri_kaynagi'] or alan['ad']: alan for alan in sonuc['alanlar']}
        ad = alanlar['ad_soyad']
        self.assertEqual(ad['kodlama_yonu'], 'sutun_karakter')
        self.assertEqual((ad['satir'], ad['sutun']), (29, 20))
        self.assertEqual(ad['x_mm'], 13.57)
        self.assertEqual(ad['y_mm'], 165.26)
        self.assertEqual(ad['etiketler'], list(HARFLER))
        self.assertEqual(ad['aralik_x_mm'], 4.287)
        self.assertEqual(ad['aralik_y_mm'], 4.295)
        tc = alanlar['tc']
        self.assertEqual((tc['satir'], tc['sutun'], tc['kodlama_yonu']), (10, 11, 'sutun_karakter'))
        self.assertEqual(tc['etiketler'], list('0123456789'))
        self.assertEqual(tc['x_mm'], 13.57)
        self.assertEqual(tc['y_mm'], 109.43)
        ogrenci = alanlar['ogrenci_no']
        self.assertEqual((ogrenci['satir'], ogrenci['sutun']), (10, 5))
        self.assertEqual(ogrenci['x_mm'], 52.15)
        self.assertEqual(ogrenci['y_mm'], 27.82)
        sosyal = alanlar['SOSYAL BİLİMLER']
        self.assertEqual(sosyal['tur'], 'cevap_bloku')
        self.assertEqual(sosyal['satir'], 46)
        self.assertEqual(sosyal['cevap_bloku']['soru_baslangic'], 41)
        self.assertEqual(sosyal['cevap_bloku']['secenekler'], list('ABCDE'))
        kitapcik = alanlar['kitapcik']
        self.assertEqual(kitapcik['etiketler'], ['A', '·', 'B'])
        self.assertEqual(kitapcik['sutun'], 3)
        self.assertEqual([alan['ad'] for alan in sonuc['alanlar'] if alan['veri_kaynagi'] == 'sinif'], ['SINIF-2'])
        self.assertIn('SINIF-1', sonuc['atlanan'])
        soru = sum(alan['cevap_bloku']['soru_sayisi'] for alan in sonuc['alanlar'] if alan['tur'] == 'cevap_bloku')
        self.assertEqual(soru, 166)
        self.assertEqual(sonuc['fmt']['x0_mm'], 9.283)
        self.assertEqual(sonuc['fmt']['y0_mm'], 27.82)
        self.assertEqual(sonuc['fmt']['bagli'], 'ADI SOYADI')
        tekrar, _uyari = belge_dogrula({
            'surum': 'daire-dizisi-v1',
            'alanlar': sonuc['alanlar'],
            'fmt': sonuc['fmt'],
            'kalibrasyon': {'ofset_x_mm': 1.51, 'ofset_y_mm': 1.06, 'olcek': 0.988, 'olcek_y': 0.9888},
        }, 210, 297)
        self.assertEqual(tekrar['fmt']['bagli'], 'ADI SOYADI')
        self.assertEqual(tekrar['kalibrasyon']['ofset_x_mm'], 1.51)

    def test_missing_anchor_uses_a_single_origin(self):
        sonuc = fmt_uygula(FMT_129.read_bytes(), 'optik129.fmt', {'alanlar': []}, 210, 297)
        self.assertIn('ok tuşlarıyla', sonuc['uyari'])
        self.assertEqual(sonuc['fmt']['x0_mm'], 12)
        self.assertEqual(sonuc['fmt']['y0_mm'], 18)
        self.assertEqual(len(sonuc['alanlar']), 17)
