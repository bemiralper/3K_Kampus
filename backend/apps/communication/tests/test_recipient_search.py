"""
Toplu gönderim — birleşik kişi araması.

Okul no ve sınıf `Ogrenci` üzerinde değil yıllık kayıtta (`OgrenciKayit`) tutulur;
bu uçta yanlış alan kullanımı canlıda FieldError (500) üretmişti.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()

URL = '/api/communication/recipients/search/'


def _assign_perms(user, *codes):
    role, _ = Role.objects.get_or_create(
        code='comm_recipient_test',
        defaults={'name': 'Comm Recipient Test', 'level': 100, 'is_system_role': True},
    )
    for code in codes:
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class RecipientSearchTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Arama Kurum', kod='ARA')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ARAM')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='12-A',
            kod='12A',
            egitim_yili=self.egitim_yili,
            aktif_mi=True,
        )
        self.user = User.objects.create_user(username='aramaci', password='test')
        _assign_perms(self.user, 'communication.read', 'communication.write')
        self.client.force_authenticate(user=self.user)
        self.headers = {'HTTP_X_SUBE_ID': str(self.sube.id)}

        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Zeynep',
            soyad='Kaya',
            telefon='05321112233',
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci,
            sinif=self.sinif,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            okul_no='1234',
            aktif_mi=True,
        )
        OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            veli_turu='anne',
            ad='Hatice',
            soyad='Kaya',
            telefon='05324445566',
        )

    def _search(self, q):
        return self.client.get(URL, {'q': q, 'kurum_id': self.kurum.id}, **self.headers)

    def test_search_by_name_returns_student_with_class(self):
        response = self._search('Zeynep')
        self.assertEqual(response.status_code, 200, response.data)
        ogrenciler = [r for r in response.data['results'] if r['kind'] == 'ogrenci']
        self.assertEqual(len(ogrenciler), 1)
        self.assertEqual(ogrenciler[0]['label'], 'Zeynep Kaya')
        self.assertEqual(ogrenciler[0]['sinif'], '12-A')

    def test_search_by_okul_no_from_enrollment(self):
        response = self._search('1234')
        self.assertEqual(response.status_code, 200, response.data)
        ids = [r['id'] for r in response.data['results'] if r['kind'] == 'ogrenci']
        self.assertEqual(ids, [self.ogrenci.id])

    def test_multiple_enrollments_do_not_duplicate_student(self):
        onceki_yil = EgitimYili.objects.create(
            baslangic_yil=2024, bitis_yil=2025, aktif_mi=False,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci,
            egitim_yili=onceki_yil,
            kurum=self.kurum,
            sube=self.sube,
            okul_no='1234',
            aktif_mi=True,
        )
        response = self._search('Kaya')
        self.assertEqual(response.status_code, 200, response.data)
        ogrenciler = [r for r in response.data['results'] if r['kind'] == 'ogrenci']
        self.assertEqual(len(ogrenciler), 1)

    def test_search_finds_parent(self):
        response = self._search('Hatice')
        self.assertEqual(response.status_code, 200, response.data)
        veliler = [r for r in response.data['results'] if r['kind'] == 'veli']
        self.assertEqual(len(veliler), 1)
        self.assertEqual(veliler[0]['phone'], '05324445566')
