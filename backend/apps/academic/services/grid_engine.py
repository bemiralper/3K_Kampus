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


class GridEngine:
    """
    Program Grid oluşturma motoru.
    
    WeeklyDay × TimeSlot(LESSON) = ProgramGridCell kartezyen çarpımı.
    BREAK slotları dahil edilmez.
    """
    
    def __init__(self, weekly_cycle: WeeklyCycle):
        self.weekly_cycle = weekly_cycle
        self.schedule_template = weekly_cycle.schedule_template
    
    def get_active_days(self) -> List[WeeklyDay]:
        """Aktif günleri getir."""
        return list(
            self.weekly_cycle.weekly_days
            .filter(is_active=True)
            .order_by('order')
        )
    
    def get_lesson_slots(self) -> List[TimeSlot]:
        """
        Sadece LESSON türündeki slotları getir.
        BREAK slotları dahil edilmez.
        """
        return list(
            TimeSlot.objects
            .filter(
                schedule_template=self.schedule_template,
                is_active=True,
                slot_type=SlotType.LESSON  # Sadece ders slotları
            )
            .order_by('order')
        )
    
    def generate_preview(self) -> GridPreviewResult:
        """
        Grid önizlemesi oluştur.
        
        Returns:
            GridPreviewResult: Önizleme verisi
        """
        days = self.get_active_days()
        slots = self.get_lesson_slots()
        
        cells = []
        for day in days:
            for slot in slots:
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
            total_days=len(days),
            total_slots=len(slots),
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
        days = self.get_active_days()
        slots = self.get_lesson_slots()
        
        created_count = 0
        skipped_count = 0
        created_cells = []
        
        # Overwrite modunda önce mevcut hücreleri sil
        if overwrite:
            deleted_count, _ = ProgramGridCell.objects.filter(
                schedule_template=self.schedule_template,
                weekly_cycle=self.weekly_cycle,
            ).delete()
        
        for day in days:
            for slot in slots:
                # Mevcut hücre kontrolü
                existing = ProgramGridCell.objects.filter(
                    schedule_template=self.schedule_template,
                    weekly_cycle=self.weekly_cycle,
                    weekly_day=day,
                    timeslot=slot,
                ).first()
                
                if existing:
                    skipped_count += 1
                    continue
                
                # Yeni hücre oluştur
                cell = ProgramGridCell.objects.create(
                    schedule_template=self.schedule_template,
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
            schedule_template=self.schedule_template,
            weekly_cycle=self.weekly_cycle,
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
        slots = self.get_lesson_slots()
        
        # Mevcut hücreleri getir
        cells = ProgramGridCell.objects.filter(
            schedule_template=self.schedule_template,
            weekly_cycle=self.weekly_cycle,
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
            
            for slot in slots:
                slot_key = f'slot_{slot.id}'
                cell = cell_lookup.get((day.id, slot.id))
                
                if cell:
                    matrix[day_key][slot_key] = {
                        'cell_id': cell.id,
                        'status': cell.status,
                        'notes': cell.notes,
                        'is_active': cell.is_active,
                        # TODO: Gelecek entegrasyonlar
                        # 'lesson_id': cell.lesson_id,
                        # 'teacher_id': cell.teacher_id,
                        # 'classroom_id': cell.classroom_id,
                        # 'room_id': cell.room_id,
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
    ).get(pk=weekly_cycle_id, is_active=True)
    
    engine = GridEngine(weekly_cycle)
    return engine.generate_preview()


def generate_cells(weekly_cycle_id: int, overwrite: bool = False) -> GridGenerateResult:
    """
    Grid hücrelerini oluştur (convenience function).
    """
    weekly_cycle = WeeklyCycle.objects.select_related(
        'schedule_template'
    ).get(pk=weekly_cycle_id, is_active=True)
    
    engine = GridEngine(weekly_cycle)
    return engine.generate_cells(overwrite=overwrite)


def get_grid_matrix(weekly_cycle_id: int) -> dict:
    """
    Grid matrisini getir (convenience function).
    """
    weekly_cycle = WeeklyCycle.objects.select_related(
        'schedule_template'
    ).get(pk=weekly_cycle_id, is_active=True)
    
    engine = GridEngine(weekly_cycle)
    return engine.get_grid_matrix()
