"""
Success Score Calculator

Öğrenci başarı potansiyeli hesaplama.

Faktörler:
- assignment_completion_rate: %35 ağırlık
- meeting_frequency: %25 ağırlık
- engagement_score: %25 ağırlık
- risk_inverse: %15 ağırlık (düşük risk = yüksek başarı)

Çıktı: 0-100 skor
"""
import logging
from dataclasses import dataclass
from typing import Optional

from apps.coaching.predictive.features.student_features import StudentFeatureVector

logger = logging.getLogger(__name__)


@dataclass
class SuccessResult:
    """Başarı hesaplama sonucu"""
    score: int  # 0-100
    level: str  # low, moderate, good, excellent
    factors: dict  # Detaylı faktör skorları
    strengths: list  # Güçlü yönler


class SuccessScorer:
    """
    Başarı potansiyeli hesaplayıcı
    
    Öğrencinin coaching sürecindeki
    başarı potansiyelini tahmin eder.
    """
    
    # Ağırlıklar
    WEIGHTS = {
        'completion_rate': 0.35,    # Ödev tamamlama
        'meeting_frequency': 0.25,   # Toplantı sıklığı
        'engagement': 0.25,          # Etkileşim
        'risk_inverse': 0.15,        # Risk tersi
    }
    
    # Hedef değerler
    TARGETS = {
        'meetings_per_month': 4,     # Aylık hedef toplantı
        'completion_rate': 0.8,      # Hedef tamamlama oranı
    }
    
    def calculate(self, features: StudentFeatureVector) -> SuccessResult:
        """
        Başarı skorunu hesapla
        
        Args:
            features: StudentFeatureVector instance
            
        Returns:
            SuccessResult
        """
        factors = {}
        strengths = []
        
        # 1. Tamamlama oranı faktörü
        completion_score = self._calculate_completion_score(features.assignment_completion_rate)
        factors['completion_rate'] = completion_score
        if features.assignment_completion_rate >= 0.8:
            strengths.append(f"Yüksek ödev tamamlama ({features.assignment_completion_rate:.0%})")
        
        # 2. Toplantı sıklığı faktörü
        meeting_score = self._calculate_meeting_score(features.meeting_count_30d)
        factors['meeting_frequency'] = meeting_score
        if features.meeting_count_30d >= self.TARGETS['meetings_per_month']:
            strengths.append(f"Düzenli toplantı katılımı ({features.meeting_count_30d}/ay)")
        
        # 3. Etkileşim faktörü
        engagement_score = min(features.engagement_score, 100)
        factors['engagement'] = engagement_score
        if features.engagement_score >= 70:
            strengths.append(f"Yüksek etkileşim skoru ({features.engagement_score})")
        
        # 4. Risk tersi faktörü (düşük risk = yüksek başarı)
        risk_inverse = 100 - min(features.risk_score, 100)
        factors['risk_inverse'] = risk_inverse
        if features.risk_score <= 30:
            strengths.append("Düşük risk profili")
        
        # Ağırlıklı toplam hesapla
        weighted_score = sum(
            factors[key] * self.WEIGHTS[key]
            for key in self.WEIGHTS
        )
        
        # 0-100 aralığına normalize et
        final_score = min(max(int(weighted_score), 0), 100)
        
        # Level belirle
        level = self._get_level(final_score)
        
        return SuccessResult(
            score=final_score,
            level=level,
            factors=factors,
            strengths=strengths
        )
    
    def _calculate_completion_score(self, rate: float) -> int:
        """Tamamlama skoru hesapla (0-100)"""
        # 0-1 aralığından 0-100'e dönüştür
        return min(int(rate * 100), 100)
    
    def _calculate_meeting_score(self, count: int) -> int:
        """Toplantı skoru hesapla (0-100)"""
        target = self.TARGETS['meetings_per_month']
        
        if count >= target:
            return 100
        elif count == 0:
            return 0
        else:
            # Hedefe göre orantılı skor
            return min(int((count / target) * 100), 100)
    
    def _get_level(self, score: int) -> str:
        """Skor seviyesini belirle"""
        if score >= 80:
            return 'excellent'
        elif score >= 60:
            return 'good'
        elif score >= 40:
            return 'moderate'
        else:
            return 'low'
