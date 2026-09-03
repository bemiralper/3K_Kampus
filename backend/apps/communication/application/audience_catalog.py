"""Kitle oluşturucu — filtre seçenekleri kataloğu."""
from __future__ import annotations

from typing import Any

from apps.coaching.services.coach_access import scoped_student_ids
from apps.communication.application.audience_query import ALL_PERSON_TYPES
from shared.permissions import user_has_any_permission


STUDENT_TYPES = ['ogrenci', 'veli']
STAFF_TYPES = ['personel']


def build_audience_catalog(
    kurum_id: int,
    *,
    user=None,
    sube_id: int | None = None,
    egitim_yili_id: int | None = None,
    person_types: list[str] | None = None,
) -> dict[str, Any]:
    types = [t for t in (person_types or list(ALL_PERSON_TYPES)) if t in ALL_PERSON_TYPES]
    allowed = _allowed_student_ids(user)
    coach_scoped = allowed is not None

    fields = []
    if set(types) & {'ogrenci', 'veli'}:
        fields.extend(_education_fields(kurum_id, sube_id, egitim_yili_id, allowed))
        fields.extend(_coaching_fields(kurum_id, sube_id, allowed))
    if 'personel' in types and not coach_scoped:
        fields.extend(_staff_fields(kurum_id, sube_id, egitim_yili_id))

    return {
        'person_types': [
            {'key': 'ogrenci', 'label': 'Öğrenci'},
            {'key': 'veli', 'label': 'Veli'},
            *([] if coach_scoped else [{'key': 'personel', 'label': 'Personel'}]),
        ],
        'fields': fields,
        'quick_starts': _quick_starts(coach_scoped),
        'coach_scoped': coach_scoped,
    }


def _allowed_student_ids(user):
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    if user_has_any_permission(user, 'communication.manage'):
        return None
    from apps.coaching.services.coach_access import get_coach_profile, is_resource_admin

    if is_resource_admin(user):
        return None
    if get_coach_profile(user) is not None:
        return scoped_student_ids(user)
    if user_has_any_permission(user, 'communication.bulk'):
        return None
    return scoped_student_ids(user)


def _opt(value, label) -> dict[str, Any]:
    return {'value': value, 'label': label}


def _field(
    key: str,
    label: str,
    category: str,
    person_types: list[str],
    options: list[dict],
    *,
    input_type: str = 'multi',
) -> dict[str, Any]:
    return {
        'key': key,
        'label': label,
        'category': category,
        'category_label': {
            'egitim': 'Eğitim',
            'kocluk': 'Koçluk',
            'personel': 'Personel',
        }.get(category, category),
        'person_types': person_types,
        'input': input_type,
        'options': options,
    }


def _education_fields(kurum_id, sube_id, egitim_yili_id, allowed) -> list[dict]:
    from apps.egitim_paketleri.models import EkHizmet
    from apps.egitim_tanimlari.models import SinifSeviyesi
    from apps.egitim_yili.domain.models import EgitimYili
    from apps.ogrenci.domain.models import (
        Ogrenci,
        OgrenciEgitimPaketi,
        OgrenciEkHizmet,
        OgrenciKayit,
    )
    from apps.sinif.domain.models import Sinif
    from apps.sube.domain.models import Sube

    sube_qs = Sube.objects.filter(kurum_id=kurum_id, aktif_mi=True).order_by('ad')
    year_qs = EgitimYili.objects.filter(aktif_mi=True).order_by('-baslangic_yil')
    seviye_qs = SinifSeviyesi.objects.filter(kurum_id=kurum_id, aktif_mi=True)
    if sube_id:
        seviye_qs = seviye_qs.filter(sube_id=sube_id)
    seviye_qs = seviye_qs.order_by('sira', 'ad')

    sinif_qs = Sinif.objects.filter(kurum_id=kurum_id, aktif_mi=True)
    if sube_id:
        sinif_qs = sinif_qs.filter(sube_id=sube_id)
    if egitim_yili_id:
        sinif_qs = sinif_qs.filter(egitim_yili_id=egitim_yili_id)
    if allowed is not None:
        sinif_ids = OgrenciKayit.objects.filter(
            kurum_id=kurum_id,
            ogrenci_id__in=allowed,
            aktif_mi=True,
        ).values_list('sinif_id', flat=True)
        sinif_qs = sinif_qs.filter(id__in=sinif_ids)
    sinif_qs = sinif_qs.order_by('ad')

    packet_qs = OgrenciEgitimPaketi.objects.filter(
        ogrenci__kurum_id=kurum_id,
        aktif_mi=True,
    )
    if allowed is not None:
        packet_qs = packet_qs.filter(ogrenci_id__in=allowed)
    packets = []
    seen = set()
    for ep in packet_qs.exclude(paket_adi='').values('paket_turu', 'paket_id', 'paket_adi'):
        key = (ep['paket_turu'], ep['paket_id'])
        if key in seen:
            continue
        seen.add(key)
        packets.append(_opt(
            f"{ep['paket_turu']}:{ep['paket_id']}",
            ep['paket_adi'],
        ))
    packets.sort(key=lambda x: x['label'])

    # Ek hizmetler (kütüphane, koçluk …) — yalnızca en az bir aktif öğrenci
    # kaydı olanlar listelenir, boş seçenek gösterilmesin.
    hizmet_kayit_qs = OgrenciEkHizmet.objects.filter(
        aktif_mi=True,
        ogrenci__kurum_id=kurum_id,
    )
    if allowed is not None:
        hizmet_kayit_qs = hizmet_kayit_qs.filter(ogrenci_id__in=allowed)
    hizmet_ids = set(hizmet_kayit_qs.values_list('ek_hizmet_id', flat=True))

    ek_hizmet_opts = []
    turler_seen = set()
    if hizmet_ids:
        hizmet_qs = EkHizmet.objects.filter(id__in=hizmet_ids).order_by('hizmet_turu', 'ad')
        for h in hizmet_qs:
            ek_hizmet_opts.append(_opt(h.id, f'{h.get_hizmet_turu_display()} — {h.ad}'))
            turler_seen.add(h.hizmet_turu)
    ek_hizmet_turu_opts = [
        _opt(code, label)
        for code, label in EkHizmet.HIZMET_TURU_CHOICES
        if code in turler_seen
    ]

    kayit_opts = [_opt(code, label) for code, label in Ogrenci.KAYIT_TURU_CHOICES]
    giris_opts = [_opt(code, label) for code, label in OgrenciKayit.GIRIS_TURU_CHOICES]

    return [
        _field('sube_id', 'Şube', 'egitim', STUDENT_TYPES, [
            _opt(s.id, s.ad) for s in sube_qs
        ]),
        _field('egitim_yili_id', 'Eğitim yılı', 'egitim', STUDENT_TYPES, [
            _opt(y.id, getattr(y, 'yil_str', None) or f'{y.baslangic_yil}-{y.bitis_yil}')
            for y in year_qs
        ]),
        _field('sinif_seviyesi_id', 'Sınıf', 'egitim', STUDENT_TYPES, [
            _opt(s.id, s.ad) for s in seviye_qs
        ]),
        _field('sinif_id', 'Sınıf şubesi', 'egitim', STUDENT_TYPES, [
            _opt(s.id, s.ad) for s in sinif_qs
        ]),
        _field('paket', 'Eğitim paketi', 'egitim', STUDENT_TYPES, packets),
        _field('ek_hizmet_turu', 'Ek hizmet türü', 'egitim', STUDENT_TYPES, ek_hizmet_turu_opts),
        _field('ek_hizmet_id', 'Ek hizmet', 'egitim', STUDENT_TYPES, ek_hizmet_opts),
        _field('kayit_turu', 'Kayıt türü', 'egitim', STUDENT_TYPES, kayit_opts),
        _field('giris_turu', 'Giriş türü', 'egitim', STUDENT_TYPES, giris_opts),
        _field('ogrenci_durum', 'Öğrenci durumu', 'egitim', STUDENT_TYPES, [
            _opt('aktif', 'Aktif'),
            _opt('pasif', 'Pasif'),
        ]),
        _field('cinsiyet', 'Cinsiyet', 'egitim', STUDENT_TYPES, [
            _opt('E', 'Erkek'),
            _opt('K', 'Kadın'),
        ]),
    ]


def _coaching_fields(kurum_id, sube_id, allowed) -> list[dict]:
    from django.db.models import Q

    from apps.coaching.models import CoachProfile, CoachStudentAssignment
    from apps.personel.domain.models import PersonelGorevlendirme

    coach_ids = CoachStudentAssignment.objects.filter(
        end_date__isnull=True,
        student__kurum_id=kurum_id,
    )
    if sube_id:
        coach_ids = coach_ids.filter(student__sube_id=sube_id)
    if allowed is not None:
        coach_ids = coach_ids.filter(student_id__in=allowed)
    coach_id_list = list(coach_ids.values_list('coach_id', flat=True).distinct())

    personel_ids = PersonelGorevlendirme.objects.filter(
        kurum_id=kurum_id,
        aktif_mi=True,
    )
    if sube_id:
        personel_ids = personel_ids.filter(gorev_sube_id=sube_id)
    personel_id_list = list(personel_ids.values_list('personel_id', flat=True))

    coaches = CoachProfile.objects.filter(is_active=True).filter(
        Q(id__in=coach_id_list) | Q(teacher_id__in=personel_id_list)
    ).select_related('teacher').order_by('teacher__ad', 'teacher__soyad')
    if allowed is not None and coach_id_list:
        coaches = coaches.filter(id__in=coach_id_list)

    coach_opts = [_opt(c.id, c.teacher.tam_ad) for c in coaches]

    return [
        _field('coach_id', 'Koç', 'kocluk', STUDENT_TYPES, coach_opts),
        _field('kocluk_durumu', 'Koçluk durumu', 'kocluk', STUDENT_TYPES, [
            _opt('atanmis', 'Koçu var'),
            _opt('atanmamis', 'Koçu yok'),
        ]),
    ]


def _staff_fields(kurum_id, sube_id, egitim_yili_id) -> list[dict]:
    from apps.personel.domain.models import PersonelGorevlendirme
    from apps.roller.models import Role

    role_ids = PersonelGorevlendirme.objects.filter(
        kurum_id=kurum_id,
        aktif_mi=True,
        rol_id__isnull=False,
    )
    if sube_id:
        role_ids = role_ids.filter(gorev_sube_id=sube_id)
    if egitim_yili_id:
        role_ids = role_ids.filter(egitim_yili_id=egitim_yili_id)
    roles = Role.objects.filter(
        id__in=role_ids.values_list('rol_id', flat=True),
        is_active=True,
    ).exclude(code__in=['ogrenci', 'okuyucu', 'super_admin']).order_by('name')

    return [
        _field('personel_rol_id', 'Personel rolü', 'personel', STAFF_TYPES, [
            _opt(r.id, r.name) for r in roles
        ]),
        _field('calisma_durumu', 'Çalışma durumu', 'personel', STAFF_TYPES, [
            _opt('aktif', 'Aktif'),
            _opt('pasif', 'Pasif'),
        ]),
    ]


def _quick_starts(coach_scoped: bool) -> list[dict[str, Any]]:
    items = [
        {
            'key': 'all_ogrenciler',
            'label': 'Tüm öğrenciler' if not coach_scoped else 'Öğrencilerim',
            'person_types': ['ogrenci'],
            'hint': 'Aktif öğrencilerle başlar, sonra daraltabilirsiniz.',
        },
        {
            'key': 'all_veliler',
            'label': 'Tüm veliler' if not coach_scoped else 'Velilerim',
            'person_types': ['veli'],
            'hint': 'Aktif öğrenci velileriyle başlar.',
        },
    ]
    if not coach_scoped:
        items.append({
            'key': 'all_personeller',
            'label': 'Tüm personeller',
            'person_types': ['personel'],
            'hint': 'Aktif personelle başlar, rol ile daraltabilirsiniz.',
        })
        items.append({
            'key': 'mixed',
            'label': 'Karma kitle',
            'person_types': ['ogrenci', 'veli', 'personel'],
            'hint': 'Öğrenci, veli ve personeli birlikte seçer.',
        })
    items.extend([
        {
            'key': 'sinif_sube',
            'label': 'Sınıf / Şube',
            'person_types': ['ogrenci'],
            'add_field': 'sinif_id',
            'hint': 'Belirli sınıf şubesindeki öğrenciler.',
        },
        {
            'key': 'coach_students',
            'label': 'Koç öğrencileri',
            'person_types': ['ogrenci'],
            'add_field': 'coach_id',
            'hint': 'Seçilen koçun öğrencileri.',
        },
        {
            'key': 'coach_parents',
            'label': 'Koç velileri',
            'person_types': ['veli'],
            'add_field': 'coach_id',
            'hint': 'Seçilen koçun öğrencilerinin velileri.',
        },
        {
            'key': 'kutuphane_ogrenciler',
            'label': 'Kütüphane öğrencileri',
            'person_types': ['ogrenci'],
            'add_field': 'ek_hizmet_turu',
            'add_value': ['kutuphane'],
            'hint': 'Aktif kütüphane ek hizmeti olan öğrenciler.',
        },
        {
            'key': 'kutuphane_veliler',
            'label': 'Kütüphane velileri',
            'person_types': ['veli'],
            'add_field': 'ek_hizmet_turu',
            'add_value': ['kutuphane'],
            'hint': 'Kütüphane hizmeti alan öğrencilerin velileri.',
        },
    ])
    return items
