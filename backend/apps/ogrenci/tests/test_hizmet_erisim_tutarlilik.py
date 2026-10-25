"""Hizmet erişimi, kayıt türü ve onarım komutunun tutarlılığı."""
import tempfile
from datetime import date, timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.egitim_paketleri.models import EkHizmet
from apps.egitim_yili.domain.models import EgitimYili
from apps.kutuphane.application.service import AssignmentService
from apps.kutuphane.domain.models import Library, Seat
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.application.services.sozlesme_erisim_sync import sync_sozlesme_erisim
from apps.odeme_takip.domain.enums import KalemTuru, SozlesmeDurum
from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi
from apps.ogrenci.domain.models import Ogrenci, OgrenciEkHizmet
from apps.ogrenci.services.hizmet_erisim import ogrenci_ids_with_hizmet_turu
from apps.ogrenci.services.kayit_turu import (
    is_deneme_kulubu_kayit,
    looks_like_deneme_kulubu,
    registration_type_label,
)
from apps.sube.domain.models import Sube

User = get_user_model()


class KayitTuruTutarlilikTests(TestCase):
    def test_turkce_etiket_deneme_kulubu_sayilir(self):
        self.assertTrue(looks_like_deneme_kulubu('dk', 'Deneme Kulübü'))

    def test_asile_donus_deneme_sayilmaz(self):
        kurum = Kurum.objects.create(ad='Kayıt Kurum', kod='KAY')
        sube = Sube.objects.create(kurum=kurum, ad='Merkez', kod='KAY')
        ogrenci = Ogrenci.objects.create(
            kurum=kurum, sube=sube, ad='Deniz', soyad='Ak',
            aktif_mi=True, kayit_turu='deneme_kulubu',
        )
        self.assertTrue(is_deneme_kulubu_kayit(ogrenci))
        ogrenci.kayit_turu = 'asil'
        ogrenci.save(update_fields=['kayit_turu'])
        ogrenci.refresh_from_db()
        self.assertFalse(is_deneme_kulubu_kayit(ogrenci))
        self.assertNotEqual(registration_type_label('deneme_kulubu'), 'Asil')


class KutuphaneErisimTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kütüphane Kurum', kod='KUTK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KUTK')
        self.diger = Sube.objects.create(kurum=self.kurum, ad='Diğer', kod='KUTD')
        self.ey = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.user = User.objects.create_superuser(username='kut_admin', password='testpass123')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Lara', soyad='Yılmaz', aktif_mi=True,
        )
        self.hizmet = EkHizmet.objects.create(
            ad='Kütüphane', kod='KUT26', hizmet_turu='kutuphane',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.ey, brut_fiyat=1000,
        )
        self.library = Library.objects.create(
            kurum_id=self.kurum.id, sube_id=self.sube.id, ad='Salon', kod='S1', kapasite=10,
        )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.ey.id),
        }

    def _ac(self):
        OgrenciEkHizmet.objects.create(
            ogrenci=self.ogrenci, ek_hizmet=self.hizmet, aktif_mi=True,
            egitim_yili=self.ey, fiyat=0,
        )

    def test_hizmeti_olan_ogrenci_listede(self):
        self._ac()
        self.client.force_login(self.user)
        res = self.client.get('/kutuphane/api/ogrenci-kaynaklar/', **self.headers)
        self.assertEqual(res.status_code, 200)
        names = {s['ogrenci_adi'] for s in res.json()['data']['students']}
        self.assertIn('Lara Yılmaz', names)

    def test_hizmeti_olmayan_ve_baska_sube_listede_yok(self):
        baska = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.diger, ad='Ege', soyad='Kara', aktif_mi=True,
        )
        OgrenciEkHizmet.objects.create(
            ogrenci=baska, ek_hizmet=self.hizmet, aktif_mi=True, egitim_yili=self.ey, fiyat=0,
        )
        self.client.force_login(self.user)
        res = self.client.get('/kutuphane/api/ogrenci-kaynaklar/', **self.headers)
        names = {s['ogrenci_adi'] for s in res.json()['data']['students']}
        self.assertNotIn('Ege Kara', names)
        self.assertNotIn('Lara Yılmaz', names)

    def test_yeni_masa_hizmet_yoksa_reddedilir_hizmet_varsa_yazilir(self):
        seat = Seat.objects.create(library=self.library, masa_no='M-1', durum='AVAILABLE')
        with self.assertRaises(ValueError):
            AssignmentService().create_seat_assignment({
                'library_id': self.library.id,
                'seat_id': seat.id,
                'ogrenci_id': self.ogrenci.id,
                'atama_tipi': 'KALICI',
                'baslangic_tarihi': date.today(),
                'egitim_yili_id': self.ey.id,
            }, self.user.id)
        self._ac()
        assignment = AssignmentService().create_seat_assignment({
            'library_id': self.library.id,
            'seat_id': seat.id,
            'ogrenci_id': self.ogrenci.id,
            'atama_tipi': 'KALICI',
            'baslangic_tarihi': date.today(),
            'egitim_yili_id': self.ey.id,
        }, self.user.id)
        self.assertEqual(assignment.ogrenci_id, self.ogrenci.id)


class AuditErisimCommandTests(TestCase):
    def test_dry_run_yazmaz_ikinci_apply_bos(self):
        kurum = Kurum.objects.create(ad='Denetim', kod='DNT')
        sube = Sube.objects.create(kurum=kurum, ad='Merkez', kod='DNT')
        ey = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        ogrenci = Ogrenci.objects.create(
            kurum=kurum, sube=sube, ad='Ata', soyad='Demir', aktif_mi=True,
        )
        hizmet = EkHizmet.objects.create(
            ad='Kütüphane', kod='DNTK', hizmet_turu='kutuphane',
            kurum=kurum, sube=sube, egitim_yili=ey, brut_fiyat=1000,
        )
        today = timezone.localdate()
        sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZL-DNT-1', ogrenci=ogrenci, egitim_yili=ey,
            kurum=kurum, sube=sube,
            baslangic_tarihi=today, bitis_tarihi=today + timedelta(days=30),
            paket_turu='ek_hizmet', paket_adi='Ek',
            brut_tutar=1000, kdv_dahil_tutar=1000, net_tutar=1000,
            taksit_sayisi=1, durum=SozlesmeDurum.AKTIF,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=sozlesme, kalem_turu=KalemTuru.EK_HIZMET,
            kalem_id=hizmet.id, kalem_adi='Kütüphane',
            brut_tutar=1000, net_tutar=1000, kdv_dahil_tutar=1000,
        )
        call_command('audit_ogrenci_erisim', '--kurum-id', str(kurum.id), stdout=StringIO())
        self.assertFalse(OgrenciEkHizmet.objects.filter(ogrenci=ogrenci).exists())
        journal = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
        journal.close()
        call_command(
            'audit_ogrenci_erisim', '--apply', '--journal', journal.name,
            '--kurum-id', str(kurum.id), stdout=StringIO(),
        )
        self.assertTrue(OgrenciEkHizmet.objects.filter(
            ogrenci=ogrenci, ek_hizmet=hizmet, aktif_mi=True, egitim_yili=ey,
        ).exists())
        before = OgrenciEkHizmet.objects.filter(ogrenci=ogrenci, aktif_mi=True).count()
        out = StringIO()
        journal2 = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
        journal2.close()
        call_command(
            'audit_ogrenci_erisim', '--apply', '--journal', journal2.name,
            '--kurum-id', str(kurum.id), stdout=out,
        )
        self.assertEqual(OgrenciEkHizmet.objects.filter(ogrenci=ogrenci, aktif_mi=True).count(), before)
        self.assertIn('0 erişim açma', out.getvalue())
        self.assertIn(
            ogrenci.id,
            ogrenci_ids_with_hizmet_turu(
                'kutuphane', kurum_id=kurum.id, sube_id=sube.id, egitim_yili_id=ey.id,
            ),
        )
        sync_sozlesme_erisim(sozlesme)
        self.assertEqual(OgrenciEkHizmet.objects.filter(ogrenci=ogrenci, aktif_mi=True).count(), 1)

    def test_sozlesmesiz_erisim_apply_ile_kapanmaz(self):
        kurum = Kurum.objects.create(ad='Doğrudan', kod='DGR')
        sube = Sube.objects.create(kurum=kurum, ad='Merkez', kod='DGR')
        ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=False)
        ogrenci = Ogrenci.objects.create(
            kurum=kurum, sube=sube, ad='Eda', soyad='Ak', aktif_mi=True,
        )
        hizmet = EkHizmet.objects.create(
            ad='Etüt', kod='DGRK', hizmet_turu='kutuphane',
            kurum=kurum, sube=sube, egitim_yili=ey, brut_fiyat=1000,
        )
        OgrenciEkHizmet.objects.create(
            ogrenci=ogrenci, ek_hizmet=hizmet, aktif_mi=True, egitim_yili=ey, fiyat=0,
        )
        out = StringIO()
        journal = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
        journal.close()
        call_command(
            'audit_ogrenci_erisim', '--apply', '--journal', journal.name,
            '--kurum-id', str(kurum.id), stdout=out,
        )
        self.assertTrue(OgrenciEkHizmet.objects.filter(
            ogrenci=ogrenci, ek_hizmet=hizmet, aktif_mi=True,
        ).exists())
        self.assertIn('Hak veren sözleşmesi olmayan', out.getvalue())
        self.assertIn(f'öğrenci={ogrenci.id}', out.getvalue())

    def test_geri_alma_sonraki_kaydi_ezmez(self):
        kurum = Kurum.objects.create(ad='Geri', kod='GRI')
        sube = Sube.objects.create(kurum=kurum, ad='Merkez', kod='GRI')
        ey = EgitimYili.objects.create(baslangic_yil=2021, bitis_yil=2022, aktif_mi=False)
        diger = EgitimYili.objects.create(baslangic_yil=2020, bitis_yil=2021, aktif_mi=False)
        ogrenci = Ogrenci.objects.create(
            kurum=kurum, sube=sube, ad='Geri', soyad='Al', aktif_mi=True,
        )
        hizmet = EkHizmet.objects.create(
            ad='Kütüphane', kod='GRIK', hizmet_turu='kutuphane',
            kurum=kurum, sube=sube, egitim_yili=ey, brut_fiyat=1000,
        )
        today = timezone.localdate()
        sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZL-GRI-1', ogrenci=ogrenci, egitim_yili=ey,
            kurum=kurum, sube=sube,
            baslangic_tarihi=today, bitis_tarihi=today + timedelta(days=30),
            paket_turu='ek_hizmet', paket_adi='Ek',
            brut_tutar=1000, kdv_dahil_tutar=1000, net_tutar=1000,
            taksit_sayisi=1, durum=SozlesmeDurum.AKTIF,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=sozlesme, kalem_turu=KalemTuru.EK_HIZMET,
            kalem_id=hizmet.id, kalem_adi='Kütüphane',
            brut_tutar=1000, net_tutar=1000, kdv_dahil_tutar=1000,
        )
        journal = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
        journal.close()
        call_command(
            'audit_ogrenci_erisim', '--apply', '--journal', journal.name,
            '--kurum-id', str(kurum.id), stdout=StringIO(),
        )
        row = OgrenciEkHizmet.objects.get(ogrenci=ogrenci, ek_hizmet=hizmet)
        row.egitim_yili = diger
        row.save(update_fields=['egitim_yili', 'updated_at'])
        call_command(
            'restore_ogrenci_erisim', '--apply', '--journal', journal.name, stdout=StringIO(),
        )
        row.refresh_from_db()
        self.assertTrue(row.aktif_mi)
        self.assertEqual(row.egitim_yili_id, diger.id)

    def test_yili_bos_kayit_secili_yila_hak_vermez(self):
        kurum = Kurum.objects.create(ad='Yılsız', kod='YLS')
        sube = Sube.objects.create(kurum=kurum, ad='Merkez', kod='YLS')
        ey = EgitimYili.objects.create(baslangic_yil=2022, bitis_yil=2023, aktif_mi=False)
        ogrenci = Ogrenci.objects.create(
            kurum=kurum, sube=sube, ad='Naz', soyad='Ak', aktif_mi=True,
        )
        hizmet = EkHizmet.objects.create(
            ad='Kütüphane', kod='YLSK', hizmet_turu='kutuphane',
            kurum=kurum, sube=sube, egitim_yili=ey, brut_fiyat=1000,
        )
        OgrenciEkHizmet.objects.create(
            ogrenci=ogrenci, ek_hizmet=hizmet, aktif_mi=True, egitim_yili=None, fiyat=0,
        )
        self.assertNotIn(
            ogrenci.id,
            ogrenci_ids_with_hizmet_turu(
                'kutuphane', kurum_id=kurum.id, sube_id=sube.id, egitim_yili_id=ey.id,
            ),
        )
