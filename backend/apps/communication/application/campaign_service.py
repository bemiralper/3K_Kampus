"""
Toplu gönderim kampanyası — alıcı çözümleme ve yaşam döngüsü.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from apps.coaching.services.coach_access import (
    get_coach_profile,
    is_resource_admin,
    scoped_student_ids,
)
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.domain.enums import (
    CampaignStatus,
    Channel,
    MessageDirection,
    MessageStatus,
    MessageType,
    MetaTemplateStatus,
    RecipientType,
)
from apps.communication.domain.models import OutboundCampaign
from apps.communication.infrastructure.repository import (
    ConversationRepository,
    MessageRepository,
    OutboundCampaignRepository,
    OutboundQueueRepository,
)
from shared.permissions import user_has_any_permission


OPT_IN_CATEGORY = 'duyuru'


def _campaign_requires_template() -> bool:
    """
    Toplu gönderim yalnızca Meta onaylı şablonla yapılır.

    24 saatlik pencere kitlenin çok küçük bir kısmında açıktır; serbest metin
    toplu gönderimde alıcıların büyük bölümüne ulaşmaz.
    """
    from django.conf import settings

    return bool(getattr(settings, 'COMMUNICATION_CAMPAIGN_REQUIRE_TEMPLATE', True))


@dataclass
class AudienceRecipient:
    e164: str
    recipient_type: str
    ogrenci_id: int | None = None
    veli_id: int | None = None
    personel_id: int | None = None
    display_name: str = ''
    raw_phone: str = ''


@dataclass
class AudiencePreview:
    total_recipients: int = 0
    ogrenci_count: int = 0
    veli_count: int = 0
    personel_count: int = 0
    estimated_messages: int = 0
    invalid_phones: int = 0
    attachment_count: int = 0
    estimated_cost_usd: str = '0'
    ai_used: bool = False
    recipients: list[AudienceRecipient] = field(default_factory=list)

    def to_dict(self, *, include_recipients: bool = False) -> dict[str, Any]:
        data = {
            'total_recipients': self.total_recipients,
            'ogrenci_count': self.ogrenci_count,
            'veli_count': self.veli_count,
            'personel_count': self.personel_count,
            'estimated_messages': self.estimated_messages,
            'invalid_phones': self.invalid_phones,
            'attachment_count': self.attachment_count,
            'estimated_cost_usd': self.estimated_cost_usd,
            'ai_used': self.ai_used,
        }
        if include_recipients:
            data['recipients'] = [
                {
                    'e164': r.e164,
                    'recipient_type': r.recipient_type,
                    'ogrenci_id': r.ogrenci_id,
                    'veli_id': r.veli_id,
                    'personel_id': r.personel_id,
                    'display_name': r.display_name,
                }
                for r in self.recipients
            ]
        return data


ADVANCED_FILTER_KEYS = frozenset({
    'sinif_seviyesi_ids', 'sinif_ids', 'alan_ids', 'coach_ids', 'school_ids',
    'kalemler', 'kalem_turu', 'kalem_id', 'giris_turu', 'kayit_turu', 'cinsiyet',
    'durum', 'mali_durum', 'has_phone', 'whatsapp_default_only',
    'contact_kinds', 'rehber_ids', 'ogretmen_ids',
})


class AudienceResolver:
    """Filtre JSON → alıcı listesi."""

    @classmethod
    def resolve(
        cls,
        kurum_id: int,
        filter_json: dict | None,
        *,
        user=None,
        include_invalid: bool = False,
    ) -> AudiencePreview:
        filter_json = filter_json or {}
        audience_type = filter_json.get('audience_type', 'filtered')
        egitim_yili_id = filter_json.get('egitim_yili_id')

        allowed_student_ids = cls._scope_student_ids(user, kurum_id, filter_json)
        if allowed_student_ids is not None and not allowed_student_ids:
            return AudiencePreview()

        raw_entries: list[tuple[str, str, int | None, int | None, str]] = []

        if audience_type == 'query':
            from apps.communication.application.audience_query import AudienceQueryService

            result = AudienceQueryService.resolve(
                kurum_id,
                filter_json,
                user=user,
                context_sube_id=filter_json.get('sube_id'),
                context_egitim_yili_id=egitim_yili_id,
                include_unsuitable=include_invalid,
            )
            return AudienceQueryService.to_audience_preview(result)

        if audience_type == 'advanced' or cls._has_advanced_filters(filter_json):
            raw_entries.extend(
                cls._collect_advanced(kurum_id, filter_json, allowed_student_ids)
            )
        elif audience_type == 'all_veliler':
            raw_entries.extend(cls._collect_veliler(kurum_id, allowed_student_ids))
        elif audience_type == 'all_ogrenciler':
            raw_entries.extend(cls._collect_ogrenciler(kurum_id, allowed_student_ids))
        elif audience_type == 'sinif':
            sinif_id = filter_json.get('sinif_id')
            if sinif_id:
                raw_entries.extend(
                    cls._collect_by_sinif(kurum_id, int(sinif_id), egitim_yili_id, allowed_student_ids)
                )
        elif audience_type == 'sube':
            sube_id = filter_json.get('sube_id')
            if sube_id:
                raw_entries.extend(
                    cls._collect_by_sube(kurum_id, int(sube_id), allowed_student_ids)
                )
        elif audience_type == 'coach_students':
            coach_id = filter_json.get('coach_id') or cls._coach_id_from_user(user)
            if coach_id:
                raw_entries.extend(cls._collect_coach_students(kurum_id, int(coach_id)))
        elif audience_type == 'coach_parents':
            coach_id = filter_json.get('coach_id') or cls._coach_id_from_user(user)
            if coach_id:
                raw_entries.extend(cls._collect_coach_parents(kurum_id, int(coach_id)))
        elif audience_type == 'custom_ids':
            ogrenci_ids = filter_json.get('ogrenci_ids') or []
            veli_ids = filter_json.get('veli_ids') or []
            personel_ids = filter_json.get('personel_ids') or []
            raw_entries.extend(cls._collect_custom_ids(
                kurum_id, ogrenci_ids, veli_ids, allowed_student_ids,
                personel_ids=personel_ids,
            ))
        elif audience_type == 'all_personeller':
            # Personel kitleleri koç öğrenci kapsamına bağlı değildir (yalnızca admin bulk).
            if allowed_student_ids is None:
                raw_entries.extend(cls._collect_personeller(kurum_id, filter_json))
        else:
            # filtered — combine optional filters
            if filter_json.get('sinif_id'):
                raw_entries.extend(
                    cls._collect_by_sinif(
                        kurum_id,
                        int(filter_json['sinif_id']),
                        egitim_yili_id,
                        allowed_student_ids,
                    )
                )
            if filter_json.get('sube_id'):
                raw_entries.extend(
                    cls._collect_by_sube(kurum_id, int(filter_json['sube_id']), allowed_student_ids)
                )
            if filter_json.get('coach_id'):
                raw_entries.extend(cls._collect_coach_parents(kurum_id, int(filter_json['coach_id'])))
            ogrenci_ids = filter_json.get('ogrenci_ids') or []
            veli_ids = filter_json.get('veli_ids') or []
            personel_ids = filter_json.get('personel_ids') or []
            if ogrenci_ids or veli_ids or personel_ids:
                raw_entries.extend(
                    cls._collect_custom_ids(
                        kurum_id, ogrenci_ids, veli_ids, allowed_student_ids,
                        personel_ids=personel_ids,
                    )
                )
            if not raw_entries and audience_type in ('filtered',):
                if filter_json.get('include_students'):
                    raw_entries.extend(cls._collect_ogrenciler(kurum_id, allowed_student_ids))
                if filter_json.get('include_veliler'):
                    raw_entries.extend(cls._collect_veliler(kurum_id, allowed_student_ids))

        raw_entries = cls._apply_manual_include_exclude(
            kurum_id, raw_entries, filter_json, allowed_student_ids,
        )
        return cls._dedupe_and_count(raw_entries, include_invalid=include_invalid)

    @classmethod
    def _has_advanced_filters(cls, filter_json: dict) -> bool:
        return any(k in filter_json and filter_json[k] not in (None, '', [], {}) for k in ADVANCED_FILTER_KEYS)

    @classmethod
    def _collect_advanced(
        cls,
        kurum_id: int,
        filter_json: dict,
        allowed_student_ids,
    ) -> list[tuple]:
        from apps.ogrenci.domain.models import OgrenciVeli
        from apps.ogrenci.interfaces.list_helpers import build_kayit_queryset, parse_kalem_filter_param

        sube_id = filter_json.get('sube_id')
        if not sube_id:
            return []

        egitim_yili_id = filter_json.get('egitim_yili_id')
        sinif_ids = list(filter_json.get('sinif_ids') or [])
        if filter_json.get('sinif_id') and int(filter_json['sinif_id']) not in sinif_ids:
            sinif_ids.append(int(filter_json['sinif_id']))

        kalemler = filter_json.get('kalemler') or []
        if isinstance(kalemler, str):
            kalemler = parse_kalem_filter_param(kalemler)
        elif kalemler and isinstance(kalemler[0], dict):
            kalemler = [(k['turu'], int(k['id'])) for k in kalemler if k.get('turu') and k.get('id')]
        if not kalemler and filter_json.get('kalem_turu') and filter_json.get('kalem_id'):
            kalemler = [(filter_json['kalem_turu'], int(filter_json['kalem_id']))]

        coach_ids = list(filter_json.get('coach_ids') or [])
        if filter_json.get('coach_id'):
            coach_ids.append(int(filter_json['coach_id']))

        params = {
            'q': (filter_json.get('q') or '').strip(),
            'all_years': bool(filter_json.get('all_years')),
            'durum': filter_json.get('durum') or 'aktif',
            'sinif_seviyesi_ids': list(filter_json.get('sinif_seviyesi_ids') or []),
            'giris_turu': filter_json.get('giris_turu') or None,
            'kayit_turu': filter_json.get('kayit_turu') or None,
            'cinsiyet': filter_json.get('cinsiyet') or None,
            'paket_id': filter_json.get('paket_id'),
            'paket_turu': filter_json.get('paket_turu') or None,
            'kalemler': kalemler,
            'sinif_ids': sinif_ids,
            'school_ids': list(filter_json.get('school_ids') or []),
            'alan_ids': list(filter_json.get('alan_ids') or []),
            'coach_ids': coach_ids,
            'kayit_tarihi_bas': None,
            'kayit_tarihi_bit': None,
            'sort': 'created_at_desc',
        }
        ctx = {
            'kurum_id': kurum_id,
            'sube_id': int(sube_id),
            'egitim_yili_id': int(egitim_yili_id) if egitim_yili_id else None,
        }
        qs, _ = build_kayit_queryset(ctx, params, apply_durum=True)
        ogrenci_ids = list(qs.values_list('ogrenci_id', flat=True).distinct())
        if allowed_student_ids is not None:
            ogrenci_ids = [oid for oid in ogrenci_ids if oid in allowed_student_ids]

        mali = filter_json.get('mali_durum')
        if mali in ('borclu', 'borcu_yok', 'geciken'):
            ogrenci_ids = cls._filter_by_mali(kurum_id, int(sube_id), ogrenci_ids, mali)

        if not ogrenci_ids:
            return []

        contact_kinds = set(filter_json.get('contact_kinds') or ['ogrenci', 'anne', 'baba', 'vasi'])
        entries: list[tuple] = []

        if 'ogrenci' in contact_kinds:
            from apps.ogrenci.domain.models import Ogrenci
            oqs = Ogrenci.objects.filter(id__in=ogrenci_ids, kurum_id=kurum_id)
            if filter_json.get('has_phone') is True:
                oqs = oqs.exclude(telefon='')
            elif filter_json.get('has_phone') is False:
                oqs = oqs.filter(telefon='')
            for o in oqs:
                if not o.telefon and filter_json.get('has_phone') is not False:
                    continue
                if o.telefon:
                    entries.append((o.telefon, RecipientType.OGRENCI, o.id, None, o.tam_ad))

        veli_kinds = contact_kinds & {'anne', 'baba', 'vasi', 'veli'}
        if veli_kinds:
            veli_qs = OgrenciVeli.objects.filter(
                ogrenci_id__in=ogrenci_ids,
            ).exclude(telefon='').select_related('ogrenci')
            if 'veli' not in veli_kinds:
                veli_qs = veli_qs.filter(veli_turu__in=list(veli_kinds))
            for veli in veli_qs:
                if not ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                    continue
                if filter_json.get('whatsapp_default_only'):
                    telefonlar = getattr(veli, 'telefonlar', None) or []
                    if telefonlar and not any(
                        t.get('whatsapp_varsayilan') and t.get('numara') == veli.telefon
                        for t in telefonlar if isinstance(t, dict)
                    ):
                        # telefon alanı zaten WA varsayılanı — atlama yok
                        pass
                entries.append((
                    veli.telefon,
                    RecipientType.VELI,
                    veli.ogrenci_id,
                    veli.id,
                    veli.tam_ad,
                ))
        return entries

    @classmethod
    def _filter_by_mali(
        cls,
        kurum_id: int,
        sube_id: int,
        ogrenci_ids: list[int],
        mali: str,
    ) -> list[int]:
        if not ogrenci_ids:
            return []
        try:
            from apps.odeme_takip.domain.models import Sozlesme, Taksit
            from apps.odeme_takip.domain.enums import SozlesmeDurum
            from apps.odeme_takip.domain.overdue import overdue_base_q
        except Exception:
            return ogrenci_ids

        soz = Sozlesme.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            ogrenci_id__in=ogrenci_ids,
            durum=SozlesmeDurum.AKTIF,
        )
        if mali == 'geciken':
            overdue = (
                Taksit.objects.filter(sozlesme__in=soz)
                .filter(overdue_base_q())
                .values_list('sozlesme__ogrenci_id', flat=True)
                .distinct()
            )
            return list(set(overdue) & set(ogrenci_ids))

        debt_ids = set()
        for s in soz:
            kalan = float(getattr(s, 'kalan_borc', 0) or 0)
            if kalan > 0.01:
                debt_ids.add(s.ogrenci_id)
        if mali == 'borclu':
            return [oid for oid in ogrenci_ids if oid in debt_ids]
        if mali == 'borcu_yok':
            return [oid for oid in ogrenci_ids if oid not in debt_ids]
        return ogrenci_ids

    @classmethod
    def _apply_manual_include_exclude(
        cls,
        kurum_id: int,
        raw_entries: list[tuple],
        filter_json: dict,
        allowed_student_ids,
    ) -> list[tuple]:
        excluded_ogrenci = set(int(x) for x in (filter_json.get('excluded_ogrenci_ids') or []))
        excluded_veli = set(int(x) for x in (filter_json.get('excluded_veli_ids') or []))
        excluded_personel = set(int(x) for x in (filter_json.get('excluded_personel_ids') or []))
        # Legacy keys
        excluded_ids = set(int(x) for x in (filter_json.get('excluded_ids') or []))

        filtered = []
        for entry in raw_entries:
            if len(entry) >= 6:
                phone, rtype, oid, vid, name, pid = entry[:6]
            else:
                phone, rtype, oid, vid, name = entry[:5]
                pid = None
            if oid and (oid in excluded_ogrenci or oid in excluded_ids):
                continue
            if vid and (vid in excluded_veli or vid in excluded_ids):
                continue
            if pid and pid in excluded_personel:
                continue
            filtered.append(entry)

        include_ogrenci = filter_json.get('included_ogrenci_ids') or filter_json.get('included_ids') or []
        include_veli = filter_json.get('included_veli_ids') or []
        include_personel = filter_json.get('included_personel_ids') or []
        if include_ogrenci or include_veli or include_personel:
            filtered.extend(
                cls._collect_custom_ids(
                    kurum_id,
                    include_ogrenci if include_ogrenci else [],
                    include_veli,
                    allowed_student_ids,
                    personel_ids=include_personel or None,
                )
            )
        return filtered

    @classmethod
    def _collect_personeller(cls, kurum_id: int, filter_json: dict) -> list[tuple]:
        """Aktif personeller — opsiyonel rol / şube / eğitim yılı filtresi."""
        from django.db.models import Q

        from apps.personel.domain.models import Personel, PersonelGorevlendirme

        rol_ids = [int(x) for x in (filter_json.get('rol_ids') or []) if x is not None]
        sube_id = filter_json.get('sube_id')
        egitim_yili_id = filter_json.get('egitim_yili_id')

        qs = Personel.objects.filter(kurum_id=kurum_id, aktif_mi=True)

        if rol_ids:
            # Rol seçiliyse görevlendirmeden çöz (eğitim yılı / şube daraltması ile).
            gorev_qs = PersonelGorevlendirme.objects.filter(
                kurum_id=kurum_id,
                aktif_mi=True,
                rol_id__in=rol_ids,
            )
            if sube_id:
                gorev_qs = gorev_qs.filter(gorev_sube_id=int(sube_id))
            if egitim_yili_id:
                gorev_qs = gorev_qs.filter(egitim_yili_id=int(egitim_yili_id))
            personel_ids = list(gorev_qs.values_list('personel_id', flat=True).distinct())
            if not personel_ids:
                return []
            qs = qs.filter(id__in=personel_ids)
        elif sube_id:
            # Ev şubesi veya bu şubede aktif görevlendirme
            gorev_qs = PersonelGorevlendirme.objects.filter(
                kurum_id=kurum_id,
                aktif_mi=True,
                gorev_sube_id=int(sube_id),
            )
            if egitim_yili_id:
                gorev_qs = gorev_qs.filter(egitim_yili_id=int(egitim_yili_id))
            gorev_ids = gorev_qs.values_list('personel_id', flat=True)
            qs = qs.filter(Q(sube_id=int(sube_id)) | Q(id__in=gorev_ids))

        entries: list[tuple] = []
        for p in qs:
            phone = (getattr(p, 'cep_telefon', None) or getattr(p, 'telefon', None) or '').strip()
            if not phone:
                continue
            entries.append((
                phone,
                RecipientType.PERSONEL,
                None,
                None,
                p.tam_ad,
                p.id,
            ))
        return entries

    @classmethod
    def _scope_student_ids(cls, user, kurum_id: int, filter_json: dict):
        if not user or not user.is_authenticated:
            return None
        if is_resource_admin(user) or user_has_any_permission(
            user, 'communication.manage', 'communication.bulk'
        ):
            audience_type = filter_json.get('audience_type', '')
            if audience_type in ('coach_students', 'coach_parents'):
                coach_id = filter_json.get('coach_id') or cls._coach_id_from_user(user)
                if coach_id and not is_resource_admin(user):
                    return cls._student_ids_for_coach(int(coach_id))
            return None
        allowed = scoped_student_ids(user)
        return allowed

    @classmethod
    def _coach_id_from_user(cls, user) -> int | None:
        profile = get_coach_profile(user)
        return profile.id if profile else None

    @classmethod
    def _student_ids_for_coach(cls, coach_id: int) -> set[int]:
        from apps.coaching.models import CoachStudentAssignment

        return set(
            CoachStudentAssignment.objects.filter(
                coach_id=coach_id,
                end_date__isnull=True,
            ).values_list('student_id', flat=True)
        )

    @classmethod
    def _collect_veliler(cls, kurum_id: int, allowed_student_ids) -> list[tuple]:
        from apps.ogrenci.domain.models import OgrenciVeli

        qs = OgrenciVeli.objects.filter(
            ogrenci__kurum_id=kurum_id,
            ogrenci__aktif_mi=True,
        ).exclude(telefon='').select_related('ogrenci')
        if allowed_student_ids is not None:
            qs = qs.filter(ogrenci_id__in=allowed_student_ids)
        entries = []
        for veli in qs:
            if not ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                continue
            entries.append((
                veli.telefon,
                RecipientType.VELI,
                veli.ogrenci_id,
                veli.id,
                veli.tam_ad,
            ))
        return entries

    @classmethod
    def _collect_ogrenciler(cls, kurum_id: int, allowed_student_ids) -> list[tuple]:
        from apps.ogrenci.domain.models import Ogrenci

        qs = Ogrenci.objects.filter(kurum_id=kurum_id, aktif_mi=True).exclude(telefon='')
        if allowed_student_ids is not None:
            qs = qs.filter(id__in=allowed_student_ids)
        return [
            (o.telefon, RecipientType.OGRENCI, o.id, None, o.tam_ad)
            for o in qs
        ]

    @classmethod
    def _collect_by_sinif(
        cls,
        kurum_id: int,
        sinif_id: int,
        egitim_yili_id,
        allowed_student_ids,
    ) -> list[tuple]:
        from apps.ogrenci.domain.models import OgrenciKayit, OgrenciVeli

        qs = OgrenciKayit.objects.filter(
            kurum_id=kurum_id,
            sinif_id=sinif_id,
            aktif_mi=True,
            ogrenci__aktif_mi=True,
        ).select_related('ogrenci')
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=int(egitim_yili_id))
        if allowed_student_ids is not None:
            qs = qs.filter(ogrenci_id__in=allowed_student_ids)

        entries: list[tuple] = []
        ogrenci_ids = list(qs.values_list('ogrenci_id', flat=True))
        for kayit in qs:
            o = kayit.ogrenci
            if o.telefon:
                entries.append((o.telefon, RecipientType.OGRENCI, o.id, None, o.tam_ad))

        veli_qs = OgrenciVeli.objects.filter(
            ogrenci_id__in=ogrenci_ids,
        ).exclude(telefon='').select_related('ogrenci')
        for veli in veli_qs:
            if ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                entries.append((
                    veli.telefon,
                    RecipientType.VELI,
                    veli.ogrenci_id,
                    veli.id,
                    veli.tam_ad,
                ))
        return entries

    @classmethod
    def _collect_by_sube(cls, kurum_id: int, sube_id: int, allowed_student_ids) -> list[tuple]:
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli

        qs = Ogrenci.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            aktif_mi=True,
        ).exclude(telefon='')
        if allowed_student_ids is not None:
            qs = qs.filter(id__in=allowed_student_ids)
        entries = [
            (o.telefon, RecipientType.OGRENCI, o.id, None, o.tam_ad)
            for o in qs
        ]
        ogrenci_ids = list(qs.values_list('id', flat=True))
        veli_qs = OgrenciVeli.objects.filter(ogrenci_id__in=ogrenci_ids).exclude(telefon='')
        for veli in veli_qs:
            if ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                entries.append((
                    veli.telefon,
                    RecipientType.VELI,
                    veli.ogrenci_id,
                    veli.id,
                    veli.tam_ad,
                ))
        return entries

    @classmethod
    def _collect_coach_students(cls, kurum_id: int, coach_id: int) -> list[tuple]:
        student_ids = cls._student_ids_for_coach(coach_id)
        return cls._collect_ogrenciler(kurum_id, student_ids)

    @classmethod
    def _collect_coach_parents(cls, kurum_id: int, coach_id: int) -> list[tuple]:
        from apps.ogrenci.domain.models import OgrenciVeli

        student_ids = cls._student_ids_for_coach(coach_id)
        if not student_ids:
            return []
        veli_qs = OgrenciVeli.objects.filter(
            ogrenci_id__in=student_ids,
            ogrenci__kurum_id=kurum_id,
        ).exclude(telefon='')
        entries = []
        for veli in veli_qs:
            if ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                entries.append((
                    veli.telefon,
                    RecipientType.VELI,
                    veli.ogrenci_id,
                    veli.id,
                    veli.tam_ad,
                ))
        return entries

    @classmethod
    def _collect_custom_ids(
        cls,
        kurum_id: int,
        ogrenci_ids: list,
        veli_ids: list,
        allowed_student_ids,
        *,
        personel_ids: list | None = None,
    ) -> list[tuple]:
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli

        entries: list[tuple] = []
        if ogrenci_ids:
            qs = Ogrenci.objects.filter(
                kurum_id=kurum_id,
                id__in=ogrenci_ids,
                aktif_mi=True,
            ).exclude(telefon='')
            if allowed_student_ids is not None:
                qs = qs.filter(id__in=allowed_student_ids)
            for o in qs:
                entries.append((o.telefon, RecipientType.OGRENCI, o.id, None, o.tam_ad))

        if veli_ids:
            veli_qs = OgrenciVeli.objects.filter(
                id__in=veli_ids,
                ogrenci__kurum_id=kurum_id,
            ).exclude(telefon='').select_related('ogrenci')
            if allowed_student_ids is not None:
                veli_qs = veli_qs.filter(ogrenci_id__in=allowed_student_ids)
            for veli in veli_qs:
                if ContactResolver.veli_allows_outbound(veli, OPT_IN_CATEGORY):
                    entries.append((
                        veli.telefon,
                        RecipientType.VELI,
                        veli.ogrenci_id,
                        veli.id,
                        veli.tam_ad,
                    ))

        # Koç kapsamı (allowed_student_ids) personel seçimine izin vermez
        if personel_ids and allowed_student_ids is None:
            from apps.personel.domain.models import Personel

            pqs = Personel.objects.filter(
                kurum_id=kurum_id,
                id__in=personel_ids,
                aktif_mi=True,
            )
            for p in pqs:
                phone = (getattr(p, 'cep_telefon', None) or getattr(p, 'telefon', None) or '').strip()
                if not phone:
                    continue
                entries.append((
                    phone,
                    RecipientType.PERSONEL,
                    None,
                    None,
                    p.tam_ad,
                    p.id,
                ))
        return entries

    @classmethod
    def _dedupe_and_count(
        cls,
        raw_entries: list[tuple],
        *,
        include_invalid: bool = False,
    ) -> AudiencePreview:
        seen_e164: set[str] = set()
        recipients: list[AudienceRecipient] = []
        invalid = 0
        ogrenci_count = 0
        veli_count = 0
        personel_count = 0

        for entry in raw_entries:
            if len(entry) >= 6:
                phone, rtype, ogrenci_id, veli_id, display_name, personel_id = entry[:6]
            else:
                phone, rtype, ogrenci_id, veli_id, display_name = entry[:5]
                personel_id = None
            try:
                e164 = ContactResolver.normalize(phone)
            except (ValidationError, Exception):
                invalid += 1
                continue
            if e164 in seen_e164:
                continue
            seen_e164.add(e164)
            recipients.append(AudienceRecipient(
                e164=e164,
                recipient_type=rtype,
                ogrenci_id=ogrenci_id,
                veli_id=veli_id,
                personel_id=personel_id,
                display_name=display_name,
                raw_phone=phone,
            ))
            if rtype == RecipientType.OGRENCI:
                ogrenci_count += 1
            elif rtype == RecipientType.VELI:
                veli_count += 1
            elif rtype == RecipientType.PERSONEL:
                personel_count += 1

        preview = AudiencePreview(
            total_recipients=len(recipients),
            ogrenci_count=ogrenci_count,
            veli_count=veli_count,
            personel_count=personel_count,
            estimated_messages=len(recipients),
            invalid_phones=invalid,
            recipients=recipients if include_invalid else recipients,
        )
        return preview


class CampaignService:
    """Kampanya CRUD ve kuyruk üretimi."""

    @staticmethod
    def _validate_attachment_header_match(attachments, header_type: str) -> None:
        """Ek MIME tipi ile Meta şablon header türünün uyumunu zorunlu kılar."""
        htype = (header_type or '').upper()
        if not attachments:
            if htype in ('IMAGE', 'DOCUMENT', 'VIDEO'):
                raise ValidationError(
                    f'Seçilen şablon {htype} header bekliyor ancak ek yok. '
                    'Metin duyurusu için TEXT header’lı şablon seçin '
                    '(örn. duyuru_metin) veya uygun ek yükleyin.',
                )
            return
        mime = (attachments[0].mime_type or '').lower()
        if mime.startswith('image/'):
            if htype != 'IMAGE':
                raise ValidationError(
                    'Görsel ek yüklendi; IMAGE header’lı şablon seçin '
                    '(örn. duyuru_gorsel).',
                )
        else:
            if htype != 'DOCUMENT':
                raise ValidationError(
                    'PDF/belge ek yüklendi; DOCUMENT header’lı şablon seçin '
                    '(örn. duyuru_pdf).',
                )

    def preview(
        self,
        kurum_id: int,
        filter_json: dict | None,
        *,
        user=None,
        attachment_count: int = 0,
        ai_used: bool = False,
    ) -> dict:
        from apps.communication.application.cost_estimator import estimate_campaign_cost

        preview = AudienceResolver.resolve(kurum_id, filter_json, user=user)
        preview.attachment_count = attachment_count
        preview.ai_used = ai_used
        cost = estimate_campaign_cost(preview.estimated_messages, attachment_count=attachment_count)
        preview.estimated_cost_usd = str(cost)
        return preview.to_dict()

    def resolve_recipients(
        self,
        kurum_id: int,
        filter_json: dict | None,
        *,
        user=None,
    ) -> dict:
        preview = AudienceResolver.resolve(kurum_id, filter_json, user=user, include_invalid=True)
        return preview.to_dict(include_recipients=True)

    def create_draft(
        self,
        kurum_id: int,
        *,
        created_by_id: int | None,
        sube_id: int | None = None,
        title: str = '',
        body: str = '',
        template_name: str = '',
        template_language: str = 'tr',
        template_components_json: list | None = None,
        audience_filter: dict | None = None,
        user=None,
        attachment_ids: list | None = None,
        template_id=None,
        scheduled_at=None,
        send_options: dict | None = None,
        save_as_template: bool = False,
        template_category: str = '',
        channel_config_id=None,
    ) -> OutboundCampaign:
        from apps.communication.application.account_resolver import AccountResolveError, AccountResolver
        from apps.communication.application.cost_estimator import estimate_campaign_cost
        from apps.communication.application.template_service import TemplateService
        from apps.communication.domain.models import CampaignAttachment, MessageTemplate

        audience_filter = audience_filter or {}
        if sube_id:
            audience_type = audience_filter.get('audience_type')
            if audience_type in (
                'all_veliler', 'all_ogrenciler', 'all_personeller', 'advanced', 'filtered', 'query',
            ):
                audience_filter = {**audience_filter, 'sube_id': sube_id}
            elif not audience_filter.get('sube_id'):
                audience_filter = {**audience_filter, 'sube_id': sube_id}
        if not body and not template_name and not template_id:
            raise ValidationError('Mesaj metni veya şablon adı zorunludur.')

        self._validate_audience_scope(kurum_id, audience_filter, user)

        from apps.communication.infrastructure.repository import ChannelConfigRepository

        try:
            channel_config = AccountResolver.resolve(
                kurum_id=kurum_id,
                user=user,
                sube_id=sube_id,
                preferred_id=channel_config_id,
                raise_if_missing=bool(channel_config_id),
            )
        except AccountResolveError as exc:
            raise ValidationError(exc.message) from exc
        if channel_config is None:
            # Geriye uyum: henüz hesap tanımlanmamış kurumlarda stub/env gönderim
            channel_config = ChannelConfigRepository.get_whatsapp_config(kurum_id)

        attachment_ids = attachment_ids or []
        attachment_qs = CampaignAttachment.objects.filter(kurum_id=kurum_id, id__in=attachment_ids)
        if sube_id:
            attachment_qs = attachment_qs.filter(sube_id=sube_id)
        attachments = list(attachment_qs)
        if attachment_ids and len(attachments) != len(set(str(a) for a in attachment_ids)):
            raise ValidationError('Geçersiz ek dosya kimliği.')

        message_template = None
        if template_id:
            template_qs = MessageTemplate.objects.filter(
                kurum_id=kurum_id,
                id=template_id,
                is_active=True,
            )
            if sube_id:
                template_qs = template_qs.filter(sube_id=sube_id)
            message_template = template_qs.first()
            if not message_template:
                raise ValidationError('Şablon bulunamadı.')
            if not body:
                body = message_template.body
            # Uygulama şablonunun Meta karşılığı varsa toplu gönderim onu kullanır
            if not template_name and message_template.meta_template_id:
                paired = message_template.meta_template
                if paired and paired.status == MetaTemplateStatus.APPROVED:
                    template_name = paired.name
                    template_language = paired.language or template_language

        if not template_name and _campaign_requires_template():
            raise ValidationError(
                'Toplu gönderimde Meta onaylı bir şablon seçilmelidir. WhatsApp, '
                'toplu serbest metin mesajlarını iletmez.',
            )

        preview_data = AudienceResolver.resolve(kurum_id, audience_filter, user=user)
        if preview_data.total_recipients == 0:
            raise ValidationError('Seçilen filtreye uygun alıcı bulunamadı.')

        if template_name:
            from apps.communication.application.meta_template_service import MetaTemplateService
            from apps.communication.application.template_media_header import (
                meta_template_header_type,
            )
            from apps.communication.domain.models import WhatsAppMetaTemplate

            lang = template_language or 'tr'
            acct_id = channel_config.id if channel_config else channel_config_id
            approved = MetaTemplateService.get_approved(
                kurum_id,
                name=template_name,
                language=lang,
                channel_config_id=acct_id,
            )
            if approved is None:
                blocked = WhatsAppMetaTemplate.objects.filter(
                    kurum_id=kurum_id,
                    name=template_name,
                    language=lang,
                ).exclude(status=MetaTemplateStatus.APPROVED).first()
                if blocked:
                    raise ValidationError(
                        f'Meta şablon onaylı değil (durum: {blocked.status}). '
                        'Yalnızca onaylanmış şablonlar gönderilebilir.',
                    )
            else:
                if not body:
                    body = approved.body_named
                header_type = meta_template_header_type(approved)
                self._validate_attachment_header_match(attachments, header_type)
            audience_filter = {
                **audience_filter,
                'template_name': template_name,
                'template_language': lang,
            }
            if acct_id:
                audience_filter['channel_config_id'] = str(acct_id)
            if template_components_json:
                audience_filter['template_components_json'] = template_components_json

        cost = estimate_campaign_cost(
            preview_data.estimated_messages,
            attachment_count=len(attachments),
        )

        send_options = dict(send_options or {})
        if scheduled_at:
            send_options = {**send_options, 'scheduled': True}
        # Manuel şablon değişkenleri (örn. {{mesaj}}) — gönderimde context'e eklenir
        template_context = send_options.get('template_context')
        if isinstance(template_context, dict) and template_context:
            audience_filter = {
                **audience_filter,
                'template_context': {
                    str(k): ('' if v is None else str(v))
                    for k, v in template_context.items()
                },
            }

        campaign = OutboundCampaignRepository.create_draft(
            kurum_id,
            created_by_id,
            {
                'sube_id': sube_id,
                'channel_config': channel_config,
                'title': title or f'Toplu gönderim {timezone.now():%d.%m.%Y %H:%M}',
                'body_template': body or template_name,
                'recipient_filter_json': audience_filter,
                'preview_stats_json': {
                    **preview_data.to_dict(),
                    'attachment_count': len(attachments),
                    'estimated_cost_usd': str(cost),
                },
                'total_recipients': preview_data.total_recipients,
                'status': CampaignStatus.DRAFT,
                'template': message_template,
                'scheduled_at': scheduled_at,
                'send_options_json': send_options,
                'estimated_cost_usd': cost,
            },
        )

        if attachments:
            campaign.attachments.set(attachments)

        if save_as_template and body and user:
            TemplateService().create(
                kurum_id,
                sube_id=sube_id,
                user=user,
                name=title or f'Şablon {timezone.now():%d.%m.%Y}',
                body=body,
                category=template_category or 'ozel',
                attachment_ids_json=[str(a.id) for a in attachments],
            )

        if message_template:
            TemplateService().increment_usage(message_template)

        return campaign

    def confirm(
        self,
        campaign: OutboundCampaign,
        *,
        sender_user_id: int | None = None,
        enqueue_async: bool = False,
    ) -> OutboundCampaign:
        """
        Kampanyayı onayla.

        HTTP isteklerinde enqueue_async=True: alıcı kuyruğu arka planda üretilir,
        yanıt hemen CONFIRMED döner (45 sn tarayıcı timeout'una takılmaz).
        Cron / test / hook'lar varsayılan senkron yolu kullanır.
        """
        from apps.communication.application.celery_dispatch import dispatch_materialize_campaign

        with transaction.atomic():
            locked = OutboundCampaign.objects.select_for_update().get(pk=campaign.pk)

            if locked.status in (
                CampaignStatus.QUEUED,
                CampaignStatus.PROCESSING,
                CampaignStatus.COMPLETED,
                CampaignStatus.PARTIAL,
            ):
                return locked

            if locked.status == CampaignStatus.CONFIRMED:
                if locked.scheduled_at and locked.scheduled_at > timezone.now():
                    return locked
                if enqueue_async:
                    campaign_id = locked.id
                    transaction.on_commit(
                        lambda: dispatch_materialize_campaign(campaign_id, sender_user_id),
                    )
                    return locked
            elif locked.status != CampaignStatus.DRAFT:
                raise ValidationError('Sadece taslak kampanyalar onaylanabilir.')
            else:
                if locked.scheduled_at and locked.scheduled_at > timezone.now():
                    locked.status = CampaignStatus.CONFIRMED
                    locked.save(update_fields=['status', 'updated_at'])
                    return locked

                if not locked.total_recipients:
                    preview = AudienceResolver.resolve(
                        locked.kurum_id,
                        locked.recipient_filter_json,
                    )
                    if preview.total_recipients == 0:
                        raise ValidationError('Alıcı listesi boş.')
                    locked.total_recipients = preview.total_recipients
                    locked.preview_stats_json = preview.to_dict()

                locked.status = CampaignStatus.CONFIRMED
                locked.save(update_fields=[
                    'status', 'total_recipients', 'preview_stats_json', 'updated_at',
                ])

                if enqueue_async:
                    campaign_id = locked.id
                    transaction.on_commit(
                        lambda: dispatch_materialize_campaign(campaign_id, sender_user_id),
                    )
                    return locked

        return self.materialize_queue(locked, sender_user_id=sender_user_id)

    @transaction.atomic
    def materialize_queue(
        self,
        campaign: OutboundCampaign,
        *,
        sender_user_id: int | None = None,
    ) -> OutboundCampaign:
        """Alıcı listesini mesaj + outbound kuyruk kayıtlarına çevir."""
        from apps.communication.application.variable_resolver import (
            aktif_sinif_ad,
            build_recipient_context,
            resolve_variables,
        )
        from apps.communication.domain.models import Message, MessageAttachment
        from apps.kurum.domain.models import Kurum
        from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
        from apps.personel.domain.models import Personel

        locked = OutboundCampaign.objects.select_for_update().get(pk=campaign.pk)
        if locked.status in (
            CampaignStatus.QUEUED,
            CampaignStatus.PROCESSING,
            CampaignStatus.COMPLETED,
            CampaignStatus.PARTIAL,
            CampaignStatus.CANCELLED,
        ):
            return locked
        if locked.status not in (CampaignStatus.DRAFT, CampaignStatus.CONFIRMED):
            return locked
        if Message.objects.filter(campaign=locked).exists():
            locked.status = CampaignStatus.QUEUED
            locked.save(update_fields=['status', 'updated_at'])
            return locked

        preview = AudienceResolver.resolve(
            locked.kurum_id,
            locked.recipient_filter_json,
        )
        if preview.total_recipients == 0:
            raise ValidationError('Alıcı listesi boş.')

        filter_json = locked.recipient_filter_json or {}
        template_name = filter_json.get('template_name', '')
        message_type = MessageType.TEMPLATE if template_name else MessageType.TEXT
        body_template = locked.body_template or template_name
        kurum = Kurum.objects.filter(id=locked.kurum_id).first()
        campaign_attachments = list(locked.attachments.all())

        ogrenci_ids = {
            r.ogrenci_id
            for r in preview.recipients
            if r.ogrenci_id and r.recipient_type != RecipientType.PERSONEL
        }
        veli_ids = {
            r.veli_id
            for r in preview.recipients
            if r.veli_id and r.recipient_type != RecipientType.PERSONEL
        }
        personel_ids = {r.personel_id for r in preview.recipients if r.personel_id}
        ogrenciler = {
            o.id: o
            for o in Ogrenci.objects.select_related('sube').filter(id__in=ogrenci_ids)
        }
        veliler = {v.id: v for v in OgrenciVeli.objects.filter(id__in=veli_ids)}
        personeller = {
            p.id: p
            for p in Personel.objects.select_related('sube').filter(id__in=personel_ids)
        }

        extra_ctx = {}
        send_opts = locked.send_options_json or {}
        if isinstance(send_opts.get('template_context'), dict):
            extra_ctx.update(send_opts['template_context'])
        if isinstance(filter_json.get('template_context'), dict):
            extra_ctx.update(filter_json['template_context'])

        locked.total_recipients = preview.total_recipients
        locked.preview_stats_json = preview.to_dict()
        locked.save(update_fields=['total_recipients', 'preview_stats_json', 'updated_at'])

        for recipient in preview.recipients:
            is_personel = recipient.recipient_type == RecipientType.PERSONEL
            ogrenci = None if is_personel else ogrenciler.get(recipient.ogrenci_id)
            veli = None if is_personel else veliler.get(recipient.veli_id)
            personel = personeller.get(recipient.personel_id) if recipient.personel_id else None

            sube_ad = ''
            if ogrenci and getattr(ogrenci, 'sube', None):
                sube_ad = getattr(ogrenci.sube, 'ad', '') or ''
            elif personel and getattr(personel, 'sube', None):
                sube_ad = getattr(personel.sube, 'ad', '') or ''

            recipient_ctx = build_recipient_context(
                display_name=recipient.display_name,
                recipient_type=recipient.recipient_type,
                ogrenci=ogrenci,
                veli=veli,
                personel=personel,
                kurum=kurum,
                sinif_ad=aktif_sinif_ad(ogrenci),
                sube_ad=sube_ad,
            )
            for key, value in extra_ctx.items():
                if value is None or str(value).strip() == '':
                    continue
                recipient_ctx[str(key)] = str(value)

            body = resolve_variables(body_template, recipient_ctx)
            resolved = ContactResolver.resolve_contact(locked.kurum_id, recipient.e164)
            conversation, _ = ConversationRepository.get_or_create_for_contact(
                kurum_id=locked.kurum_id,
                channel=locked.channel or Channel.WHATSAPP,
                contact_phone=recipient.e164,
                contact_type=recipient.recipient_type,
                contact_identity=resolved.identity,
                ogrenci_id=None if is_personel else (recipient.ogrenci_id or resolved.ogrenci_id),
                veli_id=None if is_personel else (recipient.veli_id or resolved.veli_id),
                channel_config=locked.channel_config,
            )
            if is_personel and personel:
                update_fields = []
                if conversation.contact_type != RecipientType.PERSONEL:
                    conversation.contact_type = RecipientType.PERSONEL
                    update_fields.append('contact_type')
                if conversation.subject != (personel.tam_ad or ''):
                    conversation.subject = personel.tam_ad or ''
                    update_fields.append('subject')
                if conversation.ogrenci_id is not None:
                    conversation.ogrenci_id = None
                    update_fields.append('ogrenci_id')
                if conversation.veli_id is not None:
                    conversation.veli_id = None
                    update_fields.append('veli_id')
                if update_fields:
                    update_fields.append('updated_at')
                    conversation.save(update_fields=update_fields)
            msg_type = message_type
            if campaign_attachments and not template_name:
                first = campaign_attachments[0]
                if (first.mime_type or '').startswith('image/'):
                    msg_type = MessageType.IMAGE
                else:
                    msg_type = MessageType.DOCUMENT

            message = MessageRepository.create(
                conversation=conversation,
                campaign=locked,
                direction=MessageDirection.OUTBOUND,
                message_type=msg_type,
                body=body,
                status=MessageStatus.PENDING,
                sender_user_id=sender_user_id,
                source_module='campaign',
                source_ref_id=str(locked.id),
            )

            if campaign_attachments:
                for att in campaign_attachments:
                    MessageAttachment.objects.create(
                        message=message,
                        file=att.file,
                        original_name=att.original_name,
                        mime_type=att.mime_type,
                        file_size=att.file_size,
                        provider_media_id=att.provider_media_id or '',
                    )

            ConversationRepository.update_on_message(
                conversation,
                preview=body[:255],
                direction=MessageDirection.OUTBOUND,
            )
            OutboundQueueRepository.enqueue(
                kurum_id=locked.kurum_id,
                message=message,
                campaign=locked,
                next_attempt_at=timezone.now(),
                send_options=dict(locked.send_options_json or {}),
            )

        locked.status = CampaignStatus.QUEUED
        locked.save(update_fields=['status', 'updated_at'])

        from apps.communication.application.celery_dispatch import dispatch_process_outbound_queue

        # Tek batch (20) yerine kuyruğu boşalt: kampanyanın kalanı cron'a kalmasın.
        transaction.on_commit(
            lambda: dispatch_process_outbound_queue(drain=True, background=True),
        )
        return locked

    @transaction.atomic
    def cancel(self, campaign: OutboundCampaign) -> OutboundCampaign:
        if campaign.status in (CampaignStatus.COMPLETED, CampaignStatus.CANCELLED):
            raise ValidationError('Bu kampanya iptal edilemez.')

        cancelled = OutboundQueueRepository.cancel_pending_for_campaign(campaign)
        campaign.status = CampaignStatus.CANCELLED
        campaign.save(update_fields=['status', 'updated_at'])
        campaign.refresh_from_db()
        return campaign

    @transaction.atomic
    def retry_failed(self, campaign: OutboundCampaign) -> dict:
        if campaign.status == CampaignStatus.CANCELLED:
            raise ValidationError('İptal edilmiş kampanya yeniden denenemez.')

        retried = OutboundQueueRepository.retry_failed_for_campaign(campaign)
        if retried:
            campaign.status = CampaignStatus.QUEUED
            campaign.save(update_fields=['status', 'updated_at'])
            from apps.communication.application.celery_dispatch import dispatch_process_outbound_queue

            dispatch_process_outbound_queue(drain=True, background=True)
        return {'retried_count': retried}

    def _validate_audience_scope(self, kurum_id: int, audience_filter: dict, user) -> None:
        from apps.communication.application.coach_scope import is_coach_bulk_user

        if not user or not user.is_authenticated:
            return
        if not is_coach_bulk_user(user):
            return

        allowed = scoped_student_ids(user)
        if allowed is None:
            return
        if not allowed:
            raise PermissionDenied('Toplu gönderim için yetkiniz yok.')

        audience_type = audience_filter.get('audience_type', '')
        if audience_type not in (
            'coach_students', 'coach_parents', 'custom_ids', 'filtered', 'query',
        ):
            raise PermissionDenied('Koç yalnızca kendi öğrenci/veli kitlesine gönderebilir.')

        ogrenci_ids = audience_filter.get('ogrenci_ids') or []
        for oid in ogrenci_ids:
            if int(oid) not in allowed:
                raise PermissionDenied('Seçilen alıcılar koç kapsamının dışında.')

        veli_ids = audience_filter.get('veli_ids') or []
        if veli_ids:
            from apps.ogrenci.domain.models import OgrenciVeli

            for vid in veli_ids:
                veli = OgrenciVeli.objects.filter(id=vid, ogrenci__kurum_id=kurum_id).first()
                if veli and veli.ogrenci_id not in allowed:
                    raise PermissionDenied('Seçilen alıcılar koç kapsamının dışında.')


class CampaignStatsService:
    """Webhook durum güncellemelerinde kampanya sayaçları."""

    STATUS_COUNT_FIELD = {
        MessageStatus.SENT: 'sent_count',
        MessageStatus.DELIVERED: 'delivered_count',
        MessageStatus.READ: 'read_count',
        MessageStatus.FAILED: 'failed_count',
    }

    @classmethod
    def refresh_campaign_stats(cls, campaign_id) -> None:
        from apps.communication.domain.models import Message

        campaign = OutboundCampaign.objects.filter(id=campaign_id).first()
        if not campaign:
            return

        msgs = Message.objects.filter(campaign_id=campaign_id, direction=MessageDirection.OUTBOUND)
        sent = msgs.filter(status__in=[
            MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ,
        ]).count()
        delivered = msgs.filter(status__in=[MessageStatus.DELIVERED, MessageStatus.READ]).count()
        read = msgs.filter(status=MessageStatus.READ).count()
        failed = msgs.filter(status=MessageStatus.FAILED).count()
        pending = msgs.filter(status__in=[
            MessageStatus.PENDING, MessageStatus.SENDING,
        ]).count()
        cancelled = msgs.filter(status=MessageStatus.CANCELLED).count()

        replied = Message.objects.filter(
            conversation_id__in=msgs.values_list('conversation_id', flat=True),
            direction=MessageDirection.INBOUND,
            created_at__gte=campaign.created_at,
        ).values('conversation_id').distinct().count()

        campaign.sent_count = sent
        campaign.delivered_count = delivered
        campaign.read_count = read
        campaign.failed_count = failed
        campaign.replied_count = replied
        campaign.save(update_fields=[
            'sent_count', 'delivered_count', 'read_count', 'failed_count',
            'replied_count', 'updated_at',
        ])

        cls._update_campaign_status(campaign, pending, failed, cancelled)
        cls._update_template_stats(campaign_id)

    @classmethod
    def _update_template_stats(cls, campaign_id) -> None:
        from apps.communication.domain.models import Message
        from apps.communication.application.template_service import TemplateService

        campaign = OutboundCampaign.objects.filter(id=campaign_id).select_related('template').first()
        if not campaign or not campaign.template_id:
            return

        msgs = Message.objects.filter(
            campaign_id=campaign_id,
            direction=MessageDirection.OUTBOUND,
        ).order_by('-updated_at')[:1]
        for msg in msgs:
            TemplateService.update_stats_on_message_status(msg, msg.status)

    @classmethod
    def _update_campaign_status(
        cls,
        campaign: OutboundCampaign,
        pending: int,
        failed: int,
        cancelled: int,
    ) -> None:
        if campaign.status == CampaignStatus.CANCELLED:
            return

        total = campaign.total_recipients or 0
        done = total - pending

        if pending > 0 and campaign.status in (CampaignStatus.QUEUED, CampaignStatus.CONFIRMED):
            campaign.status = CampaignStatus.PROCESSING
            campaign.save(update_fields=['status', 'updated_at'])
            return

        if pending > 0:
            return

        if done == 0:
            return

        if failed > 0 and (done - failed - cancelled) > 0:
            new_status = CampaignStatus.PARTIAL
        elif failed > 0:
            new_status = CampaignStatus.PARTIAL
        else:
            new_status = CampaignStatus.COMPLETED

        if campaign.status != new_status:
            campaign.status = new_status
            campaign.save(update_fields=['status', 'updated_at'])
