"""Optik form yerleşimi ve PDF üzerine yazı basımı."""
from io import BytesIO
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from pypdf import PdfReader
from reportlab.pdfgen import canvas

from apps.coaching.olcme_degerlendirme.models import (
    Exam, ExamParticipant, ExamRoom, OptikForm, OptikFormAlani,
)
from apps.coaching.olcme_degerlendirme.services.optik_preset import optik_129_alanlar
from apps.coaching.olcme_degerlendirme.services.optik_print import (
    SAMPLE_VALUES,
    bubble_cells,
    class_parts,
    fill_template,
    layout_lines,
    layout_marks,
    render_optik_pdf,
    tr_upper,
)
from apps.coaching.olcme_degerlendirme.services.optik_values import participant_value_rows
from apps.coaching.olcme_degerlendirme.views.optik_form_views import ensure_balon_alanlari
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciAdres, OgrenciKayit
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

REAL_FORM = Path('/Users/taner/Desktop/optik form/optik 129.pdf')


def _blank_pdf() -> bytes:
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(595, 842))
    c.showPage()
    c.save()
    return buf.getvalue()


def _text_positions(pdf_bytes: bytes):
    reader = PdfReader(BytesIO(pdf_bytes))
    found = []

    def visitor(text, cm, tm, font_dict, font_size):
        cleaned = (text or '').strip()
        if cleaned:
            found.append((cleaned, float(tm[4]), float(tm[5])))

    for page in reader.pages:
        page.extract_text(visitor_text=visitor)
    return reader, found


class OptikTemplateTest(SimpleTestCase):
    def test_turkish_upper_and_class_split(self):
        self.assertEqual(tr_upper('Işık'), 'IŞIK')
        self.assertEqual(tr_upper('işık'), 'İŞIK')
        self.assertEqual(class_parts('11-A'), ('11', 'A', '11 / A'))
        self.assertEqual(class_parts('9/b'), ('9', 'B', '9 / B'))
        self.assertEqual(class_parts('Mezun'), ('Mezun', '', 'Mezun'))

    def test_template_drops_empty_place_pieces(self):
        self.assertEqual(fill_template('#ad#', {'ad': 'Ayşe'}), 'Ayşe')
        self.assertEqual(fill_template('#il# / #ilce#', {'il': '', 'ilce': ''}), '')
        self.assertEqual(
            fill_template('#il# / #ilce#', {'il': 'Ankara', 'ilce': 'Çankaya'}),
            'Ankara / Çankaya',
        )
        self.assertEqual(fill_template('SALON: #{salon}', {'salon': 'A'}), 'SALON: A')

    def test_inactive_and_bubble_fields_are_not_drawn(self):
        fields = [
            _field('adi', '#ad#', aktif=False),
            _field('balon', '0123456789', tur='balon'),
            _field('soyadi', '#soyad#'),
        ]
        lines = layout_lines(fields, SAMPLE_VALUES)
        self.assertEqual([line['text'] for line in lines], ['YILMAZ'])


def _field(kod, sablon, aktif=True, tur='metin', x=20, y=30, gen=40, punto=8):
    return OptikFormAlani(
        kod=kod, etiket=kod, tur=tur, sablon=sablon, aktif=aktif,
        x_mm=x, y_mm=y, genislik_mm=gen, yukseklik_mm=4, punto=punto,
    )


class OptikPrintTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(
            ad='3K Kampüs', kod='OPTK', il='Erzurum', ilce='Yakutiye',
        )
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='OPTK-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.exam = Exam.objects.create(
            name='TYT Deneme 3', exam_type='YKS_TYT',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        self.room = ExamRoom.objects.create(exam=self.exam, name='Salon 1', capacity=30)
        self.sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil, ad='11-A',
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Yılmaz',
            tc_kimlik_no='10000000146',
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci, sinif=self.sinif, egitim_yili=self.yil,
            kurum=self.kurum, sube=self.sube, okul_no='1042',
        )
        OgrenciAdres.objects.create(
            ogrenci=self.ogrenci, adres='Sokak', il='Ankara', ilce='Çankaya', varsayilan=True,
        )
        self.participant = ExamParticipant.objects.create(
            exam=self.exam, student=self.ogrenci, room=self.room, seat_no=12,
        )

    def _form(self, pdf_bytes, alanlar=None):
        form = OptikForm.objects.create(
            kurum=self.kurum,
            ad='OPTİK-129',
            pdf=SimpleUploadedFile('optik.pdf', pdf_bytes, content_type='application/pdf'),
            sayfa_genislik_mm=210,
            sayfa_yukseklik_mm=297,
        )
        rows = alanlar if alanlar is not None else optik_129_alanlar()
        OptikFormAlani.objects.bulk_create([
            OptikFormAlani(form=form, **row) for row in rows
        ])
        return form

    def test_participant_tokens(self):
        rows = participant_value_rows(self.exam, [self.participant])
        self.assertEqual(rows[0]['ad'], 'Ayşe')
        self.assertEqual(rows[0]['sinif_sube'], '11 / A')
        self.assertEqual(rows[0]['numara'], '1042')
        self.assertEqual(rows[0]['okul'], '3K Kampüs')
        self.assertEqual(rows[0]['il'], 'Erzurum')
        self.assertEqual(rows[0]['ilce'], 'Yakutiye')
        self.assertEqual(rows[0]['il_ilce'], 'Erzurum / Yakutiye')
        self.assertEqual(rows[0]['salon'], 'Salon 1 / 12')
        self.assertEqual(rows[0]['sira'], '12')
        self.assertEqual(rows[0]['tc'], '10000000146')
        self.assertEqual(rows[0]['sube'], 'A')
        self.assertEqual(rows[0]['deneme_adi'], 'TYT Deneme 3')
        self.assertEqual(rows[0]['sinav_no'], str(self.exam.pk))

    def test_text_sits_on_measured_baselines(self):
        form = self._form(_blank_pdf())
        pdf = render_optik_pdf(_blank_pdf(), form, [SAMPLE_VALUES])
        reader, found = _text_positions(pdf)
        self.assertEqual(len(reader.pages), 1)
        prefs = reader.trailer['/Root']['/ViewerPreferences']
        self.assertEqual(str(prefs['/PrintScaling']), '/None')
        by_text = {text: (x, y) for text, x, y in found}
        self.assertIn('AYŞE', by_text)
        self.assertIn('YILMAZ', by_text)
        self.assertIn('11 / A', by_text)
        self.assertIn('ANKARA / ÇANKAYA', by_text)
        page_h = float(reader.pages[0].mediabox.height)
        for label, y_mm in (
            ('AYŞE', 24.15),
            ('YILMAZ', 30.35),
            ('11 / A', 36.35),
            ('1042', 42.70),
            ('SALON 1 / 12', 55.05),
            ('ANKARA / ÇANKAYA', 60.45),
            ('129', 20.70),
        ):
            _x, y_pt = by_text[label]
            got = (page_h - y_pt) * 297 / page_h
            self.assertAlmostEqual(got, y_mm, delta=0.2, msg=label)

    def test_real_form_keeps_one_shared_scan(self):
        if not REAL_FORM.is_file():
            self.skipTest('OPTİK-129 örneği bu makinede yok')
        raw = REAL_FORM.read_bytes()
        form = self._form(raw)
        other = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mehmet', soyad='Kaya',
        )
        second = ExamParticipant.objects.create(
            exam=self.exam, student=other, room=self.room, seat_no=13,
        )
        rows = participant_value_rows(self.exam, [self.participant, second])
        pdf = render_optik_pdf(raw, form, rows)
        self.assertLess(len(pdf), int(len(raw) * 1.15))
        reader = PdfReader(BytesIO(pdf))
        self.assertEqual(len(reader.pages), 2)
        self.assertIn(b'/Im1', reader.pages[0].get_contents().get_data())
        first = reader.pages[0].extract_text()
        second = reader.pages[1].extract_text()
        self.assertIn('AYŞE', first)
        self.assertIn('1042', first)
        self.assertNotIn('MEHMET', first)
        self.assertIn('MEHMET', second)
        self.assertIn('KAYA', second)
        self.assertNotIn('AYŞE', second)
        plain = render_optik_pdf(raw, form, rows, formu_bas=False)
        self.assertLess(len(plain), len(raw) // 10)
        plain_reader = PdfReader(BytesIO(plain))
        self.assertEqual(len(plain_reader.pages), 2)
        plain_stream = plain_reader.pages[0].get_contents().get_data()
        self.assertNotIn(b'/Im1', plain_stream)
        self.assertIn('AYŞE', plain_reader.pages[0].extract_text())
        self.assertIn('MEHMET', plain_reader.pages[1].extract_text())
        self.assertEqual(float(plain_reader.pages[0].mediabox.width), float(reader.pages[0].mediabox.width))
        self.assertEqual(float(plain_reader.pages[0].mediabox.height), float(reader.pages[0].mediabox.height))

    def test_sample_bubbles_land_on_measured_cells(self):
        fields = [
            OptikFormAlani(**row)
            for row in optik_129_alanlar()
            if row['tur'] == 'balon'
        ]
        marks = {
            (round(mark['x_mm'], 2), round(mark['y_mm'], 2))
            for mark in layout_marks(fields, SAMPLE_VALUES)
        }
        # AYŞE: A sütun 0; YILMAZ'ın Y'si boşluktan sonra sütun 5, harf satırı 27.
        self.assertIn((13.59, 164.80), marks)
        self.assertIn((34.99, 280.63), marks)
        # TC 10000000146 → ilk sütun rakam 1.
        self.assertIn((13.67, 113.35), marks)
        # 1042 → ilk sütun 1, üçüncü sütun 4.
        self.assertIn((56.46, 32.22), marks)
        self.assertIn((65.00, 45.12), marks)
        # 11. sınıf ve A şubesi.
        self.assertIn((82.15, 45.11), marks)
        self.assertIn((86.44, 27.99), marks)
        self.assertEqual(len(marks), 10 + 11 + 4 + 1 + 1)
        tc = next(field for field in fields if field.kod == 'kod_tc')
        self.assertEqual(bubble_cells(tc, {**SAMPLE_VALUES, 'tc': '123'}), [])
        numara = next(field for field in fields if field.kod == 'kod_numara')
        self.assertEqual(bubble_cells(numara, {'numara': '12345'}), ['2', '3', '4', '5'])

    def test_deleted_bubble_stays_deleted(self):
        form = self._form(_blank_pdf())
        form.preset_kod = 'OPTIK-129'
        form.save(update_fields=['preset_kod'])
        form.alanlar.filter(kod='kod_tc').delete()
        ensure_balon_alanlari(form)
        self.assertFalse(form.alanlar.filter(kod='kod_tc').exists())
        self.assertTrue(form.alanlar.filter(tur='balon').exists())
