"""
Faz 4 — Modül entegrasyon hook testleri.
"""
from datetime import date, timedelta
from unittest.mock import patch

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
    SOURCE_OGRENCI,
    build_kayit_sozlesme_context,
    notify_absence,
    notify_assignment,
    notify_gorusme_reminder,
    notify_kayit_sozlesme,
    notify_payment_reminder,
)
from apps.communication.application.notification_events import get_event
from apps.communication.application.staff_recipient_service import (
    KAYIT_SOZLESME_EVENT,
    replace_staff_recipients,
)
from apps.communication.domain.models import NotificationStaffRecipient
from apps.communication.domain.enums import MessageStatus
from apps.communication.domain.models import Message
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
from apps.communication.tests.session_helpers import open_session_window
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
        # Serbest mesaj yalnızca 24 saatlik pencere açıkken gider
        open_session_window(
            self.kurum.id,
            self.student.telefon,
            self.veli_opt_in.telefon,
            self.veli_opt_out.telefon,
        )

    @patch.object(WhatsAppCloudClient, 'send_text')
    def test_gorusme_hook_sends_message(self, mock_send):
        mock_send.return_value = {'success': True, 'messages': [{'id': 'wamid.gor1'}]}
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
        self.assertEqual(msg.status, MessageStatus.SENT, 'Hook mesajı iletmeli')
        self.assertTrue(msg.source_ref_id.startswith(str(gorusme.id)))

    @patch.object(WhatsAppCloudClient, 'send_text')
    def test_payment_reminder_respects_opt_out(self, mock_send):
        mock_send.return_value = {'success': True, 'messages': [{'id': 'wamid.pay1'}]}
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

    @patch.object(WhatsAppCloudClient, 'send_text')
    def test_assignment_hook_sets_source_module(self, mock_send):
        mock_send.return_value = {'success': True, 'messages': [{'id': 'wamid.odev1'}]}
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
        self.assertEqual(msg.status, MessageStatus.SENT)

    @patch.object(WhatsAppCloudClient, 'send_text')
    def test_absence_hook_sends_when_called(self, mock_send):
        mock_send.return_value = {'success': True, 'messages': [{'id': 'wamid.dev1'}]}
        notify_absence(
            self.kurum.id,
            self.student.id,
            timezone.localdate(),
            aciklama='1. ders',
        )

        msg = Message.objects.filter(source_module=SOURCE_DEVAMSIZLIK).first()
        self.assertIsNotNone(msg)
        self.assertEqual(msg.status, MessageStatus.SENT)


class KayitSozlesmeNotifyTests(TestCase):
    def setUp(self):
        from apps.egitim_tanimlari.models import SinifSeviyesi
        from apps.egitim_yili.domain.models import EgitimYili
        from apps.odeme_takip.domain.enums import KalemTuru
        from apps.odeme_takip.domain.models import SozlesmeKalemi
        from apps.roller.models import Role, UserRole
        from apps.roller.seed import ensure_default_roles

        ensure_default_roles()
        self.kurum = Kurum.objects.create(ad='Kayit Bildirim', kod='KBD')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KBD-M')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='9. Sınıf', kod='9',
        )
        self.kayit_user = User.objects.create_user(
            username='kayitci', password='x', first_name='Ayşe', last_name='Kayıt',
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Yılmaz', aktif_mi=True,
        )
        from apps.ogrenci.domain.models import OgrenciKayit
        self.kayit = OgrenciKayit.objects.create(
            ogrenci=self.student,
            sinif_seviyesi=self.seviye,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            kaydi_alan=self.kayit_user,
        )
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-KAYIT-001',
            ogrenci=self.student,
            ogrenci_kayit=self.kayit,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=date(2025, 9, 1),
            bitis_tarihi=date(2026, 6, 30),
            brut_tutar=10000,
            net_tutar=10000,
            durum=SozlesmeDurum.TASLAK,
            paket_adi='Grup Ders',
        )
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.GRUP_DERSI,
            kalem_id=1, kalem_adi='Grup Ders',
        )
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.EK_HIZMET,
            kalem_id=2, kalem_adi='Koçluk',
        )
        yonetici_user = User.objects.create_user(username='yonetici_kbd', password='x')
        UserRole.objects.create(
            user=yonetici_user,
            role=Role.objects.get(code='kurum_yoneticisi'),
            kurum=self.kurum,
            must_change_password=False,
        )
        self.yonetici = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
            soyad='Yönetici',
            tc_kimlik_no='22222222222',
            user=yonetici_user,
            cep_telefon='05320001122',
        )
        open_session_window(self.kurum.id, self.yonetici.cep_telefon)

    def test_event_catalog_has_kayit_sozlesme(self):
        event = get_event(KAYIT_SOZLESME_EVENT)
        self.assertIsNotNone(event)
        self.assertIn('egitim_paketleri', event.variables)
        self.assertIn('PERSONEL', event.recipients)

    def test_context_joins_packages_and_kayit_yapan(self):
        ctx = build_kayit_sozlesme_context(self.sozlesme)
        self.assertEqual(ctx['ogrenci_ad'], 'Ali Yılmaz')
        self.assertEqual(ctx['sinif_seviyesi'], '9. Sınıf')
        self.assertEqual(ctx['egitim_paketleri'], 'Grup Ders, Koçluk')
        self.assertEqual(ctx['kayit_yapan'], 'Ayşe Kayıt')

    def test_no_recipients_sends_nothing(self):
        results = notify_kayit_sozlesme(self.sozlesme.id)
        self.assertEqual(results, [])
        self.assertEqual(Message.objects.filter(source_module=SOURCE_OGRENCI).count(), 0)

    @patch.object(WhatsAppCloudClient, 'send_text')
    def test_aktif_sends_to_selected_yonetici(self, mock_send):
        mock_send.return_value = {'success': True, 'messages': [{'id': 'wamid.kayit1'}]}
        replace_staff_recipients(
            self.kurum.id, KAYIT_SOZLESME_EVENT, [self.yonetici.id],
        )
        results = notify_kayit_sozlesme(self.sozlesme.id)
        self.assertEqual(len(results), 1)
        self.assertTrue(results[0].success)
        msg = Message.objects.filter(source_module=SOURCE_OGRENCI).first()
        self.assertIsNotNone(msg)
        self.assertIn('Ali Yılmaz', msg.body)
        self.assertIn('Grup Ders, Koçluk', msg.body)

        again = notify_kayit_sozlesme(self.sozlesme.id)
        self.assertEqual(again, [])
        self.assertEqual(Message.objects.filter(source_module=SOURCE_OGRENCI).count(), 1)

    @patch.object(WhatsAppCloudClient, 'send_text')
    def test_change_status_aktif_fires_on_commit(self, mock_send):
        from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService

        mock_send.return_value = {'success': True, 'messages': [{'id': 'wamid.kayit2'}]}
        replace_staff_recipients(
            self.kurum.id, KAYIT_SOZLESME_EVENT, [self.yonetici.id],
        )
        with self.captureOnCommitCallbacks(execute=True):
            soz, err = SozlesmeService().change_status(self.sozlesme.id, SozlesmeDurum.AKTIF)
        self.assertIsNone(err, err)
        self.assertEqual(soz.durum, SozlesmeDurum.AKTIF)
        self.assertEqual(Message.objects.filter(source_module=SOURCE_OGRENCI).count(), 1)

    def test_taslak_create_does_not_notify(self):
        self.assertEqual(self.sozlesme.durum, SozlesmeDurum.TASLAK)
        self.assertEqual(Message.objects.filter(source_module=SOURCE_OGRENCI).count(), 0)
        self.assertEqual(NotificationStaffRecipient.objects.count(), 0)

    def test_list_includes_gorevlendirme_yoneticisi_without_user(self):
        from apps.personel.domain.models import PersonelGorevlendirme
        from apps.communication.application.staff_recipient_service import list_staff_recipients
        from apps.roller.models import Role

        mudur = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='İrfan',
            soyad='Koçyiğit',
            tc_kimlik_no='33333333333',
            cep_telefon='05376195411',
        )
        PersonelGorevlendirme.objects.create(
            personel=mudur,
            kurum=self.kurum,
            gorev_sube=self.sube,
            egitim_yili=self.ey,
            rol=Role.objects.get(code='kurum_yoneticisi'),
            aktif_mi=True,
        )
        data = list_staff_recipients(self.kurum.id, KAYIT_SOZLESME_EVENT)
        ids = {row['id'] for row in data['items']}
        self.assertIn(mudur.id, ids)
        self.assertIn(self.yonetici.id, ids)
        row = next(r for r in data['items'] if r['id'] == mudur.id)
        self.assertEqual(row['rol_kodu'], 'kurum_yoneticisi')
        self.assertTrue(row['has_phone'])
