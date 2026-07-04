"""
Student Feature Engineering

Öğrenci için tahminsel analiz özelliklerini hesaplar.

Features:
- meeting_count_7d: Son 7 günde toplantı sayısı
- meeting_count_30d: Son 30 günde toplantı sayısı
- pending_events: Bekleyen event sayısı
- cancelled_meetings_ratio: İptal edilen toplantı oranı
- assignment_completion_rate: Ödev tamamlama oranı
- overdue_assignment_count: Gecikmiş ödev sayısı
- risk_score: Mevcut risk skoru (Faz3)
- engagement_score: Etkileşim skoru
- days_since_last_event: Son event'ten bu yana gün
- coach_load_ratio: Koçun yük oranı
- inactive_days: İnaktif gün sayısı
- assignment_volume_30d: Son 30 günde ödev sayısı
- assignment_completed_30d: Son 30 günde tamamlanan ödev
"""
import logging
from dataclasses import dataclass, asdict
from datetime import date, timedelta
from typing import Dict, Optional, List, Any

from django.db.models import Count, Q, Avg
from django.utils import timezone

logger = logging.getLogger(__name__)


@dataclass
class StudentFeatureVector:
    """Öğrenci özellik vektörü"""
    student_id: int
    coach_id: Optional[int]
    assignment_id: Optional[int]
    
    # Meeting özellikleri
    meeting_count_7d: int = 0
    meeting_count_30d: int = 0
    
    # Event özellikleri
    pending_events: int = 0
    cancelled_meetings: int = 0
    total_meetings: int = 0
    cancelled_meetings_ratio: float = 0.0
    
    # Ödev özellikleri
    assignment_volume_30d: int = 0
    assignment_completed_30d: int = 0
    assignment_completion_rate: float = 0.0
    overdue_assignment_count: int = 0
    
    # Risk ve engagement (Faz3'ten)
    risk_score: int = 0
    engagement_score: int = 0
    
    # Aktivite özellikleri
    days_since_last_event: int = 999  # Hiç event yoksa yüksek değer
    inactive_days: int = 0
    last_event_date: Optional[date] = None
    
    # Koç özellikleri
    coach_load_ratio: float = 0.0
    coach_capacity: int = 0
    coach_student_count: int = 0
    
    # Meta
    assignment_start_date: Optional[date] = None
    days_since_assignment: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Dictionary'e dönüştür"""
        result = asdict(self)
        # Date alanlarını string'e çevir
        if result.get('last_event_date'):
            result['last_event_date'] = result['last_event_date'].isoformat()
        if result.get('assignment_start_date'):
            result['assignment_start_date'] = result['assignment_start_date'].isoformat()
        return result


class StudentFeatureExtractor:
    """Öğrenci özellik çıkarıcısı"""
    
    def __init__(self):
        self.today = timezone.now().date()
    
    def extract_features(self, assignment) -> StudentFeatureVector:
        """
        Bir CoachStudentAssignment için özellikleri çıkar
        
        Args:
            assignment: CoachStudentAssignment instance
            
        Returns:
            StudentFeatureVector
        """
        from apps.coaching.models import CoachingEvent, CoachStudentAssignment
        
        student_id = assignment.student_id
        coach_id = assignment.coach_id
        
        # Feature vector oluştur
        features = StudentFeatureVector(
            student_id=student_id,
            coach_id=coach_id,
            assignment_id=assignment.id,
            assignment_start_date=assignment.start_date,
        )
        
        # Assignment süresini hesapla
        if assignment.start_date:
            features.days_since_assignment = (self.today - assignment.start_date).days
        
        # Event'leri çek
        events = CoachingEvent.objects.filter(
            student_id=student_id
        )
        
        # Tarih filtreleri
        seven_days_ago = self.today - timedelta(days=7)
        thirty_days_ago = self.today - timedelta(days=30)
        
        # Meeting sayıları
        meetings = events.filter(event_type='MEETING')
        features.total_meetings = meetings.count()
        features.meeting_count_7d = meetings.filter(
            event_date__gte=seven_days_ago
        ).count()
        features.meeting_count_30d = meetings.filter(
            event_date__gte=thirty_days_ago
        ).count()
        
        # İptal edilen toplantılar
        features.cancelled_meetings = meetings.filter(status='cancelled').count()
        if features.total_meetings > 0:
            features.cancelled_meetings_ratio = round(
                features.cancelled_meetings / features.total_meetings, 2
            )
        
        # Pending events
        features.pending_events = events.filter(status='pending').count()
        
        # Ödev özellikleri (ASSIGNMENT type)
        assignments = events.filter(event_type='ASSIGNMENT')
        features.assignment_volume_30d = assignments.filter(
            event_date__gte=thirty_days_ago
        ).count()
        features.assignment_completed_30d = assignments.filter(
            event_date__gte=thirty_days_ago,
            status='completed'
        ).count()
        
        if features.assignment_volume_30d > 0:
            features.assignment_completion_rate = round(
                features.assignment_completed_30d / features.assignment_volume_30d, 2
            )
        
        # Gecikmiş ödevler (pending ve event_date geçmiş)
        features.overdue_assignment_count = assignments.filter(
            status='pending',
            event_date__lt=self.today
        ).count()
        
        # Son event tarihi ve inaktif günler
        last_event = events.order_by('-event_date').first()
        if last_event and last_event.event_date:
            features.last_event_date = last_event.event_date.date() if hasattr(last_event.event_date, 'date') else last_event.event_date
            features.days_since_last_event = (self.today - features.last_event_date).days
            
            # Son 7 günde hiç event yoksa inactive sayılır
            if features.days_since_last_event > 7:
                features.inactive_days = features.days_since_last_event - 7
        
        # Risk ve engagement skorları (Faz3 servisleri)
        try:
            from apps.coaching.intelligence.services import RiskEngine, EngagementEngine
            from apps.coaching.models import CoachProfile
            
            # Risk skoru
            risk_engine = RiskEngine()
            risk = risk_engine.analyze_student(assignment)
            if risk:
                features.risk_score = risk.risk_score
            
            # Engagement skoru
            coach = CoachProfile.objects.filter(id=coach_id).first()
            if coach:
                engagement_engine = EngagementEngine()
                engagement = engagement_engine.calculate_coach_engagement(coach)
                features.engagement_score = engagement.engagement_score
                
                # Koç yük bilgileri
                features.coach_capacity = coach.capacity
                features.coach_student_count = CoachStudentAssignment.objects.filter(
                    coach_id=coach_id,
                    end_date__isnull=True
                ).count()
                
                if features.coach_capacity > 0:
                    features.coach_load_ratio = round(
                        features.coach_student_count / features.coach_capacity, 2
                    )
        except Exception as e:
            logger.warning(f"Risk/Engagement hesaplama hatası: {e}")
        
        return features
    
    def extract_all_features(self) -> List[StudentFeatureVector]:
        """Tüm aktif assignment'lar için özellikleri çıkar"""
        from apps.coaching.models import CoachStudentAssignment
        
        assignments = CoachStudentAssignment.objects.filter(
            end_date__isnull=True
        ).select_related('coach', 'student', 'coach__teacher')
        
        features_list = []
        for assignment in assignments:
            try:
                features = self.extract_features(assignment)
                features_list.append(features)
            except Exception as e:
                logger.error(f"Feature extraction hatası (student={assignment.student_id}): {e}")
        
        logger.info(f"Feature extraction tamamlandı: {len(features_list)} öğrenci")
        return features_list
    
    def get_aggregated_stats(self) -> Dict[str, Any]:
        """Tüm öğrenciler için toplu istatistikler"""
        all_features = self.extract_all_features()
        
        if not all_features:
            return {
                'total_students': 0,
                'avg_meeting_count_30d': 0,
                'avg_completion_rate': 0,
                'avg_risk_score': 0,
                'avg_engagement_score': 0,
                'high_risk_count': 0,
                'inactive_count': 0,
            }
        
        total = len(all_features)
        
        return {
            'total_students': total,
            'avg_meeting_count_30d': round(sum(f.meeting_count_30d for f in all_features) / total, 1),
            'avg_completion_rate': round(sum(f.assignment_completion_rate for f in all_features) / total * 100, 1),
            'avg_risk_score': round(sum(f.risk_score for f in all_features) / total, 1),
            'avg_engagement_score': round(sum(f.engagement_score for f in all_features) / total, 1),
            'high_risk_count': sum(1 for f in all_features if f.risk_score >= 60),
            'inactive_count': sum(1 for f in all_features if f.inactive_days > 7),
            'overdue_assignment_count': sum(f.overdue_assignment_count for f in all_features),
        }
