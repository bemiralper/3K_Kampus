"""
Weekly Plan Generator

Öğrenci için otomatik haftalık plan önerisi.

Çıktı:
- meetings_suggested: Önerilen toplantı sayısı
- homework_volume: Önerilen ödev yoğunluğu (low/medium/high)
- focus_subjects: Odaklanılması gereken konular
- intervention_required: Acil müdahale gerekli mi
- recommendations: Öneriler listesi
"""
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional

from apps.coaching.predictive.features.student_features import StudentFeatureVector
from apps.coaching.predictive.scoring.dropout_score import DropoutScorer, DropoutResult

logger = logging.getLogger(__name__)


@dataclass
class WeeklyPlan:
    """Haftalık plan önerisi"""
    student_id: int
    meetings_suggested: int  # Bu hafta önerilen toplantı sayısı
    homework_volume: str  # low, medium, high
    focus_areas: List[str] = field(default_factory=list)
    intervention_required: bool = False
    priority_level: str = 'normal'  # low, normal, high, urgent
    recommendations: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return {
            'student_id': self.student_id,
            'meetings_suggested': self.meetings_suggested,
            'homework_volume': self.homework_volume,
            'focus_areas': self.focus_areas,
            'intervention_required': self.intervention_required,
            'priority_level': self.priority_level,
            'recommendations': self.recommendations,
        }


class WeeklyPlanGenerator:
    """
    Haftalık plan üretici
    
    Öğrenci özelliklerine ve dropout riskine göre
    koç için haftalık çalışma planı önerir.
    """
    
    def __init__(self):
        self.dropout_scorer = DropoutScorer()
    
    def generate(
        self,
        features: StudentFeatureVector,
        dropout_result: Optional[DropoutResult] = None
    ) -> WeeklyPlan:
        """
        Haftalık plan oluştur
        
        Args:
            features: StudentFeatureVector
            dropout_result: Önceden hesaplanmış dropout sonucu (opsiyonel)
            
        Returns:
            WeeklyPlan
        """
        # Dropout sonucu yoksa hesapla
        if dropout_result is None:
            dropout_result = self.dropout_scorer.calculate(features)
        
        plan = WeeklyPlan(student_id=features.student_id)
        
        # Dropout seviyesine göre öncelik
        plan.priority_level = self._get_priority(dropout_result.level)
        plan.intervention_required = dropout_result.level in ('critical', 'high')
        
        # Toplantı önerisi
        plan.meetings_suggested = self._suggest_meetings(features, dropout_result)
        
        # Ödev yoğunluğu
        plan.homework_volume = self._suggest_homework_volume(features, dropout_result)
        
        # Odak alanları
        plan.focus_areas = self._identify_focus_areas(features, dropout_result)
        
        # Öneriler
        plan.recommendations = self._generate_recommendations(features, dropout_result)
        
        return plan
    
    def _get_priority(self, dropout_level: str) -> str:
        """Dropout seviyesinden öncelik belirle"""
        mapping = {
            'critical': 'urgent',
            'high': 'high',
            'medium': 'normal',
            'low': 'low',
        }
        return mapping.get(dropout_level, 'normal')
    
    def _suggest_meetings(
        self,
        features: StudentFeatureVector,
        dropout: DropoutResult
    ) -> int:
        """Önerilen toplantı sayısı"""
        # Baz: haftada 1 toplantı
        meetings = 1
        
        # Yüksek risk = daha fazla toplantı
        if dropout.level == 'critical':
            meetings = 3
        elif dropout.level == 'high':
            meetings = 2
        elif dropout.level == 'medium':
            meetings = 2
        
        # İnaktif öğrenci = ek toplantı
        if features.days_since_last_event > 14:
            meetings += 1
        
        # Gecikmiş ödev = takip toplantısı
        if features.overdue_assignment_count >= 3:
            meetings += 1
        
        return min(meetings, 4)  # Maksimum 4
    
    def _suggest_homework_volume(
        self,
        features: StudentFeatureVector,
        dropout: DropoutResult
    ) -> str:
        """Önerilen ödev yoğunluğu"""
        # Düşük tamamlama = yoğunluğu azalt
        if features.assignment_completion_rate < 0.5:
            return 'low'
        
        # Çok fazla gecikmiş = hafiflet
        if features.overdue_assignment_count >= 3:
            return 'low'
        
        # Kritik dropout = hafiflet (önce stabilize)
        if dropout.level == 'critical':
            return 'low'
        
        # Yüksek risk = orta
        if dropout.level == 'high':
            return 'medium'
        
        # İyi tamamlama = artır
        if features.assignment_completion_rate >= 0.8:
            return 'high'
        
        return 'medium'
    
    def _identify_focus_areas(
        self,
        features: StudentFeatureVector,
        dropout: DropoutResult
    ) -> List[str]:
        """Odaklanılması gereken alanlar"""
        areas = []
        
        # Dropout nedenlerinden çıkar
        if features.days_since_last_event > 14:
            areas.append('İletişimi yeniden başlat')
        
        if features.overdue_assignment_count > 0:
            areas.append('Gecikmiş ödevleri tamamlat')
        
        if features.cancelled_meetings_ratio > 0.3:
            areas.append('Toplantı katılımını artır')
        
        if features.engagement_score < 40:
            areas.append('Motivasyonu artır')
        
        if features.pending_events > 5:
            areas.append('Bekleyen görevleri azalt')
        
        # Hiçbir sorun yoksa
        if not areas:
            areas.append('Mevcut performansı koru')
        
        return areas[:3]  # Maksimum 3 odak
    
    def _generate_recommendations(
        self,
        features: StudentFeatureVector,
        dropout: DropoutResult
    ) -> List[str]:
        """Koç için öneriler listesi"""
        recs = []
        
        # Kritik müdahale
        if dropout.level == 'critical':
            recs.append("🚨 ACİL: Öğrenci ile yüz yüze görüşme planlayın")
            recs.append("Veli ile iletişime geçin")
        
        # İnaktivite
        if features.days_since_last_event > 21:
            recs.append("3 haftadır iletişim yok - telefon görüşmesi yapın")
        elif features.days_since_last_event > 14:
            recs.append("2 haftadır iletişim yok - mesaj gönderin")
        elif features.days_since_last_event > 7:
            recs.append("Haftalık check-in yapın")
        
        # Ödev takibi
        if features.overdue_assignment_count >= 3:
            recs.append(f"{features.overdue_assignment_count} gecikmiş ödev var - takip edin")
        
        # Düşük tamamlama
        if features.assignment_completion_rate < 0.5:
            recs.append("Ödev yükünü hafifletin")
            recs.append("Daha küçük ve ulaşılabilir hedefler belirleyin")
        
        # İptal sorunu
        if features.cancelled_meetings_ratio > 0.3:
            recs.append("Toplantı iptal nedenleri araştırın")
            recs.append("Alternatif toplantı saatleri önerin")
        
        # Düşük engagement
        if features.engagement_score < 40:
            recs.append("İlgi alanlarına yönelik içerik önerin")
            recs.append("Kısa vadeli başarı hedefleri koyun")
        
        # İyi durumda
        if dropout.level == 'low' and not recs:
            recs.append("✅ Öğrenci iyi durumda - mevcut yaklaşımı sürdürün")
        
        return recs[:5]  # Maksimum 5 öneri
    
    def generate_bulk(
        self,
        features_list: List[StudentFeatureVector]
    ) -> List[WeeklyPlan]:
        """Toplu plan oluştur"""
        plans = []
        for features in features_list:
            try:
                plan = self.generate(features)
                plans.append(plan)
            except Exception as e:
                logger.error(f"Plan üretim hatası (student={features.student_id}): {e}")
        
        return plans
