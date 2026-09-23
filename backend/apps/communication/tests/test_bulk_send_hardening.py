"""Toplu gönderim / kuyruk / geçmiş sertleştirmesi — audit bulguları için regresyon testleri.

C-01 tekilleştirme, C-02 iptal vs uçuştaki batch, C-03 belirsiz gönderim,
H-01 durum monotonluğu, H-02 webhook hat bağı, H-03 kampanya retry,
H-04 read-only koç, H-05 client_token, H-08 koç legacy önizleme,
M-01 tek render yolu, M-02 materialize'da şablon onayı, M-03 şablon istatistiği,
H-09 sayfalı geçmiş, karar 4 yabancı numara, karar 10 oluşturan+yönetici.
"""
from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.communication.application.campaign_service import (
    AudienceResolver,
    CampaignService,
    CampaignStatsService,
)
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.inbound_processor import InboundProcessor
from apps.communication.application.meta_template_mapper import render_body_with_parameters
from apps.communication.application.outbound_processor import (
    UNCERTAIN_SEND_ERROR,
    process_pending_batch,
    process_queue_item,
)
from apps.communication.domain.enums import (
    CampaignStatus,
    Channel,
    MessageDirection,
    MessageStatus,
    MetaTemplateStatus,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    Conversation,
    Message,
    OutboundCampaign,
    OutboundQueueItem,
    WhatsAppMetaTemplate,
)
from apps.communication.infrastructure.repository import (
    MessageStatusEventRepository,
    OutboundQueueRepository,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli
from apps.personel.domain.models import Personel
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sinif.domain.models import Sinif
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


class _Base(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sertleştirme Kurum', kod='HRD')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='HRD-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, ad='9-A', kod='9A', egitim_yili=self.yil, aktif_mi=True,
        )
        self.admin = User.objects.create_user(username='hrd-admin', password='x')
        _grant(self.admin, 'hrd_manage', 'communication.manage', 'communication.bulk', 'communication.read')
        Personel.objects.create(kurum=self.kurum, sube=self.sube, ad='Ad', soyad='Min', user=self.admin)
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.hdr = {'HTTP_X_KURUM_ID': str(self.kurum.id), 'HTTP_X_SUBE_ID': str(self.sube.id)}

    def _student(self, ad, phone, aktif=True):
        o = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad=ad, soyad='Öğr', telefon=phone, aktif_mi=aktif,
        )
        OgrenciKayit.objects.create(
            ogrenci=o, sinif=self.sinif, egitim_yili=self.yil, kurum=self.kurum, sube=self.sube,
            aktif_mi=aktif,
        )
        return o

    def _veli(self, ogrenci, phone, turu='anne'):
        return OgrenciVeli.objects.create(
            ogrenci=ogrenci, veli_turu=turu, ad=f'Veli-{turu}', soyad='X', telefon=phone,
            sms_bildirimleri=['duyuru'],
        )

    def _query_filter(self, person_types=('veli',)):
        return {
            'audience_type': 'query',
            'person_types': list(person_types),
            'tree': {'groups': [{'op': 'and', 'conditions': [
                {'field': 'sinif_id', 'op': 'in', 'value': [self.sinif.id]},
            ]}]},
            'egitim_yili_id': self.yil.id,
        }


# ---------------------------------------------------------------- C-01
@override_settings(COMMUNICATION_CAMPAIGN_REQUIRE_TEMPLATE=False)
class DedupeTest(_Base):
    def test_same_phone_two_students_two_messages_same_phone_same_student_one(self):
        a = self._student('Ali', '05321000001')
        b = self._student('Ayşe', '05321000002')
        shared = '05329999999'
        self._veli(a, shared, 'anne')
        self._veli(a, shared, 'baba')   # aynı öğrenci, aynı numara → tek
        self._veli(b, shared, 'anne')   # farklı öğrenci → ayrı mesaj (ürün kararı 1)

        preview = AudienceResolver.resolve(self.kurum.id, self._query_filter(), user=self.admin)
        phones = [(r.e164, r.ogrenci_id) for r in preview.recipients]
        self.assertEqual(len(phones), 2)
        self.assertEqual({p[1] for p in phones}, {a.id, b.id})

        service = CampaignService()
        campaign = service.create_draft(
            self.kurum.id, sube_id=self.sube.id, created_by_id=self.admin.id, body='m',
            audience_filter=self._query_filter(), user=self.admin,
        )
        with patch('apps.communication.application.celery_dispatch.dispatch_process_outbound_queue', return_value=True):
            service.confirm(campaign)
        self.assertEqual(Message.objects.filter(campaign=campaign).count(), 2)

    def test_legacy_all_veliler_uses_same_rule(self):
        a = self._student('Ali', '05321000001')
        b = self._student('Ayşe', '05321000002')
        self._veli(a, '05329999999', 'anne')
        self._veli(a, '05329999999', 'baba')
        self._veli(b, '05329999999', 'anne')
        preview = AudienceResolver.resolve(
            self.kurum.id, {'audience_type': 'all_veliler', 'sube_id': self.sube.id}, user=self.admin,
        )
        self.assertEqual(preview.total_recipients, 2)


# ---------------------------------------------------------------- karar 3/4
class PhoneAndInactiveTest(_Base):
    def test_foreign_e164_accepted_tr_landline_rejected(self):
        self.assertEqual(ContactResolver.normalize('+49 151 23456789'), '+4915123456789')
        self.assertEqual(ContactResolver.normalize('0049 151 23456789'), '+4915123456789')
        self.assertEqual(ContactResolver.normalize('0532 100 00 01'), '+905321000001')
        with self.assertRaises(ValidationError):
            ContactResolver.normalize('+90 212 555 55 55')  # TR sabit hat
        with self.assertRaises(ValidationError):
            ContactResolver.normalize('+1 5')  # çok kısa

    def test_inactive_student_parent_not_addable_via_included_ids(self):
        a = self._student('Pasif', '05321000001', aktif=False)
        v = self._veli(a, '05329999999')
        preview = AudienceResolver.resolve(
            self.kurum.id,
            {'audience_type': 'query', 'person_types': ['veli'], 'included_veli_ids': [v.id],
             'egitim_yili_id': self.yil.id},
            user=self.admin,
        )
        self.assertEqual(preview.total_recipients, 0)
        preview2 = AudienceResolver.resolve(
            self.kurum.id, {'audience_type': 'custom_ids', 'veli_ids': [v.id]}, user=self.admin,
        )
        self.assertEqual(preview2.total_recipients, 0)


# ---------------------------------------------------------------- H-04 / H-08 / karar 10
class PermissionTest(_Base):
    def _coach(self, *codes):
        user = User.objects.create_user(username='hrd-coach', password='x')
        _grant(user, 'hrd_coach_role', *codes)
        personel = Personel.objects.create(kurum=self.kurum, sube=self.sube, ad='Koç', soyad='K', user=user)
        profile = CoachProfile.objects.create(teacher=personel, is_active=True)
        return user, profile

    def test_read_only_coach_cannot_create_campaign(self):
        user, profile = self._coach('communication.read')
        s = self._student('Ali', '05321000001')
        CoachStudentAssignment.objects.create(coach=profile, student=s, is_primary=True, start_date=date(2026, 1, 1))
        c = APIClient()
        c.force_authenticate(user=user)
        res = c.post('/api/communication/campaigns/', {
            'body': 'x', 'audience_filter': {'audience_type': 'coach_students'},
        }, format='json', **self.hdr)
        self.assertEqual(res.status_code, 403)
        res = c.get('/api/communication/campaigns/', **self.hdr)
        self.assertEqual(res.status_code, 200)

    def test_coach_with_bulk_cannot_preview_all_veliler_unscoped(self):
        user, profile = self._coach('communication.read', 'communication.write', 'communication.bulk')
        mine = self._student('Benim', '05321000001')
        other = self._student('Başka', '05321000002')
        self._veli(mine, '05329000001')
        self._veli(other, '05329000002')
        CoachStudentAssignment.objects.create(coach=profile, student=mine, is_primary=True, start_date=date(2026, 1, 1))
        with self.assertRaises(PermissionDenied):
            AudienceResolver.resolve(
                self.kurum.id, {'audience_type': 'all_veliler', 'sube_id': self.sube.id}, user=user,
            )
        preview = AudienceResolver.resolve(
            self.kurum.id, {'audience_type': 'custom_ids', 'veli_ids': [
                OgrenciVeli.objects.get(ogrenci=mine).id, OgrenciVeli.objects.get(ogrenci=other).id,
            ]}, user=user,
        )
        self.assertEqual([r.ogrenci_id for r in preview.recipients], [mine.id])

    @override_settings(COMMUNICATION_CAMPAIGN_REQUIRE_TEMPLATE=False)
    def test_cancel_requires_creator_or_manager(self):
        s = self._student('Ali', '05321000001')
        self._veli(s, '05329000001')
        campaign = CampaignService().create_draft(
            self.kurum.id, sube_id=self.sube.id, created_by_id=self.admin.id, body='m',
            audience_filter=self._query_filter(), user=self.admin, scheduled_at=timezone.now() + timedelta(days=1),
        )
        other = User.objects.create_user(username='hrd-other', password='x')
        _grant(other, 'hrd_bulk_only', 'communication.bulk', 'communication.read')
        Personel.objects.create(kurum=self.kurum, sube=self.sube, ad='Di', soyad='Ğer', user=other)
        c = APIClient()
        c.force_authenticate(user=other)
        res = c.post(f'/api/communication/campaigns/{campaign.id}/cancel/', {}, format='json', **self.hdr)
        self.assertEqual(res.status_code, 403)
        res = self.client.post(f'/api/communication/campaigns/{campaign.id}/cancel/', {}, format='json', **self.hdr)
        self.assertEqual(res.status_code, 200)


# ---------------------------------------------------------------- H-05
@override_settings(COMMUNICATION_CAMPAIGN_REQUIRE_TEMPLATE=False)
class ClientTokenTest(_Base):
    def test_same_client_token_returns_existing_campaign(self):
        s = self._student('Ali', '05321000001')
        self._veli(s, '05329000001')
        body = {
            'body': 'merhaba', 'audience_filter': self._query_filter(),
            'client_token': 'tok-123', 'scheduled_at': (timezone.now() + timedelta(days=1)).isoformat(),
        }
        r1 = self.client.post('/api/communication/campaigns/', body, format='json', **self.hdr)
        self.assertEqual(r1.status_code, 201, r1.content)
        r2 = self.client.post('/api/communication/campaigns/', body, format='json', **self.hdr)
        self.assertEqual(r2.status_code, 200, r2.content)
        self.assertTrue(r2.json().get('idempotent_replay'))
        self.assertEqual(r1.json()['id'], r2.json()['id'])
        self.assertEqual(OutboundCampaign.objects.filter(kurum=self.kurum).count(), 1)


# ---------------------------------------------------------------- C-02 / C-03 / H-03
@override_settings(COMMUNICATION_CAMPAIGN_REQUIRE_TEMPLATE=False, COMMUNICATION_ALLOW_STUB_SEND=True)
class QueueHardeningTest(_Base):
    def _campaign_with_queue(self, n=3):
        for i in range(n):
            s = self._student(f'Ö{i}', f'0532100000{i}')
            self._veli(s, f'0532900000{i}')
        service = CampaignService()
        campaign = service.create_draft(
            self.kurum.id, sube_id=self.sube.id, created_by_id=self.admin.id, body='m',
            audience_filter=self._query_filter(), user=self.admin,
        )
        with patch('apps.communication.application.celery_dispatch.dispatch_process_outbound_queue', return_value=True):
            service.confirm(campaign)
        campaign.refresh_from_db()
        return campaign

    def test_cancel_keeps_locked_items_and_worker_skips_them(self):
        campaign = self._campaign_with_queue(3)
        batch = OutboundQueueRepository.get_pending_batch(limit=3)   # worker kilitledi
        self.assertEqual(len(batch), 3)
        CampaignService().cancel(campaign)
        # Kilitli kayıtlar silinmedi, mesajlar CANCELLED
        self.assertEqual(OutboundQueueItem.objects.filter(campaign=campaign).count(), 3)
        self.assertEqual(
            Message.objects.filter(campaign=campaign, status=MessageStatus.CANCELLED).count(), 3,
        )
        # Worker göndermez, kayıtları temizler, hiçbir mesaj SENT olmaz
        with patch('apps.communication.infrastructure.channels.dispatcher.ChannelDispatcher.get_client') as gc:
            client = gc.return_value
            for item in batch:
                item.refresh_from_db()
                self.assertFalse(process_queue_item(item, client))
            client.send_text.assert_not_called()
            client.send_template.assert_not_called()
        self.assertEqual(OutboundQueueItem.objects.filter(campaign=campaign).count(), 0)
        self.assertEqual(Message.objects.filter(campaign=campaign, status=MessageStatus.SENT).count(), 0)

    def test_crashed_item_does_not_block_rest_of_batch(self):
        campaign = self._campaign_with_queue(2)
        calls = {'n': 0}

        def boom(*a, **k):
            calls['n'] += 1
            if calls['n'] == 1:
                raise RuntimeError('patlat')
            return {'success': True, 'messages': [{'id': f'wamid.{calls["n"]}'}]}

        with patch('apps.communication.application.outbound_processor.ChannelDispatcher') as disp:
            disp.return_value.get_client.return_value.send_text.side_effect = boom
            disp.return_value.get_client.return_value.send_template.side_effect = boom
            result = process_pending_batch(limit=2)
        self.assertEqual(result['processed'], 2)
        self.assertEqual(result['sent'], 1)
        self.assertEqual(OutboundQueueItem.objects.filter(campaign=campaign, locked_at__isnull=False).count(), 0)

    def test_uncertain_send_is_not_resent(self):
        campaign = self._campaign_with_queue(1)
        item = OutboundQueueItem.objects.get(campaign=campaign)
        # Önceki (ölmüş) worker Meta çağrısını başlatmış, kilidi bayat
        OutboundQueueItem.objects.filter(pk=item.pk).update(
            locked_at=timezone.now() - timedelta(hours=1),
            locked_by='dead-host:1:abcd',
            provider_call_started_at=timezone.now() - timedelta(hours=1),
        )
        Message.objects.filter(pk=item.message_id).update(status=MessageStatus.SENDING)
        batch = OutboundQueueRepository.get_pending_batch(limit=5)
        self.assertEqual(len(batch), 1)
        self.assertTrue(batch[0].reclaimed_from_other_worker)
        with patch('apps.communication.application.outbound_processor.ChannelDispatcher') as disp:
            client = disp.return_value.get_client.return_value
            self.assertFalse(process_queue_item(batch[0], client))
            client.send_text.assert_not_called()
            client.send_template.assert_not_called()
        msg = Message.objects.get(pk=item.message_id)
        self.assertEqual(msg.status, MessageStatus.FAILED)
        self.assertIn('belirsiz', msg.failed_reason.lower())
        self.assertEqual(msg.failed_reason, UNCERTAIN_SEND_ERROR)

    def test_campaign_retry_failed_resets_exhausted_items(self):
        campaign = self._campaign_with_queue(2)
        for item in OutboundQueueItem.objects.filter(campaign=campaign):
            OutboundQueueRepository.mark_failed(item, 'kalıcı', permanent=True)
        self.assertEqual(Message.objects.filter(campaign=campaign, status=MessageStatus.FAILED).count(), 2)
        self.assertEqual(OutboundQueueItem.objects.filter(campaign=campaign).count(), 2)  # satırlar duruyor
        with patch('apps.communication.application.celery_dispatch.dispatch_process_outbound_queue', return_value=True):
            result = CampaignService().retry_failed(campaign)
        self.assertEqual(result['retried_count'], 2)
        self.assertEqual(Message.objects.filter(campaign=campaign, status=MessageStatus.PENDING).count(), 2)
        self.assertTrue(all(
            i.attempt_count == 0 for i in OutboundQueueItem.objects.filter(campaign=campaign)
        ))


# ---------------------------------------------------------------- H-01 / H-02 / M-03
class WebhookStatusTest(_Base):
    def setUp(self):
        super().setUp()
        self.cfg_a = CommunicationChannelConfig.objects.create(
            kurum=self.kurum, channel=Channel.WHATSAPP, name='Hat A', phone_number_id='PN-A',
            is_active=True,
        )
        self.cfg_b = CommunicationChannelConfig.objects.create(
            kurum=self.kurum, channel=Channel.WHATSAPP, name='Hat B', phone_number_id='PN-B',
            is_active=True,
        )
        self.conv = Conversation.objects.create(
            kurum=self.kurum, sube=self.sube, channel=Channel.WHATSAPP,
            contact_phone='+905321000001', channel_config=self.cfg_a,
        )
        self.msg = Message.objects.create(
            conversation=self.conv, direction=MessageDirection.OUTBOUND, body='x',
            status=MessageStatus.SENT, provider_message_id='wamid.TEST1',
        )

    def _apply(self, meta_status, ts):
        return MessageStatusEventRepository.apply_status_update(
            self.msg, meta_status=meta_status, provider_event_id=f'wamid.TEST1:{meta_status}:{ts}',
            occurred_at=timezone.now(), raw_payload={},
        )

    def test_status_does_not_regress(self):
        _, applied = self._apply('read', 3)
        self.assertTrue(applied)
        _, applied = self._apply('delivered', 2)   # geç gelen
        self.assertFalse(applied)
        self.msg.refresh_from_db()
        self.assertEqual(self.msg.status, MessageStatus.READ)
        self.assertIsNotNone(self.msg.delivered_at)   # zaman damgası yine yazılır
        _, applied = self._apply('failed', 4)
        self.assertFalse(applied)
        self.msg.refresh_from_db()
        self.assertEqual(self.msg.status, MessageStatus.READ)

    def test_status_webhook_from_other_account_is_ignored(self):
        proc = InboundProcessor()
        status = {'id': 'wamid.TEST1', 'status': 'delivered', 'timestamp': '1700000000'}
        proc._process_status(status, kurum_id=self.kurum.id, channel_config=self.cfg_b)
        self.msg.refresh_from_db()
        self.assertEqual(self.msg.status, MessageStatus.SENT)
        proc._process_status(status, kurum_id=self.kurum.id, channel_config=self.cfg_a)
        self.msg.refresh_from_db()
        self.assertEqual(self.msg.status, MessageStatus.DELIVERED)

    def test_template_stats_hook_fires_on_read(self):
        campaign = OutboundCampaign.objects.create(kurum=self.kurum, sube=self.sube, status=CampaignStatus.QUEUED)
        self.msg.campaign = campaign
        self.msg.save(update_fields=['campaign'])
        with patch('apps.communication.application.template_service.TemplateService.update_stats_on_message_status') as hook:
            InboundProcessor()._process_status(
                {'id': 'wamid.TEST1', 'status': 'read', 'timestamp': '1700000001'},
                kurum_id=self.kurum.id, channel_config=self.cfg_a,
            )
        hook.assert_called_once()
        self.assertEqual(hook.call_args.args[1], MessageStatus.READ)


# ---------------------------------------------------------------- M-01 / M-02
class TemplateRenderTest(_Base):
    def test_render_matches_meta_parameters(self):
        body = 'Sayın {{veli_ad}}, {{ogrenci_ad}} için {{sinif}} sınıfı bilgisi.'
        vmap = {'1': 'veli_ad', '2': 'ogrenci_ad', '3': 'sinif'}
        ctx = {'veli_ad': 'Ayşe Yılmaz', 'ogrenci_ad': 'Ali', 'sinif': ''}
        rendered = render_body_with_parameters(body, vmap, ctx)
        # Boş değişken Meta'ya '-' gider; metinde de '-' — {{sinif}} kalmaz
        self.assertEqual(rendered, 'Sayın Ayşe Yılmaz, Ali için - sınıfı bilgisi.')
        numbered = render_body_with_parameters('Merhaba {{1}}, {{2}}', vmap, ctx)
        self.assertEqual(numbered, 'Merhaba Ayşe Yılmaz, Ali')

    @override_settings(COMMUNICATION_CAMPAIGN_REQUIRE_TEMPLATE=False)
    def test_materialize_fails_when_template_no_longer_approved(self):
        s = self._student('Ali', '05321000001')
        self._veli(s, '05329000001')
        cfg = CommunicationChannelConfig.objects.create(
            kurum=self.kurum, channel=Channel.WHATSAPP, name='Hat', phone_number_id='PN-1', is_active=True,
        )
        tpl = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum, channel_config=cfg, name='duyuru_genel', language='tr',
            status=MetaTemplateStatus.APPROVED, body_named='Merhaba {{veli_ad}}',
        )
        service = CampaignService()
        campaign = service.create_draft(
            self.kurum.id, sube_id=self.sube.id, created_by_id=self.admin.id,
            template_name='duyuru_genel', template_language='tr',
            audience_filter=self._query_filter(), user=self.admin,
            scheduled_at=timezone.now() + timedelta(hours=1), channel_config_id=cfg.id,
        )
        # Gönderim zamanına kadar şablon reddedildi
        tpl.status = MetaTemplateStatus.REJECTED
        tpl.save(update_fields=['status'])
        OutboundCampaign.objects.filter(pk=campaign.pk).update(scheduled_at=timezone.now() - timedelta(minutes=1))
        campaign.refresh_from_db()
        with self.assertRaises(ValidationError):
            service.confirm(campaign)
        campaign.refresh_from_db()
        self.assertEqual(campaign.status, CampaignStatus.FAILED)
        self.assertIn('onaylı değil', campaign.send_options_json.get('materialize_error', ''))
        self.assertEqual(Message.objects.filter(campaign=campaign).count(), 0)


# ---------------------------------------------------------------- H-09 / H-07
@override_settings(COMMUNICATION_CAMPAIGN_REQUIRE_TEMPLATE=False)
class HistoryApiTest(_Base):
    def test_list_is_paginated_filtered_and_lean(self):
        s = self._student('Ali', '05321000001')
        self._veli(s, '05329000001')
        for i in range(5):
            CampaignService().create_draft(
                self.kurum.id, sube_id=self.sube.id, created_by_id=self.admin.id, body='m',
                title=f'Kampanya {i}', audience_filter=self._query_filter(), user=self.admin,
                scheduled_at=timezone.now() + timedelta(days=1),
            )
        res = self.client.get('/api/communication/campaigns/', {'limit': 2, 'offset': 0}, **self.hdr)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data['campaigns']), 2)
        self.assertEqual(data['total'], 5)
        self.assertTrue(data['has_more'])
        self.assertNotIn('recipient_filter_json', data['campaigns'][0])
        self.assertIn('audience_summary', data['campaigns'][0])
        self.assertTrue(data['campaigns'][0]['can_manage'])
        res = self.client.get('/api/communication/campaigns/', {'q': 'Kampanya 3', 'status': 'DRAFT'}, **self.hdr)
        self.assertEqual(res.json()['total'], 1)
        res = self.client.get('/api/communication/campaigns/', {'status': 'COMPLETED'}, **self.hdr)
        self.assertEqual(res.json()['total'], 0)

    def test_deliveries_endpoint_paginates(self):
        for i in range(4):
            st = self._student(f'Ö{i}', f'0532100000{i}')
            self._veli(st, f'0532900000{i}')
        service = CampaignService()
        campaign = service.create_draft(
            self.kurum.id, sube_id=self.sube.id, created_by_id=self.admin.id, body='m',
            audience_filter=self._query_filter(), user=self.admin,
        )
        with patch('apps.communication.application.celery_dispatch.dispatch_process_outbound_queue', return_value=True):
            service.confirm(campaign)
        res = self.client.get(
            f'/api/communication/campaigns/{campaign.id}/deliveries/', {'limit': 3, 'offset': 0}, **self.hdr,
        )
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertEqual(len(data['deliveries']), 3)
        self.assertEqual(data['total'], 4)
        self.assertTrue(data['has_more'])
        res = self.client.get(
            f'/api/communication/campaigns/{campaign.id}/deliveries/', {'status': 'SENT'}, **self.hdr,
        )
        self.assertEqual(res.json()['total'], 0)

    def test_stats_refresh_is_single_aggregate(self):
        s = self._student('Ali', '05321000001')
        self._veli(s, '05329000001')
        service = CampaignService()
        campaign = service.create_draft(
            self.kurum.id, sube_id=self.sube.id, created_by_id=self.admin.id, body='m',
            audience_filter=self._query_filter(), user=self.admin,
        )
        with patch('apps.communication.application.celery_dispatch.dispatch_process_outbound_queue', return_value=True):
            service.confirm(campaign)
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as ctx:
            CampaignStatsService.refresh_campaign_stats(campaign.id)
        counts = [q['sql'] for q in ctx.captured_queries if 'COUNT(' in q['sql'].upper()]
        self.assertLessEqual(len(counts), 2, counts)
