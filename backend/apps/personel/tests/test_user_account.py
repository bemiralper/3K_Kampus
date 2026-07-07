"""Personel kullanıcı hesabı çözümleme testleri."""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.kimlik.domain.models import Kisi
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel
from apps.personel.domain.user_account import personel_user_account_meta, resolve_personel_user
from apps.sube.domain.models import Sube

User = get_user_model()


class PersonelUserAccountTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad="Test Kurum", kod="TST")
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad="Sube A", kod="A")
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad="Sube B", kod="B")
        self.kisi = Kisi.objects.create(
            kurum=self.kurum,
            ad="Ali",
            soyad="Veli",
            tc_kimlik_no="12345678901",
            telefon="5321112233",
        )
        self.user = User.objects.create_user(
            username="12345678901",
            password="12345678901",
            first_name="Ali",
            last_name="Veli",
        )
        self.personel_a = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            kisi=self.kisi,
            ad="Ali",
            soyad="Veli",
            tc_kimlik_no="12345678901",
            cep_telefon="05321112233",
            user=self.user,
        )
        self.personel_b = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            kisi=self.kisi,
            ad="Ali",
            soyad="Veli",
            cep_telefon="05321112233",
        )

    def test_resolve_links_orphan_user_by_tc(self):
        orphan = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad="Ayse",
            soyad="Yilmaz",
            tc_kimlik_no="98765432109",
        )
        orphan_user = User.objects.create_user(username="98765432109", password="x")
        resolved = resolve_personel_user(orphan, heal_link=True)
        self.assertEqual(resolved, orphan_user)
        orphan.refresh_from_db()
        self.assertEqual(orphan.user_id, orphan_user.id)

    def test_resolve_returns_linked_user(self):
        self.assertEqual(resolve_personel_user(self.personel_a), self.user)

    def test_sibling_record_shows_shared_account(self):
        """Şube B kaydında user FK yok ama aynı TC/kisi ile A'daki hesap görünür."""
        resolved = resolve_personel_user(self.personel_b)
        self.assertEqual(resolved, self.user)
        meta = personel_user_account_meta(self.personel_b)
        self.assertTrue(meta['has_user_account'])
        self.assertTrue(meta['user_account_shared'])
        self.assertEqual(meta['user_account_owner_sube_ad'], "Sube A")
        self.personel_b.refresh_from_db()
        self.assertIsNone(self.personel_b.user_id)
