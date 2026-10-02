"""Uyumsoft ayar ekranı: kayıt, şifre sızıntısı, kurum sınırı ve SOAP kimlik denemesi."""
import json
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.finans.domain.uyumsoft_ayar import UyumsoftAyar
from apps.finans.infrastructure.uyumsoft_client import (
    DEFAULT_WS_URL,
    UyumsoftError,
    _parse_whoami,
    _whoami_envelope,
    whoami,
)
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()

WHOAMI_OK = """<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <WhoAmIResponse xmlns="http://tempuri.org/">
      <WhoAmIResult IsSucceded="true" Message="">
        <Value>
          <User><Username>Ozgun_WebServis</Username></User>
          <Customer><Name>Özgün Sınav</Name><VkTckNo>6920374763</VkTckNo></Customer>
          <Services HasEInvoice="true" HasEarchive="true" HasEDespatch="false"/>
        </Value>
      </WhoAmIResult>
    </WhoAmIResponse>
  </s:Body>
</s:Envelope>
""".encode()

WHOAMI_FAULT = """<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <s:Fault>
      <faultcode>s:Client</faultcode>
      <faultstring xml:lang="tr-TR">Bu sisteme erişmek için gerekli yetkiniz yok, Kullanıcı: invalid-user, Ip: 1.2.3.4</faultstring>
    </s:Fault>
  </s:Body>
</s:Envelope>
""".encode()


def _assign_manage(user):
    role, _ = Role.objects.get_or_create(
        code='uyumsoft_ayar_test',
        defaults={'name': 'Uyumsoft Ayar Test', 'level': 100, 'is_system_role': True},
    )
    perm, _ = Permission.objects.get_or_create(
        code='finans.manage',
        defaults={'name': 'finans.manage', 'module': 'finans', 'permission_type': 'manage'},
    )
    RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class UyumsoftClientTests(TestCase):
    def test_envelope_escapes_password(self):
        xml = _whoami_envelope('user', 'a&b<c>')
        self.assertIn('a&amp;b&lt;c&gt;', xml)
        self.assertNotIn('a&b<c>', xml)

    def test_parse_whoami_success(self):
        summary = _parse_whoami(WHOAMI_OK, http_status=200)
        self.assertEqual(summary['unvan'], 'Özgün Sınav')
        self.assertEqual(summary['vkn'], '6920374763')
        self.assertTrue(summary['e_fatura'])
        self.assertTrue(summary['e_arsiv'])
        self.assertFalse(summary['e_irsaliye'])

    def test_parse_fault_hides_ip(self):
        with self.assertRaises(UyumsoftError) as ctx:
            _parse_whoami(WHOAMI_FAULT, http_status=500)
        self.assertIn('yetkiniz yok', str(ctx.exception))
        self.assertNotIn('1.2.3.4', str(ctx.exception))

    def test_rejects_foreign_host(self):
        with self.assertRaises(UyumsoftError):
            whoami('https://evil.example/Services/Integration', 'u', 'p')

    def test_live_bad_credentials_are_rejected(self):
        with self.assertRaises(UyumsoftError) as ctx:
            whoami(DEFAULT_WS_URL, 'invalid-user', 'invalid-pass', timeout=20)
        self.assertIn('yetkiniz yok', str(ctx.exception).lower())


class UyumsoftAyarApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Özgün', kod='UYM1')
        self.diger = Kurum.objects.create(ad='Diğer', kod='UYM2')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='UYM1')
        self.user = User.objects.create_user(username='uyumsoft-ayar', password='test')
        _assign_manage(self.user)
        Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            user=self.user,
            ad='Ayar',
            soyad='Yetkili',
            aktif_mi=True,
        )
        self.client.force_authenticate(user=self.user)
        self.payload = {
            'kurum_id': self.kurum.id,
            'web_servis_url': DEFAULT_WS_URL,
            'portal_url': 'https://edonusum.uyum.com.tr',
            'kullanici_adi': 'Firma_WebServis',
            'sifre': 'gizli-sifre',
            'vkn': '6920374763',
            'gonderici_birim': 'urn:mail:defaultgb@ornek.com',
            'posta_kutusu': 'urn:mail:defaultpk@ornek.com',
            'aktif': True,
        }

    def test_save_hides_password_and_keeps_it_on_blank_update(self):
        res = self.client.put(
            '/finans/api/uyumsoft-ayar/',
            data=json.dumps(self.payload),
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertNotIn('gizli-sifre', json.dumps(body))
        self.assertTrue(body['sifre_kayitli'])
        self.assertNotIn('sifre', body)
        self.assertNotIn('sifre_encrypted', body)

        updated = dict(self.payload)
        updated['sifre'] = ''
        updated['kullanici_adi'] = 'Firma_WebServis_2'
        res = self.client.put(
            '/finans/api/uyumsoft-ayar/',
            data=json.dumps(updated),
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['kullanici_adi'], 'Firma_WebServis_2')
        stored = UyumsoftAyar.objects.get(kurum=self.kurum)
        self.assertTrue(stored.sifre_encrypted)
        self.assertNotEqual(stored.sifre_encrypted, '')

    def test_other_kurum_is_forbidden(self):
        res = self.client.get(f'/finans/api/uyumsoft-ayar/?kurum_id={self.diger.id}')
        self.assertEqual(res.status_code, 403)

    def test_read_without_manage_is_forbidden(self):
        reader = User.objects.create_user(username='uyumsoft-okur', password='test')
        role, _ = Role.objects.get_or_create(
            code='uyumsoft_reader',
            defaults={'name': 'Okur', 'level': 10, 'is_system_role': True},
        )
        perm, _ = Permission.objects.get_or_create(
            code='finans.read',
            defaults={'name': 'finans.read', 'module': 'finans', 'permission_type': 'read'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
        UserRole.objects.update_or_create(user=reader, defaults={'role': role})
        self.client.force_authenticate(user=reader)
        res = self.client.get(f'/finans/api/uyumsoft-ayar/?kurum_id={self.kurum.id}')
        self.assertEqual(res.status_code, 403)

    def test_connection_uses_saved_password_and_stores_summary(self):
        self.client.put(
            '/finans/api/uyumsoft-ayar/',
            data=json.dumps(self.payload),
            content_type='application/json',
        )
        trial = dict(self.payload)
        trial['sifre'] = ''
        with patch('apps.finans.application.uyumsoft_ayar_service.whoami', return_value={
            'unvan': 'Özgün Sınav',
            'vkn': '6920374763',
            'kullanici': 'Firma_WebServis',
            'e_fatura': True,
            'e_arsiv': True,
            'e_irsaliye': False,
            'mesaj': '',
        }) as mocked:
            res = self.client.post(
                '/finans/api/uyumsoft-ayar/test/',
                data=json.dumps(trial),
                content_type='application/json',
            )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['basarili'])
        self.assertEqual(mocked.call_args.args[2], 'gizli-sifre')
        stored = UyumsoftAyar.objects.get(kurum=self.kurum)
        self.assertTrue(stored.son_test_basarili)
        self.assertEqual(stored.son_test_ozet['unvan'], 'Özgün Sınav')
        self.assertNotIn('gizli-sifre', stored.son_test_mesaji)

    def test_vkn_mismatch_is_a_warning(self):
        self.client.put(
            '/finans/api/uyumsoft-ayar/',
            data=json.dumps(self.payload),
            content_type='application/json',
        )
        with patch('apps.finans.application.uyumsoft_ayar_service.whoami', return_value={
            'unvan': 'Başka Firma',
            'vkn': '1111111111',
            'kullanici': 'Firma_WebServis',
            'e_fatura': True,
            'e_arsiv': False,
            'e_irsaliye': False,
            'mesaj': '',
        }):
            res = self.client.post(
                '/finans/api/uyumsoft-ayar/test/',
                data=json.dumps(self.payload),
                content_type='application/json',
            )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIn('1111111111', res.json()['uyari'])
