"""
Faz 3 — Kampanya ve toplu gönderim testleri.
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.communication.application.campaign_service import AudienceResolver, CampaignService
from apps.communication.domain.enums import CampaignStatus, MessageStatus
from apps.communication.domain.models import Message, OutboundCampaign, OutboundQueueItem
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli
from apps.personel.domain.models import Personel
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_bulk_role(user, role_code: str = 'admin_bulk'):
    role, _ = Role.objects.get_or_create(
        code=role_code,
        defaults={'name': role_code, 'level': 10, 'is_system_role': True},
    )
    for code in ('communication.bulk', 'communication.read'):
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class CampaignAudienceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kampanya Kurum', kod='CAMP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='CAMP')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025,
            bitis_yil=2026,
            aktif_mi=True,
        )
        self.sinif_a = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='12-A',
            kod='12A',
            egitim_yili=self.egitim_yili,
            aktif_mi=True,
        )
        self.sinif_b = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='11-B',
            kod='11B',
            egitim_yili=self.egitim_yili,
            aktif_mi=True,
        )

        self.student_a = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='SinifA',
            telefon='05321111111',
            aktif_mi=True,
        )
        self.student_b = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Veli',
            soyad='SinifB',
            telefon='05322222222',
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.student_a,
            sinif=self.sinif_a,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.student_b,
            sinif=self.sinif_b,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,
        )
        self.veli_a = OgrenciVeli.objects.create(
            ogrenci=self.student_a,
            veli_turu='anne',
            ad='Anne',
            soyad='SinifA',
            telefon='05323333333',
            sms_bildirimleri=['duyuru'],
        )
        OgrenciVeli.objects.create(
            ogrenci=self.student_b,
            veli_turu='baba',
            ad='Baba',
            soyad='SinifB',
            telefon='05324444444',
            sms_bildirimleri=['duyuru'],
        )

    def test_preview_sinif_filter_counts(self):
        preview = AudienceResolver.resolve(
            self.kurum.id,
            {
                'audience_type': 'sinif',
                'sinif_id': self.sinif_a.id,
                'egitim_yili_id': self.egitim_yili.id,
            },
        )
        self.assertEqual(preview.ogrenci_count, 1)
        self.assertEqual(preview.veli_count, 1)
        self.assertEqual(preview.total_recipients, 2)
        self.assertEqual(preview.estimated_messages, 2)

    def test_veli_without_sms_prefs_included_in_bulk(self):
        """VeliTab ile eklenen veliler (boş sms_bildirimleri) duyuru listesine dahil olmalı."""
        OgrenciVeli.objects.create(
            ogrenci=self.student_b,
            veli_turu='anne',
            ad='Optsiz',
            soyad='Veli',
            telefon='05328887777',
            sms_bildirimleri=[],
        )
        preview = AudienceResolver.resolve(
            self.kurum.id,
            {'audience_type': 'all_veliler'},
        )
        self.assertGreaterEqual(preview.veli_count, 2)
        phones = {r.e164 for r in preview.recipients if r.recipient_type == 'VELI'}
        self.assertIn('+905328887777', phones)

    def test_confirm_creates_queue_items(self):
        service = CampaignService()
        campaign = service.create_draft(
            self.kurum.id,
            sube_id=self.sube.id,
            created_by_id=None,
            body='Merhaba sınıf',
            audience_filter={
                'audience_type': 'sinif',
                'sinif_id': self.sinif_a.id,
                'egitim_yili_id': self.egitim_yili.id,
            },
        )
        service.confirm(campaign)
        campaign.refresh_from_db()
        self.assertEqual(campaign.status, CampaignStatus.QUEUED)
        self.assertEqual(OutboundQueueItem.objects.filter(campaign=campaign).count(), 2)
        self.assertEqual(Message.objects.filter(campaign=campaign).count(), 2)

    def test_cancel_marks_pending_cancelled(self):
        service = CampaignService()
        campaign = service.create_draft(
            self.kurum.id,
            sube_id=self.sube.id,
            created_by_id=None,
            body='İptal test',
            audience_filter={
                'audience_type': 'sinif',
                'sinif_id': self.sinif_a.id,
                'egitim_yili_id': self.egitim_yili.id,
            },
        )
        service.confirm(campaign)
        service.cancel(campaign)
        campaign.refresh_from_db()
        self.assertEqual(campaign.status, CampaignStatus.CANCELLED)
        self.assertEqual(OutboundQueueItem.objects.filter(campaign=campaign).count(), 0)
        cancelled = Message.objects.filter(
            campaign=campaign,
            status=MessageStatus.CANCELLED,
        ).count()
        self.assertEqual(cancelled, 2)

    def test_retry_failed_requeues(self):
        service = CampaignService()
        campaign = service.create_draft(
            self.kurum.id,
            sube_id=self.sube.id,
            created_by_id=None,
            body='Retry test',
            audience_filter={
                'audience_type': 'custom_ids',
                'ogrenci_ids': [self.student_a.id],
            },
        )
        service.confirm(campaign)
        msg = Message.objects.filter(campaign=campaign).first()
        msg.status = MessageStatus.FAILED
        msg.failed_reason = 'Test fail'
        msg.save()
        OutboundQueueItem.objects.filter(message=msg).delete()

        result = service.retry_failed(campaign)
        self.assertEqual(result['retried_count'], 1)
        msg.refresh_from_db()
        self.assertEqual(msg.status, MessageStatus.PENDING)
        self.assertTrue(OutboundQueueItem.objects.filter(message=msg).exists())


class CoachBulkScopeTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Scope Kamp', kod='CSC')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='CSC')

        self.student_mine = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mine', soyad='Ogr', telefon='05325555555', aktif_mi=True,
        )
        self.student_other = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Other', soyad='Ogr', telefon='05326666666', aktif_mi=True,
        )

        self.coach_user = User.objects.create_user(username='coach_bulk', password='pass')
        self.coach_personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Koç',
            soyad='Bulk',
            tc_kimlik_no='22222222222',
            user=self.coach_user,
        )
        self.coach_profile = CoachProfile.objects.create(
            teacher=self.coach_personel,
            capacity=20,
            is_active=True,
            is_coach=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach_profile,
            student=self.student_mine,
            start_date=date(2026, 1, 1),
            is_primary=True,
        )

        for code in ('communication.read', 'communication.write'):
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={'name': code, 'module': 'communication', 'permission_type': 'write'},
            )
            role, _ = Role.objects.get_or_create(
                code='koc',
                defaults={'name': 'Koç', 'level': 100, 'is_system_role': True},
            )
            RolePermission.objects.get_or_create(role=role, permission=perm)
        UserRole.objects.update_or_create(user=self.coach_user, defaults={'role': role})

        self.admin_user = User.objects.create_user(username='admin_bulk', password='pass')
        _assign_bulk_role(self.admin_user)

        self.client = APIClient()

    def test_coach_cannot_bulk_outside_scope(self):
        service = CampaignService()
        with self.assertRaises(PermissionDenied):
            service.create_draft(
                self.kurum.id,
                created_by_id=self.coach_user.id,
                body='test',
                audience_filter={
                    'audience_type': 'custom_ids',
                    'ogrenci_ids': [self.student_other.id],
                },
                user=self.coach_user,
            )

    def test_coach_can_preview_own_students(self):
        preview = AudienceResolver.resolve(
            self.kurum.id,
            {
                'audience_type': 'coach_students',
                'coach_id': self.coach_profile.id,
            },
            user=self.coach_user,
        )
        self.assertEqual(preview.ogrenci_count, 1)

    def test_admin_can_create_campaign(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            '/api/communication/campaigns/',
            {
                'kurum_id': self.kurum.id,
                'body': 'Admin duyuru',
                'audience_filter': {
                    'audience_type': 'custom_ids',
                    'ogrenci_ids': [self.student_mine.id, self.student_other.id],
                },
            },
            format='json',
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(OutboundCampaign.objects.count(), 1)
