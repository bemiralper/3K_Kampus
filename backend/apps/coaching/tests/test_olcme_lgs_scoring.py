"""LGS 7 / 8 puan, şablon ve sıralama — YKS formülüne karışmamalı."""
from types import SimpleNamespace

from django.test import SimpleTestCase, TestCase

from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.services.exam_templates import (
    get_default_duration,
    get_template_sections,
)
from apps.coaching.olcme_degerlendirme.services.scoring import (
    calculate_lgs_score,
    calculate_score_for_exam,
    calculate_tyt_score,
    estimate_ranking,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube


LGS_8_FULL = {
    'Türkçe': 20,
    'İnkılap Tarihi': 10,
    'Din Kültürü': 10,
    'Yabancı Dil': 10,
    'Matematik': 20,
    'Fen Bilimleri': 20,
}

LGS_7_FULL = {
    'Türkçe': 20,
    'Sosyal Bilgiler': 10,
    'Din Kültürü': 10,
    'Yabancı Dil': 10,
    'Matematik': 20,
    'Fen Bilimleri': 20,
}

TYT_NETS = {
    'Türkçe': 32.50,
    'Sosyal Bilimler': 15.00,
    'Temel Matematik': 38.75,
    'Fen Bilimleri': 10.00,
}


class LgsTemplateTest(SimpleTestCase):
    def test_lgs_8_is_official_90_questions(self):
        rows = get_template_sections('LGS')
        self.assertEqual([r['name'] for r in rows], [
            'Türkçe', 'İnkılap Tarihi', 'Din Kültürü', 'Yabancı Dil', 'Matematik', 'Fen Bilimleri',
        ])
        self.assertEqual(rows[-1]['question_end'], 90)
        self.assertEqual(sum(r['question_count'] for r in rows), 90)
        self.assertEqual(get_default_duration('LGS'), 155)

    def test_lgs_7_uses_sosyal_bilgiler(self):
        rows = get_template_sections('LGS_7')
        self.assertEqual([r['name'] for r in rows], [
            'Türkçe', 'Sosyal Bilgiler', 'Din Kültürü', 'Yabancı Dil', 'Matematik', 'Fen Bilimleri',
        ])
        self.assertEqual(rows[-1]['question_end'], 90)
        self.assertEqual(get_default_duration('LGS_7'), 155)

    def test_tyt_template_unchanged(self):
        rows = get_template_sections('YKS_TYT', include_optional_philosophy=False)
        self.assertEqual(rows[0]['name'], 'Türkçe')
        self.assertEqual(rows[0]['question_end'], 40)
        self.assertEqual(rows[-1]['question_end'], 120)


class LgsScoreFormulaTest(SimpleTestCase):
    def test_full_nets_reach_500(self):
        eight = calculate_lgs_score(LGS_8_FULL, kind='LGS')
        seven = calculate_lgs_score(LGS_7_FULL, kind='LGS_7')
        self.assertAlmostEqual(eight['puan'], 500.0, places=1)
        self.assertAlmostEqual(seven['puan'], 500.0, places=1)

    def test_empty_nets_stay_at_booklet_base(self):
        r = calculate_lgs_score({k: 0 for k in LGS_8_FULL}, kind='LGS')
        self.assertAlmostEqual(r['puan'], 196.60, places=2)

    def test_booklet_student_matches_publisher_score(self):
        # 8.SINIF ALAN TG 1 — Ahmet Selim Kara, karne 428,240
        nets = {
            'Türkçe': 17.33,
            'İnkılap Tarihi': 8.67,
            'Din Kültürü': 8.67,
            'Yabancı Dil': 5.00,
            'Matematik': 10.67,
            'Fen Bilimleri': 18.67,
        }
        r = calculate_lgs_score(nets, kind='LGS')
        self.assertLess(abs(r['puan'] - 428.240), 0.05)

    def test_negative_net_lowers_score(self):
        # Hafsa Tuana Engin, matematik neti negatif, karne 274,011
        nets = {
            'Türkçe': 5.67,
            'İnkılap Tarihi': 4.67,
            'Din Kültürü': 6.33,
            'Yabancı Dil': 1.67,
            'Matematik': -2.33,
            'Fen Bilimleri': 11.00,
        }
        r = calculate_lgs_score(nets, kind='LGS')
        self.assertLess(abs(r['puan'] - 274.011), 0.05)

    def test_aliases_count_for_lgs_8(self):
        nets = {
            'Türkçe': 20,
            'T.C. İnkılap Tarihi ve Atatürkçülük': 10,
            'Din Kültürü ve Ahlak Bilgisi': 10,
            'İngilizce': 10,
            'Matematik': 20,
            'Fen': 20,
        }
        r = calculate_lgs_score(nets, kind='LGS')
        self.assertAlmostEqual(r['puan'], 500.0, places=1)

    def test_inkilap_does_not_count_on_grade_7(self):
        mixed = {
            **LGS_7_FULL,
            'İnkılap Tarihi': 10,
            'Sosyal Bilgiler': 0,
        }
        r = calculate_lgs_score(mixed, kind='LGS_7')
        full = calculate_lgs_score(LGS_7_FULL, kind='LGS_7')
        self.assertAlmostEqual(full['puan'] - r['puan'], 10 * 1.731, places=2)

    def test_lgs_does_not_use_tyt_coefficients(self):
        tyt = calculate_tyt_score(TYT_NETS, year=2025)
        lgs = calculate_lgs_score(LGS_8_FULL, kind='LGS')
        self.assertAlmostEqual(tyt['puan'], 434.70, places=1)
        self.assertGreater(lgs['puan'], 490)

    def test_ranking_uses_lgs_table_not_tyt(self):
        lgs = estimate_ranking(400, 'LGS', 2025)['tahmini_siralama']
        lgs7 = estimate_ranking(400, 'LGS_7', 2025)['tahmini_siralama']
        tyt = estimate_ranking(400, 'YKS_TYT', 2025)['tahmini_siralama']
        self.assertEqual(lgs, 25_000)
        self.assertEqual(lgs7, 25_000)
        self.assertEqual(tyt, 44_193)
        self.assertNotEqual(lgs, tyt)


class LgsScoreRoutingTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='LGS Puan Kurum', kod='LGSP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='LGSP-A')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )

    def _exam(self, exam_type, names):
        exam = Exam.objects.create(
            name=f'{exam_type} puan',
            exam_type=exam_type,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
        )
        start = 1
        for i, (name, count) in enumerate(names):
            ExamSection.objects.create(
                exam=exam, name=name, order=i,
                question_start=start, question_end=start + count - 1,
            )
            start += count
        return exam

    def test_score_for_exam_routes_lgs_and_leaves_tyt_alone(self):
        lgs = self._exam('LGS', [
            ('Türkçe', 20), ('İnkılap Tarihi', 10), ('Din Kültürü', 10),
            ('Yabancı Dil', 10), ('Matematik', 20), ('Fen Bilimleri', 20),
        ])
        tyt = self._exam('YKS_TYT', [
            ('Türkçe', 40), ('Sosyal Bilimler', 20),
            ('Temel Matematik', 40), ('Fen Bilimleri', 20),
        ])
        lgs_score = calculate_score_for_exam(lgs, LGS_8_FULL, year=2025)
        tyt_score = calculate_score_for_exam(tyt, TYT_NETS, year=2025)
        self.assertAlmostEqual(lgs_score['puan'], 500.0, places=1)
        self.assertAlmostEqual(tyt_score['puan'], 434.70, places=1)

    def test_score_for_exam_routes_lgs_7(self):
        exam = self._exam('LGS_7', [
            ('Türkçe', 20), ('Sosyal Bilgiler', 10), ('Din Kültürü', 10),
            ('Yabancı Dil', 10), ('Matematik', 20), ('Fen Bilimleri', 20),
        ])
        score = calculate_score_for_exam(exam, LGS_7_FULL, year=2025)
        self.assertAlmostEqual(score['puan'], 500.0, places=1)

    def test_deneme_still_uses_tyt_formula(self):
        exam = SimpleNamespace(exam_type='DENEME', kurum_id=None, sections=None)
        score = calculate_score_for_exam(exam, TYT_NETS, year=2025)
        self.assertAlmostEqual(score['puan'], 434.70, places=1)
