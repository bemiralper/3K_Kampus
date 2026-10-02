"""Tahsilat faturası: kalem payı, önizleme ve taslak gönderimi."""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.communication.application.token_crypto import encrypt_access_token
from apps.egitim_yili.domain.models import EgitimYili
from apps.egitim_paketleri.models import Deneme, EkHizmet, GrupDersi
from apps.finans.application.fatura_hesap import dagit_bilesenler, dagit_kalemler, toplamlar
from apps.finans.domain.e_belge import EBelge, EBelgeDurum
from apps.finans.domain.uyumsoft_ayar import UyumsoftAyar
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.domain.enums import KalemTuru, SozlesmeDurum, TahsilatDurum, TahsilatTuru
from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi, Tahsilat
from apps.ogrenci.domain.models import Ogrenci, OgrenciAdres, OgrenciVeli
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


class FaturaHesapTests(TestCase):
    def test_taksit_payi_kalemlere_bolunur_ve_toplam_tahsilata_esitlenir(self):
        satirlar = dagit_kalemler([
            {'ad': 'YKS Paket', 'net': 80000, 'kdv_orani': 10},
            {'ad': 'Deneme', 'net': 20000, 'kdv_orani': 10},
        ], 25000)
        totals = toplamlar(satirlar)
        self.assertEqual(totals['odenecek'], Decimal('25000.00'))
        self.assertEqual(satirlar[0]['brut'], Decimal('20000.00'))
        self.assertEqual(satirlar[1]['brut'], Decimal('5000.00'))
        self.assertEqual(satirlar[0]['kdv'], Decimal('1818.18'))
        self.assertEqual(satirlar[0]['matrah'], Decimal('18181.82'))

    def test_farkli_kdv_oranlari_ayri_kalir(self):
        satirlar = dagit_kalemler([
            {'ad': 'Paket', 'net': 100, 'kdv_orani': 10},
            {'ad': 'Yayın', 'net': 100, 'kdv_orani': 20},
        ], 100)
        self.assertEqual([line['kdv_orani'] for line in satirlar], [10, 20])
        self.assertEqual(toplamlar(satirlar)['odenecek'], Decimal('100.00'))

    def test_katalog_agirligi_kurusu_son_satirda_dengeler(self):
        satirlar = dagit_bilesenler([
            {'ad': 'Eşit Ağırlık', 'katalog': 80000, 'kdv_orani': 10},
            {'ad': 'Koçluk', 'katalog': 60000, 'kdv_orani': 10},
            {'ad': 'Kütüphane', 'katalog': 60000, 'kdv_orani': 10},
            {'ad': 'Deneme', 'katalog': 30000, 'kdv_orani': 10},
        ], 23000)
        by_name = {row['ad']: row['brut'] for row in satirlar}
        self.assertEqual(by_name['Eşit Ağırlık'], Decimal('8000.00'))
        self.assertEqual(by_name['Koçluk'], Decimal('6000.00'))
        self.assertEqual(by_name['Kütüphane'], Decimal('6000.00'))
        self.assertEqual(by_name['Deneme'], Decimal('3000.00'))
        self.assertEqual(toplamlar(satirlar)['odenecek'], Decimal('23000.00'))


class TahsilatFaturaApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(
            ad='Özgün', kod='EBLG', adres='Lalapaşa Mah. Yakutiye / Erzurum', vergi_dairesi='Yakutiye',
        )
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='EBLG-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Yılmaz',
            tc_kimlik_no='12345678901', aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci, veli_turu='anne', ad='Fatma', soyad='Yılmaz',
            tc_kimlik_no='10987654321',
        )
        OgrenciAdres.objects.create(
            ogrenci=self.ogrenci, adres='Atatürk Cad. No 1', il='Erzurum', ilce='Yakutiye', varsayilan=True,
        )
        today = timezone.localdate()
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-EBLG-001',
            ogrenci=self.ogrenci,
            veli=self.veli,
            egitim_yili=self.yil,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=today,
            bitis_tarihi=today + timedelta(days=300),
            net_tutar=100000,
            durum=SozlesmeDurum.AKTIF,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.PAKET, kalem_id=1,
            kalem_adi='YKS Paket', brut_tutar=80000, net_tutar=80000, kdv_orani=10,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.DENEME, kalem_id=2,
            kalem_adi='Deneme', brut_tutar=20000, net_tutar=20000, kdv_orani=10,
        )
        self.tahsilat = Tahsilat.objects.create(
            sozlesme=self.sozlesme, tutar=25000, tahsilat_tarihi=today, durum=TahsilatDurum.AKTIF,
        )
        UyumsoftAyar.objects.create(
            kurum=self.kurum,
            kullanici_adi='web',
            sifre_encrypted=encrypt_access_token('gizli'),
            vkn='6920374763',
            gonderici_birim='urn:mail:defaultgb@ornek.com',
            posta_kutusu='urn:mail:defaultpk@ornek.com',
        )
        self.user = User.objects.create_user(username='ebelge', password='test')
        role, _ = Role.objects.get_or_create(
            code='ebelge_test',
            defaults={'name': 'EBelge', 'level': 100, 'is_system_role': True},
        )
        perm, _ = Permission.objects.get_or_create(
            code='finans.manage',
            defaults={'name': 'finans.manage', 'module': 'finans', 'permission_type': 'manage'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
        UserRole.objects.update_or_create(user=self.user, defaults={'role': role})
        self.client.force_authenticate(user=self.user)
        self.headers = {'HTTP_X_SUBE_ID': str(self.sube.id), 'HTTP_X_KURUM_ID': str(self.kurum.id)}

    def test_onizleme_e_arsiv_ve_paylastirilmis_satirlar(self):
        with patch('apps.finans.application.e_belge_service.is_e_invoice_user', return_value=False):
            res = self.client.get(f'/odeme-takip/api/tahsilatlar/{self.tahsilat.id}/fatura/', **self.headers)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body['belge_tipi'], 'earsiv')
        self.assertEqual(body['odenecek'], '25000.00')
        by_name = {row['ad']: row['brut'] for row in body['satirlar']}
        self.assertEqual(by_name['YKS Paket'], '20000.00')
        self.assertEqual(by_name['Deneme'], '5000.00')
        self.assertTrue(body['gonderilebilir'])
        self.assertEqual(body['alici']['vkn'], '10987654321')

    def test_gonder_taslak_olarak_kaydeder_ve_tekrar_gondermez(self):
        with patch('apps.finans.application.e_belge_service.is_e_invoice_user', return_value=False), \
             patch('apps.finans.application.e_belge_service.save_as_draft', return_value={'number': '', 'id': '1', 'scenario': 'eArchive'}) as mocked:
            res = self.client.post(
                f'/odeme-takip/api/tahsilatlar/{self.tahsilat.id}/fatura/gonder/',
                data={'adres': 'Atatürk Cad. No 1', 'il': 'Erzurum', 'ilce': 'Yakutiye'},
                format='json',
                **self.headers,
            )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['mevcut']['durum'], 'uyumsoft_taslak')
        self.assertEqual(mocked.call_count, 1)
        self.assertEqual(mocked.call_args.kwargs['scenario'], 'eArchive')
        self.assertIn('18181.82', mocked.call_args.kwargs['invoice_xml'])
        self.assertIn('25000.00', mocked.call_args.kwargs['invoice_xml'])
        belge = EBelge.objects.get(tahsilat=self.tahsilat)
        self.assertEqual(belge.durum, EBelgeDurum.UYUMSOFT_TASLAK)

        with patch('apps.finans.application.e_belge_service.save_as_draft') as again:
            res = self.client.post(
                f'/odeme-takip/api/tahsilatlar/{self.tahsilat.id}/fatura/gonder/',
                data={},
                format='json',
                **self.headers,
            )
        self.assertEqual(res.status_code, 200, res.content)
        again.assert_not_called()

    def test_dahil_hizmetler_ayri_kalem_olur(self):
        paket = GrupDersi.objects.create(
            ad='Eşit Ağırlık Grup Matematik Ağırlıklı', kod='EA-MAT',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
            brut_fiyat=230000, kdv_orani=10,
        )
        kocluk = EkHizmet.objects.create(
            ad='Koçluk', kod='KOC', hizmet_turu='kocluk',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
            brut_fiyat=60000, kdv_orani=10,
        )
        kutuphane = EkHizmet.objects.create(
            ad='Kütüphane', kod='KUT', hizmet_turu='kutuphane',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
            brut_fiyat=60000, kdv_orani=10,
        )
        deneme = Deneme.objects.create(
            ad='TYT - AYT Deneme Paketi', kod='DEN',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
            brut_fiyat=30000, kdv_orani=10,
        )
        paket.dahil_ek_hizmetler.set([kocluk, kutuphane])
        paket.dahil_denemeler.set([deneme])
        self.sozlesme.paket_turu = 'grup_dersi'
        self.sozlesme.paket_id = paket.id
        self.sozlesme.paket_adi = paket.ad
        self.sozlesme.save(update_fields=['paket_turu', 'paket_id', 'paket_adi'])
        SozlesmeKalemi.objects.filter(sozlesme=self.sozlesme).delete()
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.PAKET, kalem_id=paket.id,
            kalem_adi=paket.ad, brut_tutar=175000, net_tutar=175000, kdv_orani=10,
        )
        self.tahsilat.tutar = 23000
        self.tahsilat.save(update_fields=['tutar'])

        with patch('apps.finans.application.e_belge_service.is_e_invoice_user', return_value=False):
            res = self.client.get(f'/odeme-takip/api/tahsilatlar/{self.tahsilat.id}/fatura/', **self.headers)
        self.assertEqual(res.status_code, 200, res.content)
        by_name = {row['ad']: row['brut'] for row in res.json()['satirlar']}
        self.assertEqual(by_name[paket.ad], '8000.00')
        self.assertEqual(by_name['Koçluk'], '6000.00')
        self.assertEqual(by_name['Kütüphane'], '6000.00')
        self.assertEqual(by_name['TYT - AYT Deneme Paketi'], '3000.00')

    def test_gonderilen_kalem_tutarlari_kullanilir(self):
        bad = self.client.post(
            f'/odeme-takip/api/tahsilatlar/{self.tahsilat.id}/fatura/gonder/',
            data={'satirlar': [{'ad': 'Eğitim', 'kdv_orani': 10, 'brut': '1.00'}]},
            format='json',
            **self.headers,
        )
        self.assertEqual(bad.status_code, 400, bad.content)

        with patch('apps.finans.application.e_belge_service.is_e_invoice_user', return_value=False), \
             patch('apps.finans.application.e_belge_service.save_as_draft', return_value={'number': '', 'id': '1', 'scenario': 'eArchive'}) as mocked:
            res = self.client.post(
                f'/odeme-takip/api/tahsilatlar/{self.tahsilat.id}/fatura/gonder/',
                data={
                    'adres': 'Atatürk Cad. No 1', 'il': 'Erzurum', 'ilce': 'Yakutiye',
                    'satirlar': [
                        {'ad': 'Eğitim', 'kdv_orani': 10, 'brut': '15000.00'},
                        {'ad': 'Koçluk', 'kdv_orani': 10, 'brut': '10000.00'},
                    ],
                },
                format='json',
                **self.headers,
            )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIn('13636.36', mocked.call_args.kwargs['invoice_xml'])

    def test_iptal_gonderimi_kaldirir(self):
        with patch('apps.finans.application.e_belge_service.is_e_invoice_user', return_value=False), \
             patch('apps.finans.application.e_belge_service.save_as_draft', return_value={'number': 'A1', 'id': '1', 'scenario': 'eArchive'}):
            sent = self.client.post(
                f'/odeme-takip/api/tahsilatlar/{self.tahsilat.id}/fatura/gonder/',
                data={'adres': 'Atatürk Cad. No 1', 'il': 'Erzurum', 'ilce': 'Yakutiye'},
                format='json',
                **self.headers,
            )
        self.assertEqual(sent.status_code, 200, sent.content)

        with patch('apps.finans.application.e_belge_service.is_e_invoice_user', return_value=False), \
             patch('apps.finans.application.e_belge_service.cancel_draft') as mocked:
            res = self.client.post(
                f'/odeme-takip/api/tahsilatlar/{self.tahsilat.id}/fatura/iptal/',
                data={},
                format='json',
                **self.headers,
            )
        self.assertEqual(res.status_code, 200, res.content)
        mocked.assert_called_once()
        self.assertFalse(EBelge.objects.filter(tahsilat=self.tahsilat).exists())
        self.assertTrue(res.json()['gonderilebilir'])
        self.assertIsNone(res.json()['mevcut'])

    def test_iade_faturalanmaz(self):
        self.tahsilat.tahsilat_turu = TahsilatTuru.IADE
        self.tahsilat.save(update_fields=['tahsilat_turu'])
        res = self.client.get(f'/odeme-takip/api/tahsilatlar/{self.tahsilat.id}/fatura/', **self.headers)
        self.assertEqual(res.status_code, 400)
