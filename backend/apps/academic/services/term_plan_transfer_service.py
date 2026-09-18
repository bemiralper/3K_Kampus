"""
Yanlış döneme girilmiş sınıf + ders planı + programı başka döneme kopyala/taşı.

Tanımlar (ders saatleri, çalışma takvimi, öğretmen uygunluğu) şube bazlıdır;
yıl/dönem değişince yeniden oluşturulmaz.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from django.db import transaction

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.class_lesson_teacher_assignment import ClassLessonTeacherAssignment
from apps.academic.domain.classroom_group import ClassroomGroup
from apps.academic.domain.program_grid_cell import ProgramGridCell
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.kurum.domain.models import Kurum
from apps.sinif.domain.models import Sinif
from apps.term.domain.models import Term


class TermPlanTransferError(Exception):
    pass


PLAN_FIELDS = (
    'ders_id',
    'ogretmen_id',
    'weekly_hours',
    'credit',
    'is_mandatory',
    'is_double_block',
    'priority',
    'preferred_room_type',
    'gorunen_ad',
    'notes',
    'is_active',
)

CELL_FIELDS = (
    'schedule_template_id',
    'weekly_cycle_id',
    'weekly_day_id',
    'timeslot_id',
    'ders_id',
    'ogretmen_id',
    'is_double_block_start',
    'status',
    'notes',
    'is_active',
)


@dataclass
class TransferReport:
    mode: str
    dry_run: bool
    source_term_id: int
    target_term_id: int
    classrooms_copied: int = 0
    classrooms_moved: int = 0
    classrooms_skipped: int = 0
    groups_copied: int = 0
    plans_copied: int = 0
    plans_moved: int = 0
    assignments_copied: int = 0
    versions_copied: int = 0
    versions_moved: int = 0
    cells_copied: int = 0
    skipped: List[str] = field(default_factory=list)
    created_classroom_ids: List[int] = field(default_factory=list)

    def as_dict(self) -> Dict[str, Any]:
        return {
            'mode': self.mode,
            'dry_run': self.dry_run,
            'source_term_id': self.source_term_id,
            'target_term_id': self.target_term_id,
            'classrooms_copied': self.classrooms_copied,
            'classrooms_moved': self.classrooms_moved,
            'classrooms_skipped': self.classrooms_skipped,
            'groups_copied': self.groups_copied,
            'plans_copied': self.plans_copied,
            'plans_moved': self.plans_moved,
            'assignments_copied': self.assignments_copied,
            'versions_copied': self.versions_copied,
            'versions_moved': self.versions_moved,
            'cells_copied': self.cells_copied,
            'skipped': self.skipped,
            'created_classroom_ids': self.created_classroom_ids,
        }


def list_academic_inventory(kurum_query: str = '') -> List[Dict[str, Any]]:
    """Kurum / yıl / dönem ve kayıt sayıları — canlıda doğru ID seçmek için."""
    kurums = Kurum.objects.all().order_by('ad')
    if kurum_query:
        kurums = kurums.filter(ad__icontains=kurum_query) | Kurum.objects.filter(
            kod__icontains=kurum_query,
        )
        kurums = kurums.distinct().order_by('ad')

    rows: List[Dict[str, Any]] = []
    for kurum in kurums:
        terms = (
            Term.objects.filter(kurum=kurum)
            .select_related('egitim_yili', 'sube')
            .order_by('egitim_yili__baslangic_yil', 'sube__ad', 'order_no', 'start_date')
        )
        for term in terms:
            class_qs = Sinif.objects.filter(
                kurum=kurum, sube_id=term.sube_id, term_id=term.id, aktif_mi=True,
            )
            plan_qs = ClassLessonPlan.objects.filter(term_id=term.id, is_active=True)
            version_qs = ScheduleVersion.objects.filter(term_id=term.id)
            cell_qs = ProgramGridCell.objects.filter(
                schedule_version__term_id=term.id, is_active=True,
            )
            rows.append({
                'kurum_id': kurum.id,
                'kurum_ad': kurum.ad,
                'kurum_kod': kurum.kod,
                'sube_id': term.sube_id,
                'sube_ad': term.sube.ad if term.sube_id else '',
                'year_id': term.egitim_yili_id,
                'year': term.egitim_yili.yil_str,
                'term_id': term.id,
                'term_name': term.name,
                'term_code': term.code,
                'term_type': term.term_type,
                'is_active': term.is_active,
                'classrooms': class_qs.count(),
                'plans': plan_qs.count(),
                'versions': version_qs.count(),
                'cells': cell_qs.count(),
                'filled_cells': cell_qs.filter(status='FILLED').count(),
            })
    return rows


def resolve_term(
    *,
    term_id: Optional[int] = None,
    kurum_id: Optional[int] = None,
    year_start: Optional[int] = None,
    term_name: Optional[str] = None,
    term_code: Optional[str] = None,
    term_type: Optional[str] = None,
) -> Term:
    if term_id:
        try:
            return Term.objects.select_related('egitim_yili', 'kurum', 'sube').get(pk=term_id)
        except Term.DoesNotExist as exc:
            raise TermPlanTransferError(f'Dönem bulunamadı: {term_id}') from exc

    qs = Term.objects.select_related('egitim_yili', 'kurum', 'sube')
    if kurum_id:
        qs = qs.filter(kurum_id=kurum_id)
    if year_start:
        qs = qs.filter(egitim_yili__baslangic_yil=year_start)
    if term_name:
        qs = qs.filter(name__icontains=term_name)
    if term_code:
        qs = qs.filter(code__iexact=term_code)
    if term_type:
        qs = qs.filter(term_type=term_type)
    matches = list(qs.order_by('id'))
    if not matches:
        raise TermPlanTransferError('Dönem bulunamadı. --list ile ID bakın.')
    if len(matches) > 1:
        summary = ', '.join(
            f'{t.id}:{t.kurum.ad}/{t.sube.ad}/{t.egitim_yili.yil_str}/{t.name}'
            for t in matches[:8]
        )
        raise TermPlanTransferError(
            f'Birden fazla dönem eşleşti ({len(matches)}). --from-term-id / --to-term-id kullanın: {summary}'
        )
    return matches[0]


def transfer_term_plans(
    *,
    source_term: Term,
    target_term: Term,
    mode: str = 'copy',
    include_program: bool = True,
    include_students: bool = False,
    dry_run: bool = True,
) -> TransferReport:
    if mode not in ('copy', 'move'):
        raise TermPlanTransferError("mode 'copy' veya 'move' olmalı.")
    if source_term.id == target_term.id:
        raise TermPlanTransferError('Kaynak ve hedef dönem aynı.')
    if source_term.kurum_id != target_term.kurum_id:
        raise TermPlanTransferError('Kaynak ve hedef dönem aynı kurumda olmalı.')
    if source_term.sube_id != target_term.sube_id:
        raise TermPlanTransferError('Kaynak ve hedef dönem aynı şubede olmalı.')
    if target_term.schedule_locked:
        raise TermPlanTransferError('Hedef dönemin programı kilitli.')

    report = TransferReport(
        mode=mode,
        dry_run=dry_run,
        source_term_id=source_term.id,
        target_term_id=target_term.id,
    )
    if dry_run:
        _apply_transfer(
            source_term, target_term, mode, include_program, include_students, report,
        )
        return report

    with transaction.atomic():
        _apply_transfer(
            source_term, target_term, mode, include_program, include_students, report,
        )
    return report


def _source_classrooms(source_term: Term):
    return list(
        Sinif.objects.filter(
            kurum_id=source_term.kurum_id,
            sube_id=source_term.sube_id,
            term_id=source_term.id,
            aktif_mi=True,
        ).order_by('ad')
    )


def _apply_transfer(
    source_term: Term,
    target_term: Term,
    mode: str,
    include_program: bool,
    include_students: bool,
    report: TransferReport,
) -> None:
    classrooms = _source_classrooms(source_term)
    if not classrooms:
        report.skipped.append('Kaynak dönemde aktif sınıf yok.')
        return

    if mode == 'move':
        _move(
            source_term, target_term, classrooms,
            include_program, include_students, report,
        )
        return
    _copy(
        source_term, target_term, classrooms,
        include_program, include_students, report,
    )


def _move(
    source_term: Term,
    target_term: Term,
    classrooms: List[Sinif],
    include_program: bool,
    include_students: bool,
    report: TransferReport,
) -> None:
    target_year = target_term.egitim_yili
    existing_names = set(
        Sinif.objects.filter(
            kurum_id=target_term.kurum_id,
            sube_id=target_term.sube_id,
            egitim_yili=target_year,
            term_id=target_term.id,
            aktif_mi=True,
        ).values_list('ad', flat=True)
    )
    colliding = [c.ad for c in classrooms if c.ad in existing_names]
    if colliding:
        raise TermPlanTransferError(
            'Hedefte aynı adlı sınıf var, taşıma yapılamaz: ' + ', '.join(colliding)
        )
    if not include_students:
        placed = StudentClassPlacement.objects.filter(
            term_id=source_term.id,
            classroom_id__in=[c.id for c in classrooms],
        ).count()
        if placed:
            report.skipped.append(
                f'{placed} öğrenci yerleşimi kaynak dönemde kaldı (--include-students ile taşınır).'
            )

    if report.dry_run:
        report.classrooms_moved = len(classrooms)
        report.plans_moved = ClassLessonPlan.objects.filter(
            term_id=source_term.id, sinif_id__in=[c.id for c in classrooms],
        ).count()
        if include_program:
            report.versions_moved = ScheduleVersion.objects.filter(term_id=source_term.id).count()
        return

    ids = [c.id for c in classrooms]
    Sinif.objects.filter(id__in=ids).update(
        egitim_yili=target_year, term=target_term,
    )
    report.classrooms_moved = len(ids)

    plans = ClassLessonPlan.objects.filter(term_id=source_term.id, sinif_id__in=ids)
    report.plans_moved = plans.update(egitim_yili=target_year, term=target_term)
    ClassLessonTeacherAssignment.objects.filter(
        class_lesson_plan_id__in=plans.values_list('id', flat=True),
    ).update(egitim_yili=target_year)

    if include_students:
        StudentClassPlacement.objects.filter(
            term_id=source_term.id, classroom_id__in=ids,
        ).update(academic_year=target_year, term=target_term)

    if include_program:
        versions = ScheduleVersion.objects.filter(term_id=source_term.id)
        report.versions_moved = versions.update(
            egitim_yili=target_year, term=target_term,
        )


def _copy(
    source_term: Term,
    target_term: Term,
    classrooms: List[Sinif],
    include_program: bool,
    include_students: bool,
    report: TransferReport,
) -> None:
    target_year = target_term.egitim_yili
    existing_by_name = {
        s.ad: s
        for s in Sinif.objects.filter(
            kurum_id=target_term.kurum_id,
            sube_id=target_term.sube_id,
            egitim_yili=target_year,
            term_id=target_term.id,
            aktif_mi=True,
        )
    }
    classroom_map: Dict[int, int] = {}

    for src in classrooms:
        existing = existing_by_name.get(src.ad)
        if existing:
            classroom_map[src.id] = existing.id
            report.classrooms_skipped += 1
            report.skipped.append(f'Sınıf atlandı (hedeften mevcut): {src.ad}')
            continue
        if report.dry_run:
            classroom_map[src.id] = src.id
            report.classrooms_copied += 1
            continue
        clone = Sinif.objects.create(
            kurum_id=src.kurum_id,
            sube_id=src.sube_id,
            egitim_yili=target_year,
            term=target_term,
            ad=src.ad,
            kod=src.kod,
            oda_id=src.oda_id,
            sinif_seviyesi_id=src.sinif_seviyesi_id,
            alan_id=src.alan_id,
            kapasite=src.kapasite,
            aktif_mi=True,
        )
        classroom_map[src.id] = clone.id
        report.created_classroom_ids.append(clone.id)
        report.classrooms_copied += 1
        for group in ClassroomGroup.objects.filter(classroom_id=src.id, is_active=True):
            ClassroomGroup.objects.create(
                classroom=clone,
                name=group.name,
                capacity=group.capacity,
                is_active=True,
            )
            report.groups_copied += 1

    if report.dry_run:
        report.groups_copied = ClassroomGroup.objects.filter(
            classroom_id__in=[c.id for c in classrooms], is_active=True,
        ).count()

    plan_map: Dict[int, int] = {}
    source_plans = list(
        ClassLessonPlan.objects.filter(
            term_id=source_term.id,
            sinif_id__in=[c.id for c in classrooms],
            is_active=True,
        )
    )
    for src in source_plans:
        target_sinif_id = classroom_map.get(src.sinif_id)
        if not target_sinif_id:
            continue
        if report.dry_run:
            report.plans_copied += 1
            continue
        dup = ClassLessonPlan.objects.filter(
            is_active=True,
            term_id=target_term.id,
            sinif_id=target_sinif_id,
            ders_id=src.ders_id,
        ).first()
        if dup:
            plan_map[src.id] = dup.id
            report.skipped.append(
                f'Plan atlandı: {src.sinif.ad} / {src.ders_id}'
            )
            continue
        data = {field: getattr(src, field) for field in PLAN_FIELDS}
        clone = ClassLessonPlan(
            egitim_yili=target_year,
            term=target_term,
            sinif_id=target_sinif_id,
            **data,
        )
        clone.save()
        plan_map[src.id] = clone.id
        report.plans_copied += 1
        for asg in ClassLessonTeacherAssignment.objects.filter(
            class_lesson_plan_id=src.id, is_active=True,
        ):
            ClassLessonTeacherAssignment.objects.create(
                egitim_yili=target_year,
                class_lesson_plan=clone,
                ogretmen_id=asg.ogretmen_id,
                role=asg.role,
                priority=asg.priority,
                max_hours_for_class=asg.max_hours_for_class,
                notes=asg.notes,
                is_active=True,
            )
            report.assignments_copied += 1

    if report.dry_run:
        report.assignments_copied = ClassLessonTeacherAssignment.objects.filter(
            class_lesson_plan_id__in=[p.id for p in source_plans],
            is_active=True,
        ).count()

    if include_students and not report.dry_run:
        report.skipped.append('Öğrenci yerleşimi kopyalanmaz; --mode move --include-students kullanın.')

    if include_program:
        _copy_program(
            source_term, target_term, classroom_map, plan_map, report,
        )


def _copy_program(
    source_term: Term,
    target_term: Term,
    classroom_map: Dict[int, int],
    plan_map: Dict[int, int],
    report: TransferReport,
) -> None:
    versions = list(
        ScheduleVersion.objects.filter(term_id=source_term.id).order_by('id')
    )
    if report.dry_run:
        report.versions_copied = len(versions)
        report.cells_copied = ProgramGridCell.objects.filter(
            schedule_version__term_id=source_term.id,
            is_active=True,
            sinif_id__in=list(classroom_map.keys()),
        ).count()
        return

    for src_ver in versions:
        target_ver = ScheduleVersion.objects.filter(
            term_id=target_term.id,
            weekly_cycle_id=src_ver.weekly_cycle_id,
            schedule_template_id=src_ver.schedule_template_id,
        ).order_by('-is_active', '-id').first()
        if not target_ver:
            target_ver = ScheduleVersion.objects.create(
                egitim_yili=target_term.egitim_yili,
                term=target_term,
                schedule_template_id=src_ver.schedule_template_id,
                weekly_cycle_id=src_ver.weekly_cycle_id,
                name=src_ver.name,
                description=src_ver.description or '',
                is_active=True,
                is_locked=False,
            )
            report.versions_copied += 1

        cells = list(
            ProgramGridCell.objects.filter(
                schedule_version=src_ver,
                is_active=True,
                sinif_id__in=list(classroom_map.keys()),
            )
        )
        old_to_new: Dict[int, ProgramGridCell] = {}
        for cell in cells:
            new_sinif_id = classroom_map.get(cell.sinif_id)
            if not new_sinif_id:
                continue
            exists = ProgramGridCell.objects.filter(
                schedule_version=target_ver,
                weekly_day_id=cell.weekly_day_id,
                timeslot_id=cell.timeslot_id,
                sinif_id=new_sinif_id,
                is_active=True,
            ).exists()
            if exists:
                continue
            payload = {field: getattr(cell, field) for field in CELL_FIELDS}
            new_cell = ProgramGridCell.objects.create(
                schedule_version=target_ver,
                sinif_id=new_sinif_id,
                class_lesson_plan_id=plan_map.get(cell.class_lesson_plan_id),
                **payload,
            )
            old_to_new[cell.id] = new_cell
            report.cells_copied += 1

        for cell in cells:
            if not cell.double_block_partner_id:
                continue
            new_cell = old_to_new.get(cell.id)
            partner = old_to_new.get(cell.double_block_partner_id)
            if new_cell and partner:
                new_cell.double_block_partner = partner
                new_cell.save(update_fields=['double_block_partner'])
