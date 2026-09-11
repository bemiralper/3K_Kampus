"""
Optik sütunlarının global soru numarasına hizalanması ve net hesabı.

TYT'de Fen Bilimleri alt bölümlere (Fizik / Kimya / Biyoloji) ayrılır.
Bölümler arka arkaya eklendiğinde, bir sütunun genişliği bölümün soru
sayısıyla uyuşmazsa sonraki tüm bölümler kayıyor ve hata en çok son alt
bölümde (Biyoloji) birikiyordu.
"""
from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.views.result_views import (
    _assemble_section_answers,
    _score_answers,
)


class _Sec:
    """ExamSection'ın hizalama için gereken alanları."""

    def __init__(self, pk, start, end, parent=None, order=0):
        self.id = pk
        self.question_start = start
        self.question_end = end
        self.parent_section_id = parent
        self.order = order


class AssembleSectionAnswersTest(TestCase):
    def setUp(self):
        # Türkçe 1–10, Fen 11–25 → Fizik 11–18 (8), Biyoloji 19–25 (7)
        self.turkce = _Sec(1, 1, 10, order=0)
        self.fen = _Sec(2, 11, 25, order=1)
        self.fizik = _Sec(3, 11, 18, parent=2, order=0)
        self.biyoloji = _Sec(4, 19, 25, parent=2, order=1)
        self.sections = [self.turkce, self.fen]
        self.sub_sections = [self.fizik, self.biyoloji]
        self.total = 25

    def test_columns_land_on_their_own_question_range(self):
        line = 'A' * 10 + 'B' * 8 + 'C' * 7
        fields = {
            'ders_1': (0, 10),
            'ders_3': (10, 18),
            'ders_4': (18, 25),
        }
        out = _assemble_section_answers(
            line, self.sections, self.sub_sections, fields, self.total, True,
        )
        self.assertEqual(out, 'A' * 10 + 'B' * 8 + 'C' * 7)

    def test_too_wide_column_does_not_shift_later_sections(self):
        """Fizik sütunu 1 karakter geniş haritalanmış.

        Eski davranışta Biyoloji bir kayıyordu: beklenen 'EABCDEA' yerine
        'EEABCDE' okunuyor, netler bozuluyordu.
        """
        line = 'A' * 10 + 'BCDEABCD' + 'EABCDEA'
        fields = {
            'ders_1': (0, 10),
            'ders_3': (10, 19),   # 9 karakter, olması gereken 8
            'ders_4': (18, 25),
        }
        out = _assemble_section_answers(
            line, self.sections, self.sub_sections, fields, self.total, True,
        )
        # Biyoloji kendi aralığında ve kaymamış olmalı.
        self.assertEqual(out[18:25], 'EABCDEA')
        # Fizik fazla karakteri taşımamalı.
        self.assertEqual(out[10:18], 'BCDEABCD')
        self.assertEqual(len(out), 25)

    def test_too_narrow_column_is_padded_not_borrowed(self):
        """Dar sütun sonraki bölümden karakter çalmamalı."""
        line = 'A' * 10 + 'B' * 8 + 'C' * 7
        fields = {
            'ders_1': (0, 10),
            'ders_3': (10, 16),   # 6 karakter, olması gereken 8
            'ders_4': (18, 25),
        }
        out = _assemble_section_answers(
            line, self.sections, self.sub_sections, fields, self.total, True,
        )
        self.assertEqual(out[10:18], 'B' * 6 + '  ')
        self.assertEqual(out[18:25], 'C' * 7)

    def test_section_order_field_does_not_drive_alignment(self):
        """`order` aralıklarla ters olsa da hizalama question_start'a göre."""
        self.fizik.order = 5
        self.biyoloji.order = 1
        line = 'A' * 10 + 'B' * 8 + 'C' * 7
        fields = {
            'ders_1': (0, 10),
            'ders_3': (10, 18),
            'ders_4': (18, 25),
        }
        out = _assemble_section_answers(
            line, self.sections, self.sub_sections, fields, self.total, True,
        )
        self.assertEqual(out, 'A' * 10 + 'B' * 8 + 'C' * 7)

    def test_unmapped_section_becomes_blank_not_missing(self):
        line = 'A' * 10 + 'B' * 8 + 'C' * 7
        fields = {'ders_1': (0, 10), 'ders_4': (18, 25)}
        out = _assemble_section_answers(
            line, self.sections, self.sub_sections, fields, self.total, True,
        )
        self.assertEqual(len(out), 25)
        self.assertEqual(out[10:18], ' ' * 8)
        self.assertEqual(out[18:25], 'C' * 7)


class BiyolojiNetTest(TestCase):
    """Kayma olduğunda Biyoloji neti yanlış çıkıyordu — uçtan uca."""

    def setUp(self):
        self.exam = Exam.objects.create(name='TYT', exam_type='YKS_TYT')
        self.turkce = ExamSection.objects.create(
            exam=self.exam, name='Türkçe', order=0,
            question_start=1, question_end=10,
        )
        self.fen = ExamSection.objects.create(
            exam=self.exam, name='Fen Bilimleri', order=1,
            question_start=11, question_end=25,
        )
        self.fizik = ExamSection.objects.create(
            exam=self.exam, name='Fizik', order=0, is_sub_section=True,
            parent_section=self.fen, question_start=11, question_end=18,
        )
        self.biyoloji = ExamSection.objects.create(
            exam=self.exam, name='Biyoloji', order=1, is_sub_section=True,
            parent_section=self.fen, question_start=19, question_end=25,
        )

    def test_biyoloji_net_matches_its_own_column(self):
        # Biyoloji cevapları konuma bağlı: kayma olursa net düşer.
        biyoloji_key = 'EABCDEA'
        correct_map = {}
        for q in range(1, 11):
            correct_map[q] = {'answer': 'A', 'is_cancelled': False}
        for q in range(11, 19):
            correct_map[q] = {'answer': 'B', 'is_cancelled': False}
        for offset, ch in enumerate(biyoloji_key):
            correct_map[19 + offset] = {'answer': ch, 'is_cancelled': False}

        # Öğrenci Biyoloji'nin 7 sorusunu da doğru yapmış. Fizik sütunu hatalı
        # genişlikte; eski kod Biyoloji'yi kaydırıp yanlış üretiyordu.
        line = 'A' * 10 + 'B' * 8 + biyoloji_key
        fields = {
            'ders_%d' % self.turkce.id: (0, 10),
            'ders_%d' % self.fizik.id: (10, 19),   # hatalı genişlik
            'ders_%d' % self.biyoloji.id: (18, 25),
        }
        answers_raw = _assemble_section_answers(
            line, [self.turkce, self.fen], [self.fizik, self.biyoloji],
            fields, 25, True,
        )
        _, _, section_scores, _ = _score_answers(
            answers_raw, 25, 'A', correct_map, {}, {},
            [self.turkce, self.fen], 4, [self.fizik, self.biyoloji],
        )
        biyo = section_scores[self.biyoloji.id]
        self.assertEqual(biyo['correct'], 7)
        self.assertEqual(biyo['wrong'], 0)
        self.assertEqual(biyo['net'], 7.0)

    def test_wrong_answers_reduce_net_by_penalty(self):
        correct_map = {q: {'answer': 'C', 'is_cancelled': False} for q in range(19, 26)}
        for q in range(1, 19):
            correct_map[q] = {'answer': 'A', 'is_cancelled': False}
        # Biyoloji: 3 doğru, 4 yanlış → net 3 - 4/4 = 2
        line = 'A' * 10 + 'A' * 8 + 'CCCDDDD'
        fields = {
            'ders_%d' % self.turkce.id: (0, 10),
            'ders_%d' % self.fizik.id: (10, 18),
            'ders_%d' % self.biyoloji.id: (18, 25),
        }
        answers_raw = _assemble_section_answers(
            line, [self.turkce, self.fen], [self.fizik, self.biyoloji],
            fields, 25, True,
        )
        _, _, section_scores, _ = _score_answers(
            answers_raw, 25, 'A', correct_map, {}, {},
            [self.turkce, self.fen], 4, [self.fizik, self.biyoloji],
        )
        biyo = section_scores[self.biyoloji.id]
        self.assertEqual((biyo['correct'], biyo['wrong'], biyo['empty']), (3, 4, 0))
        self.assertEqual(biyo['net'], 2.0)
