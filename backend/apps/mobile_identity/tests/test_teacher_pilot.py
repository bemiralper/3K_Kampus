"""Pilot sızma kapısı. Jeton web oturumu açmaz; kapalı uçlar 404 kalır.

Bayrak kapanınca mobil uç yok olur, web girişi aynı sözleşmeyle durur.
"""
import json

from django.test import override_settings

from apps.mobile_identity.tests.test_teacher_read import TeacherReadTests

CLOSED_TEACHER_ROUTES = (
    '/api/teacher/messages/',
    '/api/teacher/device-tokens/',
    '/api/mobile/device-tokens/',
    '/api/teacher/students/1/homework/',
    '/api/teacher/students/1/attendance/',
)

WEB_SURFACES = (
    '/api/academic/class-lesson-plan/?all=true',
    '/api/communication/config/whatsapp/',
    '/finans/api/dashboard/overview/',
    '/api/coaching/students/',
)


class TeacherPilotLeakTests(TeacherReadTests):
    def test_bearer_does_not_open_web_modules(self):
        session = self.client.get('/auth/api/me/')
        self.assertFalse(session.json()['authenticated'])
        for path in WEB_SURFACES:
            response = self.client.get(path, **self.headers)
            self.assertIn(response.status_code, (401, 403), path)
        for path in CLOSED_TEACHER_ROUTES:
            response = self.client.get(path, **self.headers)
            self.assertEqual(response.status_code, 404, path)

    @override_settings(MOBILE_IDENTITY_ENABLED=False)
    def test_flag_off_hides_teacher_api_and_keeps_web_login(self):
        hidden = self._get(f'/api/teacher/home/?term_id={self.term.id}')
        self.assertEqual(hidden.status_code, 404)
        self.assertEqual(hidden.json()['code'], 'not_found')
        web = self.client.post(
            '/auth/api/login/',
            data=json.dumps({'username': 'okuma.ogretmen', 'password': 'Pass1234!'}),
            content_type='application/json',
        )
        self.assertEqual(web.status_code, 200, web.content)
        body = web.json()
        self.assertTrue(body['success'])
        self.assertNotIn('access', body)
        self.assertNotIn('refresh', body)
