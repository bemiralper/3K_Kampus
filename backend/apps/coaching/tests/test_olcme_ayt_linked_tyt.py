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
