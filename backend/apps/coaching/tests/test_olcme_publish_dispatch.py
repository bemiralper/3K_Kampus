"""Sınav karne / cevap anahtarı zamanlı gönderim senaryoları."""
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import quote

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.application.olcme_publish import (
    KIND_ANSWER_KEY,
    KIND_KARNE,
    ST_OVERDUE,
    ST_PENDING,
    ST_SENT,
    exam_is_graded,
    process_due,
    send_now,
    sync_dispatches_from_exam,
)
from apps.coaching.olcme_degerlendirme.models import (
    AnswerKey,
    AnswerKeyItem,
    Exam,
    ExamParticipant,
    ExamScheduledDispatch,
    ExamSection,
    ExamSession,
    StudentAnswer,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli
from apps.sube.domain.models import Sube
from apps.coaching.tests.olcme_helpers import grant_olcme_write

User = get_user_model()
EXAMS_URL = '/api/coaching/olcme-degerlendirme/exams/'


class OlcmePublishDispatchTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Yayın Kurum', kod='YAYN')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='YAYN-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='yayin', password='test')
        grant_olcme_write(self.user, self.kurum)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.yil.id),
        }
        self.exam = Exam.objects.create(
            name='Yayın Sınav',
            exam_type='YKS_TYT',
            status=Exam.Status.DRAFT,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
        )
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Türkçe', order=1, question_start=1, question_end=5,
        )
        self.present = self._ogr('Ada', 'Geldi', '05321110001', '05321110002')
        self.absent = self._ogr('Efe', 'Gelmedi', '05321110003', '05321110004')
        ExamParticipant.objects.create(
            exam=self.exam, student=self.present, attendance=ExamParticipant.Attendance.PRESENT,
        )
        ExamParticipant.objects.create(
            exam=self.exam, student=self.absent, attendance=ExamParticipant.Attendance.ABSENT,
        )

    def _ogr(self, ad, soyad, tel, veli_tel):
        o = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad=ad, soyad=soyad, telefon=tel,
        )
        OgrenciKayit.objects.create(
            ogrenci=o, egitim_yili=self.yil, kurum=self.kurum, sube=self.sube, aktif_mi=True,
        )
        OgrenciVeli.objects.create(
            ogrenci=o, veli_turu='anne', ad=f'{ad}anne', soyad=soyad,
            telefon=veli_tel, sms_bildirimleri=['duyuru'],
        )
        return o

    def _due(self, minutes=-5):
        return timezone.now() + timedelta(minutes=minutes)

    def _enable(self, kind=KIND_KARNE):
        ExamScheduledDispatch.objects.filter(exam=self.exam, kind=kind).update(is_enabled=True)

    def _make_answer_key(self):
        key = AnswerKey.objects.create(exam=self.exam, booklet='', is_primary=True)
        AnswerKeyItem.objects.create(
            answer_key=key, section=self.section, question_number=1, correct_answer='A',
        )
        return key

    def _grade(self):
        session = ExamSession.objects.create(
            exam=self.exam, status=ExamSession.Status.COMPLETED, original_filename='x.dat',
        )
        return StudentAnswer.objects.create(
            session=session, student=self.present, raw_student_id='1',
        )

    def test_exam_is_graded_by_status_or_answer(self):
        self.assertFalse(exam_is_graded(self.exam))
        self.exam.status = Exam.Status.RESULTS_UPLOADED
        self.exam.save(update_fields=['status'])
        self.assertTrue(exam_is_graded(self.exam))
        self.exam.status = Exam.Status.DRAFT
        self.exam.save(update_fields=['status'])
        self._grade()
        self.assertTrue(exam_is_graded(self.exam))

    def test_sync_creates_pending_and_process_overdue_unread(self):
        self.exam.result_publish_date = self._due(-10)
        self.exam.save(update_fields=['result_publish_date'])
        sync_dispatches_from_exam(self.exam)
        self._enable()
        result = process_due(exam_id=self.exam.id)
        self.assertEqual(result['overdue'], 1)
        row = ExamScheduledDispatch.objects.get(exam=self.exam, kind=KIND_KARNE)
        self.assertEqual(row.status, ST_OVERDUE)

    def test_later_grade_does_not_auto_send_overdue(self):
        self.exam.result_publish_date = self._due(-10)
        self.exam.save(update_fields=['result_publish_date'])
        sync_dispatches_from_exam(self.exam)
        self._enable()
        process_due(exam_id=self.exam.id)
        self._grade()
        with patch('apps.coaching.application.olcme_publish._send_karnes') as send:
            again = process_due(exam_id=self.exam.id)
            send.assert_not_called()
        self.assertEqual(again['processed'], 0)
        row = ExamScheduledDispatch.objects.get(exam=self.exam, kind=KIND_KARNE)
        self.assertEqual(row.status, ST_OVERDUE)

    def test_exam_save_does_not_reset_overdue_same_date(self):
        when = self._due(-10)
        self.exam.result_publish_date = when
        self.exam.save(update_fields=['result_publish_date'])
        sync_dispatches_from_exam(self.exam)
        self._enable()
        process_due(exam_id=self.exam.id)
        self.exam.name = 'Yayın Sınav 2'
        self.exam.save(update_fields=['name'])
        sync_dispatches_from_exam(self.exam)
        row = ExamScheduledDispatch.objects.get(exam=self.exam, kind=KIND_KARNE)
        self.assertEqual(row.status, ST_OVERDUE)

    def test_send_now_sends_and_is_idempotent(self):
        self._grade()
        with patch(
            'apps.coaching.application.olcme_publish._send_karnes',
            return_value={'sent': 2, 'skipped': 0, 'errors': []},
        ):
            first = send_now(self.exam, KIND_KARNE, sent_by_user_id=self.user.id)
            second = send_now(self.exam, KIND_KARNE, sent_by_user_id=self.user.id)
        self.assertTrue(first['ok'])
        self.assertEqual(first['status'], ST_SENT)
        self.assertTrue(second.get('already'))
        self.assertEqual(ExamScheduledDispatch.objects.get(exam=self.exam, kind=KIND_KARNE).sent_count, 2)

    def test_reschedule_resets_overdue_to_pending(self):
        self.exam.result_publish_date = self._due(-10)
        self.exam.save(update_fields=['result_publish_date'])
        sync_dispatches_from_exam(self.exam)
        self._enable()
        process_due(exam_id=self.exam.id)
        later = timezone.now() + timedelta(days=1)
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/publish-dispatch/reschedule/',
            {'kind': 'karne', 'scheduled_at': later.isoformat()},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.assertEqual(res.json()['karne']['status'], ST_PENDING)
        self.exam.refresh_from_db()
        self.assertIsNotNone(self.exam.result_publish_date)

    def test_changing_publish_date_does_not_call_sinav_sonuc(self):
        when = timezone.now() + timedelta(hours=2)
        with patch('apps.communication.application.integration_hooks.notify_exam_result') as hook:
            res = self.client.patch(
                f'{EXAMS_URL}{self.exam.id}/',
                {'result_publish_date': when.isoformat()},
                format='json', **self.headers,
            )
        self.assertEqual(res.status_code, 200, res.content[:400])
        hook.assert_not_called()
        row = ExamScheduledDispatch.objects.get(exam=self.exam, kind=KIND_KARNE)
        self.assertEqual(row.status, ST_PENDING)

    def test_process_due_sends_ready_karne(self):
        self._grade()
        self.exam.result_publish_date = self._due(-1)
        self.exam.save(update_fields=['result_publish_date'])
        sync_dispatches_from_exam(self.exam)
        self._enable()
        with patch(
            'apps.coaching.application.olcme_publish._send_karnes',
            return_value={'sent': 1, 'skipped': 0, 'errors': []},
        ) as send:
            result = process_due(exam_id=self.exam.id)
        send.assert_called_once()
        self.assertEqual(result['sent'], 1)
        self.assertEqual(
            ExamScheduledDispatch.objects.get(exam=self.exam, kind=KIND_KARNE).status,
            ST_SENT,
        )

    def test_answer_key_only_present_students(self):
        self._make_answer_key()
        from apps.coaching.application.olcme_cevap_anahtari_notify import send_answer_key_notify

        class Ok:
            success = True

        with patch(
            'apps.coaching.application.olcme_cevap_anahtari_notify.dispatch_event',
            return_value=Ok(),
        ) as dispatch:
            result = send_answer_key_notify(self.exam, b'%PDF-1.4 test', 'ca.pdf')
        student_ids = {
            call.kwargs['source'].ref_id.split(':')[2]
            for call in dispatch.call_args_list
        }
        self.assertIn(str(self.present.id), student_ids)
        self.assertNotIn(str(self.absent.id), student_ids)
        self.assertGreaterEqual(result['sent'], 1)

    def test_answer_key_pdf_generate_and_upload(self):
        self._make_answer_key()
        res = self.client.get(
            f'{EXAMS_URL}{self.exam.id}/answer-key-pdf/?download=1&source=generated',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:200])
        self.assertTrue(res.content.startswith(b'%PDF'))
        self.assertIn(quote('Yayın_Sınav.pdf'), res['Content-Disposition'])
        upload = SimpleUploadedFile('anahtar.pdf', b'%PDF-1.4 uploaded', content_type='application/pdf')
        post = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/answer-key-pdf/',
            {'file': upload},
            **self.headers,
        )
        self.assertEqual(post.status_code, 200, post.content[:300])
        meta = self.client.get(f'{EXAMS_URL}{self.exam.id}/answer-key-pdf/', **self.headers)
        self.assertTrue(meta.json()['has_uploaded'])

    def test_publish_status_endpoint(self):
        self.exam.answer_key_publish_date = self._due(30)
        self.exam.save(update_fields=['answer_key_publish_date'])
        res = self.client.get(
            f'{EXAMS_URL}{self.exam.id}/publish-dispatch/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.assertEqual(res.json()['answer_key']['status'], ST_PENDING)
        self.assertFalse(res.json()['answer_key']['is_enabled'])
        self.assertFalse(res.json()['graded'])
        self.assertEqual(res.json()['karne_students'], 0)
        self.assertEqual(res.json()['answer_key_students'], 1)

    def test_due_karne_goes_to_present_student_and_veli_only(self):
        present_answer = self._grade()
        StudentAnswer.objects.create(
            session=present_answer.session, student=self.absent, raw_student_id='2',
        )
        self.exam.result_publish_date = self._due(-1)
        self.exam.save(update_fields=['result_publish_date'])
        sync_dispatches_from_exam(self.exam)
        self._enable()
        with patch(
            'apps.coaching.olcme_degerlendirme.views.analysis_views.build_student_detail_payload',
            return_value={'student_name': 'Ada Geldi', 'exam_name': 'Yayın Sınav'},
        ), patch(
            'apps.coaching.application.olcme_karne_pdf.render_karne_pdf',
            return_value=b'%PDF-1.4',
        ), patch(
            'apps.coaching.application.olcme_karne_notify.send_karne_notify_bulk',
            return_value={'sent': 2, 'skipped': 0, 'errors': [], 'message_ids': []},
        ) as send:
            result = process_due(exam_id=self.exam.id)
        self.assertEqual(result['sent'], 1)
        send.assert_called_once()
        items = send.call_args.kwargs['items']
        self.assertEqual([item['answer_id'] for item in items], [present_answer.id])
        self.assertTrue(send.call_args.kwargs['include_veli'])
        self.assertTrue(send.call_args.kwargs['include_student'])

    def test_disabled_schedule_is_not_processed(self):
        self._grade()
        self.exam.result_publish_date = self._due(-1)
        self.exam.save(update_fields=['result_publish_date'])
        sync_dispatches_from_exam(self.exam)
        with patch('apps.coaching.application.olcme_publish._send_karnes') as send:
            result = process_due(exam_id=self.exam.id)
        send.assert_not_called()
        self.assertEqual(result['processed'], 0)
        row = ExamScheduledDispatch.objects.get(exam=self.exam, kind=KIND_KARNE)
        self.assertFalse(row.is_enabled)

    def test_enable_requires_datetime(self):
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/publish-dispatch/reschedule/',
            {'kind': 'karne', 'is_enabled': True},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 400)

    def test_preview_and_filtered_send_creates_campaign(self):
        answer = self._grade()
        preview = self.client.get(
            f'{EXAMS_URL}{self.exam.id}/publish-dispatch/preview/?kind=karne',
            **self.headers,
        )
        self.assertEqual(preview.status_code, 200, preview.content[:400])
        self.assertEqual(len(preview.json()['students']), 1)
        with patch(
            'apps.coaching.application.olcme_publish._send_karnes',
            return_value={'sent': 1, 'skipped': 0, 'errors': [], 'message_ids': []},
        ) as send:
            res = self.client.post(
                f'{EXAMS_URL}{self.exam.id}/publish-dispatch/send-now/',
                {
                    'kind': 'karne',
                    'include_veli': True,
                    'include_student': False,
                    'answer_ids': [answer.id],
                    'veli_ids': [],
                },
                format='json', **self.headers,
            )
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.assertTrue(res.json()['ok'])
        self.assertIsNotNone(res.json().get('campaign_id'))
        send.assert_called_once()
        self.assertEqual(send.call_args.kwargs.get('answer_ids'), [answer.id])
        self.assertFalse(send.call_args.kwargs.get('include_student'))

    def test_bulk_notify_cancels_enabled_schedule(self):
        answer = self._grade()
        self.exam.result_publish_date = self._due(90)
        self.exam.save(update_fields=['result_publish_date'])
        sync_dispatches_from_exam(self.exam)
        self._enable()
        preview = self.client.get(
            f'{EXAMS_URL}{self.exam.id}/analysis/students/notify-bulk-preview/'
            f'?answer_ids={answer.id}',
            **self.headers,
        )
        self.assertEqual(preview.status_code, 200, preview.content[:400])
        self.assertTrue(preview.json()['data'].get('scheduled_warning'))
        with patch(
            'apps.coaching.olcme_degerlendirme.views.karne_views.build_student_detail_payload',
            return_value={'student_name': 'Ada Geldi', 'exam_name': self.exam.name},
        ), patch(
            'apps.coaching.olcme_degerlendirme.views.karne_views.render_karne_pdf',
            return_value=b'%PDF-1.4 x',
        ), patch(
            'apps.coaching.olcme_degerlendirme.views.karne_views.karne_filename',
            return_value='karne.pdf',
        ), patch(
            'apps.coaching.olcme_degerlendirme.views.karne_views.send_karne_notify_bulk',
            return_value={'sent': 1, 'skipped': 0, 'errors': [], 'message_ids': []},
        ):
            res = self.client.post(
                f'{EXAMS_URL}{self.exam.id}/analysis/students/notify-bulk/',
                {'answer_ids': [answer.id], 'include_veli': True, 'include_student': True},
                format='json', **self.headers,
            )
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.assertTrue(res.json()['data'].get('schedule_cancelled'))
        self.assertIsNotNone(res.json()['data'].get('campaign_id'))
        row = ExamScheduledDispatch.objects.get(exam=self.exam, kind=KIND_KARNE)
        self.assertFalse(row.is_enabled)
        self.assertEqual(row.status, ExamScheduledDispatch.Status.CANCELLED)
        self.assertEqual(str(row.campaign_id), res.json()['data']['campaign_id'])

    def test_bulk_queue_runs_in_background_and_ignores_attendance(self):
        """Pencere kapansa da cron üretip gönderir; seçim yoklamadan bağımsız."""
        session = ExamSession.objects.create(
            exam=self.exam, status=ExamSession.Status.COMPLETED, original_filename='x.dat',
        )
        # Yoklamada "gelmedi" işaretli öğrenci — kullanıcı seçtiyse gönderilir.
        answer = StudentAnswer.objects.create(
            session=session, student=self.absent, raw_student_id='2',
        )
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/analysis/students/notify-bulk-queue/',
            {
                'answer_ids': [answer.id],
                'include_veli': True,
                'include_student': False,
                'expected_recipients': 1,
            },
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        data = res.json()['data']
        self.assertEqual(data['queued'], 1)
        campaign_id = data['campaign_id']
        self.assertTrue(campaign_id)

        row = ExamScheduledDispatch.objects.get(exam=self.exam, kind=KIND_KARNE)
        self.assertTrue(row.is_enabled)
        self.assertEqual(row.send_options['answer_ids'], [answer.id])
        self.assertFalse(row.send_options['include_student'])

        with patch(
            'apps.coaching.application.olcme_karne_pdf.render_karne_pdf',
            return_value=b'%PDF-1.4 x',
        ), patch(
            'apps.coaching.application.olcme_karne_notify.dispatch_event',
        ) as dispatch:
            dispatch.return_value = type(
                'R', (), {'success': True, 'errors': [], 'message_status': 'QUEUED', 'message_id': None},
            )()
            summary = process_due()

        self.assertEqual(summary['sent'], 1, summary)
        row.refresh_from_db()
        self.assertEqual(row.status, ST_SENT)
        self.assertEqual(row.sent_count, 1)
        self.assertEqual(row.send_options.get('students_done'), 1)
        self.assertEqual(str(row.campaign_id), campaign_id)
        # Yalnızca veli seçilmişti; öğrenciye gitmemeli.
        self.assertEqual(dispatch.call_count, 1)

    def test_bulk_queue_rejected_while_job_running(self):
        """Cron işi çalışırken ikinci gönderim seçimi ezip paralel iş açmamalı."""
        session = ExamSession.objects.create(
            exam=self.exam, status=ExamSession.Status.COMPLETED, original_filename='x.dat',
        )
        first = StudentAnswer.objects.create(session=session, student=self.absent, raw_student_id='2')
        second = StudentAnswer.objects.create(session=session, student=None, raw_student_id='3')
        url = f'{EXAMS_URL}{self.exam.id}/analysis/students/notify-bulk-queue/'
        res = self.client.post(url, {'answer_ids': [first.id]}, format='json', **self.headers)
        self.assertEqual(res.status_code, 200, res.content[:400])
        campaign_id = res.json()['data']['campaign_id']

        row = ExamScheduledDispatch.objects.get(exam=self.exam, kind=KIND_KARNE)
        opts = dict(row.send_options)
        opts['running_since'] = timezone.now().isoformat()
        row.send_options = opts
        row.is_enabled = False
        row.save(update_fields=['send_options', 'is_enabled', 'updated_at'])

        res = self.client.post(url, {'answer_ids': [second.id]}, format='json', **self.headers)
        self.assertEqual(res.status_code, 200, res.content[:400])
        data = res.json()['data']
        self.assertTrue(data['already'])
        self.assertEqual(data['queued'], 0)
        self.assertEqual(data['campaign_id'], campaign_id)

        row.refresh_from_db()
        self.assertFalse(row.is_enabled)
        self.assertEqual(row.send_options['answer_ids'], [first.id])

    def test_send_now_api_requires_ready_answer_key(self):
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/publish-dispatch/send-now/',
            {'kind': 'answer_key'},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], ST_OVERDUE)
        self.assertFalse(res.json()['ok'])

    def _save_recipients(self, kind, options):
        return self.client.post(
            f'{EXAMS_URL}{self.exam.id}/publish-dispatch/reschedule/',
            {'kind': kind, 'scheduled_at': self._due(-1).isoformat(),
             'is_enabled': True, 'recipient_options': options},
            format='json', **self.headers,
        )

    def test_schedule_recipient_preferences_survive_reload_and_cron(self):
        self._grade()
        options = {'include_veli': True, 'include_student': False,
                   'excluded_student_ids': [self.present.id],
                   'excluded_veli_ids': [OgrenciVeli.objects.get(ogrenci=self.present).id]}
        res = self._save_recipients(KIND_KARNE, options)
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.assertEqual(res.json()['karne']['recipient_options'], options)
        status = self.client.get(f'{EXAMS_URL}{self.exam.id}/publish-dispatch/', **self.headers)
        self.assertEqual(status.json()['karne']['recipient_options'], options)
        self.assertTrue(status.json()['answer_key']['recipient_options']['include_student'])
        with patch('apps.coaching.application.olcme_publish._send_karnes',
                   return_value={'sent': 1, 'skipped': 0, 'errors': []}) as send:
            process_due(exam_id=self.exam.id)
        self.assertFalse(send.call_args.kwargs['include_student'])
        self.assertTrue(send.call_args.kwargs['include_veli'])
        self.assertEqual(send.call_args.kwargs['excluded_veli_ids'], options['excluded_veli_ids'])
        self.assertEqual(send.call_args.kwargs['excluded_student_ids'], [self.present.id])
        row = ExamScheduledDispatch.objects.get(exam=self.exam, kind=KIND_KARNE)
        self.assertEqual(row.send_options['recipient_options'], options)

    def test_invalid_recipient_options_do_not_change_schedule(self):
        for options in [
            {'include_veli': False, 'include_student': False},
            {'excluded_student_ids': ['invalid']},
            {'excluded_veli_ids': [-1]},
            {'include_student': 'invalid'},
        ]:
            with self.subTest(options=options):
                res = self._save_recipients(KIND_KARNE, options)
                self.assertEqual(res.status_code, 400)
        self.exam.refresh_from_db()
        self.assertIsNone(self.exam.result_publish_date)

    def test_date_only_edit_preserves_recipients(self):
        from apps.coaching.application.olcme_publish import set_schedule
        options = {'include_veli': False, 'include_student': True,
                   'excluded_student_ids': [self.present.id], 'excluded_veli_ids': []}
        self._save_recipients(KIND_KARNE, options)
        row = set_schedule(self.exam, KIND_KARNE, is_enabled=False, scheduled_at=self._due(60))
        self.assertEqual(row.send_options['recipient_options'], options)

    def test_running_schedule_cannot_be_overwritten(self):
        self._save_recipients(KIND_KARNE, {'include_student': True})
        row = ExamScheduledDispatch.objects.get(exam=self.exam, kind=KIND_KARNE)
        row.send_options['running_since'] = timezone.now().isoformat()
        row.save(update_fields=['send_options'])
        before = row.send_options
        res = self._save_recipients(KIND_KARNE, {'include_student': False})
        self.assertEqual(res.status_code, 400)
        row.refresh_from_db()
        self.assertEqual(row.send_options, before)

    def test_manual_selection_overrides_saved_schedule_preferences(self):
        self._grade()
        self._save_recipients(KIND_KARNE, {'include_student': False, 'include_veli': True})
        with patch('apps.coaching.application.olcme_publish._send_karnes',
                   return_value={'sent': 1, 'skipped': 0, 'errors': []}) as send:
            send_now(self.exam, KIND_KARNE, include_student=True, include_veli=False,
                     excluded_student_ids=[], excluded_veli_ids=[])
        self.assertTrue(send.call_args.kwargs['include_student'])
        self.assertFalse(send.call_args.kwargs['include_veli'])

    def test_answer_key_recipient_exclusions_are_independent(self):
        from types import SimpleNamespace
        from apps.coaching.application.olcme_cevap_anahtari_notify import send_answer_key_notify
        veli = OgrenciVeli.objects.get(ogrenci=self.present)
        for students, velis, expected_type in [([self.present.id], [], ':veli:'), ([], [veli.id], ':ogrenci')]:
            with self.subTest(expected_type=expected_type), patch(
                'apps.coaching.application.olcme_cevap_anahtari_notify.dispatch_event',
                return_value=SimpleNamespace(success=True),
            ) as dispatch:
                send_answer_key_notify(self.exam, b'%PDF-test', 'test.pdf',
                                       excluded_student_ids=students, excluded_veli_ids=velis)
                dispatch.assert_called_once()
                self.assertIn(expected_type, dispatch.call_args.kwargs['source'].ref_id)

    def test_karne_student_exclusion_keeps_guardian_selected(self):
        from apps.coaching.application.olcme_karne_notify import (
            KarneNotifyPreview, KarneNotifyRecipient, send_karne_notify_bulk,
        )
        veli = OgrenciVeli.objects.get(ogrenci=self.present)
        preview = KarneNotifyPreview(exam_id=self.exam.id, answer_id=1,
            exam_name=self.exam.name, student_name='Ada', recipients=[
                KarneNotifyRecipient('ogrenci', self.present.id, None, 'Ada', '05321110001', 'Test'),
                KarneNotifyRecipient('veli', self.present.id, veli.id, 'Anne', '05321110002', 'Test'),
            ])
        for excluded_students, excluded_velis, expected_student, expected_velis in [
            ([self.present.id], [], False, [veli.id]),
            ([], [veli.id], True, []),
            ([self.present.id], [veli.id], False, []),
        ]:
            with self.subTest(student=expected_student), patch(
                'apps.coaching.application.olcme_karne_notify.preview_karne_notify', return_value=preview,
            ), patch('apps.coaching.application.olcme_karne_notify.send_karne_notify',
                     return_value={'sent': 1, 'skipped': 0, 'errors': []}) as send:
                send_karne_notify_bulk(kurum_id=self.kurum.id, exam_id=self.exam.id,
                    items=[{'answer_id': 1, 'karne': {'student_id': self.present.id},
                            'pdf_bytes': b'%PDF-test', 'filename': 'test.pdf'}],
                    excluded_student_ids=excluded_students, excluded_veli_ids=excluded_velis)
                if not expected_student and not expected_velis:
                    send.assert_not_called()
                    continue
                send.assert_called_once()
                self.assertEqual(send.call_args.kwargs['include_student'], expected_student)
                self.assertEqual(send.call_args.kwargs['veli_ids'], expected_velis)
