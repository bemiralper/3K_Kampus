"""
Genel toplu gönderim — AND/OR kitle sorgusu.

Filtre ağacı kullanıcıya SQL/JSON olarak gösterilmez; arka planda şu şekildedir:

{
  "audience_type": "query",
  "person_types": ["ogrenci", "veli"],
  "label": "11-A velileri",
  "tree": {
    "join": "or",
    "groups": [
      {
        "join": "and",
        "filters": [
          {"field": "sinif_id", "op": "in", "value": [12]},
          {"field": "coach_id", "op": "in", "value": [3]}
        ]
      }
    ]
  },
  "excluded_ogrenci_ids": [],
  "excluded_veli_ids": [],
  "excluded_personel_ids": [],
  "included_ogrenci_ids": [],
  "included_veli_ids": [],
  "included_personel_ids": []
}
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from django.db.models import Q

from apps.coaching.services.coach_access import (
    is_resource_admin,
    scoped_student_ids,
)
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.domain.enums import RecipientType
from shared.permissions import user_has_any_permission


OPT_IN_CATEGORY = 'duyuru'

PERSON_OGRENCI = 'ogrenci'
PERSON_VELI = 'veli'
PERSON_PERSONEL = 'personel'
ALL_PERSON_TYPES = (PERSON_OGRENCI, PERSON_VELI, PERSON_PERSONEL)

STUDENT_FIELDS = frozenset({
    'kurum_id', 'sube_id', 'egitim_yili_id',
    'sinif_seviyesi_id', 'sinif_id',
    'paket', 'ek_hizmet_id', 'ek_hizmet_turu',
    'kayit_turu', 'giris_turu',
    'ogrenci_durum', 'cinsiyet',
    'coach_id', 'rehber_id', 'kocluk_durumu',
})
STAFF_FIELDS = frozenset({
    'kurum_id', 'sube_id', 'egitim_yili_id',
    'personel_rol_id', 'calisma_durumu',
})

FIELD_LABELS = {
    'kurum_id': 'Kurum',
    'sube_id': 'Şube',
    'egitim_yili_id': 'Eğitim yılı',
    'sinif_seviyesi_id': 'Sınıf',
    'sinif_id': 'Sınıf şubesi',
    'paket': 'Eğitim paketi',
    'ek_hizmet_id': 'Ek hizmet',
    'ek_hizmet_turu': 'Ek hizmet türü',
    'kayit_turu': 'Kayıt türü',
    'giris_turu': 'Giriş türü',
    'ogrenci_durum': 'Öğrenci durumu',
    'cinsiyet': 'Cinsiyet',
    'coach_id': 'Koç',
    'rehber_id': 'Rehber',
    'kocluk_durumu': 'Koçluk durumu',
    'personel_rol_id': 'Personel rolü',
    'calisma_durumu': 'Çalışma durumu',
}


@dataclass
class AudiencePerson:
    person_type: str
    ogrenci_id: int | None = None
    veli_id: int | None = None
    personel_id: int | None = None
    display_name: str = ''
    class_or_role: str = ''
    sube_name: str = ''
    coach_name: str = ''
    phone: str = ''
    e164: str = ''
    deliverable: bool = False
    skip_reason: str = ''

    @property
    def key(self) -> str:
        if self.person_type == PERSON_OGRENCI:
            return f'ogrenci:{self.ogrenci_id}'
        if self.person_type == PERSON_VELI:
            return f'veli:{self.veli_id}'
        return f'personel:{self.personel_id}'

    def to_row(self) -> dict[str, Any]:
        return {
            'key': self.key,
            'person_type': self.person_type,
            'ogrenci_id': self.ogrenci_id,
            'veli_id': self.veli_id,
            'personel_id': self.personel_id,
            'display_name': self.display_name,
            'class_or_role': self.class_or_role,
            'sube_name': self.sube_name,
            'coach_name': self.coach_name,
            'phone': self.phone,
            'e164': self.e164,
            'deliverable': self.deliverable,
            'skip_reason': self.skip_reason,
        }


@dataclass
class AudienceQueryResult:
    people: list[AudiencePerson] = field(default_factory=list)
    total: int = 0
    ogrenci_count: int = 0
    veli_count: int = 0
    personel_count: int = 0
    deliverable_count: int = 0
    unsuitable_count: int = 0
    label: str = ''

    def to_preview_dict(self) -> dict[str, Any]:
        return {
            'total_recipients': self.deliverable_count,
            'matched_count': self.total,
            'ogrenci_count': self.ogrenci_count,
            'veli_count': self.veli_count,
            'personel_count': self.personel_count,
            'deliverable_count': self.deliverable_count,
            'unsuitable_count': self.unsuitable_count,
            'invalid_phones': self.unsuitable_count,
            'estimated_messages': self.deliverable_count,
            'label': self.label,
        }


def empty_query(person_types: list[str] | None = None) -> dict[str, Any]:
    return {
        'audience_type': 'query',
        'person_types': list(person_types or []),
        'tree': {'join': 'or', 'groups': []},
        'excluded_ogrenci_ids': [],
        'excluded_veli_ids': [],
        'excluded_personel_ids': [],
        'included_ogrenci_ids': [],
        'included_veli_ids': [],
        'included_personel_ids': [],
        'label': '',
    }


def normalize_query(raw: dict | None) -> dict[str, Any]:
    data = dict(raw or {})
    data['audience_type'] = 'query'
    types = [t for t in (data.get('person_types') or []) if t in ALL_PERSON_TYPES]
    data['person_types'] = types
    tree = data.get('tree') or {}
    groups = []
    for group in tree.get('groups') or []:
        filters = []
        for item in group.get('filters') or []:
            field_name = str(item.get('field') or '')
            if not field_name:
                continue
            filters.append({
                'field': field_name,
                'op': item.get('op') or 'in',
                'value': item.get('value'),
            })
        groups.append({
            'join': 'and' if (group.get('join') or 'and') != 'or' else 'or',
            'filters': filters,
        })
    data['tree'] = {
        'join': 'and' if (tree.get('join') or 'or') == 'and' else 'or',
        'groups': groups,
    }
    for key in (
        'excluded_ogrenci_ids', 'excluded_veli_ids', 'excluded_personel_ids',
        'included_ogrenci_ids', 'included_veli_ids', 'included_personel_ids',
    ):
        data[key] = _int_list(data.get(key))
    data['label'] = str(data.get('label') or '')
    return data


def describe_query(query: dict | None) -> str:
    data = normalize_query(query)
    if data.get('label'):
        return data['label']
    types = data.get('person_types') or []
    type_labels = {
        PERSON_OGRENCI: 'öğrenciler',
        PERSON_VELI: 'veliler',
        PERSON_PERSONEL: 'personeller',
    }
    who = ' + '.join(type_labels[t] for t in types if t in type_labels) or 'kişiler'
    groups = (data.get('tree') or {}).get('groups') or []
    if not groups or all(not g.get('filters') for g in groups):
        return f'Tüm {who}'
    parts = []
    for group in groups:
        chips = []
        for item in group.get('filters') or []:
            chips.append(FIELD_LABELS.get(item.get('field'), item.get('field')))
        if chips:
            parts.append(' ve '.join(chips))
    join = (data.get('tree') or {}).get('join') or 'or'
    glue = ' veya ' if join == 'or' else ' ve '
    return f'{who} · {glue.join(parts)}'


def _int_list(raw) -> list[int]:
    if raw is None:
        return []
    if isinstance(raw, (int, float)):
        return [int(raw)]
    if isinstance(raw, str):
        raw = [p.strip() for p in raw.split(',') if p.strip()]
    result = []
    seen = set()
    for item in raw:
        try:
            value = int(item)
        except (TypeError, ValueError):
            continue
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _values(item: dict) -> list:
    value = item.get('value')
    if value is None or value == '':
        return []
    if isinstance(value, list):
        return value
    return [value]


def _packet_values(raw) -> list[tuple[str, int]]:
    items = raw if isinstance(raw, list) else [raw]
    packets = []
    for item in items:
        if isinstance(item, dict):
            turu = str(item.get('turu') or item.get('paket_turu') or '')
            try:
                pid = int(item.get('id') or item.get('paket_id'))
            except (TypeError, ValueError):
                continue
            if turu and pid:
                packets.append((turu, pid))
        elif isinstance(item, str) and ':' in item:
            turu, pid_raw = item.split(':', 1)
            try:
                packets.append((turu.strip(), int(pid_raw)))
            except ValueError:
                continue
    return packets


def _tree_has_field(tree: dict, field_name: str) -> bool:
    for group in tree.get('groups') or []:
        for item in group.get('filters') or []:
            if item.get('field') == field_name and item.get('value') not in (None, '', [], {}):
                return True
    return False


def _combine_sets(sets: list[set[int]], join: str) -> set[int]:
    if not sets:
        return set()
    result = sets[0]
    for extra in sets[1:]:
        result = result & extra if join == 'and' else result | extra
    return result


class AudienceQueryService:
    """Filtre ağacını kurum/şube/yetki kapsamında kişi listesine çevirir."""

    @classmethod
    def resolve(
        cls,
        kurum_id: int,
        filter_json: dict | None,
        *,
        user=None,
        context_sube_id: int | None = None,
        context_egitim_yili_id: int | None = None,
        include_unsuitable: bool = True,
    ) -> AudienceQueryResult:
        query = normalize_query(filter_json)
        person_types = set(query['person_types'])
        has_includes = bool(
            query.get('included_ogrenci_ids')
            or query.get('included_veli_ids')
            or query.get('included_personel_ids')
        )
        if not person_types and not has_includes:
            return AudienceQueryResult(label=describe_query(query))

        allowed = cls._scope_student_ids(user, kurum_id)
        if allowed is not None and not allowed and person_types & {PERSON_OGRENCI, PERSON_VELI}:
            if PERSON_PERSONEL not in person_types:
                return AudienceQueryResult(label=describe_query(query))

        student_ids: set[int] = set()
        personel_ids: set[int] = set()
        # Tür kartı seçilmeden yalnızca tek tek eklenen kişiler
        if person_types and person_types & {PERSON_OGRENCI, PERSON_VELI}:
            student_ids = cls._eval_student_tree(
                kurum_id,
                query['tree'],
                allowed,
                context_sube_id=context_sube_id,
                context_egitim_yili_id=context_egitim_yili_id,
            )
        if PERSON_PERSONEL in person_types:
            if allowed is not None:
                personel_ids = set()
            else:
                personel_ids = cls._eval_staff_tree(
                    kurum_id,
                    query['tree'],
                    context_sube_id=context_sube_id,
                    context_egitim_yili_id=context_egitim_yili_id,
                )

        people = cls._collect_people(
            kurum_id,
            person_types,
            student_ids,
            personel_ids,
            context_egitim_yili_id=context_egitim_yili_id,
        )
        people = cls._apply_manual_adjustments(
            kurum_id, people, query, allowed,
            context_egitim_yili_id=context_egitim_yili_id,
        )
        people = cls._dedupe(people)
        if not include_unsuitable:
            people = [p for p in people if p.deliverable]
        return cls._to_result(people, describe_query(query))

    @classmethod
    def to_audience_preview(cls, result: AudienceQueryResult):
        from apps.communication.application.campaign_service import AudiencePreview, AudienceRecipient

        recipients: list[AudienceRecipient] = []
        for person in result.people:
            if not person.deliverable:
                continue
            rtype = {
                PERSON_OGRENCI: RecipientType.OGRENCI,
                PERSON_VELI: RecipientType.VELI,
                PERSON_PERSONEL: RecipientType.PERSONEL,
            }[person.person_type]
            recipients.append(AudienceRecipient(
                e164=person.e164,
                recipient_type=rtype,
                ogrenci_id=person.ogrenci_id,
                veli_id=person.veli_id,
                personel_id=person.personel_id,
                display_name=person.display_name,
                raw_phone=person.phone,
            ))
        return AudiencePreview(
            total_recipients=len(recipients),
            ogrenci_count=sum(1 for r in recipients if r.recipient_type == RecipientType.OGRENCI),
            veli_count=sum(1 for r in recipients if r.recipient_type == RecipientType.VELI),
            personel_count=sum(1 for r in recipients if r.recipient_type == RecipientType.PERSONEL),
            estimated_messages=len(recipients),
            invalid_phones=result.unsuitable_count,
            recipients=recipients,
        )

    @classmethod
    def _scope_student_ids(cls, user, kurum_id: int):
        if not user or not getattr(user, 'is_authenticated', False):
            return None
        if is_resource_admin(user) or user_has_any_permission(user, 'communication.manage'):
            return None
        from apps.coaching.services.coach_access import get_coach_profile

        if get_coach_profile(user) is not None:
            return scoped_student_ids(user)
        if user_has_any_permission(user, 'communication.bulk'):
            return None
        return scoped_student_ids(user)

    @classmethod
    def _eval_student_tree(
        cls,
        kurum_id: int,
        tree: dict,
        allowed,
        *,
        context_sube_id: int | None,
        context_egitim_yili_id: int | None,
    ) -> set[int]:
        from apps.ogrenci.domain.models import OgrenciKayit

        groups = tree.get('groups') or []
        implicit_sube = context_sube_id if not _tree_has_field(tree, 'sube_id') else None
        implicit_year = (
            context_egitim_yili_id if not _tree_has_field(tree, 'egitim_yili_id') else None
        )
        default_aktif = not _tree_has_field(tree, 'ogrenci_durum')

        def base_qs():
            qs = OgrenciKayit.objects.filter(kurum_id=kurum_id)
            if implicit_sube:
                qs = qs.filter(sube_id=implicit_sube)
            if implicit_year:
                qs = qs.filter(egitim_yili_id=implicit_year)
            if default_aktif:
                qs = qs.filter(aktif_mi=True, ogrenci__aktif_mi=True)
            if allowed is not None:
                qs = qs.filter(ogrenci_id__in=allowed)
            return qs

        if not groups or all(not g.get('filters') for g in groups):
            return set(base_qs().values_list('ogrenci_id', flat=True))

        sets: list[set[int]] = []
        for group in groups:
            filters = [f for f in (group.get('filters') or []) if f.get('field') in STUDENT_FIELDS]
            if not filters and (group.get('filters') or []):
                sets.append(set())
                continue
            qs = base_qs()
            join = group.get('join') or 'and'
            if join == 'or' and filters:
                q_obj = Q()
                for item in filters:
                    part = cls._student_filter_q(item)
                    if part is not None:
                        q_obj |= part
                qs = qs.filter(q_obj) if q_obj else qs
            else:
                for item in filters:
                    qs = cls._apply_student_filter(qs, item)
            sets.append(set(qs.values_list('ogrenci_id', flat=True)))

        return _combine_sets(sets, tree.get('join') or 'or')

    @classmethod
    def _eval_staff_tree(
        cls,
        kurum_id: int,
        tree: dict,
        *,
        context_sube_id: int | None,
        context_egitim_yili_id: int | None,
    ) -> set[int]:
        from apps.personel.domain.models import Personel

        groups = tree.get('groups') or []
        implicit_sube = context_sube_id if not _tree_has_field(tree, 'sube_id') else None
        default_aktif = not _tree_has_field(tree, 'calisma_durumu')

        def base_qs():
            qs = Personel.objects.filter(kurum_id=kurum_id)
            if default_aktif:
                qs = qs.filter(aktif_mi=True)
            if implicit_sube:
                qs = cls._filter_staff_sube(qs, [implicit_sube], context_egitim_yili_id)
            return qs

        if not groups or all(not g.get('filters') for g in groups):
            return set(base_qs().values_list('id', flat=True))

        sets: list[set[int]] = []
        for group in groups:
            filters = [f for f in (group.get('filters') or []) if f.get('field') in STAFF_FIELDS]
            if not filters and (group.get('filters') or []):
                sets.append(set())
                continue
            qs = base_qs()
            for item in filters:
                qs = cls._apply_staff_filter(qs, item, context_egitim_yili_id)
            sets.append(set(qs.values_list('id', flat=True)))
        return _combine_sets(sets, tree.get('join') or 'or')

    @classmethod
    def _apply_student_filter(cls, qs, item: dict):
        q_obj = cls._student_filter_q(item)
        return qs.filter(q_obj) if q_obj is not None else qs

    @classmethod
    def _student_filter_q(cls, item: dict) -> Q | None:
        from apps.coaching.models import CoachStudentAssignment
        from apps.ogrenci.domain.models import OgrenciEgitimPaketi, OgrenciEkHizmet

        field_name = item.get('field')
        values = _values(item)
        if not values and field_name != 'paket':
            return None

        if field_name == 'sube_id':
            return Q(sube_id__in=_int_list(values))
        if field_name == 'kurum_id':
            return Q(kurum_id__in=_int_list(values))
        if field_name == 'egitim_yili_id':
            return Q(egitim_yili_id__in=_int_list(values))
        if field_name == 'sinif_seviyesi_id':
            ids = _int_list(values)
            return Q(sinif_seviyesi_id__in=ids) | Q(sinif__sinif_seviyesi_id__in=ids)
        if field_name == 'sinif_id':
            return Q(sinif_id__in=_int_list(values))
        if field_name == 'kayit_turu':
            return Q(ogrenci__kayit_turu__in=[str(v) for v in values])
        if field_name == 'giris_turu':
            return Q(giris_turu__in=[str(v) for v in values])
        if field_name == 'cinsiyet':
            return Q(ogrenci__cinsiyet__in=[str(v) for v in values])
        if field_name == 'ogrenci_durum':
            tokens = {str(v) for v in values}
            if tokens == {'aktif'}:
                return Q(aktif_mi=True, ogrenci__aktif_mi=True)
            if tokens == {'pasif'}:
                return Q(aktif_mi=False) | Q(ogrenci__aktif_mi=False)
            return None
        if field_name in ('coach_id', 'rehber_id'):
            student_ids = CoachStudentAssignment.objects.filter(
                coach_id__in=_int_list(values),
                end_date__isnull=True,
            ).values_list('student_id', flat=True)
            return Q(ogrenci_id__in=list(student_ids))
        if field_name == 'kocluk_durumu':
            assigned = list(CoachStudentAssignment.objects.filter(
                end_date__isnull=True,
            ).values_list('student_id', flat=True))
            tokens = {str(v) for v in values}
            if tokens == {'atanmis'}:
                return Q(ogrenci_id__in=assigned)
            if tokens == {'atanmamis'}:
                return ~Q(ogrenci_id__in=assigned)
            return None
        if field_name == 'paket':
            packets = _packet_values(item.get('value'))
            if not packets:
                return None
            q_obj = Q()
            for paket_turu, paket_id in packets:
                q_obj |= Q(paket_turu=paket_turu, paket_id=paket_id, aktif_mi=True)
            ids = OgrenciEgitimPaketi.objects.filter(q_obj).values_list('ogrenci_id', flat=True)
            return Q(ogrenci_id__in=list(ids))
        if field_name in ('ek_hizmet_id', 'ek_hizmet_turu'):
            # Hizmeti "alan" öğrenci = aktif OgrenciEkHizmet kaydı. Pakete dahil
            # gelen hizmetler de sayılır (dahil_mi filtresi yok); kütüphane modülü
            # erişim kapısını aynı şekilde belirliyor.
            qs = OgrenciEkHizmet.objects.filter(aktif_mi=True)
            if field_name == 'ek_hizmet_id':
                qs = qs.filter(ek_hizmet_id__in=_int_list(values))
            else:
                qs = qs.filter(ek_hizmet__hizmet_turu__in=[str(v) for v in values])
            return Q(ogrenci_id__in=list(qs.values_list('ogrenci_id', flat=True)))
        return None

    @classmethod
    def _apply_staff_filter(cls, qs, item: dict, egitim_yili_id: int | None):
        from apps.personel.domain.models import PersonelGorevlendirme

        field_name = item.get('field')
        values = _values(item)
        if field_name == 'sube_id':
            return cls._filter_staff_sube(qs, _int_list(values), egitim_yili_id)
        if field_name == 'kurum_id':
            return qs.filter(kurum_id__in=_int_list(values))
        if field_name == 'calisma_durumu':
            tokens = {str(v) for v in values}
            if tokens == {'aktif'}:
                return qs.filter(aktif_mi=True)
            if tokens == {'pasif'}:
                return qs.filter(aktif_mi=False)
            return qs
        if field_name == 'personel_rol_id':
            gorev = PersonelGorevlendirme.objects.filter(
                aktif_mi=True,
                rol_id__in=_int_list(values),
                personel__in=qs,
            )
            if egitim_yili_id:
                gorev = gorev.filter(egitim_yili_id=egitim_yili_id)
            return qs.filter(id__in=gorev.values_list('personel_id', flat=True))
        if field_name == 'egitim_yili_id':
            gorev = PersonelGorevlendirme.objects.filter(
                aktif_mi=True,
                egitim_yili_id__in=_int_list(values),
                personel__in=qs,
            )
            return qs.filter(id__in=gorev.values_list('personel_id', flat=True))
        return qs

    @classmethod
    def _filter_staff_sube(cls, qs, sube_ids: list[int], egitim_yili_id: int | None):
        from apps.personel.domain.models import PersonelGorevlendirme

        gorev = PersonelGorevlendirme.objects.filter(
            aktif_mi=True,
            gorev_sube_id__in=sube_ids,
        )
        if egitim_yili_id:
            gorev = gorev.filter(egitim_yili_id=egitim_yili_id)
        return qs.filter(
            Q(sube_id__in=sube_ids) | Q(id__in=gorev.values_list('personel_id', flat=True))
        )

    @classmethod
    def _collect_people(
        cls,
        kurum_id: int,
        person_types: set[str],
        student_ids: set[int],
        personel_ids: set[int],
        *,
        context_egitim_yili_id: int | None,
    ) -> list[AudiencePerson]:
        people: list[AudiencePerson] = []
        meta = cls._student_meta(kurum_id, student_ids, context_egitim_yili_id)

        if PERSON_OGRENCI in person_types and student_ids:
            from apps.ogrenci.domain.models import Ogrenci

            for o in Ogrenci.objects.filter(id__in=student_ids, kurum_id=kurum_id):
                people.append(cls._person_from_student(o, meta.get(o.id) or {}))

        if PERSON_VELI in person_types and student_ids:
            from apps.ogrenci.domain.models import OgrenciVeli

            for veli in OgrenciVeli.objects.filter(ogrenci_id__in=student_ids).select_related('ogrenci'):
                people.append(cls._person_from_parent(veli, meta.get(veli.ogrenci_id) or {}))

        if PERSON_PERSONEL in person_types and personel_ids:
            from apps.personel.domain.models import Personel, PersonelGorevlendirme

            staff = list(
                Personel.objects.filter(id__in=personel_ids, kurum_id=kurum_id).select_related('sube')
            )
            role_map: dict[int, str] = {}
            gorev_qs = PersonelGorevlendirme.objects.filter(
                personel_id__in=personel_ids,
                aktif_mi=True,
            ).select_related('rol')
            if context_egitim_yili_id:
                gorev_qs = gorev_qs.filter(egitim_yili_id=context_egitim_yili_id)
            for g in gorev_qs:
                if g.personel_id not in role_map and g.rol_id:
                    role_map[g.personel_id] = g.rol.name
            for p in staff:
                people.append(cls._person_from_staff(p, role_map.get(p.id, '')))
        return people

    @classmethod
    def _student_meta(
        cls,
        kurum_id: int,
        student_ids: set[int],
        egitim_yili_id: int | None,
    ) -> dict[int, dict[str, str]]:
        if not student_ids:
            return {}
        from apps.coaching.models import CoachStudentAssignment
        from apps.ogrenci.domain.models import OgrenciKayit

        kayit_qs = OgrenciKayit.objects.filter(
            kurum_id=kurum_id,
            ogrenci_id__in=student_ids,
        ).select_related('sinif', 'sube', 'sinif_seviyesi')
        if egitim_yili_id:
            kayit_qs = kayit_qs.filter(egitim_yili_id=egitim_yili_id)
        meta: dict[int, dict[str, str]] = {}
        for k in kayit_qs:
            if k.sinif_id:
                sinif_ad = k.sinif.ad
            elif k.sinif_seviyesi_id:
                sinif_ad = k.sinif_seviyesi.ad
            else:
                sinif_ad = ''
            meta[k.ogrenci_id] = {
                'class_or_role': sinif_ad,
                'sube_name': k.sube.ad if k.sube_id else '',
            }
        coach_qs = CoachStudentAssignment.objects.filter(
            student_id__in=student_ids,
            end_date__isnull=True,
            is_primary=True,
        ).select_related('coach__teacher')
        for a in coach_qs:
            row = meta.setdefault(a.student_id, {})
            row['coach_name'] = a.coach.teacher.tam_ad
        return meta

    @classmethod
    def _apply_deliverability(cls, person: AudiencePerson, *, opt_in_ok: bool = True) -> AudiencePerson:
        phone = (person.phone or '').strip()
        if not phone:
            person.deliverable = False
            person.skip_reason = 'Telefon yok'
            return person
        try:
            person.e164 = ContactResolver.normalize(phone)
        except Exception:
            person.deliverable = False
            person.skip_reason = 'Geçersiz telefon'
            return person
        if not opt_in_ok:
            person.deliverable = False
            person.skip_reason = 'WhatsApp gönderimine uygun değil'
            return person
        person.deliverable = True
        person.skip_reason = ''
        return person

    @classmethod
    def _person_from_student(cls, ogrenci, info: dict) -> AudiencePerson:
        return cls._apply_deliverability(AudiencePerson(
            person_type=PERSON_OGRENCI,
            ogrenci_id=ogrenci.id,
            display_name=ogrenci.tam_ad,
            class_or_role=info.get('class_or_role', ''),
            sube_name=info.get('sube_name', ''),
            coach_name=info.get('coach_name', ''),
            phone=(ogrenci.telefon or '').strip(),
        ))

    @classmethod
    def _person_from_parent(cls, veli, info: dict) -> AudiencePerson:
        opt_in = ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY)
        return cls._apply_deliverability(AudiencePerson(
            person_type=PERSON_VELI,
            ogrenci_id=veli.ogrenci_id,
            veli_id=veli.id,
            display_name=veli.tam_ad,
            class_or_role=info.get('class_or_role', ''),
            sube_name=info.get('sube_name', ''),
            coach_name=info.get('coach_name', ''),
            phone=(veli.telefon or '').strip(),
        ), opt_in_ok=opt_in)

    @classmethod
    def _person_from_staff(cls, personel, role_name: str) -> AudiencePerson:
        phone = (getattr(personel, 'cep_telefon', None) or getattr(personel, 'telefon', None) or '').strip()
        return cls._apply_deliverability(AudiencePerson(
            person_type=PERSON_PERSONEL,
            personel_id=personel.id,
            display_name=personel.tam_ad,
            class_or_role=role_name,
            sube_name=personel.sube.ad if getattr(personel, 'sube_id', None) else '',
            phone=phone,
        ))

    @classmethod
    def _apply_manual_adjustments(
        cls,
        kurum_id: int,
        people: list[AudiencePerson],
        query: dict,
        allowed,
        *,
        context_egitim_yili_id: int | None,
    ) -> list[AudiencePerson]:
        excluded_o = set(query.get('excluded_ogrenci_ids') or [])
        excluded_v = set(query.get('excluded_veli_ids') or [])
        excluded_p = set(query.get('excluded_personel_ids') or [])
        kept = []
        for person in people:
            if person.person_type == PERSON_OGRENCI and person.ogrenci_id in excluded_o:
                continue
            if person.person_type == PERSON_VELI and person.veli_id in excluded_v:
                continue
            if person.person_type == PERSON_PERSONEL and person.personel_id in excluded_p:
                continue
            kept.append(person)

        include_o = set(query.get('included_ogrenci_ids') or [])
        include_v = set(query.get('included_veli_ids') or [])
        include_p = set(query.get('included_personel_ids') or [])
        if include_o:
            extra_o = include_o if allowed is None else {oid for oid in include_o if oid in allowed}
            if extra_o:
                kept.extend(cls._collect_people(
                    kurum_id, {PERSON_OGRENCI}, extra_o, set(),
                    context_egitim_yili_id=context_egitim_yili_id,
                ))
        if include_v:
            from apps.ogrenci.domain.models import OgrenciVeli
            extra_v_students = set(
                OgrenciVeli.objects.filter(id__in=include_v).values_list('ogrenci_id', flat=True)
            )
            if allowed is not None:
                extra_v_students = {oid for oid in extra_v_students if oid in allowed}
            if extra_v_students:
                extras = cls._collect_people(
                    kurum_id, {PERSON_VELI}, extra_v_students, set(),
                    context_egitim_yili_id=context_egitim_yili_id,
                )
                kept.extend([p for p in extras if p.veli_id in include_v])
        if include_p and allowed is None:
            kept.extend(cls._collect_people(
                kurum_id, {PERSON_PERSONEL}, set(), include_p,
                context_egitim_yili_id=context_egitim_yili_id,
            ))
        return kept

    @classmethod
    def _dedupe(cls, people: list[AudiencePerson]) -> list[AudiencePerson]:
        seen: set[str] = set()
        result = []
        for person in people:
            if person.key in seen:
                continue
            seen.add(person.key)
            result.append(person)
        return result

    @classmethod
    def _to_result(cls, people: list[AudiencePerson], label: str) -> AudienceQueryResult:
        return AudienceQueryResult(
            people=people,
            total=len(people),
            ogrenci_count=sum(1 for p in people if p.person_type == PERSON_OGRENCI),
            veli_count=sum(1 for p in people if p.person_type == PERSON_VELI),
            personel_count=sum(1 for p in people if p.person_type == PERSON_PERSONEL),
            deliverable_count=sum(1 for p in people if p.deliverable),
            unsuitable_count=sum(1 for p in people if not p.deliverable),
            label=label,
        )
