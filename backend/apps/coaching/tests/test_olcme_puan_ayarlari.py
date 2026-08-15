"""Kurum puan katsayısı ayarları — seed, varsayılan yıl, sınav override, reset."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    Exam, ExamSection, ExamSession, StudentAnswer, StudentSectionScore,
    OlcmeKatsayiSeti,
)
from apps.coaching.olcme_degerlendirme.services.scoring import (
    TYT_KATSAYILAR,
    calculate_tyt_score,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()

ARDA_NETS = {
    'Türkçe': 32.50,
    'Sosyal Bilimler': 15.00,
    'Temel Matematik': 38.75,
    'Fen Bilimleri': 10.00,
}

AYAR_URL = '/api/coaching/olcme-degerlendirme/puan-ayarlari/'


class OlcmePuanAyarlariTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Puan Ayar Kurum', kod='PAK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PAK-A')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='puanayar', password='test')
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def _create_tyt_exam(self, puan_yili=None):
        exam = Exam.objects.create(
            name='TYT Puan Test',
            exam_type='YKS_TYT',
            status=Exam.Status.RESULTS_UPLOADED,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            puan_yili=puan_yili,
        )
        sections = {}
        for i, name in enumerate(ARDA_NETS, start=1):
            sections[name] = ExamSection.objects.create(
                exam=exam, name=name, order=i, question_start=i * 10, question_end=i * 10 + 9,
            )
        session = ExamSession.objects.create(
            exam=exam, status=ExamSession.Status.COMPLETED, original_filename='arda.dat',
        )
        ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Arda', soyad='Yayla',
        )
        answer = StudentAnswer.objects.create(
            session=session,
            student=ogrenci,
            raw_student_id='1',
            raw_student_name='Arda Yayla',
            total_correct=96,
            total_wrong=4,
            total_empty=0,
            total_net=Decimal('96.25'),
        )
        for name, net in ARDA_NETS.items():
            StudentSectionScore.objects.create(
                student_answer=answer, section=sections[name],
                correct=int(net), wrong=0, empty=0, net=Decimal(str(net)),
            )
        return exam, answer

    def test_first_get_seeds_managed_years(self):
        self.assertEqual(OlcmeKatsayiSeti.objects.filter(kurum=self.kurum).count(), 0)
        res = self.client.get(AYAR_URL, **self.headers)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['default_puan_yili'], 2025)
        self.assertEqual(body['managed_years'], [2024, 2025, 2026])
        self.assertEqual(len(body['years']), 3)
        self.assertEqual(OlcmeKatsayiSeti.objects.filter(kurum=self.kurum).count(), 12)

        by_year = {y['year']: y for y in body['years']}
        self.assertTrue(by_year[2024]['is_published'])
        self.assertTrue(by_year[2025]['is_published'])
        self.assertFalse(by_year[2026]['is_published'])
        self.assertEqual(
            by_year[2026]['sets']['TYT']['coefficients'],
            by_year[2025]['sets']['TYT']['coefficients'],
        )
        self.assertAlmostEqual(
            by_year[2025]['sets']['TYT']['coefficients']['Türkçe'],
            TYT_KATSAYILAR[2025]['Türkçe'],
        )

    def test_default_year_used_when_no_ranking_year(self):
        self.client.get(AYAR_URL, **self.headers)
        patch = self.client.patch(
            AYAR_URL, {'default_puan_yili': 2024}, format='json', **self.headers,
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.json()['default_puan_yili'], 2024)

        exam, _ = self._create_tyt_exam(puan_yili=None)
        res = self.client.get(
            f'/api/coaching/olcme-degerlendirme/exams/{exam.id}/analysis/rankings/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['referans_yil'], 2024)
        self.assertAlmostEqual(body['rankings'][0]['puan'], 428.67, places=1)

    def test_exam_puan_yili_overrides_kurum_default(self):
        self.client.get(AYAR_URL, **self.headers)
        exam, _ = self._create_tyt_exam(puan_yili=2024)
        res = self.client.get(
            f'/api/coaching/olcme-degerlendirme/exams/{exam.id}/analysis/rankings/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['referans_yil'], 2024)
        self.assertAlmostEqual(body['rankings'][0]['puan'], 428.67, places=1)

    def test_patch_coefficients_changes_score(self):
        self.client.get(AYAR_URL, **self.headers)
        factory_2025 = calculate_tyt_score(ARDA_NETS, year=2025)['puan']

        year_res = self.client.get(f'{AYAR_URL}katsayilar/2025/', **self.headers)
        self.assertEqual(year_res.status_code, 200)
        sets = year_res.json()['sets']
        sets['TYT']['coefficients']['Türkçe'] = 10.0
        put = self.client.put(
            f'{AYAR_URL}katsayilar/2025/',
            {'sets': {'TYT': {'coefficients': sets['TYT']['coefficients']}}},
            format='json',
            **self.headers,
        )
        self.assertEqual(put.status_code, 200)

        exam, _ = self._create_tyt_exam(puan_yili=2025)
        res = self.client.get(
            f'/api/coaching/olcme-degerlendirme/exams/{exam.id}/analysis/rankings/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        puan = res.json()['rankings'][0]['puan']
        self.assertNotAlmostEqual(puan, factory_2025, places=1)
        self.assertGreater(puan, factory_2025)

    def test_2026_reset_copies_2025_and_stays_unpublished(self):
        self.client.get(AYAR_URL, **self.headers)
        dirty = dict(TYT_KATSAYILAR[2025])
        dirty['Türkçe'] = 99.0
        self.client.put(
            f'{AYAR_URL}katsayilar/2026/',
            {'sets': {'TYT': {'coefficients': dirty}}},
            format='json',
            **self.headers,
        )
        reset = self.client.post(f'{AYAR_URL}katsayilar/2026/reset/', **self.headers)
        self.assertEqual(reset.status_code, 200)
        body = reset.json()
        self.assertFalse(body['is_published'])
        self.assertFalse(body['sets']['TYT']['is_published'])
        self.assertEqual(body['sets']['TYT']['coefficients'], dict(TYT_KATSAYILAR[2025]))
        row = OlcmeKatsayiSeti.objects.get(
            kurum=self.kurum, year=2026, kind=OlcmeKatsayiSeti.Kind.TYT,
        )
        self.assertFalse(row.is_published)
