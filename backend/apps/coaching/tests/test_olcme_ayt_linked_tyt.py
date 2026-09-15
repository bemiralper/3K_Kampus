"""AYT'ye bağlanan TYT netleri: alt bölüm çift sayımı ve zayıf öğrenci no eşleşmesi."""
from decimal import Decimal

from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models import (
    Exam, ExamSection, ExamSession, StudentAnswer, StudentSectionScore,
)
from apps.coaching.olcme_degerlendirme.services.scoring import (
    _get_linked_tyt_nets,
    calculate_ayt_score,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube


class LinkedTytNetsTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='AYT Link Kurum', kod='ALK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ALK-A')
        self.yil = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.tyt = Exam.objects.create(
            name='TYT Link',
            exam_type='YKS_TYT',
            status=Exam.Status.RESULTS_UPLOADED,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
        )
        self.ayt = Exam.objects.create(
            name='AYT Link',
            exam_type='YKS_AYT',
            status=Exam.Status.RESULTS_UPLOADED,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
            linked_tyt_exam=self.tyt,
        )
        tmat = ExamSection.objects.create(
            exam=self.tyt, name='Temel Matematik', order=1,
            question_start=1, question_end=40,
        )
        mat_sub = ExamSection.objects.create(
            exam=self.tyt, name='Matematik', order=2,
            question_start=1, question_end=30,
            is_sub_section=True, parent_section=tmat,
        )
        session = ExamSession.objects.create(
            exam=self.tyt, status=ExamSession.Status.COMPLETED,
            original_filename='tyt.dat',
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Arda', soyad='Yayla',
        )
        self.tyt_answer = StudentAnswer.objects.create(
            session=session,
            student=self.ogrenci,
            raw_student_id='0',
            raw_student_name='ARDA YAYLA',
            total_net=Decimal('36.25'),
        )
        StudentSectionScore.objects.create(
            student_answer=self.tyt_answer, section=tmat,
            correct=37, wrong=3, empty=0, net=Decimal('36.25'),
        )
        StudentSectionScore.objects.create(
            student_answer=self.tyt_answer, section=mat_sub,
            correct=30, wrong=0, empty=0, net=Decimal('30.00'),
        )
        other = StudentAnswer.objects.create(
            session=session,
            raw_student_id='0',
            raw_student_name='BASKA OGRENCİ',
            total_net=Decimal('5.00'),
        )
        StudentSectionScore.objects.create(
            student_answer=other, section=tmat,
            correct=5, wrong=0, empty=35, net=Decimal('5.00'),
        )

    def test_linked_nets_use_parent_only(self):
        nets = _get_linked_tyt_nets(
            self.ayt, self.ogrenci.id, 'ARDA YAYLA', '0',
        )
        self.assertEqual(nets, {'Temel Matematik': 36.25})
        self.assertNotIn('Matematik', nets)

    def test_generic_raw_id_does_not_steal_another_student(self):
        nets = _get_linked_tyt_nets(self.ayt, None, 'OLMAYAN KISI', '0')
        self.assertEqual(nets, {})

    def test_name_match_still_works_without_student_fk(self):
        nets = _get_linked_tyt_nets(self.ayt, None, 'ARDA YAYLA', '0')
        self.assertEqual(nets['Temel Matematik'], 36.25)

    def test_score_uses_parent_math_net(self):
        nets = _get_linked_tyt_nets(self.ayt, self.ogrenci.id, 'ARDA YAYLA', '0')
        ayt = {'Matematik': 37.50, 'Fizik': 10.25, 'Kimya': 11.75, 'Biyoloji': 11.75}
        tyt = {
            'Türkçe': 36.25,
            'Sosyal Bilimler': 11.25,
            'Fen Bilimleri': 16.25,
            **nets,
        }
        r = calculate_ayt_score(ayt, tyt, puan_turu='SAY', year=2025)
        self.assertAlmostEqual(r['tyt_net'], 100.0, places=2)
        self.assertLess(abs(r['puan'] - 451.413), 1.1)


class LinkedTytKarneDetailTest(LinkedTytNetsTest):
    def setUp(self):
        super().setUp()
        mat = ExamSection.objects.create(
            exam=self.ayt, name='Matematik', order=1,
            question_start=1, question_end=40,
        )
        ayt_session = ExamSession.objects.create(
            exam=self.ayt, status=ExamSession.Status.COMPLETED,
            original_filename='ayt.dat',
        )
        self.ayt_answer = StudentAnswer.objects.create(
            session=ayt_session,
            student=self.ogrenci,
            raw_student_id='0',
            raw_student_name='ARDA YAYLA',
            total_net=Decimal('37.50'),
        )
        StudentSectionScore.objects.create(
            student_answer=self.ayt_answer, section=mat,
            correct=38, wrong=2, empty=0, net=Decimal('37.50'),
        )

    def test_karne_includes_linked_tyt_sections_and_distinct_rankings(self):
        from apps.coaching.olcme_degerlendirme.views.analysis_views import (
            build_student_detail_payload,
        )

        data = build_student_detail_payload(
            self.ayt, self.ayt_answer, 2025, include_trend=False,
        )
        tyt_rows = [sd for sd in data['section_details'] if sd.get('source') == 'tyt']
        tyt_mains = [sd for sd in tyt_rows if not sd['is_sub_section']]
        self.assertTrue(tyt_mains)
        self.assertTrue(any('Temel Matematik' in sd['section_name'] for sd in tyt_mains))
        self.assertEqual(tyt_mains[0]['net'], 36.25)
        self.assertFalse(any(sd['section_name'] == 'Matematik' for sd in tyt_mains))

        pts = data['puan_turleri']
        self.assertIsNotNone(pts['SAY'].get('tahmini_siralama'))
        self.assertIsNotNone(pts['EA'].get('tahmini_siralama'))
        self.assertIsNotNone(pts['SOZ'].get('tahmini_siralama'))
        self.assertNotEqual(pts['SAY']['tahmini_siralama'], pts['EA']['tahmini_siralama'])
        self.assertNotEqual(pts['EA']['tahmini_siralama'], pts['SOZ']['tahmini_siralama'])

        from apps.coaching.application.olcme_karne_pdf import render_karne_pdf
        pdf = render_karne_pdf(data)
        self.assertTrue(pdf.startswith(b'%PDF'))
        self.assertGreater(len(pdf), 500)
