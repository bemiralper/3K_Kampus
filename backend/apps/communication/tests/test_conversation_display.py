"""
Sohbet / bildirim gösterim adı — kayıtlı veli/öğrenci/personel varsa
telefon yerine isim dönmeli.
"""
from django.test import TestCase

from apps.communication.application.conversation_display import (
    looks_like_phone,
    resolve_conversation_display_name,
    sync_conversation_display_name,
)
from apps.communication.domain.enums import Channel, RecipientType
from apps.communication.domain.models import Conversation
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.sube.domain.models import Sube


class LooksLikePhoneTest(TestCase):
    def test_empty_or_none_is_phone_like(self):
        self.assertTrue(looks_like_phone(None))
        self.assertTrue(looks_like_phone(''))
        self.assertTrue(looks_like_phone('   '))

    def test_plain_name_is_not_phone_like(self):
        self.assertFalse(looks_like_phone('Ayşe Yılmaz'))

    def test_e164_number_is_phone_like(self):
        self.assertTrue(looks_like_phone('+905321112233'))

    def test_matches_given_contact_phone(self):
        self.assertTrue(looks_like_phone('0532 111 22 33', contact_phone='+905321112233'))

    def test_mostly_digits_without_plus_is_phone_like(self):
        self.assertTrue(looks_like_phone('905321112233'))


class ResolveConversationDisplayNameTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Display Test', kod='DSP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DSP-S')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Ogrenci',
            telefon='0530 944 99 25',
            aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            ad='Ayşe',
            soyad='Veli',
            telefon='0532 111 22 33',
            veli_turu='anne',
            varsayilan=True,
        )

    def _conv(self, **kwargs):
        defaults = dict(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905321112233',
            contact_type=RecipientType.VELI,
        )
        defaults.update(kwargs)
        return Conversation.objects.create(**defaults)

    def test_contact_name_equal_to_phone_resolves_via_linked_veli(self):
        conv = self._conv(veli=self.veli, contact_name='+905321112233')
        name = resolve_conversation_display_name(conv, allow_live_lookup=False)
        self.assertEqual(name, self.veli.tam_ad)
        self.assertFalse(looks_like_phone(name))

    def test_contact_name_equal_to_phone_resolves_via_linked_ogrenci(self):
        conv = self._conv(
            contact_phone='+905309449925',
            ogrenci=self.ogrenci,
            contact_type=RecipientType.OGRENCI,
            contact_name='+905309449925',
        )
        name = resolve_conversation_display_name(conv, allow_live_lookup=False)
        self.assertEqual(name, 'Ali Ogrenci')

    def test_real_stored_name_is_kept(self):
        conv = self._conv(contact_type=RecipientType.RAW_PHONE, contact_name='Bilinmeyen Kişi')
        name = resolve_conversation_display_name(conv, allow_live_lookup=False)
        self.assertEqual(name, 'Bilinmeyen Kişi')

    def test_no_link_and_no_name_falls_back_to_phone(self):
        conv = self._conv(contact_type=RecipientType.RAW_PHONE, contact_name='')
        name = resolve_conversation_display_name(conv, allow_live_lookup=False)
        self.assertEqual(name, '+905321112233')

    def test_wa_profile_name_used_when_no_other_source(self):
        conv = self._conv(contact_type=RecipientType.RAW_PHONE, contact_name='')
        name = resolve_conversation_display_name(
            conv, wa_profile_name='Mehmet K.', allow_live_lookup=False,
        )
        self.assertEqual(name, 'Mehmet K.')


class SyncConversationDisplayNameTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sync Display', kod='SDP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SDP-S')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Veli',
            soyad='Ogrenci',
            telefon='0530 944 99 25',
            aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            ad='Ayşe',
            soyad='Veli',
            telefon='0532 111 22 33',
            veli_turu='anne',
            varsayilan=True,
        )

    def test_sync_persists_real_name_and_never_writes_phone(self):
        conv = Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905321112233',
            contact_type=RecipientType.VELI,
            veli=self.veli,
            contact_name='+905321112233',
        )
        name = sync_conversation_display_name(conv, save=True)
        conv.refresh_from_db()
        self.assertEqual(name, self.veli.tam_ad)
        self.assertEqual(conv.contact_name, self.veli.tam_ad)
        self.assertFalse(looks_like_phone(conv.contact_name, conv.contact_phone))

    def test_sync_clears_stale_phone_written_as_name(self):
        conv = Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905550001122',
            contact_type=RecipientType.RAW_PHONE,
            contact_name='+905550001122',
        )
        sync_conversation_display_name(conv, save=True)
        conv.refresh_from_db()
        self.assertEqual(conv.contact_name, '')
