"""Görev atama, ekran mesajı ve otomatik deneme kuralı testleri."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.egitim_yili.domain.models import EgitimYili
from apps.gorev.application.rule_engine import GorevRuleEngine
from apps.gorev.application.service import GorevService
from apps.gorev.domain.enums import HedefTipi
from apps.gorev.domain.models import GorevAtama, GorevTipi
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Role, UserRole
from apps.sube.domain.models import Sube
from apps.takvim.domain.models import AppNotification

User = get_user_model()


class GorevAssignmentServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Görev Kurum', kod='GRV')
        self.sube1 = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='GRV-1')
        self.sube2 = Sube.objects.create(kurum=self.kurum, ad='Kampüs 2', kod='GRV-2')
        self.ey = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.role_koc, _ = Role.objects.get_or_create(
            code='koc',
            defaults={'name': 'Koç', 'level': 100, 'is_system_role': True},
        )
        self.coach_user = User.objects.create_user('koc_banu', 'koc@test.com', 'pass')
        self.admin_user = User.objects.create_user('yonetici', 'admin@test.com', 'pass')
        self.coach = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube1,
            ad='Banu',
            soyad='Kaya',
            user=self.coach_user,
            aktif_mi=True,
        )
        UserRole.objects.update_or_create(
            user=self.coach_user,
            defaults={'role': self.role_koc, 'kurum': self.kurum},
        )
        PersonelGorevlendirme.objects.create(
            personel=self.coach,
            kurum=self.kurum,
            egitim_yili=self.ey,
            gorev_sube=self.sube2,
            rol=self.role_koc,
            aktif_mi=True,
        )
        self.tip = GorevTipi.objects.create(
            kurum_id=self.kurum.id,
            kod='YAPILACAK',
            ad='Yapılacak İş',
            is_system=True,
        )
        self.service = GorevService()

    def test_role_resolve_uses_gorevlendirme_not_home_sube(self):
        ids = self.service.resolve_assignee_user_ids(
            self.kurum.id, HedefTipi.ROL, 'koc', sube_id=self.sube2.id,
        )
        self.assertEqual(ids, [self.coach_user.id])

    def test_create_role_task_with_screen_message(self):
        gorev = self.service.create_gorev(self.kurum.id, {
            'gorev_tipi_id': str(self.tip.id),
            'baslik': 'Toplantı notunu oku',
            'aciklama': 'Yarın toplantıdan önce bakın',
            'oncelik': 'NORMAL',
            'son_tarih': timezone.now() + timedelta(days=2),
            'hedef_tipi': HedefTipi.ROL,
            'hedef_rol_kodu': 'koc',
            'ekran_mesaji': True,
            'sube_id': self.sube2.id,
        }, olusturan_id=self.admin_user.id)

        atamalar = list(GorevAtama.objects.filter(gorev=gorev))
        self.assertEqual(len(atamalar), 1)
        self.assertEqual(atamalar[0].atanan_user_id, self.coach_user.id)

        notif = AppNotification.objects.get(user_id=self.coach_user.id, kurum_id=self.kurum.id)
        self.assertTrue(notif.ekran_mesaji)
        self.assertEqual(notif.baslik, 'Görev: Yapılacak İş — Toplantı notunu oku')
        self.assertEqual(notif.mesaj, '')
        self.assertEqual(notif.url, f'/coach/gorevler/{gorev.id}')

    def test_create_user_task_appears_in_bugun_list(self):
        gorev = self.service.create_gorev(self.kurum.id, {
            'gorev_tipi_id': str(self.tip.id),
            'baslik': 'Kişisel görev',
            'son_tarih': timezone.now() + timedelta(days=5),
            'hedef_tipi': HedefTipi.KULLANICI,
            'hedef_user_ids': [self.coach_user.id],
            'ekran_mesaji': True,
        }, olusturan_id=self.admin_user.id)

        start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        atamalar = self.service.list_atamalar(self.kurum.id, user_id=self.coach_user.id, filters={
            'baslangic': start,
            'bitis': end,
            'bugun': True,
        })
        self.assertTrue(any(a.gorev_id == gorev.id for a in atamalar))

    def test_empty_assignees_raise(self):
        with self.assertRaises(ValueError):
            self.service.create_gorev(self.kurum.id, {
                'gorev_tipi_id': str(self.tip.id),
                'baslik': 'Boş rol',
                'son_tarih': timezone.now(),
                'hedef_tipi': HedefTipi.ROL,
                'hedef_rol_kodu': 'muhasebe',
            }, olusturan_id=self.admin_user.id)

    def test_exam_hooks_do_not_create_tasks(self):
        engine = GorevRuleEngine()
        exam = type('Exam', (), {
            'id': 99,
            'kurum_id': self.kurum.id,
            'exam_date': timezone.localdate(),
            'is_template': False,
            'name': 'TYT Deneme',
            'sube_id': self.sube1.id,
            'egitim_yili_id': self.ey.id,
            'siniflar': type('M', (), {'values_list': lambda *a, **k: []})(),
        })()
        self.assertIsNone(engine.on_exam_created(exam))
        self.assertIsNone(engine.on_exam_results_published(exam))
        self.assertFalse(
            GorevAtama.objects.filter(gorev__baslik__icontains='Deneme').exists(),
        )

    def _open_task(self, baslik='Geri dönüş'):
        return self.service.create_gorev(self.kurum.id, {
            'gorev_tipi_id': str(self.tip.id),
            'baslik': baslik,
            'son_tarih': timezone.now() + timedelta(days=1),
            'hedef_tipi': HedefTipi.KULLANICI,
            'hedef_user_ids': [self.coach_user.id],
        }, olusturan_id=self.admin_user.id)

    def test_assignee_feedback_reaches_only_the_sender(self):
        gorev = self._open_task()
        atama = GorevAtama.objects.get(gorev=gorev)
        self.service.update_atama(atama, {}, user_id=self.coach_user.id)
        self.assertFalse(
            AppNotification.objects.filter(baslik__startswith='Geri bildirim:').exists(),
        )

        atama.refresh_from_db()
        self.service.update_atama(atama, {'notlar': 'Aradım, açmadı.'}, user_id=self.coach_user.id)
        note = AppNotification.objects.get(baslik__startswith='Geri bildirim:')
        self.assertEqual(note.user_id, self.admin_user.id)
        self.assertFalse(note.ekran_mesaji)
        self.assertIn('Aradım, açmadı.', note.mesaj)
        self.assertEqual(note.url, f'/admin/gorevler/{gorev.id}')

        atama.refresh_from_db()
        self.service.update_atama(atama, {'notlar': 'Aradım, açmadı.'}, user_id=self.coach_user.id)
        self.assertEqual(AppNotification.objects.filter(baslik__startswith='Geri bildirim:').count(), 1)

    def test_completing_with_a_note_does_not_send_a_second_feedback(self):
        gorev = self._open_task('Kapanış')
        atama = GorevAtama.objects.get(gorev=gorev)
        self.service.update_atama(
            atama,
            {'durum': 'TAMAMLANDI', 'notlar': 'Bitti'},
            user_id=self.coach_user.id,
        )
        self.assertFalse(AppNotification.objects.filter(baslik__startswith='Geri bildirim:').exists())
        done = AppNotification.objects.get(user_id=self.admin_user.id, baslik__startswith='Görev Tamamlandı:')
        self.assertIn('Bitti', done.mesaj)

    def test_personal_reminder_is_set_by_assignee_and_sent_once(self):
        from apps.gorev.application.personal_reminder import send_due_personal_reminders

        gorev = self._open_task('Hatırlatılacak')
        atama = GorevAtama.objects.get(gorev=gorev)
        when = timezone.now() + timedelta(hours=2)
        self.service.update_atama(atama, {'kisisel_hatirlatma_at': when}, user_id=self.coach_user.id)
        atama.refresh_from_db()
        self.assertEqual(atama.kisisel_hatirlatma_at, when)
        self.assertIsNone(atama.kisisel_hatirlatma_gonderildi_at)

        with self.assertRaises(ValueError):
            self.service.update_atama(
                atama,
                {'kisisel_hatirlatma_at': when + timedelta(hours=1)},
                user_id=self.admin_user.id,
            )
        with self.assertRaises(ValueError):
            self.service.update_atama(
                atama,
                {'kisisel_hatirlatma_at': timezone.now() - timedelta(minutes=5)},
                user_id=self.coach_user.id,
            )

        self.assertEqual(send_due_personal_reminders(timezone.now()), 0)
        self.assertEqual(send_due_personal_reminders(when + timedelta(minutes=1)), 1)
        note = AppNotification.objects.get(user_id=self.coach_user.id, baslik__startswith='Hatırlatma:')
        self.assertIn('Yapılacak İş — Hatırlatılacak', note.baslik)
        self.assertEqual(note.url, f'/coach/gorevler/{gorev.id}')
        self.assertFalse(note.ekran_mesaji)
        self.assertEqual(send_due_personal_reminders(when + timedelta(minutes=2)), 0)
