"""Ölçme karnesi PDF ve WhatsApp önizleme."""
import io
from datetime import date, time
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    Exam, ExamSection, ExamSession, ExamSessionModel, StudentAnswer, StudentSectionScore,
)
from apps.communication.application.notification_events import get_event
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli
from apps.sube.domain.models import Sube

User = get_user_model()


class OlcmeKarnePdfNotifyTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Karne Kurum', kod='KARN')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KARN-A')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='karneuser', password='test')
        self.client.force_authenticate(user=self.user)

        self.exam = Exam.objects.create(
            name='DK TYT 2',
            exam_type='YKS_TYT',
            status=Exam.Status.RESULTS_UPLOADED,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
        )
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Türkçe', order=1, question_start=1, question_end=40,
        )
        self.exam_oturum = ExamSessionModel.objects.create(
            exam=self.exam,
            name='1. Oturum',
            order=0,
            session_date=date(2026, 3, 14),
            start_time=time(10, 0),
            end_time=time(12, 45),
        )
        self.exam_oturum.sections.add(self.section)
        self.session = ExamSession.objects.create(
            exam=self.exam, status=ExamSession.Status.COMPLETED, original_filename='test.dat',
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Hamza', soyad='Küçükyıldız',
            telefon='05321112233',
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            sinif=None,
            aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            veli_turu='anne',
            ad='Ayşe',
            soyad='Küçükyıldız',
            telefon='05324445566',
            sms_bildirimleri=['duyuru'],
        )
        answer = StudentAnswer.objects.create(
            session=self.session,
            student=self.ogrenci,
            raw_student_id='1001',
            raw_student_name='Hamza Küçükyıldız',
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

    def test_sinav_karne_event_has_document_and_both_recipients(self):
        event = get_event('sinav.karne')
        self.assertIsNotNone(event)
        self.assertTrue(event.has_document)
        self.assertIn('VELI', event.recipients)
        self.assertIn('OGRENCI', event.recipients)

    def test_sinav_cevap_anahtari_event_has_document(self):
        event = get_event('sinav.cevap_anahtari')
        self.assertIsNotNone(event)
        self.assertTrue(event.has_document)
        self.assertIn('VELI', event.recipients)
        self.assertIn('OGRENCI', event.recipients)

    def test_single_karne_pdf_is_original_pdf(self):
        res = self.client.get(
            f'{self.base}/students/{self.answer.id}/karne-pdf/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertTrue(res.content.startswith(b'%PDF'))
        self.assertGreater(len(res.content), 500)
        self.assertIn('attachment', res['Content-Disposition'])

    def test_bulk_karneler_pdf(self):
        res = self.client.get(
            f'{self.base}/students/karneler-pdf/',
            {'answer_ids': str(self.answer.id)},
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content.startswith(b'%PDF'))

    def test_notify_preview_lists_veli_and_student(self):
        res = self.client.get(
            f'{self.base}/students/{self.answer.id}/notify-preview/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()['data']
        types = {r['recipient_type'] for r in data['recipients']}
        self.assertIn('veli', types)
        self.assertIn('ogrenci', types)
        veli = next(r for r in data['recipients'] if r['recipient_type'] == 'veli')
        self.assertEqual(veli['veli_id'], self.veli.id)
        self.assertFalse(veli['skip_reason'])

    @patch('apps.coaching.application.olcme_karne_notify.dispatch_event')
    def test_notify_send_dispatches_pdf(self, mock_dispatch):
        class FakeResult:
            success = True
            errors = []
            message_status = 'QUEUED'

        mock_dispatch.return_value = FakeResult()
        res = self.client.post(
            f'{self.base}/students/{self.answer.id}/notify/',
            {'veli_ids': [self.veli.id], 'include_student': True},
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        self.assertEqual(body['data']['sent'], 2)
        self.assertEqual(mock_dispatch.call_count, 2)
        first_kwargs = mock_dispatch.call_args_list[0].kwargs
        self.assertEqual(mock_dispatch.call_args_list[0].args[1], 'sinav.karne')
        self.assertTrue(first_kwargs['attachment'].filename.endswith('.pdf'))
        self.assertTrue(first_kwargs['attachment'].file_bytes.startswith(b'%PDF'))

    def test_bulk_notify_preview_lists_students(self):
        res = self.client.get(
            f'{self.base}/students/notify-bulk-preview/',
            {'answer_ids': str(self.answer.id)},
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()['data']
        self.assertEqual(data['sendable'], 1)
        self.assertEqual(data['students'][0]['veli_count'], 1)
        self.assertTrue(data['students'][0]['has_student'])

    @patch('apps.coaching.application.olcme_karne_notify.dispatch_event')
    def test_bulk_notify_send(self, mock_dispatch):
        class FakeResult:
            success = True
            errors = []
            message_status = 'QUEUED'

        mock_dispatch.return_value = FakeResult()
        res = self.client.post(
            f'{self.base}/students/notify-bulk/',
            {
                'answer_ids': [self.answer.id],
                'include_veli': True,
                'include_student': True,
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        self.assertEqual(body['data']['sent'], 2)
        self.assertGreaterEqual(mock_dispatch.call_count, 2)

    def test_student_detail_includes_profil_foto(self):
        res = self.client.get(
            f'{self.base}/students/{self.answer.id}/detail/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('profil_foto', data)
        self.assertIsNone(data['profil_foto'])
        self.assertEqual(data['session_date'], '2026-03-14')
        self.assertEqual(data['session_start_time'], '10:00')
        self.assertEqual(data['session_end_time'], '12:45')
        self.assertEqual(data['session_name'], '1. Oturum')
        from apps.coaching.application.olcme_karne_pdf import _format_session_when
        self.assertEqual(
            _format_session_when({
                'session_date': data['session_date'],
                'session_start_time': data['session_start_time'],
                'session_end_time': data['session_end_time'],
            }),
            '14 Mart 2026  ·  10.00 - 12.45',
        )
        self.assertEqual(data['kurum_ici_sira'], 1)

    def test_karne_uses_matching_session_datetime(self):
        other = ExamSection.objects.create(
            exam=self.exam, name='Matematik', order=2, question_start=41, question_end=80,
        )
        later = ExamSessionModel.objects.create(
            exam=self.exam,
            name='2. Oturum',
            order=1,
            session_date=date(2026, 3, 15),
            start_time=time(14, 30),
        )
        later.sections.add(other)
        res = self.client.get(
            f'{self.base}/students/{self.answer.id}/detail/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['session_date'], '2026-03-14')
        self.assertEqual(data['session_start_time'], '10:00')

    def test_karne_pdf_with_student_photo(self):
        from PIL import Image

        buf = io.BytesIO()
        Image.new('RGB', (80, 100), (2, 98, 167)).save(buf, format='PNG')
        self.ogrenci.profil_foto.save(
            'karne-foto.png',
            SimpleUploadedFile('karne-foto.png', buf.getvalue(), content_type='image/png'),
            save=True,
        )
        res = self.client.get(
            f'{self.base}/students/{self.answer.id}/karne-pdf/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content.startswith(b'%PDF'))
        self.assertGreater(len(res.content), 1500)
        detail = self.client.get(
            f'{self.base}/students/{self.answer.id}/detail/',
            **self.headers,
        ).json()
        self.assertTrue(detail['profil_foto'])
        self.assertIn('ogrenci/profil', detail['profil_foto'])


class KarnePdfTopicBlocksLayoutTest(TestCase):
    """Uzun kazanım tablosu eski 2 sütun layout'ta LayoutError veriyordu."""

    def test_long_topic_blocks_render_and_include_names(self):
        from apps.coaching.application.olcme_karne_pdf import render_karne_pdf

        rows = [
            {'name': f'Kazanım {i}', 'soru': 1, 'dogru': 1, 'yanlis': 0, 'bos': 0, 'basari': 100}
            for i in range(1, 25)
        ]
        payload = {
            'student_name': 'Deneme Öğrenci',
            'exam_name': 'YAYIN DENİZİ DK TYT 2',
            'exam_type': 'YKS_TYT',
            'total_questions': 120,
            'total_correct': 80,
            'total_wrong': 20,
            'total_empty': 20,
            'toplam_net': 75,
            'section_details': [],
            'strong_areas': [],
            'weak_areas': [],
            'answer_grids': [],
            'topic_blocks': [
                {'heading': 'Türkçe', 'tables': [{'title': 'Türkçe', 'rows': rows}]},
                {'heading': 'Sosyal Bilimler', 'tables': [
                    {'title': 'Tarih', 'rows': rows[:8]},
                    {'title': 'Coğrafya', 'rows': rows[:6]},
                    {'title': 'Felsefe', 'rows': rows[:6]},
                    {'title': 'Din Kültürü', 'rows': rows[:5]},
                ]},
                {'heading': 'Temel Matematik', 'tables': [
                    {'title': 'Matematik', 'rows': rows[:18]},
                    {'title': 'Geometri', 'rows': rows[:10]},
                ]},
                {'heading': 'Fen Bilimleri', 'tables': [
                    {'title': 'Fizik', 'rows': rows[:7]},
                    {'title': 'Kimya', 'rows': rows[:7]},
                    {'title': 'Biyoloji', 'rows': rows[:6]},
                ]},
            ],
        }
        long_rows = [
            {'name': f'Sayfa kırılımı kazanım {i}', 'soru': 2, 'dogru': 1, 'yanlis': 1, 'bos': 0, 'basari': 50}
            for i in range(1, 61)
        ]
        payload['topic_blocks'].append({
            'heading': 'Uzun Ders',
            'tables': [{'title': 'Uzun Ders', 'rows': long_rows}],
        })
        pdf = render_karne_pdf(payload)
        self.assertTrue(pdf.startswith(b'%PDF'))
        self.assertGreater(len(pdf), 2000)
