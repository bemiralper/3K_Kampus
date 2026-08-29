"""Hafta içi / hafta sonu grup çözümü (şube ayarı + öğrenci override)."""
from __future__ import annotations

from ..models.exam import ExamSessionModel
from ..models.roster import (
    OlcmeOgrenciOturumTercihi,
    OlcmeSeviyeOturumAyar,
    ScheduleGroup,
)

HAFTA_ICI = ScheduleGroup.HAFTA_ICI
HAFTA_SONU = ScheduleGroup.HAFTA_SONU
FARKETMEZ = ExamSessionModel.SchedulePreference.FARKETMEZ


def is_mezun_seviye(seviye) -> bool:
    if seviye is None:
        return False
    kod = (getattr(seviye, 'kod', None) or '').strip().casefold()
    ad = (getattr(seviye, 'ad', None) or '').strip().casefold()
    return kod == 'mezun' or 'mezun' in ad


def default_preference_for_seviye(seviye) -> str:
    return HAFTA_SONU if is_mezun_seviye(seviye) else HAFTA_ICI


def catalog_seviyeler(sube_id: int):
    """Eğitim Tanımları → Sınıf Seviyeleri (aynı şube kataloğu)."""
    from apps.egitim_tanimlari.application.service import SinifSeviyesiService

    rows = list(SinifSeviyesiService().get_all_sinif_seviyeleri(sube_id))
    rows.sort(key=lambda s: (s.sira or 0, (s.ad or '').casefold(), s.id))
    return rows


def ensure_seviye_defaults(sube_id: int) -> list[OlcmeSeviyeOturumAyar]:
    seviyeler = catalog_seviyeler(sube_id)
    existing = {
        a.sinif_seviyesi_id: a
        for a in OlcmeSeviyeOturumAyar.objects.filter(sube_id=sube_id)
    }
    created = []
    for sev in seviyeler:
        if sev.id in existing:
            continue
        created.append(OlcmeSeviyeOturumAyar(
            sube_id=sube_id,
            sinif_seviyesi=sev,
            preference=default_preference_for_seviye(sev),
        ))
    if created:
        OlcmeSeviyeOturumAyar.objects.bulk_create(created)
        existing = {
            a.sinif_seviyesi_id: a
            for a in OlcmeSeviyeOturumAyar.objects.filter(sube_id=sube_id)
        }
    return [existing[s.id] for s in seviyeler if s.id in existing]


def seviye_default_map(sube_id: int) -> dict[int, str]:
    ensure_seviye_defaults(sube_id)
    return dict(
        OlcmeSeviyeOturumAyar.objects.filter(sube_id=sube_id)
        .values_list('sinif_seviyesi_id', 'preference')
    )


def override_map(sube_id: int, egitim_yili_id: int | None, student_ids: list[int]) -> dict[int, str]:
    if not student_ids or not egitim_yili_id:
        return {}
    return dict(
        OlcmeOgrenciOturumTercihi.objects.filter(
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            ogrenci_id__in=student_ids,
        ).values_list('ogrenci_id', 'preference')
    )


def resolve_student_groups(
    *,
    sube_id: int,
    egitim_yili_id: int | None,
    student_seviye_ids: dict[int, int | None],
) -> dict[int, str]:
    """Öğrenci id → HAFTA_ICI | HAFTA_SONU."""
    defaults = seviye_default_map(sube_id)
    overrides = override_map(sube_id, egitim_yili_id, list(student_seviye_ids))
    out: dict[int, str] = {}
    for sid, sev_id in student_seviye_ids.items():
        if sid in overrides:
            out[sid] = overrides[sid]
        elif sev_id and sev_id in defaults:
            out[sid] = defaults[sev_id]
        else:
            out[sid] = HAFTA_ICI
    return out


def student_matches_session(group: str, session_preference: str | None) -> bool:
    pref = (session_preference or FARKETMEZ).strip() or FARKETMEZ
    if pref == FARKETMEZ:
        return True
    return group == pref


def attach_groups_to_candidates(candidates, *, sube_id: int, egitim_yili_id: int | None) -> dict[int, str]:
    mapping = resolve_student_groups(
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
        student_seviye_ids={c.student_id: c.sinif_seviyesi_id for c in candidates},
    )
    for rec in candidates:
        rec.schedule_group = mapping.get(rec.student_id, HAFTA_ICI)
    return mapping
