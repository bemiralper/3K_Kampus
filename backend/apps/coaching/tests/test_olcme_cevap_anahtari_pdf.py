"""Cevap anahtarı PDF üretimi."""
from django.test import TestCase

from datetime import date

from apps.coaching.application.olcme_cevap_anahtari_pdf import (
    _group_items,
    booklet_header_text,
    cell_text,
    cevap_anahtari_filename,
    exam_date_label,
    padded_section_rows,
    parse_copies,
    render_cevap_anahtari_pdf,
    subject_fill,
)
from apps.coaching.olcme_degerlendirme.models import (
    AnswerKey, AnswerKeyItem, Exam, ExamSection,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube


class CevapAnahtariPdfTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='PDF Kurum', kod='PDFK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PDFK-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.exam = Exam.objects.create(
            name='TYT Deneme',
            exam_type='YKS_TYT',
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
            exam_date=date(2026, 8, 14),
        )
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Türkçe', order=1, question_start=1, question_end=3,
        )

    def test_render_requires_items(self):
        with self.assertRaises(ValueError):
            render_cevap_anahtari_pdf(self.exam)

    def test_render_pdf_bytes(self):
        key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        AnswerKeyItem.objects.create(
            answer_key=key, section=self.section, question_number=1, correct_answer='B',
        )
        AnswerKeyItem.objects.create(
            answer_key=key, section=self.section, question_number=2, correct_answer='INVALID',
        )
        data = render_cevap_anahtari_pdf(self.exam)
        self.assertTrue(data.startswith(b'%PDF'))
        self.assertGreater(len(data), 400)
        self.assertEqual(
            cevap_anahtari_filename(self.exam),
            'TYT_Deneme_14_Ağustos_2026.pdf',
        )

    def test_render_a_and_b_booklets(self):
        key_a = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        key_b = AnswerKey.objects.create(exam=self.exam, booklet='B', is_primary=False)
        AnswerKeyItem.objects.create(
            answer_key=key_a, section=self.section, question_number=1, correct_answer='A',
        )
        AnswerKeyItem.objects.create(
            answer_key=key_b, section=self.section, question_number=1, correct_answer='C',
        )
        data = render_cevap_anahtari_pdf(self.exam)
        self.assertTrue(data.startswith(b'%PDF'))
        self.assertGreater(len(data), 800)

    def test_cell_combines_number_and_letter(self):
        key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        item = AnswerKeyItem.objects.create(
            answer_key=key, section=self.section, question_number=13, correct_answer='B',
        )
        self.assertEqual(cell_text(item), '13.B')
        self.assertEqual(booklet_header_text(self.exam, key), 'A Kitapçığı')
        self.assertNotEqual(subject_fill('A'), subject_fill('B'))

    def test_section_rows_pad_to_twelve(self):
        key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        items = [
            AnswerKeyItem.objects.create(
                answer_key=key, section=self.section, question_number=n, correct_answer='A',
            )
            for n in range(1, 5)
        ]
        rows = padded_section_rows(items)
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(rows[0]), 12)
        self.assertEqual(rows[0][:4], ['1.A', '2.A', '3.A', '4.A'])
        self.assertEqual(rows[0][4:], [''] * 8)

    def test_parent_section_restarts_numbering(self):
        math = ExamSection.objects.create(
            exam=self.exam, name='Temel Matematik', order=3,
            question_start=66, question_end=105,
        )
        geo = ExamSection.objects.create(
            exam=self.exam, name='Geometri', order=4,
            question_start=96, question_end=105,
            is_sub_section=True, parent_section=math,
        )
        key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        items = [
            AnswerKeyItem.objects.create(
                answer_key=key, section=math, question_number=66, correct_answer='A',
            ),
            AnswerKeyItem.objects.create(
                answer_key=key, section=math, question_number=67, correct_answer='B',
            ),
            AnswerKeyItem.objects.create(
                answer_key=key, section=geo, question_number=96, correct_answer='C',
            ),
        ]
        groups = _group_items(items)
        self.assertEqual(list(groups.keys()), ['Temel Matematik'])
        rows = padded_section_rows(groups['Temel Matematik'])
        self.assertEqual(rows[0][:3], ['1.A', '2.B', '3.C'])

    def test_nested_range_merges_geometry_without_flag(self):
        math = ExamSection.objects.create(
            exam=self.exam, name='Temel Matematik', order=3,
            question_start=66, question_end=105,
        )
        geo = ExamSection.objects.create(
            exam=self.exam, name='Geometri', order=4,
            question_start=96, question_end=105,
        )
        key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        items = [
            AnswerKeyItem.objects.create(
                answer_key=key, section=math, question_number=66, correct_answer='A',
            ),
            AnswerKeyItem.objects.create(
                answer_key=key, section=geo, question_number=96, correct_answer='E',
            ),
        ]
        groups = _group_items(items)
        self.assertEqual(list(groups.keys()), ['Temel Matematik'])
        rows = padded_section_rows(groups['Temel Matematik'])
        self.assertEqual(rows[0][:2], ['1.A', '2.E'])

    def test_name_fold_merges_sibling_geometry(self):
        math = ExamSection.objects.create(
            exam=self.exam, name='Temel Matematik', order=3,
            question_start=61, question_end=90,
        )
        geo = ExamSection.objects.create(
            exam=self.exam, name='Geometri', order=4,
            question_start=91, question_end=100,
        )
        key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        items = [
            AnswerKeyItem.objects.create(
                answer_key=key, section=math, question_number=61, correct_answer='A',
            ),
            AnswerKeyItem.objects.create(
                answer_key=key, section=geo, question_number=91, correct_answer='E',
            ),
        ]
        groups = _group_items(items)
        self.assertEqual(list(groups.keys()), ['Temel Matematik'])
        rows = padded_section_rows(groups['Temel Matematik'])
        self.assertEqual(rows[0][:2], ['1.A', '2.E'])

    def test_global_numbers_display_as_section_local(self):
        key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        items = [
            AnswerKeyItem.objects.create(
                answer_key=key, section=self.section, question_number=n, correct_answer='D',
            )
            for n in (41, 42, 43)
        ]
        rows = padded_section_rows(items)
        self.assertEqual(rows[0][:3], ['1.D', '2.D', '3.D'])

    def test_exam_date_label(self):
        self.assertEqual(exam_date_label(self.exam), '14 Ağustos 2026')

    def test_filename_uses_exam_name_and_date(self):
        self.assertEqual(
            cevap_anahtari_filename(self.exam),
            'TYT_Deneme_14_Ağustos_2026.pdf',
        )
        self.exam.exam_date = None
        self.assertEqual(cevap_anahtari_filename(self.exam), 'TYT_Deneme.pdf')

    def test_parse_copies(self):
        self.assertEqual(parse_copies('6'), 6)
        self.assertEqual(parse_copies('8'), 8)
        self.assertEqual(parse_copies('3'), 1)
        self.assertEqual(parse_copies(None), 1)

    def test_six_tables_per_page(self):
        key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        for n in range(1, 5):
            AnswerKeyItem.objects.create(
                answer_key=key, section=self.section, question_number=n, correct_answer='C',
            )
        data = render_cevap_anahtari_pdf(self.exam, copies_per_page=6, booklets=['A'])
        self.assertTrue(data.startswith(b'%PDF'))
        self.assertGreater(len(data), 800)
        eight = render_cevap_anahtari_pdf(self.exam, copies_per_page=8, booklets=['A'])
        self.assertTrue(eight.startswith(b'%PDF'))
        self.assertGreater(len(eight), 800)

    def test_b_booklet_uses_a_mapping(self):
        from apps.coaching.application.olcme_cevap_anahtari_pdf import _group_items, _group_rows, _key_payloads

        key_a = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        key_b = AnswerKey.objects.create(exam=self.exam, booklet='B', is_primary=False)
        AnswerKeyItem.objects.create(
            answer_key=key_a, section=self.section, question_number=1,
            correct_answer='A', b_question_number=3,
        )
        AnswerKeyItem.objects.create(
            answer_key=key_a, section=self.section, question_number=2,
            correct_answer='B', b_question_number=1,
        )
        AnswerKeyItem.objects.create(
            answer_key=key_a, section=self.section, question_number=3,
            correct_answer='C', b_question_number=2,
        )
        AnswerKeyItem.objects.create(
            answer_key=key_b, section=self.section, question_number=1, correct_answer='X',
        )
        payloads = _key_payloads(self.exam, [key_a, key_b])
        b_items = dict(payloads)[key_b]
        groups = _group_items(b_items, include_empty=True)
        rows = _group_rows(groups['Türkçe'])
        self.assertEqual(rows[0][:3], ['1.B', '2.C', '3.A'])

    def test_ab_tables_share_row_count(self):
        from apps.coaching.application.olcme_cevap_anahtari_pdf import _row_kinds

        key_a = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        key_b = AnswerKey.objects.create(exam=self.exam, booklet='B', is_primary=False)
        for n in range(1, 4):
            AnswerKeyItem.objects.create(
                answer_key=key_a, section=self.section, question_number=n, correct_answer='A',
            )
        AnswerKeyItem.objects.create(
            answer_key=key_b, section=self.section, question_number=1, correct_answer='C',
        )
        items_a = list(key_a.items.all())
        items_b = list(key_b.items.all())
        self.assertEqual(_row_kinds(items_a), _row_kinds(items_b))
