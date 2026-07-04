"""
Engagement Engine - Koç-Öğrenci Etkileşim Analizi

Hesaplamalar:
- Haftalık görüşme sayısı
- Tamamlama oranı
- Tepki süresi
- Engagement skoru
"""
import logging
from datetime import date, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass

from django.db.models import Count, Avg, Q
from django.utils import timezone

logger = logging.getLogger(__name__)


@dataclass
class EngagementMetrics:
    """Etkileşim metrikleri"""
    coach_id: int
    coach_name: str
    total_students: int
    active_students: int  # Son 14 günde event olan
    weekly_meetings: float  # Haftalık ortalama
    completion_rate: float  # 0-100%
    avg_response_days: float  # Ortalama tepki süresi
    engagement_score: int  # 0-100


class EngagementEngine:
    """
    Etkileşim analiz motoru
    
    Engagement skoru hesaplama:
    - Aktif öğrenci oranı: %30
    - Tamamlama oranı: %30
    - Haftalık görüşme: %25
    - Tepki süresi: %15
    """
    
    ACTIVE_DAYS_THRESHOLD = 14  # Son 14 günde event varsa aktif
    
    def __init__(self):
        pass
    
    def calculate_coach_engagement(self, coach) -> EngagementMetrics:
        """
        Tek koç için engagement metrikleri hesapla
        
        Args:
            coach: CoachProfile instance
            
        Returns:
            EngagementMetrics dataclass
        """
        from apps.coaching.models import CoachProfile, CoachStudentAssignment, CoachingEvent
        
        today = date.today()
        two_weeks_ago = today - timedelta(days=14)
        four_weeks_ago = today - timedelta(days=28)
        
        # Aktif atamalar
        active_assignments = CoachStudentAssignment.objects.filter(
            coach=coach,
            end_date__isnull=True
        ).select_related('student')
        
        total_students = active_assignments.count()
        
        # Son 14 günde event olan öğrenciler
        recent_events = CoachingEvent.objects.filter(
            coach=coach,
            event_date__date__gte=two_weeks_ago
        ).values('student_id').distinct()
        
        active_students = recent_events.count()
        
        # Haftalık görüşme ortalaması (son 4 hafta)
        meetings_last_4_weeks = CoachingEvent.objects.filter(
            coach=coach,
            event_type='MEETING',
            event_date__date__gte=four_weeks_ago
        ).count()
        
        weekly_meetings = meetings_last_4_weeks / 4.0
        
        # Tamamlama oranı (son 30 gün)
        month_ago = today - timedelta(days=30)
        completed_events = CoachingEvent.objects.filter(
            coach=coach,
            event_date__date__gte=month_ago,
            status='completed'
        ).count()
        
        total_events = CoachingEvent.objects.filter(
            coach=coach,
            event_date__date__gte=month_ago
        ).exclude(status='pending').count()
        
        completion_rate = (completed_events / total_events * 100) if total_events > 0 else 100.0
        
        # Ortalama tepki süresi (atama başlangıcından ilk event'e kadar)
        response_times = []
        for assignment in active_assignments:
            first_event = CoachingEvent.objects.filter(
                coach=coach,
                student=assignment.student
            ).order_by('created_at').first()
            
            if first_event:
                delta = (first_event.created_at.date() - assignment.start_date).days
                response_times.append(max(delta, 0))
        
        avg_response_days = sum(response_times) / len(response_times) if response_times else 0
        
        # Engagement skoru hesapla
        score = 0
        
        # Aktif öğrenci oranı (%30)
        if total_students > 0:
            active_ratio = active_students / total_students
            score += int(active_ratio * 30)
        else:
            score += 30  # Öğrenci yoksa tam puan
        
        # Tamamlama oranı (%30)
        score += int(completion_rate * 0.30)
        
        # Haftalık görüşme (%25) - Öğrenci başına haftada 1 görüşme ideal
        if total_students > 0:
            ideal_meetings = total_students
            meeting_ratio = min(weekly_meetings / ideal_meetings, 1.0) if ideal_meetings > 0 else 1.0
            score += int(meeting_ratio * 25)
        else:
            score += 25
        
        # Tepki süresi (%15) - 3 gün içinde ideal
        if avg_response_days <= 3:
            score += 15
        elif avg_response_days <= 7:
            score += 10
        elif avg_response_days <= 14:
            score += 5
        
        return EngagementMetrics(
            coach_id=coach.id,
            coach_name=f"{coach.teacher.ad} {coach.teacher.soyad}",
            total_students=total_students,
            active_students=active_students,
            weekly_meetings=round(weekly_meetings, 1),
            completion_rate=round(completion_rate, 1),
            avg_response_days=round(avg_response_days, 1),
            engagement_score=min(score, 100),
        )
    
    def calculate_all_coaches(self) -> List[EngagementMetrics]:
        """Tüm aktif koçlar için engagement hesapla"""
        from apps.coaching.models import CoachProfile
        
        logger.info("Engagement analizi başlatılıyor...")
        
        active_coaches = CoachProfile.objects.filter(
            is_active=True,
            is_coach=True
        ).select_related('teacher')
        
        metrics = []
        for coach in active_coaches:
            try:
                m = self.calculate_coach_engagement(coach)
                metrics.append(m)
            except Exception as e:
                logger.error(f"Engagement hesaplama hatası (coach={coach.id}): {e}")
        
        logger.info(f"Engagement analizi tamamlandı. {len(metrics)} koç analiz edildi.")
        
        return metrics
    
    def get_engagement_summary(self) -> Dict:
        """
        Genel engagement özeti
        
        Returns:
            {
                'total_coaches': int,
                'avg_engagement_score': float,
                'avg_completion_rate': float,
                'total_weekly_meetings': float,
                'coaches': List[dict]
            }
        """
        all_metrics = self.calculate_all_coaches()
        
        if not all_metrics:
            return {
                'total_coaches': 0,
                'avg_engagement_score': 0,
                'avg_completion_rate': 0,
                'total_weekly_meetings': 0,
                'coaches': []
            }
        
        avg_score = sum(m.engagement_score for m in all_metrics) / len(all_metrics)
        avg_completion = sum(m.completion_rate for m in all_metrics) / len(all_metrics)
        total_weekly = sum(m.weekly_meetings for m in all_metrics)
        
        return {
            'total_coaches': len(all_metrics),
            'avg_engagement_score': round(avg_score, 1),
            'avg_completion_rate': round(avg_completion, 1),
            'total_weekly_meetings': round(total_weekly, 1),
            'coaches': [
                {
                    'coach_id': m.coach_id,
                    'coach_name': m.coach_name,
                    'engagement_score': m.engagement_score,
                    'total_students': m.total_students,
                    'active_students': m.active_students,
                    'completion_rate': m.completion_rate,
                }
                for m in sorted(all_metrics, key=lambda x: x.engagement_score, reverse=True)
            ]
        }
