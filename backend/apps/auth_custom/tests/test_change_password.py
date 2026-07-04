import json

from django.contrib.auth import get_user_model
from django.test import TestCase, Client

from apps.roller.models import Role, UserRole

User = get_user_model()

CHANGE_PASSWORD_URL = '/auth/api/change-password/'


class ChangePasswordApiTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='pw_user',
            email='pw_user@test.com',
            password='OldPass123!',
        )
        self.role, _ = Role.objects.get_or_create(
            code='test_pw_role',
            defaults={
                'name': 'Test PW Rol',
                'description': 'Şifre test rolü',
            },
        )
        UserRole.objects.create(
            user=self.user,
            role=self.role,
            must_change_password=True,
        )
        self.client = Client()

    def test_change_password_success(self):
        self.client.force_login(self.user)
        response = self.client.post(
            CHANGE_PASSWORD_URL,
            data=json.dumps({
                'current_password': 'OldPass123!',
                'new_password': 'NewPass456!',
                'new_password_confirm': 'NewPass456!',
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('NewPass456!'))

        user_role = UserRole.objects.get(user=self.user)
        self.assertFalse(user_role.must_change_password)

    def test_change_password_wrong_current(self):
        self.client.force_login(self.user)
        response = self.client.post(
            CHANGE_PASSWORD_URL,
            data=json.dumps({
                'current_password': 'WrongPass123!',
                'new_password': 'NewPass456!',
                'new_password_confirm': 'NewPass456!',
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()['success'])

    def test_change_password_mismatch(self):
        self.client.force_login(self.user)
        response = self.client.post(
            CHANGE_PASSWORD_URL,
            data=json.dumps({
                'current_password': 'OldPass123!',
                'new_password': 'NewPass456!',
                'new_password_confirm': 'Different456!',
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('eşleşmiyor', response.json()['error'])

    def test_change_password_requires_auth(self):
        response = self.client.post(
            CHANGE_PASSWORD_URL,
            data=json.dumps({
                'current_password': 'OldPass123!',
                'new_password': 'NewPass456!',
                'new_password_confirm': 'NewPass456!',
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 401)

    def test_me_includes_must_change_password(self):
        self.client.force_login(self.user)
        response = self.client.get('/auth/api/me/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['user']['must_change_password'])
