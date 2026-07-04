"""Kütüphane koç kapsamı API testleri."""
import json
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.kurum.domain.models import Kurum
from apps.kutuphane.domain.models import (
    AssignmentStatus,
    Library,
    Locker,
    LockerAssignment,
    Seat,
    SeatAssignment,
)
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube

User = get_user_model()


class KutuphaneCoachScopeTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kütüphane Test', kod='KUT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')

        self.coach_student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Koçlu', aktif_mi=True,
        )
        self.other_student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Diğer', aktif_mi=True,
        )

        self.coach_user = User.objects.create_user(
            username='kutuphane_coach', password='testpass123',
        )
        self.admin_user = User.objects.create_superuser(
            username='kutuphane_admin', password='testpass123',
        )

        personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
            soyad='Koç',
            tc_kimlik_no='22222222222',
            user=self.coach_user,
        )
        coach_profile = CoachProfile.objects.create(
            teacher=personel, capacity=20, is_active=True, is_coach=True,
        )
        CoachStudentAssignment.objects.create(
            coach=coach_profile,
            student=self.coach_student,
            start_date=date(2026, 1, 1),
            is_primary=True,
        )

        self.library = Library.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            ad='Ana Salon',
            kod='AS1',
            kapasite=50,
        )
        self.seat = Seat.objects.create(
            library=self.library,
            masa_no='M-1',
            durum='AVAILABLE',
        )
        self.locker = Locker.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            dolap_no='D-1',
            durum='AVAILABLE',
        )

        SeatAssignment.objects.create(
            library=self.library,
            seat=self.seat,
            ogrenci_id=self.coach_student.id,
            atama_tipi='KALICI',
            baslangic_tarihi=date.today(),
            durum=AssignmentStatus.ACTIVE,
        )
        other_seat = Seat.objects.create(
            library=self.library,
            masa_no='M-2',
            durum='AVAILABLE',
        )
        SeatAssignment.objects.create(
            library=self.library,
            seat=other_seat,
            ogrenci_id=self.other_student.id,
            atama_tipi='KALICI',
            baslangic_tarihi=date.today(),
            durum=AssignmentStatus.ACTIVE,
        )
        LockerAssignment.objects.create(
            kurum_id=self.kurum.id,
            locker=self.locker,
            ogrenci_id=self.other_student.id,
            atama_tipi='KALICI',
            baslangic_tarihi=date.today(),
            durum=AssignmentStatus.ACTIVE,
        )

        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_coach_sees_all_assignments(self):
        self.client.force_login(self.coach_user)
        res = self.client.get('/kutuphane/api/atamalar/', **self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()['data']
        seat_ids = {a['ogrenci_id'] for a in data['masa_atamalari']}
        locker_ids = {a['ogrenci_id'] for a in data['dolap_atamalari']}
        self.assertIn(self.coach_student.id, seat_ids)
        self.assertIn(self.other_student.id, seat_ids)
        self.assertIn(self.other_student.id, locker_ids)

    def test_admin_sees_all_assignments(self):
        self.client.force_login(self.admin_user)
        res = self.client.get('/kutuphane/api/atamalar/', **self.headers)
        data = res.json()['data']
        seat_ids = {a['ogrenci_id'] for a in data['masa_atamalari']}
        self.assertIn(self.coach_student.id, seat_ids)
        self.assertIn(self.other_student.id, seat_ids)

    def test_coach_cannot_create_salon(self):
        self.client.force_login(self.coach_user)
        res = self.client.post(
            '/kutuphane/api/salon/',
            data=json.dumps({'ad': 'Yeni', 'kod': 'YN', 'kapasite': 10}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 403)

    def test_coach_can_assign_other_student_seat(self):
        self.client.force_login(self.coach_user)
        SeatAssignment.objects.filter(ogrenci_id=self.other_student.id).update(
            durum=AssignmentStatus.ENDED,
        )
        free_seat = Seat.objects.create(
            library=self.library, masa_no='M-99', durum='AVAILABLE',
        )
        res = self.client.post(
            f'/kutuphane/api/salon/{self.library.id}/masa-atama/',
            data=json.dumps({
                'ogrenci_id': self.other_student.id,
                'masa_id': str(free_seat.id),
                'atama_tipi': 'KALICI',
                'baslangic_tarihi': date.today().isoformat(),
            }),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['success'])

    def test_coach_can_assign_own_student_seat(self):
        self.client.force_login(self.coach_user)
        free_seat = Seat.objects.create(
            library=self.library, masa_no='M-100', durum='AVAILABLE',
        )
        # End existing assignment first
        SeatAssignment.objects.filter(ogrenci_id=self.coach_student.id).update(
            durum=AssignmentStatus.ENDED,
        )
        res = self.client.post(
            f'/kutuphane/api/salon/{self.library.id}/masa-atama/',
            data=json.dumps({
                'ogrenci_id': self.coach_student.id,
                'masa_id': str(free_seat.id),
                'atama_tipi': 'KALICI',
                'baslangic_tarihi': date.today().isoformat(),
            }),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['success'])

    def test_coach_can_read_salon_list(self):
        self.client.force_login(self.coach_user)
        res = self.client.get('/kutuphane/api/salon/', **self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.json()['data']), 1)
