"""Koç profil-foto erişim kapsamı — şube içi kütüphane operasyonu açık."""
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

    def test_coach_can_upload_photo_for_unassigned_student_in_same_sube(self):
        """Kütüphane atamalarında tüm şube öğrencileri görünür; foto da oradan yüklenir."""
        self.client.force_login(self.coach_user)
        res = self.client.post(
            FOTO_URL.format(self.unassigned.id),
            {'foto': _jpeg_file()},
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.unassigned.refresh_from_db()
        self.assertTrue(bool(self.unassigned.profil_foto))

    def test_coach_cannot_upload_photo_for_other_sube_student(self):
        other_sube = Sube.objects.create(kurum=self.kurum, ad='Diğer', kod='FSK-D')
        other_student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=other_sube,
            ad='Zeynep',
            soyad='Başka',
            aktif_mi=True,
        )
        self.client.force_login(self.coach_user)
        res = self.client.post(
            FOTO_URL.format(other_student.id),
            {'foto': _jpeg_file('diger.jpg')},
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)

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

    def test_coach_can_delete_photo_for_unassigned_student_in_same_sube(self):
        self.client.force_login(self.coach_user)
        res = self.client.delete(
            FOTO_URL.format(self.unassigned.id),
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)

    def test_teacher_role_coach_can_upload_assigned_student_photo(self):
        from apps.roller.models import Role, UserRole
        from apps.roller.seed import ensure_default_roles

        ensure_default_roles()
        role = Role.objects.get(code='ogretmen')
        UserRole.objects.create(
            user=self.coach_user, role=role, kurum=self.kurum, must_change_password=False,
        )
        self.client.force_login(self.coach_user)
        res = self.client.post(
            FOTO_URL.format(self.assigned.id),
            {'foto': _jpeg_file('ogretmen-koc.jpg')},
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assigned.refresh_from_db()
        self.assertTrue(bool(self.assigned.profil_foto))

    def test_teacher_role_without_coach_profile_cannot_upload(self):
        from apps.roller.models import Role, UserRole
        from apps.roller.seed import ensure_default_roles

        ensure_default_roles()
        teacher_user = User.objects.create_user(
            username='foto_teacher',
            email='foto_teacher@test.com',
            password='testpass123',
        )
        Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Öğretmen',
            soyad='Sadece',
            tc_kimlik_no='33333333333',
            user=teacher_user,
        )
        role = Role.objects.get(code='ogretmen')
        UserRole.objects.create(
            user=teacher_user, role=role, kurum=self.kurum, must_change_password=False,
        )
        self.client.force_login(teacher_user)
        res = self.client.post(
            FOTO_URL.format(self.assigned.id),
            {'foto': _jpeg_file('ogretmen.jpg')},
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)
