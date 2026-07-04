"""
Öğrenci/veli telefonu değişince konuşma numarası senkronu.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.communication.application.conversation_phone_sync import sync_conversation_linked_phone
from apps.communication.domain.enums import Channel
from apps.communication.infrastructure.repository import ConversationRepository
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.sube.domain.models import Sube

User = get_user_model()


class ConversationPhoneSyncTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sync Kurum', kod='SYN')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SYN-S')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Ogrenci',
            telefon='0530 944 99 25',
            veli_telefon='0532 111 22 33',
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
        self.veli_conv, _ = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            '+905321112233',
            ogrenci_id=self.ogrenci.id,
            veli_id=self.veli.id,
        )
        self.student_conv, _ = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            '+905309449925',
            ogrenci_id=self.ogrenci.id,
        )

    def test_sync_updates_veli_thread_when_veli_phone_changes(self):
        self.veli.telefon = '0542 999 88 77'
        self.veli.save(update_fields=['telefon'])

        synced = sync_conversation_linked_phone(self.veli_conv)
        self.assertEqual(synced.contact_phone, '+905429998877')

    def test_student_thread_keeps_student_phone_not_veli(self):
        self.ogrenci.veli_telefon = '0555 444 33 22'
        self.ogrenci.save(update_fields=['veli_telefon'])

        synced = sync_conversation_linked_phone(self.student_conv)
        self.assertEqual(synced.contact_phone, '+905309449925')

    def test_sync_blocks_veli_to_student_when_veli_id_cleared(self):
        """veli_id silinmiş ama numara velide kalmış thread öğrenci numarasına taşınmamalı."""
        self.veli_conv.veli_id = None
        self.veli_conv.contact_phone = '+905321112233'
        self.veli_conv.save(update_fields=['veli_id', 'contact_phone', 'updated_at'])

        synced = sync_conversation_linked_phone(self.veli_conv)
        self.assertEqual(synced.contact_phone, '+905321112233')

    def test_sync_blocks_student_to_veli_phone_migration(self):
        """Öğrenci thread'i veli numarasına taşınmamalı."""
        self.student_conv.veli_id = None
        self.student_conv.contact_phone = '+905309449925'
        self.student_conv.save(update_fields=['veli_id', 'contact_phone', 'updated_at'])

        synced = sync_conversation_linked_phone(self.student_conv)
        self.assertEqual(synced.contact_phone, '+905309449925')

    def test_corrupted_veli_thread_at_student_phone_repairs_to_veli(self):
        """veli_id set iken numara öğrencide kalmışsa veli telefonuna onarılır."""
        corrupted = self.veli_conv
        corrupted.contact_phone = '+905309449925'
        corrupted.veli_id = self.veli.id
        corrupted.save(update_fields=['contact_phone', 'veli_id', 'updated_at'])

        synced = sync_conversation_linked_phone(corrupted)
        self.assertEqual(synced.contact_phone, '+905321112233')

    def test_send_from_veli_thread_uses_veli_phone_after_repair(self):
        from unittest.mock import MagicMock, patch

        from apps.communication.application.communication_service import (
            CommunicationService,
            MessageContent,
            RecipientQuery,
        )

        corrupted = self.veli_conv
        corrupted.contact_phone = '+905309449925'
        corrupted.veli_id = self.veli.id
        corrupted.save(update_fields=['contact_phone', 'veli_id', 'updated_at'])

        service = CommunicationService()
        with patch(
            'apps.communication.application.communication_service.process_queue_item',
            return_value=True,
        ) as mock_process:
            with patch.object(
                service._dispatcher,
                'get_client',
                return_value=MagicMock(),
            ):
                result = service.send(
                    self.kurum.id,
                    recipients=RecipientQuery(conversation_id=str(corrupted.id)),
                    content=MessageContent(text='Veli test'),
                    process_immediately=True,
                )

        self.assertTrue(result.success)
        corrupted.refresh_from_db()
        self.assertEqual(corrupted.contact_phone, '+905321112233')
        mock_process.assert_called_once()
        queue_item = mock_process.call_args[0][0]
        self.assertEqual(queue_item.message.conversation.contact_phone, '+905321112233')

    def test_veli_thread_never_migrates_to_student_phone(self):
        """Veli telefonu güncellendikten sonra veli thread öğrenci numarasına kaymamalı."""
        other_student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
            soyad='Diger',
            telefon='05367089450',
            aktif_mi=True,
        )
        self.veli_conv.ogrenci_id = other_student.id
        self.veli_conv.contact_phone = '+905363549545'
        self.veli_conv.veli_id = self.veli.id
        self.veli_conv.save(update_fields=['ogrenci_id', 'contact_phone', 'veli_id', 'updated_at'])
        self.veli.telefon = '05363549545'
        self.veli.save(update_fields=['telefon'])

        synced = sync_conversation_linked_phone(self.veli_conv)
        self.assertEqual(synced.contact_phone, '+905363549545')

    def test_resolve_outbound_phone_uses_veli_record(self):
        from apps.communication.application.conversation_phone_sync import resolve_outbound_phone

        self.veli_conv.contact_phone = '+905309449925'
        self.veli_conv.veli_id = self.veli.id
        self.veli_conv.save(update_fields=['contact_phone', 'veli_id', 'updated_at'])

        phone = resolve_outbound_phone(self.veli_conv)
        self.assertEqual(phone, '+905321112233')

    def test_find_by_phone_separates_student_and_veli(self):
        veli_found = ConversationRepository.find_by_phone(
            self.kurum.id, Channel.WHATSAPP, '+905321112233',
        )
        student_found = ConversationRepository.find_by_phone(
            self.kurum.id, Channel.WHATSAPP, '+905309449925',
        )
        self.assertEqual(veli_found.id, self.veli_conv.id)
        self.assertEqual(student_found.id, self.student_conv.id)
        self.assertNotEqual(veli_found.id, student_found.id)


class ConversationOpenVeliThreadTest(TestCase):
    """Veli telefonu ile açılışta veliId gönderilmezse veli thread kullanılmalı."""

    def setUp(self):
        from apps.roller.models import Permission, Role, RolePermission, UserRole

        self.kurum = Kurum.objects.create(ad='Open Kurum', kod='OPN')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='OPN-S')
        self.user = User.objects.create_user(username='openadmin', password='x')
        role, _ = Role.objects.get_or_create(
            code='admin',
            defaults={'name': 'Admin', 'level': 100, 'is_system_role': True},
        )
        for code in ('communication.read', 'communication.write'):
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={'name': code, 'module': 'communication', 'permission_type': 'read'},
            )
            RolePermission.objects.get_or_create(role=role, permission=perm)
        UserRole.objects.update_or_create(user=self.user, defaults={'role': role})

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
        self.student_conv, _ = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            '+905309449925',
            ogrenci_id=self.ogrenci.id,
        )
        self.veli_conv, _ = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            '+905321112233',
            ogrenci_id=self.ogrenci.id,
            veli_id=self.veli.id,
        )

        from rest_framework.test import APIClient

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_open_veli_phone_without_veli_id_uses_veli_thread(self):
        response = self.client.post(
            '/api/communication/conversations/open/',
            {
                'phone': '0532 111 22 33',
                'kurum_id': self.kurum.id,
                'ogrenci_id': self.ogrenci.id,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['contact_phone'], '+905321112233')
        self.assertEqual(data['veli_id'], self.veli.id)
        self.assertNotEqual(data['id'], str(self.student_conv.id))


class DuplicateConversationLookupTest(TestCase):
    """Aynı telefona bağlı birden fazla konuşma varken gönderim çökmemeli."""

    def setUp(self):
        from apps.communication.domain.models import Conversation

        self.kurum = Kurum.objects.create(ad='Dup Kurum', kod='DUP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DUP-S')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
            soyad='Ogrenci',
            telefon='0530 944 99 25',
            aktif_mi=True,
        )
        self.phone = '+905309449925'
        for _ in range(3):
            Conversation.objects.create(
                kurum=self.kurum,
                channel=Channel.WHATSAPP,
                contact_phone=self.phone,
                contact_type='OGRENCI',
                ogrenci=self.ogrenci,
            )

    def test_get_or_create_picks_student_thread_when_duplicates_exist(self):
        conv, created = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            self.phone,
            contact_type='OGRENCI',
            ogrenci_id=self.ogrenci.id,
        )
        self.assertFalse(created)
        self.assertEqual(conv.ogrenci_id, self.ogrenci.id)
        self.assertIsNone(conv.veli_id)
