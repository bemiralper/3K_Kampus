from django.test import SimpleTestCase

from apps.coaching.olcme_degerlendirme.services.maarif_numeric import (
    numeric_outcome,
    numeric_sub,
    numeric_topic,
)


class MaarifNumericCodeTests(SimpleTestCase):
    def test_kimya_surec_bileseni(self):
        topic = numeric_topic('KİM.10.1')
        outcome = numeric_outcome('KİM.10.1.11', 'KİM.10.1')
        sub = numeric_sub('KİM.10.1.11.a', outcome)
        self.assertEqual(topic, '10.21')
        self.assertEqual(outcome, '10.21.11.1')
        self.assertEqual(sub, '10.21.11.1.1')

    def test_harf_sirasi(self):
        outcome = numeric_outcome('MAT.10.2.2')
        self.assertEqual(numeric_sub('MAT.10.2.2.b', outcome), '10.22.2.1.2')
        self.assertEqual(numeric_sub('MAT.10.2.2.c', outcome), '10.22.2.1.3')
        self.assertEqual(numeric_sub('MAT.10.2.2.ç', outcome), '10.22.2.1.4')
        self.assertEqual(numeric_sub('MAT.10.6.1.e', numeric_outcome('MAT.10.6.1')), '10.26.1.1.6')
        self.assertEqual(numeric_sub('MAT.10.2.2.ğ', outcome), '10.22.2.1.9')

    def test_fen_bolum(self):
        self.assertEqual(numeric_topic('FB.5.1.2'), '5.21.2')
        outcome = numeric_outcome('FB.5.1.2.1')
        self.assertEqual(outcome, '5.21.2.1')
        self.assertEqual(numeric_sub('FB.5.1.2.1.a', outcome), '5.21.2.1.1')

    def test_turkce_alan(self):
        self.assertEqual(numeric_topic('T.D.5'), '5.21')
        self.assertEqual(numeric_outcome('T.O.5.2'), '5.22.2.1')

    def test_tde_sinif_konudan(self):
        self.assertEqual(numeric_topic('TDE.9.1'), '9.21')
        self.assertEqual(numeric_outcome('TDE1.1.2', 'TDE.9.1'), '9.21.2.1')

    def test_tde_tema_cikti(self):
        self.assertEqual(numeric_outcome('TDE.10.2.16', 'TDE.10.2'), '10.22.16.1')
        self.assertEqual(numeric_sub('TDE4.2.3', '10.22.16.1'), '10.22.16.1.3')

    def test_ingilizce_beceri_harfi(self):
        self.assertEqual(numeric_topic('ENG.5.1'), '5.21')
        outcome = numeric_outcome('ENG.5.1.L2', 'ENG.5.1')
        self.assertEqual(outcome, '5.21.12.1')
        self.assertEqual(numeric_outcome('ENG.9.8.W7', 'ENG.9.8'), '9.28.47.1')
        self.assertEqual(numeric_sub('ENG.5.1.L2.c', outcome), '5.21.12.1.3')

    def test_inkilap_sekizinci_sinif(self):
        self.assertEqual(numeric_topic('İTA.8.3'), '8.23')
        self.assertEqual(numeric_outcome('İTA.8.3.2', 'İTA.8.3'), '8.23.2.1')
