"""
Elle ders programı yerleştirme — hücre doldur / temizle / yer değiştir.
"""
from __future__ import annotations

from typing import Optional, Tuple

from django.db import transaction

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.interfaces.repositories.class_lesson_teacher_assignment_repository import (
    ClassLessonTeacherAssignmentRepository,
)
from apps.personel.domain.models import Personel


class ManualPlacementError(Exception):
    def __init__(self, message: str, field: Optional[str] = None):
        self.message = message
        self.field = field
        super().__init__(message)


def _assert_writable(cell: ProgramGridCell) -> None:
    version = cell.schedule_version
    if not version:
        raise ManualPlacementError(
            'Hücre bir programa bağlı değil. Önce dönem ve çalışma takvimi seçin.',
            'schedule_version',
        )
    if version.is_locked:
        raise ManualPlacementError('Program kilitli; hücre değiştirilemez.', 'version')
    if version.term_id and getattr(version.term, 'schedule_locked', False):
        raise ManualPlacementError('Dönem programı kilitli; hücre değiştirilemez.', 'term')
    if cell.status == CellStatus.LOCKED:
        raise ManualPlacementError('Hücre kilitli.', 'status')
    if cell.status in (CellStatus.HOLIDAY, CellStatus.EXAM, CellStatus.BLOCKED):
        raise ManualPlacementError(
            f'Bu hücre durumu ({cell.get_status_display()}) değiştirilemez.',
            'status',
        )


def _resolve_teacher(plan: ClassLessonPlan, ogretmen_id: Optional[int]) -> Personel:
    if ogretmen_id:
        try:
            teacher = Personel.objects.get(pk=ogretmen_id, aktif_mi=True)
        except Personel.DoesNotExist:
            raise ManualPlacementError('Öğretmen bulunamadı.', 'ogretmen_id')
        return teacher

    # Birincil kaynak: Sınıf Ders Planı öğretmeni
    if plan.ogretmen_id:
        return plan.ogretmen

    # Geriye uyumluluk: eski PRIMARY atama kaydı varsa kullan
    primary = ClassLessonTeacherAssignmentRepository.get_primary_teacher(plan.id)
    if primary:
        return primary.ogretmen

    raise ManualPlacementError(
        'Bu ders için Sınıf Ders Planları’nda öğretmen seçin.',
        'ogretmen_id',
    )


def _check_teacher_conflict(cell: ProgramGridCell, teacher: Personel) -> None:
    conflict = ProgramGridCell.objects.filter(
        schedule_version_id=cell.schedule_version_id,
        weekly_day_id=cell.weekly_day_id,
        timeslot_id=cell.timeslot_id,
        ogretmen_id=teacher.id,
        status=CellStatus.FILLED,
        is_active=True,
    ).exclude(pk=cell.pk).select_related('sinif').first()
    if conflict:
        sinif_ad = conflict.sinif.ad if conflict.sinif_id else '?'
        raise ManualPlacementError(
            f'Öğretmen aynı saatte başka sınıfta ({sinif_ad}) dolu.',
            'ogretmen_id',
        )


def fill_cell(
    *,
    cell_id: int,
    class_lesson_plan_id: int,
    ogretmen_id: Optional[int] = None,
    notes: Optional[str] = None,
) -> ProgramGridCell:
    try:
        cell = ProgramGridCell.objects.select_related(
            'schedule_version', 'schedule_version__term', 'sinif', 'weekly_day', 'timeslot',
        ).get(pk=cell_id, is_active=True)
    except ProgramGridCell.DoesNotExist:
        raise ManualPlacementError('Hücre bulunamadı.', 'cell_id')

    _assert_writable(cell)

    try:
        plan = ClassLessonPlan.objects.select_related(
            'ders', 'ogretmen', 'sinif', 'term',
        ).get(pk=class_lesson_plan_id, is_active=True)
    except ClassLessonPlan.DoesNotExist:
        raise ManualPlacementError('Sınıf ders planı bulunamadı.', 'class_lesson_plan_id')

    if not cell.sinif_id:
        raise ManualPlacementError('Hücre bir sınıfa bağlı değil.', 'sinif')
    if plan.sinif_id != cell.sinif_id:
        raise ManualPlacementError('Plan, hücrenin sınıfına ait değil.', 'class_lesson_plan_id')
    if cell.schedule_version and plan.term_id != cell.schedule_version.term_id:
        raise ManualPlacementError('Plan, programın dönemine ait değil.', 'class_lesson_plan_id')

    teacher = _resolve_teacher(plan, ogretmen_id)
    _check_teacher_conflict(cell, teacher)

    # Haftalık saat limiti: aynı plan bu versiyon+sınıfta weekly_hours'ı aşamaz
    if cell.schedule_version_id and cell.sinif_id:
        placed_qs = ProgramGridCell.objects.filter(
            schedule_version_id=cell.schedule_version_id,
            sinif_id=cell.sinif_id,
            class_lesson_plan_id=plan.id,
            status=CellStatus.FILLED,
            is_active=True,
        ).exclude(pk=cell.pk)
        # Üzerine yazılacak hücre zaten bu plana aitse sayaca eklenmez (exclude ile)
        placed_count = placed_qs.count()
        if placed_count >= plan.weekly_hours:
            raise ManualPlacementError(
                f'"{plan.ders.ad}" için haftalık {plan.weekly_hours} saat tamamlandı; '
                'fazla ders eklenemez.',
                'class_lesson_plan_id',
            )

    # Dolu hücreyi üzerine yazmadan önce temizle
    if cell.status == CellStatus.FILLED:
        cell.clear()
        cell.refresh_from_db()

    if not cell.is_available:
        raise ManualPlacementError('Hücre yerleştirme için müsait değil.', 'status')

    ok = cell.fill(
        ders=plan.ders,
        ogretmen=teacher,
        class_lesson_plan=plan,
        is_double_block_start=bool(plan.is_double_block),
    )
    if not ok:
        raise ManualPlacementError('Hücre doldurulamadı.', 'status')

    if notes is not None:
        cell.notes = notes
        cell.save(update_fields=['notes', 'updated_at'])

    try:
        from apps.academic.domain.schedule_change_log import ScheduleChangeAction
        from apps.academic.services.lesson_session_service import log_schedule_change
        log_schedule_change(
            action=ScheduleChangeAction.CELL_FILL,
            summary=f'Hücre dolduruldu · {plan.ders.ad}',
            detail={
                'cell_id': cell.id,
                'plan_id': plan.id,
                'sinif_id': cell.sinif_id,
                'teacher_id': teacher.id,
            },
            term=cell.schedule_version.term if cell.schedule_version_id else None,
            schedule_version=cell.schedule_version,
        )
    except Exception:
        pass

    return ProgramGridCell.objects.select_related(
        'ders', 'ogretmen', 'sinif', 'weekly_day', 'timeslot', 'class_lesson_plan',
    ).get(pk=cell.id)


def clear_cell(*, cell_id: int) -> ProgramGridCell:
    try:
        cell = ProgramGridCell.objects.select_related(
            'schedule_version', 'schedule_version__term',
        ).get(pk=cell_id, is_active=True)
    except ProgramGridCell.DoesNotExist:
        raise ManualPlacementError('Hücre bulunamadı.', 'cell_id')

    _assert_writable(cell)

    if cell.status == CellStatus.EMPTY:
        return cell

    ok = cell.clear()
    if not ok:
        raise ManualPlacementError('Hücre temizlenemedi.', 'status')

    try:
        from apps.academic.domain.schedule_change_log import ScheduleChangeAction
        from apps.academic.services.lesson_session_service import log_schedule_change
        log_schedule_change(
            action=ScheduleChangeAction.CELL_CLEAR,
            summary='Hücre temizlendi',
            detail={'cell_id': cell.id, 'sinif_id': cell.sinif_id},
            term=cell.schedule_version.term if cell.schedule_version_id else None,
            schedule_version=cell.schedule_version,
        )
    except Exception:
        pass

    return ProgramGridCell.objects.select_related(
        'ders', 'ogretmen', 'sinif', 'weekly_day', 'timeslot',
    ).get(pk=cell.id)


def _reload_cell(cell_id: int) -> ProgramGridCell:
    return ProgramGridCell.objects.select_related(
        'ders', 'ogretmen', 'sinif', 'weekly_day', 'timeslot', 'class_lesson_plan',
        'schedule_version', 'schedule_version__term',
    ).get(pk=cell_id)


@transaction.atomic
def swap_cells(*, source_cell_id: int, target_cell_id: int) -> Tuple[ProgramGridCell, ProgramGridCell]:
    """İki dolu hücredeki dersleri atomik olarak yer değiştir."""
    if source_cell_id == target_cell_id:
        raise ManualPlacementError('Aynı hücre seçildi.', 'cell_id')

    # Nullable FK select_related + FOR UPDATE Postgres'te hata verir; önce kilitle, sonra yükle
    locked_ids = list(
        ProgramGridCell.objects.select_for_update()
        .filter(pk__in=[source_cell_id, target_cell_id], is_active=True)
        .values_list('id', flat=True)
    )
    if len(locked_ids) != 2:
        raise ManualPlacementError('Hücre bulunamadı.', 'cell_id')

    cells = list(
        ProgramGridCell.objects.select_related(
            'schedule_version',
            'schedule_version__term',
            'sinif',
            'weekly_day',
            'timeslot',
            'class_lesson_plan',
            'class_lesson_plan__ders',
            'class_lesson_plan__ogretmen',
            'ders',
            'ogretmen',
        ).filter(pk__in=[source_cell_id, target_cell_id])
    )
    by_id = {c.id: c for c in cells}
    source = by_id[source_cell_id]
    target = by_id[target_cell_id]

    _assert_writable(source)
    _assert_writable(target)

    if source.status != CellStatus.FILLED or target.status != CellStatus.FILLED:
        raise ManualPlacementError(
            'Yer değiştirmek için her iki hücre de dolu olmalı.',
            'status',
        )
    if not source.class_lesson_plan_id or not target.class_lesson_plan_id:
        raise ManualPlacementError('Hücrelerde ders planı eksik.', 'class_lesson_plan_id')
    if source.sinif_id != target.sinif_id:
        raise ManualPlacementError('Sadece aynı sınıf içinde yer değiştirilebilir.', 'sinif')
    if source.schedule_version_id != target.schedule_version_id:
        raise ManualPlacementError('Hücreler aynı programda olmalı.', 'version')

    if source.class_lesson_plan_id == target.class_lesson_plan_id:
        return _reload_cell(source.id), _reload_cell(target.id)

    plan_a = source.class_lesson_plan
    plan_b = target.class_lesson_plan
    teacher_a = source.ogretmen or _resolve_teacher(plan_a, None)
    teacher_b = target.ogretmen or _resolve_teacher(plan_b, None)
    notes_a = source.notes
    notes_b = target.notes
    double_a = bool(source.is_double_block_start)
    double_b = bool(target.is_double_block_start)

    if not source.clear() or not target.clear():
        raise ManualPlacementError('Hücreler temizlenemedi.', 'status')

    source.refresh_from_db()
    target.refresh_from_db()

    # Temizlik sonrası çakışma / saat limiti (saf swap’te genelde geçer)
    _check_teacher_conflict(target, teacher_a)
    _check_teacher_conflict(source, teacher_b)

    if not target.fill(
        ders=plan_a.ders,
        ogretmen=teacher_a,
        class_lesson_plan=plan_a,
        is_double_block_start=double_a,
    ):
        raise ManualPlacementError('Hedef hücre doldurulamadı.', 'status')
    if notes_a is not None:
        target.notes = notes_a
        target.save(update_fields=['notes', 'updated_at'])

    if not source.fill(
        ders=plan_b.ders,
        ogretmen=teacher_b,
        class_lesson_plan=plan_b,
        is_double_block_start=double_b,
    ):
        raise ManualPlacementError('Kaynak hücre doldurulamadı.', 'status')
    if notes_b is not None:
        source.notes = notes_b
        source.save(update_fields=['notes', 'updated_at'])

    try:
        from apps.academic.domain.schedule_change_log import ScheduleChangeAction
        from apps.academic.services.lesson_session_service import log_schedule_change
        log_schedule_change(
            action=ScheduleChangeAction.CELL_FILL,
            summary=f'Hücreler yer değiştirdi · {plan_a.ders.ad} ↔ {plan_b.ders.ad}',
            detail={
                'source_cell_id': source_cell_id,
                'target_cell_id': target_cell_id,
                'plan_a_id': plan_a.id,
                'plan_b_id': plan_b.id,
            },
            term=source.schedule_version.term if source.schedule_version_id else None,
            schedule_version=source.schedule_version,
        )
    except Exception:
        pass

    return _reload_cell(source.id), _reload_cell(target.id)
