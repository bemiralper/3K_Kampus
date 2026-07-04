"""
Campaign attachment upload ve kampanya bağlama testleri.
"""
import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.communication.application.campaign_service import CampaignService
from apps.communication.application.cost_estimator import estimate_campaign_cost
from apps.communication.domain.enums import CampaignStatus
from apps.communication.domain.models import CampaignAttachment, OutboundCampaign
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_bulk(user):
    role, _ = Role.objects.get_or_create(
        code='att_bulk',
        defaults={'name': 'att_bulk', 'level': 10, 'is_system_role': True},
    )
    for code in ('communication.bulk', 'communication.read'):
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class AttachmentUploadTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Att Kurum', kod='ATT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='M', kod='ATT')
        self.user = User.objects.create_user(username='att_admin', password='x')
        _assign_bulk(self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Veli', telefon='05321112233', aktif_mi=True,
        )
        OgrenciVeli.objects.create(
            ogrenci=self.student, ad='Veli', soyad='Test', telefon='05329998877',
            sms_bildirimleri=['duyuru'],
        )

    def test_upload_attachment(self):
        pdf = SimpleUploadedFile('test.pdf', b'%PDF-1.4 fake', content_type='application/pdf')
        res = self.client.post(
            '/api/communication/attachments/upload/',
            {'file': pdf, 'kurum_id': self.kurum.id},
            format='multipart',
        )
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data['id'])
        self.assertEqual(CampaignAttachment.objects.filter(kurum=self.kurum).count(), 1)

    def test_reject_oversized(self):
        big = SimpleUploadedFile('big.pdf', b'x' * (17 * 1024 * 1024), content_type='application/pdf')
        res = self.client.post(
            '/api/communication/attachments/upload/',
            {'file': big, 'kurum_id': self.kurum.id},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)


class CampaignWithAttachmentsTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Camp Att', kod='CATT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='M', kod='CATT')
        self.user = User.objects.create_user(username='camp_att', password='x')
        _assign_bulk(self.user)
        OgrenciVeli.objects.create(
            ogrenci=Ogrenci.objects.create(
                kurum=self.kurum, sube=self.sube, ad='A', soyad='B', telefon='05321113344', aktif_mi=True,
            ),
            ad='V', soyad='B', telefon='05325556677', sms_bildirimleri=['duyuru'],
        )

    def test_create_campaign_with_attachment_ids(self):
        att = CampaignAttachment.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            file=SimpleUploadedFile('doc.pdf', b'pdf', content_type='application/pdf'),
            original_name='doc.pdf',
            mime_type='application/pdf',
            file_size=3,
            uploaded_by=self.user,
        )
        service = CampaignService()
        campaign = service.create_draft(
            self.kurum.id,
            sube_id=self.sube.id,
            created_by_id=self.user.id,
            body='Ekli mesaj',
            audience_filter={'audience_type': 'all_veliler'},
            user=self.user,
            attachment_ids=[str(att.id)],
        )
        self.assertEqual(campaign.attachments.count(), 1)
        self.assertEqual(campaign.status, CampaignStatus.DRAFT)


class CostEstimatorTest(TestCase):
    def test_estimate_cost(self):
        cost = estimate_campaign_cost(100, attachment_count=2)
        self.assertGreater(cost, 0)

    def test_preview_includes_cost(self):
        kurum = Kurum.objects.create(ad='Cost', kod='COST')
        sube = Sube.objects.create(kurum=kurum, ad='M', kod='COST')
        user = User.objects.create_user(username='cost_user', password='x')
        _assign_bulk(user)
        OgrenciVeli.objects.create(
            ogrenci=Ogrenci.objects.create(
                kurum=kurum, sube=sube, ad='A', soyad='B', telefon='05324445566', aktif_mi=True,
            ),
            ad='V', soyad='B', telefon='05327778899', sms_bildirimleri=['duyuru'],
        )
        preview = CampaignService().preview(
            kurum.id,
            {'audience_type': 'all_veliler'},
            user=user,
            attachment_count=1,
        )
        self.assertIn('estimated_cost_usd', preview)
        self.assertEqual(preview['attachment_count'], 1)
