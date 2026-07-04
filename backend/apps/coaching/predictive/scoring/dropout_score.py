"""
Dropout Score Calculator

Rule-based hybrid dropout risk hesaplama.

Faktörler:
- risk_score (Faz3): %30 ağırlık
- inactivity (days_since_last_event): %20 ağırlık
- overdue_homework: %15 ağırlık
- low_engagement: %15 ağırlık
- cancelled_meetings_ratio: %10 ağırlık
- pending_events: %10 ağırlık

Çıktı: 0-100 skor, level (low/medium/high/critical)
"""
import logging
from dataclasses import dataclass
from typing import Optional

from apps.coaching.predictive.features.student_features import StudentFeatureVector

logger = logging.getLogger(__name__)


@dataclass
class DropoutResult:
    """Dropout hesaplama sonucu"""
    score: int  # 0-100
    level: str  # low, medium, high, critical
    factors: dict  # Detaylı faktör skorları
    reasons: list  # Risk nedenleri


class DropoutScorer:
    """
    Dropout riski hesaplayıcı
    
    Rule-based hybrid yaklaşım ile öğrenci
    dropout (bırakma) riskini tahmin eder.
    """
    
    # Ağırlıklar
    WEIGHTS = {
        'risk_score': 0.30,        # Faz3 risk skoru
        'inactivity': 0.20,        # İnaktivite
        'overdue_homework': 0.15,  # Gecikmiş ödev
        'low_engagement': 0.15,    # Düşük etkileşim
        'cancelled_ratio': 0.10,   # İptal oranı
        'pending_events': 0.10,    # Bekleyen eventler
    }
    
    # Eşik değerler
    THRESHOLDS = {
        'inactivity_days': 14,     # 14+ gün inaktif = yüksek risk
        'overdue_count': 3,        # 3+ gecikmiş ödev = yüksek risk
        'engagement_low': 40,      # 40 altı = düşük etkileşim
        'cancelled_high': 0.3,     # %30+ iptal = yüksek risk
        'pending_high': 5,         # 5+ pending = yüksek risk
    }
    
    def calculate(self, features: StudentFeatureVector) -> DropoutResult:
        """
        Dropout skorunu hesapla
        
        Args:
            features: StudentFeatureVector instance
            
        Returns:
            DropoutResult
        """
        factors = {}
        reasons = []
        
        # 1. Risk skoru faktörü (direkt kullan)
        factors['risk_score'] = min(features.risk_score, 100)
        if features.risk_score >= 60:
            reasons.append(f"Yüksek risk skoru ({features.risk_score})")
        
        # 2. İnaktivite faktörü
        inactivity_score = self._calculate_inactivity_score(features.days_since_last_event)
        factors['inactivity'] = inactivity_score
        if features.days_since_last_event > self.THRESHOLDS['inactivity_days']:
            reasons.append(f"{features.days_since_last_event} gündür inaktif")
        
        # 3. Gecikmiş ödev faktörü
        overdue_score = self._calculate_overdue_score(features.overdue_assignment_count)
        factors['overdue_homework'] = overdue_score
        if features.overdue_assignment_count >= self.THRESHOLDS['overdue_count']:
            reasons.append(f"{features.overdue_assignment_count} gecikmiş ödev")
        
        # 4. Düşük etkileşim faktörü
        engagement_score = self._calculate_engagement_factor(features.engagement_score)
        factors['low_engagement'] = engagement_score
        if features.engagement_score < self.THRESHOLDS['engagement_low']:
            reasons.append(f"Düşük etkileşim skoru ({features.engagement_score})")
        
        # 5. İptal oranı faktörü
        cancelled_score = self._calculate_cancelled_factor(features.cancelled_meetings_ratio)
        factors['cancelled_ratio'] = cancelled_score
        if features.cancelled_meetings_ratio > self.THRESHOLDS['cancelled_high']:
            reasons.append(f"Yüksek iptal oranı ({features.cancelled_meetings_ratio:.0%})")
        
        # 6. Pending events faktörü
        pending_score = self._calculate_pending_factor(features.pending_events)
        factors['pending_events'] = pending_score
        if features.pending_events >= self.THRESHOLDS['pending_high']:
            reasons.append(f"{features.pending_events} bekleyen işlem")
        
        # Ağırlıklı toplam hesapla
        weighted_score = sum(
            factors[key] * self.WEIGHTS[key]
            for key in self.WEIGHTS
        )
        
        # 0-100 aralığına normalize et
        final_score = min(max(int(weighted_score), 0), 100)
        
        # Level belirle
        level = self._get_level(final_score)
        
        return DropoutResult(
            score=final_score,
            level=level,
            factors=factors,
            reasons=reasons
        )
    
    def _calculate_inactivity_score(self, days: int) -> int:
        """İnaktivite skorunu hesapla (0-100)"""
        if days <= 3:
            return 0
        elif days <= 7:
            return 20
        elif days <= 14:
            return 50
        elif days <= 21:
            return 75
        else:
            return 100
    
    def _calculate_overdue_score(self, count: int) -> int:
        """Gecikmiş ödev skorunu hesapla (0-100)"""
        if count == 0:
            return 0
        elif count == 1:
            return 25
        elif count == 2:
            return 50
        elif count <= 4:
            return 75
        else:
            return 100
    
    def _calculate_engagement_factor(self, engagement: int) -> int:
        """Düşük etkileşim faktörünü hesapla (0-100)"""
        # Ters orantı: düşük engagement = yüksek risk faktörü
        if engagement >= 80:
            return 0
        elif engagement >= 60:
            return 25
        elif engagement >= 40:
            return 50
        elif engagement >= 20:
            return 75
        else:
            return 100
    
    def _calculate_cancelled_factor(self, ratio: float) -> int:
        """İptal oranı faktörünü hesapla (0-100)"""
        if ratio <= 0.1:
            return 0
        elif ratio <= 0.2:
            return 25
        elif ratio <= 0.3:
            return 50
        elif ratio <= 0.5:
            return 75
        else:
            return 100
    
    def _calculate_pending_factor(self, count: int) -> int:
        """Pending events faktörünü hesapla (0-100)"""
        if count <= 1:
            return 0
        elif count <= 3:
            return 25
        elif count <= 5:
            return 50
        elif count <= 8:
            return 75
        else:
            return 100
    
    def _get_level(self, score: int) -> str:
        """Skor seviyesini belirle"""
        if score >= 80:
            return 'critical'
        elif score >= 60:
            return 'high'
        elif score >= 40:
            return 'medium'
        else:
            return 'low'
    
    def is_intervention_required(self, result: DropoutResult) -> bool:
        """Müdahale gerekli mi?"""
        return result.level in ('critical', 'high')
