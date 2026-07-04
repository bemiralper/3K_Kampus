"""Telefon değişikliği otomatik senkron testleri."""
from django.test import TestCase

from apps.communication.application.phone_change_sync import PhoneChangeSync
from apps.communication.domain.enums import Channel, RecipientType
from apps.communication.domain.models import ContactIdentity, Conversation
from apps.communication.infrastructure.repository import ConversationRepository
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.sube.domain.models import Sube


class PhoneChangeSyncTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Phone Sync Kurum', kod='PSK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PSK-S')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Ogrenci',
            telefon='05301112233',
            aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            ad='Ayşe',
            soyad='Veli',
            telefon='05304445566',
            veli_turu='anne',
            varsayilan=True,
        )
        self.veli_conv, _ = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            '+905304445566',
            contact_type=RecipientType.VELI,
            ogrenci_id=self.ogrenci.id,
            veli_id=self.veli.id,
        )
        self.student_conv, _ = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            '+905301112233',
            ogrenci_id=self.ogrenci.id,
        )

    def test_veli_save_signal_updates_conversation_phone(self):
        self.veli.telefon = '05429998877'
        self.veli.save()

        self.veli_conv.refresh_from_db()
        self.assertEqual(self.veli_conv.contact_phone, '+905429998877')
        identity = ContactIdentity.objects.get(kurum=self.kurum, e164='+905429998877')
        self.assertEqual(identity.veli_id, self.veli.id)

    def test_ogrenci_save_signal_updates_student_conversation(self):
        self.ogrenci.telefon = '05421112233'
        self.ogrenci.save()

        self.student_conv.refresh_from_db()
        self.assertEqual(self.student_conv.contact_phone, '+905421112233')

    def test_old_phone_identity_reconciled_after_veli_change(self):
        ContactIdentity.objects.filter(kurum=self.kurum, e164='+905304445566').update(
            veli_id=self.veli.id,
            ogrenci_id=self.ogrenci.id,
        )
        PhoneChangeSync.on_veli_saved(self.veli, old_phone='05304445566')
        self.veli.telefon = '05427776655'
        self.veli.save()

        stale = ContactIdentity.objects.filter(kurum=self.kurum, e164='+905304445566').first()
        self.assertTrue(stale is None or stale.veli_id is None)

    def test_veli_phone_change_does_not_move_to_student_number(self):
        self.ogrenci.telefon = '05309998877'
        self.ogrenci.save()
        self.veli_conv.contact_phone = '+905309998877'
        self.veli_conv.save(update_fields=['contact_phone', 'updated_at'])

        self.veli.telefon = '05305556644'
        self.veli.save()

        self.veli_conv.refresh_from_db()
        self.assertEqual(self.veli_conv.contact_phone, '+905305556644')
