"""Öğrenci kaynak genel görünümü filtre testleri."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.kutuphane.domain.models import (
    AssignmentStatus,
    Library,
    Locker,
    LockerAssignment,
    Seat,
    SeatAssignment,
)
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()


class StudentResourceFilterTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Filter Test', kod='FLT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.user = User.objects.create_superuser(username='filter_admin', password='testpass123')

        self.masa_only = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Masa', soyad='Only', aktif_mi=True,
        )
        self.dolap_only = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Dolap', soyad='Only', aktif_mi=True,
        )
        self.both = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ikisi', soyad='Var', aktif_mi=True,
        )

        self.library = Library.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            ad='Salon',
            kod='S1',
            kapasite=20,
        )

        def seat(no, student_id):
            s = Seat.objects.create(library=self.library, masa_no=no, durum='AVAILABLE')
            SeatAssignment.objects.create(
                library=self.library,
                seat=s,
                ogrenci_id=student_id,
                atama_tipi='KALICI',
                baslangic_tarihi=date.today(),
                durum=AssignmentStatus.ACTIVE,
            )

        seat('M-1', self.masa_only.id)
        seat('M-2', self.both.id)

        locker = Locker.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            dolap_no='D-1',
            durum='AVAILABLE',
        )
        LockerAssignment.objects.create(
            kurum_id=self.kurum.id,
            locker=locker,
            ogrenci_id=self.dolap_only.id,
            atama_tipi='KALICI',
            baslangic_tarihi=date.today(),
            durum=AssignmentStatus.ACTIVE,
        )
        locker2 = Locker.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            dolap_no='D-2',
            durum='AVAILABLE',
        )
        LockerAssignment.objects.create(
            kurum_id=self.kurum.id,
            locker=locker2,
            ogrenci_id=self.both.id,
            atama_tipi='KALICI',
            baslangic_tarihi=date.today(),
            durum=AssignmentStatus.ACTIVE,
        )

        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def _get(self, filtre='all'):
        self.client.force_login(self.user)
        return self.client.get(
            f'/kutuphane/api/ogrenci-kaynaklar/?filtre={filtre}',
            **self.headers,
        )

    def test_summary_stable_across_filters(self):
        res = self._get('masa_var')
        self.assertEqual(res.status_code, 200)
        payload = res.json()['data']
        self.assertEqual(payload['summary']['toplam'], 3)
        self.assertEqual(payload['summary']['masa_var'], 2)
        self.assertEqual(payload['summary']['dolap_var'], 2)
        self.assertEqual(payload['summary']['ikisi_var'], 1)
        self.assertEqual(len(payload['students']), 2)

    def test_masa_var_filter(self):
        names = {s['ogrenci_adi'] for s in self._get('masa_var').json()['data']['students']}
        self.assertEqual(names, {'Masa Only', 'Ikisi Var'})

    def test_dolap_var_filter(self):
        names = {s['ogrenci_adi'] for s in self._get('dolap_var').json()['data']['students']}
        self.assertEqual(names, {'Dolap Only', 'Ikisi Var'})

    def test_ikisi_var_filter(self):
        names = {s['ogrenci_adi'] for s in self._get('ikisi_var').json()['data']['students']}
        self.assertEqual(names, {'Ikisi Var'})

    def test_masa_yok_filter(self):
        names = {s['ogrenci_adi'] for s in self._get('masa_yok').json()['data']['students']}
        self.assertEqual(names, {'Dolap Only'})

    def test_ikisi_yok_filter(self):
        names = {s['ogrenci_adi'] for s in self._get('ikisi_yok').json()['data']['students']}
        self.assertEqual(names, set())
