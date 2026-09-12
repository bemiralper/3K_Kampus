"""
Sınav detay sayfasındaki düzenleme akışının backend karşılığı.

Kapsam: sinif_ids güncelleme, deneme alanlarını null'a çekme, geçersiz bölüm
aralığı ve oturum doğrulamaları, kilitli sınavda puanlama alanlarının korunması,
exam_date'in oturum tarihlerinden türetilmesi.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import Exam, ExamAudience, ExamSection
from apps.egitim_paketleri.models import Deneme
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.coaching.tests.olcme_helpers import grant_olcme_write

User = get_user_model()

EXAMS_URL = '/api/coaching/olcme-degerlendirme/exams/'


class OlcmeExamEditAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Düzenleme Kurum', kod='DZN')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DZN-M')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='duzenleme', password='test')
        grant_olcme_write(self.user, self.kurum)
        self.client.force_authenticate(user=self.user)

        self.sinif_a = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili, ad='12-A',
        )
        self.sinif_b = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili, ad='12-B',
        )

        self.exam = Exam.objects.create(
            name='Deneme 1', exam_type='DENEME',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
        )
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Türkçe', order=0,
            question_start=1, question_end=40,
        )

    @property
    def headers(self):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.egitim_yili.id),
        }

    def _patch(self, payload):
        return self.client.patch(
            f'{EXAMS_URL}{self.exam.id}/', data=payload, format='json', **self.headers
        )

    # ── Sınıf ilişkisi ──────────────────────────────────────────────────────

    def test_sinif_ids_can_be_updated_after_creation(self):
        """Detay sayfasındaki sınıf seçimi kaydedilmeli."""
        res = self._patch({'sinif_ids': [self.sinif_a.id, self.sinif_b.id]})
        self.assertEqual(res.status_code, 200)
        self.assertCountEqual(
            list(self.exam.siniflar.values_list('id', flat=True)),
            [self.sinif_a.id, self.sinif_b.id],
        )

    def test_sinif_ids_can_be_cleared(self):
        self.exam.siniflar.set([self.sinif_a.id])
        res = self._patch({'sinif_ids': []})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(list(self.exam.siniflar.all()), [])

    def test_sinif_display_reflects_selection(self):
        self.exam.siniflar.set([self.sinif_a.id, self.sinif_b.id])
        res = self.client.get(f'{EXAMS_URL}{self.exam.id}/', **self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn('12-A', res.json()['sinif_display'])

    def test_audience_ids_can_be_updated_after_creation(self):
        """Genel bilgiler düzenlemesi seviye + paket çoklu seçimini kaydetmeli."""
        sev = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='12. Sınıf', kod='12',
        )
        paket = Deneme.objects.create(
            ad='Deneme Kulübü', kod='DK',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
        )
        res = self._patch({
            'sinif_ids': [self.sinif_a.id],
            'sinif_seviyesi_ids': [sev.id],
            'deneme_paketi_ids': [paket.id],
        })
        self.assertEqual(res.status_code, 200, res.content[:400])
        rows = list(ExamAudience.objects.filter(exam=self.exam).values_list(
            'sinif_seviyesi_id', 'deneme_paketi_id',
        ))
        self.assertEqual(rows, [(sev.id, paket.id)])
        detail = self.client.get(f'{EXAMS_URL}{self.exam.id}/', **self.headers)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()['sinif_seviyesi_ids'], [sev.id])
        self.assertEqual(detail.json()['deneme_paketi_ids'], [paket.id])

    def test_audience_ids_can_be_cleared(self):
        sev = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='11. Sınıf', kod='11',
        )
        ExamAudience.objects.create(exam=self.exam, sinif_seviyesi=sev)
        res = self._patch({'sinif_seviyesi_ids': [], 'deneme_paketi_ids': []})
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.assertFalse(ExamAudience.objects.filter(exam=self.exam).exists())
        detail = self.client.get(f'{EXAMS_URL}{self.exam.id}/', **self.headers)
        self.assertEqual(detail.json()['sinif_seviyesi_ids'], [])
        self.assertEqual(detail.json()['deneme_paketi_ids'], [])

    # ── Deneme alanları ─────────────────────────────────────────────────────

    def test_create_konu_tarama_with_manual_sections(self):
        """Konu tarama oluştururken ders + soru sayısı kalıcı bölümlere yazılmalı."""
        res = self.client.post(
            EXAMS_URL,
            {
                'name': 'Konu Tarama 1',
                'exam_type': 'KONU_TARAMA',
                'apply_template': False,
                'sections': [
                    {'name': 'Türkçe', 'question_count': 12},
                    {'name': 'Matematik', 'question_count': 8},
                ],
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:400])
        exam = Exam.objects.get(id=res.json()['id'])
        rows = list(exam.sections.order_by('order').values_list(
            'name', 'question_start', 'question_end',
        ))
        self.assertEqual(rows, [('Türkçe', 1, 12), ('Matematik', 13, 20)])

    def test_create_konu_tarama_with_nested_sub_sections(self):
        res = self.client.post(
            EXAMS_URL,
            {
                'name': 'Konu Tarama Fen',
                'exam_type': 'KONU_TARAMA',
                'apply_template': False,
                'sections': [{
                    'name': 'Fen Bilimleri',
                    'sub_sections': [
                        {'name': 'Fizik', 'question_count': 7},
                        {'name': 'Kimya', 'question_count': 7},
                    ],
                }],
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:400])
        exam = Exam.objects.get(id=res.json()['id'])
        fen = exam.sections.get(name='Fen Bilimleri', is_sub_section=False)
        self.assertEqual((fen.question_start, fen.question_end), (1, 14))
        subs = list(fen.sub_sections.order_by('order').values_list(
            'name', 'question_start', 'question_end',
        ))
        self.assertEqual(subs, [('Fizik', 1, 7), ('Kimya', 8, 14)])
        fizik = exam.sections.get(name='Fizik')
        self.assertIsNotNone(fizik.subject_id)
        self.assertEqual(fizik.subject.name, 'Fizik')

    def test_create_edited_tyt_template_keeps_custom_ranges(self):
        res = self.client.post(
            EXAMS_URL,
            {
                'name': 'TYT Kesilmiş',
                'exam_type': 'YKS_TYT',
                'apply_template': False,
                'sections': [
                    {'name': 'Türkçe', 'question_count': 40},
                    {
                        'name': 'Fen Bilimleri',
                        'sub_sections': [
                            {'name': 'Fizik', 'question_count': 7},
                            {'name': 'Kimya', 'question_count': 7},
                        ],
                    },
                ],
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:400])
        exam = Exam.objects.get(id=res.json()['id'])
        mains = list(exam.sections.filter(is_sub_section=False).order_by('order'))
        self.assertEqual([m.name for m in mains], ['Türkçe', 'Fen Bilimleri'])
        self.assertEqual((mains[0].question_start, mains[0].question_end), (1, 40))
        self.assertEqual((mains[1].question_start, mains[1].question_end), (41, 54))
        fizik = exam.sections.get(name='Fizik', is_sub_section=True)
        self.assertEqual((fizik.question_start, fizik.question_end), (41, 47))
        self.assertIsNotNone(fizik.subject_id)

    def test_add_section_appears_in_response(self):
        """Prefetch önbelleği yeni üst dersi gizlememeli."""
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_section/',
            {'name': 'Geometri', 'question_count': 20},
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        names = [row['name'] for row in res.json()['sections'] if not row.get('is_sub_section')]
        self.assertIn('Geometri', names)

    def test_add_sub_section_under_parent(self):
        parent = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_section/',
            {'name': 'Fen Bilimleri', 'question_start': 41, 'question_end': 50},
            format='json',
            **self.headers,
        )
        self.assertEqual(parent.status_code, 200, parent.content[:400])
        parent_id = next(
            row['id'] for row in parent.json()['sections'] if row['name'] == 'Fen Bilimleri'
        )
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_section/',
            {'name': 'Fizik', 'question_count': 6, 'parent_section': parent_id},
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        fizik = next(row for row in res.json()['sections'] if row['name'] == 'Fizik')
        self.assertTrue(fizik['is_sub_section'])
        self.assertEqual(fizik['parent_section'], parent_id)
        self.assertEqual((fizik['question_start'], fizik['question_end']), (41, 46))

    def test_add_section_rejects_overlapping_range(self):
        """Aynı düzeydeki bölümler aynı soru numaralarını paylaşamaz."""
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_section/',
            {'name': 'Matematik', 'question_start': 30, 'question_end': 60},
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 400, res.content[:400])
        self.assertIn('çakış', res.json()['error'])

    def test_deneme_fields_accept_null(self):
        """Deneme hizmeti/paketi temizlenebilmeli (SET_NULL alanlar)."""
        res = self._patch({'deneme_hizmeti': None, 'deneme_paketi': None})
        self.assertEqual(res.status_code, 200)
        self.exam.refresh_from_db()
        self.assertIsNone(self.exam.deneme_hizmeti_id)
        self.assertIsNone(self.exam.deneme_paketi_id)

    # ── Bölüm doğrulaması ───────────────────────────────────────────────────

    def test_update_section_rejects_inverted_range(self):
        """end < start artık 500 değil 400 dönmeli."""
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/update_section/',
            data={'section_id': self.section.id, 'question_start': 40, 'question_end': 10},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 400)
        self.section.refresh_from_db()
        self.assertEqual(self.section.question_start, 1)
        self.assertEqual(self.section.question_end, 40)

    def test_add_section_rejects_duplicate_name(self):
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_section/',
            data={'name': 'Türkçe', 'question_start': 41, 'question_end': 60},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 400)

    # ── Oturum doğrulaması ──────────────────────────────────────────────────

    def test_add_session_accepts_blank_optional_fields(self):
        """Frontend boş string gönderiyor; null'a çevrilmeli."""
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_session/',
            data={
                'name': '1. Oturum', 'session_date': '', 'start_time': '',
                'end_time': '', 'duration_minutes': '',
            },
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:300])

    def test_add_session_rejects_duplicate_name(self):
        payload = {'name': '1. Oturum'}
        first = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_session/',
            data=payload, format='json', **self.headers,
        )
        self.assertEqual(first.status_code, 201)
        second = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_session/',
            data=payload, format='json', **self.headers,
        )
        self.assertEqual(second.status_code, 400)

    def test_exam_date_derived_from_earliest_session(self):
        """Oluşturma formunda exam_date alanı yok; oturumdan türetilir."""
        self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_session/',
            data={'name': '2. Oturum', 'session_date': '2026-04-20'},
            format='json', **self.headers,
        )
        self.exam.refresh_from_db()
        self.assertEqual(str(self.exam.exam_date), '2026-04-20')

        self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_session/',
            data={'name': '1. Oturum', 'session_date': '2026-04-19'},
            format='json', **self.headers,
        )
        self.exam.refresh_from_db()
        self.assertEqual(str(self.exam.exam_date), '2026-04-19')

    # ── Kilit ───────────────────────────────────────────────────────────────

    def test_locked_exam_rejects_scoring_change(self):
        self.client.post(f'{EXAMS_URL}{self.exam.id}/lock/', **self.headers)
        res = self._patch({'wrong_answer_count': 3})
        self.assertEqual(res.status_code, 400)

    def test_locked_exam_still_allows_name_change(self):
        self.client.post(f'{EXAMS_URL}{self.exam.id}/lock/', **self.headers)
        res = self._patch({'name': 'Deneme 1 (revize)'})
        self.assertEqual(res.status_code, 200)
        self.exam.refresh_from_db()
        self.assertEqual(self.exam.name, 'Deneme 1 (revize)')

    def test_create_kurum_ici_without_sections_rejected(self):
        res = self.client.post(
            EXAMS_URL,
            {
                'name': 'Boş Kurum İçi',
                'exam_type': 'KURUM_ICI',
                'apply_template': True,
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Exam.objects.filter(name='Boş Kurum İçi').exists())

    def test_create_without_olcme_write_is_forbidden(self):
        # Ayrı kullanıcı: setUp'taki user.user_role OneToOne önbelleği
        # silindikten sonra bile yazma iznini taşırdı.
        other = User.objects.create_user(username='no-olcme', password='test')
        self.client.force_authenticate(user=other)
        res = self.client.post(
            EXAMS_URL,
            {
                'name': 'Yetkisiz',
                'exam_type': 'YKS_TYT',
                'apply_template': True,
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)
        self.assertFalse(Exam.objects.filter(name='Yetkisiz').exists())


class AytMathGeometryRangeEditTest(TestCase):
    """AYT Matematik/Geometri soru sayısı değişince anahtar, net ve kazanım hizalansın."""

    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='AYT Aralık', kod='AYTR')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='AYTR-M')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='ayt-aralik', password='test')
        grant_olcme_write(self.user, self.kurum)
        self.client.force_authenticate(user=self.user)

        self.exam = Exam.objects.create(
            name='AYT Aralık', exam_type='YKS_AYT',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
            include_optional_philosophy=False,
        )
        self.parent = ExamSection.objects.create(
            exam=self.exam, name='Matematik', order=2,
            question_start=81, question_end=120,
        )
        self.mat = ExamSection.objects.create(
            exam=self.exam, name='Matematik', order=0,
            question_start=81, question_end=110,
            is_sub_section=True, parent_section=self.parent,
        )
        self.geo = ExamSection.objects.create(
            exam=self.exam, name='Geometri', order=1,
            question_start=111, question_end=120,
            is_sub_section=True, parent_section=self.parent,
        )

    @property
    def headers(self):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.egitim_yili.id),
        }

    def test_growing_math_slides_geometry(self):
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/update_section/',
            {
                'section_id': self.mat.id,
                'question_start': 81,
                'question_end': 111,
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.mat.refresh_from_db()
        self.geo.refresh_from_db()
        self.parent.refresh_from_db()
        self.assertEqual((self.mat.question_start, self.mat.question_end), (81, 111))
        self.assertEqual(self.mat.question_count, 31)
        self.assertEqual((self.geo.question_start, self.geo.question_end), (112, 120))
        self.assertEqual(self.geo.question_count, 9)
        self.assertEqual((self.parent.question_start, self.parent.question_end), (81, 120))

    def test_shrinking_geometry_slides_math(self):
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/update_section/',
            {
                'section_id': self.geo.id,
                'question_start': 112,
                'question_end': 120,
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.mat.refresh_from_db()
        self.geo.refresh_from_db()
        self.assertEqual((self.mat.question_start, self.mat.question_end), (81, 111))
        self.assertEqual((self.geo.question_start, self.geo.question_end), (112, 120))

    def test_boundary_answer_key_and_score_follow_new_range(self):
        from apps.coaching.olcme_degerlendirme.models import (
            AnswerKey, AnswerKeyItem, ExamSession, StudentAnswer, StudentSectionScore,
        )

        key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        item = AnswerKeyItem.objects.create(
            answer_key=key, section=self.geo, question_number=111, correct_answer='C',
        )
        for q in range(81, 121):
            if q == 111:
                continue
            AnswerKeyItem.objects.create(
                answer_key=key,
                section=self.mat if q <= 110 else self.geo,
                question_number=q,
                correct_answer='A',
            )

        session = ExamSession.objects.create(exam=self.exam)
        answers = {str(q): 'A' for q in range(81, 121)}
        answers['111'] = 'C'
        sa = StudentAnswer.objects.create(
            session=session, raw_student_id='1', booklet='A', answers=answers,
        )
        StudentSectionScore.objects.create(
            student_answer=sa, section=self.mat, correct=30, wrong=0, empty=0, net=30,
        )
        StudentSectionScore.objects.create(
            student_answer=sa, section=self.geo, correct=10, wrong=0, empty=0, net=10,
        )

        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/update_section/',
            {
                'section_id': self.mat.id,
                'question_start': 81,
                'question_end': 111,
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        item.refresh_from_db()
        self.assertEqual(item.section_id, self.mat.id)

        mat_score = StudentSectionScore.objects.get(student_answer=sa, section=self.mat)
        geo_score = StudentSectionScore.objects.get(student_answer=sa, section=self.geo)
        self.assertEqual(mat_score.correct, 31)
        self.assertEqual(geo_score.correct, 9)

    def test_link_subjects_does_not_reset_custom_math_geo(self):
        from apps.coaching.olcme_degerlendirme.models import AnswerKey, AnswerKeyItem

        self.mat.question_end = 111
        self.mat.save()
        self.geo.question_start = 112
        self.geo.save()
        key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        item = AnswerKeyItem.objects.create(
            answer_key=key, section=self.geo, question_number=111, correct_answer='C',
        )
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/link_subjects/',
            {},
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.mat.refresh_from_db()
        self.geo.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual((self.mat.question_start, self.mat.question_end), (81, 111))
        self.assertEqual((self.geo.question_start, self.geo.question_end), (112, 120))
        self.assertEqual(item.section_id, self.mat.id)

    def test_cannot_consume_entire_neighbor(self):
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/update_section/',
            {
                'section_id': self.mat.id,
                'question_start': 81,
                'question_end': 120,
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)
        self.mat.refresh_from_db()
        self.assertEqual(self.mat.question_end, 110)
