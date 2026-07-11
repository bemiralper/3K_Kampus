"""
Slot Generator Service
Toplu ders saati slot üretim servisi

Kullanım:
    generator = SlotGenerator(config)
    preview = generator.generate_preview()  # Önizleme
    slots = generator.generate_create()      # Veritabanına kaydet
"""

from datetime import datetime, timedelta, time
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from apps.academic.domain.timeslot import TimeSlot, SlotType
from apps.academic.domain.schedule_template import ScheduleTemplate


@dataclass
class SlotConfig:
    """Slot üretim konfigürasyonu"""
    schedule_template_id: int
    start_time: time
    lesson_duration: int = 40  # dakika
    short_break_duration: int = 10  # dakika
    lesson_count: int = 8
    
    # Öğle arası
    lunch_break_enabled: bool = True
    lunch_break_after_lesson: int = 4
    lunch_break_duration: int = 60  # dakika
    
    # Akşam arası
    evening_break_enabled: bool = False
    evening_break_after_lesson: int = 8
    evening_break_duration: int = 30  # dakika
    
    # Üzerine yazma
    overwrite_existing: bool = False

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SlotConfig':
        """Dict'ten SlotConfig oluştur"""
        return cls(
            schedule_template_id=data['schedule_template_id'],
            start_time=data['start_time'] if isinstance(data['start_time'], time) else datetime.strptime(data['start_time'], '%H:%M').time(),
            lesson_duration=data.get('lesson_duration', 40),
            short_break_duration=data.get('short_break_duration', 10),
            lesson_count=data.get('lesson_count', 8),
            lunch_break_enabled=data.get('lunch_break_enabled', True),
            lunch_break_after_lesson=data.get('lunch_break_after_lesson', 4),
            lunch_break_duration=data.get('lunch_break_duration', 60),
            evening_break_enabled=data.get('evening_break_enabled', False),
            evening_break_after_lesson=data.get('evening_break_after_lesson', 8),
            evening_break_duration=data.get('evening_break_duration', 30),
            overwrite_existing=data.get('overwrite_existing', False)
        )


@dataclass
class GeneratedSlot:
    """Üretilen slot verisi"""
    order: int
    name: str
    start_time: time
    end_time: time
    slot_type: str
    slot_type_display: str
    duration: int
    is_break: bool

    def to_dict(self) -> Dict[str, Any]:
        """Dict'e dönüştür"""
        return {
            'order': self.order,
            'name': self.name,
            'start_time': self.start_time.strftime('%H:%M'),
            'end_time': self.end_time.strftime('%H:%M'),
            'slot_type': self.slot_type,
            'slot_type_display': self.slot_type_display,
            'duration': self.duration,
            'is_break': self.is_break
        }


class SlotGenerator:
    """
    Toplu Slot Üretim Motoru
    
    Örnek kullanım:
        config = SlotConfig(
            schedule_template_id=1,
            start_time=time(8, 30),
            lesson_duration=40,
            short_break_duration=10,
            lesson_count=8,
            lunch_break_enabled=True,
            lunch_break_after_lesson=4,
            lunch_break_duration=60
        )
        
        generator = SlotGenerator(config)
        
        # Önizleme
        preview = generator.generate_preview()
        
        # Veritabanına kaydet
        slots = generator.generate_create()
    """
    
    SLOT_TYPE_LABELS = {
        SlotType.LESSON: 'Ders',
        SlotType.SHORT_BREAK: 'Kısa Teneffüs',
        SlotType.LUNCH_BREAK: 'Öğle Arası',
        SlotType.EVENING_BREAK: 'Akşam Arası',
        SlotType.CUSTOM_BREAK: 'Özel Mola',
    }

    def __init__(self, config: SlotConfig):
        self.config = config
        self._generated_slots: List[GeneratedSlot] = []
        self._template: Optional[ScheduleTemplate] = None

    def _get_template(self) -> ScheduleTemplate:
        """Şablonu getir (lazy loading)"""
        if self._template is None:
            self._template = ScheduleTemplate.objects.get(
                pk=self.config.schedule_template_id,
                is_active=True
            )
        return self._template

    def _add_minutes(self, t: time, minutes: int) -> time:
        """Zamana dakika ekle"""
        dt = datetime.combine(datetime.today(), t)
        dt += timedelta(minutes=minutes)
        return dt.time()

    def _get_slot_type_display(self, slot_type: str) -> str:
        """Slot tipinin Türkçe karşılığını döndür"""
        return self.SLOT_TYPE_LABELS.get(slot_type, slot_type)

    def generate_preview(self) -> List[Dict[str, Any]]:
        """
        Slot üretim önizlemesi
        Veritabanına kaydetmeden slotları hesaplar
        
        Returns:
            List[Dict]: Üretilen slot listesi
        """
        self._generated_slots = []
        current_time = self.config.start_time
        order = 1
        lesson_number = 0

        for i in range(self.config.lesson_count):
            lesson_number += 1
            
            # Ders slotu
            lesson_end = self._add_minutes(current_time, self.config.lesson_duration)
            self._generated_slots.append(GeneratedSlot(
                order=order,
                name=f"{lesson_number}. Ders",
                start_time=current_time,
                end_time=lesson_end,
                slot_type=SlotType.LESSON,
                slot_type_display=self._get_slot_type_display(SlotType.LESSON),
                duration=self.config.lesson_duration,
                is_break=False
            ))
            order += 1
            current_time = lesson_end

            # Son ders değilse teneffüs veya mola ekle
            if i < self.config.lesson_count - 1:
                # Öğle arası kontrolü
                if self.config.lunch_break_enabled and lesson_number == self.config.lunch_break_after_lesson:
                    break_end = self._add_minutes(current_time, self.config.lunch_break_duration)
                    self._generated_slots.append(GeneratedSlot(
                        order=order,
                        name="Öğle Arası",
                        start_time=current_time,
                        end_time=break_end,
                        slot_type=SlotType.LUNCH_BREAK,
                        slot_type_display=self._get_slot_type_display(SlotType.LUNCH_BREAK),
                        duration=self.config.lunch_break_duration,
                        is_break=True
                    ))
                    order += 1
                    current_time = break_end
                
                # Akşam arası kontrolü
                elif self.config.evening_break_enabled and lesson_number == self.config.evening_break_after_lesson:
                    break_end = self._add_minutes(current_time, self.config.evening_break_duration)
                    self._generated_slots.append(GeneratedSlot(
                        order=order,
                        name="Akşam Arası",
                        start_time=current_time,
                        end_time=break_end,
                        slot_type=SlotType.EVENING_BREAK,
                        slot_type_display=self._get_slot_type_display(SlotType.EVENING_BREAK),
                        duration=self.config.evening_break_duration,
                        is_break=True
                    ))
                    order += 1
                    current_time = break_end
                
                # Normal teneffüs
                else:
                    break_end = self._add_minutes(current_time, self.config.short_break_duration)
                    self._generated_slots.append(GeneratedSlot(
                        order=order,
                        name="Teneffüs",
                        start_time=current_time,
                        end_time=break_end,
                        slot_type=SlotType.SHORT_BREAK,
                        slot_type_display=self._get_slot_type_display(SlotType.SHORT_BREAK),
                        duration=self.config.short_break_duration,
                        is_break=True
                    ))
                    order += 1
                    current_time = break_end

        return [slot.to_dict() for slot in self._generated_slots]

    def generate_create(self) -> List[TimeSlot]:
        """
        Slotları veritabanına kaydet
        
        Returns:
            List[TimeSlot]: Oluşturulan slot nesneleri
        """
        # Önce önizleme yapılmamışsa yap
        if not self._generated_slots:
            self.generate_preview()

        template = self._get_template()

        # Üzerine yazma modundaysa mevcut slotları sil
        if self.config.overwrite_existing:
            TimeSlot.objects.filter(
                schedule_template=template,
                is_active=True
            ).update(is_active=False)

        # Yeni slotları oluştur
        created_slots = []
        for slot_data in self._generated_slots:
            slot = TimeSlot.objects.create(
                schedule_template=template,
                order=slot_data.order,
                name=slot_data.name,
                start_time=slot_data.start_time,
                end_time=slot_data.end_time,
                slot_type=slot_data.slot_type,
                is_active=True
            )
            created_slots.append(slot)

        return created_slots

    def get_summary(self) -> Dict[str, Any]:
        """
        Üretim özeti
        
        Returns:
            Dict: Özet bilgiler
        """
        if not self._generated_slots:
            self.generate_preview()

        lessons = [s for s in self._generated_slots if not s.is_break]
        breaks = [s for s in self._generated_slots if s.is_break]
        
        total_lesson_time = sum(s.duration for s in lessons)
        total_break_time = sum(s.duration for s in breaks)
        
        first_slot = self._generated_slots[0] if self._generated_slots else None
        last_slot = self._generated_slots[-1] if self._generated_slots else None

        return {
            'total_slots': len(self._generated_slots),
            'lesson_count': len(lessons),
            'break_count': len(breaks),
            'total_lesson_time': total_lesson_time,
            'total_break_time': total_break_time,
            'total_time': total_lesson_time + total_break_time,
            'start_time': first_slot.start_time.strftime('%H:%M') if first_slot else None,
            'end_time': last_slot.end_time.strftime('%H:%M') if last_slot else None,
        }

    def check_existing_slots(self) -> Dict[str, Any]:
        """
        Mevcut slotları kontrol et
        
        Returns:
            Dict: Mevcut slot bilgileri
        """
        template = self._get_template()
        existing = TimeSlot.objects.filter(
            schedule_template=template,
            is_active=True
        ).count()

        return {
            'has_existing': existing > 0,
            'existing_count': existing,
            'template_name': template.name
        }
