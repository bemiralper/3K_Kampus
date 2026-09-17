"""Öğrenci gelişim analizi: kayıtlı net, eşikler, tür karışmaması."""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    Exam,
    ExamSection,
    ExamSession,
    StudentAnswer,
    StudentSectionScore,
)
from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKey, AnswerKeyItem
from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, Topic
from apps.coaching.olcme_degerlendirme.services.development_analysis import (
    build_development_analysis,
    ols_slope,
    period_change,
    sample_stdev,
)
from apps.coaching.olcme_degerlendirme.views.analysis_views import _build_topic_blocks
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()


class DevelopmentMathTest(TestCase):
    def test_period_split_and_ols(self):
        self.assertIsNone(period_change([10, 20]))
        self.assertAlmostEqual(period_change([10, 20, 30]), 15.0)
        self.assertAlmostEqual(period_change([10, 20, 30, 40]), 20.0)
        self.assertAlmostEqual(period_change([10, 20, 30, 40, 50]), 25.0)
        self.assertAlmostEqual(ols_slope([40, 45, 52, 60, 70]), 7.5)
        self.assertGreater(sample_stdev([40, 80, 30, 85, 35]), 15)


class DevelopmentAnalysisScenariosTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Gelisim Kurum', kod='GEL')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='GEL-A')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ada', soyad='Yılmaz',
        )
        self.subject = Subject.objects.create(code='DEV-MAT', name='Matematik')
        self.topic = Topic.objects.create(subject=self.subject, name='Fonksiyonlar', order=1)
        self.outcome_main = Outcome.objects.create(
            topic=self.topic, code='9.1.1', text='Fonksiyon grafiği okur',
        )
        self.outcome_new = Outcome.objects.create(
            topic=self.topic, code='9.1.2', text='Denklem kurar',
        )
        self.outcome_single = Outcome.objects.create(
            topic=self.topic, code='9.1.3', text='Tek soruluk kazanım',
        )
        self._seq = 0

    def _exam(self, name, exam_date, exam_type='YKS_TYT', q=40, net='20.00',
              correct=20, wrong=8, empty=12, comparison=None, items=None):
        self._seq += 1
        exam = Exam.objects.create(
            name=name,
            exam_type=exam_type,
            exam_date=exam_date,
            kurum=self.kurum,
            sube=self.sube,
        )
        section = ExamSection.objects.create(
            exam=exam, name='Türkçe', order=1,
            question_start=1, question_end=q, subject=self.subject,
        )
        session = ExamSession.objects.create(
            exam=exam, status=ExamSession.Status.COMPLETED, original_filename=f'{name}.dat',
        )
        answer = StudentAnswer.objects.create(
            session=session,
            student=self.ogrenci,
            raw_student_id=str(1000 + self._seq),
            raw_student_name='Ada Yılmaz',
            comparison=comparison or {},
            total_correct=correct,
            total_wrong=wrong,
            total_empty=empty,
            total_net=Decimal(net),
        )
        StudentSectionScore.objects.create(
            student_answer=answer, section=section,
            correct=correct, wrong=wrong, empty=empty, net=Decimal(net),
        )
        if items:
            ak = AnswerKey.objects.create(exam=exam, booklet='', is_primary=True)
            for qn, outcome, result in items:
                AnswerKeyItem.objects.create(
                    answer_key=ak, section=section, question_number=qn,
                    correct_answer='A', outcome=outcome,
                    imported_outcome_text=outcome.text,
                )
                answer.comparison[str(qn)] = {'result': result}
            answer.save(update_fields=['comparison'])
        return exam, answer, section

    def test_one_exam_is_insufficient_and_uses_stored_net(self):
        self._exam('TYT 1', date(2026, 1, 1), net='17.25')
        payload = build_development_analysis(self.ogrenci, exam_type='TYT', window='all')
        self.assertEqual(payload['exam_count'], 1)
        subject = payload['subjects'][0]
        self.assertEqual(subject['development_status'], 'insufficient_data')
        self.assertEqual(subject['series'][0]['net'], 17.25)
        self.assertEqual(subject['narrative'], 'Yeterli veri yok.')
        self.assertEqual(subject['first_net'], 17.25)
        self.assertIsNone(subject['net_change'])

    def test_two_exams_improving_without_strong_trend(self):
        self._exam('TYT 1', date(2026, 1, 1), net='20.00')
        self._exam('TYT 2', date(2026, 2, 1), net='23.00')
        payload = build_development_analysis(self.ogrenci, exam_type='TYT', window='all')
        subject = payload['subjects'][0]
        self.assertEqual(subject['development_status'], 'improving')
        self.assertEqual(subject['first_net'], 20.0)
        self.assertEqual(subject['last_net'], 23.0)
        self.assertNotEqual(subject['development_status'], 'strongly_improving')
        self.assertNotIn('güçlü', subject['narrative'])

    def test_two_exams_declining(self):
        self._exam('TYT 1', date(2026, 1, 1), net='24.00')
        self._exam('TYT 2', date(2026, 2, 1), net='18.00')
        payload = build_development_analysis(self.ogrenci, exam_type='TYT', window='all')
        self.assertEqual(payload['subjects'][0]['development_status'], 'declining')

    def test_five_exams_strongly_improving(self):
        for i, net in enumerate(['16.00', '18.00', '20.80', '24.00', '28.00']):
            self._exam(f'TYT {i + 1}', date(2026, 1, 1) + timedelta(days=i * 7), net=net)
        payload = build_development_analysis(self.ogrenci, exam_type='TYT', window='all')
        subject = payload['subjects'][0]
        self.assertEqual(subject['exam_count'], 5)
        self.assertEqual(subject['development_status'], 'strongly_improving')
        self.assertFalse(subject['is_volatile'])
        self.assertEqual([p['net'] for p in subject['series']], [16.0, 18.0, 20.8, 24.0, 28.0])

    def test_five_exams_strongly_declining(self):
        for i, net in enumerate(['28.00', '24.00', '20.80', '18.00', '16.00']):
            self._exam(f'TYT {i + 1}', date(2026, 1, 1) + timedelta(days=i * 7), net=net)
        payload = build_development_analysis(self.ogrenci, exam_type='TYT', window='all')
        self.assertEqual(payload['subjects'][0]['development_status'], 'strongly_declining')

    def test_five_exams_stable(self):
        for i, net in enumerate(['20.00', '20.40', '20.00', '20.80', '20.40']):
            self._exam(f'TYT {i + 1}', date(2026, 1, 1) + timedelta(days=i * 7), net=net)
        payload = build_development_analysis(self.ogrenci, exam_type='TYT', window='all')
        self.assertEqual(payload['subjects'][0]['development_status'], 'stable')

    def test_volatile_flag_does_not_alone_change_status(self):
        for i, net in enumerate(['16.00', '32.00', '12.00', '34.00', '14.00']):
            self._exam(f'TYT {i + 1}', date(2026, 1, 1) + timedelta(days=i * 7), net=net)
        payload = build_development_analysis(self.ogrenci, exam_type='TYT', window='all')
        subject = payload['subjects'][0]
        self.assertTrue(subject['is_volatile'])
        self.assertNotIn(subject['development_status'], (
            'strongly_improving', 'strongly_declining',
        ))

    def test_does_not_recompute_net(self):
        self._exam('TYT 1', date(2026, 1, 1), net='11.11', correct=30, wrong=1, empty=9)
        self._exam('TYT 2', date(2026, 2, 1), net='22.22', correct=5, wrong=20, empty=15)
        payload = build_development_analysis(self.ogrenci, exam_type='TYT', window='all')
        nets = [p['net'] for p in payload['subjects'][0]['series']]
        self.assertEqual(nets, [11.11, 22.22])
        self.assertNotEqual(nets[0], 30 - 1 / 4)

    def test_window_takes_last_exams(self):
        for i in range(6):
            self._exam(f'TYT {i + 1}', date(2026, 1, 1) + timedelta(days=i * 7), net='20.00')
        payload = build_development_analysis(self.ogrenci, exam_type='TYT', window='3')
        self.assertEqual(payload['exam_count'], 3)
        self.assertEqual([e['name'] for e in payload['exams']], ['TYT 4', 'TYT 5', 'TYT 6'])

    def test_types_do_not_mix(self):
        self._exam('TYT 1', date(2026, 1, 1), exam_type='YKS_TYT', net='20.00')
        self._exam('AYT 1', date(2026, 2, 1), exam_type='YKS_AYT', net='12.00')
        self._exam('LGS 1', date(2026, 3, 1), exam_type='LGS', net='18.00')
        self._exam('Deneme 1', date(2026, 4, 1), exam_type='DENEME', net='15.00')
        tyt = build_development_analysis(self.ogrenci, exam_type='TYT', window='all')
        ayt = build_development_analysis(self.ogrenci, exam_type='AYT', window='all')
        lgs = build_development_analysis(self.ogrenci, exam_type='LGS', window='all')
        manuel = build_development_analysis(self.ogrenci, exam_type='manuel', window='all')
        self.assertEqual([e['exam_type'] for e in tyt['exams']], ['YKS_TYT'])
        self.assertEqual([e['exam_type'] for e in ayt['exams']], ['YKS_AYT'])
        self.assertEqual([e['exam_type'] for e in lgs['exams']], ['LGS'])
        self.assertEqual([e['exam_type'] for e in manuel['exams']], ['DENEME'])

    def test_outcome_data_threshold_and_new_measurement(self):
        items_base = [(i, self.outcome_main, 'correct' if i <= 8 else 'wrong') for i in range(1, 16)]
        items_base.append((16, self.outcome_single, 'wrong'))
        for i, net in enumerate(['16.00', '18.00', '20.80', '24.00']):
            self._exam(
                f'TYT {i + 1}', date(2026, 1, 1) + timedelta(days=i * 7),
                net=net, q=40, items=items_base,
            )
        last_items = list(items_base)
        last_items.append((17, self.outcome_new, 'correct'))
        self._exam('TYT 5', date(2026, 2, 5), net='28.00', q=40, items=last_items)

        payload = build_development_analysis(self.ogrenci, exam_type='TYT', window='all')
        subject = payload['subjects'][0]
        by_name = {o['name']: o for o in subject['outcomes']}
        main = by_name['Fonksiyon grafiği okur']
        single = by_name['Tek soruluk kazanım']
        new = by_name['Denklem kurar']

        self.assertEqual(main['question_count'], 75)
        self.assertEqual(main['data_confidence'], 'high')
        self.assertEqual(single['question_count'], 5)
        self.assertEqual(single['data_confidence'], 'medium')
        self.assertEqual(new['question_count'], 1)
        self.assertEqual(new['data_confidence'], 'insufficient')
        self.assertEqual(new['development_status'], 'insufficient_data')
        self.assertEqual(new['narrative'], 'Yeterli veri yok.')
        self.assertEqual(new['period_status'], 'yeni_olculdu')
        self.assertIsNone(new['priority_score'])
        self.assertTrue(any(p['outcome'] == main['name'] for p in payload['priorities']))
        self.assertFalse(any(p['outcome'] == new['name'] for p in payload['priorities']))

        last_answer = StudentAnswer.objects.filter(student=self.ogrenci).order_by('-id').first()
        blocks = _build_topic_blocks(last_answer.session.exam, last_answer.comparison, last_answer.booklet)
        rows = {row['name']: row for block in blocks for table in block['tables'] for row in table['rows']}
        last_main = next(p for p in main['series'] if p['exam_id'] == last_answer.session.exam_id)
        self.assertEqual(last_main['question_count'], rows['Fonksiyon grafiği okur']['soru'])
        self.assertEqual(last_main['correct'], rows['Fonksiyon grafiği okur']['dogru'])
        self.assertEqual(last_main['wrong'], rows['Fonksiyon grafiği okur']['yanlis'])
        self.assertEqual(last_main['empty'], rows['Fonksiyon grafiği okur']['bos'])


    def test_ayt_hides_out_of_field_subjects(self):
        from apps.egitim_tanimlari.models import Alan
        from apps.egitim_yili.domain.models import EgitimYili
        from apps.ogrenci.domain.models import OgrenciKayit

        year = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        alan = Alan.objects.create(kurum=self.kurum, sube=self.sube, kod='sys', ad='Sayısal')
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci, egitim_yili=year, kurum=self.kurum, sube=self.sube,
            alan=alan, aktif_mi=True,
        )
        exam = Exam.objects.create(
            name='AYT 1', exam_type='YKS_AYT', exam_date=date(2026, 3, 1),
            kurum=self.kurum, sube=self.sube, egitim_yili=year,
        )
        mat = ExamSection.objects.create(exam=exam, name='Matematik', order=1, question_start=1, question_end=40)
        tde = ExamSection.objects.create(exam=exam, name='Türk Dili ve Edebiyatı', order=2, question_start=41, question_end=64)
        session = ExamSession.objects.create(exam=exam, status=ExamSession.Status.COMPLETED, original_filename='ayt.dat')
        answer = StudentAnswer.objects.create(session=session, student=self.ogrenci, comparison={}, total_net=Decimal('19.00'))
        StudentSectionScore.objects.create(student_answer=answer, section=mat, correct=20, wrong=4, empty=16, net=Decimal('19.00'))
        StudentSectionScore.objects.create(student_answer=answer, section=tde, correct=0, wrong=0, empty=24, net=Decimal('0.00'))
        payload = build_development_analysis(self.ogrenci, exam_type='AYT', window='all')
        names = [s['name'] for s in payload['subjects']]
        self.assertIn('Matematik', names)
        self.assertNotIn('Türk Dili ve Edebiyatı', names)

    def test_tyt_uses_leaf_subjects_not_parent_headings(self):
        exam = Exam.objects.create(
            name='TYT Fen', exam_type='YKS_TYT', exam_date=date(2026, 5, 1),
            kurum=self.kurum, sube=self.sube,
        )
        fen = ExamSection.objects.create(
            exam=exam, name='Fen Bilimleri', order=1, question_start=1, question_end=20,
        )
        fizik = ExamSection.objects.create(
            exam=exam, name='Fizik', order=2, question_start=1, question_end=7,
            is_sub_section=True, parent_section=fen,
        )
        kimya = ExamSection.objects.create(
            exam=exam, name='Kimya', order=3, question_start=8, question_end=14,
            is_sub_section=True, parent_section=fen,
        )
        session = ExamSession.objects.create(
            exam=exam, status=ExamSession.Status.COMPLETED, original_filename='fen.dat',
        )
        answer = StudentAnswer.objects.create(
            session=session, student=self.ogrenci, comparison={}, total_net=Decimal('8.00'),
        )
        StudentSectionScore.objects.create(
            student_answer=answer, section=fen, correct=10, wrong=4, empty=6, net=Decimal('9.00'),
        )
        StudentSectionScore.objects.create(
            student_answer=answer, section=fizik, correct=2, wrong=3, empty=2, net=Decimal('1.25'),
        )
        StudentSectionScore.objects.create(
            student_answer=answer, section=kimya, correct=6, wrong=1, empty=0, net=Decimal('5.75'),
        )
        payload = build_development_analysis(self.ogrenci, exam_type='TYT', window='all')
        names = [s['name'] for s in payload['subjects']]
        self.assertIn('Fizik', names)
        self.assertIn('Kimya', names)
        self.assertNotIn('Fen Bilimleri', names)


class DevelopmentEndpointAccessTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='API Kurum', kod='APIK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='API-A')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ege', soyad='Demir',
        )
        self.admin = User.objects.create_user(
            username='devadmin', password='test', is_superuser=True,
        )
        self.stranger = User.objects.create_user(username='stranger', password='test')
        self.client = APIClient()
        exam = Exam.objects.create(
            name='TYT API', exam_type='YKS_TYT', exam_date=date(2026, 1, 10),
            kurum=self.kurum, sube=self.sube,
        )
        section = ExamSection.objects.create(
            exam=exam, name='Türkçe', order=1, question_start=1, question_end=40,
        )
        session = ExamSession.objects.create(
            exam=exam, status=ExamSession.Status.COMPLETED, original_filename='api.dat',
        )
        answer = StudentAnswer.objects.create(
            session=session, student=self.ogrenci, comparison={},
            total_net=Decimal('19.00'),
        )
        StudentSectionScore.objects.create(
            student_answer=answer, section=section,
            correct=20, wrong=4, empty=16, net=Decimal('19.00'),
        )
        self.url = f'/api/coaching/olcme-degerlendirme/student-exams/{self.ogrenci.id}/development/'

    def test_admin_can_read_development(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(self.url, {'exam_type': 'TYT', 'window': 'all'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['exam_count'], 1)
        self.assertEqual(res.json()['subjects'][0]['series'][0]['net'], 19.0)

    def test_unrelated_user_is_forbidden(self):
        self.client.force_authenticate(self.stranger)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 403)
