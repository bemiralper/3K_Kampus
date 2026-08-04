"""Doğum günü görsel seçimi ve gönderim job testleri."""
from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from apps.communication.application.birthday_media_service import BirthdayMediaService
from apps.communication.application.birthday_wish_service import (
    select_birthday_media,
    send_birthday_wishes_for_kurum,
)
from apps.communication.application.notification_events import get_event
from apps.communication.domain.models import BirthdayMediaAsset, BirthdayWishLog
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.sube.domain.models import Sube

User = get_user_model()


class BirthdayMediaSelectTest(TestCase):
    def test_deterministic_selection(self):
        assets = [type('A', (), {'id': i})() for i in range(5)]
        a = select_birthday_media(assets, ogrenci_id=42, year=2026)
        b = select_birthday_media(assets, ogrenci_id=42, year=2026)
        self.assertIs(a, b)
        c = select_birthday_media(assets, ogrenci_id=43, year=2026)
        # farklı öğrenci farklı index üretebilir; en azından geçerli
        self.assertIn(c, assets)


class BirthdayEventCatalogTest(TestCase):
    def test_event_exists_for_student_only(self):
        event = get_event('ogrenci.dogum_gunu')
        self.assertIsNotNone(event)
        self.assertTrue(event.has_image)
        self.assertEqual(event.recipients, ('OGRENCI',))


class BirthdayWishServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Bday Kurum', kod='BDAY')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='BDAY-M')
        self.ey = EgitimYili.objects.create(
            baslangic_yil=2025,
            bitis_yil=2026,
            aktif_mi=True,
        )
        self.today = date(2026, 8, 5)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Yılmaz',
            tc_kimlik_no='11111111110',
            dogum_tarihi=date(2010, 8, 5),
            telefon='05551112233',
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ogrenci=self.ogrenci,
            egitim_yili=self.ey,
            aktif_mi=True,
        )
        png = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01'
            b'\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00'
            b'\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18'
            b'\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        self.asset = BirthdayMediaService().upload(
            self.kurum.id,
            SimpleUploadedFile('bday.png', png, content_type='image/png'),
            sube_id=None,
        )

    @patch('apps.communication.application.birthday_wish_service.dispatch_event')
    def test_sends_once_per_year(self, mock_dispatch):
        from apps.communication.application.communication_service import SendResult

        mock_dispatch.return_value = SendResult(success=True, message_id=None)
        run1 = send_birthday_wishes_for_kurum(self.kurum.id, on_date=self.today)
        self.assertEqual(run1.sent, 1)
        self.assertEqual(BirthdayWishLog.objects.filter(kurum=self.kurum).count(), 1)

        run2 = send_birthday_wishes_for_kurum(self.kurum.id, on_date=self.today)
        self.assertEqual(run2.sent, 0)
        self.assertEqual(run2.skipped, 1)

    def test_skips_without_media(self):
        BirthdayMediaAsset.objects.filter(kurum=self.kurum).delete()
        run = send_birthday_wishes_for_kurum(self.kurum.id, on_date=self.today)
        self.assertEqual(run.sent, 0)
        self.assertTrue(any(d['status'] == 'no_media' for d in run.details))
