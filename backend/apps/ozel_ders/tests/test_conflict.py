from datetime import date, time

from django.test import SimpleTestCase, TestCase

from apps.ozel_ders.domain.models import BirebirHaftalikSlot, BirebirOgrenciProgrami, ProgramDurumu
from apps.ozel_ders.services.conflict_service import validate_slot_window
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.slot_service import _check_template_conflicts


class ConflictHelperTests(SimpleTestCase):
    def test_validate_slot_window_ok(self):
        validate_slot_window(time(10, 0), time(11, 0))

    def test_validate_slot_window_bad(self):
        with self.assertRaises(OzelDersError):
            validate_slot_window(time(11, 0), time(10, 0))


class TeacherTemplateConflictMessageTests(TestCase):
    def test_message_names_the_other_students_program(self):
        from apps.egitim_tanimlari.models import Ders
        from apps.egitim_yili.domain.models import EgitimYili
        from apps.kurum.domain.models import Kurum
        from apps.ogrenci.domain.models import Ogrenci
        from apps.personel.domain.models import Personel
        from apps.sube.domain.models import Sube

        kurum = Kurum.objects.create(ad='Çakışma Kurum', kod='CKS')
        sube = Sube.objects.create(kurum=kurum, ad='3K Kampüs', kod='CKS1')
        year, _ = EgitimYili.objects.get_or_create(
            baslangic_yil=2025, bitis_yil=2026, defaults={'aktif_mi': True},
        )
        teacher = Personel.objects.create(kurum=kurum, sube=sube, ad='Kenan', soyad='Aşıkoğlu', aktif_mi=True)
        ders = Ders.objects.create(kurum=kurum, sube=sube, ad='Fizik-1', kod='FIZ-CKS', kisa_ad='Fizik')
        moving = Ogrenci.objects.create(kurum=kurum, sube=sube, ad='Elif', soyad='Macit', aktif_mi=True)
        other = Ogrenci.objects.create(kurum=kurum, sube=sube, ad='Ece Naz', soyad='Şen', aktif_mi=True)
        common = dict(kurum=kurum, sube=sube, egitim_yili=year, baslangic_tarihi=date(2026, 8, 25), durum=ProgramDurumu.AKTIF)
        own = BirebirOgrenciProgrami.objects.create(ogrenci=moving, **common)
        theirs = BirebirOgrenciProgrami.objects.create(ogrenci=other, **common)
        slot = dict(gun=5, ders=ders, ogretmen=teacher, aktif=True)
        BirebirHaftalikSlot.objects.create(program=own, baslangic=time(16, 0), bitis=time(16, 50), **slot)
        BirebirHaftalikSlot.objects.create(program=theirs, baslangic=time(15, 0), bitis=time(15, 50), **slot)

        with self.assertRaises(OzelDersError) as error:
            _check_template_conflicts(
                own, gun=5, baslangic=time(15, 0), bitis=time(15, 50),
                ogretmen_id=teacher.pk, oda_id=None,
            )
        self.assertEqual(error.exception.code, 'teacher_template_conflict')
        self.assertIn('Ece Naz Şen', error.exception.message)
        self.assertIn('Fizik', error.exception.message)
        self.assertIn('Cuma 15:00–15:50', error.exception.message)
        self.assertIn('3K Kampüs', error.exception.message)
        self.assertNotIn('slot #', error.exception.message)
