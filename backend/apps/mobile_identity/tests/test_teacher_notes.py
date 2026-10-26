import json
import time
from datetime import date
from unittest.mock import patch

from apps.academic.domain.class_lesson_teacher_assignment import (
    ClassLessonTeacherAssignment,
    TeacherRole,
)
from apps.mobile_identity.drive import DriveError
from apps.mobile_identity.models import DersNotu
from apps.mobile_identity.tests.test_teacher_read import TeacherReadTests
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

User = get_user_model()
WHEN = date(2026, 10, 24)


class TeacherNoteTests(TeacherReadTests):
    def setUp(self):
        super().setUp()
        self.helper_user = User.objects.create_user(username='not.yardimci', password='Pass1234!')
        self.helper = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Berk', soyad='Yardımcı',
            user=self.helper_user, aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            personel=self.helper, egitim_yili=self.year, rol=self.role,
            gorev_sube=self.sube, kurum=self.kurum, aktif_mi=True,
        )
        ClassLessonTeacherAssignment.objects.create(
            egitim_yili=self.year, class_lesson_plan=self.plan,
            ogretmen=self.helper, role=TeacherRole.SECONDARY, is_active=True,
        )
        helper_token = self.client.post(
            '/api/mobile/auth/token/',
            data=json.dumps({
                'username': 'not.yardimci',
                'password': 'Pass1234!',
                'device_id': 'yardimci-telefon',
            }),
            content_type='application/json',
        )
        self.helper_headers = {
            **self.headers,
            'HTTP_AUTHORIZATION': f"Bearer {helper_token.json()['access']}",
        }

    def _file(self, name='konu.pdf', content=b'%PDF-1.4 deneme', content_type='application/pdf'):
        return SimpleUploadedFile(name, content, content_type=content_type)

    def _post(self, key='not-1', plan_id=None, upload=None, when=WHEN, headers=None):
        return self.client.post(
            f'/api/teacher/classes/{plan_id or self.plan.id}/notes/',
            data={
                'term_id': self.term.id,
                'session_date': when.isoformat(),
                'file': upload or self._file(),
            },
            HTTP_IDEMPOTENCY_KEY=key,
            **(headers or self.headers),
        )

    @patch('apps.mobile_identity.teacher_notes.store_file', return_value='drive-1')
    def test_primary_saves_the_file_id_and_lists_it(self, store):
        saved = self._post()
        self.assertEqual(saved.status_code, 201, saved.content)
        body = saved.json()
        self.assertEqual(body['file_name'], '2026-10-24 konu.pdf')
        self.assertEqual(body['mime_type'], 'application/pdf')
        self.assertEqual(DersNotu.objects.get(id=body['id']).drive_file_id, 'drive-1')
        folders, name, mime, data = store.call_args.args
        self.assertEqual(folders, ['2026-2027', '12-A', 'Matematik'])
        self.assertEqual(name, '2026-10-24 konu.pdf')
        self.assertEqual(mime, 'application/pdf')
        self.assertTrue(data.startswith(b'%PDF'))
        listed = self.client.get(
            f'/api/teacher/classes/{self.plan.id}/notes/?term_id={self.term.id}',
            **self.headers,
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()['results'][0]['id'], body['id'])
        self.assertNotIn('drive_file_id', listed.json()['results'][0])

    @patch('apps.mobile_identity.teacher_notes.store_file', return_value='drive-2')
    def test_repeat_key_does_not_upload_again(self, store):
        first = self._post(key='ayni')
        second = self._post(key='ayni')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()['id'], second.json()['id'])
        self.assertEqual(store.call_count, 1)
        self.assertEqual(DersNotu.objects.count(), 1)

    def test_assistant_and_other_class_cannot_upload(self):
        helper = self._post(headers=self.helper_headers)
        self.assertEqual(helper.status_code, 403)
        other = self._post(plan_id=self.other_plan.id)
        self.assertEqual(other.status_code, 404)
        self.assertEqual(DersNotu.objects.count(), 0)

    def test_only_pdf_and_images_are_accepted(self):
        rejected = self._post(upload=self._file('not.txt', b'metin', 'text/plain'))
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(rejected.json()['message'], 'Yalnız PDF veya görsel yüklenebilir.')

    @patch('apps.mobile_identity.teacher_notes.fetch_file', return_value=b'%PDF-1.4 deneme')
    @patch('apps.mobile_identity.teacher_notes.store_file', return_value='drive-3')
    def test_assigned_teacher_can_open_the_file(self, _store, _fetch):
        saved = self._post()
        opened = self.client.get(f"/api/teacher/notes/{saved.json()['id']}/file/", **self.helper_headers)
        self.assertEqual(opened.status_code, 200)
        self.assertEqual(opened['Content-Type'], 'application/pdf')
        self.assertEqual(opened.content, b'%PDF-1.4 deneme')
        stranger = self.client.get(
            f"/api/teacher/notes/{saved.json()['id']}/file/",
            **{**self.headers, 'HTTP_X_SUBE_ID': str(self.other_sube.id)},
        )
        self.assertIn(stranger.status_code, (403, 404))

    @patch('apps.mobile_identity.teacher_notes.fetch_file', return_value=b'%PDF-1.4 deneme')
    @patch('apps.mobile_identity.teacher_notes.store_file', return_value='drive-4')
    def test_signed_link_opens_on_the_tablet(self, _store, _fetch):
        saved = self._post()
        note_id = saved.json()['id']
        link = self.client.post(f'/api/teacher/notes/{note_id}/link/', **self.headers)
        self.assertEqual(link.status_code, 200, link.content)
        view = link.json()['view']
        opened = self.client.get(f'/api/teacher/notes/{note_id}/file/', {'view': view})
        self.assertEqual(opened.status_code, 200)
        self.assertEqual(opened['Content-Type'], 'application/pdf')
        self.assertEqual(opened.content, b'%PDF-1.4 deneme')
        saved_as = self.client.get(
            f'/api/teacher/notes/{note_id}/file/',
            {'view': view, 'download': '1'},
        )
        self.assertEqual(saved_as.status_code, 200)
        self.assertIn('attachment;', saved_as['Content-Disposition'])
        self.assertIn('filename="2026-10-24 konu.pdf"', saved_as['Content-Disposition'])
        rejected = self.client.get(f'/api/teacher/notes/{note_id}/file/', {'view': 'bozuk'})
        self.assertEqual(rejected.status_code, 401)
        mismatched = self.client.get(f'/api/teacher/notes/{note_id + 1}/file/', {'view': view})
        self.assertEqual(mismatched.status_code, 401)
        with patch('django.core.signing.time.time', return_value=time.time() + 200):
            expired = self.client.get(f'/api/teacher/notes/{note_id}/file/', {'view': view})
        self.assertEqual(expired.status_code, 401)

    @patch('apps.mobile_identity.teacher_notes.fetch_file', return_value=b'%PDF-1.4 deneme')
    @patch(
        'apps.mobile_identity.teacher_notes.render_pages',
        return_value=[{'number': 1, 'width': 800, 'height': 1100, 'mime': 'image/jpeg', 'content': b'\xff\xd8sayfa'}],
    )
    @patch('apps.mobile_identity.teacher_notes.store_file', return_value='drive-preview')
    def test_preview_opens_inside_the_app(self, _store, _render, _fetch):
        saved = self._post(key='onizleme')
        note_id = saved.json()['id']
        listed = self.client.get(f'/api/teacher/notes/{note_id}/preview/', **self.headers)
        self.assertEqual(listed.status_code, 200, listed.content)
        self.assertEqual(listed.json()['pages'], [{'number': 1, 'width': 800, 'height': 1100}])
        page = self.client.get(f'/api/teacher/notes/{note_id}/preview/1/', **self.headers)
        self.assertEqual(page.status_code, 200)
        self.assertEqual(page['Content-Type'], 'image/jpeg')
        self.assertEqual(page.content, b'\xff\xd8sayfa')
        missing = self.client.get(f'/api/teacher/notes/{note_id}/preview/2/', **self.headers)
        self.assertEqual(missing.status_code, 404)
        stranger = self.client.get(
            f'/api/teacher/notes/{note_id}/preview/',
            **{**self.headers, 'HTTP_X_SUBE_ID': str(self.other_sube.id)},
        )
        self.assertIn(stranger.status_code, (403, 404))

    @patch('apps.mobile_identity.teacher_notes.remove_file')
    @patch('apps.mobile_identity.teacher_notes.store_file', return_value='drive-sil')
    def test_primary_deletes_the_note_and_the_drive_file(self, _store, remove):
        saved = self._post(key='silinecek')
        note_id = saved.json()['id']
        removed = self.client.delete(f'/api/teacher/notes/{note_id}/', **self.headers)
        self.assertEqual(removed.status_code, 200, removed.content)
        self.assertTrue(removed.json()['deleted'])
        remove.assert_called_once_with('drive-sil')
        self.assertFalse(DersNotu.objects.filter(id=note_id).exists())
        listed = self.client.get(
            f'/api/teacher/classes/{self.plan.id}/notes/?term_id={self.term.id}',
            **self.headers,
        )
        self.assertEqual(listed.json()['results'], [])

    @patch('apps.mobile_identity.teacher_notes.remove_file')
    @patch('apps.mobile_identity.teacher_notes.store_file', return_value='drive-kalir')
    def test_assistant_cannot_delete_and_drive_failure_keeps_the_note(self, _store, remove):
        saved = self._post(key='kalacak')
        note_id = saved.json()['id']
        denied = self.client.delete(f'/api/teacher/notes/{note_id}/', **self.helper_headers)
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied.json()['message'], 'Ders notu asıl öğretmene açıktır.')
        remove.side_effect = DriveError('delete')
        failed = self.client.delete(f'/api/teacher/notes/{note_id}/', **self.headers)
        self.assertEqual(failed.status_code, 502)
        self.assertTrue(DersNotu.objects.filter(id=note_id).exists())
        stranger = self.client.delete(
            f'/api/teacher/notes/{note_id}/',
            **{**self.headers, 'HTTP_X_SUBE_ID': str(self.other_sube.id)},
        )
        self.assertIn(stranger.status_code, (403, 404))

    @override_settings(MOBILE_IDENTITY_ENABLED=False)
    def test_flag_hides_the_route(self):
        hidden = self.client.get(
            f'/api/teacher/classes/{self.plan.id}/notes/?term_id={self.term.id}',
            **self.headers,
        )
        self.assertEqual(hidden.status_code, 404)
