"""
Öğrenci/veli telefonu değişince konuşma numarası senkronu.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.communication.application.conversation_phone_sync import sync_conversation_linked_phone
from apps.communication.domain.enums import Channel
from apps.communication.infrastructure.repository import ConversationRepository
from apps.communication.tests.session_helpers import open_session_window
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
        open_session_window(self.kurum.id, '+905321112233', '+905309449925')

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

    def test_open_student_phone_with_ogrenci_id_uses_student_thread(self):
        """Öğrenci ikonu — veli şablonuna düşmemeli."""
        response = self.client.post(
            '/api/communication/conversations/open/',
            {
                'phone': '0530 944 99 25',
                'kurum_id': self.kurum.id,
                'ogrenci_id': self.ogrenci.id,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['contact_phone'], '+905309449925')
        self.assertEqual(data['contact_type'], 'OGRENCI')
        self.assertIsNone(data.get('veli_id'))
        self.assertEqual(data['id'], str(self.student_conv.id))


class ConversationOpenCrossDepartmentTest(TestCase):
    """Muhasebe kullanıcısı koçluk thread'ini açmamalı — aynı numara olsa bile."""

    def setUp(self):
        from apps.communication.domain.enums import (
            CommunicationDepartment,
            MessageDirection,
            MessageStatus,
        )
        from apps.communication.domain.models import Message
        from apps.roller.models import Permission, Role, RolePermission, UserRole
        from rest_framework.test import APIClient

        self.kurum = Kurum.objects.create(ad='Cross Kurum', kod='CRS')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='CRS-S')
        role, _ = Role.objects.get_or_create(
            code='test_muhasebe_cross',
            defaults={'name': 'Muhasebe', 'level': 10, 'is_active': True},
        )
        for code in ('communication.read', 'communication.write', 'finans.read'):
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={'name': code, 'module': 'communication', 'permission_type': 'read'},
            )
            RolePermission.objects.get_or_create(role=role, permission=perm)

        self.user = User.objects.create_user(username='cross_muh', password='x')
        self.other = User.objects.create_user(username='cross_koc', password='x')
        UserRole.objects.update_or_create(user=self.user, defaults={'role': role})
        UserRole.objects.update_or_create(user=self.other, defaults={'role': role})

        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Cem',
            soyad='Ogrenci',
            telefon='0530 111 00 11',
            aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            ad='Zeynep',
            soyad='Veli',
            telefon='0532 111 00 22',
            veli_turu='anne',
            varsayilan=True,
        )
        self.coaching_conv, _ = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            '+905321110022',
            ogrenci_id=self.ogrenci.id,
            veli_id=self.veli.id,
            department=CommunicationDepartment.COACHING,
        )
        self._message = Message.objects.create(
            conversation=self.coaching_conv,
            direction=MessageDirection.OUTBOUND,
            body='Telafi dersi cumartesi 10.00',
            status=MessageStatus.SENT,
            sender_user=self.user,
            source_module='ozel_ders',
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def _open(self):
        return self.client.post(
            '/api/communication/conversations/open/',
            {
                'phone': '0532 111 00 22',
                'kurum_id': self.kurum.id,
                'veli_id': self.veli.id,
            },
            format='json',
        )

    def test_sender_does_not_open_other_department_thread(self):
        response = self._open()
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.json()['id'], str(self.coaching_conv.id))
        self.assertEqual(response.json().get('department'), 'ACCOUNTING')

    def test_explicit_department_opens_that_thread(self):
        response = self.client.post(
            '/api/communication/conversations/open/',
            {
                'phone': '0532 111 00 22',
                'kurum_id': self.kurum.id,
                'veli_id': self.veli.id,
                'department': 'COACHING',
            },
            format='json',
        )
        # Muhasebe kullanıcısı koçluk departmanını isteyemez — kendi biriminde kalır
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.json()['id'], str(self.coaching_conv.id))
        self.assertEqual(response.json().get('department'), 'ACCOUNTING')

    def test_non_sender_does_not_inherit_other_department_thread(self):
        self._message.sender_user = self.other
        self._message.save(update_fields=['sender_user'])

        response = self._open()
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.json()['id'], str(self.coaching_conv.id))


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


class ConversationOpenPersonelThreadTest(TestCase):
    """Personel telefonu veli/öğrenci ile çakışınca şube kapısı engellememeli."""

    def setUp(self):
        from apps.personel.domain.models import Personel
        from apps.roller.models import Permission, Role, RolePermission, UserRole

        self.kurum = Kurum.objects.create(ad='Pers Open', kod='POP')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='A', kod='POP-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='B', kod='POP-B')
        self.user = User.objects.create_user(username='persopen', password='x')
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

        shared_phone = '0533 444 55 66'
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            ad='Ogr',
            soyad='B',
            telefon=shared_phone,
            aktif_mi=True,
        )
        self.personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Pers',
            soyad='A',
            cep_telefon=shared_phone,
        )

        from rest_framework.test import APIClient

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube_a.id)

    def test_open_personel_skips_student_sube_gate(self):
        # personel_id yokken aynı telefon öğrenciye bağlanır → şube B ≠ A → 403
        blocked = self.client.post(
            '/api/communication/conversations/open/',
            {'phone': '0533 444 55 66', 'kurum_id': self.kurum.id},
            format='json',
        )
        self.assertEqual(blocked.status_code, 403)

        ok = self.client.post(
            '/api/communication/conversations/open/',
            {
                'phone': '0533 444 55 66',
                'kurum_id': self.kurum.id,
                'personel_id': self.personel.id,
            },
            format='json',
        )
        self.assertEqual(ok.status_code, 200, ok.content)
        data = ok.json()
        self.assertEqual(data['contact_type'], 'PERSONEL')
        self.assertIn('Pers', data.get('contact_name') or '')
        self.assertNotEqual(data.get('contact_name'), data.get('contact_phone'))
        self.assertIsNone(data.get('ogrenci_id'))
        self.assertIsNone(data.get('veli_id'))

    def test_personel_message_post_works_across_sube_mismatch(self):
        """GET zaten şube fallback yapıyordu; POST da aynı yolu kullanmalı."""
        from unittest.mock import patch

        from apps.communication.application.communication_service import SendResult
        from apps.communication.domain.enums import Channel, MessageStatus, RecipientType
        from apps.communication.domain.models import Conversation, Message

        conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            channel=Channel.WHATSAPP,
            contact_phone='+905334445566',
            contact_type=RecipientType.PERSONEL,
            subject='Pers A',
        )
        msg = Message.objects.create(
            conversation=conv,
            direction='OUTBOUND',
            message_type='TEXT',
            body='merhaba',
            status=MessageStatus.SENT,
            provider_message_id='wamid.test',
        )
        with patch(
            'apps.communication.interfaces.views.messages.CommunicationService.send',
            return_value=SendResult(success=True, message_id=str(msg.id)),
        ):
            resp = self.client.post(
                f'/api/communication/conversations/{conv.id}/messages/',
                {'text': 'merhaba', 'kurum_id': self.kurum.id},
                format='json',
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        conv.refresh_from_db()
        self.assertEqual(conv.sube_id, self.sube_a.id)


class SamePersonReusesThreadAcrossAccountsTest(TestCase):
    """Aynı kişiye farklı WhatsApp hesabından giden mesaj yeni satır açmamalı."""

    def setUp(self):
        from apps.communication.domain.models import CommunicationChannelConfig

        self.kurum = Kurum.objects.create(ad='Tek Thread', kod='TTH')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='TTH-S')
        self.acc_muh = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Muhasebe',
            phone_number_id='pn_muh',
            is_active=True,
        )
        self.acc_koc = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Koçluk',
            phone_number_id='pn_koc',
            is_active=True,
        )
        self.phone = '+905551110099'

    def test_second_account_reuses_existing_person_thread(self):
        from apps.communication.domain.enums import CommunicationDepartment

        first, created = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            self.phone,
            contact_type='PERSONEL',
            channel_config=self.acc_muh,
            channel_config_id=self.acc_muh.id,
            department=CommunicationDepartment.ACCOUNTING,
        )
        self.assertTrue(created)
        second, created = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            self.phone,
            contact_type='PERSONEL',
            channel_config=self.acc_koc,
            channel_config_id=self.acc_koc.id,
            department=CommunicationDepartment.ACCOUNTING,
        )
        self.assertFalse(created)
        self.assertEqual(first.id, second.id)
        second.refresh_from_db()
        self.assertEqual(second.channel_config_id, self.acc_koc.id)

    def test_same_line_keeps_coaching_and_accounting_apart(self):
        from apps.communication.domain.enums import CommunicationDepartment

        acc, created_a = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            self.phone,
            contact_type='PERSONEL',
            channel_config=self.acc_koc,
            channel_config_id=self.acc_koc.id,
            department=CommunicationDepartment.ACCOUNTING,
        )
        koc, created_k = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            self.phone,
            contact_type='PERSONEL',
            channel_config=self.acc_koc,
            channel_config_id=self.acc_koc.id,
            department=CommunicationDepartment.COACHING,
        )
        self.assertTrue(created_a)
        self.assertTrue(created_k)
        self.assertNotEqual(acc.id, koc.id)

    def test_phone_format_variants_reuse_thread(self):
        first, _ = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            self.phone,
            contact_type='PERSONEL',
        )
        again, created = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            '05551110099',
            contact_type='PERSONEL',
        )
        self.assertFalse(created)
        self.assertEqual(first.id, again.id)


class ConversationMergeTest(TestCase):
    def test_merge_moves_messages_and_deletes_duplicates(self):
        from apps.communication.application.conversation_merge import merge_duplicate_conversations
        from apps.communication.domain.enums import MessageDirection, MessageStatus
        from apps.communication.domain.models import Conversation, Message

        kurum = Kurum.objects.create(ad='Merge Kurum', kod='MRG')
        phone = '+905551110088'
        keep = Conversation.objects.create(
            kurum=kurum,
            channel=Channel.WHATSAPP,
            contact_phone=phone,
            contact_type='PERSONEL',
            contact_name='Taner Alper',
        )
        extra = Conversation.objects.create(
            kurum=kurum,
            channel=Channel.WHATSAPP,
            contact_phone='05551110088',
            contact_type='PERSONEL',
            contact_name='Taner Alper',
        )
        Message.objects.create(
            conversation=keep,
            direction=MessageDirection.OUTBOUND,
            body='bir',
            status=MessageStatus.SENT,
        )
        Message.objects.create(
            conversation=extra,
            direction=MessageDirection.OUTBOUND,
            body='iki',
            status=MessageStatus.SENT,
        )
        result = merge_duplicate_conversations(kurum.id)
        self.assertEqual(result['removed'], 1)
        self.assertEqual(Conversation.objects.filter(kurum=kurum).count(), 1)
        winner = Conversation.objects.get(kurum=kurum)
        self.assertEqual(winner.messages.count(), 2)

    def test_merge_keeps_coaching_and_accounting_separate(self):
        from apps.communication.application.conversation_merge import merge_duplicate_conversations
        from apps.communication.domain.enums import CommunicationDepartment
        from apps.communication.domain.models import Conversation

        kurum = Kurum.objects.create(ad='Merge Dept', kod='MRD')
        phone = '+905551110077'
        Conversation.objects.create(
            kurum=kurum, channel=Channel.WHATSAPP, contact_phone=phone,
            contact_type='PERSONEL', department=CommunicationDepartment.COACHING,
        )
        Conversation.objects.create(
            kurum=kurum, channel=Channel.WHATSAPP, contact_phone=phone,
            contact_type='PERSONEL', department=CommunicationDepartment.ACCOUNTING,
        )
        result = merge_duplicate_conversations(kurum.id)
        self.assertEqual(result['removed'], 0)
        self.assertEqual(Conversation.objects.filter(kurum=kurum).count(), 2)
