"""YKS (9–12) / LGS (5–8) müfredat bandı: ders bağlama ve kazanım süzme."""
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, Topic
from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.services.curriculum_band import (
    BAND_LGS,
    BAND_YKS,
    grades_from_text,
    normalize_band,
    subject_matches_band,
    topic_matches_band,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()

EXAMS_URL = '/api/coaching/olcme-degerlendirme/exams/'
SUBJECTS_URL = '/api/coaching/olcme-degerlendirme/curriculum/subjects/'


class CurriculumBandHelperTest(SimpleTestCase):
    def test_normalize_locks_exam_type(self):
        self.assertEqual(normalize_band('LGS', 'YKS_TYT'), BAND_YKS)
        self.assertEqual(normalize_band('YKS', 'LGS'), BAND_LGS)
        self.assertEqual(normalize_band('LGS', 'KONU_TARAMA'), BAND_LGS)
        self.assertEqual(normalize_band('', 'KONU_TARAMA'), BAND_YKS)

    def test_grades_from_meb_codes(self):
        self.assertEqual(grades_from_text('9.1.2', 'TYT Fizik'), {9})
        self.assertEqual(grades_from_text('7.4.1', 'LGS Fen'), {7})
        self.assertEqual(grades_from_text('12.3', '11.2.1'), {11, 12})
        self.assertEqual(grades_from_text('2019 kazanım'), set())


class CurriculumBandAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Band Kurum', kod='BND')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='BND-M')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='banduser', password='test')
        self.client.force_authenticate(user=self.user)

        self.yks_fizik = Subject.objects.create(
            code='FIZ_YKS_BAND', name='Fizik', exam_type_filter='YKS_TYT',
        )
        fizik_topic = Topic.objects.create(subject=self.yks_fizik, code='9.1', name='Vektörler', order=0)
        Outcome.objects.create(topic=fizik_topic, code='9.1.1', text='Vektörü açıklar.', order=0)

        self.lgs_fen = Subject.objects.create(
            code='FEN_LGS_BAND', name='Fen Bilimleri', exam_type_filter='LGS',
        )
        fen_topic = Topic.objects.create(subject=self.lgs_fen, code='7.1', name='Kuvvet', order=0)
        Outcome.objects.create(topic=fen_topic, code='7.1.1', text='Kuvveti açıklar.', order=0)

        self.mixed = Subject.objects.create(
            code='KARISIK_BAND', name='Karışık Deneme', exam_type_filter='ALL',
        )
        self.yks_topic = Topic.objects.create(
            subject=self.mixed, code='10.2', name='Fonksiyonlar', order=0,
        )
        Outcome.objects.create(
            topic=self.yks_topic, code='10.2.1', text='Fonksiyonu açıklar.', order=0,
        )
        self.lgs_topic = Topic.objects.create(
            subject=self.mixed, code='6.3', name='Kesirler', order=1,
        )
        Outcome.objects.create(
            topic=self.lgs_topic, code='6.3.1', text='Kesri açıklar.', order=0,
        )

    @property
    def headers(self):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.egitim_yili.id),
        }

    def test_subject_band_from_filter_and_grades(self):
        self.assertTrue(subject_matches_band(self.yks_fizik, BAND_YKS))
        self.assertFalse(subject_matches_band(self.yks_fizik, BAND_LGS))
        self.assertTrue(subject_matches_band(self.lgs_fen, BAND_LGS))
        self.assertFalse(subject_matches_band(self.lgs_fen, BAND_YKS))
        self.assertTrue(subject_matches_band(self.mixed, BAND_YKS))
        self.assertTrue(subject_matches_band(self.mixed, BAND_LGS))
        self.assertTrue(topic_matches_band(self.yks_topic, BAND_YKS))
        self.assertFalse(topic_matches_band(self.yks_topic, BAND_LGS))
        self.assertTrue(topic_matches_band(self.lgs_topic, BAND_LGS))
        self.assertFalse(topic_matches_band(self.lgs_topic, BAND_YKS))

    def test_subject_list_filters_by_band(self):
        yks = self.client.get(SUBJECTS_URL, {'band': 'YKS'}, **self.headers)
        lgs = self.client.get(SUBJECTS_URL, {'band': 'LGS'}, **self.headers)
        self.assertEqual(yks.status_code, 200)
        self.assertEqual(lgs.status_code, 200)
        yks_ids = {row['id'] for row in yks.json()}
        lgs_ids = {row['id'] for row in lgs.json()}
        self.assertIn(self.yks_fizik.id, yks_ids)
        self.assertNotIn(self.lgs_fen.id, yks_ids)
        self.assertIn(self.lgs_fen.id, lgs_ids)
        self.assertNotIn(self.yks_fizik.id, lgs_ids)
        self.assertIn(self.mixed.id, yks_ids)
        self.assertIn(self.mixed.id, lgs_ids)

    def test_create_persists_subject_and_band(self):
        res = self.client.post(
            EXAMS_URL,
            {
                'name': 'Konu Tarama LGS',
                'exam_type': 'KONU_TARAMA',
                'curriculum_band': 'LGS',
                'apply_template': False,
                'sections': [
                    {'name': 'Fen Bilimleri', 'question_count': 10, 'subject': self.lgs_fen.id},
                ],
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:400])
        data = res.json()
        self.assertEqual(data['curriculum_band'], 'LGS')
        exam = Exam.objects.get(id=data['id'])
        self.assertEqual(exam.curriculum_band, 'LGS')
        section = exam.sections.get(name='Fen Bilimleri')
        self.assertEqual(section.subject_id, self.lgs_fen.id)

    def test_tyt_ignores_client_lgs_band_and_rejects_lgs_subject(self):
        res = self.client.post(
            EXAMS_URL,
            {
                'name': 'TYT Karışık',
                'exam_type': 'YKS_TYT',
                'curriculum_band': 'LGS',
                'apply_template': False,
                'sections': [
                    {'name': 'Fen', 'question_count': 7, 'subject': self.lgs_fen.id},
                ],
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Exam.objects.filter(name='TYT Karışık').exists())

        ok = self.client.post(
            EXAMS_URL,
            {
                'name': 'TYT Fizik',
                'exam_type': 'YKS_TYT',
                'curriculum_band': 'LGS',
                'apply_template': False,
                'sections': [
                    {'name': 'Fizik', 'question_count': 7, 'subject': self.yks_fizik.id},
                ],
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(ok.status_code, 201, ok.content[:400])
        self.assertEqual(ok.json()['curriculum_band'], 'YKS')
        exam = Exam.objects.get(id=ok.json()['id'])
        self.assertEqual(exam.curriculum_band, 'YKS')
        self.assertEqual(exam.sections.get(name='Fizik').subject_id, self.yks_fizik.id)

    def test_update_section_rejects_wrong_band(self):
        exam = Exam.objects.create(
            name='TYT Bağ', exam_type='YKS_TYT', curriculum_band='YKS',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
        )
        section = ExamSection.objects.create(
            exam=exam, name='Fizik', order=0, question_start=1, question_end=7,
        )
        res = self.client.post(
            f'{EXAMS_URL}{exam.id}/update_section/',
            {'section_id': section.id, 'subject': self.lgs_fen.id},
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)
        section.refresh_from_db()
        self.assertIsNone(section.subject_id)

        ok = self.client.post(
            f'{EXAMS_URL}{exam.id}/update_section/',
            {'section_id': section.id, 'subject': self.yks_fizik.id},
            format='json',
            **self.headers,
        )
        self.assertEqual(ok.status_code, 200, ok.content[:400])
        section.refresh_from_db()
        self.assertEqual(section.subject_id, self.yks_fizik.id)

    def test_outcomes_hide_other_band_topics(self):
        yks_exam = Exam.objects.create(
            name='TYT Kazanım', exam_type='YKS_TYT',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
        )
        lgs_exam = Exam.objects.create(
            name='LGS Kazanım', exam_type='LGS',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
        )
        yks = self.client.get(
            f'{EXAMS_URL}{yks_exam.id}/answer-keys/outcomes/', **self.headers,
        )
        lgs = self.client.get(
            f'{EXAMS_URL}{lgs_exam.id}/answer-keys/outcomes/', **self.headers,
        )
        self.assertEqual(yks.status_code, 200, yks.content[:400])
        self.assertEqual(lgs.status_code, 200, lgs.content[:400])

        def topic_codes(payload):
            codes = set()
            for subject in payload:
                for topic in subject.get('topics', []):
                    codes.add(topic['code'])
            return codes

        self.assertIn('10.2', topic_codes(yks.json()))
        self.assertNotIn('6.3', topic_codes(yks.json()))
        self.assertIn('6.3', topic_codes(lgs.json()))
        self.assertNotIn('10.2', topic_codes(lgs.json()))
        self.assertNotIn('9.1', topic_codes(lgs.json()))
        self.assertIn('9.1', topic_codes(yks.json()))

    def test_flexible_exam_can_switch_band(self):
        exam = Exam.objects.create(
            name='Özel Tarama', exam_type='KONU_TARAMA', curriculum_band='YKS',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
        )
        res = self.client.patch(
            f'{EXAMS_URL}{exam.id}/',
            {'curriculum_band': 'LGS'},
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.assertEqual(res.json()['curriculum_band'], 'LGS')
        exam.refresh_from_db()
        self.assertEqual(exam.curriculum_band, 'LGS')
