from django.test import TestCase
from . import test_assignment_create_evaluate as fixtures
from . import test_assignment_notify_templates as notify_fixtures
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.ogrenci.domain.models import Ogrenci
from apps.student_resources.models import StudentResourceAssignment
from apps.coaching.assignment_manual.models import ManualAssignment
from apps.communication.domain.models import Conversation, Message
from apps.coaching.assignment_manual.notification_service import AssignmentNotificationService, SOURCE_ODEV


class AssignmentResourceBoundaryTests(TestCase):
    setUp = fixtures.AssignmentCreateEvaluateTest.setUp
    _create_assignment_payload = fixtures.AssignmentCreateEvaluateTest._create_assignment_payload

    def test_cannot_reference_other_students_source_assignment(self):
        other = Ogrenci.objects.create(kurum=self.kurum, sube=self.sube, ad='Other', soyad='Student')
        source = StudentResourceAssignment.objects.create(student=other, resource_book=self.resource_book,
                                                          lesson=self.ders, coach=self.coach)
        payload = self._create_assignment_payload()
        payload['source_assignment'] = source.pk
        response = self.client.post('/api/coaching/manual-assignments/assignments/', payload, format='json')
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(ManualAssignment.objects.exists())

    def test_cannot_assign_book_from_another_tenant(self):
        tenant = Kurum.objects.create(ad='Other', kod='OTH')
        branch = Sube.objects.create(kurum=tenant, ad='Other', kod='OTH')
        self.resource_book.kurum = tenant
        self.resource_book.sube = branch
        self.resource_book.save(update_fields=['kurum', 'sube'])
        response = self.client.post('/api/coaching/manual-assignments/assignments/',
                                   self._create_assignment_payload(), format='json')
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(ManualAssignment.objects.exists())


    def test_malformed_content_and_task_payloads_return_validation_errors(self):
        for tasks in [[{'content_id': 'not-a-number'}], 'not-a-list']:
            payload = self._create_assignment_payload()
            payload['lessons'][0]['tasks'] = tasks
            response = self.client.post('/api/coaching/manual-assignments/assignments/', payload, format='json')
            self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(ManualAssignment.objects.exists())


class AssignmentDeliveryHistoryTests(TestCase):
    setUp = notify_fixtures.AssignmentNotifyTemplateTests.setUp

    def test_total_send_count_is_not_capped_by_history_window(self):
        conversation = Conversation.objects.create(kurum=self.kurum, sube=self.sube,
            ogrenci=self.student, veli=self.veli, contact_phone=self.veli.telefon)
        Message.objects.bulk_create([Message(conversation=conversation, direction='OUT', source_module=SOURCE_ODEV,
            source_ref_id=f'{self.assignment.pk}:plan:veli:{self.veli.pk}') for _ in range(20)])
        preview = AssignmentNotificationService().preview(self.kurum.pk, self.assignment.pk, 'plan')
        recipient = next(row for row in preview.recipients if row.veli_id == self.veli.pk)
        self.assertEqual(recipient.send_count, 20)
        self.assertEqual(len(recipient.send_history), 15)
