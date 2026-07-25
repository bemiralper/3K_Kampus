"""
ClassLessonPlan Service

İş kuralları ve validasyonlar.
"""
from typing import Optional, List, Dict, Any
from django.db.models import Q, QuerySet

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.interfaces.repositories.class_lesson_plan_repository import ClassLessonPlanRepository
from apps.academic.services.active_academic_year import (
    get_active_academic_year,
    ActiveAcademicYearError,
    NoActiveAcademicYearError,
    MultipleActiveAcademicYearsError
)
from apps.academic.services.teacher_availability_service import (
    get_teacher_gorevlendirme,
    is_ogretmen_gorevlendirme,
)


class ClassLessonPlanValidationError(Exception):
    """Validasyon hatası"""
    def __init__(self, message: str, field: Optional[str] = None):
        self.message = message
        self.field = field
        super().__init__(self.message)


class ClassLessonPlanService:
    """
    Sınıf Ders Planı Servisi
    
    İş kuralları:
    - Aktif akademik yıl zorunlu
    - Dönem zorunlu
    - Sınıf zorunlu
    - Ders zorunlu
    - Haftalık saat > 0
    - Kredi >= 0
    - Duplicate ders eklenemez
    - Double block ise haftalık saat >= 2
    - term / sinif / ders aynı şube ve aktif eğitim yılında olmalı
    - Opsiyonel öğretmen: şube+yıl öğretmen görevlendirmesi olmalı
    """
    
    def __init__(self):
        self.repository = ClassLessonPlanRepository()

    @staticmethod
    def _entity_id(data: Dict[str, Any], id_key: str, obj_key: str) -> Optional[int]:
        if data.get(id_key) is not None:
            return int(data[id_key])
        obj = data.get(obj_key)
        return obj.id if obj is not None else None

    def _validate_relations(
        self,
        *,
        term_id: int,
        sinif_id: int,
        ders_id: int,
        ogretmen_id: Optional[int] = None,
        check_schedule_lock: bool = True,
    ) -> None:
        """Term / Sinif / Ders / öğretmen bağlantılarını doğrula (diğer modülleri değiştirmez)."""
        from apps.egitim_tanimlari.models import Ders
        from apps.sinif.domain.models import Sinif
        from apps.term.domain.models import Term

        try:
            active_year = get_active_academic_year()
        except ActiveAcademicYearError as e:
            raise ClassLessonPlanValidationError(str(e), 'egitim_yili')

        try:
            term = Term.objects.select_related('egitim_yili', 'sube').get(pk=term_id)
        except Term.DoesNotExist:
            raise ClassLessonPlanValidationError('Dönem bulunamadı.', 'term')

        try:
            sinif = Sinif.objects.select_related('egitim_yili', 'sube', 'sinif_seviyesi', 'alan').get(pk=sinif_id)
        except Sinif.DoesNotExist:
            raise ClassLessonPlanValidationError('Sınıf bulunamadı.', 'sinif')

        try:
            ders = Ders.objects.prefetch_related('sinif_seviyeleri', 'alanlar').get(pk=ders_id, aktif_mi=True)
        except Ders.DoesNotExist:
            raise ClassLessonPlanValidationError('Ders bulunamadı veya pasif.', 'ders')

        if term.egitim_yili_id != active_year.id:
            raise ClassLessonPlanValidationError(
                'Dönem aktif eğitim yılına ait değil.',
                'term',
            )
        if sinif.egitim_yili_id != active_year.id:
            raise ClassLessonPlanValidationError(
                'Sınıf aktif eğitim yılına ait değil.',
                'sinif',
            )
        if not sinif.aktif_mi:
            raise ClassLessonPlanValidationError('Pasif sınıfa ders planı eklenemez.', 'sinif')
        if not term.is_active:
            raise ClassLessonPlanValidationError('Pasif döneme ders planı eklenemez.', 'term')

        if sinif.sube_id != term.sube_id:
            raise ClassLessonPlanValidationError(
                'Sınıf ve dönem aynı şubede olmalıdır.',
                'sinif',
            )
        if ders.sube_id != sinif.sube_id:
            raise ClassLessonPlanValidationError(
                'Ders, sınıfın şubesine ait olmalıdır (Eğitim Tanımları).',
                'ders',
            )
        if ders.kurum_id != sinif.kurum_id:
            raise ClassLessonPlanValidationError(
                'Ders, sınıfın kurumuna ait olmalıdır.',
                'ders',
            )

        # Seviye/alan uyumu — katalogda bağlıysa sınıf ile kesişmeli
        ders_seviye_ids = set(ders.sinif_seviyeleri.values_list('id', flat=True))
        if ders_seviye_ids and sinif.sinif_seviyesi_id and sinif.sinif_seviyesi_id not in ders_seviye_ids:
            raise ClassLessonPlanValidationError(
                'Bu ders seçili sınıf seviyesinde tanımlı değil (Eğitim Tanımları).',
                'ders',
            )
        ders_alan_ids = set(ders.alanlar.values_list('id', flat=True))
        if ders_alan_ids and sinif.alan_id and sinif.alan_id not in ders_alan_ids:
            raise ClassLessonPlanValidationError(
                'Bu ders seçili sınıf alanında tanımlı değil (Eğitim Tanımları).',
                'ders',
            )

        if check_schedule_lock and term.schedule_locked:
            raise ClassLessonPlanValidationError(
                'Bu dönemin programı kilitli; ders planı değiştirilemez.',
                'term',
            )

        if ogretmen_id:
            gorev = get_teacher_gorevlendirme(
                ogretmen_id,
                kurum_id=sinif.kurum_id,
                sube_id=sinif.sube_id,
                egitim_yili_id=active_year.id,
            )
            if not gorev or not is_ogretmen_gorevlendirme(gorev):
                raise ClassLessonPlanValidationError(
                    'Öğretmen bu şube ve eğitim yılında aktif öğretmen görevlendirmesine sahip değil.',
                    'ogretmen',
                )
    
    # ==================== VALIDASYONLAR ====================
    
    def validate_create(self, data: Dict[str, Any]) -> None:
        """
        Oluşturma validasyonları
        
        Args:
            data: Plan verileri
            
        Raises:
            ClassLessonPlanValidationError: Validasyon hatası
            NoActiveAcademicYearError: Aktif yıl yoksa
            MultipleActiveAcademicYearsError: Birden fazla aktif yıl varsa
        """
        # Aktif akademik yıl kontrolü
        try:
            get_active_academic_year()
        except ActiveAcademicYearError as e:
            raise ClassLessonPlanValidationError(str(e), 'egitim_yili')
        
        # Zorunlu alan kontrolleri
        if not data.get('term_id') and not data.get('term'):
            raise ClassLessonPlanValidationError('Dönem zorunludur.', 'term')
        
        if not data.get('sinif_id') and not data.get('sinif'):
            raise ClassLessonPlanValidationError('Sınıf zorunludur.', 'sinif')
        
        if not data.get('ders_id') and not data.get('ders'):
            raise ClassLessonPlanValidationError('Ders zorunludur.', 'ders')
        
        # Haftalık saat kontrolü
        weekly_hours = data.get('weekly_hours', 0)
        if not weekly_hours or weekly_hours < 1:
            raise ClassLessonPlanValidationError(
                'Haftalık saat en az 1 olmalıdır.', 
                'weekly_hours'
            )
        
        # Kredi kontrolü
        credit = data.get('credit', 0)
        if credit < 0:
            raise ClassLessonPlanValidationError(
                'Kredi negatif olamaz.', 
                'credit'
            )
        
        # Double block kontrolü
        is_double_block = data.get('is_double_block', False)
        if is_double_block and weekly_hours < 2:
            raise ClassLessonPlanValidationError(
                'Çift blok dersler için haftalık saat en az 2 olmalıdır.',
                'weekly_hours'
            )
        
        # Duplicate kontrolü
        term_id = self._entity_id(data, 'term_id', 'term')
        sinif_id = self._entity_id(data, 'sinif_id', 'sinif')
        ders_id = self._entity_id(data, 'ders_id', 'ders')
        ogretmen_id = self._entity_id(data, 'ogretmen_id', 'ogretmen')

        self._validate_relations(
            term_id=term_id,
            sinif_id=sinif_id,
            ders_id=ders_id,
            ogretmen_id=ogretmen_id,
            check_schedule_lock=True,
        )
        
        if self.repository.check_duplicate(term_id, sinif_id, ders_id):
            raise ClassLessonPlanValidationError(
                'Bu sınıf için bu ders zaten eklenmiş.',
                'ders'
            )
    
    def validate_update(self, plan: ClassLessonPlan, data: Dict[str, Any]) -> None:
        """
        Güncelleme validasyonları
        
        Args:
            plan: Güncellenecek plan
            data: Yeni veriler
            
        Raises:
            ClassLessonPlanValidationError: Validasyon hatası
        """
        # Haftalık saat kontrolü
        weekly_hours = data.get('weekly_hours', plan.weekly_hours)
        if weekly_hours < 1:
            raise ClassLessonPlanValidationError(
                'Haftalık saat en az 1 olmalıdır.', 
                'weekly_hours'
            )
        
        # Kredi kontrolü
        credit = data.get('credit', plan.credit)
        if credit < 0:
            raise ClassLessonPlanValidationError(
                'Kredi negatif olamaz.', 
                'credit'
            )
        
        # Double block kontrolü
        is_double_block = data.get('is_double_block', plan.is_double_block)
        if is_double_block and weekly_hours < 2:
            raise ClassLessonPlanValidationError(
                'Çift blok dersler için haftalık saat en az 2 olmalıdır.',
                'weekly_hours'
            )

        if plan.term_id:
            self._validate_relations(
                term_id=plan.term_id,
                sinif_id=plan.sinif_id,
                ders_id=plan.ders_id,
                ogretmen_id=None,
                check_schedule_lock=True,
            )

        if 'ogretmen_id' in data:
            ogretmen_id = data.get('ogretmen_id')
            if ogretmen_id:
                self._validate_relations(
                    term_id=plan.term_id,
                    sinif_id=plan.sinif_id,
                    ders_id=plan.ders_id,
                    ogretmen_id=ogretmen_id,
                    check_schedule_lock=False,
                )
        
        # Ders değiştiyse duplicate kontrolü
        new_ders_id = data.get('ders_id')
        if new_ders_id and new_ders_id != plan.ders_id:
            if self.repository.check_duplicate(
                plan.term_id, 
                plan.sinif_id, 
                new_ders_id, 
                exclude_id=plan.id
            ):
                raise ClassLessonPlanValidationError(
                    'Bu sınıf için bu ders zaten eklenmiş.',
                    'ders'
                )
    
    # ==================== CRUD İŞLEMLERİ ====================
    
    def get_by_id(self, plan_id: int) -> Optional[ClassLessonPlan]:
        """ID ile plan getir"""
        return self.repository.get_by_id(plan_id)
    
    def list_by_classroom_and_term(
        self, 
        classroom_id: int, 
        term_id: int
    ) -> QuerySet[ClassLessonPlan]:
        """
        Sınıf ve döneme göre listele
        
        Args:
            classroom_id: Sınıf ID
            term_id: Dönem ID
            
        Returns:
            Plan QuerySet
        """
        return self.repository.filter_by_classroom_and_term(classroom_id, term_id)
    
    def list_by_classroom(self, classroom_id: int) -> QuerySet[ClassLessonPlan]:
        """Sınıfa göre listele"""
        return self.repository.filter_by_classroom(classroom_id)
    
    def list_by_term(self, term_id: int) -> QuerySet[ClassLessonPlan]:
        """Döneme göre listele"""
        return self.repository.filter_by_term(term_id)
    
    def list_by_teacher(self, teacher_id: int) -> QuerySet[ClassLessonPlan]:
        """Öğretmene göre listele"""
        return self.repository.filter_by_teacher(teacher_id)
    
    def list_all(self) -> QuerySet[ClassLessonPlan]:
        """Aktif eğitim yılındaki tüm planları listele"""
        return self.repository.list_all_for_active_year()
    
    def create(self, data: Dict[str, Any]) -> ClassLessonPlan:
        """
        Yeni plan oluştur
        
        Args:
            data: Plan verileri
            
        Returns:
            Oluşturulan plan
            
        Raises:
            ClassLessonPlanValidationError: Validasyon hatası
        """
        self.validate_create(data)
        return self.repository.create(data)
    
    def update(self, plan_id: int, data: Dict[str, Any]) -> ClassLessonPlan:
        """
        Plan güncelle
        
        Args:
            plan_id: Plan ID
            data: Yeni veriler
            
        Returns:
            Güncellenen plan
            
        Raises:
            ClassLessonPlanValidationError: Validasyon hatası
        """
        plan = self.repository.get_by_id(plan_id)
        if not plan:
            raise ClassLessonPlanValidationError('Plan bulunamadı.', 'id')

        prev_ogretmen_id = plan.ogretmen_id
        self.validate_update(plan, data)
        updated = self.repository.update(plan, data)

        # Ders programı hücreleri öğretmeni plan ile senkron tut (denormalize alan)
        if 'ogretmen' in data or 'ogretmen_id' in data:
            if updated.ogretmen_id != prev_ogretmen_id:
                self._sync_grid_cells_teacher(updated)

        return updated

    @staticmethod
    def _sync_grid_cells_teacher(plan: ClassLessonPlan) -> int:
        """Plan öğretmeni değişince yerleştirilmiş hücrelerdeki öğretmeni güncelle."""
        from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell

        return ProgramGridCell.objects.filter(
            class_lesson_plan_id=plan.id,
            is_active=True,
            status=CellStatus.FILLED,
        ).update(ogretmen_id=plan.ogretmen_id)
    
    def delete(self, plan_id: int) -> ClassLessonPlan:
        """
        Plan sil (soft delete)
        
        Args:
            plan_id: Plan ID
            
        Returns:
            Silinen plan
            
        Raises:
            ClassLessonPlanValidationError: Plan bulunamazsa
        """
        plan = self.repository.get_by_id(plan_id)
        if not plan:
            raise ClassLessonPlanValidationError('Plan bulunamadı.', 'id')

        if plan.term_id and plan.term.schedule_locked:
            raise ClassLessonPlanValidationError(
                'Bu dönemin programı kilitli; ders planı silinemez.',
                'term',
            )
        
        return self.repository.soft_delete(plan)

    def bulk_delete(self, plan_ids: List[int], *, sube_id: int) -> int:
        """Birden fazla planı soft-delete et. Dönem kilitliyse hata."""
        if not plan_ids:
            return 0

        plans = list(
            ClassLessonPlan.objects.filter(
                id__in=plan_ids,
                is_active=True,
                sinif__sube_id=sube_id,
            ).select_related('term', 'sinif')
        )
        if not plans:
            return 0

        for plan in plans:
            if plan.term_id and getattr(plan.term, 'schedule_locked', False):
                raise ClassLessonPlanValidationError(
                    f'“{plan.sinif.ad}” döneminde program kilitli; silme yapılamaz.',
                    'term',
                )

        ids = [p.id for p in plans]
        ClassLessonPlan.objects.filter(id__in=ids).update(is_active=False)
        return len(ids)
    
    # ==================== YARDIMCI METODLAR ====================
    
    def get_total_weekly_hours(self, classroom_id: int, term_id: int) -> int:
        """Sınıfın toplam haftalık ders saati"""
        return self.repository.get_total_weekly_hours(classroom_id, term_id)
    
    def get_active_year_display(self) -> str:
        """Aktif eğitim yılı string"""
        try:
            year = get_active_academic_year()
            return str(year)
        except ActiveAcademicYearError:
            return "Aktif yıl yok"

    def build_planning_context(self, *, kurum_id: int, sube_id: int, context_egitim_yili_id: Optional[int] = None) -> Dict[str, Any]:
        """
        UI için sınıf/dönem bağlamı.
        Kaynak: aktif eğitim yılı + şube (Sinif, Term). Eğitim paketleri / OgrenciKayit FK değil.
        """
        from apps.sinif.domain.models import Sinif
        from apps.term.domain.models import Term

        year = get_active_academic_year()
        terms = Term.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili=year,
        ).order_by('order_no', 'start_date')

        classrooms = (
            Sinif.objects.filter(
                kurum_id=kurum_id,
                sube_id=sube_id,
                egitim_yili=year,
                aktif_mi=True,
            )
            .select_related('sinif_seviyesi', 'alan', 'oda')
            .order_by('ad')
        )

        classroom_rows = []
        for s in classrooms:
            classroom_rows.append({
                'id': s.id,
                'ad': s.ad,
                'kod': s.kod or '',
                'kapasite': s.kapasite,
                'ogrenci_sayisi': s.mevcutluk,
                'sinif_seviyesi_id': s.sinif_seviyesi_id,
                'sinif_seviyesi_ad': s.sinif_seviyesi.ad if s.sinif_seviyesi_id else None,
                'alan_id': s.alan_id,
                'alan_ad': s.alan.ad if s.alan_id else None,
                'oda_ad': s.oda.ad if s.oda_id else None,
            })

        term_rows = [{
            'id': t.id,
            'name': t.name,
            'code': t.code,
            'is_active': t.is_active,
            'schedule_locked': t.schedule_locked,
            'program_olusturulabilir': t.program_olusturulabilir,
            'order_no': t.order_no,
        } for t in terms]

        active_term = next((t for t in term_rows if t['is_active']), term_rows[0] if term_rows else None)

        return {
            'active_year': {
                'id': year.id,
                'yil_str': str(year),
                'baslangic_yil': year.baslangic_yil,
                'bitis_yil': year.bitis_yil,
            },
            'context_year_mismatch': bool(
                context_egitim_yili_id and int(context_egitim_yili_id) != year.id
            ),
            'terms': term_rows,
            'active_term_id': active_term['id'] if active_term else None,
            'classrooms': classroom_rows,
        }

    def list_ders_options_for_classroom(self, *, classroom_id: int, sube_id: int) -> List[Dict[str, Any]]:
        """
        Sınıf için aday dersler — Eğitim Tanımları kataloğu (şube + seviye/alan).
        Eğitim paketleri kaynak değildir.
        """
        from apps.egitim_tanimlari.models import Ders
        from apps.sinif.domain.models import Sinif

        try:
            sinif = Sinif.objects.select_related('sinif_seviyesi', 'alan').get(
                pk=classroom_id,
                sube_id=sube_id,
                aktif_mi=True,
            )
        except Sinif.DoesNotExist:
            raise ClassLessonPlanValidationError('Sınıf bulunamadı.', 'sinif')

        active_year = get_active_academic_year()
        if sinif.egitim_yili_id != active_year.id:
            raise ClassLessonPlanValidationError(
                'Sınıf aktif eğitim yılına ait değil.',
                'sinif',
            )

        qs = Ders.objects.filter(aktif_mi=True, sube_id=sube_id, kurum_id=sinif.kurum_id)

        if sinif.sinif_seviyesi_id:
            qs = qs.filter(
                Q(sinif_seviyeleri__id=sinif.sinif_seviyesi_id)
                | Q(sinif_seviyeleri__isnull=True)
            )
        if sinif.alan_id:
            qs = qs.filter(
                Q(alanlar__id=sinif.alan_id) | Q(alanlar__isnull=True)
            )

        qs = qs.distinct().order_by('ad')
        return [{'id': d.id, 'ad': d.ad, 'kod': d.kod or ''} for d in qs]

    def seed_from_alan(
        self,
        *,
        classroom_id: int,
        term_id: int,
        sube_id: int,
        default_weekly_hours: int = 2,
    ) -> Dict[str, Any]:
        """
        Sınıfın alanına bağlı standart derslerden eksik planları oluştur.
        Alan M2M'si boş olan (tüm alanlara açık) dersler seed'e dahil edilmez.
        """
        from apps.egitim_tanimlari.models import Ders
        from apps.sinif.domain.models import Sinif
        from apps.term.domain.models import Term

        try:
            sinif = Sinif.objects.select_related('sinif_seviyesi', 'alan').get(
                pk=classroom_id, sube_id=sube_id, aktif_mi=True,
            )
        except Sinif.DoesNotExist:
            raise ClassLessonPlanValidationError('Sınıf bulunamadı.', 'sinif')

        if not sinif.alan_id:
            raise ClassLessonPlanValidationError(
                'Bu sınıfa alan atanmamış. Eğitim Tanımları → Odalar & Sınıflar’dan alan seçin.',
                'alan',
            )

        try:
            term = Term.objects.get(pk=term_id, sube_id=sube_id)
        except Term.DoesNotExist:
            raise ClassLessonPlanValidationError('Dönem bulunamadı.', 'term')

        if term.schedule_locked:
            raise ClassLessonPlanValidationError(
                'Bu dönemin programı kilitli; plan eklenemez.',
                'term',
            )

        active_year = get_active_academic_year()
        if sinif.egitim_yili_id != active_year.id or term.egitim_yili_id != active_year.id:
            raise ClassLessonPlanValidationError(
                'Sınıf/dönem aktif eğitim yılına ait değil.',
                'egitim_yili',
            )

        qs = Ders.objects.filter(
            aktif_mi=True,
            sube_id=sube_id,
            kurum_id=sinif.kurum_id,
            alanlar__id=sinif.alan_id,
        )
        if sinif.sinif_seviyesi_id:
            qs = qs.filter(
                Q(sinif_seviyeleri__id=sinif.sinif_seviyesi_id)
                | Q(sinif_seviyeleri__isnull=True)
            )
        dersler = list(qs.distinct().order_by('ad'))

        created = []
        skipped = 0
        hours = max(1, int(default_weekly_hours or 2))

        for ders in dersler:
            if self.repository.check_duplicate(term_id, classroom_id, ders.id):
                skipped += 1
                continue
            plan = self.repository.create({
                'term_id': term_id,
                'sinif_id': classroom_id,
                'ders_id': ders.id,
                'ogretmen_id': None,
                'weekly_hours': hours,
                'credit': 0,
                'is_mandatory': True,
                'is_double_block': False,
                'priority': 1,
                'notes': None,
            })
            created.append(plan)

        return {
            'alan_id': sinif.alan_id,
            'alan_ad': sinif.alan.ad if sinif.alan_id else None,
            'created_count': len(created),
            'skipped_existing': skipped,
            'candidate_count': len(dersler),
            'plans': created,
        }

    def copy_to_classrooms(
        self,
        *,
        source_classroom_id: int,
        term_id: int,
        target_classroom_ids: List[int],
        sube_id: int,
        copy_teachers: bool = False,
        mode: str = 'skip_existing',
    ) -> Dict[str, Any]:
        """Kaynak sınıf planlarını hedef sınıflara kopyala."""
        from apps.sinif.domain.models import Sinif
        from apps.term.domain.models import Term

        if mode not in ('skip_existing', 'overwrite_hours'):
            raise ClassLessonPlanValidationError(
                'mode skip_existing veya overwrite_hours olmalı.',
                'mode',
            )

        try:
            term = Term.objects.get(pk=term_id, sube_id=sube_id)
        except Term.DoesNotExist:
            raise ClassLessonPlanValidationError('Dönem bulunamadı.', 'term')

        if term.schedule_locked:
            raise ClassLessonPlanValidationError(
                'Bu dönemin programı kilitli; kopyalama yapılamaz.',
                'term',
            )

        source_plans = list(
            self.repository.filter_by_classroom_and_term(source_classroom_id, term_id)
        )
        if not source_plans:
            raise ClassLessonPlanValidationError(
                'Kaynak sınıfta kopyalanacak plan yok.',
                'source_classroom_id',
            )

        targets = list(
            Sinif.objects.filter(
                id__in=target_classroom_ids,
                sube_id=sube_id,
                aktif_mi=True,
            )
        )
        if not targets:
            raise ClassLessonPlanValidationError(
                'Hedef sınıf bulunamadı.',
                'target_classroom_ids',
            )

        created = 0
        updated = 0
        skipped = 0
        per_target: List[Dict[str, Any]] = []

        for target in targets:
            if target.id == source_classroom_id:
                skipped += len(source_plans)
                per_target.append({
                    'classroom_id': target.id,
                    'classroom_ad': target.ad,
                    'created': 0,
                    'updated': 0,
                    'skipped': len(source_plans),
                })
                continue

            t_created = t_updated = t_skipped = 0
            for src in source_plans:
                existing = ClassLessonPlan.objects.filter(
                    is_active=True,
                    term_id=term_id,
                    sinif_id=target.id,
                    ders_id=src.ders_id,
                ).first()

                teacher_id = src.ogretmen_id if copy_teachers else None
                if teacher_id:
                    try:
                        self._validate_relations(
                            term_id=term_id,
                            sinif_id=target.id,
                            ders_id=src.ders_id,
                            ogretmen_id=teacher_id,
                            check_schedule_lock=False,
                        )
                    except ClassLessonPlanValidationError:
                        teacher_id = None

                if existing:
                    if mode == 'overwrite_hours':
                        self.repository.update(existing, {
                            'weekly_hours': src.weekly_hours,
                            'credit': src.credit,
                            'is_mandatory': src.is_mandatory,
                            'is_double_block': src.is_double_block,
                            'priority': src.priority,
                            'gorunen_ad': src.gorunen_ad or '',
                            'notes': src.notes,
                            **({'ogretmen_id': teacher_id} if copy_teachers else {}),
                        })
                        t_updated += 1
                        updated += 1
                    else:
                        t_skipped += 1
                        skipped += 1
                    continue

                try:
                    self._validate_relations(
                        term_id=term_id,
                        sinif_id=target.id,
                        ders_id=src.ders_id,
                        ogretmen_id=None,
                        check_schedule_lock=True,
                    )
                except ClassLessonPlanValidationError:
                    t_skipped += 1
                    skipped += 1
                    continue

                self.repository.create({
                    'term_id': term_id,
                    'sinif_id': target.id,
                    'ders_id': src.ders_id,
                    'ogretmen_id': teacher_id,
                    'weekly_hours': src.weekly_hours,
                    'credit': src.credit,
                    'is_mandatory': src.is_mandatory,
                    'is_double_block': src.is_double_block,
                    'priority': src.priority,
                    'preferred_room_type': src.preferred_room_type,
                    'gorunen_ad': src.gorunen_ad or '',
                    'notes': src.notes,
                })
                t_created += 1
                created += 1

            per_target.append({
                'classroom_id': target.id,
                'classroom_ad': target.ad,
                'created': t_created,
                'updated': t_updated,
                'skipped': t_skipped,
            })

        return {
            'source_classroom_id': source_classroom_id,
            'term_id': term_id,
            'copy_teachers': copy_teachers,
            'mode': mode,
            'created_count': created,
            'updated_count': updated,
            'skipped_count': skipped,
            'targets': per_target,
        }
