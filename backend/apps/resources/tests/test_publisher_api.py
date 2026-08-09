from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.resources.models import BookType, ResourceBook, ResourcePublisher

User = get_user_model()
URL = '/api/resources/publishers/'


class ResourcePublisherApiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Pub Kurum', kod='PUB', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube', kod='S1', aktif_mi=True)
        self.user = User.objects.create_user(
            username='pubadmin', email='pub@test.com', password='x', is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_create_and_list_publisher(self):
        res = self.client.post(
            URL,
            {'ad': 'Orijinal', 'kisa_ad': 'ORJ', 'aktif_mi': True},
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data['success'])
        self.assertEqual(ResourcePublisher.objects.filter(kurum=self.kurum).count(), 1)

        listing = self.client.get(URL, **self.headers)
        self.assertEqual(listing.status_code, 200)
        data = listing.data['data']
        items = data if isinstance(data, list) else data.get('results', [])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['ad'], 'Orijinal')

    def test_delete_blocked_when_books_exist(self):
        pub = ResourcePublisher.objects.create(
            kurum=self.kurum, ad='Bilgi Sarmal', kisa_ad='BS',
        )
        ders = Ders.objects.create(ad='Mat', kod='MAT', kurum=self.kurum, sube=self.sube)
        sinif = SinifSeviyesi.objects.create(
            ad='12', kod='12', sira=12, kurum=self.kurum, sube=self.sube,
        )
        bt = BookType.objects.create(kod='SB_P', ad='Soru')
        ResourceBook.objects.create(
            kurum=self.kurum, sube=self.sube, ad='BS TYT Mat', kod='B1',
            book_type=bt, ders=ders, sinif_seviyesi=sinif, publisher=pub,
        )
        res = self.client.delete(f'{URL}{pub.id}/', **self.headers)
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.data['success'])
        self.assertEqual(res.data['data']['book_count'], 1)
        self.assertEqual(res.data['data']['books'][0]['ad'], 'BS TYT Mat')
        self.assertTrue(ResourcePublisher.objects.filter(pk=pub.id).exists())

    def test_create_blocks_case_insensitive_duplicate(self):
        ResourcePublisher.objects.create(kurum=self.kurum, ad='Palme', kisa_ad='PLM')

        res = self.client.post(
            URL,
            {'ad': '  palme  ', 'aktif_mi': True},
            format='json',
            **self.headers,
        )

        self.assertEqual(res.status_code, 400)
        self.assertEqual(ResourcePublisher.objects.filter(kurum=self.kurum).count(), 1)

    def test_update_allows_keeping_own_name_case(self):
        pub = ResourcePublisher.objects.create(kurum=self.kurum, ad='Palme', kisa_ad='PLM')

        res = self.client.patch(
            f'{URL}{pub.id}/',
            {'ad': 'Palme'},
            format='json',
            **self.headers,
        )

        self.assertEqual(res.status_code, 200)

    def test_delete_ok_when_unused(self):
        pub = ResourcePublisher.objects.create(
            kurum=self.kurum, ad='Boş Yayınevi', kisa_ad='BY',
        )
        res = self.client.delete(f'{URL}{pub.id}/', **self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['success'])
        self.assertFalse(ResourcePublisher.objects.filter(pk=pub.id).exists())
