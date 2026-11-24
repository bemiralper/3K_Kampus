from io import BytesIO
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from openpyxl import Workbook
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    AnswerKey, AnswerKeyItem, Exam, ExamSection, ExamSession, StudentAnswer, StudentStoredScore,
)
from apps.coaching.olcme_degerlendirme.services.exam_rescore import rescore_exam_results
from apps.coaching.olcme_degerlendirme.services.exam_templates import get_template_sections
from apps.coaching.tests.olcme_helpers import grant_olcme_write
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube


class DualDatTests(TestCase):
    def setUp(self):
        media = self.enterContext(TemporaryDirectory())
        self.enterContext(override_settings(MEDIA_ROOT=media))
        self.kurum = Kurum.objects.create(ad='Çift Optik', kod='CO')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='CO-M')
        self.exam = Exam.objects.create(kurum=self.kurum, sube=self.sube, name='LGS Deneme', exam_type='LGS')
        self.sections = [
            ExamSection.objects.create(
                exam=self.exam, name=data['name'], order=order,
                question_start=data['question_start'], question_end=data['question_end'],
            )
            for order, data in enumerate(get_template_sections('LGS'))
        ]
        self.ada = Ogrenci.objects.create(kurum=self.kurum, sube=self.sube, ad='Ada', soyad='Güneş')
        self.efe = Ogrenci.objects.create(kurum=self.kurum, sube=self.sube, ad='Efe', soyad='Yıldız')
        self.user = get_user_model().objects.create_user(username='cift-optik', password='test')
        grant_olcme_write(self.user, self.kurum)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.client.credentials(HTTP_X_KURUM_ID=str(self.kurum.pk), HTTP_X_SUBE_ID=str(self.sube.pk))
        self.base_url = f'/api/coaching/olcme-degerlendirme/exams/{self.exam.pk}/results/'
        self.upload_url = self.base_url + 'dual-dat/'
        self.settings = {
            part: {'field_mappings': self.mapping(sections), 'first_line_is_header': False}
            for part, sections in (('verbal', self.sections[:4]), ('numeric', self.sections[4:]))
        }

    @staticmethod
    def mapping(sections):
        fields = [
            {'field': 'ad_soyad', 'start': 0, 'end': 20},
            {'field': 'kitapcik_turu', 'start': 20, 'end': 21},
        ]
        column = 21
        for section in sections:
            end = column + section.question_end - section.question_start + 1
            fields.append({'field': f'ders_{section.pk}', 'start': column, 'end': end})
            column = end
        return fields

    def key(self, booklet, pattern='ABCD'):
        key = AnswerKey.objects.create(exam=self.exam, booklet=booklet, is_primary=booklet == 'A')
        AnswerKeyItem.objects.bulk_create([
            AnswerKeyItem(
                answer_key=key, section=section, question_number=number, correct_answer=pattern[(number - 1) % 4],
            )
            for section in self.sections
            for number in range(section.question_start, section.question_end + 1)
        ])
        return key

    @staticmethod
    def line(name, booklet, answers):
        return f'{name:20}{booklet}{answers}'

    @staticmethod
    def dat(name, rows):
        return SimpleUploadedFile(name, ('\r\n'.join(rows) + '\r\n').encode('cp1254'))

    def upload(self, verbal, numeric, **extra):
        response = self.client.post(self.upload_url, {
            'verbal': self.dat('sozel.dat', verbal), 'numeric': self.dat('sayisal.dat', numeric), **extra,
        }, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        session = ExamSession.objects.get(pk=response.data['session']['id'])
        return session, f'{self.upload_url}{session.pk}/'

    def preview(self, url, **extra):
        response = self.client.post(url, {'settings': self.settings, **extra}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def confirm(self, url, token):
        return self.client.post(url, {'settings': self.settings, 'preview_token': token}, format='json')

    def test_shuffled_files_save_one_full_result_per_student_and_reprocess_in_place(self):
        self.key('A')
        self.key('B', 'DCBA')
        a, b = ('ABCD' * 23)[:90], ('DCBA' * 23)[:90]
        session, url = self.upload(
            [self.line('Ada Güneş', 'A', a[:50]), self.line('Efe Yıldız', '2', b[:50])],
            [self.line('Efe Yıldız', 'B', b[50:]), self.line('Ada Güneş', 'A', a[50:])],
        )
        preview = self.preview(url)
        self.assertEqual(preview['pair_count'], 2)
        self.assertEqual(preview['unresolved_count'], 0)
        self.assertEqual([row['student_id'] for row in preview['rows']['numeric']], [self.efe.pk, self.ada.pk])
        self.assertFalse(StudentAnswer.objects.exists())
        response = self.confirm(url, preview['preview_token'])
        self.assertEqual(response.status_code, 200, response.data)
        session.refresh_from_db()
        self.assertEqual((session.total_rows, session.matched_count), (2, 2))
        self.assertTrue(session.dat_file and session.numeric_dat_file)
        answers = {result.student_id: result for result in session.student_answers.all()}
        self.assertEqual(set(answers), {self.ada.pk, self.efe.pk})
        for result in answers.values():
            self.assertEqual(result.total_correct, 90)
            self.assertEqual(result.section_scores.count(), 6)
        self.assertEqual(StudentStoredScore.objects.count(), 2)
        self.assertEqual(self.confirm(url, preview['preview_token']).status_code, 409)
        self.assertEqual(self.confirm(url, self.preview(url)['preview_token']).status_code, 200)
        self.assertEqual(session.student_answers.count(), 2)
        reopened = self.client.get(url)
        self.assertEqual(reopened.data['settings']['numeric'], self.settings['numeric'])
        results = self.client.get(f'{self.base_url}sessions/{session.pk}/results/')
        self.assertEqual(results.data['total_rows'], 2)
        legacy_parse = self.client.post(f'{self.base_url}{session.pk}/parse/', self.settings['verbal'], format='json')
        self.assertEqual(legacy_parse.status_code, 400)
        self.assertEqual(session.student_answers.count(), 2)

    def test_incomplete_duplicate_and_conflicting_rows_require_review(self):
        self.key('A')
        self.settings['numeric']['first_line_is_header'] = True
        session, url = self.upload(
            [self.line('Ada Güneş', 'A', 'A' * 50)] * 2 + [self.line('Optikte adı hatalı', ' ', 'A' * 50)],
            ['Başlık', self.line('Ada Güneş', 'B', 'A' * 40), self.line('Efe Yıldız', 'A', 'A' * 40)],
        )
        first = self.preview(url)
        self.assertEqual(first['pair_count'], 0)
        self.assertEqual(first['unresolved_count'], 5)
        self.assertIsNone(first['preview_token'])
        self.assertIn('birden fazla', first['rows']['verbal'][0]['issue'])
        self.assertIn('Diğer optikte', first['rows']['numeric'][1]['issue'])
        self.settings['overrides'] = {
            'verbal': {'2': {'excluded': True}, '3': {'student_id': self.efe.pk, 'booklet': 'A'}},
        }
        self.assertIn('kitapçık kodu farklı', self.preview(url)['rows']['numeric'][0]['issue'])
        self.settings['overrides']['numeric'] = {'2': {'booklet': 'A'}}
        result = self.confirm(url, self.preview(url)['preview_token'])
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(session.student_answers.get(student=self.efe).match_method, 'manual')
        self.assertEqual(session.student_answers.count(), 2)

    def test_mapping_validation_and_stale_answer_key(self):
        key = self.key('A')
        session, url = self.upload(
            [self.line('Ada Güneş', 'A', 'A' * 50)], [self.line('Ada Güneş', 'A', 'B' * 40)],
        )
        token = self.preview(url)['preview_token']
        key.items.filter(question_number=1).update(correct_answer='B')
        self.assertEqual(self.confirm(url, token).status_code, 409)
        self.assertFalse(session.student_answers.exists())
        self.settings['numeric']['field_mappings'][-1]['end'] -= 1
        invalid = self.client.post(url, {'settings': self.settings}, format='json')
        self.assertEqual(invalid.status_code, 400)

    def test_confirm_failure_keeps_previous_results(self):
        self.key('A')
        session, url = self.upload(
            [self.line('Ada Güneş', 'A', 'A' * 50)], [self.line('Ada Güneş', 'A', 'A' * 40)],
        )
        self.assertEqual(self.confirm(url, self.preview(url)['preview_token']).status_code, 200)
        answer = session.student_answers.get()
        token = self.preview(url)['preview_token']
        with patch(
            'apps.coaching.olcme_degerlendirme.views.dual_dat_views.refresh_exam_scores',
            side_effect=ValueError('test rollback'),
        ):
            self.assertEqual(self.confirm(url, token).status_code, 400)
        self.assertEqual(session.student_answers.get().pk, answer.pk)

    def test_an_existing_result_cannot_be_duplicated(self):
        old = ExamSession.objects.create(exam=self.exam, status='COMPLETED')
        StudentAnswer.objects.create(session=old, student=self.ada)
        session, url = self.upload(
            [self.line('Ada Güneş', 'A', 'A' * 50)], [self.line('Ada Güneş', 'A', 'A' * 40)],
        )
        preview = self.preview(url)
        self.assertIsNone(preview['preview_token'])
        self.assertIn('başka bir yüklemede', preview['rows']['verbal'][0]['issue'])
        self.assertFalse(session.student_answers.exists())

    def test_module_and_branch_permissions(self):
        other_branch = Sube.objects.create(kurum=self.kurum, ad='Diğer', kod='CO-D')
        session, url = self.upload(
            [self.line('Ada Güneş', 'A', 'A' * 50)], [self.line('Ada Güneş', 'A', 'A' * 40)],
        )
        self.client.credentials(HTTP_X_KURUM_ID=str(self.kurum.pk), HTTP_X_SUBE_ID=str(other_branch.pk))
        self.assertEqual(self.client.get(url).status_code, 403)
        self.client.credentials(HTTP_X_KURUM_ID=str(self.kurum.pk), HTTP_X_SUBE_ID=str(self.sube.pk))
        viewer = get_user_model().objects.create_user(username='no-olcme-write')
        self.client.force_authenticate(viewer)
        self.assertEqual(self.client.post(url, {'settings': self.settings}, format='json').status_code, 403)

    def test_single_dat_import_and_templates_keep_existing_scope(self):
        self.key('A', 'AAAA')
        template_url = f'/api/coaching/olcme-degerlendirme/exams/mapping-templates/'
        for part in ('', 'verbal', 'numeric'):
            saved = self.client.post(f'{template_url}create/', {
                'name': part or 'Tek DAT', 'exam_type': 'LGS', 'source_part': part,
                'mappings': self.settings['verbal']['field_mappings'],
            }, format='json')
            self.assertEqual(saved.status_code, 201, saved.data)
        for part, name in (('', 'Tek DAT'), ('verbal', 'verbal'), ('numeric', 'numeric')):
            templates = self.client.get(template_url, {'exam_type': 'LGS', 'source_part': part})
            self.assertEqual([template['name'] for template in templates.data], [name])
        response = self.client.post(self.base_url + 'upload/', {
            'dat_file': self.dat('tek.dat', [self.line('Ada Güneş', 'A', 'A' * 90)]),
        }, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        session_id = response.data['session_id']
        parsed = self.client.post(f'{self.base_url}{session_id}/parse/', {
            'field_mappings': self.mapping(self.sections),
        }, format='json')
        self.assertEqual(parsed.status_code, 200, parsed.data)
        self.assertEqual(parsed.data['results'][0]['total_correct'], 90)
        self.assertFalse(parsed.data['session']['is_dual_dat'])

    def test_c_and_d_answer_keys_score_without_excel(self):
        self.key('C')
        self.key('D')
        pattern = ('ABCD' * 23)[:90]
        session, url = self.upload(
            [self.line('Ada Güneş', 'C', pattern[:50]), self.line('Efe Yıldız', 'D', pattern[:50])],
            [self.line('Ada Güneş', 'C', pattern[50:]), self.line('Efe Yıldız', 'D', pattern[50:])],
        )
        preview = self.preview(url)
        self.assertEqual(preview['pair_count'], 2, preview)
        self.assertEqual(preview['unresolved_count'], 0)
        self.assertIsNone(preview['scoring_error'])
        self.assertEqual(self.confirm(url, preview['preview_token']).status_code, 200)
        self.assertEqual(list(session.student_answers.order_by('booklet').values_list('booklet', 'total_correct')), [
            ('C', 90), ('D', 90),
        ])
        rescore_exam_results(self.exam)
        self.assertEqual(list(session.student_answers.values_list('total_correct', flat=True)), [90, 90])
        AnswerKeyItem.objects.filter(answer_key__booklet='C', question_number=12).delete()
        incomplete = self.preview(url)
        self.assertIsNone(incomplete['preview_token'])
        self.assertIn('C kitapçığında 12. soru anahtarı eksik.', incomplete['scoring_error'])

    def test_booklets_c_and_d_are_scored_in_canonical_question_order(self):
        key = self.key('A')
        wb = Workbook()
        sheet = wb.active
        pattern = 'ABCD' * 23
        printed_answers = []
        for section in reversed(self.sections):
            width = section.question_end - section.question_start + 1
            sheet.append([section.name])
            sheet.append(['Soru No', 'Cevap', 'B Karşılığı', 'C Karşılığı', 'D Karşılığı', 'İPTAL'])
            for number in range(1, width + 1):
                sheet.append([number, pattern[section.question_start + number - 2], number, str(width + 1 - number), number])
        for section in self.sections:
            printed_answers.append(pattern[section.question_start - 1:section.question_end][::-1])
        buffer = BytesIO()
        wb.save(buffer)
        printed = ''.join(printed_answers)
        verbal = [self.line('Ada Güneş', 'C', printed[:50]), self.line('Efe Yıldız', 'D', pattern[:50])]
        numeric = [self.line('Ada Güneş', 'C', printed[50:]), self.line('Efe Yıldız', 'D', pattern[50:90])]
        _, missing_url = self.upload(verbal, numeric)
        self.assertIn('Excel', self.preview(missing_url)['rows']['verbal'][0]['issue'])
        session, url = self.upload(
            verbal, numeric, booklet_reference=SimpleUploadedFile('anahtar.xlsx', buffer.getvalue()),
        )
        key.items.filter(question_number=1).update(correct_answer='B')
        mismatch = self.preview(url)
        self.assertIsNone(mismatch['preview_token'])
        self.assertIn('uyuşmuyor', mismatch['scoring_error'])
        key.items.filter(question_number=1).update(correct_answer='A')
        confirmed = self.confirm(url, self.preview(url)['preview_token'])
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        results = session.student_answers.order_by('booklet')
        self.assertEqual(
            [(result.booklet, result.total_correct, result.answers['1']) for result in results],
            [('C', 90, 'A'), ('D', 90, 'A')],
        )
        rescore_exam_results(self.exam)
        self.assertEqual(list(session.student_answers.values_list('total_correct', flat=True)), [90, 90])

    def layout(self, sections, identity):
        fields, column = [], 0
        for field, width in [*identity, ('kitapcik_turu', 1)]:
            fields.append({'field': field, 'start': column, 'end': column + width})
            column += width
        for section in sections:
            end = column + section.question_end - section.question_start + 1
            fields.append({'field': f'ders_{section.pk}', 'start': column, 'end': end})
            column = end
        return fields

    def student(self, name, **extra):
        first, last = name.rsplit(' ', 1)
        return Ogrenci.objects.create(kurum=self.kurum, sube=extra.pop('sube', self.sube), ad=first, soyad=last, **extra)

    def test_tc_on_verbal_and_differently_written_name_on_numeric(self):
        self.key('A')
        self.ada.tc_kimlik_no = '12345678901'
        self.ada.save(update_fields=['tc_kimlik_no'])
        self.settings['verbal']['field_mappings'] = self.layout(
            self.sections[:4], [('ad_soyad', 20), ('tc_kimlik', 11)],
        )
        session, url = self.upload(
            [f'{"Optikte yanlış ad":20}12345678901A{"A" * 50}', f'{"Efe Yildiz":20}{" " * 11}A{"A" * 50}'],
            [self.line('ADA GÜNEŞ', 'A', 'A' * 40), self.line('EFE YILDIZ', 'A', 'A' * 40)],
        )
        preview = self.preview(url)
        self.assertEqual(preview['pair_count'], 2, preview['rows'])
        self.assertEqual(preview['unresolved_count'], 0)
        self.assertEqual(self.confirm(url, preview['preview_token']).status_code, 200)
        self.assertEqual(set(session.student_answers.values_list('student_id', flat=True)), {self.ada.pk, self.efe.pk})

    def test_manual_match_on_one_file_links_same_name_on_other_file(self):
        self.key('A')
        session, url = self.upload(
            [self.line('Optik Hatalı', 'A', 'A' * 50)], [self.line('Optik Hatalı', 'A', 'A' * 40)],
        )
        first = self.preview(url)
        self.assertEqual((first['pair_count'], first['unresolved_count']), (1, 0))
        self.assertTrue(all(row['unregistered'] and row['student_id'] is None for part in ('verbal', 'numeric') for row in first['rows'][part]))
        self.settings['overrides'] = {'verbal': {'1': {'student_id': self.ada.pk}}}
        preview = self.preview(url)
        self.assertEqual(preview['pair_count'], 1)
        self.assertEqual(preview['rows']['numeric'][0]['student_id'], self.ada.pk)
        self.assertEqual(self.confirm(url, preview['preview_token']).status_code, 200)
        self.assertEqual(session.student_answers.get().match_method, 'manual')

    def test_excluding_both_rows_lets_remaining_students_save(self):
        self.key('A')
        session, url = self.upload(
            [self.line('Ada Güneş', 'A', 'A' * 50), self.line('Misafir Öğrenci', 'A', 'A' * 50)],
            [self.line('Misafir Öğrenci', 'A', 'A' * 40), self.line('Ada Güneş', 'A', 'A' * 40)],
        )
        ready = self.preview(url)
        self.assertEqual((ready['pair_count'], ready['unresolved_count']), (2, 0))
        self.assertTrue(ready['rows']['verbal'][1]['unregistered'])
        self.settings['overrides'] = {'verbal': {'2': {'excluded': True}}}
        one_side = self.preview(url)
        self.assertIsNone(one_side['preview_token'])
        self.assertEqual(one_side['rows']['numeric'][0]['issue'], 'Öğrenci doğrulanamadı.')
        self.settings['overrides']['numeric'] = {'1': {'excluded': True}}
        preview = self.preview(url)
        self.assertEqual((preview['pair_count'], preview['unresolved_count']), (1, 0))
        self.assertEqual(self.confirm(url, preview['preview_token']).status_code, 200)
        self.assertEqual(list(session.student_answers.values_list('student_id', flat=True)), [self.ada.pk])

    def test_unregistered_student_with_both_optics_is_listed(self):
        self.key('A')
        answers = ('ABCD' * 23)[:90]
        session, url = self.upload(
            [self.line('Ada Güneş', 'A', answers[:50]), self.line('Yusuf Ali Elgaz', 'A', answers[:50])],
            [self.line('Yusuf Ali Elgaz', 'A', answers[50:]), self.line('Ada Güneş', 'A', answers[50:])],
        )
        preview = self.preview(url)
        self.assertEqual((preview['pair_count'], preview['unresolved_count']), (2, 0))
        self.assertEqual(self.confirm(url, preview['preview_token']).status_code, 200)
        guest = session.student_answers.get(student__isnull=True)
        self.assertEqual(guest.raw_student_name.strip(), 'Yusuf Ali Elgaz')
        self.assertEqual(guest.total_correct, 90)
        rescore_exam_results(self.exam)
        self.assertEqual(session.student_answers.get(student__isnull=True).total_correct, 90)
        rankings = self.client.get(
            f'/api/coaching/olcme-degerlendirme/exams/{self.exam.pk}/analysis/rankings/',
        )
        self.assertEqual(rankings.status_code, 200, rankings.data)
        names = {row['student_name'].strip() for row in rankings.data['rankings']}
        self.assertIn('Yusuf Ali Elgaz', names)
        self.assertIn('Ada Güneş', names)

    def test_unregistered_pair_with_conflicting_tc_or_number_stays_unresolved(self):
        self.key('A')
        self.settings['verbal']['field_mappings'] = self.layout(
            self.sections[:4], [('ad_soyad', 20), ('tc_kimlik', 11), ('ogrenci_no', 5)],
        )
        self.settings['numeric']['field_mappings'] = self.layout(
            self.sections[4:], [('ad_soyad', 20), ('tc_kimlik', 11), ('ogrenci_no', 5)],
        )
        session, url = self.upload(
            [f'{"Yusuf Ali Elgaz":20}12345678901{"00012"}A{"A" * 50}'],
            [f'{"Yusuf Ali Elgaz":20}12345678902{"00013"}A{"A" * 40}'],
        )
        preview = self.preview(url)
        self.assertEqual((preview['pair_count'], preview['unresolved_count']), (0, 2))
        self.assertEqual(preview['rows']['verbal'][0]['issue'], 'TC veya öğrenci no iki optikte farklı.')
        self.assertEqual(preview['rows']['numeric'][0]['issue'], 'TC veya öğrenci no iki optikte farklı.')
        self.assertIsNone(preview['preview_token'])
        self.assertFalse(session.student_answers.exists())

    def test_other_branch_and_inactive_students_are_not_candidates(self):
        self.key('A')
        other = self.student('Can Demir', sube=Sube.objects.create(kurum=self.kurum, ad='Diğer', kod='CO-X'))
        inactive = self.student('Deniz Ak', aktif_mi=False)
        _, url = self.upload(
            [self.line('Can Demir', 'A', 'A' * 50), self.line('Deniz Ak', 'A', 'A' * 50)],
            [self.line('Can Demir', 'A', 'A' * 40), self.line('Deniz Ak', 'A', 'A' * 40)],
        )
        preview = self.preview(url)
        self.assertEqual((preview['pair_count'], preview['unresolved_count']), (2, 0))
        self.assertTrue(all(row['unregistered'] and row['student_id'] is None for row in preview['rows']['verbal']))
        self.assertEqual({student['id'] for student in preview['students']}, {self.ada.pk, self.efe.pk})
        for student in (other, inactive):
            self.settings['overrides'] = {'verbal': {'1': {'student_id': student.pk}}}
            response = self.client.post(url, {'settings': self.settings}, format='json')
            self.assertEqual(response.status_code, 400)

    def test_participant_list_does_not_hide_branch_students(self):
        from apps.coaching.olcme_degerlendirme.models import ExamParticipant
        self.key('A')
        ExamParticipant.objects.create(exam=self.exam, student=self.ada)
        _, url = self.upload(
            [self.line('Ada Güneş', 'A', 'A' * 50), self.line('Efe Yıldız', 'A', 'A' * 50)],
            [self.line('Ada Güneş', 'A', 'A' * 40), self.line('Efe Yıldız', 'A', 'A' * 40)],
        )
        self.assertEqual(self.preview(url)['pair_count'], 2)

    def test_mixed_a_b_c_d_booklets_with_numeric_codes(self):
        patterns = {'A': 'ABCD', 'B': 'DCBA', 'C': 'BADC', 'D': 'CDAB'}
        for booklet, pattern in patterns.items():
            self.key(booklet, pattern)
        cem, dila = self.student('Cem Kaya'), self.student('Dila Er')
        people = [(self.ada, 'A', '1'), (self.efe, 'B', 'B'), (cem, 'C', '3'), (dila, 'D', '4')]
        full = {booklet: (pattern * 23)[:90] for booklet, pattern in patterns.items()}
        session, url = self.upload(
            [self.line(f'{s.ad} {s.soyad}', code, full[booklet][:50]) for s, booklet, code in people],
            [self.line(f'{s.ad} {s.soyad}', booklet, full[booklet][50:]) for s, booklet, _ in people],
        )
        preview = self.preview(url)
        self.assertEqual((preview['pair_count'], preview['unresolved_count']), (4, 0), preview['rows'])
        self.assertIsNone(preview['scoring_error'])
        self.assertEqual(self.confirm(url, preview['preview_token']).status_code, 200)
        expected = {s.pk: (booklet, 90) for s, booklet, _ in people}
        actual = {row[0]: row[1:] for row in session.student_answers.values_list('student_id', 'booklet', 'total_correct')}
        self.assertEqual(actual, expected)
        rescore_exam_results(self.exam)
        self.assertEqual(set(session.student_answers.values_list('total_correct', flat=True)), {90})

    def test_same_named_students_need_manual_choice(self):
        self.key('A')
        first, second = self.student('Ali Kaya'), self.student('Ali Kaya')
        session, url = self.upload(
            [self.line('Ali Kaya', 'A', 'A' * 50)], [self.line('Ali Kaya', 'A', 'A' * 40)],
        )
        preview = self.preview(url)
        self.assertEqual(preview['pair_count'], 0)
        self.assertIsNone(preview['rows']['verbal'][0]['student_id'])
        self.settings['overrides'] = {'numeric': {'1': {'student_id': second.pk}}}
        preview = self.preview(url)
        self.assertEqual(preview['pair_count'], 1)
        self.assertEqual(self.confirm(url, preview['preview_token']).status_code, 200)
        self.assertEqual(session.student_answers.get().student_id, second.pk)
        self.assertNotEqual(first.pk, second.pk)

    def test_short_line_is_reported(self):
        self.key('A')
        _, url = self.upload([self.line('Ada Güneş', 'A', 'A' * 30)], [self.line('Ada Güneş', 'A', 'A' * 40)])
        response = self.client.post(url, {'settings': self.settings}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('kısa', response.data['error'])

    def test_single_dat_c_booklet_keeps_a_key_scoring(self):
        self.key('A')
        self.key('C', 'DCBA')
        response = self.client.post(self.base_url + 'upload/', {
            'dat_file': self.dat('tek.dat', [self.line('Ada Güneş', 'C', ('ABCD' * 23)[:90])]),
        }, format='multipart')
        session_id = response.data['session_id']
        parsed = self.client.post(f'{self.base_url}{session_id}/parse/', {
            'field_mappings': self.mapping(self.sections),
        }, format='json')
        self.assertEqual(parsed.status_code, 200, parsed.data)
        before = parsed.data['results'][0]['total_correct']
        rescore_exam_results(self.exam)
        self.assertEqual(StudentAnswer.objects.get(session_id=session_id).total_correct, before)

    def test_gapped_inkilap_and_din_columns_are_read_as_mapped(self):
        key = self.key('A', 'AAAA')
        key.items.filter(question_number__gte=21, question_number__lte=30).update(correct_answer='C')
        key.items.filter(question_number__gte=31, question_number__lte=40).update(correct_answer='B')
        verbal = self.sections[:4]
        inkilap, din = verbal[1], verbal[2]
        self.settings['verbal']['field_mappings'] = [
            {'field': 'ad_soyad', 'start': 0, 'end': 20},
            {'field': 'kitapcik_turu', 'start': 20, 'end': 21},
            {'field': f'ders_{verbal[0].pk}', 'start': 21, 'end': 41},
            {'field': f'ders_{inkilap.pk}', 'start': 41, 'end': 51},
            {'field': f'ders_{din.pk}', 'start': 61, 'end': 71},
            {'field': f'ders_{verbal[3].pk}', 'start': 81, 'end': 91},
        ]
        line = f'{"Ada Güneş":20}A{"A" * 20}{"C" * 10}{" " * 10}{"B" * 10}{" " * 10}{"A" * 10}'
        session, url = self.upload([line], [self.line('Ada Güneş', 'A', 'A' * 40)])
        confirmed = self.confirm(url, self.preview(url)['preview_token'])
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        scores = {
            score.section_id: score.correct
            for score in session.student_answers.get().section_scores.all()
        }
        self.assertEqual((scores[inkilap.pk], scores[din.pk]), (10, 10))
        session.refresh_from_db()
        saved = session.dual_dat_settings['verbal']['field_mappings']
        by_field = {item['field']: item for item in saved}
        self.assertEqual((by_field[f'ders_{inkilap.pk}']['start'], by_field[f'ders_{din.pk}']['start']), (41, 61))
