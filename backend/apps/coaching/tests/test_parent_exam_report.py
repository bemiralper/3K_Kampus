"""Veli Sınav Genel Durum Raporu — önizleme, PDF ve WhatsApp gönderim testleri."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import StudentAnswer, StudentSectionScore
from apps.coaching.tests import test_olcme_development_analysis as fixture_module
from apps.egitim_yili.domain.models import EgitimYili
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli


class ParentExamReportApiTests(TestCase):
    def setUp(self):
        fixture_module.DevelopmentAnalysisScenariosTest.setUp(self)
        self.year = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.user = get_user_model().objects.create_user(
            username='parent-report-coach',
            first_name='Özcan',
            last_name='Korkmaz',
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }

        # 2 TYT denemesi + 1 başka öğrenci (kurum ortalaması doğrulaması için)
        self.exam1, self.ans1, self.sec1 = self._make_exam('TYT Deneme 1', date(2026, 9, 10), net=22)
        self.exam2, self.ans2, self.sec2 = self._make_exam('TYT Deneme 2', date(2026, 10, 10), net=28)

        other = Ogrenci.objects.create(kurum=self.kurum, sube=self.sube, ad='Diğer', soyad='Öğrenci')
        other_ans1 = StudentAnswer.objects.create(
            session=self.ans1.session,
            student=other,
            raw_student_id='OTHER1',
            total_net=Decimal('18'),
        )
        StudentSectionScore.objects.create(
            student_answer=other_ans1,
            section=self.sec1,
            net=Decimal('18'),
            correct=20,
            wrong=8,
            empty=12,
        )

        # Veli kaydı
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            ad='Ayşe',
            soyad='Veli',
            veli_turu='anne',
            telefon='05551234567',
            varsayilan=True,
        )

    def _make_exam(self, name, day, **kwargs):
        exam, ans, sec = fixture_module.DevelopmentAnalysisScenariosTest._exam(self, name, day, **kwargs)
        exam.egitim_yili = self.year
        exam.save()
        return exam, ans, sec

    def _url(self, suffix):
        return f'/api/coaching/olcme-degerlendirme/student-exams/{self.ogrenci.id}/parent-report/{suffix}/'

    def test_preview_returns_tracks_kurum_avg_svg_html_and_recipients(self):
        resp = self.client.post(
            self._url('preview'),
            {
                'scope': 'both',
                'window': 'last_5',
                'include_kurum_avg': True,
                'include_error_profile': True,
                'include_strengths': True,
                'include_study_focus': True,
                'coach_note': 'Düzenli yükselişi tebrik ederiz.',
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertTrue(body['success'])
        data = body['data']

        self.assertEqual(len(data['tracks']), 1)
        tyt = data['tracks'][0]
        self.assertEqual(tyt['group'], 'TYT')
        self.assertEqual(tyt['kpi']['exam_count'], 2)
        self.assertEqual(tyt['kpi']['latest_net'], 28.0)
        self.assertEqual(tyt['kpi']['avg_net'], 25.0)
        self.assertEqual(tyt['kpi']['trend_delta'], 6.0)
        # exam1 kurum ortalaması (22 + 18) / 2 = 20.0
        self.assertEqual(tyt['series'][0]['kurum_avg_net'], 20.0)
        self.assertTrue(len(tyt['subjects']) >= 1)
        self.assertEqual(len(data['recipients']), 1)
        self.assertTrue(data['recipients'][0]['can_send'])
        self.assertIn('<svg', data['html'])
        self.assertIn('Düzenli yükselişi tebrik ederiz.', data['html'])
        self.assertIn('VELİ SINAV GENEL DURUM RAPORU', data['html'])
        self.assertTrue(data['filename'].endswith('.pdf'))

    @patch('apps.coaching.olcme_degerlendirme.services.parent_exam_report_pdf.render_html_to_pdf')
    def test_pdf_endpoint_returns_attachment(self, mock_render):
        mock_render.return_value = b'%PDF-1.7\n' + (b'0' * 3000)
        resp = self.client.post(
            self._url('pdf'),
            {'scope': 'TYT', 'window': 'all'},
            format='json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        self.assertIn('attachment;', resp['Content-Disposition'])
        self.assertTrue(resp.content.startswith(b'%PDF'))
        mock_render.assert_called_once()

    @patch('apps.coaching.olcme_degerlendirme.services.parent_exam_report.dispatch_event')
    @patch('apps.coaching.olcme_degerlendirme.services.parent_exam_report_pdf.render_html_to_pdf')
    def test_send_endpoint_dispatches_whatsapp_pdf_to_selected_veli(self, mock_render, mock_dispatch):
        mock_render.return_value = b'%PDF-1.7\n' + (b'0' * 3000)
        mock_dispatch.return_value = SimpleNamespace(
            success=True,
            message_id='msg-123',
            message_status='QUEUED',
            errors=[],
        )

        resp = self.client.post(
            self._url('send'),
            {
                'scope': 'both',
                'window': 'last_5',
                'veli_ids': [self.veli.id],
                'coach_note': 'Güzel ilerleme.',
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()['data']
        self.assertEqual(data['sent'], 1)
        self.assertEqual(data['skipped'], 0)
        self.assertEqual(data['message_ids'], ['msg-123'])
        mock_dispatch.assert_called_once()
        call_kwargs = mock_dispatch.call_args.kwargs
        self.assertEqual(call_kwargs['attachment'].file_bytes[:5], b'%PDF-')

    def test_send_requires_at_least_one_veli(self):
        resp = self.client.post(
            self._url('send'),
            {'scope': 'TYT', 'veli_ids': []},
            format='json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 400)

    def test_v2_themes_custom_title_tone_and_exam_exclusion(self):
        resp = self.client.post(
            self._url('preview'),
            {
                'scope': 'TYT',
                'window': 'all',
                'theme': 'brand',
                'tone': 'supportive',
                'custom_title': 'Kasım Ayı Ara Değerlendirme Raporu',
                'recipient_greeting': 'Ayşe Veli',
                'include_progress_bridge': True,
                'include_net_breakdown': True,
                'include_exam_table': True,
                'excluded_exam_ids': [self.exam1.id],
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()['data']
        # Aday sınav listesinde 2 sınav olmalı, exam1 hariç işaretli
        self.assertEqual(len(data['available_exams']), 2)
        self.assertTrue(any(e['exam_id'] == self.exam1.id and e['excluded'] for e in data['available_exams']))
        # Aktif hesaplamada sadece 1 sınav (exam2 = 28 net) kalmalı
        tyt = data['tracks'][0]
        self.assertEqual(tyt['kpi']['exam_count'], 1)
        self.assertEqual(tyt['kpi']['avg_net'], 28.0)
        self.assertIn('hero-brand', data['html'])
        self.assertIn('Kasım Ayı Ara Değerlendirme Raporu', data['html'])
        self.assertIn('Sayın Ayşe Veli için hazırlanmıştır', data['html'])
        self.assertIn('Moral & Gelişim', [t['label'] for t in data['note_templates']])
        self.assertIn('Sayın Ayşe Veli', data['default_whatsapp_caption'])

    def test_unauthorized_user_gets_403(self):
        other_user = get_user_model().objects.create_user(username='no-access-coach')
        client = APIClient()
        client.force_authenticate(other_user)
        resp = client.post(self._url('preview'), {'scope': 'both'}, format='json', **self.headers)
        self.assertEqual(resp.status_code, 403)
