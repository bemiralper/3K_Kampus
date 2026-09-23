"""Faz 5 — sohbet listesi performans/sayfalama: cursor, artımlı mesajlar, toplu okundu, ad prefetch."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from apps.communication.application.conversation_display import prefetch_linked_student_names
from apps.communication.domain.enums import Channel, ConversationStatus, MessageDirection, MessageStatus
from apps.communication.domain.models import Conversation, ConversationUserState, Message
from apps.communication.infrastructure.repository import ConversationRepository, MessageRepository
from apps.kurum.domain.models import Kurum
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


class ConversationListPagingTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Perf Kurum', kod='PRF')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PRF-M')
        self.admin = User.objects.create_user(username='prf-admin', password='x')
        _grant(self.admin, 'prf_manage', 'communication.manage', 'communication.read')
        Personel.objects.create(kurum=self.kurum, sube=self.sube, ad='Ad', soyad='Min', user=self.admin)
        self.client.force_authenticate(user=self.admin)
        self.hdr = {'HTTP_X_KURUM_ID': str(self.kurum.id), 'HTTP_X_SUBE_ID': str(self.sube.id)}

        base = timezone.now()
        self.convs = []
        for i in range(7):
            self.convs.append(Conversation.objects.create(
                kurum=self.kurum, sube=self.sube, channel=Channel.WHATSAPP,
                contact_phone=f'+90532100000{i}',
                last_message_at=base - timedelta(minutes=i),
                unread_count_coach=1,
            ))
        # Aynı last_message_at'e sahip iki satır — id ikincil sırası çalışmalı
        tie = base - timedelta(minutes=2)
        self.convs.append(Conversation.objects.create(
            kurum=self.kurum, sube=self.sube, channel=Channel.WHATSAPP,
            contact_phone='+905321000099', last_message_at=tie, unread_count_coach=1,
        ))
        # Hiç mesajı olmayan (last_message_at NULL) — en sonda gelmeli
        self.convs.append(Conversation.objects.create(
            kurum=self.kurum, sube=self.sube, channel=Channel.WHATSAPP,
            contact_phone='+905321000098', unread_count_coach=1,
        ))

    def _page(self, **params):
        params.setdefault('kurum_id', self.kurum.id)
        res = self.client.get('/api/communication/conversations/', params, **self.hdr)
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def test_cursor_pagination_visits_every_row_exactly_once(self):
        seen: list[str] = []
        data = self._page(limit=3)
        seen.extend(c['id'] for c in data['conversations'])
        self.assertTrue(data['has_more'])
        self.assertTrue(data['next_cursor'])
        guard = 0
        while data.get('next_cursor') and guard < 10:
            guard += 1
            data = self._page(limit=3, cursor=data['next_cursor'])
            seen.extend(c['id'] for c in data['conversations'])
        self.assertEqual(len(seen), len(set(seen)), 'imleç sayfalaması satır tekrarladı')
        self.assertEqual(set(seen), {str(c.id) for c in self.convs})
        # NULL last_message_at satırı en sonda
        self.assertEqual(seen[-1], str(self.convs[-1].id))

    def test_cursor_pagination_is_stable_when_new_row_arrives(self):
        first = self._page(limit=3)
        first_ids = [c['id'] for c in first['conversations']]
        # Yeni bir sohbet en üste gelir — offset sayfalamada ikinci sayfa kayardı
        Conversation.objects.create(
            kurum=self.kurum, sube=self.sube, channel=Channel.WHATSAPP,
            contact_phone='+905321000077', last_message_at=timezone.now() + timedelta(minutes=5),
        )
        second = self._page(limit=3, cursor=first['next_cursor'])
        second_ids = [c['id'] for c in second['conversations']]
        self.assertFalse(set(first_ids) & set(second_ids))

    def test_invalid_cursor_falls_back_to_first_page(self):
        data = self._page(limit=3, cursor='bozuk-imlec')
        self.assertEqual(len(data['conversations']), 3)

    def test_list_without_limit_is_capped(self):
        for i in range(105):
            Conversation.objects.create(
                kurum=self.kurum, sube=self.sube, channel=Channel.WHATSAPP,
                contact_phone=f'+9053299{i:05d}', last_message_at=timezone.now(),
            )
        data = self._page()
        self.assertEqual(len(data['conversations']), 100)
        self.assertTrue(data['has_more'])
        self.assertTrue(data['next_cursor'])

    def _link_students(self, convs):
        for i, conv in enumerate(convs):
            ogr = Ogrenci.objects.create(
                kurum=self.kurum, sube=self.sube, ad=f'Ogr{i}{conv.contact_phone[-3:]}', soyad='Test',
                aktif_mi=True,
            )
            veli = OgrenciVeli.objects.create(
                ogrenci=ogr, ad=f'Veli{i}', soyad='Test', telefon=conv.contact_phone,
            )
            conv.ogrenci = ogr
            conv.veli = veli
            conv.save(update_fields=['ogrenci', 'veli'])

    def test_list_query_count_does_not_grow_with_rows(self):
        # Veli + öğrenci bağlı sohbetler: sorgu sayısı satır sayısıyla artmamalı (P-01)
        self._link_students(self.convs[:2])
        with CaptureQueriesContext(connection) as ctx:
            self._page(limit=2)
        n_small = len(ctx.captured_queries)

        self._link_students(self.convs[2:9])
        with CaptureQueriesContext(connection) as ctx:
            data = self._page(limit=30)
        self.assertEqual(len(data['conversations']), 9)
        self.assertTrue(all(c['ogrenci_ad'] for c in data['conversations']))
        self.assertLessEqual(len(ctx.captured_queries), n_small + 2, 'liste sorgu sayısı satırla büyüyor')


class MessagesSinceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Since Kurum', kod='SNC')
        self.conv = Conversation.objects.create(
            kurum=self.kurum, channel=Channel.WHATSAPP, contact_phone='+905321000001',
        )
        now = timezone.now()
        self.m1 = Message.objects.create(
            conversation=self.conv, direction=MessageDirection.OUTBOUND, body='1',
            status=MessageStatus.SENT, created_at=now - timedelta(minutes=3),
        )
        self.m2 = Message.objects.create(
            conversation=self.conv, direction=MessageDirection.OUTBOUND, body='2',
            status=MessageStatus.SENT, created_at=now - timedelta(minutes=2),
        )
        # Fixture: "oluşturuldu, hiç değişmedi" durumu
        for m in (self.m1, self.m2):
            Message.objects.filter(id=m.id).update(updated_at=m.created_at)

    def test_list_since_returns_new_and_status_updated_messages(self):
        # Anchor m2: hiç yeni yok
        self.assertEqual(list(MessageRepository.list_since(self.conv.id, after_id=self.m2.id)), [])
        # m1 teslim edildi (updated_at ilerler) → artımlı yanıtta görünmeli
        Message.objects.filter(id=self.m1.id).update(
            status=MessageStatus.DELIVERED, updated_at=timezone.now(),
        )
        ids = {m.id for m in MessageRepository.list_since(self.conv.id, after_id=self.m2.id)}
        self.assertIn(self.m1.id, ids)
        # Yeni mesaj da gelir
        m3 = Message.objects.create(
            conversation=self.conv, direction=MessageDirection.INBOUND, body='3',
        )
        ids = {m.id for m in MessageRepository.list_since(self.conv.id, after_id=self.m2.id)}
        self.assertIn(m3.id, ids)


class ReadAllBulkTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='RA Kurum', kod='RAK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='RAK-M')
        self.user = User.objects.create_user(username='rak-coach', password='x')
        # communication.write + ogrenci.read: personel mesajlaşma yolu (yönetici değil → sayaçlar sıfırlanır)
        _grant(self.user, 'rak_write', 'communication.read', 'communication.write', 'ogrenci.read')
        Personel.objects.create(kurum=self.kurum, sube=self.sube, ad='Ko', soyad='Ç', user=self.user)
        self.client.force_authenticate(user=self.user)
        self.hdr = {'HTTP_X_KURUM_ID': str(self.kurum.id), 'HTTP_X_SUBE_ID': str(self.sube.id)}
        self.convs = [
            Conversation.objects.create(
                kurum=self.kurum, sube=self.sube, channel=Channel.WHATSAPP,
                contact_phone=f'+90533100000{i}', unread_count_coach=2,
                status=ConversationStatus.NEW, last_message_at=timezone.now(),
                claimed_by_user=self.user,
            )
            for i in range(4)
        ]

    def _post_read_all(self):
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.post(
                '/api/communication/conversations/read-all/', {'kurum_id': self.kurum.id},
                format='json', **self.hdr,
            )
        self.assertEqual(res.status_code, 200, res.content)
        return res.json(), len(ctx.captured_queries)

    def test_bulk_mark_all_read_updates_every_row_in_bounded_queries(self):
        data, n_small = self._post_read_all()
        self.assertEqual(data['updated'], 4)
        for conv in self.convs:
            conv.refresh_from_db()
            self.assertEqual(conv.unread_count_coach, 0)
            self.assertEqual(conv.status, ConversationStatus.READ)
        states = ConversationUserState.objects.filter(user=self.user, conversation__in=self.convs)
        self.assertEqual(states.count(), 4)
        self.assertTrue(all(s.notif_cleared_at for s in states))

    def test_read_all_query_count_does_not_grow_with_rows(self):
        _, n_small = self._post_read_all()
        for i in range(12):
            Conversation.objects.create(
                kurum=self.kurum, sube=self.sube, channel=Channel.WHATSAPP,
                contact_phone=f'+9053320000{i:02d}', unread_count_coach=1,
                status=ConversationStatus.NEW, last_message_at=timezone.now(),
                claimed_by_user=self.user,
            )
        data, n_big = self._post_read_all()
        self.assertEqual(data['updated'], 12)
        # Satır başına döngü olsaydı 12 satır ≥ 24 ek sorgu üretirdi
        self.assertLessEqual(n_big, n_small + 2)

    def test_mark_all_read_bulk_repository_returns_zero_for_empty(self):
        qs = Conversation.objects.none()
        self.assertEqual(ConversationRepository.mark_all_read_bulk(qs, self.user, reset_counters=True), 0)


class PrefetchLinkedNamesTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='PF Kurum', kod='PFK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PFK-M')
        self.ogr1 = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Kaya', aktif_mi=True,
        )
        self.ogr2 = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Kaya', aktif_mi=True,
        )
        self.pasif = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Pasif', soyad='Kaya', aktif_mi=False,
        )
        phone = '+905341234567'
        self.veli1 = OgrenciVeli.objects.create(ogrenci=self.ogr1, ad='Veli', soyad='Kaya', telefon=phone)
        OgrenciVeli.objects.create(ogrenci=self.ogr2, ad='Veli', soyad='Kaya', telefon=phone)
        OgrenciVeli.objects.create(ogrenci=self.pasif, ad='Veli', soyad='Kaya', telefon=phone)
        self.conv = Conversation.objects.create(
            kurum=self.kurum, sube=self.sube, channel=Channel.WHATSAPP,
            contact_phone=phone, veli=self.veli1, ogrenci=self.ogr1,
        )

    def test_prefetch_matches_single_row_resolution(self):
        from apps.communication.application.contact_resolver import ContactResolver
        from apps.communication.application.conversation_display import (
            linked_student_names_for_conversation,
        )

        ContactResolver.invalidate_kurum_lookup_maps(self.kurum.id)
        conv = Conversation.objects.select_related('veli', 'ogrenci').get(id=self.conv.id)
        bulk = prefetch_linked_student_names([conv])
        single = linked_student_names_for_conversation(conv)
        self.assertEqual(bulk[str(conv.id)], single)
        self.assertEqual(set(single), {'Ali Kaya', 'Ayşe Kaya'})
        self.assertNotIn('Pasif Kaya', single)
