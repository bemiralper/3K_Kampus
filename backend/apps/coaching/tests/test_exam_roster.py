"""Sınav katılımcı çözümleme, salon kapasitesi ve oturma."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    Exam, ExamParticipant, ExamRoom, ExamSessionModel,
)
from apps.coaching.olcme_degerlendirme.views.roster_views import _hatirlatma_ctx
from apps.coaching.olcme_degerlendirme.services.exam_roster import (
    apply_seating,
    resolve_exam_candidates,
    seating_capacity_error,
)
from apps.coaching.olcme_degerlendirme.services.student_matching import exam_student_pool
from apps.egitim_paketleri.models import Deneme
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciEgitimPaketi, OgrenciKayit
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()
EXAMS_URL = '/api/coaching/olcme-degerlendirme/exams/'


class RosterFixtureMixin:
    def _setup_roster(self):
        self.kurum = Kurum.objects.create(ad='Roster Kurum', kod='RSTR')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='RSTR-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.sev12 = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='12. Sınıf', kod='12',
        )
        self.sev11 = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='11. Sınıf', kod='11',
        )
        self.sinif_a = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
            ad='12-A', kod='12A', sinif_seviyesi=self.sev12,
        )
        self.sinif_b = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
            ad='11-B', kod='11B', sinif_seviyesi=self.sev11,
        )
        self.paket = Deneme.objects.create(
            ad='Deneme Kulübü', kod='DK',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        self.paket.sinif_seviyeleri.add(self.sev12)

        self.in_class = self._ogr('Ayşe', 'Sınıflı', sinif=self.sinif_a)
        self.classless_12 = self._ogr('Arda', 'Yayla', seviye=self.sev12)
        self.packaged = self._ogr('Yazel', 'Korukçu')
        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.packaged, paket_turu='deneme', paket_id=self.paket.id,
            paket_adi=self.paket.ad, aktif_mi=True,
        )
        self.packaged_and_12 = self._ogr('Elif', 'Coşkun', seviye=self.sev12)
        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.packaged_and_12, paket_turu='deneme', paket_id=self.paket.id,
            paket_adi=self.paket.ad, aktif_mi=True,
        )
        self.other_class = self._ogr('Ali', 'Başka', sinif=self.sinif_b)
        self.outsider = self._ogr('Mert', 'Dışarı')

    def _ogr(self, ad, soyad, *, sinif=None, seviye=None):
        o = Ogrenci.objects.create(kurum=self.kurum, sube=self.sube, ad=ad, soyad=soyad)
        OgrenciKayit.objects.create(
            ogrenci=o, egitim_yili=self.yil, kurum=self.kurum, sube=self.sube,
            sinif=sinif, sinif_seviyesi=seviye, aktif_mi=True,
        )
        return o

    def _ids(self, recs):
        return {r.student_id for r in recs}


class ResolveCandidatesTest(RosterFixtureMixin, TestCase):
    def setUp(self):
        self._setup_roster()

    def _resolve(self, **kwargs):
        return resolve_exam_candidates(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            egitim_yili_id=self.yil.id,
            **kwargs,
        )

    def test_class_only_includes_class_students(self):
        ids = self._ids(self._resolve(sinif_ids=[self.sinif_a.id]))
        self.assertIn(self.in_class.id, ids)
        self.assertNotIn(self.classless_12.id, ids)
        self.assertNotIn(self.other_class.id, ids)

    def test_seviye_only_includes_classless(self):
        ids = self._ids(self._resolve(seviye_ids=[self.sev12.id]))
        self.assertIn(self.in_class.id, ids)
        self.assertIn(self.classless_12.id, ids)
        self.assertIn(self.packaged_and_12.id, ids)
        self.assertNotIn(self.other_class.id, ids)
        self.assertNotIn(self.packaged.id, ids)

    def test_seviye_and_package_is_intersection(self):
        ids = self._ids(self._resolve(
            seviye_ids=[self.sev12.id], paket_ids=[self.paket.id],
        ))
        self.assertIn(self.packaged_and_12.id, ids)
        self.assertIn(self.packaged.id, ids)  # sınıfsız + paket seviyesi 12
        self.assertNotIn(self.in_class.id, ids)
        self.assertNotIn(self.classless_12.id, ids)

    def test_package_only_all_holders(self):
        ids = self._ids(self._resolve(paket_ids=[self.paket.id]))
        self.assertIn(self.packaged.id, ids)
        self.assertIn(self.packaged_and_12.id, ids)
        self.assertNotIn(self.in_class.id, ids)

    def test_union_class_and_seviye_no_duplicate(self):
        recs = self._resolve(sinif_ids=[self.sinif_a.id], seviye_ids=[self.sev12.id])
        ids = [r.student_id for r in recs]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn(self.in_class.id, ids)
        self.assertIn(self.classless_12.id, ids)

    def test_empty_criteria_returns_empty(self):
        self.assertEqual(self._resolve(), [])


class SeatingCapacityTest(TestCase):
    def test_capacity_400_needs_more_seats(self):
        rooms = [
            ExamRoom(name='A', capacity=100),
            ExamRoom(name='B', capacity=100),
            ExamRoom(name='C', capacity=100),
        ]
        err = seating_capacity_error(400, rooms)
        self.assertIsNotNone(err)
        self.assertIn('400', err)
        self.assertIn('100', err)

    def test_enough_capacity_is_ok(self):
        rooms = [ExamRoom(name='A', capacity=30), ExamRoom(name='B', capacity=20)]
        self.assertIsNone(seating_capacity_error(50, rooms))


class SeatingUniqueTest(RosterFixtureMixin, TestCase):
    def setUp(self):
        self._setup_roster()
        self.exam = Exam.objects.create(
            name='Oturma', exam_type='YKS_TYT',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        for o in (self.in_class, self.classless_12, self.packaged):
            ExamParticipant.objects.create(exam=self.exam, student=o)
        self.r1 = ExamRoom.objects.create(exam=self.exam, name='Salon 1', capacity=2, order=0)
        self.r2 = ExamRoom.objects.create(exam=self.exam, name='Salon 2', capacity=2, order=1)

    def test_seats_unique_after_shuffle(self):
        result = apply_seating(self.exam, mode='shuffle')
        self.assertTrue(result['ok'])
        seats = list(
            ExamParticipant.objects.filter(exam=self.exam)
            .values_list('room_id', 'seat_no')
        )
        self.assertEqual(len(seats), 3)
        self.assertEqual(len(seats), len(set(seats)))
        self.assertTrue(all(room and seat for room, seat in seats))

    def test_explicit_assignments_keep_preview_order(self):
        from apps.coaching.olcme_degerlendirme.services.exam_roster import apply_explicit_seating
        apply_explicit_seating(self.exam, [
            {'student_id': self.packaged.id, 'room_name': 'Salon 1', 'seat_no': 2},
            {'student_id': self.in_class.id, 'room_name': 'Salon 1', 'seat_no': 1},
        ])
        p = ExamParticipant.objects.get(exam=self.exam, student=self.in_class)
        self.assertEqual(p.room_id, self.r1.id)
        self.assertEqual(p.seat_no, 1)

    def test_overflow_blocks_seating(self):
        ExamRoom.objects.filter(exam=self.exam).delete()
        ExamRoom.objects.create(exam=self.exam, name='Küçük', capacity=1, order=0)
        result = apply_seating(self.exam, mode='sequential')
        self.assertFalse(result['ok'])
        self.assertIn('kapasite', result['error'].lower())


class MatchingPoolPrefersParticipantsTest(RosterFixtureMixin, TestCase):
    def setUp(self):
        self._setup_roster()

    def test_pool_uses_participants_when_present(self):
        exam = Exam.objects.create(
            name='Havuz', exam_type='YKS_TYT',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        exam.siniflar.add(self.sinif_a)
        ExamParticipant.objects.create(exam=exam, student=self.packaged)
        ids = {rec.pk for rec in exam_student_pool(exam)}
        self.assertEqual(ids, {self.packaged.id})
        self.assertNotIn(self.in_class.id, ids)


class ExamRosterAPITest(RosterFixtureMixin, TestCase):
    def setUp(self):
        self._setup_roster()
        self.user = User.objects.create_user(username='roster', password='test')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.yil.id),
        }
        self.exam = Exam.objects.create(
            name='API Sınav', exam_type='YKS_TYT',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )

    def test_preview_class_only(self):
        res = self.client.post(
            f'{EXAMS_URL}preview-participants/',
            {'sinif_ids': [self.sinif_a.id]},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        ids = {r['student_id'] for r in res.json()['students']}
        self.assertIn(self.in_class.id, ids)
        self.assertNotIn(self.classless_12.id, ids)

    def test_create_with_rooms_overflow_rejected(self):
        res = self.client.post(
            EXAMS_URL,
            {
                'name': 'Kapasite Aşımı',
                'exam_type': 'YKS_TYT',
                'sinif_ids': [self.sinif_a.id],
                'sinif_seviyesi_ids': [self.sev12.id],
                'rooms': [{'name': 'Tek', 'capacity': 1}],
            },
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 400, res.content[:400])
        self.assertFalse(Exam.objects.filter(name='Kapasite Aşımı').exists())

    def test_create_builds_participants(self):
        res = self.client.post(
            EXAMS_URL,
            {
                'name': 'TYT Liste',
                'exam_type': 'YKS_TYT',
                'sinif_ids': [self.sinif_a.id],
                'rooms': [{'name': 'A', 'capacity': 40}],
                'seating_mode': 'sequential',
            },
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:400])
        exam = Exam.objects.get(id=res.json()['id'])
        self.assertTrue(exam.participants.filter(student=self.in_class).exists())
        p = exam.participants.get(student=self.in_class)
        self.assertEqual(p.seat_no, 1)

    def test_manual_add_rejects_duplicate(self):
        ExamParticipant.objects.create(exam=self.exam, student=self.in_class)
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/participants/add/',
            {'student_id': self.in_class.id},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 400)

    def test_remove_then_readd_as_manual(self):
        p = ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, source=ExamParticipant.Source.AUTO,
        )
        del_res = self.client.delete(
            f'{EXAMS_URL}{self.exam.id}/participants/{p.id}/',
            **self.headers,
        )
        self.assertEqual(del_res.status_code, 204)
        add = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/participants/add/',
            {'student_id': self.in_class.id},
            format='json', **self.headers,
        )
        self.assertEqual(add.status_code, 201, add.content[:300])
        self.assertEqual(add.json()['source'], 'manual')

    def test_participants_include_contact_fields(self):
        self.in_class.telefon = '05321234567'
        self.in_class.tc_kimlik_no = '12345678901'
        self.in_class.save(update_fields=['telefon', 'tc_kimlik_no'])
        ExamParticipant.objects.create(exam=self.exam, student=self.in_class)
        res = self.client.get(f'{EXAMS_URL}{self.exam.id}/participants/', **self.headers)
        self.assertEqual(res.status_code, 200, res.content[:300])
        row = next(r for r in res.json()['participants'] if r['student_id'] == self.in_class.id)
        self.assertEqual(row['telefon'], '05321234567')
        self.assertEqual(row['tc_kimlik_no'], '12345678901')
        self.assertIn('veli_telefon', row)

    def test_add_auto_places_in_free_seat(self):
        room = ExamRoom.objects.create(exam=self.exam, name='A', capacity=2, order=0)
        seated = ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, room=room, seat_no=1,
        )
        self.assertEqual(seated.seat_no, 1)
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/participants/add/',
            {'student_id': self.classless_12.id},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        body = res.json()
        self.assertEqual(body['room_id'], room.id)
        self.assertEqual(body['seat_no'], 2)

    def test_place_unassigned_keeps_existing_seats(self):
        room = ExamRoom.objects.create(exam=self.exam, name='A', capacity=5, order=0)
        seated = ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, room=room, seat_no=1,
        )
        ExamParticipant.objects.create(exam=self.exam, student=self.classless_12)
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/seating/',
            {'only_unassigned': True},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        seated.refresh_from_db()
        self.assertEqual(seated.seat_no, 1)
        other = ExamParticipant.objects.get(exam=self.exam, student=self.classless_12)
        self.assertEqual(other.room_id, room.id)
        self.assertEqual(other.seat_no, 2)

    def test_patch_room_assigns_next_seat(self):
        room = ExamRoom.objects.create(exam=self.exam, name='B', capacity=3, order=0)
        ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, room=room, seat_no=1,
        )
        p = ExamParticipant.objects.create(exam=self.exam, student=self.classless_12)
        res = self.client.patch(
            f'{EXAMS_URL}{self.exam.id}/participants/{p.id}/',
            {'room_id': room.id},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertEqual(res.json()['seat_no'], 2)

    def test_rooms_put_warns_on_overflow(self):
        ExamParticipant.objects.create(exam=self.exam, student=self.in_class)
        ExamParticipant.objects.create(exam=self.exam, student=self.classless_12)
        res = self.client.put(
            f'{EXAMS_URL}{self.exam.id}/rooms/',
            {'rooms': [{'name': 'Küçük', 'capacity': 1}]},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(res.json()['warning'])

    def _seed_hatirlatma_participant(self):
        self.exam.exam_date = date(2026, 4, 12)
        self.exam.save(update_fields=['exam_date'])
        ExamSessionModel.objects.create(
            exam=self.exam, name='1. Oturum', order=0,
            session_date=date(2026, 4, 12),
            start_time=time(10, 0), end_time=time(12, 45),
        )
        room = ExamRoom.objects.create(exam=self.exam, name='A Salonu', capacity=40, order=0)
        return ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, room=room, seat_no=14,
        )

    def test_hatirlatma_ctx_uses_canonical_variables(self):
        p = self._seed_hatirlatma_participant()
        ctx = _hatirlatma_ctx(self.exam, p, veli_ad='Ayşe Hanım')
        self.assertEqual(ctx['sinav_adi'], 'API Sınav')
        self.assertEqual(ctx['sinav_tarihi'], '12.04.2026')
        self.assertEqual(ctx['baslama_saati'], '10:00')
        self.assertEqual(ctx['bitis_saati'], '12:45')
        self.assertEqual(ctx['sinav_salonu'], 'A Salonu')
        self.assertEqual(ctx['sira_no'], '14')
        self.assertEqual(ctx['ogrenci_ad'], 'Ayşe Sınıflı')
        self.assertEqual(ctx['kurum_ad'], 'Roster Kurum')
        self.assertEqual(ctx['sinav_ad'], ctx['sinav_adi'])
        self.assertEqual(ctx['salon_ad'], ctx['sinav_salonu'])
        self.assertEqual(ctx['sira'], ctx['sira_no'])

    def test_hatirlatma_preview_accepts_yoklama_event(self):
        p = self._seed_hatirlatma_participant()
        p.attendance = ExamParticipant.Attendance.ABSENT
        p.save(update_fields=['attendance'])
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/hatirlatma/preview/',
            {'participant_ids': [p.id], 'event_key': 'sinav.yoklama'},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        body = res.json()
        self.assertEqual(body['event_key'], 'sinav.yoklama')
        self.assertTrue(body['students'])
        self.assertEqual(body['students'][0]['sinav_salonu'], 'A Salonu')
        self.assertEqual(body['students'][0]['sira_no'], '14')
        self.assertIn('preview_body', body)
        self.assertIn('preview_body_veli', body)
        self.assertIn('preview_body_ogrenci', body)
        self.assertTrue(body['supports_ogrenci'])
        self.assertIn('Değerli Velimiz', body['preview_body_veli'])
        self.assertIn('Sevgili Öğrencimiz', body['preview_body_ogrenci'])
        self.assertIn('Bildirim şablonları', body['binding_hint'])

    def test_hatirlatma_preview_returns_veli_and_ogrenci_bodies(self):
        p = self._seed_hatirlatma_participant()
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/hatirlatma/preview/',
            {'participant_ids': [p.id], 'event_key': 'sinav.hatirlatma'},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        body = res.json()
        self.assertIn('Sınav Bilgilendirmesi', body['preview_body_veli'])
        self.assertIn('Sınav Bilgilendirmesi', body['preview_body_ogrenci'])
        self.assertIn('Ayşe Sınıflı', body['preview_body_veli'])
        self.assertIn('A Salonu', body['preview_body_ogrenci'])
        self.assertNotEqual(body['preview_body_veli'], body['preview_body_ogrenci'])

    def test_yoklama_preview_skips_present_students(self):
        p = self._seed_hatirlatma_participant()
        self.assertEqual(p.attendance, ExamParticipant.Attendance.PRESENT)
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/hatirlatma/preview/',
            {'participant_ids': [p.id], 'event_key': 'sinav.yoklama'},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['students'], [])

    def test_new_participant_defaults_present(self):
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/participants/add/',
            {'student_id': self.in_class.id},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        self.assertEqual(res.json()['attendance'], 'present')

    def test_bulk_attendance_marks_visible(self):
        a = ExamParticipant.objects.create(exam=self.exam, student=self.in_class)
        b = ExamParticipant.objects.create(exam=self.exam, student=self.classless_12)
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/participants/bulk-attendance/',
            {'attendance': 'absent', 'participant_ids': [a.id, b.id]},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        self.assertEqual(res.json()['updated'], 2)
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual(a.attendance, 'absent')
        self.assertEqual(b.attendance, 'absent')

    def test_bulk_attendance_does_not_clear_seat_lock(self):
        from django.utils import timezone
        room = ExamRoom.objects.create(exam=self.exam, name='A', capacity=10, order=0)
        p = ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, room=room, seat_no=4,
            notified_at=timezone.now(), notified_room_id=room.id, notified_seat_no=4,
        )
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/participants/bulk-attendance/',
            {'attendance': 'absent', 'participant_ids': [p.id]},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        p.refresh_from_db()
        self.assertEqual(p.attendance, 'absent')
        self.assertEqual(p.seat_no, 4)
        self.assertEqual(p.room_id, room.id)
        self.assertIsNotNone(p.notified_at)

    def test_remove_leaves_seat_gap(self):
        room = ExamRoom.objects.create(exam=self.exam, name='A', capacity=10, order=0)
        first = ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, room=room, seat_no=1,
        )
        middle = ExamParticipant.objects.create(
            exam=self.exam, student=self.classless_12, room=room, seat_no=2,
        )
        last = ExamParticipant.objects.create(
            exam=self.exam, student=self.other_class, room=room, seat_no=3,
        )
        res = self.client.delete(
            f'{EXAMS_URL}{self.exam.id}/participants/{middle.id}/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 204)
        first.refresh_from_db()
        last.refresh_from_db()
        self.assertEqual(first.seat_no, 1)
        self.assertEqual(last.seat_no, 3)

    def test_add_to_explicit_empty_seat(self):
        room = ExamRoom.objects.create(exam=self.exam, name='A', capacity=10, order=0)
        ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, room=room, seat_no=1,
        )
        ExamParticipant.objects.create(
            exam=self.exam, student=self.other_class, room=room, seat_no=3,
        )
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/participants/add/',
            {'student_id': self.classless_12.id, 'room_id': room.id, 'seat_no': 2},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        self.assertEqual(res.json()['seat_no'], 2)
        self.assertEqual(res.json()['room_id'], room.id)
        kept = ExamParticipant.objects.get(exam=self.exam, student=self.other_class)
        self.assertEqual(kept.seat_no, 3)

    def test_add_rejects_occupied_seat(self):
        room = ExamRoom.objects.create(exam=self.exam, name='A', capacity=10, order=0)
        ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, room=room, seat_no=2,
        )
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/participants/add/',
            {'student_id': self.classless_12.id, 'room_id': room.id, 'seat_no': 2},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(
            ExamParticipant.objects.filter(exam=self.exam, student=self.classless_12).exists()
        )

    def test_add_fills_vacated_seat(self):
        room = ExamRoom.objects.create(exam=self.exam, name='A', capacity=10, order=0)
        ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, room=room, seat_no=1,
        )
        ExamParticipant.objects.create(
            exam=self.exam, student=self.other_class, room=room, seat_no=3,
        )
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/participants/add/',
            {'student_id': self.classless_12.id},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        self.assertEqual(res.json()['seat_no'], 2)
        self.assertEqual(res.json()['room_id'], room.id)
        kept = ExamParticipant.objects.get(exam=self.exam, student=self.other_class)
        self.assertEqual(kept.seat_no, 3)

    def test_apply_seating_keeps_notified_seats(self):
        from django.utils import timezone
        room = ExamRoom.objects.create(exam=self.exam, name='A', capacity=10, order=0)
        locked = ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, room=room, seat_no=4,
            notified_at=timezone.now(), notified_room_id=room.id, notified_seat_no=4,
        )
        other = ExamParticipant.objects.create(
            exam=self.exam, student=self.classless_12, room=room, seat_no=1,
        )
        result = apply_seating(self.exam, mode='sequential')
        self.assertTrue(result['ok'])
        self.assertEqual(result['locked'], 1)
        locked.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(locked.seat_no, 4)
        self.assertEqual(locked.room_id, room.id)
        self.assertNotEqual((other.room_id, other.seat_no), (locked.room_id, locked.seat_no))
        self.assertIsNotNone(other.seat_no)

    def test_participants_serialize_lock_and_stale(self):
        from django.utils import timezone
        room = ExamRoom.objects.create(exam=self.exam, name='A', capacity=10, order=0)
        ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, room=room, seat_no=4,
            notified_at=timezone.now(), notified_room_id=room.id, notified_seat_no=4,
        )
        stale = ExamParticipant.objects.create(
            exam=self.exam, student=self.classless_12, room=room, seat_no=2,
            notified_at=timezone.now(), notified_room_id=room.id, notified_seat_no=5,
        )
        res = self.client.get(f'{EXAMS_URL}{self.exam.id}/participants/', **self.headers)
        self.assertEqual(res.status_code, 200)
        by_id = {r['student_id']: r for r in res.json()['participants']}
        locked = by_id[self.in_class.id]
        moved = by_id[stale.student_id]
        self.assertTrue(locked['seat_locked'])
        self.assertFalse(locked['seat_stale'])
        self.assertTrue(moved['seat_locked'])
        self.assertTrue(moved['seat_stale'])

    def test_search_lists_other_session_student(self):
        ici = ExamSessionModel.objects.create(
            exam=self.exam, name='Hafta içi', order=0, schedule_preference='HAFTA_ICI',
        )
        sonu = ExamSessionModel.objects.create(
            exam=self.exam, name='Hafta sonu', order=1, schedule_preference='HAFTA_SONU',
        )
        room = ExamRoom.objects.create(exam=self.exam, name='A', capacity=10, order=0)
        ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, exam_session=sonu, room=room, seat_no=4,
        )
        res = self.client.get(
            f'{EXAMS_URL}{self.exam.id}/participants/search/',
            {'q': 'Ayşe', 'exam_session_id': ici.id},
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        hit = next(x for x in res.json() if x['id'] == self.in_class.id)
        self.assertTrue(hit['in_other_session'])
        self.assertEqual(hit['other_session']['exam_session_id'], sonu.id)
        self.assertEqual(hit['other_session']['seat_no'], 4)
        same = self.client.get(
            f'{EXAMS_URL}{self.exam.id}/participants/search/',
            {'q': 'Ayşe', 'exam_session_id': sonu.id},
            **self.headers,
        )
        self.assertNotIn(self.in_class.id, {x['id'] for x in same.json()})

    def test_add_moves_student_from_other_session(self):
        ici = ExamSessionModel.objects.create(
            exam=self.exam, name='Hafta içi', order=0, schedule_preference='HAFTA_ICI',
        )
        sonu = ExamSessionModel.objects.create(
            exam=self.exam, name='Hafta sonu', order=1, schedule_preference='HAFTA_SONU',
        )
        room = ExamRoom.objects.create(exam=self.exam, name='A', capacity=10, order=0)
        p = ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, exam_session=sonu, room=room, seat_no=4,
        )
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/participants/add/',
            {
                'student_id': self.in_class.id,
                'exam_session_id': ici.id,
                'room_id': room.id,
                'seat_no': 2,
            },
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        p.refresh_from_db()
        self.assertEqual(p.exam_session_id, ici.id)
        self.assertEqual(p.seat_no, 2)
        self.assertEqual(
            ExamParticipant.objects.filter(exam=self.exam, student=self.in_class).count(),
            1,
        )

    def test_patch_moves_session_and_frees_old_seat(self):
        ici = ExamSessionModel.objects.create(
            exam=self.exam, name='Hafta içi', order=0, schedule_preference='HAFTA_ICI',
        )
        sonu = ExamSessionModel.objects.create(
            exam=self.exam, name='Hafta sonu', order=1, schedule_preference='HAFTA_SONU',
        )
        room = ExamRoom.objects.create(exam=self.exam, name='A', capacity=10, order=0)
        p = ExamParticipant.objects.create(
            exam=self.exam, student=self.in_class, exam_session=sonu, room=room, seat_no=4,
        )
        res = self.client.patch(
            f'{EXAMS_URL}{self.exam.id}/participants/{p.id}/',
            {'exam_session_id': ici.id},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        p.refresh_from_db()
        self.assertEqual(p.exam_session_id, ici.id)
        self.assertEqual(p.seat_no, 1)
        self.assertFalse(
            ExamParticipant.objects.filter(
                exam=self.exam, exam_session=sonu, room=room, seat_no=4,
            ).exists()
        )

    def test_hatirlatma_preview_rejects_unknown_event(self):
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/hatirlatma/preview/',
            {'event_key': 'sinav.olmayan'},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 400)
