"""Toplu kazanım metninin 2018 ve Maarif kodlarını ayırması."""
from django.test import SimpleTestCase

from apps.coaching.olcme_degerlendirme.views.curriculum_views import _parse_curriculum_text


class BulkTextParseTest(SimpleTestCase):
    def test_2018_dort_parca_alt_kazanimdir(self):
        parsed = _parse_curriculum_text(
            '9.1. MANTIK\n'
            '9.1.1. Mantıksal önermeleri tanır.\n'
            '9.1.1.1 Önermeleri belirler.\n'
        )
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]['code'], '9.1')
        outcome = parsed[0]['outcomes'][0]
        self.assertEqual(outcome['code'], '9.1.1')
        self.assertEqual(outcome['sub_outcomes'][0]['code'], '9.1.1.1')

    def test_maarif_dort_parca_kazanim_bes_parca_aciklamadir(self):
        parsed = _parse_curriculum_text(
            '9.21. Sayılar\n'
            '9.21.1.1 Gerçek sayıların üslü gösterimleriyle muhakeme yapabilme\n'
            '9.21.1.1.5 Üslü gösterimlerin kullanışlılığını değerlendirir.\n'
        )
        self.assertEqual(parsed[0]['code'], '9.21')
        outcome = parsed[0]['outcomes'][0]
        self.assertEqual(outcome['code'], '9.21.1.1')
        self.assertEqual(outcome['text'].startswith('Gerçek'), True)
        self.assertEqual(len(outcome['sub_outcomes']), 1)
        self.assertEqual(outcome['sub_outcomes'][0]['code'], '9.21.1.1.5')
