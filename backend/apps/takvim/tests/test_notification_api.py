"""
Bildirim uçları — oturum ve kurum bağlamı yanıtları.
"""
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.communication.domain.enums import Channel
from apps.communication.domain.models import Conversation
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.takvim.domain.models import AppNotification

User = get_user_model()


class NotificationContextResponseTest(TestCase):
    """Arka planda sürekli yoklanan uçlar doğru durum kodunu döndürmeli."""

    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Bildirim Kurum', kod='BLD')
        self.user = User.objects.create_user(username='bildirim', password='test')

    def test_summary_without_session_returns_401(self):
        res = self.client.get('/takvim/api/bildirimler/ozet/')
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get('code'), 'not_authenticated')

    def test_screen_without_session_returns_401(self):
        res = self.client.get('/takvim/api/bildirimler/ekran/?limit=5')
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json().get('code'), 'not_authenticated')

    def test_summary_without_kurum_returns_400(self):
        self.client.force_login(self.user)
        res = self.client.get('/takvim/api/bildirimler/ozet/')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json().get('code'), 'kurum_required')

    def test_summary_with_context_returns_200(self):
        self.client.force_login(self.user)
        res = self.client.get(
            '/takvim/api/bildirimler/ozet/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['success'])
        self.assertEqual(res.json()['data']['unread_count'], 0)

    def test_list_resolves_branch_from_conversation(self):
        sube = Sube.objects.create(kurum=self.kurum, ad='Kadıköy', kod='KDK')
        conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=sube,
            channel=Channel.WHATSAPP,
            contact_phone='+905550000111',
        )
        AppNotification.objects.create(
            kurum_id=self.kurum.id,
            user_id=self.user.id,
            baslik='WhatsApp: Ayşe',
            mesaj='Merhaba',
            url=f'/coach/sohbetler?conversation={conv.id}',
        )
        self.client.force_login(self.user)
        res = self.client.get(
            '/takvim/api/bildirimler/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 200, res.content)
        row = res.json()['data'][0]
        self.assertEqual(row['sube_ad'], 'Kadıköy')

    def test_dismiss_all_screen_messages(self):
        AppNotification.objects.create(
            kurum_id=self.kurum.id,
            user_id=self.user.id,
            baslik='Cevapsız sohbet',
            mesaj='30 dakikadır yanıtlanmadı',
            ekran_mesaji=True,
        )
        self.client.force_login(self.user)
        res = self.client.post(
            '/takvim/api/bildirimler/ekran/tumunu-kapat/',
            data='{}',
            content_type='application/json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['updated'], 1)
        self.assertFalse(
            AppNotification.objects.filter(user_id=self.user.id, ekran_gosterildi=False).exists(),
        )

    def test_mark_conversation_read_clears_screen_notification(self):
        from apps.takvim.infrastructure.repository import AppNotificationRepository

        conv_id = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'
        n = AppNotification.objects.create(
            kurum_id=self.kurum.id,
            user_id=self.user.id,
            baslik='Cevapsız sohbet: Ali',
            mesaj='30 dakikadır yanıtlanmadı',
            url=f'/admin/iletisim/sohbetler?conversation={conv_id}',
            ekran_mesaji=True,
            ekran_gosterildi=False,
            is_read=False,
        )
        updated = AppNotificationRepository.mark_conversation_read_for_user(
            self.user.id, self.kurum.id, conv_id,
        )
        self.assertEqual(updated, 1)
        n.refresh_from_db()
        self.assertTrue(n.ekran_gosterildi)
        self.assertTrue(n.is_read)

        # get_screen_messages should not return it anymore
        screens = AppNotificationRepository.get_screen_messages(self.user.id, self.kurum.id)
        self.assertEqual(screens.count(), 0)
