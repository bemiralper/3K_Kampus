"""Okulizyon kazanım Excel import ve kod eşlemesi."""
from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import TestCase
from openpyxl import Workbook

from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject
from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.services.okulizyon_import import (
    classify_level,
    parse_excel_rows,
    persist_catalog,
    rows_to_topics,
)
from apps.coaching.olcme_degerlendirme.views.curriculum_views import _match_single_text


def _sample_rows():
    return [
        {'ders': 'Türkçe', 'kod': '21.1', 'sinif': 'SHG (21)',
         'unite': 1, 'konu': 0, 'kazanim': 0, 'alt': 0,
         'metin': 'SÖZCÜKTE VE SÖZ ÖBEKLERİNDE ANLAM'},
        {'ders': 'Türkçe', 'kod': '21.1.3', 'sinif': 'SHG (21)',
         'unite': 1, 'konu': 3, 'kazanim': 0, 'alt': 0,
         'metin': 'Sözcükler Arası Anlam İlişkileri'},
        {'ders': 'Fen', 'kod': '8.1', 'sinif': '8',
         'unite': 1, 'konu': 0, 'kazanim': 0, 'alt': 0,
         'metin': 'MEVSİMLER VE İKLİM'},
        {'ders': 'Fen', 'kod': '8.1.1', 'sinif': '8',
         'unite': 1, 'konu': 1, 'kazanim': 0, 'alt': 0,
         'metin': 'Mevsimlerin Oluşumu'},
        {'ders': 'Fen', 'kod': '8.1.1.1', 'sinif': '8',
         'unite': 1, 'konu': 1, 'kazanim': 1, 'alt': 0,
         'metin': 'Mevsimlerin oluşumuna yönelik tahminlerde bulunur.'},
        {'ders': 'Fen', 'kod': '8.1.1.1.1', 'sinif': '8',
         'unite': 1, 'konu': 1, 'kazanim': 1, 'alt': 1,
         'metin': 'Mevsim kavramını açıklar.'},
    ]


class ClassifyLevelTest(TestCase):
    def test_levels(self):
        self.assertEqual(classify_level(1, 0, 0, 0), 'unite')
        self.assertEqual(classify_level(1, 3, 0, 0), 'konu')
        self.assertEqual(classify_level(1, 1, 1, 0), 'kazanim')
        self.assertEqual(classify_level(1, 1, 1, 1), 'alt')


class RowsToTopicsTest(TestCase):
    def test_shg_konu_becomes_outcome(self):
        topics = rows_to_topics(_sample_rows()[:2])
        self.assertEqual(len(topics), 1)
        self.assertEqual(topics[0]['code'], '21.1')
        self.assertEqual(topics[0]['outcomes'][0]['code'], '21.1.3')
        self.assertEqual(topics[0]['outcomes'][0]['text'], 'Sözcükler Arası Anlam İlişkileri')

    def test_meb_kazanim_becomes_suboutcome(self):
        topics = rows_to_topics(_sample_rows()[2:])
        outcome = topics[0]['outcomes'][0]
        self.assertEqual(outcome['code'], '8.1.1')
        codes = [s['code'] for s in outcome['sub_outcomes']]
        self.assertEqual(codes, ['8.1.1.1', '8.1.1.1.1'])


class PersistCatalogTest(TestCase):
    def test_import_and_code_match(self):
        stats = persist_catalog(_sample_rows(), replace=True)
        self.assertEqual(stats['subjects'], 2)
        self.assertEqual(stats['outcomes'], 2)
        self.assertEqual(stats['sub_outcomes'], 2)

        turkce = Subject.objects.get(code='TURKCE')
        self.assertEqual(turkce.exam_type_filter, 'ALL')
        match = _match_single_text('21.1.3', turkce)
        self.assertIsNotNone(match)
        self.assertEqual(match['outcome_code'], '21.1.3')
        self.assertEqual(match['match_score'], 100)

        fen = Subject.objects.get(code='FEN')
        match_meb = _match_single_text('8.1.1.1', fen)
        self.assertIsNotNone(match_meb)
        self.assertEqual(match_meb['outcome_code'], '8.1.1')
        self.assertEqual(match_meb['match_type'], 'sub_outcome')

    def test_relinks_legacy_subject(self):
        old = Subject.objects.create(
            code='MAT_TYT', name='Matematik', exam_type_filter='YKS_TYT',
        )
        exam = Exam.objects.create(name='TYT Deneme', exam_type='YKS_TYT')
        section = ExamSection.objects.create(
            exam=exam, name='Matematik', question_start=61, question_end=90,
            subject=old,
        )
        persist_catalog([
            {'ders': 'Matematik', 'kod': '21.5', 'sinif': 'SHG (21)',
             'unite': 5, 'konu': 0, 'kazanim': 0, 'alt': 0,
             'metin': 'MUTLAK DEĞER'},
            {'ders': 'Matematik', 'kod': '21.5.1', 'sinif': 'SHG (21)',
             'unite': 5, 'konu': 1, 'kazanim': 0, 'alt': 0,
             'metin': 'Mutlak Değer Özellikleri'},
        ], replace=True)
        section.refresh_from_db()
        self.assertEqual(section.subject.code, 'MATEMATIK')
        self.assertFalse(Subject.objects.filter(code='MAT_TYT').exists())
        self.assertTrue(
            Outcome.objects.filter(code='21.5.1', topic__subject__code='MATEMATIK').exists()
        )

    def test_parse_excel_file(self):
        wb = Workbook()
        ws = wb.active
        ws.append([
            'Ders', 'Kazanım Kodu', 'Sınıf', 'Ünite No', 'Konu No',
            'Kazanım No', 'Alt Kazanım No', 'Kazanım Metni', 'Değişiklik Tarihi',
        ])
        ws.append(['Türkçe', '21.1.3', 'SHG (21)', 1, 3, 0, 0, 'Sözcükler Arası Anlam İlişkileri', None])
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / 'k.xlsx'
            wb.save(path)
            rows = parse_excel_rows(path)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['kod'], '21.1.3')
