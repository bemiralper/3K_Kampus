"""Resmi Maarif kodu 2018 kazanımına yapışmasın."""
from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, Topic
from apps.coaching.olcme_degerlendirme.services.maarif_numeric import official_stored_codes
from apps.coaching.olcme_degerlendirme.views.curriculum_views import _match_single_text


class OfficialMaarifCodeMatchTests(TestCase):
    def setUp(self):
        self.math = Subject.objects.create(code='MATEMATIK', name='Matematik', order=1)
        old = Topic.objects.create(
            subject=self.math, program='program_2018', code='11.3',
            name='11. sınıf · FONKSİYONLARDA UYGULAMALAR', order=1,
        )
        Outcome.objects.create(
            topic=old, code='11.3.1', text='Fonksiyonlarla İlgili Uygulamalar', order=1,
        )
        Outcome.objects.create(
            topic=old, code='11.1.1', text='Yönlü Açılar', order=2,
        )
        maarif = Topic.objects.create(
            subject=self.math, program='maarif', code='11.23',
            name='Maarif · 11. sınıf · İstatistiksel Araştırma Süreci', order=2,
        )
        Outcome.objects.create(
            topic=maarif, code='11.23.1.1',
            text='İki nicel değişkenli veri ile çalışabilme', order=1,
        )
        self.tarih = Subject.objects.create(code='TARIH', name='Tarih', order=2)
        tarih_topic = Topic.objects.create(
            subject=self.tarih, program='maarif', code='11.23',
            name='Maarif · 11. sınıf · Osmanlı', order=1,
        )
        Outcome.objects.create(
            topic=tarih_topic, code='11.23.1.1',
            text='1908-1918 siyasi gelişmeler', order=1,
        )

    def test_official_code_lists_catalog_then_stored(self):
        self.assertEqual(
            official_stored_codes('MAT.11.3.1'),
            ['MAT.11.3.1', '11.23.1.1'],
        )
        self.assertEqual(
            official_stored_codes('mat.11.3.1 İki nicel değişken'),
            ['MAT.11.3.1', '11.23.1.1'],
        )
        self.assertIsNone(official_stored_codes('11.23.1.1'))
        self.assertIsNone(official_stored_codes('11.3.1'))

    def test_official_code_hits_maarif_not_2018(self):
        match = _match_single_text('MAT.11.3.1', self.math)
        self.assertEqual(match['outcome_code'], '11.23.1.1')
        self.assertIn('nicel', match['outcome_text'])

        prose = _match_single_text('MAT.11.1.1 yönlü açılar', self.math)
        self.assertIsNone(prose)

    def test_plain_codes_stay_on_their_program(self):
        old = _match_single_text('11.3.1', self.math)
        self.assertEqual(old['outcome_code'], '11.3.1')
        maarif = _match_single_text('11.23.1.1', self.math)
        self.assertEqual(maarif['outcome_code'], '11.23.1.1')

    def test_official_code_does_not_cross_subjects(self):
        self.assertIsNone(_match_single_text('MAT.11.3.1', self.tarih))
