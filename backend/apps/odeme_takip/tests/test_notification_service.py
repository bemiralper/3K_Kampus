"""Ödeme notify servisi smoke testleri."""
from django.test import SimpleTestCase
from unittest.mock import MagicMock, patch

from apps.odeme_takip.application.notification_service import OdemeNotificationService


class OdemeNotifyServiceTests(SimpleTestCase):
    @patch('apps.odeme_takip.application.notification_service.list_outbound_veliler')
    @patch('apps.odeme_takip.application.notification_service.ContactResolver')
    @patch('apps.odeme_takip.application.notification_service.OdemeNotificationService._recipient_send_history')
    def test_build_recipients_calls_veli_helper(self, mock_history, mock_resolver, mock_veliler):
        mock_history.return_value = []
        mock_resolver.veli_allows_outbound.return_value = True
        veli = MagicMock()
        veli.id = 7
        veli.tam_ad = 'Test Veli'
        mock_veliler.return_value = [(veli, '+905551234567')]

        ogrenci = MagicMock()
        ogrenci.id = 3
        ogrenci.ad = 'Ali'
        ogrenci.soyad = 'Veli'
        ogrenci.telefon = '+905559876543'
        ogrenci.kurum = MagicMock(ad='3K Kampüs')

        recipients = OdemeNotificationService()._build_recipients(
            1,
            notify_type='plan',
            entity_id=10,
            ogrenci=ogrenci,
            sozlesme_no='SZ-001',
        )

        mock_veliler.assert_called_once_with(ogrenci)
        self.assertEqual(len(recipients), 2)
        self.assertEqual(recipients[0].display_name, 'Test Veli')
