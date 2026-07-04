"""
Scheduler Engine Service

Ders Programı Otomatik Oluşturma Motoru
Greedy + Constraint Solver Algoritması

AŞAMALAR:
1. Job List Oluştur - Her plan için weekly_hours kadar job
2. Sırala - double_block önce, yüksek priority önce, fazla saatli önce
3. Slot Bul - Boş LESSON slot ara, constraint kontrolü
4. Öğretmen Seç - PRIMARY > SECONDARY > CO_TEACHER > Pool
5. Double Block - Art arda iki slot bul
6. Yaz - ProgramGridCell güncelle

CONSTRAINTLER:
- Öğretmen aynı slotta 2 ders veremez
- Sınıf aynı slotta dolu olamaz
- Double block bölünemez
- weekly_hours tamamlanmalı
"""
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Set
from django.db.models import Q

from apps.academic.domain import (
    ProgramGridCell, CellStatus,
    ClassLessonPlan,
    ClassLessonTeacherAssignment, TeacherRole,
    LessonTeacherPool,
    ScheduleRun, ScheduleRunStatus, ScheduleRunType,
    WeeklyCycle, WeeklyDay,
    TimeSlot, SlotType,
    ScheduleTemplate
)


@dataclass
class ScheduleJob:
    """
    Yerleştirilecek tek ders saati işi
    
    Her ClassLessonPlan için weekly_hours kadar job üretilir.
    """
    id: int  # Unique job ID
    class_lesson_plan_id: int
    sinif_id: int
    sinif_ad: str
    ders_id: int
    ders_ad: str
    weekly_hours: int  # Planın toplam saati
    job_index: int  # Bu job'ın sırası (1., 2., 3. saat)
    priority: int
    is_double_block: bool
    double_block_hours: int
    assigned_teacher_ids: List[int]  # Öncelikli atanmış öğretmenler
    pool_teacher_ids: List[int]  # Havuzdaki öğretmenler
    # Sonuç
    placed: bool = False
    placed_cell_id: Optional[int] = None
    placed_teacher_id: Optional[int] = None
    fail_reason: Optional[str] = None


@dataclass
class ScheduleResult:
    """
    Scheduler çalışma sonucu
    """
    total_jobs: int = 0
    placed_jobs: int = 0
    failed_jobs: int = 0
    placed: List[Dict] = field(default_factory=list)
    failed: List[Dict] = field(default_factory=list)
    conflicts: List[Dict] = field(default_factory=list)
    warnings: List[Dict] = field(default_factory=list)


class SchedulerEngine:
    """
    Ders Programı Otomatik Oluşturma Motoru
    
    Kullanım:
        engine = SchedulerEngine(
            egitim_yili_id=1,
            term_id=1,
            schedule_template_id=1,
            weekly_cycle_id=1,
            sinif_id=None  # None = tüm sınıflar
        )
        result = engine.run_preview()  # Simülasyon
        result = engine.run_execute()  # Gerçek çalıştırma
    """
    
    def __init__(
        self,
        egitim_yili_id: int,
        term_id: int,
        schedule_template_id: int,
        weekly_cycle_id: int,
        sinif_id: Optional[int] = None
    ):
        self.egitim_yili_id = egitim_yili_id
        self.term_id = term_id
        self.schedule_template_id = schedule_template_id
        self.weekly_cycle_id = weekly_cycle_id
        self.sinif_id = sinif_id
        
        # Cache
        self._jobs: List[ScheduleJob] = []
        self._grid_cells: Dict[str, ProgramGridCell] = {}  # key: f"{sinif_id}_{day_id}_{slot_id}"
        self._teacher_schedule: Dict[str, Set[int]] = {}  # key: f"{day_id}_{slot_id}", value: set of teacher_ids
        self._sinif_schedule: Dict[str, int] = {}  # key: f"{sinif_id}_{day_id}_{slot_id}", value: ders_id
        
    # ==================== AŞAMA 1: JOB LIST OLUŞTUR ====================
    
    def _build_job_list(self) -> List[ScheduleJob]:
        """
        Her ClassLessonPlan için weekly_hours kadar job üret
        
        Örnek:
        - Matematik 5 saat → 5 job
        - Fizik 3 saat, double_block → 1 double job + 1 single job
        """
        jobs = []
        job_id = 0
        
        # ClassLessonPlan'ları çek
        plans_qs = ClassLessonPlan.objects.filter(
            egitim_yili_id=self.egitim_yili_id,
            term_id=self.term_id,
            is_active=True
        ).select_related('sinif', 'ders')
        
        if self.sinif_id:
            plans_qs = plans_qs.filter(sinif_id=self.sinif_id)
        
        for plan in plans_qs:
            # Öğretmen atamalarını çek (öncelik sırasına göre)
            assignments = ClassLessonTeacherAssignment.objects.filter(
                class_lesson_plan_id=plan.id,
                is_active=True
            ).order_by('priority').values_list('ogretmen_id', flat=True)
            assigned_teacher_ids = list(assignments)
            
            # Havuzdaki öğretmenleri çek
            pool = LessonTeacherPool.objects.filter(
                ders_id=plan.ders_id,
                egitim_yili_id=self.egitim_yili_id,
                is_active=True
            ).order_by('-is_primary').values_list('ogretmen_id', flat=True)
            pool_teacher_ids = list(pool)
            
            # Double block hesaplama
            remaining_hours = plan.weekly_hours
            double_block_hours = getattr(plan, 'double_block_hours', 0) or 0
            
            job_index = 0
            
            # Double block job'ları
            if double_block_hours > 0:
                double_count = double_block_hours // 2
                for _ in range(double_count):
                    job_id += 1
                    job_index += 1
                    jobs.append(ScheduleJob(
                        id=job_id,
                        class_lesson_plan_id=plan.id,
                        sinif_id=plan.sinif_id,
                        sinif_ad=plan.sinif.ad,
                        ders_id=plan.ders_id,
                        ders_ad=plan.ders.ad,
                        weekly_hours=plan.weekly_hours,
                        job_index=job_index,
                        priority=getattr(plan, 'priority', 5) or 5,
                        is_double_block=True,
                        double_block_hours=2,
                        assigned_teacher_ids=assigned_teacher_ids,
                        pool_teacher_ids=pool_teacher_ids
                    ))
                    remaining_hours -= 2
            
            # Tek saatlik job'lar
            while remaining_hours > 0:
                job_id += 1
                job_index += 1
                jobs.append(ScheduleJob(
                    id=job_id,
                    class_lesson_plan_id=plan.id,
                    sinif_id=plan.sinif_id,
                    sinif_ad=plan.sinif.ad,
                    ders_id=plan.ders_id,
                    ders_ad=plan.ders.ad,
                    weekly_hours=plan.weekly_hours,
                    job_index=job_index,
                    priority=getattr(plan, 'priority', 5) or 5,
                    is_double_block=False,
                    double_block_hours=0,
                    assigned_teacher_ids=assigned_teacher_ids,
                    pool_teacher_ids=pool_teacher_ids
                ))
                remaining_hours -= 1
        
        return jobs
    
    # ==================== AŞAMA 2: SIRALA ====================
    
    def _sort_jobs(self, jobs: List[ScheduleJob]) -> List[ScheduleJob]:
        """
        Job'ları öncelik sırasına göre sırala
        
        Sıralama kriterleri:
        1. double_block önce (zor olan önce)
        2. yüksek priority önce (1 > 5)
        3. fazla saatli ders önce (esnek planlama)
        """
        return sorted(jobs, key=lambda j: (
            not j.is_double_block,  # Double block önce (False < True)
            j.priority,  # Düşük priority değeri önce
            -j.weekly_hours  # Yüksek saat önce
        ))
    
    # ==================== AŞAMA 3: GRID VE CACHE HAZIRLA ====================
    
    def _load_grid_and_cache(self):
        """
        Grid hücrelerini ve mevcut atamaları cache'e yükle
        
        NOT: Grid hücreleri sinif_id=None olabilir (paylaşımlı şablon).
        Bu durumda tüm sınıflar bu hücreleri kullanabilir.
        """
        # Grid hücrelerini yükle
        cells = ProgramGridCell.objects.filter(
            schedule_template_id=self.schedule_template_id,
            weekly_cycle_id=self.weekly_cycle_id,
            is_active=True,
            timeslot__slot_type=SlotType.LESSON  # Sadece ders slotları
        ).select_related('weekly_day', 'timeslot')
        
        # sinif_id filtresi yok - tüm hücreleri yükle
        # çünkü sinif_id=None olan hücreler paylaşımlı
        
        for cell in cells:
            # sinif_id=None → 0 olarak cache'le (paylaşımlı hücre)
            cache_sinif_id = cell.sinif_id if cell.sinif_id else 0
            key = f"{cache_sinif_id}_{cell.weekly_day_id}_{cell.timeslot_id}"
            self._grid_cells[key] = cell
            
            # Mevcut atamayı cache'e ekle
            if cell.status == CellStatus.FILLED and cell.ogretmen_id:
                teacher_key = f"{cell.weekly_day_id}_{cell.timeslot_id}"
                if teacher_key not in self._teacher_schedule:
                    self._teacher_schedule[teacher_key] = set()
                self._teacher_schedule[teacher_key].add(cell.ogretmen_id)
                
                # Sınıf schedule'ı: hangi sınıf hangi slotta ders yapıyor
                if cell.sinif_id and cell.ders_id:
                    sinif_key = f"{cell.sinif_id}_{cell.weekly_day_id}_{cell.timeslot_id}"
                    self._sinif_schedule[sinif_key] = cell.ders_id
    
    # ==================== AŞAMA 4: SLOT BUL ====================
    
    def _find_available_slot(
        self,
        job: ScheduleJob,
        teacher_id: int
    ) -> Optional[Tuple[int, int, ProgramGridCell]]:
        """
        Job için uygun slot bul
        
        Şartlar:
        - Hücre EMPTY durumunda
        - Öğretmen bu slotta başka derste değil
        - Sınıf bu slotta başka derste değil
        
        NOT: Grid hücreleri sinif_id=None (paylaşımlı) olabilir.
        Her sınıf kendi slotunu kullanır, öğretmen çakışması kontrol edilir.
        
        Returns:
            (weekly_day_id, timeslot_id, cell) veya None
        """
        # Haftalık günleri çek
        days = WeeklyDay.objects.filter(
            weekly_cycle_id=self.weekly_cycle_id,
            is_active=True
        ).order_by('order')
        
        # Zaman slotlarını çek (sadece LESSON)
        slots = TimeSlot.objects.filter(
            schedule_template_id=self.schedule_template_id,
            slot_type=SlotType.LESSON,
            is_active=True
        ).order_by('order')
        
        for day in days:
            for slot in slots:
                # Sınıf için slot kontrolü - bu sınıf bu slotta zaten ders yapıyor mu?
                sinif_key = f"{job.sinif_id}_{day.id}_{slot.id}"
                if sinif_key in self._sinif_schedule:
                    continue  # Sınıf bu slotta dolu
                
                # Öğretmen çakışma kontrolü
                teacher_key = f"{day.id}_{slot.id}"
                if teacher_key in self._teacher_schedule:
                    if teacher_id in self._teacher_schedule[teacher_key]:
                        continue  # Öğretmen bu slotta dolu
                
                # Grid hücresi kontrolü
                # Önce sınıfa özel hücre ara
                cell_key = f"{job.sinif_id}_{day.id}_{slot.id}"
                cell = self._grid_cells.get(cell_key)
                
                # Sınıfa özel hücre yoksa, paylaşımlı hücreyi dene (sinif_id=0)
                if not cell:
                    cell_key = f"0_{day.id}_{slot.id}"
                    cell = self._grid_cells.get(cell_key)
                
                if cell and cell.is_available:
                    return (day.id, slot.id, cell)
        
        return None
    
    def _find_double_block_slots(
        self,
        job: ScheduleJob,
        teacher_id: int
    ) -> Optional[Tuple[int, int, int, ProgramGridCell, ProgramGridCell]]:
        """
        Double block için art arda 2 slot bul
        
        Returns:
            (weekly_day_id, slot1_id, slot2_id, cell1, cell2) veya None
        """
        days = WeeklyDay.objects.filter(
            weekly_cycle_id=self.weekly_cycle_id,
            is_active=True
        ).order_by('order')
        
        slots = list(TimeSlot.objects.filter(
            schedule_template_id=self.schedule_template_id,
            slot_type=SlotType.LESSON,
            is_active=True
        ).order_by('order'))
        
        for day in days:
            for i in range(len(slots) - 1):
                slot1 = slots[i]
                slot2 = slots[i + 1]
                
                # Her iki slot da kontrol et
                can_use_slot1 = self._check_slot_available(job.sinif_id, day.id, slot1.id, teacher_id)
                can_use_slot2 = self._check_slot_available(job.sinif_id, day.id, slot2.id, teacher_id)
                
                if can_use_slot1 and can_use_slot2:
                    # Önce sınıfa özel hücre ara, yoksa paylaşımlı (0) hücreyi kullan
                    cell1 = self._grid_cells.get(f"{job.sinif_id}_{day.id}_{slot1.id}")
                    if not cell1:
                        cell1 = self._grid_cells.get(f"0_{day.id}_{slot1.id}")
                    
                    cell2 = self._grid_cells.get(f"{job.sinif_id}_{day.id}_{slot2.id}")
                    if not cell2:
                        cell2 = self._grid_cells.get(f"0_{day.id}_{slot2.id}")
                    
                    if cell1 and cell2 and cell1.is_available and cell2.is_available:
                        return (day.id, slot1.id, slot2.id, cell1, cell2)
        
        return None
    
    def _check_slot_available(
        self,
        sinif_id: int,
        day_id: int,
        slot_id: int,
        teacher_id: int
    ) -> bool:
        """Slot kullanılabilir mi kontrol et"""
        # Sınıf kontrolü
        sinif_key = f"{sinif_id}_{day_id}_{slot_id}"
        if sinif_key in self._sinif_schedule:
            return False
        
        # Öğretmen kontrolü
        teacher_key = f"{day_id}_{slot_id}"
        if teacher_key in self._teacher_schedule:
            if teacher_id in self._teacher_schedule[teacher_key]:
                return False
        
        return True
    
    # ==================== AŞAMA 5: ÖĞRETMEN SEÇ ====================
    
    def _select_teacher(
        self,
        job: ScheduleJob,
        day_id: int,
        slot_id: int
    ) -> Optional[int]:
        """
        Job için uygun öğretmen seç
        
        Öncelik sırası:
        1. Atanmış öğretmenler (priority sırasına göre)
        2. Havuzdaki öğretmenler (is_primary önce)
        
        Bu slot için müsait olmalı.
        """
        teacher_key = f"{day_id}_{slot_id}"
        busy_teachers = self._teacher_schedule.get(teacher_key, set())
        
        # Önce atanmış öğretmenleri dene
        for teacher_id in job.assigned_teacher_ids:
            if teacher_id not in busy_teachers:
                return teacher_id
        
        # Sonra havuzdaki öğretmenleri dene
        for teacher_id in job.pool_teacher_ids:
            if teacher_id not in busy_teachers:
                return teacher_id
        
        return None
    
    # ==================== AŞAMA 6: YAZ ====================
    
    def _place_job(
        self,
        job: ScheduleJob,
        cell: ProgramGridCell,
        teacher_id: int,
        day_id: int,
        slot_id: int,
        execute: bool = False,
        partner_cell: Optional[ProgramGridCell] = None
    ):
        """
        Job'ı grid'e yerleştir
        
        Args:
            execute: True ise DB'ye yaz, False ise sadece cache güncelle
        """
        from apps.academic.domain import ClassLessonPlan
        from apps.egitim_tanimlari.models import Ders
        from apps.personel.domain.models import Personel
        
        plan = ClassLessonPlan.objects.get(id=job.class_lesson_plan_id)
        ders = Ders.objects.get(id=job.ders_id)
        ogretmen = Personel.objects.get(id=teacher_id)
        
        if execute:
            # Sınıf bilgisini güncelle
            cell.sinif_id = job.sinif_id
            cell.fill(
                ders=ders,
                ogretmen=ogretmen,
                class_lesson_plan=plan,
                is_double_block_start=partner_cell is not None,
                partner_cell=partner_cell
            )
        
        # Cache güncelle
        teacher_key = f"{day_id}_{slot_id}"
        if teacher_key not in self._teacher_schedule:
            self._teacher_schedule[teacher_key] = set()
        self._teacher_schedule[teacher_key].add(teacher_id)
        
        sinif_key = f"{job.sinif_id}_{day_id}_{slot_id}"
        self._sinif_schedule[sinif_key] = job.ders_id
        
        # Job güncelle
        job.placed = True
        job.placed_cell_id = cell.id
        job.placed_teacher_id = teacher_id
    
    # ==================== ANA ÇALIŞTIRMA ====================
    
    def run(self, execute: bool = False) -> ScheduleResult:
        """
        Motoru çalıştır
        
        Args:
            execute: True = gerçek çalıştırma (DB yaz), False = preview (simülasyon)
        
        Returns:
            ScheduleResult
        """
        result = ScheduleResult()
        
        # 1. Job list oluştur
        self._jobs = self._build_job_list()
        result.total_jobs = len(self._jobs)
        
        if result.total_jobs == 0:
            result.warnings.append({
                "message": "Yerleştirilecek ders planı bulunamadı"
            })
            return result
        
        # 2. Sırala
        self._jobs = self._sort_jobs(self._jobs)
        
        # 3. Grid ve cache hazırla
        self._load_grid_and_cache()
        
        # 4. Her job için slot bul ve yerleştir
        for job in self._jobs:
            if job.is_double_block:
                # Double block için öğretmen seç ve slot bul
                placed = False
                for teacher_id in job.assigned_teacher_ids + job.pool_teacher_ids:
                    slots = self._find_double_block_slots(job, teacher_id)
                    if slots:
                        day_id, slot1_id, slot2_id, cell1, cell2 = slots
                        self._place_job(job, cell1, teacher_id, day_id, slot1_id, execute, cell2)
                        # Partner cell için de cache güncelle
                        teacher_key2 = f"{day_id}_{slot2_id}"
                        if teacher_key2 not in self._teacher_schedule:
                            self._teacher_schedule[teacher_key2] = set()
                        self._teacher_schedule[teacher_key2].add(teacher_id)
                        sinif_key2 = f"{job.sinif_id}_{day_id}_{slot2_id}"
                        self._sinif_schedule[sinif_key2] = job.ders_id
                        
                        if execute:
                            from apps.egitim_tanimlari.models import Ders
                            from apps.academic.domain import ClassLessonPlan
                            from apps.personel.domain.models import Personel
                            plan = ClassLessonPlan.objects.get(id=job.class_lesson_plan_id)
                            ders = Ders.objects.get(id=job.ders_id)
                            ogretmen = Personel.objects.get(id=teacher_id)
                            cell2.sinif_id = job.sinif_id
                            cell2.fill(ders=ders, ogretmen=ogretmen, class_lesson_plan=plan)
                        
                        result.placed_jobs += 1
                        result.placed.append({
                            "lesson": job.ders_ad,
                            "classroom": job.sinif_ad,
                            "day_id": day_id,
                            "slots": [slot1_id, slot2_id],
                            "teacher_id": teacher_id,
                            "double_block": True
                        })
                        placed = True
                        break
                
                if not placed:
                    job.fail_reason = "Double block için uygun ardışık slot bulunamadı"
                    result.failed_jobs += 1
                    result.failed.append({
                        "lesson": job.ders_ad,
                        "classroom": job.sinif_ad,
                        "reason": job.fail_reason,
                        "double_block": True
                    })
            else:
                # Tek saatlik job
                placed = False
                for teacher_id in job.assigned_teacher_ids + job.pool_teacher_ids:
                    slot_result = self._find_available_slot(job, teacher_id)
                    if slot_result:
                        day_id, slot_id, cell = slot_result
                        self._place_job(job, cell, teacher_id, day_id, slot_id, execute)
                        
                        result.placed_jobs += 1
                        result.placed.append({
                            "lesson": job.ders_ad,
                            "classroom": job.sinif_ad,
                            "day_id": day_id,
                            "slot_id": slot_id,
                            "teacher_id": teacher_id,
                            "double_block": False
                        })
                        placed = True
                        break
                
                if not placed:
                    # Neden başarısız oldu?
                    if not job.assigned_teacher_ids and not job.pool_teacher_ids:
                        job.fail_reason = "Öğretmen ataması veya havuz bulunamadı"
                    else:
                        job.fail_reason = "Uygun boş slot bulunamadı"
                    
                    result.failed_jobs += 1
                    result.failed.append({
                        "lesson": job.ders_ad,
                        "classroom": job.sinif_ad,
                        "reason": job.fail_reason,
                        "job_index": job.job_index,
                        "weekly_hours": job.weekly_hours
                    })
        
        # Uyarılar
        if result.failed_jobs > 0:
            result.warnings.append({
                "message": f"{result.failed_jobs} ders saati yerleştirilemedi"
            })
        
        return result
    
    def run_preview(self) -> ScheduleResult:
        """Preview çalıştırma - DB'ye yazmaz"""
        return self.run(execute=False)
    
    def run_execute(self) -> ScheduleResult:
        """Gerçek çalıştırma - DB'ye yazar"""
        return self.run(execute=True)


class SchedulerService:
    """
    Scheduler API servisi
    
    ScheduleRun oluşturur ve motoru çalıştırır.
    """
    
    @staticmethod
    def preview(
        egitim_yili_id: int,
        term_id: int,
        schedule_template_id: int,
        weekly_cycle_id: int,
        sinif_id: Optional[int] = None
    ) -> Dict:
        """
        Preview çalıştır
        
        Grid'e yazmaz, sadece simülasyon sonucu döner.
        """
        from apps.term.models import Term
        from apps.academic.domain import ScheduleTemplate, WeeklyCycle
        
        engine = SchedulerEngine(
            egitim_yili_id=egitim_yili_id,
            term_id=term_id,
            schedule_template_id=schedule_template_id,
            weekly_cycle_id=weekly_cycle_id,
            sinif_id=sinif_id
        )
        
        result = engine.run_preview()
        
        # ScheduleRun log oluştur (PREVIEW tipinde)
        term = Term.objects.get(id=term_id)
        template = ScheduleTemplate.objects.get(id=schedule_template_id)
        cycle = WeeklyCycle.objects.get(id=weekly_cycle_id)
        
        run = ScheduleRun.objects.create(
            egitim_yili_id=egitim_yili_id,
            term=term,
            schedule_template=template,
            weekly_cycle=cycle,
            sinif_id=sinif_id,
            run_type=ScheduleRunType.PREVIEW,
            status=ScheduleRunStatus.SUCCESS if result.failed_jobs == 0 else ScheduleRunStatus.PARTIAL,
            total_jobs=result.total_jobs,
            placed_jobs=result.placed_jobs,
            failed_jobs=result.failed_jobs,
            log_json={
                "placed": result.placed,
                "failed": result.failed,
                "conflicts": result.conflicts,
                "warnings": result.warnings
            }
        )
        
        return {
            "run_id": run.id,
            "total_jobs": result.total_jobs,
            "placed_jobs": result.placed_jobs,
            "failed_jobs": result.failed_jobs,
            "success_rate": run.success_rate,
            "placed": result.placed,
            "failed": result.failed,
            "conflicts": result.conflicts,
            "warnings": result.warnings
        }
    
    @staticmethod
    def execute(
        egitim_yili_id: int,
        term_id: int,
        schedule_template_id: int,
        weekly_cycle_id: int,
        sinif_id: Optional[int] = None
    ) -> Dict:
        """
        Gerçek çalıştırma
        
        Grid'e yazar, ScheduleRun log oluşturur.
        """
        from django.utils import timezone
        from apps.term.models import Term
        from apps.academic.domain import ScheduleTemplate, WeeklyCycle
        
        term = Term.objects.get(id=term_id)
        template = ScheduleTemplate.objects.get(id=schedule_template_id)
        cycle = WeeklyCycle.objects.get(id=weekly_cycle_id)
        
        # ScheduleRun oluştur
        run = ScheduleRun.objects.create(
            egitim_yili_id=egitim_yili_id,
            term=term,
            schedule_template=template,
            weekly_cycle=cycle,
            sinif_id=sinif_id,
            run_type=ScheduleRunType.EXECUTE,
            status=ScheduleRunStatus.RUNNING,
            started_at=timezone.now()
        )
        
        try:
            engine = SchedulerEngine(
                egitim_yili_id=egitim_yili_id,
                term_id=term_id,
                schedule_template_id=schedule_template_id,
                weekly_cycle_id=weekly_cycle_id,
                sinif_id=sinif_id
            )
            
            result = engine.run_execute()
            
            # Run güncelle
            run.total_jobs = result.total_jobs
            run.placed_jobs = result.placed_jobs
            run.failed_jobs = result.failed_jobs
            run.log_json = {
                "placed": result.placed,
                "failed": result.failed,
                "conflicts": result.conflicts,
                "warnings": result.warnings
            }
            run.mark_completed(result.placed_jobs, result.failed_jobs)
            
            return {
                "run_id": run.id,
                "status": run.status,
                "total_jobs": result.total_jobs,
                "placed_jobs": result.placed_jobs,
                "failed_jobs": result.failed_jobs,
                "success_rate": run.success_rate,
                "placed": result.placed,
                "failed": result.failed,
                "conflicts": result.conflicts,
                "warnings": result.warnings
            }
            
        except Exception as e:
            run.mark_failed(str(e))
            raise
    
    @staticmethod
    def reset_grid(
        schedule_template_id: int,
        weekly_cycle_id: int,
        sinif_id: Optional[int] = None
    ) -> Dict:
        """
        Grid'i sıfırla
        
        FILLED → EMPTY
        LOCKED dokunulmaz
        """
        cells = ProgramGridCell.objects.filter(
            schedule_template_id=schedule_template_id,
            weekly_cycle_id=weekly_cycle_id,
            status=CellStatus.FILLED,
            is_active=True
        )
        
        if sinif_id:
            cells = cells.filter(sinif_id=sinif_id)
        
        reset_count = 0
        for cell in cells:
            if cell.clear():  # LOCKED kontrolü clear() içinde
                reset_count += 1
        
        return {
            "reset_count": reset_count,
            "message": f"{reset_count} hücre sıfırlandı"
        }
