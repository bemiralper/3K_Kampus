"""Faz 2 — iş kapsamı sertleştirmeleri: transfer hedefi, ödeme hatırlatma şubesi, Meta şablon şubesi."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.communication.domain.enums import (
    Channel,
    MetaTemplateStatus,
    WhatsAppAccountScope,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    Conversation,
    WhatsAppMetaTemplate,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum
from apps.odeme_takip.domain.models import Sozlesme, Taksit
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.personel.domain.models import Personel
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _grant(user, role_code, *codes):
    role, _ = Role.objects.get_or_create(
        code=role_code, defaults={'name': role_code, 'level': 100, 'is_system_role': True},
    )
    for code in codes:
        perm, _ = Permission.objects.get_or_create(
            code=code, defaults={'name': code, 'module': code.split('.')[0], 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})
    return role


class ScopeHardeningTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Scope Kurum', kod='SCP')
        self.other_kurum = Kurum.objects.create(ad='Yabancı Kurum', kod='SCP-X')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='A', kod='SCP-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='B', kod='SCP-B')

        self.admin = User.objects.create_user(username='scp-admin', password='x')
        _grant(
            self.admin, 'scp_manage',
            'communication.manage', 'communication.config', 'finans.manage',
        )
        Personel.objects.create(kurum=self.kurum, sube=self.sube_a, ad='Ad', soyad='Min', user=self.admin)
        self.client.force_authenticate(user=self.admin)
        self.hdr = {'HTTP_X_KURUM_ID': str(self.kurum.id), 'HTTP_X_SUBE_ID': str(self.sube_a.id)}

    # --- K-05 transfer hedefi ---
    def _conversation(self):
        return Conversation.objects.create(
            kurum=self.kurum, sube=self.sube_a, channel=Channel.WHATSAPP,
            contact_phone='+905321000000',
        )

    def test_transfer_to_user_outside_kurum_is_rejected(self):
        conv = self._conversation()
        stranger = User.objects.create_user(username='stranger', password='x')
        _grant(stranger, 'scp_stranger', 'communication.read')
        other_sube = Sube.objects.create(kurum=self.other_kurum, ad='X', kod='SCP-X-M')
        Personel.objects.create(
            kurum=self.other_kurum, sube=other_sube, ad='Ya', soyad='Bancı', user=stranger,
        )
        res = self.client.post(
            f'/api/communication/conversations/{conv.id}/transfer/',
            {'kurum_id': self.kurum.id, 'to_user_id': stranger.id}, format='json', **self.hdr,
        )
        self.assertEqual(res.status_code, 400)
        conv.refresh_from_db()
        self.assertIsNone(conv.claimed_by_user_id)

    def test_transfer_to_user_without_communication_access_is_rejected(self):
        conv = self._conversation()
        clerk = User.objects.create_user(username='clerk', password='x')
        _grant(clerk, 'scp_clerk', 'finans.read')
        Personel.objects.create(kurum=self.kurum, sube=self.sube_a, ad='Me', soyad='Mur', user=clerk)
        res = self.client.post(
            f'/api/communication/conversations/{conv.id}/transfer/',
            {'kurum_id': self.kurum.id, 'to_user_id': clerk.id}, format='json', **self.hdr,
        )
        self.assertEqual(res.status_code, 400)

    def test_transfer_to_valid_colleague_succeeds(self):
        conv = self._conversation()
        colleague = User.objects.create_user(username='colleague', password='x')
        _grant(colleague, 'scp_colleague', 'communication.read', 'communication.write')
        Personel.objects.create(kurum=self.kurum, sube=self.sube_a, ad='Me', soyad='Sai', user=colleague)
        res = self.client.post(
            f'/api/communication/conversations/{conv.id}/transfer/',
            {'kurum_id': self.kurum.id, 'to_user_id': colleague.id}, format='json', **self.hdr,
        )
        self.assertEqual(res.status_code, 200, res.content)
        conv.refresh_from_db()
        self.assertEqual(conv.claimed_by_user_id, colleague.id)

    # --- K-06 ödeme hatırlatma şubesi ---
    def test_payment_reminder_for_other_branch_taksit_is_not_found(self):
        student_b = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube_b, ad='B', soyad='Öğr', telefon='05322000000', aktif_mi=True,
        )
        veli_b = OgrenciVeli.objects.create(
            ogrenci=student_b, veli_turu='anne', ad='B', soyad='Veli',
            telefon='05323000000', sms_bildirimleri=['odeme'],
        )
        ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        soz = Sozlesme.objects.create(
            sozlesme_no='SZ-B-1', ogrenci=student_b, egitim_yili=ey, kurum=self.kurum, sube=self.sube_b,
            veli=veli_b, baslangic_tarihi=timezone.localdate(),
            bitis_tarihi=timezone.localdate() + timedelta(days=300),
            brut_tutar=1000, net_tutar=1000, durum=SozlesmeDurum.AKTIF,
        )
        taksit = Taksit.objects.create(
            sozlesme=soz, taksit_no=1, tutar=500, kalan_tutar=500,
            vade_tarihi=timezone.localdate() + timedelta(days=3), durum=TaksitDurum.BEKLEMEDE,
        )
        res = self.client.post(
            '/api/communication/payment-reminders/send/',
            {'kurum_id': self.kurum.id, 'taksit_id': taksit.id}, format='json', **self.hdr,
        )
        self.assertEqual(res.status_code, 404, res.content)

    # --- K-07 Meta şablon şube kapsamı ---
    def _accounts_and_templates(self):
        acc_a = CommunicationChannelConfig.objects.create(
            kurum=self.kurum, phone_number_id='pn-a', is_active=True,
            scope_type=WhatsAppAccountScope.SELECTED_SUBES,
        )
        acc_a.allowed_subes.set([self.sube_a])
        acc_b = CommunicationChannelConfig.objects.create(
            kurum=self.kurum, phone_number_id='pn-b', is_active=True,
            scope_type=WhatsAppAccountScope.SELECTED_SUBES,
        )
        acc_b.allowed_subes.set([self.sube_b])
        tpl_a = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum, channel_config=acc_a, name='tpl_a', language='tr',
            status=MetaTemplateStatus.APPROVED, body_named='A',
        )
        tpl_b = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum, channel_config=acc_b, name='tpl_b', language='tr',
            status=MetaTemplateStatus.APPROVED, body_named='B',
        )
        return acc_a, acc_b, tpl_a, tpl_b

    def test_branch_user_cannot_see_other_branch_line_templates(self):
        _, _, tpl_a, tpl_b = self._accounts_and_templates()
        # Şube A'ya bağlı, tam-inbox yetkisi olmayan yapılandırma kullanıcısı
        branch_user = User.objects.create_user(username='branch-a', password='x')
        _grant(branch_user, 'scp_branch', 'communication.config', 'communication.read')
        Personel.objects.create(kurum=self.kurum, sube=self.sube_a, ad='Şu', soyad='Be', user=branch_user)
        client = APIClient()
        client.force_authenticate(user=branch_user)
        res = client.get('/api/communication/meta-templates/', {'kurum_id': self.kurum.id}, **self.hdr)
        self.assertEqual(res.status_code, 200, res.content)
        names = {t['name'] for t in res.json()['templates']}
        self.assertIn('tpl_a', names)
        self.assertNotIn('tpl_b', names)
        detail = client.get(
            f'/api/communication/meta-templates/{tpl_b.id}/', {'kurum_id': self.kurum.id}, **self.hdr,
        )
        self.assertEqual(detail.status_code, 404)

    def test_template_status_webhook_without_waba_updates_nothing(self):
        from apps.communication.application.meta_template_service import MetaTemplateService

        _, _, tpl_a, _ = self._accounts_and_templates()
        WhatsAppMetaTemplate.objects.create(
            kurum=self.other_kurum,
            channel_config=CommunicationChannelConfig.objects.create(
                kurum=self.other_kurum, phone_number_id='pn-x', is_active=True,
            ),
            name='tpl_a', language='tr', status=MetaTemplateStatus.PENDING, body_named='X',
        )
        updated = MetaTemplateService.apply_webhook_status(
            event={'message_template_name': 'tpl_a', 'message_template_language': 'tr', 'event': 'REJECTED'},
        )
        self.assertEqual(updated, 0)
        tpl_a.refresh_from_db()
        self.assertEqual(tpl_a.status, MetaTemplateStatus.APPROVED)

        updated = MetaTemplateService.apply_webhook_status(
            phone_number_id='pn-a',
            event={'message_template_name': 'tpl_a', 'message_template_language': 'tr', 'event': 'REJECTED'},
        )
        self.assertEqual(updated, 1)
        self.assertEqual(
            WhatsAppMetaTemplate.objects.get(kurum=self.other_kurum, name='tpl_a').status,
            MetaTemplateStatus.PENDING,
        )
