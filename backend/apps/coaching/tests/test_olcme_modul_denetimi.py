"""
Ölçme & Değerlendirme modülü uçtan uca denetiminde bulunan hataların testleri.

Kapsam:
  - Cevap anahtarı toplu içe aktarma artık üzerine yazmıyor (kazanım kaybı yok)
  - Yazma uçları `olcme.write` izni olmadan 403 dönüyor
  - `AnswerKey.primary_for` B kitapçığını asla ana anahtar seçmiyor
  - Eşleştirme şablonları kurum bazında izole
  - Sınav kopyalama bandı/oturum yapısını taşıyor
  - Yayın tarihi sırası doğrulanıyor
  - Bozuk oturum tarihi create isteğini düşürmüyor
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    AnswerKey, AnswerKeyItem, Exam, ExamSection, ExamSessionModel,
    MappingTemplate,
)
from apps.coaching.olcme_degerlendirme.services.exam_roster import create_exam_sessions
from apps.coaching.tests.olcme_helpers import grant_olcme_write
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()

EXAMS_URL = '/api/coaching/olcme-degerlendirme/exams/'
TEMPLATES_URL = '/api/coaching/olcme-degerlendirme/exams/mapping-templates/'


class OlcmeModulFixture(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Denetim Kurum', kod='DEN')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DEN-M')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='denetim', password='test')
        grant_olcme_write(self.user, self.kurum)
        self.client.force_authenticate(user=self.user)

        self.exam = Exam.objects.create(
            name='Denetim Denemesi', exam_type='DENEME',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
        )
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Türkçe', order=0,
            question_start=1, question_end=10,
        )

    @property
    def headers(self):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.egitim_yili.id),
        }


class AnswerKeyBulkImportTest(OlcmeModulFixture):
    """`bulk_import` eskiden tüm satırları silip yeniden yazıyordu."""

    def _bulk(self, items):
        return self.client.post(
            f'{EXAMS_URL}{self.exam.id}/answer-keys/bulk-import/',
            {'booklet': 'A', 'items': items},
            format='json', **self.headers,
        )

    def test_partial_save_keeps_outcome_only_rows(self):
        first = self._bulk([
            {'question_number': 1, 'correct_answer': 'A'},
            {'question_number': 2, 'correct_answer': '', 'imported_outcome_text': '10.1.1.2 Kazanım'},
        ])
        self.assertEqual(first.status_code, 200, first.content[:400])

        key = AnswerKey.primary_for(self.exam)
        self.assertIsNotNone(key)
        self.assertEqual(key.items.count(), 2)

        # 2. soru bu sefer gönderilmiyor: kazanım taşıdığı için silinmemeli.
        second = self._bulk([{'question_number': 1, 'correct_answer': 'B'}])
        self.assertEqual(second.status_code, 200, second.content[:400])

        key.refresh_from_db()
        kept = key.items.get(question_number=2)
        self.assertEqual(kept.imported_outcome_text, '10.1.1.2 Kazanım')
        self.assertEqual(key.items.get(question_number=1).correct_answer, 'B')

    def test_empty_rows_are_pruned(self):
        self._bulk([
            {'question_number': 1, 'correct_answer': 'A'},
            {'question_number': 2, 'correct_answer': 'C'},
        ])
        self._bulk([{'question_number': 1, 'correct_answer': 'A'}])

        key = AnswerKey.primary_for(self.exam)
        self.assertEqual(
            list(key.items.values_list('question_number', flat=True)), [1],
        )


class AnswerKeyWritePermissionTest(OlcmeModulFixture):
    def test_bulk_import_requires_olcme_write(self):
        reader = User.objects.create_user(username='okur', password='test')
        client = APIClient()
        client.force_authenticate(user=reader)
        res = client.post(
            f'{EXAMS_URL}{self.exam.id}/answer-keys/bulk-import/',
            {'booklet': 'A', 'items': [{'question_number': 1, 'correct_answer': 'A'}]},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 403, res.content[:300])


class PrimaryAnswerKeySelectionTest(OlcmeModulFixture):
    """B kitapçığı ana anahtar seçilirse net hesabı tamamen kayıyordu."""

    def test_b_booklet_is_never_primary_when_a_exists(self):
        a_key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        AnswerKey.objects.create(exam=self.exam, booklet='B', is_primary=False)
        self.assertEqual(AnswerKey.primary_for(self.exam), a_key)

    def test_b_booklet_not_chosen_even_with_more_items(self):
        a_key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        b_key = AnswerKey.objects.create(exam=self.exam, booklet='B')
        AnswerKeyItem.objects.create(
            answer_key=a_key, section=self.section,
            question_number=1, correct_answer='A',
        )
        for q in range(1, 6):
            AnswerKeyItem.objects.create(
                answer_key=b_key, section=self.section,
                question_number=q, correct_answer='B',
            )
        self.assertEqual(AnswerKey.primary_for(self.exam), a_key)

    def test_falls_back_to_b_when_only_b_exists(self):
        b_key = AnswerKey.objects.create(exam=self.exam, booklet='B')
        self.assertEqual(AnswerKey.primary_for(self.exam), b_key)


class MappingTemplateIsolationTest(OlcmeModulFixture):
    """Şablonlar `ders_<id>` taşıdığı için başka kuruma sızmamalı."""

    def test_other_kurum_template_not_listed_or_deletable(self):
        other_kurum = Kurum.objects.create(ad='Diğer Kurum', kod='DGR')
        foreign = MappingTemplate.objects.create(
            kurum=other_kurum, name='Yabancı Şablon', exam_type='DENEME',
        )
        mine = MappingTemplate.objects.create(
            kurum=self.kurum, name='Benim Şablonum', exam_type='DENEME',
        )

        listed = self.client.get(f'{TEMPLATES_URL}?exam_type=DENEME', **self.headers)
        self.assertEqual(listed.status_code, 200)
        ids = {row['id'] for row in listed.json()}
        self.assertIn(mine.id, ids)
        self.assertNotIn(foreign.id, ids)

        res = self.client.delete(f'{TEMPLATES_URL}{foreign.id}/', **self.headers)
        self.assertEqual(res.status_code, 404)
        self.assertTrue(MappingTemplate.objects.filter(pk=foreign.id).exists())

    def test_created_template_is_stamped_with_kurum(self):
        res = self.client.post(
            f'{TEMPLATES_URL}create/',
            {
                'name': 'TYT Optik', 'exam_type': 'YKS_TYT',
                'mappings': [{'field': 'ad_soyad', 'start': 0, 'end': 30, 'label': 'Ad'}],
                'first_line_is_header': False, 'student_id_field': 'ogrenci_no',
            },
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:400])
        tpl = MappingTemplate.objects.get(name='TYT Optik')
        self.assertEqual(tpl.kurum_id, self.kurum.id)


class ExamCopyTest(OlcmeModulFixture):
    def test_copy_carries_band_and_session_structure(self):
        self.exam.curriculum_band = 'LGS'
        self.exam.include_optional_philosophy = False
        self.exam.save(update_fields=['curriculum_band', 'include_optional_philosophy'])
        ExamSessionModel.objects.create(
            exam=self.exam, name='1. Oturum', order=0, duration_minutes=135,
            schedule_preference='HAFTA_SONU',
        )

        res = self.client.post(f'{EXAMS_URL}{self.exam.id}/copy/', **self.headers)
        self.assertIn(res.status_code, (200, 201), res.content[:400])

        copy = Exam.objects.get(pk=res.json()['id'])
        self.assertEqual(copy.curriculum_band, 'LGS')
        self.assertFalse(copy.include_optional_philosophy)

        sess = copy.exam_sessions.get()
        self.assertEqual(sess.name, '1. Oturum')
        self.assertEqual(sess.duration_minutes, 135)
        self.assertEqual(sess.schedule_preference, 'HAFTA_SONU')
        # Tarihler bilerek kopyalanmaz — yeni sınav yeni takvimde yapılır.
        self.assertIsNone(sess.session_date)


class PublishDateOrderTest(OlcmeModulFixture):
    def test_answer_key_publish_cannot_precede_result_publish(self):
        res = self.client.patch(
            f'{EXAMS_URL}{self.exam.id}/',
            {
                'result_publish_date': '2026-05-10T10:00:00Z',
                'answer_key_publish_date': '2026-05-09T10:00:00Z',
            },
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 400, res.content[:400])
        self.assertIn('answer_key_publish_date', res.json())


class SessionDateParsingTest(OlcmeModulFixture):
    """Sihirbazdan gelen bozuk tarih tüm create isteğini düşürüyordu."""

    def test_invalid_date_is_dropped_instead_of_raising(self):
        sessions = create_exam_sessions(self.exam, [
            {'name': '1. Oturum', 'session_date': 'gecersiz', 'start_time': '10:00'},
            {'name': '2. Oturum', 'session_date': '2026-05-10', 'start_time': '24:99'},
        ])
        self.assertEqual(len(sessions), 2)
        first, second = sessions
        self.assertIsNone(first.session_date)
        self.assertIsNotNone(first.start_time)
        self.assertIsNotNone(second.session_date)
        self.assertIsNone(second.start_time)
