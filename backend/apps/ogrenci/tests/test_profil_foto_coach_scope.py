"""Koç profil-foto erişim kapsamı — atanmamış öğrenci 403."""
from datetime import date
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase
from PIL import Image

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube

User = get_user_model()

FOTO_URL = '/ogrenciler/api/{}/profil-foto/'


def _jpeg_file(name='foto.jpg'):
    buf = BytesIO()
    Image.new('RGB', (32, 32), color=(10, 20, 30)).save(buf, format='JPEG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


class ProfilFotoCoachScopeTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Foto Scope Kurum', kod='FSK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='FSK-M')

        self.assigned = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Atanan',
            aktif_mi=True,
        )
        self.unassigned = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Atanmayan',
            aktif_mi=True,
        )

        self.coach_user = User.objects.create_user(
            username='foto_coach',
            email='foto_coach@test.com',
            password='testpass123',
        )
        personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Koç',
            soyad='Foto',
            tc_kimlik_no='22222222222',
            user=self.coach_user,
        )
        self.coach_profile = CoachProfile.objects.create(
            teacher=personel,
            capacity=10,
            is_active=True,
            is_coach=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach_profile,
            student=self.assigned,
            start_date=date(2026, 1, 1),
            is_primary=True,
        )

        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_coach_cannot_upload_photo_for_unassigned_student(self):
        self.client.force_login(self.coach_user)
        res = self.client.post(
            FOTO_URL.format(self.unassigned.id),
            {'foto': _jpeg_file()},
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn('yetkiniz yok', res.json().get('error', '').lower())

    def test_coach_can_upload_photo_for_assigned_student(self):
        self.client.force_login(self.coach_user)
        res = self.client.post(
            FOTO_URL.format(self.assigned.id),
            {'foto': _jpeg_file()},
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body.get('success'))
        self.assigned.refresh_from_db()
        self.assertTrue(bool(self.assigned.profil_foto))

    def test_coach_cannot_delete_photo_for_unassigned_student(self):
        self.client.force_login(self.coach_user)
        res = self.client.delete(
            FOTO_URL.format(self.unassigned.id),
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)
