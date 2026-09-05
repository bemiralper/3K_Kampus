"""DAT öğrenci eşleştirme — skor, normalizasyon ve çakışma."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import Exam, ExamSession, StudentAnswer
from apps.coaching.olcme_degerlendirme.services.student_matching import (
    DatIdentity,
    StudentRec,
    exam_student_pool,
    identity_from_raw,
    normalize_name,
    pick_auto_match,
    rank_candidates,
    score_student,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()


class MatchingScoreTest(TestCase):
    def test_normalize_turkish_and_order(self):
        self.assertEqual(normalize_name('Çağrı Şahin'), normalize_name('Cagri Sahin'))
        self.assertEqual(normalize_name('YAYLA ARDA'), 'yayla arda')
        self.assertEqual(normalize_name('Arda  Yayla'), 'arda yayla')

    def _rec(self, pk, ad, soyad, okul_no='', tc=''):
        return StudentRec(pk=pk, ad=ad, soyad=soyad, okul_no=okul_no, tc=tc)

    def test_number_and_exact_name(self):
        dat = DatIdentity(name='Arda Yayla', ogrenci_no='2')
        hit = score_student(dat, self._rec(10, 'Arda', 'Yayla', okul_no='2'))
        self.assertEqual(hit.score, 1.0)
        self.assertEqual(hit.method, 'id')

        hit = score_student(DatIdentity(name='Arda Yayla'), self._rec(11, 'Arda', 'Yayla'))
        self.assertEqual(hit.score, 1.0)
        self.assertIn('Tam ad', hit.reason)

    def test_reversed_and_ascii_name(self):
        hit = score_student(DatIdentity(name='YAYLA ARDA'), self._rec(1, 'Arda', 'Yayla'))
        self.assertGreaterEqual(hit.score, 0.98)

        hit = score_student(DatIdentity(name='Cagri Sahin'), self._rec(2, 'Çağrı', 'Şahin'))
        self.assertEqual(hit.score, 1.0)

    def test_partial_and_single_first_name(self):
        hit = score_student(DatIdentity(name='Ali Kaya'), self._rec(3, 'Muhammed Ali', 'Kaya'))
        self.assertGreaterEqual(hit.score, 0.90)
        self.assertLess(hit.score, 0.98)

        hit = score_student(DatIdentity(name='Arda'), self._rec(4, 'Arda', 'Yayla'))
        self.assertGreaterEqual(hit.score, 0.70)
        self.assertLess(hit.score, 0.95)

    def test_rank_excludes_taken_and_auto_skips_low(self):
        pool = [
            self._rec(1, 'Arda', 'Yayla', okul_no='2'),
            self._rec(2, 'Arda', 'Yılmaz', okul_no='18'),
            self._rec(3, 'Arda', 'Yaylaoğlu', okul_no='43'),
        ]
        dat = DatIdentity(name='Arda Yayla', ogrenci_no='2')
        ranked = rank_candidates(dat, pool)
        self.assertEqual(ranked[0].student.pk, 1)
        self.assertTrue(all(h.student.pk != 1 for h in rank_candidates(dat, pool, exclude_ids={1})))

        auto = pick_auto_match(DatIdentity(name='Arda'), pool, set())
        self.assertIsNone(auto)

        auto = pick_auto_match(dat, pool, set())
        self.assertIsNotNone(auto)
        self.assertEqual(auto.student.pk, 1)

        # DAT no=2, LMS pk=2 farklı kişiyse numara sanılmamalı
        pk_hit = score_student(dat, self._rec(2, 'Arda', 'Yılmaz', okul_no='18'))
        self.assertNotEqual(pk_hit.method, 'id')

    def test_padded_number_and_name_override(self):
        hit = score_student(
            DatIdentity(name='Ömer Çatalyürek', ogrenci_no='14'),
            self._rec(14, 'Ömer', 'Çatalyürek', okul_no='00014'),
        )
        self.assertEqual(hit.method, 'id')

        # DAT no=2 başka birinin 00002'sine denk gelse bile isim uymuyorsa bağlama
        hit = score_student(
            DatIdentity(name='Arda Yayla', ogrenci_no='2'),
            self._rec(99, 'Ömer Faruk', 'İncesu', okul_no='00002'),
        )
        self.assertTrue(hit is None or hit.method != 'id')


class MatchingApiCollisionTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Eşleş Kurum', kod='ESLS')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ESLS-A')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='matchuser', password='test')
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)
        self.exam = Exam.objects.create(
            name='DAT Eşleş',
            exam_type='YKS_TYT',
            status=Exam.Status.RESULTS_UPLOADED,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
        )
        self.session = ExamSession.objects.create(
            exam=self.exam, status=ExamSession.Status.COMPLETED, original_filename='t.dat',
        )
        self.arda = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Arda', soyad='Yayla',
        )
        self.yilmaz = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Arda', soyad='Yılmaz',
        )
        self.sa1 = StudentAnswer.objects.create(
            session=self.session, student=self.arda,
            raw_student_id='2', raw_student_name='Arda Yayla',
            match_score=1, match_method='name_exact',
        )
        self.sa2 = StudentAnswer.objects.create(
            session=self.session, student=None,
            raw_student_id='18', raw_student_name='Arda Y.',
        )
        self.base = f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/results'

    def test_suggestions_hide_already_matched(self):
        res = self.client.get(f'{self.base}/students/{self.sa2.id}/suggestions/')
        self.assertEqual(res.status_code, 200)
        ids = [row['id'] for row in res.json()['suggestions']]
        self.assertNotIn(self.arda.id, ids)
        self.assertIn(self.yilmaz.id, ids)

    def test_search_hides_already_matched(self):
        res = self.client.get(f'{self.base}/students/search/', {'q': 'Arda', 'answer_id': self.sa2.id})
        self.assertEqual(res.status_code, 200)
        ids = [row['id'] for row in res.json()]
        self.assertNotIn(self.arda.id, ids)
        self.assertIn(self.yilmaz.id, ids)

    def test_backend_rejects_second_match(self):
        res = self.client.patch(
            f'{self.base}/students/{self.sa2.id}/match/',
            {'student_id': self.arda.id},
            format='json',
        )
        self.assertEqual(res.status_code, 400)

    def test_unlink_then_rematch_allowed(self):
        self.client.patch(
            f'{self.base}/students/{self.sa1.id}/match/',
            {'student_id': None},
            format='json',
        )
        res = self.client.patch(
            f'{self.base}/students/{self.sa2.id}/match/',
            {'student_id': self.arda.id},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.sa2.refresh_from_db()
        self.assertEqual(self.sa2.student_id, self.arda.id)

    def test_session_results_hide_taken_in_top_suggestion(self):
        res = self.client.get(f'{self.base}/sessions/{self.session.id}/results/')
        self.assertEqual(res.status_code, 200)
        rows = {r['id']: r for r in res.json()['results']}
        unmatched = rows[self.sa2.id]
        self.assertEqual(unmatched['match_status'], 'pending')
        top = unmatched.get('top_suggestion') or {}
        self.assertNotEqual(top.get('id'), self.arda.id)


class MatchingPoolTest(TestCase):
    def test_includes_classless_students_when_exam_has_classes(self):
        kurum = Kurum.objects.create(ad='Havuz Kurum', kod='HVZ')
        sube = Sube.objects.create(kurum=kurum, ad='Merkez', kod='HVZ-A')
        yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        exam = Exam.objects.create(
            name='Havuz', exam_type='YKS_TYT', status=Exam.Status.RESULTS_UPLOADED,
            kurum=kurum, sube=sube, egitim_yili=yil,
        )
        sinif = Sinif.objects.create(
            kurum=kurum, sube=sube, egitim_yili=yil, ad='12-A', kod='12A',
        )
        other = Sinif.objects.create(
            kurum=kurum, sube=sube, egitim_yili=yil, ad='9-B', kod='9B',
        )
        exam.siniflar.add(sinif)

        in_class = Ogrenci.objects.create(kurum=kurum, sube=sube, ad='Ayşe', soyad='Sınıflı')
        classless = Ogrenci.objects.create(kurum=kurum, sube=sube, ad='Arda', soyad='Yayla')
        outsider = Ogrenci.objects.create(kurum=kurum, sube=sube, ad='Ali', soyad='Başka')
        OgrenciKayit.objects.create(
            ogrenci=in_class, egitim_yili=yil, kurum=kurum, sube=sube, sinif=sinif, aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=classless, egitim_yili=yil, kurum=kurum, sube=sube, sinif=None, aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=outsider, egitim_yili=yil, kurum=kurum, sube=sube, sinif=other, aktif_mi=True,
        )

        ids = {rec.pk for rec in exam_student_pool(exam)}
        self.assertIn(in_class.pk, ids)
        self.assertIn(classless.pk, ids)
        self.assertNotIn(outsider.pk, ids)
