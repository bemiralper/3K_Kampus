"""Kayıtlı puan: ekran okur, puanı değiştiren kayıt yeniler, kazanım yenilemez."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    AnswerKey, AnswerKeyItem, Exam, ExamSection, ExamSession,
    StudentAnswer, StudentSectionScore, StudentStoredScore,
)
from apps.coaching.olcme_degerlendirme.services.scoring import calculate_tyt_score
from apps.coaching.olcme_degerlendirme.services.stored_scores import refresh_exam_scores
from apps.coaching.tests.olcme_helpers import grant_olcme_write
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()

NETS = {
    'Türkçe': 32.50,
    'Sosyal Bilimler': 15.00,
    'Temel Matematik': 38.75,
    'Fen Bilimleri': 10.00,
}


class StoredScoreTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Kayıt Puan', kod='KP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KP-A')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(
            username='kayitpuan', password='test', is_staff=True,
        )
        grant_olcme_write(self.user, self.kurum)
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.exam = Exam.objects.create(
            name='TYT Kayıt',
            exam_type='YKS_TYT',
            status=Exam.Status.RESULTS_UPLOADED,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            puan_yili=2025,
        )
        self.sections = {}
        for i, name in enumerate(NETS, start=1):
            self.sections[name] = ExamSection.objects.create(
                exam=self.exam, name=name, order=i,
                question_start=(i - 1) * 10 + 1, question_end=i * 10,
            )
        self.session = ExamSession.objects.create(
            exam=self.exam, status=ExamSession.Status.COMPLETED, original_filename='t.dat',
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Arda', soyad='Yayla',
        )
        self.answer = StudentAnswer.objects.create(
            session=self.session,
            student=self.ogrenci,
            raw_student_name='Arda Yayla',
            total_net=Decimal('96.25'),
            answers={'1': 'A'},
        )
        for name, net in NETS.items():
            StudentSectionScore.objects.create(
                student_answer=self.answer,
                section=self.sections[name],
                net=Decimal(str(net)),
            )
        self.key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        self.item = AnswerKeyItem.objects.create(
            answer_key=self.key,
            question_number=1,
            correct_answer='A',
            section=self.sections['Türkçe'],
        )

    def test_rankings_read_stored_score(self):
        res = self.client.get(
            f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/analysis/rankings/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        expected = calculate_tyt_score(NETS, year=2025)['puan']
        self.assertAlmostEqual(res.json()['rankings'][0]['puan'], expected, places=2)
        self.assertEqual(res.json()['rankings'][0]['kurum_ici_sira'], 1)
        stored = StudentStoredScore.objects.get(student_answer=self.answer)
        self.assertAlmostEqual(stored.by_year['2025']['puan'], expected, places=2)
        self.assertIn('2026', stored.by_year)
        self.assertIn('2024', stored.by_year)

    def test_outcome_edit_does_not_rewrite_score(self):
        refresh_exam_scores(self.exam)
        before = StudentStoredScore.objects.get(student_answer=self.answer).updated_at
        res = self.client.patch(
            f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/answer-keys/{self.key.id}/update-item/',
            {'item_id': self.item.id, 'outcome_id': None, 'imported_outcome_text': 'yeni metin'},
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        stored = StudentStoredScore.objects.get(student_answer=self.answer)
        self.assertEqual(stored.updated_at, before)
        self.item.refresh_from_db()
        self.assertEqual(self.item.imported_outcome_text, 'yeni metin')

    def test_correct_answer_change_rewrites_score(self):
        refresh_exam_scores(self.exam)
        before = StudentStoredScore.objects.get(student_answer=self.answer).by_year['2025']['puan']
        res = self.client.patch(
            f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/answer-keys/{self.key.id}/update-item/',
            {'item_id': self.item.id, 'correct_answer': 'B', 'is_cancelled': False},
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        stored = StudentStoredScore.objects.get(student_answer=self.answer)
        self.assertNotAlmostEqual(stored.by_year['2025']['puan'], before, places=2)

    def test_second_student_gets_rank(self):
        other = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Osman', soyad='Çolak',
        )
        low = StudentAnswer.objects.create(
            session=self.session, student=other, raw_student_name='Osman Çolak',
            total_net=Decimal('10'),
        )
        for name in NETS:
            StudentSectionScore.objects.create(
                student_answer=low, section=self.sections[name], net=Decimal('1'),
            )
        refresh_exam_scores(self.exam)
        high = StudentStoredScore.objects.get(student_answer=self.answer).by_year['2025']
        low_row = StudentStoredScore.objects.get(student_answer=low).by_year['2025']
        self.assertEqual(high['kurum_ici_sira'], 1)
        self.assertEqual(low_row['kurum_ici_sira'], 2)
        self.assertEqual(high['toplam_ogrenci'], 2)

        coach = self.client.get(
            f'/api/coaching/olcme-degerlendirme/student-exams/{other.id}/?ranking_year=2025',
            **self.headers,
        )
        self.assertEqual(coach.status_code, 200, coach.content[:400])
        row = coach.json()['exams'][0]
        self.assertEqual(row['kurum_ici_sira'], 2)
        self.assertEqual(row['toplam_ogrenci'], 2)
        self.assertAlmostEqual(row['puan'], low_row['puan'], places=2)
