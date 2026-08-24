"""
Grid Engine Service

Program Grid oluşturma servisi.
WeeklyDay × TimeSlot(LESSON türleri) = ProgramGridCell

BREAK slotları grid'e dahil edilmez, sadece LESSON slot_type grid hücresi üretir.
"""

from dataclasses import dataclass
from typing import List, Optional

from apps.academic.domain import (
    WeeklyCycle, 
    WeeklyDay, 
    TimeSlot, 
    ProgramGridCell,
    CellStatus,
    SlotType,
)


@dataclass
class GridCellPreview:
    """Grid hücresi önizleme verisi."""
    weekly_day_id: int
    weekly_day_name: str
    day_of_week: int
    timeslot_id: int
    timeslot_name: str
    start_time: str
    end_time: str
    order: int


@dataclass  
class GridPreviewResult:
    """Grid önizleme sonucu."""
    schedule_template_id: int
    schedule_template_name: str
    weekly_cycle_id: int
    weekly_cycle_name: str
    total_days: int
    total_slots: int
    total_cells: int
    cells: List[GridCellPreview]


@dataclass
class GridGenerateResult:
    """Grid oluşturma sonucu."""
    schedule_template_id: int
    weekly_cycle_id: int
    created_count: int
    skipped_count: int
    cells: List[ProgramGridCell]


@dataclass
class VersionGridEnsureResult:
    """Versiyon + sınıf için grid iskeleti sonucu."""
    schedule_version_id: int
    classroom_id: int
    created_count: int
    existing_count: int
    total_cells: int


class GridEngine:
    """
    Program Grid oluşturma motoru.
    
    WeeklyDay × (o güne ait TimeSlot LESSON) = ProgramGridCell.
    BREAK slotları dahil edilmez.
    Şablon önce gün satırından, yoksa cycle.schedule_template (legacy) alınır.
    """
    
    def __init__(self, weekly_cycle: WeeklyCycle, template_fallback=None):
        self.weekly_cycle = weekly_cycle
        self.template_fallback = template_fallback
        self.schedule_template = (
            weekly_cycle.primary_schedule_template()
            or template_fallback
        )
    
    def get_active_days(self) -> List[WeeklyDay]:
        """Aktif günleri getir."""
        return list(
            self.weekly_cycle.weekly_days
            .filter(is_active=True)
            .select_related('schedule_template')
            .order_by('order')
        )

    def resolve_day_template(self, day: WeeklyDay):
        """Günün ders saati şablonu (gün → cycle → primary/fallback)."""
        if day.schedule_template_id and day.schedule_template and day.schedule_template.is_active:
            return day.schedule_template
        cycle_tpl = self.weekly_cycle.schedule_template
        if cycle_tpl is not None and getattr(cycle_tpl, 'is_active', True):
            return cycle_tpl
        if self.schedule_template is not None and getattr(self.schedule_template, 'is_active', True):
            return self.schedule_template
        return self.template_fallback

    def get_lesson_slots_for_day(self, day: WeeklyDay) -> List[TimeSlot]:
        template = self.resolve_day_template(day)
        if not template:
            return []
        return list(
            TimeSlot.objects
            .filter(
                schedule_template=template,
                is_active=True,
                slot_type=SlotType.LESSON,
            )
            .order_by('order')
        )
    
    def get_lesson_slots(self) -> List[TimeSlot]:
        """
        Birincil şablonun LESSON slotları (legacy / tek şablon görünümü).
        """
        if not self.schedule_template:
            return []
        return list(
            TimeSlot.objects
            .filter(
                schedule_template=self.schedule_template,
                is_active=True,
                slot_type=SlotType.LESSON,
            )
            .order_by('order')
        )

    def iter_day_slot_pairs(self):
        for day in self.get_active_days():
            for slot in self.get_lesson_slots_for_day(day):
                yield day, slot, self.resolve_day_template(day)
    
    def generate_preview(self) -> GridPreviewResult:
        """
        Grid önizlemesi oluştur.
        
        Returns:
            GridPreviewResult: Önizleme verisi
        """
        if not self.schedule_template:
            raise ValueError('Çalışma takviminde aktif günlere bağlı ders saati şablonu yok.')

        cells = []
        day_ids = set()
        slot_ids = set()
        for day, slot, _tpl in self.iter_day_slot_pairs():
            day_ids.add(day.id)
            slot_ids.add(slot.id)
            cells.append(GridCellPreview(
                weekly_day_id=day.id,
                weekly_day_name=day.name,
                day_of_week=day.day_of_week,
                timeslot_id=slot.id,
                timeslot_name=slot.name,
                start_time=slot.start_time.strftime('%H:%M'),
                end_time=slot.end_time.strftime('%H:%M'),
                order=slot.order,
            ))
        
        return GridPreviewResult(
            schedule_template_id=self.schedule_template.id,
            schedule_template_name=self.schedule_template.name,
            weekly_cycle_id=self.weekly_cycle.id,
            weekly_cycle_name=self.weekly_cycle.name,
            total_days=len(day_ids),
            total_slots=len(slot_ids),
            total_cells=len(cells),
            cells=cells,
        )
    
    def generate_cells(self, overwrite: bool = False) -> GridGenerateResult:
        """
        Grid hücrelerini oluştur.
        
        Args:
            overwrite: True ise mevcut hücreleri sil ve yeniden oluştur
            
        Returns:
            GridGenerateResult: Oluşturma sonucu
        """
        if not self.schedule_template:
            raise ValueError('Çalışma takviminde aktif günlere bağlı ders saati şablonu yok.')

        created_count = 0
        skipped_count = 0
        created_cells = []
        
        # Overwrite modunda önce mevcut hücreleri sil
        if overwrite:
            ProgramGridCell.objects.filter(
                weekly_cycle=self.weekly_cycle,
                schedule_version__isnull=True,
            ).delete()
        
        for day, slot, template in self.iter_day_slot_pairs():
            if not template:
                continue
            existing = ProgramGridCell.objects.filter(
                weekly_cycle=self.weekly_cycle,
                weekly_day=day,
                timeslot=slot,
                schedule_version__isnull=True,
                is_active=True,
            ).first()
            
            if existing:
                skipped_count += 1
                continue
            
            cell = ProgramGridCell.objects.create(
                schedule_template=template,
                weekly_cycle=self.weekly_cycle,
                weekly_day=day,
                timeslot=slot,
                status=CellStatus.EMPTY,
            )
            created_cells.append(cell)
            created_count += 1
        
        return GridGenerateResult(
            schedule_template_id=self.schedule_template.id,
            weekly_cycle_id=self.weekly_cycle.id,
            created_count=created_count,
            skipped_count=skipped_count,
            cells=created_cells,
        )
    
    def clear_cells(self) -> int:
        """
        Bu döngüye ait tüm grid hücrelerini sil.
        
        Returns:
            int: Silinen hücre sayısı
        """
        deleted_count, _ = ProgramGridCell.objects.filter(
            weekly_cycle=self.weekly_cycle,
            schedule_version__isnull=True,
        ).delete()
        return deleted_count
    
    def get_grid_matrix(self) -> dict:
        """
        Grid'i matris formatında döndür.
        
        Returns:
            {
                'days': [{'id': 1, 'name': 'Pazartesi', ...}, ...],
                'slots': [{'id': 1, 'name': '1. Ders', ...}, ...],
                'matrix': {
                    'day_1': {
                        'slot_1': {'cell_id': 1, 'status': 'EMPTY', ...},
                        'slot_2': {...},
                    },
                    ...
                }
            }
        """
        days = self.get_active_days()
        slots_by_id = {}
        for day in days:
            for slot in self.get_lesson_slots_for_day(day):
                slots_by_id[slot.id] = slot
        slots = sorted(slots_by_id.values(), key=lambda s: (s.order, s.id))
        
        # Mevcut hücreleri getir
        cells = ProgramGridCell.objects.filter(
            weekly_cycle=self.weekly_cycle,
            schedule_version__isnull=True,
        ).select_related('weekly_day', 'timeslot')
        
        # Cell lookup dict
        cell_lookup = {}
        for cell in cells:
            key = (cell.weekly_day_id, cell.timeslot_id)
            cell_lookup[key] = cell
        
        # Build matrix
        matrix = {}
        for day in days:
            day_key = f'day_{day.id}'
            matrix[day_key] = {}
            day_slot_ids = {s.id for s in self.get_lesson_slots_for_day(day)}
            
            for slot in slots:
                slot_key = f'slot_{slot.id}'
                if slot.id not in day_slot_ids:
                    matrix[day_key][slot_key] = None
                    continue
                cell = cell_lookup.get((day.id, slot.id))
                
                if cell:
                    matrix[day_key][slot_key] = {
                        'cell_id': cell.id,
                        'status': cell.status,
                        'notes': cell.notes,
                        'is_active': cell.is_active,
                    }
                else:
                    matrix[day_key][slot_key] = None
        
        return {
            'days': [
                {
                    'id': day.id,
                    'name': day.name,
                    'day_of_week': day.day_of_week,
                    'order': day.order,
                }
                for day in days
            ],
            'slots': [
                {
                    'id': slot.id,
                    'name': slot.name,
                    'start_time': slot.start_time.strftime('%H:%M'),
                    'end_time': slot.end_time.strftime('%H:%M'),
                    'order': slot.order,
                }
                for slot in slots
            ],
            'matrix': matrix,
        }


def generate_preview(weekly_cycle_id: int) -> GridPreviewResult:
    """
    Grid önizlemesi oluştur (convenience function).
    """
    weekly_cycle = WeeklyCycle.objects.select_related(
        'schedule_template'
    ).prefetch_related('weekly_days__schedule_template').get(
        pk=weekly_cycle_id, is_active=True,
    )
    
    engine = GridEngine(weekly_cycle)
    return engine.generate_preview()


def generate_cells(weekly_cycle_id: int, overwrite: bool = False) -> GridGenerateResult:
    """
    Grid hücrelerini oluştur (convenience function).
    """
    weekly_cycle = WeeklyCycle.objects.select_related(
        'schedule_template'
    ).prefetch_related('weekly_days__schedule_template').get(
        pk=weekly_cycle_id, is_active=True,
    )
    
    engine = GridEngine(weekly_cycle)
    return engine.generate_cells(overwrite=overwrite)


def get_grid_matrix(weekly_cycle_id: int) -> dict:
    """
    Grid matrisini getir (convenience function).
    """
    weekly_cycle = WeeklyCycle.objects.select_related(
        'schedule_template'
    ).prefetch_related('weekly_days__schedule_template').get(
        pk=weekly_cycle_id, is_active=True,
    )
    
    engine = GridEngine(weekly_cycle)
    return engine.get_grid_matrix()


def ensure_version_classroom_grid(
    *,
    schedule_version_id: int,
    classroom_id: int,
) -> VersionGridEnsureResult:
    """
    Belirli program versiyonu + sınıf için boş (EMPTY) grid iskeleti oluştur.
    Mevcut hücrelere dokunmaz.
    Gün bazlı ders saati şablonlarını kullanır (Yaz Kursu vb. yeni takvimler).
    """
    from apps.academic.domain.schedule_version import ScheduleVersion
    from apps.sinif.domain.models import Sinif

    version = ScheduleVersion.objects.select_related(
        'schedule_template', 'weekly_cycle', 'term',
    ).prefetch_related('weekly_cycle__weekly_days__schedule_template').get(
        pk=schedule_version_id,
    )
    sinif = Sinif.objects.get(pk=classroom_id, aktif_mi=True)

    if version.schedule_template.sube_id != sinif.sube_id:
        raise ValueError('Sınıf ve program aynı şubede olmalıdır.')
    if version.term.sube_id != sinif.sube_id:
        raise ValueError('Sınıf ve dönem aynı şubede olmalıdır.')
    if version.term.egitim_yili_id != sinif.egitim_yili_id:
        raise ValueError('Sınıf ve dönem aynı eğitim yılında olmalıdır.')

    engine = GridEngine(
        version.weekly_cycle,
        template_fallback=version.schedule_template,
    )
    active_days = engine.get_active_days()
    if not active_days:
        raise ValueError(
            f'"{version.weekly_cycle.name}" çalışma takviminde aktif gün yok. '
            'Tanımlar → Çalışma Takvimi’nden en az bir günü aktif yapın.'
        )

    day_slot_pairs = list(engine.iter_day_slot_pairs())
    if not day_slot_pairs:
        tpl = engine.schedule_template or version.schedule_template
        tpl_name = tpl.name if tpl else 'şablon'
        raise ValueError(
            f'"{tpl_name}" ders saati şablonunda tanımlı ders saati (LESSON) yok. '
            'Tanımlar → Ders Saatleri’nden bu şablona saat ekleyin veya üretin.'
        )

    existing_qs = ProgramGridCell.objects.filter(
        schedule_version_id=version.id,
        sinif_id=sinif.id,
        is_active=True,
    )
    existing_keys = {
        (c.weekly_day_id, c.timeslot_id)
        for c in existing_qs.only('weekly_day_id', 'timeslot_id')
    }
    existing_count = len(existing_keys)
    created_count = 0

    for day, slot, template in day_slot_pairs:
        key = (day.id, slot.id)
        if key in existing_keys:
            continue
        ProgramGridCell.objects.create(
            schedule_template=template or version.schedule_template,
            weekly_cycle=version.weekly_cycle,
            schedule_version=version,
            weekly_day=day,
            timeslot=slot,
            sinif=sinif,
            status=CellStatus.EMPTY,
        )
        created_count += 1

    return VersionGridEnsureResult(
        schedule_version_id=version.id,
        classroom_id=sinif.id,
        created_count=created_count,
        existing_count=existing_count,
        total_cells=existing_count + created_count,
    )
