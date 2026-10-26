import json
from datetime import date, time

from apps.academic.domain.class_lesson_teacher_assignment import (
    ClassLessonTeacherAssignment,
    TeacherRole,
)
from apps.academic.domain.lesson_session import LessonSession
from apps.academic.domain.program_grid_cell import ProgramGridCell
from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, Topic
from apps.mobile_identity.models import DersSubjectLink, IslenenKonu
from apps.mobile_identity.tests.test_teacher_read import TeacherReadTests
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from django.contrib.auth import get_user_model

User = get_user_model()
MONDAY = date(2026, 10, 19)


class TeacherTopicTests(TeacherReadTests):
    def setUp(self):
        super().setUp()
        cells = list(
            ProgramGridCell.objects.filter(class_lesson_plan=self.plan).order_by('timeslot__order', 'id')
        )
        self.morning, self.afternoon = cells[0], cells[1]
        self.subject = Subject.objects.create(code='MAT-KONU', name='Matematik')
        self.topic = Topic.objects.create(subject=self.subject, name='Fonksiyonlar', code='9.1')
        DersSubjectLink.objects.create(ders=self.ders, topic=self.topic)
        self.helper_user = User.objects.create_user(username='yardimci.ogretmen', password='Pass1234!')
        self.helper = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Berk', soyad='Yardımcı',
            user=self.helper_user, aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            personel=self.helper, egitim_yili=self.year, rol=self.role,
            gorev_sube=self.sube, kurum=self.kurum, aktif_mi=True,
        )
        ClassLessonTeacherAssignment.objects.create(
            egitim_yili=self.year, class_lesson_plan=self.plan,
            ogretmen=self.helper, role=TeacherRole.SECONDARY, is_active=True,
        )

    def _post(self, cell, key, topic_id=None, note='', when=MONDAY, plan_id=None, outcome_ids=None):
        body = {
            'term_id': self.term.id,
            'session_date': when.isoformat(),
            'program_grid_cell_id': cell.id,
            'note': note,
        }
        if topic_id is not None:
            body['topic_id'] = topic_id
        if outcome_ids is not None:
            body['outcome_ids'] = outcome_ids
        return self.client.post(
            f'/api/teacher/classes/{plan_id or self.plan.id}/topics/',
            data=json.dumps(body),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY=key,
            **self.headers,
        )

    def test_note_saves_when_catalog_topic_is_not_used(self):
        response = self._post(self.morning, 'not-1', note='Giriş tekrarı')
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertIsNone(body['topic'])
        self.assertEqual(body['note'], 'Giriş tekrarı')
        self.assertEqual(body['program_grid_cell_id'], self.morning.id)
        self.assertIsNone(body['lesson_session_id'])

    def test_same_topic_is_once_per_occurrence_and_repeatable_on_another(self):
        first = self._post(self.morning, 'konu-1', topic_id=self.topic.id)
        self.assertEqual(first.status_code, 201, first.content)
        again = self._post(self.morning, 'konu-2', topic_id=self.topic.id)
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.json()['code'], 'validation_error')
        other = self._post(self.afternoon, 'konu-3', topic_id=self.topic.id)
        self.assertEqual(other.status_code, 201, other.content)
        self.assertEqual(IslenenKonu.objects.filter(topic=self.topic).count(), 2)

    def test_several_notes_fit_in_one_occurrence(self):
        self.assertEqual(self._post(self.morning, 'n1', note='Bir').status_code, 201)
        self.assertEqual(self._post(self.morning, 'n2', note='İki').status_code, 201)
        self.assertEqual(
            IslenenKonu.objects.filter(program_grid_cell=self.morning, topic__isnull=True).count(),
            2,
        )

    def test_idempotent_replay_does_not_insert_again(self):
        first = self._post(self.morning, 'aynı-anahtar', note='Taslak')
        second = self._post(self.morning, 'aynı-anahtar', note='Başka metin')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()['id'], second.json()['id'])
        self.assertEqual(second.json()['note'], 'Taslak')
        self.assertEqual(IslenenKonu.objects.count(), 1)

    def test_existing_session_is_linked_without_materialize(self):
        session = LessonSession.objects.create(
            egitim_yili=self.year, term=self.term, schedule_version=self.version,
            source_grid_cell=self.morning, class_lesson_plan=self.plan,
            session_date=MONDAY, timeslot=self.morning.timeslot,
            start_time=time(8, 0), end_time=time(8, 40),
            sinif=self.sinif, ders=self.ders, ogretmen=self.personel,
        )
        before = LessonSession.objects.count()
        response = self._post(self.morning, 'oturum-1', note='İşlendi')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['lesson_session_id'], session.id)
        self.assertEqual(LessonSession.objects.count(), before)

    def test_invented_session_and_wrong_weekday_are_rejected(self):
        missing = self.client.post(
            f'/api/teacher/classes/{self.plan.id}/topics/',
            data=json.dumps({
                'term_id': self.term.id,
                'session_date': MONDAY.isoformat(),
                'lesson_session_id': 999999,
                'note': 'Yok',
            }),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='yok-oturum',
            **self.headers,
        )
        self.assertEqual(missing.status_code, 404)
        tuesday = self._post(self.morning, 'sali', note='Yanlış gün', when=date(2026, 10, 20))
        self.assertEqual(tuesday.status_code, 400)
        self.assertEqual(tuesday.json()['message'], 'Bu tarih bu ders saatine denk gelmiyor.')

    def test_secondary_can_read_and_cannot_write(self):
        self._post(self.morning, 'asil', note='Asıl not')
        token = self.client.post(
            '/api/mobile/auth/token/',
            data=json.dumps({
                'username': 'yardimci.ogretmen',
                'password': 'Pass1234!',
                'device_id': 'yardimci-telefon',
            }),
            content_type='application/json',
        )
        headers = dict(self.headers)
        headers['HTTP_AUTHORIZATION'] = f"Bearer {token.json()['access']}"
        listed = self.client.get(
            f'/api/teacher/classes/{self.plan.id}/topics/?term_id={self.term.id}',
            **headers,
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()['count'], 1)
        denied = self.client.post(
            f'/api/teacher/classes/{self.plan.id}/topics/',
            data=json.dumps({
                'term_id': self.term.id,
                'session_date': MONDAY.isoformat(),
                'program_grid_cell_id': self.morning.id,
                'note': 'Yardımcı yazamaz',
            }),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='yardimci',
            **headers,
        )
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied.json()['code'], 'forbidden')

    def test_other_plan_cell_is_hidden(self):
        foreign = ProgramGridCell.objects.get(class_lesson_plan=self.other_plan)
        response = self._post(foreign, 'baska', note='Değil')
        self.assertEqual(response.status_code, 404)

    def test_delete_uses_if_match_and_conflict(self):
        created = self._post(self.morning, 'sil-1', note='Silinecek')
        body = created.json()
        stale = self.client.delete(
            f"/api/teacher/topics/{body['id']}/",
            HTTP_IF_MATCH='eski',
            **self.headers,
        )
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()['code'], 'conflict')
        removed = self.client.delete(
            f"/api/teacher/topics/{body['id']}/",
            HTTP_IF_MATCH=body['updated_at'],
            **self.headers,
        )
        self.assertEqual(removed.status_code, 200)
        self.assertFalse(IslenenKonu.objects.filter(id=body['id']).exists())

    def test_catalog_is_read_only_for_the_plan_ders(self):
        catalog = self.client.get(
            f'/api/teacher/classes/{self.plan.id}/topic-catalog/?term_id={self.term.id}',
            **self.headers,
        )
        self.assertEqual(catalog.status_code, 200)
        self.assertEqual(catalog.json()['results'], [{
            'id': self.topic.id,
            'name': 'Fonksiyonlar',
            'code': '9.1',
            'subject': 'Matematik',
            'outcomes': [],
        }])

    def test_selected_outcomes_are_optional_and_must_belong_to_the_topic(self):
        own = Outcome.objects.create(topic=self.topic, code='9.1.1', text='Fonksiyonu tanır', order=1)
        other_topic = Topic.objects.create(subject=self.subject, name='Geometri', code='9.2')
        foreign = Outcome.objects.create(topic=other_topic, code='9.2.1', text='Üçgeni çizer', order=1)
        rejected = self._post(self.morning, 'yanlis-kazanim', topic_id=self.topic.id, outcome_ids=[foreign.id])
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(rejected.json()['message'], 'Bu kazanım bu konuya bağlı değil.')
        saved = self._post(self.morning, 'kazanim-1', topic_id=self.topic.id, outcome_ids=[own.id])
        self.assertEqual(saved.status_code, 201, saved.content)
        self.assertEqual(saved.json()['outcomes'], [{
            'id': own.id,
            'code': '9.1.1',
            'text': 'Fonksiyonu tanır',
        }])
        plain = self._post(self.afternoon, 'kazanimsiz', topic_id=self.topic.id)
        self.assertEqual(plain.status_code, 201, plain.content)
        self.assertEqual(plain.json()['outcomes'], [])
        before = Topic.objects.count()
        posted = self.client.post(
            f'/api/coaching/olcme-degerlendirme/curriculum/subjects/{self.subject.id}/topics/',
            data=json.dumps({'name': 'Yetkisiz konu'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertNotEqual(posted.status_code, 201)
        self.assertEqual(Topic.objects.count(), before)
