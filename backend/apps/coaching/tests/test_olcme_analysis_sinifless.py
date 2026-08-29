"""
Analiz endpoint'leri — sınıfı atanmamış OgrenciKayit 500 üretmemeli.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    AnswerKey, AnswerKeyItem, Exam, ExamSection, ExamSession,
    Outcome, StudentAnswer, StudentSectionScore, Subject, Topic,
)
from apps.coaching.olcme_degerlendirme.views.analysis_views import _build_topic_blocks
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.sube.domain.models import Sube

User = get_user_model()


class OlcmeAnalysisSiniflessKayitTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Analiz Sinifsiz Kurum', kod='ASNZ')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ASNZ-A')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='olcmesinifless', password='test')
        self.client.force_authenticate(user=self.user)

        self.exam = Exam.objects.create(
            name='Sınıfsız Kayıt Analiz Testi',
            exam_type='DENEME',
            status=Exam.Status.RESULTS_UPLOADED,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
        )
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Türkçe', order=1, question_start=1, question_end=40,
        )
        self.session = ExamSession.objects.create(
            exam=self.exam, status=ExamSession.Status.COMPLETED, original_filename='test.dat',
        )

        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Sınıfsız', soyad='Öğrenci',
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            sinif=None,
            aktif_mi=True,
        )
        answer = StudentAnswer.objects.create(
            session=self.session,
            student=self.ogrenci,
            raw_student_id='1001',
            raw_student_name='Sınıfsız Öğrenci',
            total_correct=20,
            total_wrong=8,
            total_empty=12,
            total_net=Decimal('18.00'),
        )
        StudentSectionScore.objects.create(
            student_answer=answer, section=self.section,
            correct=20, wrong=8, empty=12, net=Decimal('18.00'),
        )
        self.answer = answer
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.base = f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/analysis'

    def test_rankings_ok_without_sinif(self):
        res = self.client.get(f'{self.base}/rankings/', **self.headers)
        self.assertEqual(res.status_code, 200)
        row = res.json()['rankings'][0]
        self.assertEqual(row['sinif'], '')

    def test_students_ok_without_sinif(self):
        res = self.client.get(f'{self.base}/students/', **self.headers)
        self.assertEqual(res.status_code, 200)
        row = res.json()['students'][0]
        self.assertEqual(row['sinif'], '')

    def test_student_detail_ok_without_sinif(self):
        res = self.client.get(
            f'{self.base}/students/{self.answer.id}/detail/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['sinif'], '')
        self.assertIn('exam_name', data)
        self.assertIn('answer_grids', data)
        self.assertIn('topic_blocks', data)
        self.assertIn('profil_foto', data)
        self.assertIsNone(data['profil_foto'])

    def test_classes_groups_sinifsiz(self):
        res = self.client.get(f'{self.base}/classes/', **self.headers)
        self.assertEqual(res.status_code, 200)
        names = {c['sinif_name'] for c in res.json()['classes']}
        self.assertIn('Sınıfsız', names)


class TopicBlocksKazanımLabelTest(TestCase):
    """Karne satırı ünite değil, yayınevi gibi kazanım metnini kullanır."""

    def test_row_uses_outcome_text(self):
        exam = Exam.objects.create(name='DK TYT 2', exam_type='YKS_TYT')
        section = ExamSection.objects.create(
            exam=exam, name='Türkçe', order=0, question_start=1, question_end=2,
        )
        subject = Subject.objects.create(code='TURKCE', name='Türkçe')
        topic = Topic.objects.create(
            subject=subject, code='21.1', name='SHG21 · SÖZCÜKTE VE SÖZ ÖBEKLERİNDE ANLAM',
        )
        o1 = Outcome.objects.create(topic=topic, code='21.1.1', text='Sözcükte Anlam')
        o2 = Outcome.objects.create(topic=topic, code='21.1.2', text='Metne Sözcük Yerleştirme')
        ak = AnswerKey.objects.create(exam=exam, booklet='', is_primary=True)
        AnswerKeyItem.objects.create(
            answer_key=ak, section=section, question_number=1,
            correct_answer='A', outcome=o1,
        )
        AnswerKeyItem.objects.create(
            answer_key=ak, section=section, question_number=2,
            correct_answer='B', outcome=o2,
        )
        comparison = {
            '1': {'result': 'wrong'},
            '2': {'result': 'correct'},
        }
        blocks = _build_topic_blocks(exam, comparison, '')
        self.assertEqual(len(blocks), 1)
        rows = {r['name']: r for r in blocks[0]['tables'][0]['rows']}
        self.assertIn('Sözcükte Anlam', rows)
        self.assertIn('Metne Sözcük Yerleştirme', rows)
        self.assertNotIn(topic.name, rows)
        self.assertEqual(rows['Sözcükte Anlam']['soru'], 1)
        self.assertEqual(rows['Sözcükte Anlam']['yanlis'], 1)
        self.assertEqual(rows['Sözcükte Anlam']['basari'], 0)
        self.assertEqual(rows['Metne Sözcük Yerleştirme']['dogru'], 1)
        self.assertEqual(rows['Metne Sözcük Yerleştirme']['basari'], 100)

    def test_booklet_b_uses_primary_outcomes(self):
        exam = Exam.objects.create(name='DK TYT B', exam_type='YKS_TYT')
        section = ExamSection.objects.create(
            exam=exam, name='Türkçe', order=0, question_start=1, question_end=2,
        )
        subject = Subject.objects.create(code='TURKCE_B', name='Türkçe')
        topic = Topic.objects.create(subject=subject, code='21.1b', name='Ünite')
        o1 = Outcome.objects.create(topic=topic, code='21.1.1b', text='Sözcükte Anlam')
        ak_a = AnswerKey.objects.create(exam=exam, booklet='A', is_primary=True)
        AnswerKeyItem.objects.create(
            answer_key=ak_a, section=section, question_number=1,
            correct_answer='A', outcome=o1, b_question_number=2,
        )
        ak_b = AnswerKey.objects.create(exam=exam, booklet='B', is_primary=False)
        AnswerKeyItem.objects.create(
            answer_key=ak_b, section=section, question_number=1,
            correct_answer='C',
        )
        AnswerKeyItem.objects.create(
            answer_key=ak_b, section=section, question_number=2,
            correct_answer='A',
        )
        comparison = {
            '1': {'result': 'empty'},
            '2': {'result': 'correct'},
        }
        blocks = _build_topic_blocks(exam, comparison, 'B')
        self.assertEqual(len(blocks), 1)
        row = blocks[0]['tables'][0]['rows'][0]
        self.assertEqual(row['name'], 'Sözcükte Anlam')
        self.assertEqual(row['dogru'], 1)
        self.assertEqual(row['basari'], 100)
