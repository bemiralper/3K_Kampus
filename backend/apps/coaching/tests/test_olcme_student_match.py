"""DAT sonuç yüklemede öğrenci eşleştirmesi: PK/sıra no ile rastgele isim bağlanmamalı."""
from django.test import SimpleTestCase

from apps.coaching.olcme_degerlendirme.views.result_views import (
    _match_student,
    _token_name_match,
)


class _Ogr:
    def __init__(self, pk, ad, soyad, tc=''):
        self.pk = pk
        self.ad = ad
        self.soyad = soyad
        self.tc_kimlik_no = tc


class TokenNameMatchTest(SimpleTestCase):
    def test_exact_name(self):
        hit = _token_name_match('ZEYNEP KUZLU', 'Zeynep  Kuzlu')
        self.assertEqual(hit, (1.0, 'name_exact'))

    def test_partial_first_name_same_surname(self):
        hit = _token_name_match('GÖKÇE ÇAKIR', 'Arzuhan Gökçe Çakır')
        self.assertIsNotNone(hit)
        self.assertEqual(hit[1], 'name')

    def test_missing_middle_name(self):
        hit = _token_name_match('RABİA KORUCU', 'Rabia Berranaz Korucu')
        self.assertIsNotNone(hit)

    def test_single_first_name_does_not_match(self):
        self.assertIsNone(_token_name_match('ZEHRA', 'Zehra İkbal Borulu'))

    def test_truncated_first_name_same_surname(self):
        self.assertIsNotNone(_token_name_match('BEJAN KEMALOĞLU', 'Yusuf Bejan Kemaloğlu'))
        self.assertIsNotNone(_token_name_match('MEHMET A LÖK', 'Mehmet Akif Lök'))

    def test_unrelated_names_do_not_match(self):
        self.assertIsNone(_token_name_match('BEJAN KEMALOĞLU', 'Zeynep Ergün'))
        self.assertIsNone(_token_name_match('MEHMET A LÖK', 'Arzuhan Gökçe Çakır'))
        self.assertIsNone(_token_name_match('AHMET KAYA', 'Mehmet Kaya'))


class MatchStudentDoesNotUsePkTest(SimpleTestCase):
    def test_form_number_does_not_bind_django_pk(self):
        zeynep = _Ogr(6, 'Zeynep', 'Ergün')
        by_tc = {}
        by_okul_no = {'00006': zeynep}
        used = set()
        student, score, method = _match_student(
            '', '6', '',
            by_tc, by_okul_no, [zeynep], used,
        )
        self.assertIsNone(student)
        self.assertEqual(method, '')

    def test_exact_okul_no_still_matches(self):
        zeynep = _Ogr(6, 'Zeynep', 'Ergün')
        student, score, method = _match_student(
            '', '00006', '',
            {}, {'00006': zeynep}, [zeynep], set(),
        )
        self.assertEqual(student.pk, 6)
        self.assertEqual(method, 'id')

    def test_name_beats_wrong_form_number(self):
        pk6 = _Ogr(6, 'Zeynep', 'Ergün')
        arda = _Ogr(64, 'Arda', 'Yayla')
        student, score, method = _match_student(
            '', '6', 'ARDA YAYLA',
            {}, {'00006': pk6}, [pk6, arda], set(),
        )
        self.assertEqual(student.pk, 64)
        self.assertEqual(method, 'name_exact')

    def test_ambiguous_shared_first_name_does_not_match(self):
        a = _Ogr(1, 'Mehmet Ali', 'Yılmaz')
        b = _Ogr(2, 'Mehmet Can', 'Yılmaz')
        student, score, method = _match_student(
            '', '', 'MEHMET YILMAZ',
            {}, {}, [a, b], set(),
        )
        self.assertIsNone(student)

    def test_live_partial_names_match_unique_students(self):
        pool = [
            _Ogr(6, 'Zeynep', 'Ergün'),
            _Ogr(10, 'Arzuhan Gökçe', 'Çakır'),
            _Ogr(11, 'Yusuf Bejan', 'Kemaloğlu'),
            _Ogr(12, 'Mehmet Akif', 'Lök'),
            _Ogr(13, 'Rabia Berranaz', 'Korucu'),
        ]
        used = set()
        student, _, method = _match_student(
            '', '3', 'GÖKÇE ÇAKIR', {}, {}, pool, used,
        )
        self.assertEqual(student.pk, 10)
        self.assertEqual(method, 'name')

        student, _, method = _match_student(
            '', '4', 'BEJAN KEMALOĞLU', {}, {}, pool, used,
        )
        self.assertEqual(student.pk, 11)

        student, _, method = _match_student(
            '', '5', 'MEHMET A LÖK', {}, {}, pool, used,
        )
        self.assertEqual(student.pk, 12)

        student, _, method = _match_student(
            '', '6', 'RABİA KORUCU', {}, {}, pool, used,
        )
        self.assertEqual(student.pk, 13)
