"""
Risk Engine - Öğrenci Risk Analizi

Risk Kuralları:
1. Son X günde coaching event yok
2. Assignment var ama meeting yok
3. Çok fazla pending event
4. Ardışık cancelled meeting
5. Metadata içinde risk flag
"""
import logging
from datetime import date, timedelta
from typing import Dict, List, Optional, NamedTuple
from dataclasses import dataclass
from enum import Enum

from django.db.models import Count, Q
from django.utils import timezone

logger = logging.getLogger(__name__)


class RiskLevel(str, Enum):
    LOW = 'low'
    MEDIUM = 'medium'
    HIGH = 'high'


@dataclass
class StudentRisk:
    """Öğrenci risk bilgisi"""
    student_id: int
    student_name: str
    coach_id: int
    coach_name: str
    risk_score: int  # 0-100
    risk_level: RiskLevel
    reasons: List[str]
    last_event_date: Optional[date]
    assignment_start_date: Optional[date]


class RiskEngine:
    """
    Öğrenci risk analiz motoru
    
    Risk skorları:
    - 0-30: LOW
    - 31-60: MEDIUM
    - 61-100: HIGH
    """
    
    # Konfigürasyon
    INACTIVITY_DAYS_WARNING = 7    # 7 gün event yok = warning
    INACTIVITY_DAYS_CRITICAL = 14  # 14 gün event yok = critical
    MAX_PENDING_EVENTS = 3         # 3+ pending = risk
    CANCELLED_STREAK_THRESHOLD = 2 # Ardışık 2 iptal = risk
    
    # Risk ağırlıkları
    WEIGHT_INACTIVITY = 35
    WEIGHT_NO_MEETING = 25
    WEIGHT_PENDING_OVERLOAD = 20
    WEIGHT_CANCELLED_STREAK = 15
    WEIGHT_METADATA_FLAG = 5
    
    def __init__(self):
        # Lazy imports to avoid circular dependencies
        pass
    
    def analyze_student(self, assignment) -> StudentRisk:
        """
        Tek öğrenci için risk analizi
        
        Args:
            assignment: CoachStudentAssignment instance
            
        Returns:
            StudentRisk dataclass
        """
        from apps.coaching.models import CoachingEvent
        
        student = assignment.student
        coach = assignment.coach
        
        risk_score = 0
        reasons = []
        today = date.today()
        
        # Öğrencinin coaching eventlerini al
        events = CoachingEvent.objects.filter(
            student=student,
            coach=coach
        ).order_by('-event_date')
        
        # Son event tarihi
        last_event = events.first()
        last_event_date = last_event.event_date.date() if last_event else None
        
        # 1. İnaktivite kontrolü
        if last_event_date:
            days_since_last = (today - last_event_date).days
            if days_since_last >= self.INACTIVITY_DAYS_CRITICAL:
                risk_score += self.WEIGHT_INACTIVITY
                reasons.append(f"{days_since_last} gündür etkinlik yok (kritik)")
            elif days_since_last >= self.INACTIVITY_DAYS_WARNING:
                risk_score += self.WEIGHT_INACTIVITY // 2
                reasons.append(f"{days_since_last} gündür etkinlik yok")
        else:
            # Hiç event yok
            days_since_assignment = (today - assignment.start_date).days
            if days_since_assignment > self.INACTIVITY_DAYS_WARNING:
                risk_score += self.WEIGHT_INACTIVITY
                reasons.append(f"Atamadan bu yana ({days_since_assignment} gün) hiç etkinlik yok")
        
        # 2. Meeting kontrolü
        meeting_count = events.filter(event_type='MEETING').count()
        if meeting_count == 0:
            days_since_assignment = (today - assignment.start_date).days
            if days_since_assignment > 7:
                risk_score += self.WEIGHT_NO_MEETING
                reasons.append("Henüz görüşme yapılmamış")
        
        # 3. Pending event sayısı
        pending_count = events.filter(status='pending').count()
        if pending_count >= self.MAX_PENDING_EVENTS:
            risk_score += self.WEIGHT_PENDING_OVERLOAD
            reasons.append(f"{pending_count} bekleyen etkinlik var")
        
        # 4. Ardışık iptal kontrolü
        recent_events = events.filter(
            event_type='MEETING'
        ).order_by('-event_date')[:5]
        
        cancelled_streak = 0
        for event in recent_events:
            if event.status == 'cancelled':
                cancelled_streak += 1
            else:
                break
        
        if cancelled_streak >= self.CANCELLED_STREAK_THRESHOLD:
            risk_score += self.WEIGHT_CANCELLED_STREAK
            reasons.append(f"Son {cancelled_streak} görüşme iptal edilmiş")
        
        # 5. Metadata flag kontrolü
        risk_events = events.filter(
            metadata__contains={'risk_flag': True}
        )
        if risk_events.exists():
            risk_score += self.WEIGHT_METADATA_FLAG
            reasons.append("Önceki etkinliklerde risk işareti var")
        
        # Risk seviyesi belirleme
        if risk_score >= 61:
            risk_level = RiskLevel.HIGH
        elif risk_score >= 31:
            risk_level = RiskLevel.MEDIUM
        else:
            risk_level = RiskLevel.LOW
        
        return StudentRisk(
            student_id=student.id,
            student_name=f"{student.ad} {student.soyad}",
            coach_id=coach.id,
            coach_name=f"{coach.teacher.ad} {coach.teacher.soyad}",
            risk_score=min(risk_score, 100),
            risk_level=risk_level,
            reasons=reasons,
            last_event_date=last_event_date,
            assignment_start_date=assignment.start_date,
        )
    
    def analyze_all_active_assignments(self) -> List[StudentRisk]:
        """
        Tüm aktif atamaları analiz et
        
        Returns:
            List[StudentRisk] - Tüm öğrencilerin risk bilgileri
        """
        from apps.coaching.models import CoachStudentAssignment
        
        logger.info("Risk analizi başlatılıyor...")
        
        active_assignments = CoachStudentAssignment.objects.filter(
            end_date__isnull=True
        ).select_related(
            'student', 'coach', 'coach__teacher'
        )
        
        risks = []
        for assignment in active_assignments:
            try:
                risk = self.analyze_student(assignment)
                risks.append(risk)
            except Exception as e:
                logger.error(f"Risk analizi hatası (student={assignment.student_id}): {e}")
        
        logger.info(f"Risk analizi tamamlandı. {len(risks)} öğrenci analiz edildi.")
        
        return risks
    
    def get_high_risk_students(self, coach_id: int = None) -> List[StudentRisk]:
        """
        Yüksek riskli öğrencileri döndür
        
        Args:
            coach_id: Belirli bir koçun öğrencileri için filtre (opsiyonel)
        """
        all_risks = self.analyze_all_active_assignments()
        high_risks = [r for r in all_risks if r.risk_level == RiskLevel.HIGH]
        
        if coach_id:
            high_risks = [r for r in high_risks if r.coach_id == coach_id]
        
        return high_risks
    
    def get_risk_summary(self) -> Dict:
        """
        Risk özeti döndür
        
        Returns:
            {
                'total_students': int,
                'low_risk': int,
                'medium_risk': int,
                'high_risk': int,
                'high_risk_students': List[dict]
            }
        """
        all_risks = self.analyze_all_active_assignments()
        
        summary = {
            'total_students': len(all_risks),
            'low_risk': len([r for r in all_risks if r.risk_level == RiskLevel.LOW]),
            'medium_risk': len([r for r in all_risks if r.risk_level == RiskLevel.MEDIUM]),
            'high_risk': len([r for r in all_risks if r.risk_level == RiskLevel.HIGH]),
            'high_risk_students': [
                {
                    'student_id': r.student_id,
                    'student_name': r.student_name,
                    'coach_name': r.coach_name,
                    'risk_score': r.risk_score,
                    'reasons': r.reasons,
                }
                for r in all_risks if r.risk_level == RiskLevel.HIGH
            ]
        }
        
        return summary
