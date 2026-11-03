"""Synthetic-fixture SQL measurements; never calls a delivery provider."""
import time

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.test import TestCase

from . import test_assignment_notify_templates as template_fixtures
from ..assignment_template_seed import ensure_assignment_pdf_templates
from ..notification_service import AssignmentNotificationService
from . import test_list_search_pagination as list_fixtures


class ReadEndpointsTests(TestCase):
    def setUp(self):
        list_fixtures.AssignmentListSearchPaginationTest.setUp(self)

    def test_read_endpoints_do_not_write_and_project_overdue(self):
        from django.utils import timezone
        from ..models import ManualAssignment
        assignment = ManualAssignment.objects.filter(student=self.ayse).first()
        ManualAssignment.objects.filter(pk=assignment.pk).update(due_date=timezone.now()-timezone.timedelta(days=2))
        base = '/api/coaching/manual-assignments/assignments/'
        for path in (base, base+'stats/', base+'kontrol_badge/', base+f'{assignment.pk}/report/'):
            with CaptureQueriesContext(connection) as queries:
                response = self.client.get(path)
            self.assertEqual(response.status_code, 200, response.data)
            writes = [q['sql'] for q in queries if q['sql'].lstrip().split()[0] in ('INSERT', 'UPDATE', 'DELETE') and 'django_session' not in q['sql']]
            self.assertEqual(writes, [], path)
        response = self.client.get(base, {'status': 'OVERDUE', 'page': 1, 'page_size': 10})
        self.assertEqual([row['id'] for row in response.data['data']], [assignment.pk])
        self.assertEqual(response.data['data'][0]['status'], 'OVERDUE')
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, 'ASSIGNED')


class PreviewReadOnlyTests(TestCase):
    def setUp(self):
        template_fixtures.AssignmentNotifyTemplateTests.setUp(self)

    def measure_preview(self):
        started = time.perf_counter()
        with CaptureQueriesContext(connection) as queries:
            AssignmentNotificationService().preview(self.kurum.id, self.assignment.id, 'plan')
        writes = [q for q in queries if q['sql'].lstrip().split()[0] in ('INSERT', 'UPDATE', 'DELETE')]
        print(f'PREVIEW queries={len(queries)} writes={len(writes)} elapsed_ms={(time.perf_counter()-started)*1000:.2f}')
        return queries, writes

    def test_preview_measurement(self):
        ensure_assignment_pdf_templates(self.kurum.id)
        _, writes = self.measure_preview()
        self.assertEqual(writes, [])

    def test_preview_preserves_custom_inactive_mapping(self):
        from ..models import AssignmentNotificationConfig
        from apps.communication.domain.models import MessageTemplate
        ensure_assignment_pdf_templates(self.kurum.id)
        config = AssignmentNotificationConfig.objects.get(kurum_id=self.kurum.id)
        template = config.plan_veli_template
        MessageTemplate.objects.filter(pk=template.pk).update(is_active=False, body='Özel metin')
        before = list(AssignmentNotificationConfig.objects.filter(pk=config.pk).values())
        _, writes = self.measure_preview()
        ensure_assignment_pdf_templates(self.kurum.id)
        template.refresh_from_db()
        self.assertFalse(template.is_active)
        self.assertEqual(template.body, 'Özel metin')
        self.assertEqual(before, list(AssignmentNotificationConfig.objects.filter(pk=config.pk).values()))
        self.assertEqual(writes, [])

    def test_missing_config_preview_does_not_seed(self):
        from ..models import AssignmentNotificationConfig
        _, writes = self.measure_preview()
        self.assertFalse(AssignmentNotificationConfig.objects.filter(kurum_id=self.kurum.id).exists())
        self.assertEqual(writes, [])

    def test_legacy_named_template_is_read_without_creating_config(self):
        from ..assignment_template_seed import TEMPLATE_NAME_PLAN_VELI
        from ..models import AssignmentNotificationConfig
        from apps.communication.domain.models import MessageTemplate
        from apps.communication.domain.enums import TemplateCategory
        MessageTemplate.objects.create(kurum=self.kurum, sube=self.sube,
            name=TEMPLATE_NAME_PLAN_VELI, category=TemplateCategory.HAFTALIK_ODEV,
            body='Özel eski plan: {{ogrenci_ad}}', is_active=True)
        with CaptureQueriesContext(connection) as queries:
            preview = AssignmentNotificationService().preview(self.kurum.id, self.assignment.id, 'plan')
        self.assertIn('Özel eski plan:', preview.recipients[0].body)
        self.assertFalse(AssignmentNotificationConfig.objects.filter(kurum_id=self.kurum.pk).exists())
        self.assertFalse(any(q['sql'].lstrip().split()[0] in ('INSERT', 'UPDATE', 'DELETE') for q in queries))

    def test_template_queries_do_not_grow_with_parent_count(self):
        from apps.ogrenci.domain.models import OgrenciVeli
        ensure_assignment_pdf_templates(self.kurum.id)
        before, _ = self.measure_preview()
        for index in range(2):
            OgrenciVeli.objects.create(ogrenci=self.student, ad='Sentetik', soyad=str(index),
                veli_turu='diger', telefon=f'0555000100{index}')
        after, writes = self.measure_preview()
        def template_queries(queries):
            return sum('coaching_assignment_notify_config' in q['sql'] or 'comm_message_template' in q['sql'] for q in queries)
        self.assertEqual(template_queries(before), template_queries(after))
        self.assertEqual(writes, [])

    def test_foreign_institution_template_is_never_rendered(self):
        from ..models import AssignmentNotificationConfig
        from apps.communication.domain.models import MessageTemplate
        from apps.kurum.domain.models import Kurum
        from apps.sube.domain.models import Sube
        other = Kurum.objects.create(ad='Other', kod='PREVIEW-OTHER')
        branch = Sube.objects.create(kurum=other, ad='Other', kod='OTHER')
        foreign = MessageTemplate.objects.create(kurum=other, sube=branch, name='Foreign', body='FOREIGN-INSTITUTION-CONTENT')
        AssignmentNotificationConfig.objects.create(kurum_id=self.kurum.pk, plan_veli_template=foreign)
        preview = AssignmentNotificationService().preview(self.kurum.id, self.assignment.id, 'plan')
        self.assertTrue(all('FOREIGN-INSTITUTION-CONTENT' not in r.body for r in preview.recipients))
