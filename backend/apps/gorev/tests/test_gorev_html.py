"""Görev açıklaması HTML temizliği ve dosya erişimi."""
import io
import zipfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase
from django.utils import timezone
from PIL import Image

from apps.gorev.application.html_content import plain_excerpt, prepare_aciklama
from apps.gorev.application.pdf_export import build_gorev_pdf_html
from apps.gorev.seed import seed_gorev_tipleri
from apps.gorev.application.service import GorevService
from apps.gorev.domain.enums import HedefTipi
from apps.gorev.domain.models import GorevDosya, GorevTipi
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube
from apps.takvim.domain.models import AppNotification

User = get_user_model()


def _grant(user, code):
    role, _ = Role.objects.get_or_create(
        code=f'role_{code.replace(".", "_")}_{user.username}',
        defaults={'name': code, 'level': 10, 'is_system_role': True},
    )
    perm, _ = Permission.objects.get_or_create(
        code=code,
        defaults={'name': code, 'module': code.split('.')[0], 'permission_type': code.split('.')[-1]},
    )
    RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


def _png_bytes():
    buf = io.BytesIO()
    Image.new('RGB', (4, 4), 'red').save(buf, format='PNG')
    return buf.getvalue()


class GorevHtmlTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='HTML Kurum', kod='HTMLK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='HTML-1')
        self.tip = GorevTipi.objects.create(kurum_id=self.kurum.id, kod='YAPILACAK', ad='Yapılacak', is_system=True)
        self.admin = User.objects.create_user('html_admin', 'a@test.com', 'pass')
        self.other = User.objects.create_user('html_other', 'o@test.com', 'pass')
        _grant(self.admin, 'gorev.manage')
        _grant(self.other, 'gorev.read')
        Personel.objects.create(kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Admin', user=self.admin, aktif_mi=True)
        Personel.objects.create(kurum=self.kurum, sube=self.sube, ad='Veli', soyad='Diger', user=self.other, aktif_mi=True)
        self.service = GorevService()
        self.client = Client()

    def _create(self, aciklama='', **extra):
        data = {
            'gorev_tipi_id': str(self.tip.id),
            'baslik': 'HTML görev',
            'aciklama': aciklama,
            'son_tarih': timezone.now() + timedelta(days=1),
            'hedef_tipi': HedefTipi.KULLANICI,
            'hedef_user_ids': [self.admin.id],
        }
        data.update(extra)
        return self.service.create_gorev(self.kurum.id, data, olusturan_id=self.admin.id)

    def test_plain_text_is_preserved(self):
        original = 'Sılanaz için not\nikinci satır'
        gorev = self._create(original)
        self.assertEqual(gorev.aciklama, original)
        self.assertEqual(plain_excerpt(gorev.aciklama), 'Sılanaz için not ikinci satır')

    def test_safe_html_and_math_round_trip(self):
        raw = '<p>Merhaba <strong>dünya</strong></p><span data-type="mathInline" data-latex="\\frac{1}{2}"></span>'
        gorev = self._create(raw)
        self.assertIn('<strong>dünya</strong>', gorev.aciklama)
        self.assertIn('data-latex=', gorev.aciklama)
        self.assertIn('frac', gorev.aciklama)
        note = AppNotification.objects.filter(user_id=self.admin.id).latest('created_at')
        self.assertNotIn('<', note.mesaj)
        self.assertIn('Merhaba', note.mesaj)

    def test_script_is_rejected(self):
        with self.assertRaises(ValueError):
            self._create('<p>not</p><script>alert(1)</script>')

    def test_event_handler_and_javascript_url_rejected(self):
        with self.assertRaises(ValueError):
            prepare_aciklama('<p onclick="alert(1)">x</p>')
        with self.assertRaises(ValueError):
            prepare_aciklama('<a href="javascript:alert(1)">x</a>')
        with self.assertRaises(ValueError):
            prepare_aciklama('<img src="https://evil.example/a.png" alt="x">')

    def test_png_upload_and_unauthorized_download(self):
        self.client.login(username='html_admin', password='pass')
        uploaded = SimpleUploadedFile('not.png', _png_bytes(), content_type='image/png')
        response = self.client.post(
            '/gorev/api/dosyalar/',
            {'dosya': uploaded},
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()['data']
        gorev = self._create(
            f'<p><img src="{payload["url"]}" data-dosya-id="{payload["id"]}" alt="şekil"></p>',
            dosya_ids=[payload['id']],
        )
        dosya = GorevDosya.objects.get(id=payload['id'])
        self.assertEqual(dosya.gorev_id, gorev.id)

        download = self.client.get(f'/gorev/api/dosyalar/{payload["id"]}/', HTTP_X_KURUM_ID=str(self.kurum.id))
        self.assertEqual(download.status_code, 200)
        self.assertTrue(download['Content-Type'].startswith('image/png'))

        self.client.logout()
        self.client.login(username='html_other', password='pass')
        denied = self.client.get(f'/gorev/api/dosyalar/{payload["id"]}/', HTTP_X_KURUM_ID=str(self.kurum.id))
        self.assertEqual(denied.status_code, 403)

    def test_rejects_wrong_type_and_oversize(self):
        self.client.login(username='html_admin', password='pass')
        exe = SimpleUploadedFile('zararli.exe', b'MZ' + b'0' * 32, content_type='application/octet-stream')
        bad = self.client.post('/gorev/api/dosyalar/', {'dosya': exe}, HTTP_X_KURUM_ID=str(self.kurum.id))
        self.assertEqual(bad.status_code, 400)

        office = io.BytesIO()
        with zipfile.ZipFile(office, 'w') as archive:
            archive.writestr('[Content_Types].xml', '<Types>spreadsheetml.sheet.main+xml</Types>')
        renamed = SimpleUploadedFile('rapor.docx', office.getvalue(), content_type='application/octet-stream')
        mismatch = self.client.post('/gorev/api/dosyalar/', {'dosya': renamed}, HTTP_X_KURUM_ID=str(self.kurum.id))
        self.assertEqual(mismatch.status_code, 400)

        huge = SimpleUploadedFile('buyuk.jpg', b'\xff\xd8' + b'0' * (5 * 1024 * 1024 + 8), content_type='image/jpeg')
        over = self.client.post('/gorev/api/dosyalar/', {'dosya': huge}, HTTP_X_KURUM_ID=str(self.kurum.id))
        self.assertEqual(over.status_code, 400)
        self.assertIn('5 MB', over.json()['error'])

    def test_pdf_html_inlines_task_image_and_seed_hides_deneme(self):
        self.client.login(username='html_admin', password='pass')
        uploaded = SimpleUploadedFile('not.png', _png_bytes(), content_type='image/png')
        response = self.client.post(
            '/gorev/api/dosyalar/',
            {'dosya': uploaded},
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        payload = response.json()['data']
        gorev = self._create(
            f'<p>Şekil</p><img src="{payload["url"]}" alt="şekil">',
            dosya_ids=[payload['id']],
        )
        document = build_gorev_pdf_html(gorev, self.kurum.id)
        self.assertIn('HTML görev', document)
        self.assertIn('data:image/png;base64,', document)
        self.assertNotIn('/api/gorev/api/dosyalar/', document)

        GorevTipi.objects.create(
            kurum_id=self.kurum.id, kod='DENEME_ANALIZ', ad='Deneme Analizi', is_active=True, is_system=True,
        )
        seed_gorev_tipleri(self.kurum.id)
        tip = GorevTipi.objects.get(kurum_id=self.kurum.id, kod='DENEME_ANALIZ')
        self.assertFalse(tip.is_active)
        self.assertFalse(GorevTipi.objects.filter(kurum_id=self.kurum.id, kod='DENEME_ANALIZ', is_active=True).exists())

    def test_remote_image_rejects_private_and_local_urls(self):
        from apps.gorev.application.files import GorevDosyaError, download_remote_image
        for url in (
            'http://127.0.0.1/secret.png',
            'http://169.254.169.254/latest/meta-data',
            'file:///etc/passwd',
            'http://localhost/a.png',
        ):
            with self.assertRaises(GorevDosyaError):
                download_remote_image(url)

    def test_remote_image_name_follows_bytes_not_url_extension(self):
        from apps.gorev.application.files import filename_for_image
        self.assertTrue(filename_for_image(_png_bytes(), 'AW808059.jpg').endswith('.png'))
