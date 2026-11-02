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

    def test_unmatched_student_listed_with_system_name_case(self):
        unmatched = StudentAnswer.objects.create(
            session=self.session,
            student=None,
            raw_student_id='OPT-9',
            raw_student_name='İSMAİL IŞIK',
            total_correct=10,
            total_wrong=4,
            total_empty=26,
            total_net=Decimal('9.00'),
        )
        StudentSectionScore.objects.create(
            student_answer=unmatched, section=self.section,
            correct=10, wrong=4, empty=26, net=Decimal('9.00'),
        )

        res = self.client.get(f'{self.base}/students/', **self.headers)
        self.assertEqual(res.status_code, 200)
        rows = {row['answer_id']: row for row in res.json()['students']}
        self.assertIn(unmatched.id, rows)
        self.assertIsNone(rows[unmatched.id]['student_id'])
        self.assertEqual(rows[unmatched.id]['student_name'], 'İsmail Işık')
        self.assertEqual(rows[self.answer.id]['student_name'], 'Sınıfsız Öğrenci')
        self.assertEqual(res.json()['total_students'], 2)
        self.assertEqual(
            {rows[self.answer.id]['kurum_ici_sira'], rows[unmatched.id]['kurum_ici_sira']},
            {1, 2},
        )

        detail = self.client.get(
            f'{self.base}/students/{unmatched.id}/detail/',
            **self.headers,
        )
        self.assertEqual(detail.status_code, 200)
        body = detail.json()
        self.assertEqual(body['student_name'], 'İsmail Işık')
        self.assertIsNone(body['student_id'])
        self.assertEqual(body['kurum_ici_sira'], 2)
        self.assertEqual(body['toplam_ogrenci'], 2)

        matched = self.client.get(
            f'{self.base}/students/{self.answer.id}/detail/',
            **self.headers,
        ).json()
        self.assertEqual(matched['student_name'], 'Sınıfsız Öğrenci')
        self.assertEqual(matched['kurum_ici_sira'], 1)
        self.assertEqual(matched['toplam_ogrenci'], 2)


class OlcmeKarneRankMatchesListTest(TestCase):
    """Karne sırası, listedeki gibi puana göre ve eşleşmemiş satırlar dahil kurulur."""

    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Sıra Kurum', kod='SIRA')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SIRA-A')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='olcmesira', password='test')
        self.client.force_authenticate(user=self.user)
        self.exam = Exam.objects.create(
            name='Etap Süreç Takip',
            exam_type='LGS',
            status=Exam.Status.RESULTS_UPLOADED,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            puan_yili=2026,
        )
        self.turkce = ExamSection.objects.create(
            exam=self.exam, name='Türkçe', order=1, question_start=1, question_end=20,
        )
        self.inkilap = ExamSection.objects.create(
            exam=self.exam, name='İnkılap Tarihi', order=2, question_start=21, question_end=30,
        )
        self.session = ExamSession.objects.create(
            exam=self.exam, status=ExamSession.Status.COMPLETED, original_filename='lgs.dat',
        )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.base = f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/analysis'

        # Türkçe katsayısı yüksek: neti düşük olanın puanı daha yüksek olabilir.
        self.high_score = self._add('Elif', 'Naz', '10.00', 10, 0, student=True)
        self.high_net = self._add('Furkan', 'Aktoprak', '20.00', 0, 20, student=True)
        self.unmatched = self._add('Duygu', 'Torun', '40.00', 20, 20, student=False)

    def _add(self, ad, soyad, total_net, turkce, inkilap, *, student):
        ogrenci = None
        if student:
            ogrenci = Ogrenci.objects.create(
                kurum=self.kurum, sube=self.sube, ad=ad, soyad=soyad,
            )
            OgrenciKayit.objects.create(
                ogrenci=ogrenci, egitim_yili=self.egitim_yili,
                kurum=self.kurum, sube=self.sube, aktif_mi=True,
            )
        answer = StudentAnswer.objects.create(
            session=self.session,
            student=ogrenci,
            raw_student_id=f'{ad}-{soyad}',
            raw_student_name=f'{ad} {soyad}',
            total_net=Decimal(total_net),
        )
        StudentSectionScore.objects.create(
            student_answer=answer, section=self.turkce, net=Decimal(turkce),
        )
        StudentSectionScore.objects.create(
            student_answer=answer, section=self.inkilap, net=Decimal(inkilap),
        )
        return answer

    def test_karne_rank_follows_score_and_includes_unmatched(self):
        listed = self.client.get(f'{self.base}/students/?ranking_year=2026', **self.headers)
        self.assertEqual(listed.status_code, 200)
        rows = {row['answer_id']: row for row in listed.json()['students']}
        self.assertEqual(len(rows), 3)

        # Net sırası: eşleşmemiş 40, yüksek net 20, yüksek puan 10.
        # Puan sırası Türkçe ağırlığı yüzünden yüksek puanı öne alır.
        self.assertGreater(rows[self.high_score.id]['puan'], rows[self.high_net.id]['puan'])
        self.assertLess(rows[self.high_score.id]['toplam_net'], rows[self.high_net.id]['toplam_net'])

        by_puan = sorted(rows.values(), key=lambda row: row['puan'], reverse=True)
        self.assertEqual(
            [row['answer_id'] for row in by_puan],
            [self.unmatched.id, self.high_score.id, self.high_net.id],
        )

        for answer, expected in (
            (self.unmatched, 1),
            (self.high_score, 2),
            (self.high_net, 3),
        ):
            detail = self.client.get(
                f'{self.base}/students/{answer.id}/detail/?ranking_year=2026',
                **self.headers,
            )
            self.assertEqual(detail.status_code, 200, detail.content[:300])
            body = detail.json()
            self.assertEqual(body['kurum_ici_sira'], expected)
            self.assertEqual(body['toplam_ogrenci'], 3)
            self.assertEqual(body['kurum_ici_sira'], rows[answer.id]['kurum_ici_sira'])
            self.assertEqual(body['toplam_ogrenci'], rows[answer.id]['toplam_ogrenci'])

        # Ortalama eşleşmiş iki öğrencide kalır; eşleşmemiş 40 neti katılmaz.
        matched_only = self.client.get(
            f'{self.base}/students/{self.high_score.id}/detail/?ranking_year=2026',
            **self.headers,
        ).json()
        self.assertEqual(matched_only['kurum_avg_net'], 15.0)
