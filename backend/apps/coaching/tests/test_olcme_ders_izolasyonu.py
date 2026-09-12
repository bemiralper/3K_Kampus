"""
Yanlış bölüme yapıştırılan kazanım paylaşılan müfredata yazılmamalı.

Subject / Topic / Outcome kurumdan bağımsız (global) tablolardır. Bir
kullanıcı Türkçe kazanımlarını Matematik bölümüne yapıştırdığında, eski
davranışta bu metinler Matematik konularının altında yeni kazanım olarak
yaratılıyor ve tüm kurumlarda "Matematikte Türkçe kazanımı" görünüyordu.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKey, AnswerKeyItem
from apps.coaching.olcme_degerlendirme.models.curriculum import (
    Outcome, Subject, SubOutcome, Topic,
)
from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.views.curriculum_views import (
    outcome_prose,
    text_belongs_to_other_subject,
)
from apps.coaching.management.commands.temizle_karisan_kazanimlar import (
    karisan_kazanimlari_bul,
)
from apps.coaching.tests.olcme_helpers import grant_olcme_write
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()

EXAMS_URL = '/api/coaching/olcme-degerlendirme/exams/'

TURKCE_METNI = 'Paragrafın ana düşüncesini belirler ve gerekçelendirir.'


class CurriculumFixture(TestCase):
    def setUp(self):
        self.turkce = Subject.objects.create(code='TUR', name='Türkçe')
        self.matematik = Subject.objects.create(code='MAT', name='Matematik')

        # Türkçe 21.5 → 21.5.1
        t_topic = Topic.objects.create(
            subject=self.turkce, code='21.5', name='Paragrafta Ana Düşünce', order=0,
        )
        Outcome.objects.create(
            topic=t_topic, code='21.5.1', text=TURKCE_METNI, order=0,
        )

        # Matematik de 21.5 kodunu kullanıyor — MEB kodları derslerde tekrar eder.
        self.mat_topic = Topic.objects.create(
            subject=self.matematik, code='21.5', name='Eşitsizlikler', order=0,
        )
        Outcome.objects.create(
            topic=self.mat_topic, code='21.5.1',
            text='Birinci dereceden eşitsizlikleri çözer.', order=0,
        )


class TextBelongsToOtherSubjectTest(CurriculumFixture):
    def test_turkce_text_detected_as_foreign_for_matematik(self):
        self.assertTrue(text_belongs_to_other_subject(TURKCE_METNI, self.matematik))

    def test_text_is_not_foreign_for_its_own_subject(self):
        self.assertFalse(text_belongs_to_other_subject(TURKCE_METNI, self.turkce))

    def test_leading_code_is_ignored_when_comparing(self):
        self.assertTrue(
            text_belongs_to_other_subject(f'21.5.1. {TURKCE_METNI}', self.matematik)
        )

    def test_bare_code_is_not_treated_as_foreign(self):
        """Kod tek başına ders ayırt etmez — 21.5.1 her iki derste de var."""
        self.assertFalse(text_belongs_to_other_subject('21.5.1', self.matematik))

    def test_short_text_is_not_treated_as_foreign(self):
        Outcome.objects.create(
            topic=Topic.objects.create(subject=self.turkce, name='Kısa', order=9),
            code='9.9.9', text='Kümeler', order=0,
        )
        self.assertFalse(text_belongs_to_other_subject('Kümeler', self.matematik))

    def test_inactive_copy_under_home_still_counts_as_foreign(self):
        """Temizlik is_active=False yapınca kopya ev derste durur; yine yabancı sayılmalı."""
        Outcome.objects.create(
            topic=self.mat_topic, code='21.5.2', text=TURKCE_METNI,
            order=1, is_active=False,
        )
        self.assertTrue(text_belongs_to_other_subject(TURKCE_METNI, self.matematik))

    def test_sub_outcome_text_also_detected(self):
        outcome = Outcome.objects.get(code='21.5.1', topic__subject=self.turkce)
        SubOutcome.objects.create(
            outcome=outcome, code='21.5.1.1',
            text='Yardımcı düşünceleri ana düşünceden ayırt eder.', order=0,
        )
        self.assertTrue(text_belongs_to_other_subject(
            'Yardımcı düşünceleri ana düşünceden ayırt eder.', self.matematik,
        ))

    def test_outcome_prose_strips_only_leading_code(self):
        self.assertEqual(outcome_prose('21.5.1. Bir metni özetler.'), 'Bir metni özetler.')
        self.assertEqual(outcome_prose('9.1.1.2 Sayıları sıralar.'), 'Sayıları sıralar.')
        self.assertEqual(outcome_prose('21.5.1'), '')
        self.assertEqual(outcome_prose('Bir metni özetler.'), 'Bir metni özetler.')


class KarisanKazanimTemizligiTest(CurriculumFixture):
    """Canlıda hâlihazırda yazılmış kirlilik tespit edilebilmeli."""

    def test_clean_curriculum_reports_nothing(self):
        self.assertEqual(karisan_kazanimlari_bul(), [])

    def test_copy_written_under_wrong_subject_is_reported(self):
        kopya = Outcome.objects.create(
            topic=self.mat_topic, code='21.5.2', text=TURKCE_METNI, order=1,
        )
        self.assertEqual([o.id for o in karisan_kazanimlari_bul()], [kopya.id])

    def test_original_is_kept_and_only_later_copy_reported(self):
        """Özgün kayıt (önce yazılan) listede olmamalı."""
        ozgun = Outcome.objects.get(text=TURKCE_METNI, topic__subject=self.turkce)
        Outcome.objects.create(
            topic=self.mat_topic, code='21.5.2', text=TURKCE_METNI, order=1,
        )
        self.assertNotIn(ozgun.id, [o.id for o in karisan_kazanimlari_bul()])

    def test_same_text_within_one_subject_is_not_pollution(self):
        Outcome.objects.create(
            topic=self.mat_topic, code='21.5.2',
            text='Birinci dereceden eşitsizlikleri çözer.', order=1,
        )
        self.assertEqual(karisan_kazanimlari_bul(), [])

    def test_leading_code_difference_does_not_hide_the_copy(self):
        kopya = Outcome.objects.create(
            topic=self.mat_topic, code='21.5.2',
            text=f'21.5.2. {TURKCE_METNI}', order=1,
        )
        self.assertEqual([o.id for o in karisan_kazanimlari_bul()], [kopya.id])

    def test_shared_okulizyon_konu_title_is_not_pollution(self):
        """Fen ve Kimya'da aynı konu adı (Periyodik Sistem) katalogdur, kopya değil."""
        from apps.coaching.olcme_degerlendirme.models.curriculum import SubOutcome
        from apps.coaching.olcme_degerlendirme.services.curriculum_heal import (
            restore_catalog_konu_outcomes,
            uygula_karisan_kazanim_temizligi,
        )
        from apps.coaching.olcme_degerlendirme.views.curriculum_views import (
            _match_single_text,
        )

        fen = Subject.objects.create(code='FEN', name='Fen Bilimleri')
        kimya = Subject.objects.create(code='KIMYA', name='Kimya')
        fen_topic = Topic.objects.create(subject=fen, code='8.4', name='8. sınıf · PERİYODİK SİSTEM')
        kimya_topic = Topic.objects.create(subject=kimya, code='9.2', name='9. sınıf · ATOM VE PERİYODİK SİSTEM')
        fen_out = Outcome.objects.create(topic=fen_topic, code='8.4.1', text='Periyodik Sistem')
        kimya_out = Outcome.objects.create(
            topic=kimya_topic, code='9.2.3', text='Periyodik Sistem', is_active=False,
        )
        SubOutcome.objects.create(
            outcome=kimya_out, code='9.2.3.3',
            text='Periyodik özelliklerin değişme eğilimlerini açıklar.',
        )

        self.assertEqual(karisan_kazanimlari_bul(), [])
        self.assertGreaterEqual(restore_catalog_konu_outcomes(), 1)
        kimya_out.refresh_from_db()
        self.assertTrue(kimya_out.is_active)
        uygula_karisan_kazanim_temizligi()
        kimya_out.refresh_from_db()
        self.assertTrue(kimya_out.is_active)

        match = _match_single_text('9.2.3.3', kimya)
        self.assertIsNotNone(match)
        self.assertEqual(match['match_type'], 'sub_outcome')
        self.assertEqual(match['outcome_code'], '9.2.3.3')


class BulkAssignDoesNotPolluteCurriculumTest(CurriculumFixture):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='İzolasyon Kurum', kod='IZO')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='IZO-M')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='izolasyon', password='test')
        grant_olcme_write(self.user, self.kurum)
        self.client.force_authenticate(user=self.user)

        self.exam = Exam.objects.create(
            name='Deneme', exam_type='DENEME',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
        )
        self.mat_section = ExamSection.objects.create(
            exam=self.exam, name='Matematik', order=0,
            question_start=1, question_end=1, subject=self.matematik,
        )
        self.key = AnswerKey.objects.create(
            exam=self.exam, booklet='A', is_primary=True,
        )
        AnswerKeyItem.objects.create(
            answer_key=self.key, section=self.mat_section,
            question_number=1, correct_answer='A',
        )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.egitim_yili.id),
        }

    def _assign(self, texts, create_if_missing=True):
        return self.client.post(
            f'{EXAMS_URL}{self.exam.id}/answer-keys/{self.key.id}/bulk-assign-outcomes/',
            {'texts': texts, 'create_if_missing': create_if_missing},
            format='json', **self.headers,
        )

    def test_inactive_copy_does_not_disable_the_guard(self):
        """Canlıdaki pasif kopya, yeni yapıştırmanın tekrar yazılmasına izin vermemeli."""
        Outcome.objects.create(
            topic=self.mat_topic, code='21.5.2', text=TURKCE_METNI,
            order=1, is_active=False,
        )
        before = Outcome.objects.filter(topic__subject=self.matematik, is_active=True).count()
        res = self._assign([TURKCE_METNI])
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.assertEqual(res.json()['foreign_subject'], 1)
        self.assertEqual(
            Outcome.objects.filter(topic__subject=self.matematik, is_active=True).count(),
            before,
        )

    def test_turkce_text_is_not_created_under_matematik(self):
        before = Outcome.objects.filter(topic__subject=self.matematik).count()
        res = self._assign([TURKCE_METNI])
        self.assertEqual(res.status_code, 200, res.content[:400])

        body = res.json()
        self.assertEqual(body['created'], 0)
        self.assertEqual(body['foreign_subject'], 1)
        self.assertTrue(body['results'][0]['foreign_subject'])

        self.assertEqual(
            Outcome.objects.filter(topic__subject=self.matematik).count(), before,
            'Türkçe metni Matematik müfredatına yazılmamalı.',
        )
        self.assertFalse(
            Outcome.objects.filter(
                topic__subject=self.matematik, text=TURKCE_METNI,
            ).exists(),
        )

    def test_answer_key_get_heals_already_written_copy(self):
        """Kazanımlar sekmesi açılınca canlıdaki kopya pasifleşir, bağ kopar."""
        kopya = Outcome.objects.create(
            topic=self.mat_topic, code='21.5.2', text=TURKCE_METNI, order=1,
        )
        item = AnswerKeyItem.objects.get(answer_key=self.key, question_number=1)
        item.outcome = kopya
        item.imported_outcome_text = TURKCE_METNI
        item.save()

        res = self.client.get(
            f'{EXAMS_URL}{self.exam.id}/answer-keys/{self.key.id}/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        kopya.refresh_from_db()
        item.refresh_from_db()
        self.assertFalse(kopya.is_active)
        self.assertIsNone(item.outcome_id)
        self.assertEqual(item.imported_outcome_text, TURKCE_METNI)

    def test_input_text_is_still_preserved_for_the_user(self):
        """Satır reddedilse de kullanıcının yapıştırdığı metin kaybolmamalı."""
        self._assign([TURKCE_METNI])
        item = AnswerKeyItem.objects.get(answer_key=self.key, question_number=1)
        self.assertEqual(item.imported_outcome_text, TURKCE_METNI)
        self.assertIsNone(item.outcome_id)

    def test_foreign_text_flagged_even_without_create_if_missing(self):
        res = self._assign([TURKCE_METNI], create_if_missing=False)
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.assertEqual(res.json()['foreign_subject'], 1)

    def test_own_subject_text_still_matches(self):
        res = self._assign(['Birinci dereceden eşitsizlikleri çözer.'])
        self.assertEqual(res.status_code, 200, res.content[:400])
        body = res.json()
        self.assertEqual(body['foreign_subject'], 0)
        self.assertEqual(body['matched'], 1)

    def test_new_matematik_outcome_can_still_be_created(self):
        """Gerçekten eksik olan kazanım hâlâ eklenebilmeli."""
        before = Outcome.objects.filter(topic__subject=self.matematik).count()
        res = self._assign(['21.5.9 Üçgenin iç açılar toplamını hesaplar.'])
        self.assertEqual(res.status_code, 200, res.content[:400])
        body = res.json()
        self.assertEqual(body['foreign_subject'], 0)
        self.assertEqual(body['created'], 1, body['results'])
        self.assertEqual(
            Outcome.objects.filter(topic__subject=self.matematik).count(), before + 1,
        )
