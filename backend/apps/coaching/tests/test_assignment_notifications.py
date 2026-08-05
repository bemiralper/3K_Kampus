"""Koç ataması → koç portalı ekran mesajı (AppNotification)."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.coaching.services.assignment_notification import CoachingAssignmentNotificationService
from apps.coaching.services.coach_change import change_primary_coach
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube
from apps.takvim.domain.models import AppNotification

User = get_user_model()


class AssignmentNotificationServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Atama Bildirim Kurum', kod='ABK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ABK-M')

        self.coach_user = User.objects.create_user(
            username='koc.atama@test.local', password='test',
        )
        self.coach_personel = Personel.objects.create(
            user=self.coach_user,
            kurum=self.kurum,
            sube=self.sube,
            ad='Başak',
            soyad='Aktepe',
            tc_kimlik_no='55555555555',
            aktif_mi=True,
        )
        self.coach = CoachProfile.objects.create(
            teacher=self.coach_personel, capacity=20, is_active=True, is_coach=True,
        )

        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Yılmaz',
            aktif_mi=True,
        )
        self.notifier = CoachingAssignmentNotificationService()

    def test_notify_students_assigned_creates_screen_message(self):
        created = self.notifier.notify_students_assigned(self.coach, [self.student])
        self.assertEqual(created, 1)

        n = AppNotification.objects.get(user_id=self.coach_user.id)
        self.assertTrue(n.ekran_mesaji)
        self.assertFalse(n.ekran_gosterildi)
        self.assertIn('Ali', n.baslik)
        self.assertEqual(n.url, f'/coach/ogrenciler/{self.student.id}')
        self.assertEqual(n.kurum_id, self.kurum.id)

    def test_notify_skips_when_coach_has_no_user(self):
        orphan = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Usersiz',
            soyad='Koç',
            tc_kimlik_no='66666666666',
            aktif_mi=True,
        )
        coach = CoachProfile.objects.create(
            teacher=orphan, capacity=5, is_active=True, is_coach=True,
        )
        created = self.notifier.notify_students_assigned(coach, [self.student])
        self.assertEqual(created, 0)
        self.assertEqual(AppNotification.objects.count(), 0)

    def test_change_primary_coach_notifies_both_coaches(self):
        old_user = User.objects.create_user(username='eski.koc@test.local', password='test')
        self.coach_personel.user = old_user
        self.coach_personel.save(update_fields=['user'])

        new_user = User.objects.create_user(username='yeni.koc@test.local', password='test')
        new_personel = Personel.objects.create(
            user=new_user,
            kurum=self.kurum,
            sube=self.sube,
            ad='Yeni',
            soyad='Koç',
            tc_kimlik_no='77777777777',
            aktif_mi=True,
        )
        new_coach = CoachProfile.objects.create(
            teacher=new_personel, capacity=20, is_active=True, is_coach=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            start_date=date.today(),
            is_primary=True,
        )

        change_primary_coach(
            student_id=self.student.id,
            new_coach_id=new_coach.id,
        )

        old_n = AppNotification.objects.filter(user_id=old_user.id).first()
        new_n = AppNotification.objects.filter(user_id=new_user.id).first()
        self.assertIsNotNone(old_n)
        self.assertIsNotNone(new_n)
        self.assertTrue(old_n.ekran_mesaji)
        self.assertTrue(new_n.ekran_mesaji)
        self.assertIn('çıkarıldı', old_n.baslik.lower())
        self.assertIn('atandı', new_n.baslik.lower())
