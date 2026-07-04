"""Ödev PDF bildirim şablonları ve dosya adı testleri."""
from django.test import TestCase
from django.utils import timezone

from apps.coaching.assignment_manual.assignment_notify_utils import (
    build_assignment_pdf_filename,
    build_pdf_attachment_message,
    extract_hafta_no,
)
from apps.coaching.assignment_manual.assignment_template_seed import (
    TEMPLATE_NAME_PLAN_VELI,
    ensure_assignment_pdf_templates,
)
from apps.coaching.assignment_manual.models import ManualAssignment
from apps.communication.domain.enums import TemplateCategory
from apps.communication.domain.models import MessageTemplate
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.sube.domain.models import Sube


class AssignmentNotifyTemplateTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='TNK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ahmet',
            soyad='Yılmaz',
            aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.student,
            ad='Ayşe',
            soyad='Yılmaz',
            telefon='905551234567',
            veli_turu='anne',
        )
        self.assignment = ManualAssignment.objects.create(
            student=self.student,
            title='Haziran Ayı 4. Hafta Ödevi',
            due_date=timezone.now() + timezone.timedelta(days=7),
            status=ManualAssignment.Status.ASSIGNED,
        )

    def test_extract_hafta_no_from_title(self):
        self.assertEqual(extract_hafta_no(self.assignment), '4')

    def test_pdf_filename_includes_student_and_week(self):
        filename = build_assignment_pdf_filename(self.assignment, 'plan')
        self.assertIn('Ahmet-Yilmaz', filename)
        self.assertIn('4-Hafta', filename)
        self.assertTrue(filename.endswith('-Odev-Plani.pdf'))

    def test_seed_creates_haftalik_odev_templates(self):
        ensure_assignment_pdf_templates(self.kurum.id)
        tpl = MessageTemplate.objects.get(
            kurum_id=self.kurum.id,
            category=TemplateCategory.HAFTALIK_ODEV,
            name=TEMPLATE_NAME_PLAN_VELI,
        )
        self.assertIn('{{ogrenci_ad}}', tpl.body)

    def test_custom_template_body_is_used(self):
        ensure_assignment_pdf_templates(self.kurum.id)
        tpl = MessageTemplate.objects.get(
            kurum_id=self.kurum.id,
            name=TEMPLATE_NAME_PLAN_VELI,
        )
        tpl.body = 'Sayın {{veli_ad}}, {{ogrenci_ad}} için {{hafta}} ödev planı ektedir.'
        tpl.save(update_fields=['body'])

        message = build_pdf_attachment_message(
            self.assignment,
            self.kurum.id,
            'plan',
            for_veli=True,
            veli=self.veli,
            kurum=self.kurum,
        )
        self.assertIn('Ahmet Yılmaz', message)
        self.assertIn('4. Hafta', message)
        self.assertIn('Ayşe', message)
