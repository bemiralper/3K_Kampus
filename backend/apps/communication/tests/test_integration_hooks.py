"""
Faz 4 — Modül entegrasyon hook testleri.
"""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.coaching.models import CoachProfile, GorusmeKaydi
from apps.communication.application.integration_hooks import (
    SOURCE_DEVAMSIZLIK,
    SOURCE_GORUSME,
    SOURCE_ODEME,
    SOURCE_ODEV,
    notify_absence,
    notify_assignment,
    notify_gorusme_reminder,
    notify_payment_reminder,
)
from apps.communication.domain.models import Message, OutboundQueueItem
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum
from apps.odeme_takip.domain.models import Sozlesme, Taksit
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube

User = get_user_model()


class IntegrationHooksTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Hook Kurum', kod='HKUR')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='HKUR')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Test',
            soyad='Ogrenci',
            telefon='05321112233',
            aktif_mi=True,
        )
        self.veli_opt_in = OgrenciVeli.objects.create(
            ogrenci=self.student,
            veli_turu='anne',
            ad='Opt',
            soyad='In',
            telefon='05324445566',
            sms_bildirimleri=['duyuru', 'odeme', 'devamsizlik'],
        )
        self.veli_opt_out = OgrenciVeli.objects.create(
            ogrenci=self.student,
            veli_turu='baba',
            ad='Opt',
            soyad='Out',
            telefon='05327778899',
            sms_bildirimleri=['duyuru'],
        )

        user = User.objects.create_user(username='coach_hook', password='test')
        personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Koç',
            soyad='Test',
            tc_kimlik_no='11111111111',
            user=user,
        )
        self.coach = CoachProfile.objects.create(
            teacher=personel,
            capacity=20,
            is_active=True,
            is_coach=True,
        )

    def test_gorusme_hook_enqueues_message(self):
        future = timezone.localdate() + timedelta(days=7)
        gorusme = GorusmeKaydi.objects.create(
            kurum=self.kurum,
            ogrenci=self.student,
            koc=self.coach,
            gorusme_turu='ogrenci',
            durum='planlandi',
            gorusme_tarihi=future,
            konu='Motivasyon görüşmesi',
        )

        notify_gorusme_reminder(self.kurum.id, gorusme.id)

        msg = Message.objects.filter(source_module=SOURCE_GORUSME).first()
        self.assertIsNotNone(msg)
        self.assertTrue(
            OutboundQueueItem.objects.filter(message=msg).exists(),
            'Kuyruk kaydı oluşmalı',
        )
        self.assertTrue(msg.source_ref_id.startswith(str(gorusme.id)))

    def test_payment_reminder_respects_opt_out(self):
        from apps.egitim_yili.domain.models import EgitimYili

        ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-HOOK-001',
            ogrenci=self.student,
            egitim_yili=ey,
            kurum=self.kurum,
            sube=self.sube,
            veli=self.veli_opt_in,
            baslangic_tarihi=date(2025, 9, 1),
            bitis_tarihi=date(2026, 6, 30),
            brut_tutar=10000,
            net_tutar=10000,
            durum=SozlesmeDurum.AKTIF,
        )
        taksit = Taksit.objects.create(
            sozlesme=sozlesme,
            taksit_no=1,
            vade_tarihi=timezone.localdate() - timedelta(days=2),
            tutar=5000,
            odenen_tutar=0,
            kalan_tutar=5000,
            durum=TaksitDurum.BEKLEMEDE,
        )

        OgrenciVeli.objects.filter(id=self.veli_opt_in.id).update(sms_bildirimleri=['duyuru'])
        result = notify_payment_reminder(self.kurum.id, taksit.id)
        self.assertFalse(result.success if result else True)
        self.assertEqual(Message.objects.filter(source_module=SOURCE_ODEME).count(), 0)

        OgrenciVeli.objects.filter(id=self.veli_opt_in.id).update(
            sms_bildirimleri=['duyuru', 'odeme'],
        )
        result2 = notify_payment_reminder(self.kurum.id, taksit.id)
        self.assertTrue(result2.success if result2 else False)
        self.assertEqual(Message.objects.filter(source_module=SOURCE_ODEME).count(), 1)

    def test_assignment_hook_sets_source_module(self):
        assignment = ManualAssignment.objects.create(
            student=self.student,
            title='Matematik Ödevi',
            status=ManualAssignment.Status.ASSIGNED,
            due_date=timezone.now() + timedelta(days=3),
            assigned_date=timezone.now(),
        )

        notify_assignment(self.kurum.id, assignment.id)

        msg = Message.objects.filter(source_module=SOURCE_ODEV).first()
        self.assertIsNotNone(msg)
        self.assertIn(str(assignment.id), msg.source_ref_id)
        self.assertTrue(OutboundQueueItem.objects.filter(message=msg).exists())

    def test_absence_hook_enqueues_when_called(self):
        notify_absence(
            self.kurum.id,
            self.student.id,
            timezone.localdate(),
            aciklama='1. ders',
        )

        msg = Message.objects.filter(source_module=SOURCE_DEVAMSIZLIK).first()
        self.assertIsNotNone(msg)
        self.assertTrue(OutboundQueueItem.objects.filter(message=msg).exists())
