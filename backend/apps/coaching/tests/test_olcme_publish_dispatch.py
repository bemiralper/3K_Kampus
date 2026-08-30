"""Sınav karne / cevap anahtarı zamanlı gönderim senaryoları."""
from datetime import timedelta
from unittest.mock import patch

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

User = get_user_model()
EXAMS_URL = '/api/coaching/olcme-degerlendirme/exams/'


class OlcmePublishDispatchTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Yayın Kurum', kod='YAYN')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='YAYN-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='yayin', password='test')
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

    def test_send_now_api_requires_ready_answer_key(self):
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/publish-dispatch/send-now/',
            {'kind': 'answer_key'},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], ST_OVERDUE)
        self.assertFalse(res.json()['ok'])
