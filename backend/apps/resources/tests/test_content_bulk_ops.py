from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.resources.models import BookType, ResourceBook, ResourceContent, ResourceTopic, ResourceUnit
from apps.sube.domain.models import Sube

User = get_user_model()


class ResourceContentBulkOpsTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Bulk Kurum', kod='BULK', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Bulk Şube', kod='BS', aktif_mi=True)
        sinif = SinifSeviyesi.objects.create(
            ad='11. Sınıf', kod='S11B', sira=11, kurum=self.kurum, sube=self.sube,
        )
        ders = Ders.objects.create(ad='Mat', kod='MATB', kurum=self.kurum, sube=self.sube)
        bt = BookType.objects.create(kod='SB_BULK', ad='Soru Bankası')
        self.book = ResourceBook.objects.create(
            ad='Kitap Bulk', kod='K-BULK', book_type=bt, ders=ders, sinif_seviyesi=sinif,
            kurum=self.kurum, sube=self.sube, aktif_mi=True,
        )
        self.unit = ResourceUnit.objects.create(book=self.book, ad='Ü1', kod='U1', sira=1)
        self.topic_a = ResourceTopic.objects.create(unit=self.unit, ad='Konu A', kod='TA', sira=1)
        self.topic_b = ResourceTopic.objects.create(unit=self.unit, ad='Konu B', kod='TB', sira=2)
        self.topic_c = ResourceTopic.objects.create(unit=self.unit, ad='Konu C', kod='TC', sira=3)

        self.c1 = ResourceContent.objects.create(
            topic=self.topic_a, ad='Test-1', content_type='TEST_SET', sira=1,
            question_count=10, difficulty='MIXED',
        )
        self.c2 = ResourceContent.objects.create(
            topic=self.topic_a, ad='Anlatım', content_type='SUBJECT_SECTION', sira=2,
            estimated_minutes=15,
        )
        self.c3 = ResourceContent.objects.create(
            topic=self.topic_b, ad='Test-B', content_type='TEST_SET', sira=1,
            question_count=20, difficulty='EASY',
        )

        self.user = User.objects.create_user(
            username='bulkops', email='bulk@test.com', password='x', is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_bulk_transfer_copy(self):
        url = '/api/resources/contents/bulk-transfer/'
        response = self.client.post(
            url,
            {
                'content_ids': [self.c1.id, self.c2.id],
                'target_topic_id': self.topic_b.id,
                'mode': 'copy',
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(ResourceContent.objects.filter(topic=self.topic_a).count(), 2)
        dest = list(
            ResourceContent.objects.filter(topic=self.topic_b).order_by('sira').values_list('ad', flat=True)
        )
        self.assertEqual(dest, ['Test-B', 'Test-1', 'Anlatım'])

    def test_bulk_transfer_move(self):
        url = '/api/resources/contents/bulk-transfer/'
        response = self.client.post(
            url,
            {
                'content_ids': [self.c1.id, self.c2.id],
                'target_topic_id': self.topic_b.id,
                'mode': 'move',
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(ResourceContent.objects.filter(topic=self.topic_a).count(), 0)
        dest = list(
            ResourceContent.objects.filter(topic=self.topic_b).order_by('sira').values_list('ad', flat=True)
        )
        self.assertEqual(dest, ['Test-B', 'Test-1', 'Anlatım'])

    def test_group_contents_inserts_after_and_moves(self):
        url = '/api/resources/topics/group-contents/'
        response = self.client.post(
            url,
            {
                'content_ids': [self.c1.id, self.c2.id],
                'ad': 'Yeni Grup',
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['success'])
        new_id = response.data['data']['id']
        new_topic = ResourceTopic.objects.get(pk=new_id)
        self.assertEqual(new_topic.sira, self.topic_a.sira + 1)

        topics = list(
            ResourceTopic.objects.filter(unit=self.unit).order_by('sira').values_list('ad', 'sira')
        )
        self.assertEqual(
            topics,
            [('Konu A', 1), ('Yeni Grup', 2), ('Konu B', 3), ('Konu C', 4)],
        )
        self.assertEqual(ResourceContent.objects.filter(topic=self.topic_a).count(), 0)
        moved = list(
            ResourceContent.objects.filter(topic=new_topic).order_by('sira').values_list('ad', flat=True)
        )
        self.assertEqual(moved, ['Test-1', 'Anlatım'])

    def test_group_contents_rejects_cross_unit(self):
        other_unit = ResourceUnit.objects.create(book=self.book, ad='Ü2', kod='U2', sira=2)
        other_topic = ResourceTopic.objects.create(unit=other_unit, ad='X', kod='TX', sira=1)
        other_c = ResourceContent.objects.create(
            topic=other_topic, ad='Yabancı', content_type='TEST_SET', sira=1, question_count=5,
        )
        url = '/api/resources/topics/group-contents/'
        response = self.client.post(
            url,
            {'content_ids': [self.c1.id, other_c.id], 'ad': 'Karışık'},
            format='json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 400)

    def test_bulk_delete(self):
        url = '/api/resources/contents/bulk-delete/'
        response = self.client.post(
            url,
            {'content_ids': [self.c1.id, self.c3.id]},
            format='json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['deleted_count'], 2)
        self.assertFalse(ResourceContent.objects.filter(pk=self.c1.id).exists())
        self.assertFalse(ResourceContent.objects.filter(pk=self.c3.id).exists())
        self.assertTrue(ResourceContent.objects.filter(pk=self.c2.id).exists())

    def test_move_topic_to_other_unit(self):
        unit2 = ResourceUnit.objects.create(book=self.book, ad='Ü2', kod='U2', sira=2)
        url = f'/api/resources/topics/{self.topic_a.id}/move/'
        response = self.client.post(
            url,
            {'target_unit_id': unit2.id, 'mode': 'move'},
            format='json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.topic_a.refresh_from_db()
        self.assertEqual(self.topic_a.unit_id, unit2.id)
        self.assertEqual(self.topic_a.sira, 1)
        # İçerikler konuyla birlikte kalır
        self.assertEqual(
            ResourceContent.objects.filter(topic=self.topic_a).count(),
            2,
        )

    def test_copy_topic_to_other_unit(self):
        unit2 = ResourceUnit.objects.create(book=self.book, ad='Ü2', kod='U2', sira=2)
        url = f'/api/resources/topics/{self.topic_a.id}/move/'
        response = self.client.post(
            url,
            {'target_unit_id': unit2.id, 'mode': 'copy'},
            format='json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['success'])
        self.topic_a.refresh_from_db()
        self.assertEqual(self.topic_a.unit_id, self.unit.id)  # kaynakta kaldı
        new_id = response.data['data']['id']
        self.assertNotEqual(new_id, self.topic_a.id)
        self.assertEqual(ResourceTopic.objects.get(pk=new_id).unit_id, unit2.id)
        self.assertEqual(ResourceContent.objects.filter(topic_id=new_id).count(), 2)
        self.assertEqual(ResourceContent.objects.filter(topic=self.topic_a).count(), 2)

    def test_bulk_prefix_name(self):
        url = '/api/resources/contents/bulk-prefix-name/'
        response = self.client.post(
            url,
            {
                'content_ids': [self.c1.id, self.c3.id],
                'prefix': 'Cümlede Anlam',
                'with_number': False,
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.c1.refresh_from_db()
        self.c3.refresh_from_db()
        self.assertEqual(self.c1.ad, 'Cümlede Anlam/Test-1')
        self.assertEqual(self.c3.ad, 'Cümlede Anlam/Test-B')

    def test_bulk_prefix_name_with_number(self):
        url = '/api/resources/contents/bulk-prefix-name/'
        response = self.client.post(
            url,
            {
                'content_ids': [self.c1.id, self.c3.id],
                'prefix': 'Cümlede Anlam',
                'with_number': True,
                'start_number': 1,
            },
            format='json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.c1.refresh_from_db()
        self.c3.refresh_from_db()
        self.assertEqual(self.c1.ad, 'Cümlede Anlam 1/Test-1')
        self.assertEqual(self.c3.ad, 'Cümlede Anlam 2/Test-B')

    def test_bulk_prefix_name_replaces_existing_prefix(self):
        self.c1.ad = 'Eski Başlık/Test-1'
        self.c1.save(update_fields=['ad'])
        url = '/api/resources/contents/bulk-prefix-name/'
        response = self.client.post(
            url,
            {'content_ids': [self.c1.id], 'prefix': 'Yeni', 'with_number': False},
            format='json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.c1.refresh_from_db()
        self.assertEqual(self.c1.ad, 'Yeni/Test-1')

    def test_move_topic_rejects_cross_book(self):
        other_book = ResourceBook.objects.create(
            ad='Başka', kod='K-OTHER', book_type=self.book.book_type,
            ders=self.book.ders, sinif_seviyesi=self.book.sinif_seviyesi,
            kurum=self.kurum, sube=self.sube, aktif_mi=True,
        )
        foreign_unit = ResourceUnit.objects.create(book=other_book, ad='F', kod='UF', sira=1)
        url = f'/api/resources/topics/{self.topic_a.id}/move/'
        response = self.client.post(
            url,
            {'target_unit_id': foreign_unit.id, 'mode': 'copy'},
            format='json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 400)
