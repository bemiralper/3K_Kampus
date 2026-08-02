"""
Bildirim uçları — oturum ve kurum bağlamı yanıtları.
"""
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.kurum.domain.models import Kurum

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
