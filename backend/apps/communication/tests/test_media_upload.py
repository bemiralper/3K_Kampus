"""
Medya upload ve public URL fallback testleri.
"""
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from apps.communication.domain.models import CampaignAttachment
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
from apps.communication.infrastructure.media_storage import get_public_media_url
from apps.kurum.domain.models import Kurum


class MediaStorageTest(TestCase):
    @override_settings(
        COMMUNICATION_MEDIA_PUBLIC_BASE_URL='https://cdn.example.com/media/',
    )
    def test_public_url_with_base(self):
        att = CampaignAttachment(
            file='communication/campaign_attachments/2026/06/test.pdf',
        )
        url = get_public_media_url(att.file)
        self.assertEqual(
            url,
            'https://cdn.example.com/media/communication/campaign_attachments/2026/06/test.pdf',
        )


class MediaUploadTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Media Kurum', kod='MEDKUR')

    @patch.object(WhatsAppCloudClient, '_resolve_config')
    def test_upload_media_returns_id(self, mock_config):
        mock_config.return_value = {
            'phone_number_id': '123',
            'access_token': 'token',
            'waba_id': 'waba',
            'verify_token': '',
        }
        client = WhatsAppCloudClient()

        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(b'\x89PNG\r\n')
            tmp_path = tmp.name

        try:
            with patch('httpx.Client') as mock_client_cls:
                mock_response = mock_client_cls.return_value.__enter__.return_value.post.return_value
                mock_response.is_success = True
                mock_response.json.return_value = {'id': 'media_abc123'}

                media_id = client.upload_media(self.kurum.id, tmp_path, 'image/png')
                self.assertEqual(media_id, 'media_abc123')
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    @override_settings(WHATSAPP_APP_ID='app123')
    @patch.object(WhatsAppCloudClient, '_resolve_config')
    def test_template_media_handle_uses_resumable_upload(self, mock_config):
        mock_config.return_value = {
            'phone_number_id': '123',
            'access_token': 'token',
            'waba_id': 'waba',
            'verify_token': '',
        }
        client = WhatsAppCloudClient()

        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(b'\x89PNG\r\n')
            tmp_path = tmp.name

        try:
            with patch('httpx.Client') as mock_client_cls:
                http = mock_client_cls.return_value.__enter__.return_value
                session_resp = Mock(is_success=True)
                session_resp.json.return_value = {'id': 'upload:SESSION'}
                upload_resp = Mock(is_success=True)
                upload_resp.json.return_value = {'h': '4::aW1hZ2UvcG5n:ARZ'}
                http.post.side_effect = [session_resp, upload_resp]

                result = client.upload_template_media_handle(
                    self.kurum.id, tmp_path, 'image/png', file_name='ornek.png',
                )
                self.assertTrue(result['success'])
                self.assertEqual(result['handle'], '4::aW1hZ2UvcG5n:ARZ')

                session_call, upload_call = http.post.call_args_list
                self.assertTrue(session_call.args[0].endswith('/app123/uploads'))
                self.assertEqual(session_call.kwargs['params']['file_type'], 'image/png')
                self.assertTrue(upload_call.args[0].endswith('/upload:SESSION'))
                self.assertEqual(
                    upload_call.kwargs['headers']['Authorization'], 'OAuth token',
                )
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_campaign_attachment_provider_media_id_field(self):
        att = CampaignAttachment.objects.create(
            kurum=self.kurum,
            file=SimpleUploadedFile('doc.pdf', b'%PDF-1.4', content_type='application/pdf'),
            mime_type='application/pdf',
            original_name='doc.pdf',
            provider_media_id='meta_media_xyz',
        )
        att.refresh_from_db()
        self.assertEqual(att.provider_media_id, 'meta_media_xyz')


class SharedAccountTokenTest(TestCase):
    def setUp(self):
        from apps.communication.domain.enums import Channel
        from apps.communication.domain.models import CommunicationChannelConfig

        self.kurum = Kurum.objects.create(ad='Token Paylaşım', kod='TKNPY')
        self.coach = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Koç',
            phone_number_id='pn_coach',
            waba_id='waba-shared',
            access_token_encrypted='EAAB_coach_ok',
            is_active=True,
            is_default=True,
        )
        self.muhasebe = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Muhasebe',
            phone_number_id='pn_muh',
            waba_id='waba-shared',
            access_token_encrypted='',
            is_active=True,
            is_default=False,
        )

    @override_settings(WHATSAPP_ACCESS_TOKEN='')
    def test_second_number_inherits_sibling_token(self):
        client = WhatsAppCloudClient(channel_config=self.muhasebe)
        cfg = client._resolve_config(self.kurum.id)
        self.assertEqual(cfg['phone_number_id'], 'pn_muh')
        self.assertEqual(cfg['access_token'], 'EAAB_coach_ok')

    @override_settings(WHATSAPP_ACCESS_TOKEN='')
    def test_upload_retries_with_sibling_token_when_own_token_fails(self):
        self.muhasebe.access_token_encrypted = 'EAAB_muh_bad'
        self.muhasebe.save(update_fields=['access_token_encrypted'])
        client = WhatsAppCloudClient(channel_config=self.muhasebe)

        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
            tmp.write(b'%PDF-1.4\n')
            tmp_path = tmp.name

        try:
            def _post(config, *args, **kwargs):
                if config.get('access_token') == 'EAAB_coach_ok':
                    return 'media_from_sibling'
                client.last_media_error = 'Invalid OAuth access token'
                return None

            with patch.object(WhatsAppCloudClient, '_post_media_upload', side_effect=_post):
                media_id = client.upload_media(self.kurum.id, tmp_path, 'application/pdf')
            self.assertEqual(media_id, 'media_from_sibling')
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_resolve_cloud_id_matches_display_phone(self):
        from apps.communication.infrastructure.channels.whatsapp_cloud import (
            looks_like_msisdn,
        )

        self.assertTrue(looks_like_msisdn('+905551112233'))
        self.assertTrue(looks_like_msisdn('905551112233'))
        self.assertFalse(looks_like_msisdn('123456789012345'))

        client = WhatsAppCloudClient(channel_config=self.muhasebe)
        self.muhasebe.display_phone = '+90 555 111 22 33'
        self.muhasebe.save(update_fields=['display_phone'])
        with patch.object(
            WhatsAppCloudClient,
            'list_waba_phone_numbers',
            return_value=[
                {'id': '109988776655', 'display_phone_number': '+90 555 111 22 33'},
            ],
        ):
            resolved = client.resolve_cloud_phone_number_id(
                self.kurum.id,
                {'phone_number_id': '905551112233', 'waba_id': 'waba-shared', 'access_token': 'x'},
            )
        self.assertEqual(resolved, '109988776655')

    @override_settings(WHATSAPP_ACCESS_TOKEN='')
    def test_upload_resolves_msisdn_after_133010(self):
        self.muhasebe.access_token_encrypted = 'EAAB_coach_ok'
        self.muhasebe.phone_number_id = '905551112233'
        self.muhasebe.display_phone = '+905551112233'
        self.muhasebe.save(update_fields=['access_token_encrypted', 'phone_number_id', 'display_phone'])
        client = WhatsAppCloudClient(channel_config=self.muhasebe)

        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
            tmp.write(b'%PDF-1.4\n')
            tmp_path = tmp.name

        try:
            def _post(config, *args, **kwargs):
                if config.get('phone_number_id') == '109988776655':
                    return 'media_fixed_id'
                client.last_media_error = '(#133010) Account not registered'
                return None

            with patch.object(WhatsAppCloudClient, '_post_media_upload', side_effect=_post), patch.object(
                WhatsAppCloudClient,
                'list_waba_phone_numbers',
                return_value=[{'id': '109988776655', 'display_phone_number': '+90 555 111 22 33'}],
            ):
                media_id = client.upload_media(self.kurum.id, tmp_path, 'application/pdf')
            self.assertEqual(media_id, 'media_fixed_id')
            self.muhasebe.refresh_from_db()
            self.assertEqual(self.muhasebe.phone_number_id, '109988776655')
        finally:
            Path(tmp_path).unlink(missing_ok=True)
