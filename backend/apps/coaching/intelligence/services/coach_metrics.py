"""
Coach Metrics Service - Koç Performans Metrikleri

Hesaplamalar:
- total_students: Toplam öğrenci
- active_students: Aktif öğrenci (son 14 günde event)
- risk_students: Riskli öğrenci sayısı
- weekly_meetings: Haftalık görüşme sayısı
- completion_rate: Tamamlama oranı
- engagement_score: Etkileşim skoru
"""
import logging
from datetime import date, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict

from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone

from .risk_engine import RiskEngine, RiskLevel
from .engagement_engine import EngagementEngine

logger = logging.getLogger(__name__)


# Cache timeout: 5 dakika
CACHE_TIMEOUT = 300


@dataclass
class CoachMetrics:
    """Koç metrikleri"""
    coach_id: int
    coach_name: str
    total_students: int
    active_students: int
    risk_students: int
    weekly_meetings: int
    completion_rate: float
    engagement_score: int
    pending_events: int
    completed_events: int
    cancelled_events: int
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class DashboardMetrics:
    """Dashboard genel metrikleri"""
    total_coaches: int
    total_students: int
    total_risk_students: int
    total_auto_events_today: int
    weekly_meetings: int
    avg_completion_rate: float
    avg_engagement_score: float
    risk_distribution: Dict[str, int]
    
    def to_dict(self) -> Dict:
        return asdict(self)


class CoachMetricsService:
    """
    Koç metrikleri servisi
    
    Cache destekli performans metrikleri
    """
    
    CACHE_KEY_DASHBOARD = 'coaching:dashboard:metrics'
    CACHE_KEY_COACH = 'coaching:coach:{}:metrics'
    
    def __init__(self):
        self.risk_engine = RiskEngine()
        self.engagement_engine = EngagementEngine()
    
    def get_coach_metrics(self, coach_id: int, use_cache: bool = True) -> Optional[CoachMetrics]:
        """
        Tek koç için metrikleri al
        
        Args:
            coach_id: Koç ID
            use_cache: Cache kullan
            
        Returns:
            CoachMetrics veya None
        """
        from apps.coaching.models import CoachProfile, CoachStudentAssignment, CoachingEvent
        
        cache_key = self.CACHE_KEY_COACH.format(coach_id)
        
        # Cache kontrolü
        if use_cache:
            cached = cache.get(cache_key)
            if cached:
                return CoachMetrics(**cached)
        
        try:
            coach = CoachProfile.objects.select_related('teacher').get(id=coach_id)
        except CoachProfile.DoesNotExist:
            return None
        
        today = date.today()
        two_weeks_ago = today - timedelta(days=14)
        four_weeks_ago = today - timedelta(days=28)
        month_ago = today - timedelta(days=30)
        
        # Öğrenci sayıları
        active_assignments = CoachStudentAssignment.objects.filter(
            coach=coach,
            end_date__isnull=True
        )
        total_students = active_assignments.count()
        
        # Son 14 günde event olan öğrenciler
        recent_student_ids = CoachingEvent.objects.filter(
            coach=coach,
            event_date__date__gte=two_weeks_ago
        ).values_list('student_id', flat=True).distinct()
        active_students = len(set(recent_student_ids))
        
        # Risk analizi
        all_risks = self.risk_engine.analyze_all_active_assignments()
        coach_risks = [r for r in all_risks if r.coach_id == coach_id]
        risk_students = len([r for r in coach_risks if r.risk_level in [RiskLevel.MEDIUM, RiskLevel.HIGH]])
        
        # Event istatistikleri
        events = CoachingEvent.objects.filter(coach=coach)
        
        # Haftalık görüşme (son 4 hafta ortalaması)
        meetings_4w = events.filter(
            event_type='MEETING',
            event_date__date__gte=four_weeks_ago
        ).count()
        weekly_meetings = meetings_4w // 4
        
        # Tamamlama oranı (son 30 gün)
        month_events = events.filter(event_date__date__gte=month_ago)
        completed = month_events.filter(status='completed').count()
        total_done = month_events.exclude(status='pending').count()
        completion_rate = (completed / total_done * 100) if total_done > 0 else 100.0
        
        # Event durumları
        pending_events = events.filter(status='pending').count()
        completed_events = events.filter(status='completed').count()
        cancelled_events = events.filter(status='cancelled').count()
        
        # Engagement skoru
        engagement = self.engagement_engine.calculate_coach_engagement(coach)
        
        metrics = CoachMetrics(
            coach_id=coach_id,
            coach_name=f"{coach.teacher.ad} {coach.teacher.soyad}",
            total_students=total_students,
            active_students=active_students,
            risk_students=risk_students,
            weekly_meetings=weekly_meetings,
            completion_rate=round(completion_rate, 1),
            engagement_score=engagement.engagement_score,
            pending_events=pending_events,
            completed_events=completed_events,
            cancelled_events=cancelled_events,
        )
        
        # Cache'e kaydet
        cache.set(cache_key, metrics.to_dict(), CACHE_TIMEOUT)
        
        return metrics
    
    def get_dashboard_metrics(self, use_cache: bool = True) -> DashboardMetrics:
        """
        Dashboard için genel metrikleri al
        
        Args:
            use_cache: Cache kullan
            
        Returns:
            DashboardMetrics
        """
        from apps.coaching.models import CoachProfile, CoachStudentAssignment, CoachingEvent
        
        # Cache kontrolü
        if use_cache:
            cached = cache.get(self.CACHE_KEY_DASHBOARD)
            if cached:
                return DashboardMetrics(**cached)
        
        today = date.today()
        week_ago = today - timedelta(days=7)
        
        # Koç sayısı
        total_coaches = CoachProfile.objects.filter(
            is_active=True,
            is_coach=True
        ).count()
        
        # Öğrenci sayısı
        total_students = CoachStudentAssignment.objects.filter(
            end_date__isnull=True
        ).values('student_id').distinct().count()
        
        # Risk analizi
        risk_summary = self.risk_engine.get_risk_summary()
        total_risk_students = risk_summary['high_risk'] + risk_summary['medium_risk']
        
        risk_distribution = {
            'low': risk_summary['low_risk'],
            'medium': risk_summary['medium_risk'],
            'high': risk_summary['high_risk'],
        }
        
        # Bugün oluşturulan auto eventler
        auto_events_today = CoachingEvent.objects.filter(
            event_source__startswith='auto_',
            created_at__date=today
        ).count()
        
        # Haftalık görüşme
        weekly_meetings = CoachingEvent.objects.filter(
            event_type='MEETING',
            event_date__date__gte=week_ago
        ).count()
        
        # Engagement özeti
        engagement_summary = self.engagement_engine.get_engagement_summary()
        
        metrics = DashboardMetrics(
            total_coaches=total_coaches,
            total_students=total_students,
            total_risk_students=total_risk_students,
            total_auto_events_today=auto_events_today,
            weekly_meetings=weekly_meetings,
            avg_completion_rate=engagement_summary['avg_completion_rate'],
            avg_engagement_score=engagement_summary['avg_engagement_score'],
            risk_distribution=risk_distribution,
        )
        
        # Cache'e kaydet
        cache.set(self.CACHE_KEY_DASHBOARD, metrics.to_dict(), CACHE_TIMEOUT)
        
        return metrics
    
    def invalidate_cache(self, coach_id: Optional[int] = None):
        """
        Cache'i temizle
        
        Args:
            coach_id: Belirli koç için temizle, None ise tümünü temizle
        """
        if coach_id:
            cache.delete(self.CACHE_KEY_COACH.format(coach_id))
        else:
            # Dashboard cache'ini temizle
            cache.delete(self.CACHE_KEY_DASHBOARD)
            # Tüm koç cache'lerini temizlemek için pattern silme gerekir
            # Bu basit implementasyonda sadece dashboard temizlenir
        
        logger.debug(f"Cache temizlendi: coach_id={coach_id}")
    
    def refresh_all_metrics(self) -> Dict:
        """
        Tüm metrikleri yeniden hesapla ve cache'le
        
        Returns:
            {'dashboard': DashboardMetrics, 'coaches': List[CoachMetrics]}
        """
        from apps.coaching.models import CoachProfile
        
        logger.info("Tüm metrikler yenileniyor...")
        
        # Dashboard
        dashboard = self.get_dashboard_metrics(use_cache=False)
        
        # Tüm koçlar
        coaches = []
        for coach in CoachProfile.objects.filter(is_active=True, is_coach=True):
            metrics = self.get_coach_metrics(coach.id, use_cache=False)
            if metrics:
                coaches.append(metrics)
        
        logger.info(f"Metrikler yenilendi. {len(coaches)} koç.")
        
        return {
            'dashboard': dashboard.to_dict(),
            'coaches': [c.to_dict() for c in coaches],
        }
