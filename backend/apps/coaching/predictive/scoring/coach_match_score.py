"""
Coach Match Score Calculator

Öğrenci-Koç uyum skoru hesaplama.

Öğrenci faktörleri:
- risk_tipi (high risk = deneyimli koç)
- çalışma yoğunluğu (assignment volume)
- meeting ihtiyacı (inaktivite)

Koç faktörleri:
- kapasite_uygunluk
- meeting yoğunluğu
- geçmiş başarı (completion rate)

Çıktı: coach_id → match_score (0-100)
"""
import logging
from dataclasses import dataclass
from typing import List, Dict, Optional

from django.db.models import Avg, Count, Q
from django.utils import timezone
from datetime import timedelta

logger = logging.getLogger(__name__)


@dataclass
class CoachMatchResult:
    """Koç eşleşme sonucu"""
    coach_id: int
    coach_name: str
    match_score: int  # 0-100
    factors: dict
    capacity_available: int
    current_load: int
    capacity_total: int


class CoachMatchScorer:
    """
    Koç eşleştirme skorlayıcı
    
    Öğrenci profili ile koç profilini karşılaştırarak
    en uygun koç önerilerini döndürür.
    """
    
    # Ağırlıklar
    WEIGHTS = {
        'capacity_fit': 0.30,       # Kapasite uygunluğu
        'workload_match': 0.25,     # İş yükü uyumu
        'experience_match': 0.25,   # Deneyim uyumu
        'success_rate': 0.20,       # Geçmiş başarı oranı
    }
    
    def get_matches(
        self,
        student_id: int,
        risk_score: int = 0,
        needs_high_attention: bool = False,
        limit: int = 5
    ) -> List[CoachMatchResult]:
        """
        Öğrenci için koç eşleşmelerini hesapla
        
        Args:
            student_id: Öğrenci ID
            risk_score: Öğrenci risk skoru
            needs_high_attention: Yüksek ilgi gerektiriyor mu
            limit: Maksimum sonuç sayısı
            
        Returns:
            List[CoachMatchResult] sıralı (en uygundan en az uygun)
        """
        from apps.coaching.models import CoachProfile, CoachStudentAssignment, CoachingEvent
        
        # Aktif koçları al
        coaches = CoachProfile.objects.filter(
            is_active=True,
            is_coach=True
        ).select_related('teacher')
        
        results = []
        
        for coach in coaches:
            # Mevcut öğrenci sayısı
            current_load = CoachStudentAssignment.objects.filter(
                coach=coach,
                end_date__isnull=True
            ).count()
            
            # Kapasite doluysa atla
            if current_load >= coach.capacity:
                continue
            
            capacity_available = coach.capacity - current_load
            
            # Faktörleri hesapla
            factors = {}
            
            # 1. Kapasite uygunluğu (boş kapasite yüzdesi)
            factors['capacity_fit'] = self._calculate_capacity_fit(
                current_load, coach.capacity
            )
            
            # 2. İş yükü uyumu
            factors['workload_match'] = self._calculate_workload_match(
                coach.id, risk_score, needs_high_attention
            )
            
            # 3. Deneyim uyumu (yüksek riskli öğrenci = deneyimli koç)
            factors['experience_match'] = self._calculate_experience_match(
                coach.id, risk_score
            )
            
            # 4. Geçmiş başarı oranı
            factors['success_rate'] = self._calculate_success_rate(coach.id)
            
            # Ağırlıklı toplam
            match_score = sum(
                factors[key] * self.WEIGHTS[key]
                for key in self.WEIGHTS
            )
            
            match_score = min(max(int(match_score), 0), 100)
            
            # Koç adı
            coach_name = 'N/A'
            if coach.teacher:
                coach_name = f"{coach.teacher.ad} {coach.teacher.soyad}"
            
            results.append(CoachMatchResult(
                coach_id=coach.id,
                coach_name=coach_name,
                match_score=match_score,
                factors=factors,
                capacity_available=capacity_available,
                current_load=current_load,
                capacity_total=coach.capacity
            ))
        
        # Skora göre sırala
        results.sort(key=lambda x: x.match_score, reverse=True)
        
        return results[:limit]
    
    def _calculate_capacity_fit(self, current: int, capacity: int) -> int:
        """Kapasite uygunluğu skoru (0-100)"""
        if capacity == 0:
            return 0
        
        load_ratio = current / capacity
        
        if load_ratio <= 0.5:
            return 100  # %50'den az doluluk = ideal
        elif load_ratio <= 0.7:
            return 80
        elif load_ratio <= 0.85:
            return 60
        elif load_ratio < 1:
            return 40
        else:
            return 0  # Dolu
    
    def _calculate_workload_match(
        self,
        coach_id: int,
        student_risk: int,
        needs_attention: bool
    ) -> int:
        """İş yükü uyumu skoru (0-100)"""
        from apps.coaching.models import CoachStudentAssignment
        
        # Koçun mevcut yüksek riskli öğrenci sayısı
        # (Şimdilik assignment sayısına göre basit hesaplama)
        current_students = CoachStudentAssignment.objects.filter(
            coach_id=coach_id,
            end_date__isnull=True
        ).count()
        
        # Yüksek riskli öğrenci veya dikkat gerektiren
        if student_risk >= 60 or needs_attention:
            # Düşük yüklü koçlara öncelik
            if current_students <= 10:
                return 100
            elif current_students <= 15:
                return 70
            elif current_students <= 20:
                return 50
            else:
                return 30
        else:
            # Normal öğrenci için dengeli dağılım
            if current_students <= 15:
                return 100
            elif current_students <= 20:
                return 80
            elif current_students <= 25:
                return 60
            else:
                return 40
    
    def _calculate_experience_match(self, coach_id: int, student_risk: int) -> int:
        """Deneyim uyumu skoru (0-100)"""
        from apps.coaching.models import CoachStudentAssignment
        
        # Toplam tamamlanmış assignment sayısı (deneyim göstergesi)
        completed_count = CoachStudentAssignment.objects.filter(
            coach_id=coach_id,
            end_date__isnull=False  # Tamamlanmış
        ).count()
        
        # Koç deneyim seviyesi
        if completed_count >= 20:
            experience_level = 'senior'
        elif completed_count >= 10:
            experience_level = 'intermediate'
        else:
            experience_level = 'junior'
        
        # Yüksek riskli öğrenci = deneyimli koç tercih et
        if student_risk >= 60:
            if experience_level == 'senior':
                return 100
            elif experience_level == 'intermediate':
                return 70
            else:
                return 40
        elif student_risk >= 40:
            # Orta risk = orta deneyim uygun
            if experience_level == 'senior':
                return 80
            elif experience_level == 'intermediate':
                return 100
            else:
                return 60
        else:
            # Düşük risk = herkes uygun
            return 80
    
    def _calculate_success_rate(self, coach_id: int) -> int:
        """Geçmiş başarı oranı skoru (0-100)"""
        from apps.coaching.models import CoachingEvent
        from datetime import timedelta
        
        # Son 90 günde tamamlanan event oranı
        ninety_days_ago = timezone.now() - timedelta(days=90)
        
        events = CoachingEvent.objects.filter(
            coach_id=coach_id,
            created_at__gte=ninety_days_ago
        )
        
        total = events.count()
        if total == 0:
            return 70  # Veri yoksa ortalama kabul et
        
        completed = events.filter(status='completed').count()
        completion_rate = completed / total
        
        return min(int(completion_rate * 100), 100)
