"""Güçlü / geliştirilecek alanlar — öğrenci alanına göre filtrelenir."""
from django.test import SimpleTestCase

from apps.coaching.olcme_degerlendirme.views.analysis_views import (
    _areas_for_student,
    _pick_strong_weak_areas,
    _section_name_key,
)


def _sec(sid, name, net, *, is_sub=False, parent_id=None):
    return {
        'section_id': sid,
        'section_name': name,
        'net': net,
        'is_sub_section': is_sub,
        'parent_id': parent_id,
    }


TYT_SECTIONS = [
    _sec(1, 'Türkçe', 28),
    _sec(2, 'Sosyal Bilimler', 12),
    _sec(3, 'Tarih', 3, is_sub=True, parent_id=2),
    _sec(4, 'Coğrafya', 2, is_sub=True, parent_id=2),
    _sec(5, 'Felsefe', 1, is_sub=True, parent_id=2),
    _sec(6, 'Din Kültürü', 4, is_sub=True, parent_id=2),
    _sec(7, 'Felsefe (Seçmeli)', 5, is_sub=True, parent_id=2),
    _sec(8, 'Temel Matematik', 20),
    _sec(9, 'Fen Bilimleri', 8),
]

AYT_SECTIONS = [
    _sec(10, 'TDE-Sosyal Bilimler-1', 22),
    _sec(11, 'Türk Dili ve Edebiyatı', 16, is_sub=True, parent_id=10),
    _sec(12, 'Tarih-1', 4, is_sub=True, parent_id=10),
    _sec(13, 'Coğrafya-1', 2, is_sub=True, parent_id=10),
    _sec(20, 'Sosyal Bilimler-2', 18),
    _sec(21, 'Tarih-2', 6, is_sub=True, parent_id=20),
    _sec(22, 'Coğrafya-2', 5, is_sub=True, parent_id=20),
    _sec(23, 'Felsefe Grubu', 4, is_sub=True, parent_id=20),
    _sec(24, 'Din Kültürü ve Ahlak Bilgisi', 3, is_sub=True, parent_id=20),
    _sec(25, 'Felsefe (Seçmeli)', 2, is_sub=True, parent_id=20),
    _sec(30, 'Matematik', 25),
    _sec(31, 'Matematik', 18, is_sub=True, parent_id=30),
    _sec(32, 'Geometri', 7, is_sub=True, parent_id=30),
    _sec(40, 'Fen Bilimleri', 20),
    _sec(41, 'Fizik', 9, is_sub=True, parent_id=40),
    _sec(42, 'Kimya', 6, is_sub=True, parent_id=40),
    _sec(43, 'Biyoloji', 5, is_sub=True, parent_id=40),
]


class StrongWeakAreaFilterTest(SimpleTestCase):
    def test_edebiyat_alias(self):
        self.assertEqual(_section_name_key('Türk Dili ve Edebiyatı'), 'edebiyat')

    def test_tyt_hides_optional_philosophy_unless_sozel(self):
        say_names = [r['section_name'] for r in _areas_for_student(TYT_SECTIONS, 'YKS_TYT', 'SAYISAL')]
        soz_names = [r['section_name'] for r in _areas_for_student(TYT_SECTIONS, 'YKS_TYT', 'SOZEL')]
        self.assertNotIn('Felsefe (Seçmeli)', say_names)
        self.assertIn('Felsefe (Seçmeli)', soz_names)
        self.assertIn('Felsefe', say_names)

    def test_ayt_sayisal_only_fen_and_mat(self):
        names = [r['section_name'] for r in _areas_for_student(AYT_SECTIONS, 'YKS_AYT', 'SAYISAL')]
        self.assertEqual(
            set(names),
            {'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji'},
        )
        self.assertNotIn('Felsefe Grubu', names)
        self.assertNotIn('Türk Dili ve Edebiyatı', names)

    def test_ayt_ea_excludes_sosyal_2_and_fen(self):
        names = [r['section_name'] for r in _areas_for_student(AYT_SECTIONS, 'YKS_AYT', 'ESIT_AGIRLIK')]
        self.assertEqual(
            set(names),
            {'Türk Dili ve Edebiyatı', 'Tarih-1', 'Coğrafya-1', 'Matematik', 'Geometri'},
        )
        self.assertNotIn('Tarih-2', names)
        self.assertNotIn('Fizik', names)

    def test_ayt_sozel_excludes_fen_and_uses_sosyal_2(self):
        names = [r['section_name'] for r in _areas_for_student(AYT_SECTIONS, 'YKS_AYT', 'SOZEL')]
        self.assertIn('Felsefe Grubu', names)
        self.assertIn('Felsefe (Seçmeli)', names)
        self.assertIn('Tarih-2', names)
        self.assertNotIn('Fizik', names)
        self.assertNotIn('Geometri', names)

    def test_ayt_hides_optional_philosophy_unless_sozel(self):
        say_names = [r['section_name'] for r in _areas_for_student(AYT_SECTIONS, 'YKS_AYT', 'SAYISAL')]
        ea_names = [r['section_name'] for r in _areas_for_student(AYT_SECTIONS, 'YKS_AYT', 'ESIT_AGIRLIK')]
        soz_names = [r['section_name'] for r in _areas_for_student(AYT_SECTIONS, 'YKS_AYT', 'SOZEL')]
        self.assertNotIn('Felsefe (Seçmeli)', say_names)
        self.assertNotIn('Felsefe (Seçmeli)', ea_names)
        self.assertIn('Felsefe (Seçmeli)', soz_names)

    def test_live_short_codes(self):
        sys_names = [r['section_name'] for r in _areas_for_student(AYT_SECTIONS, 'YKS_AYT', 'sys')]
        soz_names = [r['section_name'] for r in _areas_for_student(TYT_SECTIONS, 'YKS_TYT', 'soz')]
        self.assertEqual(set(sys_names), {'Matematik', 'Geometri', 'Fizik', 'Kimya', 'Biyoloji'})
        self.assertIn('Felsefe (Seçmeli)', soz_names)

    def test_pick_does_not_repeat_strong_in_weak(self):
        strong, weak = _pick_strong_weak_areas(AYT_SECTIONS, 'YKS_AYT', 'SAYISAL')
        strong_names = {r['section_name'] for r in strong}
        weak_names = {r['section_name'] for r in weak}
        self.assertTrue(strong_names.isdisjoint(weak_names))
        self.assertEqual(strong[0]['section_name'], 'Matematik')
        self.assertIn(weak[0]['section_name'], {'Biyoloji', 'Kimya', 'Geometri'})
