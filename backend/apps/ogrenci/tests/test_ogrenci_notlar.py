"""Öğrenci Notlar API — yetki, CRUD, soft-delete audit, sözleşme birleşimi."""
import json
from datetime import date

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.domain.enums import SozlesmeDurum
from apps.odeme_takip.domain.models import Sozlesme
from apps.ogrenci.domain.models import Ogrenci, OgrenciNot, OgrenciNotAuditLog, OgrenciNotKategori
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.roller.seed import ensure_default_roles
from apps.sube.domain.models import Sube

User = get_user_model()

NOTES_URL = '/ogrenciler/api/{}/notlar/'
NOTE_URL = '/ogrenciler/api/{}/notlar/{}/'
GECMIS_URL = '/ogrenciler/api/{}/notlar/{}/gecmis/'


class OgrenciNotlarAPITest(TestCase):
    def setUp(self):
        ensure_default_roles()
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Not Kurum', kod='NTK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='NTK-M')
        self.yil = EgitimYili.objects.create(
            baslangic_yil=2025,
            bitis_yil=2026,
            aktif_mi=True,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Yılmaz',
            aktif_mi=True,
        )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

        self.muhasebe_role = Role.objects.get(code='muhasebe')
        self.muhasebe = User.objects.create_user(
            username='not_muhasebe',
            password='testpass123',
            first_name='Muhasebe',
            last_name='User',
        )
        UserRole.objects.create(user=self.muhasebe, role=self.muhasebe_role)

        self.koc_role = Role.objects.get(code='koc')
        self.koc = User.objects.create_user(
            username='not_koc',
            password='testpass123',
            first_name='Koç',
            last_name='User',
        )
        UserRole.objects.create(user=self.koc, role=self.koc_role)

        # Write-only custom role (no notes, no manage)
        self.write_only_role = Role.objects.create(
            code='ogrenci_write_only',
            name='Write Only',
            level=90,
            is_system_role=False,
        )
        write_perm = Permission.objects.get(code='ogrenci.write')
        RolePermission.objects.create(role=self.write_only_role, permission=write_perm)
        self.write_only = User.objects.create_user(
            username='not_write_only',
            password='testpass123',
        )
        UserRole.objects.create(user=self.write_only, role=self.write_only_role)

    def _login(self, user):
        self.client.force_login(user)

    def test_muhasebe_role_has_notes_permission(self):
        perms = set(self.muhasebe_role.get_all_permissions().values_list('code', flat=True))
        self.assertIn('ogrenci.notes', perms)

    def test_coach_forbidden(self):
        self._login(self.koc)
        res = self.client.get(NOTES_URL.format(self.ogrenci.id), **self.headers)
        self.assertEqual(res.status_code, 403)

    def test_ogrenci_write_only_forbidden(self):
        self._login(self.write_only)
        res = self.client.get(NOTES_URL.format(self.ogrenci.id), **self.headers)
        self.assertEqual(res.status_code, 403)

    def test_create_list_update_delete_with_audit(self):
        self._login(self.muhasebe)
        create_res = self.client.post(
            NOTES_URL.format(self.ogrenci.id),
            data=json.dumps({
                'baslik': 'Ödeme Görüşmesi',
                'icerik': 'Veli ile konuşuldu.',
                'kategori': OgrenciNotKategori.FINANS,
                'not_zamani': '2026-08-07T11:20:00',
            }),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(create_res.status_code, 201, create_res.content)
        body = create_res.json()
        note_id = body['not']['id']
        self.assertEqual(body['not']['baslik'], 'Ödeme Görüşmesi')
        self.assertEqual(body['not']['source'], 'manual')
        self.assertTrue(body['not']['editable'])

        self.assertEqual(
            OgrenciNotAuditLog.objects.filter(
                note_id=note_id, action='created'
            ).count(),
            1,
        )

        list_res = self.client.get(NOTES_URL.format(self.ogrenci.id), **self.headers)
        self.assertEqual(list_res.status_code, 200)
        notes = list_res.json()['notlar']
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0]['id'], note_id)

        patch_res = self.client.patch(
            NOTE_URL.format(self.ogrenci.id, note_id),
            data=json.dumps({'baslik': 'Ödeme Planı Görüşmesi'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(patch_res.status_code, 200, patch_res.content)
        self.assertEqual(patch_res.json()['not']['baslik'], 'Ödeme Planı Görüşmesi')
        self.assertEqual(
            OgrenciNotAuditLog.objects.filter(note_id=note_id, action='updated').count(),
            1,
        )

        del_res = self.client.delete(
            NOTE_URL.format(self.ogrenci.id, note_id),
            **self.headers,
        )
        self.assertEqual(del_res.status_code, 200)
        note = OgrenciNot.objects.get(pk=note_id)
        self.assertTrue(note.is_deleted)
        deleted_audit = OgrenciNotAuditLog.objects.filter(
            note_id=note_id, action='deleted'
        ).first()
        self.assertIsNotNone(deleted_audit)
        self.assertIn('silindi', deleted_audit.description.lower())

        list_after = self.client.get(NOTES_URL.format(self.ogrenci.id), **self.headers)
        self.assertEqual(list_after.json()['notlar'], [])

        gecmis = self.client.get(
            GECMIS_URL.format(self.ogrenci.id, note_id),
            **self.headers,
        )
        self.assertEqual(gecmis.status_code, 200)
        actions = [g['action'] for g in gecmis.json()['gecmis']]
        self.assertEqual(actions, ['deleted', 'updated', 'created'])

    def test_contract_notes_merged_read_only(self):
        Sozlesme.objects.create(
            sozlesme_no='SZ-NOT-001',
            ogrenci=self.ogrenci,
            egitim_yili=self.yil,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=date(2025, 9, 1),
            bitis_tarihi=date(2026, 6, 30),
            durum=SozlesmeDurum.AKTIF,
            notlar_json=[
                {
                    'id': 'n1',
                    'text': 'Veli tarafından özel ödeme planı talep edilmiştir.',
                    'veli_ile_paylas': False,
                    'created_at': '2026-08-07T09:15:00',
                    'created_by_name': 'Tahsilat',
                    'tip': 'odeme_gorusmesi',
                }
            ],
        )

        self._login(self.muhasebe)
        # Manuel not da ekle
        self.client.post(
            NOTES_URL.format(self.ogrenci.id),
            data=json.dumps({
                'baslik': 'Manuel Finans',
                'icerik': 'Manuel içerik',
                'kategori': OgrenciNotKategori.FINANS,
                'not_zamani': '2026-08-08T14:30:00',
            }),
            content_type='application/json',
            **self.headers,
        )

        res = self.client.get(NOTES_URL.format(self.ogrenci.id), **self.headers)
        self.assertEqual(res.status_code, 200)
        notes = res.json()['notlar']
        self.assertEqual(len(notes), 2)
        sources = {n['source'] for n in notes}
        self.assertEqual(sources, {'manual', 'sozlesme'})

        contract = next(n for n in notes if n['source'] == 'sozlesme')
        self.assertFalse(contract['editable'])
        self.assertEqual(contract['kategori'], 'sozlesme')
        self.assertEqual(contract['baslik'], 'Ödeme görüşmesi')
        self.assertIn('özel ödeme planı', contract['icerik'])
        self.assertTrue(str(contract['id']).startswith('sozlesme-'))

        # Sözleşme kaynağına PATCH denemesi — int id değil, 404
        # Manuel silme sonrası sözleşme notu kalmalı
        filt = self.client.get(
            NOTES_URL.format(self.ogrenci.id) + '?kategori=sozlesme',
            **self.headers,
        )
        self.assertEqual(len(filt.json()['notlar']), 1)
        self.assertEqual(filt.json()['notlar'][0]['source'], 'sozlesme')

    def test_validation_requires_title_and_body(self):
        self._login(self.muhasebe)
        res = self.client.post(
            NOTES_URL.format(self.ogrenci.id),
            data=json.dumps({'baslik': '', 'icerik': '', 'kategori': 'genel'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)
