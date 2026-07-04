"""
Faz 5 — SSE, ödeme hatırlatma API, görüşme WhatsApp flag testleri.
"""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.models import CoachProfile, CoachStudentAssignment, GorusmeKaydi
from apps.communication.domain.models import Message, OutboundQueueItem
from apps.kurum.domain.models import Kurum
from apps.egitim_yili.domain.models import EgitimYili
from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum
from apps.odeme_takip.domain.models import Sozlesme, Taksit
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.personel.domain.models import Personel
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_perms(user, *codes):
    role, _ = Role.objects.get_or_create(
        code='comm_f5_test',
        defaults={'name': 'Comm F5 Test', 'level': 100, 'is_system_role': True},
    )
    for code in codes:
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class Faz5CommunicationAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='F5 Kurum', kod='F5KUR')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='F5MRK')
        self.user = User.objects.create_user(username='f5user', password='test')
        _assign_perms(
            self.user,
            'communication.read',
            'communication.write',
            'finans.manage',
        )
        self.client.force_authenticate(user=self.user)

        self.sube_header = {'HTTP_X_SUBE_ID': str(self.sube.id)}

        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Test',
            telefon='05321112233',
            aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.student,
            veli_turu='anne',
            ad='Veli',
            soyad='Test',
            telefon='05324445566',
            sms_bildirimleri=['odeme', 'duyuru'],
        )
        personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Koç',
            soyad='F5',
            tc_kimlik_no='22222222222',
            user=self.user,
        )
        self.coach = CoachProfile.objects.create(
            teacher=personel,
            capacity=20,
            is_active=True,
            is_coach=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            start_date=date(2026, 1, 1),
            is_primary=True,
        )

        ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-F5-001',
            ogrenci=self.student,
            egitim_yili=ey,
            kurum=self.kurum,
            sube=self.sube,
            veli=self.veli,
            baslangic_tarihi=timezone.localdate(),
            bitis_tarihi=timezone.localdate() + timedelta(days=365),
            brut_tutar=10000,
            net_tutar=10000,
            durum=SozlesmeDurum.AKTIF,
        )
        self.taksit = Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=1,
            tutar=5000,
            kalan_tutar=5000,
            vade_tarihi=timezone.localdate() + timedelta(days=3),
            durum=TaksitDurum.BEKLEMEDE,
        )

    def test_sse_requires_auth(self):
        anon = APIClient()
        response = anon.get(
            '/api/communication/events/stream/',
            {'kurum_id': self.kurum.id},
        )
        self.assertIn(response.status_code, (401, 403))

    @override_settings(COMMUNICATION_SSE_MAX_ITERATIONS=1)
    def test_sse_authenticated_returns_stream(self):
        response = self.client.get(
            '/api/communication/events/stream/',
            {'kurum_id': self.kurum.id},
            **self.sube_header,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/event-stream', response.get('Content-Type', ''))

    def test_payment_reminder_api_enqueues(self):
        response = self.client.post(
            '/api/communication/payment-reminders/send/',
            {
                'kurum_id': self.kurum.id,
                'taksit_id': self.taksit.id,
            },
            format='json',
            **self.sube_header,
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get('success'))
        self.assertTrue(
            OutboundQueueItem.objects.filter(message__source_module='odeme').exists(),
        )

    def test_payment_reminder_duplicate_rejected(self):
        self.client.post(
            '/api/communication/payment-reminders/send/',
            {'kurum_id': self.kurum.id, 'taksit_id': self.taksit.id},
            format='json',
            **self.sube_header,
        )
        response = self.client.post(
            '/api/communication/payment-reminders/send/',
            {'kurum_id': self.kurum.id, 'taksit_id': self.taksit.id},
            format='json',
            **self.sube_header,
        )
        self.assertEqual(response.status_code, 400)

    def test_gorusme_whatsapp_flag_gating(self):
        future = timezone.localdate() + timedelta(days=5)
        before = Message.objects.filter(source_module='gorusme').count()

        response = self.client.post(
            '/api/coaching/gorusmeler/',
            {
                'kurum_id': self.kurum.id,
                'ogrenci_id': self.student.id,
                'koc_id': self.coach.id,
                'gorusme_turu': 'ogrenci',
                'durum': 'planlandi',
                'gorusme_tarihi': future.isoformat(),
                'konu': 'Flag test',
                'send_whatsapp_reminder': False,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        after = Message.objects.filter(source_module='gorusme').count()
        self.assertEqual(before, after, 'send_whatsapp_reminder=False iken mesaj kuyruğa eklenmemeli')

    def test_ai_suggest_reply_disabled(self):
        _assign_perms(self.user, 'communication.manage')
        response = self.client.post(
            '/api/communication/ai/suggest-reply/',
            {
                'conversation_id': '00000000-0000-0000-0000-000000000001',
                'kurum_id': self.kurum.id,
            },
            format='json',
            **self.sube_header,
        )
        self.assertEqual(response.status_code, 501)
