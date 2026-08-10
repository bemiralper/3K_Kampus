from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, Client
from django.utils import timezone

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube
from apps.takvim.application.integration_service import KaynakModul
from apps.takvim.domain.enums import EventCategory, EventStatus
from apps.takvim.domain.models import Event, EventType

User = get_user_model()


class CoachScopeCalendarFilterTest(TestCase):
    """Koç takvim kapsamı + ogrenci_id filtresi."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Takvim Kurum', kod='TKV')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.user = User.objects.create_user(
            username='koc_takvim', email='koc_takvim@test.com', password='testpass123',
        )
        self.personel = Personel.objects.create(
            user=self.user,
            kurum=self.kurum,
            sube=self.sube,
            ad='Koç',
            soyad='Ali',
            tc_kimlik_no='11111111111',
        )
        self.coach = CoachProfile.objects.create(
            teacher=self.personel, is_active=True, is_coach=True,
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Yılmaz', aktif_mi=True,
        )
        self.other_student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mehmet', soyad='Demir', aktif_mi=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach, student=self.student, start_date=timezone.localdate(),
        )

        self.type_odev = EventType.objects.create(
            kurum_id=self.kurum.id, ad='Ödev', kategori=EventCategory.ODEV,
            renk='#22c55e', ikon='📝', is_system=True,
        )
        self.type_tatil = EventType.objects.create(
            kurum_id=self.kurum.id, ad='Tatil', kategori=EventCategory.TATIL,
            renk='#6b7280', ikon='🏖️', is_system=True,
        )

        now = timezone.now()
        self.mine = Event.objects.create(
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            event_type=self.type_odev, baslik='Öğrencim ödevi',
            baslangic=now, bitis=now + timedelta(hours=1),
            durum=EventStatus.SCHEDULED,
            ogretmen_id=self.user.id,
            ogrenci_ids=[self.student.id],
            kaynak_modul=KaynakModul.ODEV,
        )
        self.other = Event.objects.create(
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            event_type=self.type_odev, baslik='Başka öğrenci ödevi',
            baslangic=now, bitis=now + timedelta(hours=1),
            durum=EventStatus.SCHEDULED,
            ogretmen_id=99999,
            ogrenci_ids=[self.other_student.id],
            kaynak_modul=KaynakModul.ODEV,
        )
        self.holiday = Event.objects.create(
            kurum_id=self.kurum.id, sube_id=None,
            event_type=self.type_tatil, baslik='Resmi Tatil',
            baslangic=now, bitis=now + timedelta(days=1),
            tum_gun=True, durum=EventStatus.SCHEDULED,
            kaynak_modul=KaynakModul.RESMI_TATIL,
        )

        self.client = Client()
        self.client.force_login(self.user)

    def _get(self, **params):
        params.setdefault('compact', 'true')
        q = '&'.join(f'{k}={v}' for k, v in params.items())
        return self.client.get(
            f'/takvim/api/etkinlikler/?{q}',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )

    def test_coach_scope_hides_other_students(self):
        res = self._get(coach_scope='1')
        self.assertEqual(res.status_code, 200)
        titles = {e['title'] for e in res.json()['data']}
        self.assertIn('Öğrencim ödevi', titles)
        self.assertIn('Resmi Tatil', titles)
        self.assertNotIn('Başka öğrenci ödevi', titles)

    def test_ogrenci_id_filter(self):
        res = self._get(coach_scope='1', ogrenci_id=self.student.id)
        self.assertEqual(res.status_code, 200)
        titles = {e['title'] for e in res.json()['data']}
        self.assertIn('Öğrencim ödevi', titles)
        self.assertNotIn('Başka öğrenci ödevi', titles)

    def test_coach_scope_includes_null_sube_odev(self):
        """Eski senkronlar sube_id boş bırakmış olabilir — koç kapsamında görünsün."""
        now = timezone.now()
        Event.objects.create(
            kurum_id=self.kurum.id, sube_id=None,
            event_type=self.type_odev, baslik='Şubesiz ödev kontrol',
            baslangic=now, bitis=now + timedelta(hours=1),
            durum=EventStatus.SCHEDULED,
            ogretmen_id=self.user.id,
            ogrenci_ids=[self.student.id],
            kaynak_modul=KaynakModul.ODEV,
        )
        res = self._get(coach_scope='1')
        self.assertEqual(res.status_code, 200)
        titles = {e['title'] for e in res.json()['data']}
        self.assertIn('Şubesiz ödev kontrol', titles)
