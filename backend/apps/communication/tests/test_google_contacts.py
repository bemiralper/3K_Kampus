"""Google Kişiler eşitleme ve OAuth."""
from unittest.mock import patch
from urllib.parse import unquote

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.communication.application.google_contacts.naming import parent_desired, staff_desired, student_desired
from apps.egitim_tanimlari.models import Brans
from apps.egitim_yili.domain.models import EgitimYili
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Role
from apps.communication.application.google_contacts.oauth import (
    build_authorization_url,
    origin_allowed,
)
from apps.communication.application.google_contacts.sync import disconnect_account, enqueue_ogrenci, sync_batch
from apps.communication.domain.models import (
    GoogleContactMapping,
    GoogleContactRemoval,
    GoogleContactSubject,
    GoogleContactSyncStatus,
    GoogleContactsAccount,
)
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli
from apps.sube.domain.models import Sube

User = get_user_model()


class FakePeople:
    def __init__(self, account):
        self.account = account
        self.created = []
        self.updated = []
        self.deleted = []
        self.groups = []
        self.photos = []
        self._n = 0

    def create_contact(self, body):
        self._n += 1
        self.created.append(body)
        return {'resourceName': f'people/c{self._n}', 'etag': f'e{self._n}'}

    def update_contact(self, resource_name, body, etag):
        self.updated.append((resource_name, body))
        return {'resourceName': resource_name, 'etag': 'e-up'}

    def delete_contact(self, resource_name):
        self.deleted.append(resource_name)

    def add_to_group(self, group, person):
        self.groups.append((group, person))

    def update_contact_photo(self, resource_name, photo):
        self.photos.append(photo)
        return {
            'person': {
                'resourceName': resource_name,
                'etag': 'e-photo',
                'photos': [{'url': 'https://example.test/photo.jpg', 'default': False}],
            }
        }

    def delete_contact_photo(self, resource_name):
        self.photos.append(None)

    def group_resource(self, kind):
        return f'contactGroups/{kind}'


@override_settings(GOOGLE_CONTACTS_AUTO_SYNC=False)
class GoogleContactsSyncTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Google Kurum', kod='GCT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='GCT-M')
        self.account = GoogleContactsAccount.objects.create(
            kurum=self.kurum,
            email='rehber@example.com',
            account_type='central',
            is_default=True,
            is_active=True,
            refresh_token_encrypted='refresh-token',
            access_token_encrypted='access-token',
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Yılmaz',
            telefon='05321234567',
            aktif_mi=True,
        )
        self.fake = FakePeople(self.account)

    def _factory(self, account):
        self.fake.account = account
        return self.fake

    def test_display_names(self):
        desired = student_desired(self.student, sinif_ad='12-A', sube_ad='Merkez')
        self.assertEqual(desired.display_name, 'Ali Yılmaz [Öğrenci]')
        self.assertEqual(desired.phones, ['+905321234567'])
        self.assertIn('Sınıf: 12-A', desired.biography)
        veli = OgrenciVeli.objects.create(
            ogrenci=self.student,
            veli_turu='anne',
            ad='Fatma',
            soyad='Yılmaz',
            telefon='05329998877',
        )
        parent = parent_desired(veli, self.student, sinif_ad='12-A')
        self.assertEqual(parent.display_name, 'Fatma Yılmaz [Ali Yılmaz - Anne]')
        self.assertEqual(parent.group_kind, 'parents')

    def test_invalid_phone_is_skipped(self):
        self.student.telefon = '123'
        self.assertIsNone(student_desired(self.student))

    def test_sync_creates_student_and_parent_once(self):
        OgrenciVeli.objects.create(
            ogrenci=self.student,
            veli_turu='baba',
            ad='Mehmet',
            soyad='Yılmaz',
            telefon='05321112233',
            varsayilan=True,
        )
        GoogleContactMapping.objects.filter(account=self.account).delete()
        enqueue_ogrenci(self.student)
        first = sync_batch(
            kurum_id=self.kurum.id,
            limit=10,
            client_factory=self._factory,
        )
        self.assertEqual(first['created'], 2)
        self.assertEqual(len(self.fake.created), 2)
        names = [body['names'][0]['unstructuredName'] for body in self.fake.created]
        self.assertIn('Ali Yılmaz [Öğrenci]', names)
        self.assertTrue(any(name.startswith('Mehmet Yılmaz') for name in names))
        second = sync_batch(kurum_id=self.kurum.id, limit=10, client_factory=self._factory)
        self.assertEqual(second['created'], 0)
        self.assertEqual(second['processed'], 0)
        self.assertEqual(len(self.fake.created), 2)

    def test_phone_change_updates_existing_contact(self):
        enqueue_ogrenci(self.student)
        sync_batch(kurum_id=self.kurum.id, limit=10, client_factory=self._factory)
        self.student.telefon = '05320001122'
        self.student.save(update_fields=['telefon', 'updated_at'])
        result = sync_batch(kurum_id=self.kurum.id, limit=10, client_factory=self._factory)
        self.assertEqual(result['updated'], 1)
        self.assertEqual(len(self.fake.updated), 1)
        mapping = GoogleContactMapping.objects.get(
            account=self.account, subject_type=GoogleContactSubject.OGRENCI,
        )
        self.assertEqual(mapping.phone_e164, '+905320001122')
        self.assertEqual(mapping.status, GoogleContactSyncStatus.SYNCED)

    def test_inactive_student_is_removed(self):
        enqueue_ogrenci(self.student)
        sync_batch(kurum_id=self.kurum.id, limit=10, client_factory=self._factory)
        self.student.aktif_mi = False
        self.student.save(update_fields=['aktif_mi', 'updated_at'])
        result = sync_batch(kurum_id=self.kurum.id, limit=10, client_factory=self._factory)
        self.assertEqual(result['deleted'], 1)
        self.assertEqual(self.fake.deleted, ['people/c1'])
        self.assertFalse(GoogleContactMapping.objects.filter(account=self.account).exists())

    def test_delete_queues_remote_removal(self):
        mapping = GoogleContactMapping.objects.get(
            account=self.account,
            subject_type=GoogleContactSubject.OGRENCI,
            ogrenci=self.student,
        )
        mapping.resource_name = 'people/c9'
        mapping.status = GoogleContactSyncStatus.SYNCED
        mapping.save(update_fields=['resource_name', 'status', 'updated_at'])
        self.student.delete()
        self.assertFalse(GoogleContactMapping.objects.filter(pk=mapping.pk).exists())
        self.assertTrue(
            GoogleContactRemoval.objects.filter(account=self.account, resource_name='people/c9').exists()
        )

    def test_legacy_parent_without_veli_row(self):
        self.student.veli_ad_soyad = 'Ayşe Yılmaz'
        self.student.veli_telefon = '05324445566'
        self.student.veli_yakinlik = 'anne'
        self.student.save(update_fields=['veli_ad_soyad', 'veli_telefon', 'veli_yakinlik', 'updated_at'])
        enqueue_ogrenci(self.student)
        sync_batch(kurum_id=self.kurum.id, limit=10, client_factory=self._factory)
        names = [body['names'][0]['unstructuredName'] for body in self.fake.created]
        self.assertIn('Ayşe Yılmaz [Ali Yılmaz - Anne]', names)

    def test_enrollment_year_is_written_to_notes(self):
        year, _ = EgitimYili.objects.get_or_create(
            baslangic_yil=2025, bitis_yil=2026, defaults={'aktif_mi': True},
        )
        OgrenciKayit.objects.create(
            ogrenci=self.student,
            egitim_yili=year,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,
        )
        desired = student_desired(self.student, sinif_ad='12-A', sube_ad='Merkez', kayit_yili='2025-2026')
        self.assertIn('Kayıt: 2025-2026', desired.biography)
        veli = OgrenciVeli.objects.create(
            ogrenci=self.student,
            veli_turu='anne',
            ad='Fatma',
            soyad='Yılmaz',
            telefon='05329990000',
        )
        parent = parent_desired(veli, self.student, sinif_ad='12-A', kayit_yili='2025-2026')
        self.assertIn('Kayıt: 2025-2026', parent.biography)

    def test_staff_contacts_use_branch_and_role_labels(self):
        year, _ = EgitimYili.objects.get_or_create(
            baslangic_yil=2026, bitis_yil=2027, defaults={'aktif_mi': True},
        )
        if not year.aktif_mi:
            year.aktif_mi = True
            year.save(update_fields=['aktif_mi'])
        teacher_role, _ = Role.objects.get_or_create(
            code='gct_ogretmen',
            defaults={'name': 'Öğretmen', 'level': 100, 'is_system_role': True},
        )
        clerk_role, _ = Role.objects.get_or_create(
            code='gct_sekreter',
            defaults={'name': 'Sekreter', 'level': 90, 'is_system_role': True},
        )
        branch = Brans.objects.create(kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MAT-G')
        teacher = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Demir', cep_telefon='05321110001',
        )
        clerk = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mehmet', soyad='Kaya', cep_telefon='05321110002',
        )
        PersonelGorevlendirme.objects.create(
            personel=teacher, egitim_yili=year, gorev_sube=self.sube, kurum=self.kurum,
            rol=teacher_role, brans=branch, aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            personel=clerk, egitim_yili=year, gorev_sube=self.sube, kurum=self.kurum,
            rol=clerk_role, aktif_mi=True,
        )
        GoogleContactMapping.objects.filter(account=self.account).exclude(
            subject_type=GoogleContactSubject.PERSONEL,
        ).delete()
        result = sync_batch(kurum_id=self.kurum.id, limit=10, client_factory=self._factory)
        self.assertEqual(result['created'], 2)
        names = [body['names'][0]['unstructuredName'] for body in self.fake.created]
        bios = [body['biographies'][0]['value'] for body in self.fake.created]
        self.assertIn('Ayşe Demir [Matematik]', names)
        self.assertIn('Mehmet Kaya [Sekreter]', names)
        self.assertTrue(any('Branş: Matematik' in bio for bio in bios))
        self.assertIn('contactGroups/teachers', [group for group, _person in self.fake.groups])
        self.assertIn('contactGroups/role:Sekreter', [group for group, _person in self.fake.groups])
        teacher_card = staff_desired(teacher)
        self.assertEqual(teacher_card.group_kind, 'teachers')
        clerk.aktif_mi = False
        clerk.save(update_fields=['aktif_mi', 'updated_at'])
        removed = sync_batch(kurum_id=self.kurum.id, limit=10, client_factory=self._factory)
        self.assertEqual(removed['deleted'], 1)
        self.assertIsNone(staff_desired(Personel(ad='Boş', soyad='Telefon', aktif_mi=True, telefon='', cep_telefon='')))

    def test_student_photo_is_sent_to_google(self):
        import base64
        from django.core.files.base import ContentFile

        png = base64.b64decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        )
        self.student.profil_foto.save('ali.png', ContentFile(png), save=True)
        GoogleContactMapping.objects.filter(account=self.account).delete()
        enqueue_ogrenci(self.student)
        result = sync_batch(kurum_id=self.kurum.id, limit=10, client_factory=self._factory)
        self.assertEqual(result['created'], 1)
        self.assertEqual(len(self.fake.photos), 1)
        self.assertTrue(self.fake.photos[0].startswith(b'\xff\xd8'))
        mapping = GoogleContactMapping.objects.get(
            account=self.account, subject_type=GoogleContactSubject.OGRENCI,
        )
        self.assertIn('|', mapping.content_hash)
        self.assertLessEqual(len(mapping.content_hash), 64)

    def test_disconnect_clears_tokens_without_purge(self):
        result = disconnect_account(self.account, purge=False)
        self.account.refresh_from_db()
        self.assertTrue(result['disconnected'])
        self.assertFalse(self.account.is_active)
        self.assertEqual(self.account.refresh_token_encrypted, '')


@override_settings(
    GOOGLE_CONTACTS_CLIENT_ID='client-id',
    GOOGLE_CONTACTS_CLIENT_SECRET='client-secret',
    GOOGLE_CONTACTS_AUTO_SYNC=False,
    DEBUG=True,
)
class GoogleContactsOAuthTests(TestCase):
    def test_authorization_url_requests_contacts_scope(self):
        url = unquote(build_authorization_url(kurum_id=1, user_id=2, origin='http://localhost:3000'))
        self.assertIn('https://www.googleapis.com/auth/contacts', url)
        self.assertIn('access_type=offline', url)
        self.assertIn('client-id', url)
        self.assertIn('google-contacts/oauth/callback/', url)

    def test_foreign_origin_rejected(self):
        self.assertFalse(origin_allowed('https://evil.example'))
        self.assertTrue(origin_allowed('http://localhost:3000'))


@override_settings(GOOGLE_CONTACTS_AUTO_SYNC=False, GOOGLE_CONTACTS_CLIENT_ID='', GOOGLE_CONTACTS_CLIENT_SECRET='')
class GoogleContactsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='API Kurum', kod='GAPI')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='GAPI-M')
        self.user = User.objects.create_superuser(username='gapi', email='gapi@example.com', password='test')
        self.client.force_authenticate(user=self.user)

    def test_status_reports_missing_oauth_settings(self):
        response = self.client.get(
            '/api/communication/google-contacts/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['oauth_configured'])
        self.assertIn('client_id', response.data['missing_settings'])
        self.assertEqual(response.data['accounts'], [])
        self.assertNotIn('client_secret', response.data)

    def test_page_saves_client_credentials_without_returning_secret(self):
        response = self.client.post(
            '/api/communication/google-contacts/credentials/',
            {'client_id': 'sayfa-client.apps.googleusercontent.com', 'client_secret': 'sayfa-secret'},
            format='json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['oauth_configured'])
        self.assertNotIn('sayfa-secret', str(response.data))
        status_response = self.client.get(
            '/api/communication/google-contacts/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(status_response.data['client_id'], 'sayfa-client.apps.googleusercontent.com')
        self.assertEqual(status_response.data['credential_source'], 'database')
        self.assertNotIn('sayfa-secret', str(status_response.data))


class GoogleContactPhotoRequestTests(TestCase):
    @patch('apps.communication.application.google_contacts.client.ensure_access_token', return_value='token')
    @patch('apps.communication.application.google_contacts.client.httpx.request')
    def test_profile_photo_is_patched(self, request, _token):
        from apps.communication.application.google_contacts.client import GooglePeopleClient

        response = request.return_value
        response.status_code = 200
        response.content = b'{}'
        response.json.return_value = {
            'person': {
                'resourceName': 'people/c1',
                'etag': 'e1',
                'photos': [{'url': 'https://lh3.googleusercontent.com/a', 'default': False}],
            }
        }
        account = GoogleContactsAccount(refresh_token_encrypted='x', access_token_encrypted='y')
        GooglePeopleClient(account).update_contact_photo('people/c1', b'\xff\xd8\xff')
        method, url = request.call_args.args[:2]
        body = request.call_args.kwargs['json']
        self.assertEqual(method, 'PATCH')
        self.assertTrue(url.endswith('/people/c1:updateContactPhoto'))
        self.assertIn('photoBytes', body)
        self.assertEqual(body['personFields'], 'photos')
        self.assertEqual(body['sources'], ['READ_SOURCE_TYPE_CONTACT'])

    @patch('apps.communication.application.google_contacts.client.ensure_access_token', return_value='token')
    @patch('apps.communication.application.google_contacts.client.httpx.request')
    def test_letter_avatar_is_not_a_profile_photo(self, request, _token):
        from apps.communication.application.google_contacts.client import (
            GoogleContactsError,
            GooglePeopleClient,
        )

        response = request.return_value
        response.status_code = 200
        response.content = b'{}'
        response.json.return_value = {
            'person': {'photos': [{'url': 'https://lh3.googleusercontent.com/a', 'default': True}]},
        }
        account = GoogleContactsAccount(refresh_token_encrypted='x', access_token_encrypted='y')
        with self.assertRaises(GoogleContactsError):
            GooglePeopleClient(account).update_contact_photo('people/c1', b'\xff\xd8\xff')
        self.assertGreaterEqual(request.call_count, 2)
