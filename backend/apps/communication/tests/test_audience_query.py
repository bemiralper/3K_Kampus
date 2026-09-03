"""Genel kitle sorgusu — senaryo 1–15 ve koç kapsamı."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.communication.application.audience_query import AudienceQueryService, empty_query
from apps.communication.application.campaign_service import AudienceResolver
from apps.communication.domain.models import SavedAudience
from apps.egitim_paketleri.models import EkHizmet
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import (
    Ogrenci,
    OgrenciEgitimPaketi,
    OgrenciEkHizmet,
    OgrenciKayit,
    OgrenciVeli,
)
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_bulk(user, code='admin_bulk'):
    role, _ = Role.objects.get_or_create(
        code=code,
        defaults={'name': code, 'level': 10, 'is_system_role': True},
    )
    for perm_code in ('communication.bulk', 'communication.read'):
        perm, _ = Permission.objects.get_or_create(
            code=perm_code,
            defaults={'name': perm_code, 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


def _query(person_types, groups=None, **manual):
    data = empty_query(person_types)
    if groups is not None:
        data['tree']['groups'] = groups
    data.update(manual)
    return data


def _group(*filters, join='and'):
    return {'join': join, 'filters': list(filters)}


def _f(field, value, op='in'):
    return {'field': field, 'op': op, 'value': value}


class AudienceQueryScenarioTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kitle Kurum', kod='KITLE')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KTL')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.seviye_11 = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='11. Sınıf', kod='11', sira=11,
        )
        self.seviye_12 = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='12. Sınıf', kod='12', sira=12,
        )
        self.sinif_11a = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            ad='11-A', kod='11A', sinif_seviyesi=self.seviye_11, aktif_mi=True,
        )
        self.sinif_11b = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            ad='11-B', kod='11B', sinif_seviyesi=self.seviye_11, aktif_mi=True,
        )
        self.sinif_12b = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            ad='12-B', kod='12B', sinif_seviyesi=self.seviye_12, aktif_mi=True,
        )

        self.s_11a = self._student('Ayşe', 'OnbirA', '05321110001', self.sinif_11a, kayit_turu='asil')
        self.s_11b = self._student('Berk', 'OnbirB', '05321110002', self.sinif_11b, kayit_turu='asil')
        self.s_12b = self._student('Cem', 'OnikiB', '05321110003', self.sinif_12b, kayit_turu='misafir')
        self.s_nophone = self._student('Duru', 'Telefonsuz', '', self.sinif_11a)

        self.v_11a = self._parent(self.s_11a, 'Anne', 'OnbirA', '05323330001')
        self.v_11b = self._parent(self.s_11b, 'Baba', 'OnbirB', '05323330002')
        self.v_12b = self._parent(self.s_12b, 'Anne', 'OnikiB', '05323330003')

        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.s_11a, paket_turu='grup_dersi', paket_id=101,
            paket_adi='YKS Grup', aktif_mi=True,
        )

        # Ek hizmetler — kütüphane (iki öğrenci) ve koçluk (bir öğrenci).
        self.hizmet_kutuphane = EkHizmet.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            ad='Kütüphane Tam Gün', kod='KTP1', hizmet_turu='kutuphane',
        )
        self.hizmet_kocluk = EkHizmet.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            ad='Birebir Koçluk', kod='KOC1', hizmet_turu='kocluk',
        )
        # 11-A: ayrı satın alma, 12-B: pakete dahil — ikisi de hizmeti "alıyor".
        OgrenciEkHizmet.objects.create(
            ogrenci=self.s_11a, ek_hizmet=self.hizmet_kutuphane,
            egitim_yili=self.year, aktif_mi=True, dahil_mi=False,
        )
        OgrenciEkHizmet.objects.create(
            ogrenci=self.s_12b, ek_hizmet=self.hizmet_kutuphane,
            egitim_yili=self.year, aktif_mi=True, dahil_mi=True,
        )
        # İptal edilmiş kayıt kitleye girmemeli.
        OgrenciEkHizmet.objects.create(
            ogrenci=self.s_11b, ek_hizmet=self.hizmet_kutuphane,
            egitim_yili=self.year, aktif_mi=False,
        )
        OgrenciEkHizmet.objects.create(
            ogrenci=self.s_11b, ek_hizmet=self.hizmet_kocluk,
            egitim_yili=self.year, aktif_mi=True,
        )

        self.ahmet = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ahmet', soyad='Hoca',
            cep_telefon='05327770001',
        )
        self.mehmet = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mehmet', soyad='Hoca',
            cep_telefon='05327770002',
        )
        self.sekreter = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Selin', soyad='Sekreter',
            cep_telefon='05327770003',
        )
        self.role_koc, _ = Role.objects.get_or_create(
            code='koc', defaults={'name': 'Koç', 'level': 50, 'is_system_role': True},
        )
        self.role_sek, _ = Role.objects.get_or_create(
            code='sekreterya', defaults={'name': 'Sekreterya', 'level': 40, 'is_system_role': True},
        )
        for personel, role in (
            (self.ahmet, self.role_koc),
            (self.mehmet, self.role_koc),
            (self.sekreter, self.role_sek),
        ):
            PersonelGorevlendirme.objects.create(
                personel=personel, egitim_yili=self.year, rol=role,
                gorev_sube=self.sube, kurum=self.kurum, aktif_mi=True,
            )

        self.coach_ahmet = CoachProfile.objects.create(teacher=self.ahmet, is_active=True)
        self.coach_mehmet = CoachProfile.objects.create(teacher=self.mehmet, is_active=True)
        CoachStudentAssignment.objects.create(
            coach=self.coach_ahmet, student=self.s_11a, start_date=date(2025, 9, 1),
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach_mehmet, student=self.s_11b, start_date=date(2025, 9, 1),
        )

        self.admin = User.objects.create_user(username='kitle_admin', password='pass')
        _assign_bulk(self.admin)
        self.ctx = {'context_sube_id': self.sube.id, 'context_egitim_yili_id': self.year.id}

    def _student(self, ad, soyad, telefon, sinif, kayit_turu='asil'):
        o = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad=ad, soyad=soyad,
            telefon=telefon, aktif_mi=True, kayit_turu=kayit_turu,
        )
        OgrenciKayit.objects.create(
            ogrenci=o, sinif=sinif, sinif_seviyesi=sinif.sinif_seviyesi,
            egitim_yili=self.year, kurum=self.kurum, sube=self.sube, aktif_mi=True,
        )
        return o

    def _parent(self, ogrenci, ad, soyad, telefon):
        return OgrenciVeli.objects.create(
            ogrenci=ogrenci, veli_turu='anne', ad=ad, soyad=soyad,
            telefon=telefon, sms_bildirimleri=['duyuru'],
        )

    def _resolve(self, query, user=None):
        return AudienceQueryService.resolve(
            self.kurum.id, query, user=user or self.admin, **self.ctx,
        )

    def _ids(self, result, kind):
        if kind == 'ogrenci':
            return {p.ogrenci_id for p in result.people if p.person_type == 'ogrenci'}
        if kind == 'veli':
            return {p.veli_id for p in result.people if p.person_type == 'veli'}
        return {p.personel_id for p in result.people if p.person_type == 'personel'}

    def test_scenario_1_all_parents(self):
        result = self._resolve(_query(['veli']))
        self.assertEqual(self._ids(result, 'veli'), {self.v_11a.id, self.v_11b.id, self.v_12b.id})
        self.assertEqual(result.ogrenci_count, 0)

    def test_scenario_2_grade_11_parents(self):
        result = self._resolve(_query(['veli'], [_group(_f('sinif_seviyesi_id', self.seviye_11.id))]))
        self.assertEqual(self._ids(result, 'veli'), {self.v_11a.id, self.v_11b.id})

    def test_scenario_3_11a_and_11b_parents(self):
        result = self._resolve(_query(['veli'], [_group(_f('sinif_id', [self.sinif_11a.id, self.sinif_11b.id]))]))
        self.assertEqual(self._ids(result, 'veli'), {self.v_11a.id, self.v_11b.id})

    def test_scenario_4_ahmet_students(self):
        result = self._resolve(_query(['ogrenci'], [_group(_f('coach_id', self.coach_ahmet.id))]))
        self.assertEqual(self._ids(result, 'ogrenci'), {self.s_11a.id})

    def test_scenario_5_ahmet_parents(self):
        result = self._resolve(_query(['veli'], [_group(_f('coach_id', self.coach_ahmet.id))]))
        self.assertEqual(self._ids(result, 'veli'), {self.v_11a.id})

    def test_scenario_6_ahmet_or_mehmet_students(self):
        result = self._resolve(_query(['ogrenci'], [_group(
            _f('coach_id', [self.coach_ahmet.id, self.coach_mehmet.id]),
        )]))
        self.assertEqual(self._ids(result, 'ogrenci'), {self.s_11a.id, self.s_11b.id})

    def test_scenario_7_11a_or_12b_students(self):
        result = self._resolve(_query(['ogrenci'], [
            _group(_f('sinif_id', self.sinif_11a.id)),
            _group(_f('sinif_id', self.sinif_12b.id)),
        ]))
        self.assertEqual(self._ids(result, 'ogrenci'), {self.s_11a.id, self.s_nophone.id, self.s_12b.id})

    def test_scenario_8_package_students(self):
        result = self._resolve(_query(['ogrenci'], [_group(_f('paket', 'grup_dersi:101'))]))
        self.assertEqual(self._ids(result, 'ogrenci'), {self.s_11a.id})

    def test_ek_hizmet_turu_kutuphane_students(self):
        """Kütüphane hizmeti alan öğrenciler — pakete dahil olanlar da sayılır."""
        result = self._resolve(_query(['ogrenci'], [_group(_f('ek_hizmet_turu', 'kutuphane'))]))
        self.assertEqual(self._ids(result, 'ogrenci'), {self.s_11a.id, self.s_12b.id})

    def test_ek_hizmet_turu_excludes_cancelled(self):
        """aktif_mi=False kaydı olan öğrenci kütüphane kitlesine girmez."""
        result = self._resolve(_query(['ogrenci'], [_group(_f('ek_hizmet_turu', 'kutuphane'))]))
        self.assertNotIn(self.s_11b.id, self._ids(result, 'ogrenci'))

    def test_ek_hizmet_id_specific_service(self):
        result = self._resolve(
            _query(['ogrenci'], [_group(_f('ek_hizmet_id', self.hizmet_kocluk.id))]),
        )
        self.assertEqual(self._ids(result, 'ogrenci'), {self.s_11b.id})

    def test_ek_hizmet_turu_parents(self):
        """Kütüphane öğrencilerinin velilerine gönderim."""
        result = self._resolve(_query(['veli'], [_group(_f('ek_hizmet_turu', 'kutuphane'))]))
        self.assertEqual(self._ids(result, 'veli'), {self.v_11a.id, self.v_12b.id})

    def test_ek_hizmet_combines_with_other_filters(self):
        """Ek hizmet filtresi diğer filtrelerle AND'lenebilmeli."""
        result = self._resolve(_query(['ogrenci'], [_group(
            _f('ek_hizmet_turu', 'kutuphane'),
            _f('sinif_id', self.sinif_11a.id),
        )]))
        self.assertEqual(self._ids(result, 'ogrenci'), {self.s_11a.id})

    def test_catalog_exposes_ek_hizmet_fields(self):
        from apps.communication.application.audience_catalog import build_audience_catalog

        catalog = build_audience_catalog(
            self.kurum.id,
            user=self.admin,
            sube_id=self.sube.id,
            egitim_yili_id=self.year.id,
        )
        fields = {f['key']: f for f in catalog['fields']}
        self.assertIn('ek_hizmet_id', fields)
        self.assertIn('ek_hizmet_turu', fields)
        self.assertIn(
            self.hizmet_kutuphane.id,
            {o['value'] for o in fields['ek_hizmet_id']['options']},
        )
        self.assertIn(
            'kutuphane',
            {o['value'] for o in fields['ek_hizmet_turu']['options']},
        )
        quick = {q['key']: q for q in catalog['quick_starts']}
        self.assertEqual(quick['kutuphane_ogrenciler']['add_field'], 'ek_hizmet_turu')
        self.assertEqual(quick['kutuphane_ogrenciler']['add_value'], ['kutuphane'])

    def test_scenario_9_kayit_turu(self):
        result = self._resolve(_query(['ogrenci'], [_group(_f('kayit_turu', 'misafir'))]))
        self.assertEqual(self._ids(result, 'ogrenci'), {self.s_12b.id})

    def test_scenario_10_kurum_sube_sinif(self):
        result = self._resolve(_query(['ogrenci'], [_group(
            _f('sube_id', self.sube.id),
            _f('sinif_id', self.sinif_11a.id),
        )]))
        self.assertEqual(self._ids(result, 'ogrenci'), {self.s_11a.id, self.s_nophone.id})

    def test_scenario_11_staff_role(self):
        result = self._resolve(_query(['personel'], [_group(_f('personel_rol_id', self.role_sek.id))]))
        self.assertEqual(self._ids(result, 'personel'), {self.sekreter.id})

    def test_scenario_12_manual_exclude(self):
        result = self._resolve(_query(
            ['veli'],
            [_group(_f('sinif_seviyesi_id', self.seviye_11.id))],
            excluded_veli_ids=[self.v_11b.id],
        ))
        self.assertEqual(self._ids(result, 'veli'), {self.v_11a.id})

    def test_scenario_13_manual_include(self):
        result = self._resolve(_query(
            ['ogrenci'],
            [_group(_f('sinif_id', self.sinif_11b.id))],
            included_ogrenci_ids=[self.s_12b.id],
        ))
        self.assertEqual(self._ids(result, 'ogrenci'), {self.s_11b.id, self.s_12b.id})

    def test_include_only_mixed_people_without_type_cards(self):
        result = self._resolve(_query(
            [],
            included_ogrenci_ids=[self.s_11a.id],
            included_veli_ids=[self.v_11b.id],
            included_personel_ids=[self.sekreter.id],
        ))
        self.assertEqual(self._ids(result, 'ogrenci'), {self.s_11a.id})
        self.assertEqual(self._ids(result, 'veli'), {self.v_11b.id})
        self.assertEqual(self._ids(result, 'personel'), {self.sekreter.id})
        self.assertEqual(result.total, 3)

    def test_scenario_14_saved_audience_is_dynamic(self):
        query = _query(['veli'], [_group(_f('sinif_id', self.sinif_11a.id))])
        saved = SavedAudience.objects.create(
            kurum=self.kurum, created_by=self.admin, name='11-A Velileri', query_json=query,
        )
        first = self._resolve(saved.query_json)
        self.assertEqual(self._ids(first, 'veli'), {self.v_11a.id})
        extra = self._student('Ece', 'Yeni', '05321110009', self.sinif_11a)
        extra_v = self._parent(extra, 'Veli', 'Yeni', '05323330009')
        second = self._resolve(saved.query_json)
        self.assertEqual(self._ids(second, 'veli'), {self.v_11a.id, extra_v.id})

    def test_scenario_15_mixed_or_parents(self):
        result = self._resolve(_query(['veli'], [
            _group(_f('sinif_id', self.sinif_11a.id)),
            _group(_f('sinif_id', self.sinif_11b.id)),
            _group(_f('coach_id', self.coach_ahmet.id)),
        ]))
        self.assertEqual(self._ids(result, 'veli'), {self.v_11a.id, self.v_11b.id})

    def test_unsuitable_phone_counted_not_deliverable(self):
        result = self._resolve(_query(['ogrenci'], [_group(_f('sinif_id', self.sinif_11a.id))]))
        self.assertEqual(result.ogrenci_count, 2)
        self.assertEqual(result.deliverable_count, 1)
        self.assertEqual(result.unsuitable_count, 1)

    def test_resolver_delegates_query_to_preview(self):
        preview = AudienceResolver.resolve(
            self.kurum.id,
            _query(['veli'], [_group(_f('sinif_id', self.sinif_11a.id))], sube_id=self.sube.id),
            user=self.admin,
        )
        self.assertEqual(preview.veli_count, 1)
        self.assertEqual(preview.total_recipients, 1)

    def test_exclude_survives_filter_change_in_same_query(self):
        query = _query(
            ['ogrenci'],
            [_group(_f('sinif_seviyesi_id', self.seviye_11.id))],
            excluded_ogrenci_ids=[self.s_11a.id],
        )
        result = self._resolve(query)
        self.assertNotIn(self.s_11a.id, self._ids(result, 'ogrenci'))
        self.assertIn(self.s_11b.id, self._ids(result, 'ogrenci'))


class AudienceQueryScopeAndApiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kapsam Kurum', kod='KPSM')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KPS')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            ad='10-A', kod='10A', aktif_mi=True,
        )
        self.mine = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Benim', soyad='Ogr',
            telefon='05325550001', aktif_mi=True,
        )
        self.other = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Baska', soyad='Ogr',
            telefon='05325550002', aktif_mi=True,
        )
        for o in (self.mine, self.other):
            OgrenciKayit.objects.create(
                ogrenci=o, sinif=self.sinif, egitim_yili=self.year,
                kurum=self.kurum, sube=self.sube, aktif_mi=True,
            )
        self.teacher = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Koç', soyad='User',
        )
        self.coach_profile = CoachProfile.objects.create(teacher=self.teacher, is_active=True)
        CoachStudentAssignment.objects.create(
            coach=self.coach_profile, student=self.mine, start_date=date(2025, 9, 1),
        )
        self.coach_user = User.objects.create_user(username='kitle_koc', password='pass')
        self.teacher.user = self.coach_user
        self.teacher.save(update_fields=['user'])
        role, _ = Role.objects.get_or_create(
            code='koc', defaults={'name': 'Koç', 'level': 100, 'is_system_role': True},
        )
        perm, _ = Permission.objects.get_or_create(
            code='communication.write',
            defaults={'name': 'communication.write', 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
        UserRole.objects.update_or_create(user=self.coach_user, defaults={'role': role})

        self.admin = User.objects.create_user(username='kitle_api_admin', password='pass')
        _assign_bulk(self.admin)
        self.client = APIClient()

    def test_coach_cannot_see_other_students(self):
        result = AudienceQueryService.resolve(
            self.kurum.id,
            _query(['ogrenci']),
            user=self.coach_user,
            context_sube_id=self.sube.id,
        )
        ids = {p.ogrenci_id for p in result.people if p.person_type == 'ogrenci'}
        self.assertEqual(ids, {self.mine.id})

    def test_coach_cannot_include_outside_scope(self):
        result = AudienceQueryService.resolve(
            self.kurum.id,
            _query(['ogrenci'], included_ogrenci_ids=[self.other.id]),
            user=self.coach_user,
            context_sube_id=self.sube.id,
        )
        ids = {p.ogrenci_id for p in result.people if p.person_type == 'ogrenci'}
        self.assertNotIn(self.other.id, ids)

    def test_preview_api(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            '/api/communication/campaigns/audience/preview/',
            {'query': _query(['ogrenci'])},
            format='json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.data['deliverable_count'], 2)

    def test_catalog_api(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            '/api/communication/campaigns/audience/catalog/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(res.status_code, 200)
        keys = {f['key'] for f in res.data['fields']}
        self.assertIn('sinif_id', keys)
        self.assertIn('coach_id', keys)
        self.assertNotIn('rehber_id', keys)

    def test_saved_audience_crud(self):
        self.client.force_authenticate(user=self.admin)
        create = self.client.post(
            '/api/communication/campaigns/saved-audiences/',
            {'name': 'Tüm öğrenciler', 'query': _query(['ogrenci'])},
            format='json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(create.status_code, 201)
        audience_id = create.data['id']
        listing = self.client.get(
            '/api/communication/campaigns/saved-audiences/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(listing.data['total'], 1)
        delete = self.client.delete(
            f'/api/communication/campaigns/saved-audiences/{audience_id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(delete.status_code, 204)
