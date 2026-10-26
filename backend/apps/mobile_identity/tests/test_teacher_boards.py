import json
from django.test import override_settings

from apps.mobile_identity.tests.test_teacher_read import TeacherReadTests


class TeacherBoardTests(TeacherReadTests):
    def _start(self, device_key='tahta-cihaz-0001'):
        response = self.client.post(
            '/api/board/display/start/',
            data=json.dumps({'device_key': device_key}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_pair_show_and_end_stay_on_this_teachers_lesson(self):
        started = self._start()
        paired = self.client.post(
            '/api/teacher/boards/',
            data=json.dumps({'code': started['pair_code']}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(paired.status_code, 200, paired.content)
        board_id = paired.json()['id']
        self.assertEqual(paired.json()['mine'], True)
        self.assertNotIn(started['poll_token'], paired.content.decode())

        hidden = self.client.post(
            f'/api/teacher/boards/{board_id}/show/',
            data=json.dumps({'term_id': self.term.id, 'plan_id': self.other_plan.id}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(hidden.status_code, 404, hidden.content)

        shown = self.client.post(
            f'/api/teacher/boards/{board_id}/show/',
            data=json.dumps({'term_id': self.term.id, 'plan_id': self.plan.id}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(shown.status_code, 200, shown.content)
        self.assertEqual(shown.json()['lesson'], 'Matematik · 12-A')
        poll = self.client.get(f"/api/board/display/?token={started['poll_token']}")
        self.assertEqual(poll.status_code, 200, poll.content)
        self.assertEqual(poll.json()['lesson'], 'Matematik · 12-A')
        self.assertNotIn('555', poll.content.decode())

        ended = self.client.post(
            f'/api/teacher/boards/{board_id}/end/',
            data='{}',
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(ended.status_code, 200, ended.content)
        cleared = self.client.get(f"/api/board/display/?token={started['poll_token']}")
        self.assertEqual(cleared.json()['state'], 'waiting')
        self.assertEqual(cleared.json()['lesson'], '')

    def test_unknown_code_and_other_branch_do_not_reveal_the_board(self):
        started = self._start('tahta-cihaz-0002')
        missing = self.client.post(
            '/api/teacher/boards/',
            data=json.dumps({'code': 'ZZZZZZZZ'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(missing.status_code, 404)
        foreign_headers = dict(self.headers)
        foreign_headers['HTTP_X_SUBE_ID'] = str(self.other_sube.id)
        foreign = self.client.post(
            '/api/teacher/boards/',
            data=json.dumps({'code': started['pair_code']}),
            content_type='application/json',
            **foreign_headers,
        )
        self.assertIn(foreign.status_code, (403, 404))
        waiting = self.client.get('/api/teacher/boards/', **self.headers)
        self.assertEqual(waiting.json()['results'], [])

    @override_settings(MOBILE_IDENTITY_ENABLED=False)
    def test_flag_off_hides_the_board(self):
        response = self.client.post(
            '/api/board/display/start/',
            data=json.dumps({'device_key': 'tahta-cihaz-0003'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['code'], 'not_found')
