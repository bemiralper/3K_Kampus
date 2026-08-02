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
