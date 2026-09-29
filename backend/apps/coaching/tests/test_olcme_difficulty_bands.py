"""Zorluk bandı: eşik, iptal, az katılım, B kitapçığı ve karne cümlesi."""
import io

from django.test import SimpleTestCase

from apps.coaching.olcme_degerlendirme.services.difficulty_bands import (
    MIN_PARTICIPANTS,
    difficulty_note,
    question_bands,
    summarize_difficulty,
)


def _cohort(results_by_q, n=MIN_PARTICIPANTS, booklet=''):
    """Her soru için sonuç listesi. Uzunluk n olmalı."""
    answers = []
    for i in range(n):
        comparison = {}
        for q, results in results_by_q.items():
            comparison[str(q)] = {'result': results[i]}
        answers.append((booklet, comparison))
    return answers


class DifficultyBandTest(SimpleTestCase):
    def test_thresholds_match_question_analysis(self):
        # 20 kişide 14 doğru = %70 kolay, 8 doğru = %40 orta, 7 doğru = %35 zor
        easy = ['correct'] * 14 + ['wrong'] * 6
        mid = ['correct'] * 8 + ['wrong'] * 12
        hard = ['correct'] * 7 + ['wrong'] * 13
        bands = question_bands(
            _cohort({'1': easy, '2': mid, '3': hard}),
            participant_count=20,
            cancelled_questions=set(),
        )
        self.assertEqual(bands, {'1': 'kolay', '2': 'orta', '3': 'zor'})

    def test_under_twenty_participants_hides_the_block(self):
        bands = question_bands(
            _cohort({'1': ['correct'] * 19}, n=19),
            participant_count=19,
            cancelled_questions=set(),
        )
        self.assertEqual(bands, {})
        summary = summarize_difficulty(
            booklet='',
            comparison={'1': {'result': 'wrong'}},
            participant_count=19,
            bands={'1': 'kolay'},
        )
        self.assertIsNone(summary)

    def test_cancelled_question_is_left_out(self):
        rows = ['correct'] * 20
        bands = question_bands(
            _cohort({'1': rows, '2': rows}),
            participant_count=20,
            cancelled_questions={'2'},
        )
        self.assertEqual(list(bands), ['1'])

    def test_result_cancelled_is_left_out_even_without_the_key_flag(self):
        cancelled = ['cancelled'] * 20
        kept = ['correct'] * 20
        bands = question_bands(
            _cohort({'4': cancelled, '5': kept}),
            participant_count=20,
            cancelled_questions=set(),
        )
        self.assertEqual(list(bands), ['5'])

    def test_booklet_b_maps_onto_the_same_question(self):
        a_rows = [('A', {'5': {'result': 'correct'}}) for _ in range(19)]
        b_row = ('B', {'1': {'result': 'wrong'}})
        bands = question_bands(
            a_rows + [b_row],
            participant_count=20,
            cancelled_questions=set(),
            b_to_a={1: 5},
        )
        self.assertEqual(bands, {'5': 'kolay'})
        summary = summarize_difficulty(
            booklet='B',
            comparison={'1': {'result': 'wrong'}},
            participant_count=20,
            bands=bands,
            b_to_a={1: 5},
        )
        self.assertEqual(summary['bands'], [
            {'key': 'kolay', 'label': 'Kolay', 'soru': 1, 'dogru': 0, 'yanlis': 1, 'bos': 0},
        ])
        self.assertIn('1 yanlış', summary['note'])
        self.assertNotIn('orta', summary['note'].lower())

    def test_empty_band_is_omitted_and_note_does_not_invent_it(self):
        summary = summarize_difficulty(
            booklet='',
            comparison={
                '1': {'result': 'correct'},
                '2': {'result': 'wrong'},
            },
            participant_count=20,
            bands={'1': 'kolay', '2': 'orta'},
        )
        keys = [row['key'] for row in summary['bands']]
        self.assertEqual(keys, ['kolay', 'orta'])
        self.assertNotIn('Zor', [row['label'] for row in summary['bands']])
        self.assertIn('Kolay soruların tamamı doğru.', summary['note'])
        self.assertIn('Orta sorularda 1 yanlış var.', summary['note'])

    def test_sayisal_field_is_math_and_science_only(self):
        from apps.coaching.olcme_degerlendirme.views.analysis_views import field_question_numbers

        spans = [
            ('Türk Dili ve Edebiyatı', 1, 24),
            ('Tarih-1', 25, 34),
            ('Matematik', 81, 110),
            ('Geometri', 111, 120),
            ('Fizik', 121, 134),
            ('Kimya', 135, 147),
            ('Biyoloji', 148, 160),
        ]
        numbers = field_question_numbers(spans, 'SAYISAL')
        self.assertIn('81', numbers)
        self.assertIn('160', numbers)
        self.assertNotIn('1', numbers)
        self.assertNotIn('25', numbers)
        self.assertEqual(len(numbers), 80)

    def test_ayt_field_keeps_kolay_but_limits_orta_and_zor(self):
        summary = summarize_difficulty(
            booklet='',
            comparison={
                '1': {'result': 'wrong'},   # kolay, alan dışı — kolayda kalır
                '2': {'result': 'wrong'},   # orta, alan dışı
                '3': {'result': 'wrong'},   # orta, alanda
                '4': {'result': 'wrong'},   # zor, alan dışı
                '5': {'result': 'correct'}, # zor, alanda
            },
            participant_count=20,
            bands={'1': 'kolay', '2': 'orta', '3': 'orta', '4': 'zor', '5': 'zor'},
            field_questions={'3', '5'},
        )
        by = {row['key']: row for row in summary['bands']}
        self.assertEqual(by['kolay']['soru'], 1)
        self.assertEqual(by['kolay']['yanlis'], 1)
        self.assertNotIn('scope', by['kolay'])
        self.assertEqual(by['orta']['soru'], 1)
        self.assertEqual(by['orta']['yanlis'], 1)
        self.assertEqual(by['orta']['scope'], 'alan')
        self.assertEqual(by['zor']['soru'], 1)
        self.assertEqual(by['zor']['dogru'], 1)
        self.assertEqual(by['zor']['scope'], 'alan')
        self.assertIn('Alanındaki orta sorularda 1 yanlış var.', summary['note'])

    def test_only_hard_wrongs_do_not_call_them_the_main_gap(self):
        note = difficulty_note([
            {'key': 'kolay', 'yanlis': 0, 'bos': 0},
            {'key': 'zor', 'yanlis': 3, 'bos': 0},
        ])
        self.assertEqual(note, 'Yanlışların tamamı zor sorularda.')

    def test_pdf_prints_the_table_and_skips_it_when_absent(self):
        from apps.coaching.application.olcme_karne_pdf import render_karne_pdf

        base = {
            'exam_name': 'TYT Deneme',
            'student_name': 'Elif Yılmaz',
            'kurum_ad': '3K Kampüs',
            'toplam_net': 60,
            'section_details': [],
            'answer_grids': [],
            'topic_blocks': [],
        }
        with_block = render_karne_pdf({
            **base,
            'difficulty': {
                'participant_count': 84,
                'bands': [
                    {'key': 'kolay', 'label': 'Kolay', 'soru': 22, 'dogru': 20, 'yanlis': 2, 'bos': 0},
                    {'key': 'orta', 'label': 'Orta', 'soru': 48, 'dogru': 31, 'yanlis': 12, 'bos': 5},
                ],
                'note': 'Kolay sorularda 2 yanlış var. Bunlar kurumun çoğunun yaptığı sorular. Orta sorularda 12 yanlış var.',
            },
        })
        without = render_karne_pdf(base)
        self.assertIn('Zorluk Seviyesi', _pdf_text(with_block))
        self.assertIn('Orta sorularda 12 yanlış', _pdf_text(with_block))
        self.assertNotIn('Zorluk Seviyesi', _pdf_text(without))


def _pdf_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        from PyPDF2 import PdfReader
    return ''.join((page.extract_text() or '') for page in PdfReader(io.BytesIO(data)).pages)
