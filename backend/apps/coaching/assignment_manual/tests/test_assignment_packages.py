from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import AssignmentPackage, AssignmentPackageItem

User = get_user_model()

PACKAGES_URL = '/api/coaching/manual-assignments/packages/'


class AssignmentPackageAPITest(TestCase):
    def setUp(self):
        self.creator = User.objects.create_user(
            username='creator',
            email='creator@test.com',
            password='testpass123',
        )
        self.other = User.objects.create_user(
            username='other',
            email='other@test.com',
            password='testpass123',
        )
        self.staff = User.objects.create_user(
            username='staff',
            email='staff@test.com',
            password='testpass123',
            is_staff=True,
        )
        self.client = APIClient()

        self.sample_payload = {
            'name': 'TYT Matematik Paketi',
            'description': 'Temel konular',
            'ders_ad': 'Matematik',
            'sinif_seviyesi': '11. Sınıf',
            'items': [
                {
                    'book_id': 1,
                    'book_name': '3K Matematik',
                    'content_id': 10,
                    'content_name': 'Test 1',
                    'content_type': 'TEST',
                    'topic_name': 'Trigonometri',
                    'unit_name': 'Ünite 3',
                    'question_count': 20,
                    'page_start': 45,
                    'page_end': 52,
                    'order': 0,
                },
                {
                    'book_id': 1,
                    'book_name': '3K Matematik',
                    'content_id': 11,
                    'content_name': 'Test 2',
                    'content_type': 'TEST',
                    'topic_name': 'Logaritma',
                    'unit_name': 'Ünite 4',
                    'question_count': 15,
                    'page_start': 60,
                    'page_end': 66,
                    'order': 1,
                },
            ],
        }

    def test_create_package_with_items(self):
        self.client.force_authenticate(user=self.creator)
        response = self.client.post(PACKAGES_URL, self.sample_payload, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['success'])
        data = response.data['data']
        self.assertEqual(data['name'], self.sample_payload['name'])
        self.assertEqual(len(data['items']), 2)
        self.assertEqual(data['created_by'], self.creator.id)

        package = AssignmentPackage.objects.get(pk=data['id'])
        self.assertEqual(package.items.count(), 2)
        self.assertEqual(package.created_by, self.creator)

    def test_list_scoped_to_creator(self):
        own = AssignmentPackage.objects.create(
            name='Benim Paketim',
            ders_ad='Fizik',
            created_by=self.creator,
        )
        AssignmentPackageItem.objects.create(
            package=own,
            book_id=2,
            book_name='Fizik Kitap',
            content_id=20,
            content_name='Deneme 1',
            content_type='TEST',
        )
        other_pkg = AssignmentPackage.objects.create(
            name='Başkasının Paketi',
            ders_ad='Kimya',
            created_by=self.other,
        )
        AssignmentPackageItem.objects.create(
            package=other_pkg,
            book_id=3,
            book_name='Kimya Kitap',
            content_id=30,
            content_name='Deneme 2',
            content_type='TEST',
        )

        self.client.force_authenticate(user=self.creator)
        response = self.client.get(PACKAGES_URL)

        self.assertEqual(response.status_code, 200)
        ids = [item['id'] for item in response.data]
        self.assertEqual(ids, [own.id])
        self.assertNotIn(other_pkg.id, ids)

        self.client.force_authenticate(user=self.staff)
        staff_response = self.client.get(PACKAGES_URL)
        staff_ids = {item['id'] for item in staff_response.data}
        self.assertIn(own.id, staff_ids)
        self.assertIn(other_pkg.id, staff_ids)

    def test_duplicate_package(self):
        source = AssignmentPackage.objects.create(
            name='Kaynak Paket',
            description='Açıklama',
            ders_ad='Türkçe',
            sinif_seviyesi='12',
            usage_count=5,
            created_by=self.creator,
        )
        AssignmentPackageItem.objects.create(
            package=source,
            book_id=4,
            book_name='Türkçe Kitap',
            content_id=40,
            content_name='Paragraf Testi',
            content_type='TEST',
            topic_name='Paragraf',
            unit_name='Ünite 1',
            question_count=10,
            page_start=1,
            page_end=5,
            order=0,
        )

        self.client.force_authenticate(user=self.creator)
        response = self.client.post(
            f'{PACKAGES_URL}{source.id}/duplicate/',
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['success'])
        copy_data = response.data['data']
        self.assertNotEqual(copy_data['id'], source.id)
        self.assertEqual(copy_data['name'], 'Kaynak Paket (Kopya)')
        self.assertEqual(copy_data['usage_count'], 0)
        self.assertEqual(len(copy_data['items']), 1)
        self.assertEqual(copy_data['items'][0]['content_name'], 'Paragraf Testi')
        self.assertEqual(copy_data['created_by'], self.creator.id)
