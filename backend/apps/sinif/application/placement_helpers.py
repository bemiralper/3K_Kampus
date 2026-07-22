"""Dönem bazlı sınıf yerleşimi — StudentClassPlacement + OgrenciKayit senkronu."""

from __future__ import annotations

from django.db.models import Q

from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.academic.services.active_academic_year import get_active_academic_year
from apps.academic.services.student_class_placement_service import StudentClassPlacementService
from apps.ogrenci.domain.models import OgrenciKayit
from apps.sinif.domain.models import Sinif


def placement_counts_for_term(term_id: int, sinif_ids: list[int]) -> dict[int, int]:
    if not sinif_ids:
        return {}
    active_year = get_active_academic_year()
    counts: dict[int, int] = {sid: 0 for sid in sinif_ids}
    for classroom_id in StudentClassPlacement.objects.filter(
        academic_year=active_year,
        term_id=term_id,
        classroom_id__in=sinif_ids,
        is_active=True,
    ).values_list('classroom_id', flat=True):
        counts[classroom_id] = counts.get(classroom_id, 0) + 1
    return counts


def students_placed_in_term(term_id: int) -> set[int]:
    active_year = get_active_academic_year()
    return set(
        StudentClassPlacement.objects.filter(
            academic_year=active_year,
            term_id=term_id,
            is_active=True,
        ).values_list('student_id', flat=True)
    )


def _base_kayitlar_query(
    *,
    kurum_id: int,
    sube_id: int,
    egitim_yili_id: int,
    sinif_seviyesi_id: int,
):
    kayitlar = (
        OgrenciKayit.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            aktif_mi=True,
            ogrenci__aktif_mi=True,
        )
        .select_related(
            'ogrenci',
            'sinif_seviyesi',
            'sinif',
            'sinif__sinif_seviyesi',
            'alan',
        )
        .order_by('ogrenci__ad', 'ogrenci__soyad')
    )
    if sinif_seviyesi_id:
        kayitlar = kayitlar.filter(
            Q(sinif_seviyesi_id=sinif_seviyesi_id)
            | Q(sinif__sinif_seviyesi_id=sinif_seviyesi_id)
        )
    return kayitlar


def term_placement_map(term_id: int) -> dict[int, dict]:
    """student_id -> { id, ad } sınıf yerleşimi (aktif dönem)."""
    active_year = get_active_academic_year()
    rows = StudentClassPlacement.objects.filter(
        academic_year=active_year,
        term_id=term_id,
        is_active=True,
    ).select_related('classroom')
    return {
        row.student_id: {'id': row.classroom_id, 'ad': row.classroom.ad}
        for row in rows
    }


def list_roster_students(
    *,
    kurum_id: int,
    sube_id: int,
    egitim_yili_id: int,
    sinif_seviyesi_id: int,
    term_id: int,
    target_sinif_id: int,
) -> list[dict]:
    """Aynı seviyedeki tüm öğrenciler — dönem yerleşimi ve alan bilgisiyle."""
    placements = term_placement_map(term_id)
    kayitlar = _base_kayitlar_query(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
        sinif_seviyesi_id=sinif_seviyesi_id,
    )

    result: list[dict] = []
    for kayit in kayitlar:
        o = kayit.ogrenci
        yerlesim = placements.get(o.id)
        bu_sinifta = bool(yerlesim and yerlesim['id'] == target_sinif_id)
        result.append({
            'id': o.id,
            'ad': o.ad,
            'soyad': o.soyad,
            'tam_ad': o.tam_ad,
            'okul_no': kayit.okul_no or '',
            'alan': (
                {'id': kayit.alan_id, 'ad': kayit.alan.ad}
                if kayit.alan_id and kayit.alan
                else None
            ),
            'sinif_yerlesim': yerlesim,
            'bu_sinifta': bu_sinifta,
        })

    def sort_key(row: dict) -> tuple:
        if row['bu_sinifta']:
            return (0, row['tam_ad'])
        if row['sinif_yerlesim']:
            return (1, row['tam_ad'])
        return (2, row['tam_ad'])

    result.sort(key=sort_key)
    return result


def list_unassigned_students(
    *,
    kurum_id: int,
    sube_id: int,
    egitim_yili_id: int,
    sinif_seviyesi_id: int,
    term_id: int,
) -> list[dict]:
    """Geriye dönük uyumluluk — yalnızca yerleşimsiz öğrenciler."""
    placed = students_placed_in_term(term_id)
    return [
        row for row in list_roster_students(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            sinif_seviyesi_id=sinif_seviyesi_id,
            term_id=term_id,
            target_sinif_id=-1,
        )
        if row['id'] not in placed
    ]


def clear_kayit_sinif(student_ids: list[int], classroom: Sinif) -> None:
    if not student_ids:
        return
    OgrenciKayit.objects.filter(
        ogrenci_id__in=student_ids,
        egitim_yili_id=classroom.egitim_yili_id,
        sube_id=classroom.sube_id,
        kurum_id=classroom.kurum_id,
        aktif_mi=True,
        sinif_id=classroom.id,
    ).update(sinif_id=None)


def sync_kayit_sinif_from_placement(student_ids: list[int], classroom: Sinif) -> None:
    """Geriye dönük uyumluluk: aktif kayıt sınıfını güncel yerleşime yansıt."""
    if not student_ids:
        return
    OgrenciKayit.objects.filter(
        ogrenci_id__in=student_ids,
        egitim_yili_id=classroom.egitim_yili_id,
        sube_id=classroom.sube_id,
        kurum_id=classroom.kurum_id,
        aktif_mi=True,
    ).update(sinif_id=classroom.id)


def assign_students_to_sinif(
    *,
    sinif: Sinif,
    term_id: int,
    student_ids: list[int],
) -> dict:
    service = StudentClassPlacementService()
    result = service.bulk_assign(
        term_id=term_id,
        classroom_id=sinif.id,
        student_ids=student_ids,
    )
    assigned_ids = []
    for pid in result.created + result.updated:
        try:
            p = StudentClassPlacement.objects.get(pk=pid)
            assigned_ids.append(p.student_id)
        except StudentClassPlacement.DoesNotExist:
            pass
    sync_kayit_sinif_from_placement(assigned_ids, sinif)
    return {
        'created': result.created,
        'updated': result.updated,
        'skipped': [{'student_id': s[0], 'reason': s[1]} for s in result.skipped],
        'errors': [{'student_id': e[0], 'reason': e[1]} for e in result.errors],
    }


def remove_students_from_sinif(
    *,
    sinif: Sinif,
    term_id: int,
    student_ids: list[int],
) -> dict:
    service = StudentClassPlacementService()
    removed: list[int] = []
    skipped: list[dict] = []

    for student_id in student_ids:
        existing = service.repository.get_existing_placement(term_id, student_id)
        if not existing:
            skipped.append({'student_id': student_id, 'reason': 'Yerleşim bulunamadı'})
            continue
        if existing.classroom_id != sinif.id:
            skipped.append({'student_id': student_id, 'reason': 'Öğrenci bu sınıfta değil'})
            continue
        service.delete(existing.id)
        removed.append(student_id)

    clear_kayit_sinif(removed, sinif)
    mevcutluk = placement_counts_for_term(term_id, [sinif.id]).get(sinif.id, 0)
    return {'removed': removed, 'skipped': skipped, 'mevcutluk': mevcutluk}


def get_student_term_classroom(*, student_id: int, term_id: int) -> Sinif | None:
    active_year = get_active_academic_year()
    placement = (
        StudentClassPlacement.objects.filter(
            academic_year=active_year,
            term_id=term_id,
            student_id=student_id,
            is_active=True,
        )
        .select_related('classroom')
        .first()
    )
    return placement.classroom if placement else None
