from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.resources.models import BookType, ResourceBook, ResourceContent, ResourceTopic, ResourceUnit
from apps.resources.utils import next_incremented_content_name
from apps.sube.domain.models import Sube

User = get_user_model()


class NextIncrementedContentNameTest(TestCase):
    def test_hyphen_and_space(self):
        self.assertEqual(next_incremented_content_name('Test-1'), 'Test-2')
        self.assertEqual(next_incremented_content_name('Test 7'), 'Test 8')
        self.assertEqual(next_incremented_content_name('Deneme'), 'Deneme-2')


class ResourceContentDuplicateApiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Dup Kurum', kod='DUPC', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Dup Şube', kod='DS', aktif_mi=True)
        sinif = SinifSeviyesi.objects.create(
            ad='11. Sınıf', kod='S11', sira=11, kurum=self.kurum, sube=self.sube,
        )
        ders = Ders.objects.create(ad='Mat', kod='MAT', kurum=self.kurum, sube=self.sube)
        bt = BookType.objects.create(kod='SB_DUP', ad='Soru Bankası')
        book = ResourceBook.objects.create(
            ad='Kitap', kod='K-DUP', book_type=bt, ders=ders, sinif_seviyesi=sinif,
            kurum=self.kurum, sube=self.sube, aktif_mi=True,
        )
        unit = ResourceUnit.objects.create(book=book, ad='Ü1', kod='U1', sira=1)
        self.topic = ResourceTopic.objects.create(unit=unit, ad='K1', kod='T1', sira=1)
        self.c1 = ResourceContent.objects.create(
            topic=self.topic, ad='Test-1', content_type='TEST_SET', sira=1,
            question_count=10, difficulty='MIXED',
        )
        self.c2 = ResourceContent.objects.create(
            topic=self.topic, ad='Test-3', content_type='TEST_SET', sira=2,
            question_count=20, difficulty='EASY',
        )

        self.user = User.objects.create_user(
            username='dupcontent', email='dup@test.com', password='x', is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_duplicate_inserts_below_and_increments_name(self):
        url = f'/api/resources/contents/{self.c1.id}/duplicate/'
        response = self.client.post(url, {}, format='json', **self.headers)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['data']['ad'], 'Test-2')

        contents = list(
            ResourceContent.objects.filter(topic=self.topic).order_by('sira').values_list('ad', 'sira')
        )
        self.assertEqual(contents, [('Test-1', 1), ('Test-2', 2), ('Test-3', 3)])
