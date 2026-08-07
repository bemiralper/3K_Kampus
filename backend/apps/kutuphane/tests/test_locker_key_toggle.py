"""Dolap anahtar toggle — audit + sonlandırınca anahtar temizleme."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.kutuphane.application.service import AssignmentService
from apps.kutuphane.domain.models import (
    AssignmentStatus,
    LibraryAuditLog,
    Locker,
    LockerAssignment,
    LockerStatus,
)
from apps.sube.domain.models import Sube

User = get_user_model()


class LockerKeyToggleTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Anahtar Kurum', kod='AKY')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube', kod='S1')
        self.user = User.objects.create_superuser(
            username='keyadmin', password='testpass123',
            first_name='Ayşe', last_name='Hoca',
        )
        self.locker = Locker.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            dolap_no='D-99',
            durum=LockerStatus.ASSIGNED,
        )
        self.assignment = LockerAssignment.objects.create(
            kurum_id=self.kurum.id,
            locker=self.locker,
            ogrenci_id=1001,
            atama_tipi='PERMANENT',
            baslangic_tarihi=date.today(),
            durum=AssignmentStatus.ACTIVE,
            anahtar_verildi=False,
        )
        self.service = AssignmentService()
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_toggle_writes_audit_and_flips_flag(self):
        updated = self.service.toggle_locker_key(self.assignment.id, self.user.id)
        self.assertTrue(updated.anahtar_verildi)

        log = LibraryAuditLog.objects.filter(
            entity_type='LockerAssignment',
            entity_id=self.assignment.id,
            new_values__has_key='anahtar_verildi',
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.old_values.get('anahtar_verildi'), False)
        self.assertEqual(log.new_values.get('anahtar_verildi'), True)
        self.assertEqual(log.performed_by, self.user.id)

        updated = self.service.toggle_locker_key(self.assignment.id, self.user.id)
        self.assertFalse(updated.anahtar_verildi)

    def test_end_with_key_clears_anahtar_and_audits(self):
        self.assignment.anahtar_verildi = True
        self.assignment.save(update_fields=['anahtar_verildi'])

        ended = self.service.end_locker_assignment(self.assignment.id, self.user.id)
        self.assertEqual(ended.durum, AssignmentStatus.ENDED)
        self.assertFalse(ended.anahtar_verildi)

        key_log = LibraryAuditLog.objects.filter(
            entity_type='LockerAssignment',
            entity_id=self.assignment.id,
            new_values__anahtar_verildi=False,
        ).first()
        self.assertIsNotNone(key_log)
        self.assertEqual(key_log.old_values.get('anahtar_verildi'), True)

    def test_api_toggle_returns_son_islem_fields(self):
        self.client.force_login(self.user)
        res = self.client.post(
            f'/kutuphane/api/dolap-atama/{self.assignment.id}/anahtar/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        data = body['data']
        self.assertTrue(data['anahtar_verildi'])
        self.assertIsNotNone(data['anahtar_son_islem_at'])
        self.assertEqual(data['anahtar_son_islem_yon'], 'verildi')
        self.assertIn('Ayşe', data['anahtar_son_islem_yapan'] or '')

    def test_dolap_loglar_lists_key_ops(self):
        self.service.toggle_locker_key(self.assignment.id, self.user.id)
        self.client.force_login(self.user)
        res = self.client.get('/kutuphane/api/dolap-loglar/', **self.headers)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        rows = body['data']
        self.assertGreaterEqual(len(rows), 1)
        key_rows = [r for r in rows if r.get('anahtar_yon') == 'verildi']
        self.assertTrue(key_rows)
        self.assertEqual(key_rows[0].get('dolap_no'), 'D-99')
        self.assertIn('Ayşe', key_rows[0].get('performed_by_name') or '')
