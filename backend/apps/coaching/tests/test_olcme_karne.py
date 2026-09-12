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
        for name in ('sinav_ad', 'sinav_adi', 'sinav_tarihi', 'tarih', 'puan', 'net'):
            self.assertIn(name, event.all_variables())

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
        self.assertEqual(data['session_name'], '1. Oturum')
        self.assertEqual(data['kurum_ici_sira'], 1)

        from apps.coaching.application.olcme_karne_notify import _context
        from apps.communication.application.variable_resolver import resolve_variables

        ctx = _context(data)
        self.assertEqual(ctx['sinav_tarihi'], '14.03.2026')
        self.assertEqual(ctx['tarih'], '14.03.2026')
        self.assertEqual(ctx['sinav_adi'], 'DK TYT 2')
        self.assertEqual(ctx['baslama_saati'], '10:00')
        body = resolve_variables(
            'Değerli öğrencimiz, *{{sinav_tarihi}}* tarihinde yapılan *"{{sinav_ad}}"* '
            'sınav sonuç belgen ektedir.',
            ctx,
        )
        self.assertNotIn('{{sinav_tarihi}}', body)
        self.assertIn('14.03.2026', body)

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


class KarneTopicBlockUsesOutcomeTextTest(TestCase):
    """Karnedeki satır adı kazanım metni olmalı, kod veya konu başlığı değil."""

    def test_linked_outcome_uses_curriculum_text(self):
        from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKey, AnswerKeyItem
        from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, Topic
        from apps.coaching.olcme_degerlendirme.views.analysis_views import _build_topic_blocks

        exam = Exam.objects.create(name='Karne Excel', exam_type='YKS_TYT')
        section = ExamSection.objects.create(
            exam=exam, name='Matematik', order=1, question_start=61, question_end=62,
        )
        subject = Subject.objects.create(code='MAT', name='Matematik')
        topic = Topic.objects.create(
            subject=subject, name='SHG21 · SAYILAR', order=1,
        )
        outcome = Outcome.objects.create(
            topic=topic, code='21.1.2', text='Temel Kavramlar ve Sayı Kümeleri',
        )
        ak = AnswerKey.objects.create(exam=exam, booklet='')
        AnswerKeyItem.objects.create(
            answer_key=ak, section=section, question_number=61,
            correct_answer='A', outcome=outcome,
            imported_outcome_text='21.1.2',
        )
        AnswerKeyItem.objects.create(
            answer_key=ak, section=section, question_number=62,
            correct_answer='B', outcome=outcome,
            imported_outcome_text='21.1.2.',
        )

        blocks = _build_topic_blocks(exam, {
            '61': {'result': 'correct'},
            '62': {'result': 'wrong'},
        }, '')
        rows = [row for block in blocks for table in block['tables'] for row in table['rows']]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['name'], 'Temel Kavramlar ve Sayı Kümeleri')
        self.assertEqual(rows[0]['soru'], 2)
        self.assertEqual(rows[0]['dogru'], 1)
        self.assertEqual(rows[0]['yanlis'], 1)
        self.assertNotIn('21.1.2', rows[0]['name'])
        self.assertNotIn('SHG21 · SAYILAR', rows[0]['name'])

    def test_unmatched_code_resolves_to_curriculum_text(self):
        from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKey, AnswerKeyItem
        from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, Topic
        from apps.coaching.olcme_degerlendirme.models.exam import ExamSection
        from apps.coaching.olcme_degerlendirme.views.analysis_views import _build_topic_blocks

        exam = Exam.objects.create(name='Karne B Kitapçık', exam_type='YKS_TYT')
        parent = ExamSection.objects.create(
            exam=exam, name='Sosyal Bilimler', order=1,
            question_start=41, question_end=60, is_sub_section=False,
        )
        subject = Subject.objects.create(code='COG', name='Coğrafya')
        cografya = ExamSection.objects.create(
            exam=exam, name='Coğrafya', order=1,
            question_start=46, question_end=50, is_sub_section=True,
            parent_section=parent, subject=subject,
        )
        topic = Topic.objects.create(subject=subject, name='9. sınıf · HARİTA', order=1)
        Outcome.objects.create(
            topic=topic, code='9.1.1.4', text='Harita bilgilerini kullanır.',
        )
        ak = AnswerKey.objects.create(exam=exam, booklet='A', is_primary=True)
        item = AnswerKeyItem.objects.create(
            answer_key=ak, section=cografya, question_number=46,
            correct_answer='D', b_question_number=7,
            imported_outcome_text='9.1.1.4',
        )
        self.assertEqual(item.booklet_b_global(), 47)

        AnswerKey.objects.create(exam=exam, booklet='B', is_primary=False)
        blocks = _build_topic_blocks(exam, {
            '47': {'result': 'correct'},
            '46': {'result': 'wrong'},
        }, 'B')
        rows = [row for block in blocks for table in block['tables'] for row in table['rows']]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['name'], 'Harita bilgilerini kullanır.')
        self.assertEqual(rows[0]['dogru'], 1)
        self.assertEqual(rows[0]['yanlis'], 0)

    def test_heading_code_uses_topic_title_not_child_outcome(self):
        from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKey, AnswerKeyItem
        from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, Topic
        from apps.coaching.olcme_degerlendirme.views.analysis_views import _build_topic_blocks

        exam = Exam.objects.create(name='Karne Başlık', exam_type='YKS_TYT')
        subject = Subject.objects.create(code='MAT2', name='Matematik')
        section = ExamSection.objects.create(
            exam=exam, name='Matematik', order=1, question_start=1, question_end=2,
            subject=subject,
        )
        topic = Topic.objects.create(
            subject=subject, code='21.10', name='SHG21 · FONKSİYONLAR', order=1,
        )
        Outcome.objects.create(topic=topic, code='21.10.2', text='Fonksiyon grafiği')
        ak = AnswerKey.objects.create(exam=exam, booklet='')
        AnswerKeyItem.objects.create(
            answer_key=ak, section=section, question_number=1,
            correct_answer='A', imported_outcome_text='21.10',
        )

        blocks = _build_topic_blocks(exam, {'1': {'result': 'correct'}}, '')
        rows = [row for block in blocks for table in block['tables'] for row in table['rows']]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['name'], 'FONKSİYONLAR')
        self.assertNotIn('21.10.2', rows[0]['name'])
        self.assertNotIn('Fonksiyon grafiği', rows[0]['name'])

    def test_heading_code_stays_on_section_subject(self):
        """21.10 Türkçe'de AD SOYLU; DKAB'daki İslam düşüncesi karneye sızmamalı."""
        from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKey, AnswerKeyItem
        from apps.coaching.olcme_degerlendirme.models.curriculum import Subject, Topic
        from apps.coaching.olcme_degerlendirme.views.analysis_views import _build_topic_blocks

        exam = Exam.objects.create(name='Karne Ders Sızıntısı', exam_type='YKS_TYT')
        turkce = Subject.objects.create(code='TURKCE', name='Türkçe')
        dkab = Subject.objects.create(code='DKAB', name='Din Kültürü ve Ahlak Bilgisi')
        Topic.objects.create(
            subject=turkce, code='21.10', name='SHG21 · AD SOYLU SÖZCÜKLER', order=1,
        )
        Topic.objects.create(
            subject=dkab, code='21.10',
            name='SHG21 · İSLAM DÜŞÜNCESİNDE İTİKADİ, SİYASİ VE FIKHİ YORUMLAR',
            order=2,
        )
        section = ExamSection.objects.create(
            exam=exam, name='Türkçe', order=1, question_start=1, question_end=2,
            subject=turkce,
        )
        ak = AnswerKey.objects.create(exam=exam, booklet='')
        AnswerKeyItem.objects.create(
            answer_key=ak, section=section, question_number=1,
            correct_answer='A', imported_outcome_text='21.10',
        )
        AnswerKeyItem.objects.create(
            answer_key=ak, section=section, question_number=2,
            correct_answer='B', imported_outcome_text='21.10',
        )

        blocks = _build_topic_blocks(exam, {
            '1': {'result': 'correct'},
            '2': {'result': 'wrong'},
        }, '')
        rows = [row for block in blocks for table in block['tables'] for row in table['rows']]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['name'], 'AD SOYLU SÖZCÜKLER')
        self.assertEqual(rows[0]['soru'], 2)
        self.assertNotIn('İSLAM', rows[0]['name'])
        self.assertNotIn('İTİKADİ', rows[0]['name'])


class KarnePdfLongTopicTableTest(TestCase):
    def test_long_imported_topic_table_fits_across_pages(self):
        from apps.coaching.application.olcme_karne_pdf import render_karne_pdf

        rows = [
            {
                'name': f'{i}. kazanım metni & <uzun>',
                'soru': 1, 'dogru': 1, 'yanlis': 0, 'bos': 0, 'basari': 100,
            }
            for i in range(1, 81)
        ]
        pdf = render_karne_pdf({
            'exam_name': 'DK TYT',
            'student_name': 'Test Öğrenci',
            'sube_ad': 'Merkez',
            'kurum_ad': '3K',
            'toplam_net': 40,
            'topic_blocks': [
                {'heading': 'Türkçe', 'tables': [{'title': 'Türkçe', 'rows': rows}]},
                {'heading': 'Matematik', 'tables': [{'title': 'Matematik', 'rows': rows[:20]}]},
            ],
            'section_details': [],
            'answer_grids': [],
        })
        self.assertTrue(pdf.startswith(b'%PDF'))
        self.assertGreater(len(pdf), 1500)
