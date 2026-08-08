"""Kaynak içerik adı değişince ödev görev başlığı senkronu."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.coaching.assignment_manual.models import (
    AssignmentLesson,
    AssignmentTask,
    ManualAssignment,
)
from apps.coaching.assignment_manual.serializers import AssignmentTaskSerializer
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.models import (
    BookType,
    ResourceBook,
    ResourceContent,
    ResourceTopic,
    ResourceUnit,
)
from apps.sube.domain.models import Sube

User = get_user_model()


class ContentTitleSyncTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sync Kurum', kod='SYNC', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SM', aktif_mi=True)
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Veli', aktif_mi=True,
        )
        self.coach = User.objects.create_user(
            username='sync_coach', email='sync@test.com', password='x', is_staff=True,
        )
        ders = Ders.objects.create(kurum=self.kurum, sube=self.sube, ad='Türkçe', kod='TR')
        sinif = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='11', kod='S11S', sira=11,
        )
        bt = BookType.objects.create(kod='SYNC_SB', ad='SB')
        book = ResourceBook.objects.create(
            ad='Kitap', kod='K-SYNC', book_type=bt, ders=ders, sinif_seviyesi=sinif,
            kurum=self.kurum, sube=self.sube, aktif_mi=True,
        )
        unit = ResourceUnit.objects.create(book=book, ad='Ünite', kod='U1', sira=1)
        topic = ResourceTopic.objects.create(unit=unit, ad='Konu', kod='T1', sira=1)
        self.content = ResourceContent.objects.create(
            topic=topic, ad='Test-1', content_type='TEST_SET', sira=1, question_count=10,
        )

        assignment = ManualAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            title='Ödev',
            status='ASSIGNED',
            due_date=timezone.now() + timezone.timedelta(days=3),
        )
        lesson = AssignmentLesson.objects.create(
            assignment=assignment, resource_book=book, topic_name='Konu', order=0,
        )
        self.task = AssignmentTask.objects.create(
            lesson_block=lesson,
            content=self.content,
            task_type='SOLVE_TEST',
            title='Test-1',
            question_count=10,
            order=0,
        )

    def test_rename_content_updates_task_title(self):
        self.content.ad = 'Cümlede Anlam/Test-1'
        self.content.save(update_fields=['ad', 'updated_at'])
        self.task.refresh_from_db()
        self.assertEqual(self.task.title, 'Cümlede Anlam/Test-1')

    def test_serializer_returns_live_content_ad(self):
        # DB'de eski title kalsa bile API canlı adı döner
        AssignmentTask.objects.filter(pk=self.task.id).update(title='Eski Ad')
        self.content.ad = 'Yeni Test Adı'
        # update_fields olmadan save — yine senkron + serializer
        self.content.save()
        self.task.refresh_from_db()
        data = AssignmentTaskSerializer(self.task).data
        self.assertEqual(data['title'], 'Yeni Test Adı')

    def test_unrelated_field_change_does_not_touch_title(self):
        self.task.title = 'Özel Başlık'
        self.task.save(update_fields=['title'])
        self.content.question_count = 12
        self.content.save(update_fields=['question_count', 'updated_at'])
        self.task.refresh_from_db()
        self.assertEqual(self.task.title, 'Özel Başlık')
