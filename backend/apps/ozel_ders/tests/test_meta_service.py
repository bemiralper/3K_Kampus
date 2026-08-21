from django.test import TestCase

from apps.egitim_tanimlari.models import Ders
from apps.kurum.domain.models import Kurum
from apps.ozel_ders.services.meta_service import build_meta
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.sube.domain.models import Sube
from apps.egitim_yili.domain.models import EgitimYili


class MetaServiceTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='OD Meta', kod='ODMETA')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ODM')
        self.other = Sube.objects.create(kurum=self.kurum, ad='Diğer', kod='ODD')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)

    def test_dersler_prefer_sube_then_kurum(self):
        other_ders = Ders.objects.create(
            kurum=self.kurum, sube=self.other, ad='Kimya', kod='KIM', kisa_ad='',
        )
        meta = build_meta(kurum_id=self.kurum.id, sube_id=self.sube.id)
        self.assertEqual(len(meta['dersler']), 1)
        self.assertEqual(meta['dersler'][0]['id'], other_ders.id)
        self.assertEqual(meta['dersler'][0]['ad'], 'Kimya')

    def test_dersler_on_same_sube_do_not_leak_other(self):
        local = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MAT', kisa_ad='Mat',
        )
        Ders.objects.create(
            kurum=self.kurum, sube=self.other, ad='Kimya', kod='KIM', kisa_ad='',
        )
        meta = build_meta(kurum_id=self.kurum.id, sube_id=self.sube.id)
        ids = {d['id'] for d in meta['dersler']}
        self.assertEqual(ids, {local.id})

    def test_teachers_include_gorevlendirme(self):
        home = Personel.objects.create(
            kurum=self.kurum, sube=self.other, ad='Ayşe', soyad='Kaya', aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            personel=home,
            egitim_yili=self.ey,
            gorev_sube=self.sube,
            kurum=self.kurum,
            aktif_mi=True,
        )
        local = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Can', soyad='Demir', aktif_mi=True,
        )
        meta = build_meta(kurum_id=self.kurum.id, sube_id=self.sube.id)
        names = {t['name'] for t in meta['teachers']}
        self.assertIn('Ayşe Kaya', names)
        self.assertIn('Can Demir', names)
