"""
Analiz endpoint'leri — sınıfı atanmamış OgrenciKayit 500 üretmemeli.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    Exam, ExamSection, ExamSession, StudentAnswer, StudentSectionScore,
)
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
        self.assertFalse(row['has_class'])

    def test_students_ok_without_sinif(self):
        res = self.client.get(f'{self.base}/students/', **self.headers)
        self.assertEqual(res.status_code, 200)
        row = res.json()['students'][0]
        self.assertEqual(row['sinif'], '')
        self.assertFalse(row['has_class'])

    def test_student_detail_ok_without_sinif(self):
        res = self.client.get(
            f'{self.base}/students/{self.answer.id}/detail/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['sinif'], '')
        self.assertFalse(data['has_class'])
        self.assertEqual(data['sinif_meta_label'], 'Program')
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

    def _attach_library(self):
        from apps.egitim_paketleri.models import EkHizmet
        from apps.ogrenci.domain.models import OgrenciEkHizmet

        hizmet = EkHizmet.objects.create(
            ad='Kütüphane', kod='KUT_TEST', hizmet_turu='kutuphane',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
            brut_fiyat=0, aktif_mi=True,
        )
        OgrenciEkHizmet.objects.create(
            ogrenci=self.ogrenci, ek_hizmet=hizmet, egitim_yili=self.egitim_yili,
            aktif_mi=True,
        )
        return hizmet

    def test_library_label_when_no_class(self):
        self._attach_library()
        data = self.client.get(
            f'{self.base}/students/{self.answer.id}/detail/',
            **self.headers,
        ).json()
        self.assertFalse(data['has_class'])
        self.assertTrue(data['has_kutuphane'])
        self.assertFalse(data['has_deneme'])
        self.assertEqual(data['sinif'], 'Kütüphane')
        self.assertEqual(data['sinif_meta_label'], 'Program')

    def test_deneme_kayit_turu_when_no_class_and_no_library(self):
        self.ogrenci.kayit_turu = 'deneme_kulubu'
        self.ogrenci.save(update_fields=['kayit_turu'])
        data = self.client.get(
            f'{self.base}/students/{self.answer.id}/detail/',
            **self.headers,
        ).json()
        self.assertFalse(data['has_class'])
        self.assertFalse(data['has_kutuphane'])
        self.assertTrue(data['has_deneme'])
        self.assertEqual(data['sinif'], 'Deneme Kulübü')

        students = self.client.get(f'{self.base}/students/', **self.headers).json()['students'][0]
        self.assertEqual(students['sinif'], 'Deneme Kulübü')
        rankings = self.client.get(f'{self.base}/rankings/', **self.headers).json()['rankings'][0]
        self.assertEqual(rankings['sinif'], 'Deneme Kulübü')

    def test_library_wins_over_deneme_kayit_turu(self):
        self._attach_library()
        self.ogrenci.kayit_turu = 'deneme_kulubu'
        self.ogrenci.save(update_fields=['kayit_turu'])
        data = self.client.get(
            f'{self.base}/students/{self.answer.id}/detail/',
            **self.headers,
        ).json()
        self.assertTrue(data['has_kutuphane'])
        self.assertTrue(data['has_deneme'])
        self.assertEqual(data['sinif'], 'Kütüphane')

    def test_deneme_ek_hizmet_does_not_fill_classless_label(self):
        from apps.egitim_paketleri.models import EkHizmet
        from apps.ogrenci.domain.models import OgrenciEkHizmet

        hizmet = EkHizmet.objects.create(
            ad='Deneme', kod='DNM_TEST', hizmet_turu='deneme',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
            brut_fiyat=0, aktif_mi=True,
        )
        OgrenciEkHizmet.objects.create(
            ogrenci=self.ogrenci, ek_hizmet=hizmet, egitim_yili=self.egitim_yili,
            aktif_mi=True,
        )
        data = self.client.get(
            f'{self.base}/students/{self.answer.id}/detail/',
            **self.headers,
        ).json()
        self.assertFalse(data['has_kutuphane'])
        self.assertFalse(data['has_deneme'])
        self.assertEqual(data['sinif'], '')

    def test_class_name_wins_over_library_or_deneme(self):
        from apps.egitim_tanimlari.models import SinifSeviyesi
        from apps.sinif.domain.models import Sinif

        seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='12. Sınıf', kod='12',
        )
        sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
            ad='12-A', kod='12A', sinif_seviyesi=seviye,
        )
        OgrenciKayit.objects.filter(ogrenci=self.ogrenci, egitim_yili=self.egitim_yili).update(sinif=sinif)
        self._attach_library()
        self.ogrenci.kayit_turu = 'deneme_kulubu'
        self.ogrenci.save(update_fields=['kayit_turu'])
        data = self.client.get(
            f'{self.base}/students/{self.answer.id}/detail/',
            **self.headers,
        ).json()
        self.assertTrue(data['has_class'])
        self.assertEqual(data['sinif'], '12-A')
        self.assertEqual(data['sinif_meta_label'], 'Sınıf')
