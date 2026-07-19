"""
Coaching Intelligence API Views
"""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated

from apps.coaching.models import CoachProfile, CoachStudentAssignment, CoachingEvent
from apps.coaching.services.coach_access import is_resource_admin, user_can_access_student
from apps.coaching.intelligence.services import (
    RiskEngine,
    EngagementEngine,
    EventGenerator,
    CoachMetricsService,
)

logger = logging.getLogger(__name__)


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """CSRF kontrolünü devre dışı bırakan session authentication"""
    def enforce_csrf(self, request):
        return


def _deny_if_not_admin(request):
    if not is_resource_admin(request.user):
        return Response({
            'success': False,
            'error': 'Bu işlem için yönetici yetkisi gerekli.',
        }, status=status.HTTP_403_FORBIDDEN)
    return None


def _deny_if_no_student_access(request, student_id):
    if not user_can_access_student(request.user, student_id):
        return Response({
            'success': False,
            'error': 'Bu öğrenciye erişim yetkiniz yok.',
        }, status=status.HTTP_403_FORBIDDEN)
    return None


class IntelligenceDashboardView(APIView):
    """
    GET /api/coaching/intelligence/dashboard/
    Dashboard özet metrikleri
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        denied = _deny_if_not_admin(request)
        if denied:
            return denied
        try:
            metrics_service = CoachMetricsService()
            dashboard = metrics_service.get_dashboard_metrics()
            
            risk_engine = RiskEngine()
            risk_summary = risk_engine.get_risk_summary()
            
            return Response({
                'success': True,
                'data': {
                    'overview': {
                        'total_coaches': dashboard.total_coaches,
                        'total_students': dashboard.total_students,
                        'active_assignments': dashboard.total_students,  # Aktif atama sayısı olarak total_students kullanılıyor
                        'avg_engagement_score': dashboard.avg_engagement_score,
                    },
                    'risk': {
                        'high_risk': risk_summary['high_risk'],
                        'medium_risk': risk_summary['medium_risk'],
                        'low_risk': risk_summary['low_risk'],
                        'distribution': {
                            'labels': ['Düşük', 'Orta', 'Yüksek'],
                            'values': [
                                risk_summary['low_risk'],
                                risk_summary['medium_risk'],
                                risk_summary['high_risk'],
                            ],
                            'colors': ['#22c55e', '#eab308', '#ef4444'],
                        }
                    },
                    'events': {
                        'pending_count': dashboard.total_auto_events_today,
                        'weekly_meetings': dashboard.weekly_meetings,
                        'completion_rate': dashboard.avg_completion_rate,
                    },
                    'engagement': {
                        'average_score': dashboard.avg_engagement_score,
                        'coaches_below_50': sum(
                            1 for c in CoachProfile.objects.filter(is_active=True) 
                            if (m := metrics_service.get_coach_metrics(c.id)) and m.engagement_score < 50
                        ),
                    }
                }
            })
        except Exception as e:
            logger.exception("Dashboard metrikleri alınırken hata")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CoachMetricsView(APIView):
    """
    GET /api/coaching/intelligence/coach/<coach_id>/metrics/
    Belirli koç için detaylı metrikler
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, coach_id):
        from apps.coaching.services.coach_access import get_coach_profile
        # Admin tüm koçları; koç yalnızca kendi metriklerini görür
        if not is_resource_admin(request.user):
            own = get_coach_profile(request.user)
            if not own or own.id != int(coach_id):
                return Response({
                    'success': False,
                    'error': 'Bu koç metriklerine erişim yetkiniz yok.',
                }, status=status.HTTP_403_FORBIDDEN)
        try:
            try:
                coach = CoachProfile.objects.get(id=coach_id)
            except CoachProfile.DoesNotExist:
                return Response({
                    'success': False,
                    'error': 'Koç bulunamadı'
                }, status=status.HTTP_404_NOT_FOUND)
            
            metrics_service = CoachMetricsService()
            coach_metrics = metrics_service.get_coach_metrics(coach_id)
            
            engagement_engine = EngagementEngine()
            engagement = engagement_engine.calculate_coach_engagement(coach)
            
            risk_engine = RiskEngine()
            high_risk_students = risk_engine.get_high_risk_students(coach_id=coach_id)
            
            return Response({
                'success': True,
                'data': {
                    'coach': {
                        'id': coach.id,
                        'ad': coach.teacher.ad if coach.teacher else 'N/A',
                        'soyad': coach.teacher.soyad if coach.teacher else 'N/A',
                        'aktif': coach.is_active,
                    },
                    'metrics': {
                        'total_students': coach_metrics.total_students if coach_metrics else 0,
                        'active_students': coach_metrics.active_students if coach_metrics else 0,
                        'capacity_used': int((coach_metrics.total_students / coach.capacity * 100) if coach_metrics and coach.capacity else 0),
                        'pending_events': coach_metrics.pending_events if coach_metrics else 0,
                        'completed_events': coach_metrics.completed_events if coach_metrics else 0,
                        'risk_students': coach_metrics.risk_students if coach_metrics else 0,
                    },
                    'engagement': {
                        'score': engagement.engagement_score,
                        'level': self._get_engagement_level(engagement.engagement_score),
                        'weekly_meetings': engagement.weekly_meetings,
                        'completion_rate': engagement.completion_rate,
                        'avg_response_days': engagement.avg_response_days,
                    },
                    'risk_students': [
                        {
                            'student_id': student.student_id,
                            'student_name': student.student_name,
                            'risk_score': student.risk_score,
                            'risk_level': student.risk_level.value,
                            'reasons': student.reasons,
                        }
                        for student in high_risk_students[:5]
                    ],
                    'charts': {
                        'event_distribution': self._get_event_distribution(coach_id),
                        'weekly_trend': self._get_weekly_trend(coach_id),
                    }
                }
            })
        except Exception as e:
            logger.exception(f"Koç metrikleri alınırken hata: coach_id={coach_id}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _get_engagement_level(self, score):
        if score >= 80:
            return 'excellent'
        elif score >= 60:
            return 'good'
        elif score >= 40:
            return 'moderate'
        else:
            return 'low'
    
    def _get_event_distribution(self, coach_id):
        """Event dağılımı pie chart verisi"""
        from django.db.models import Count
        
        events = CoachingEvent.objects.filter(coach_id=coach_id).values('event_type').annotate(count=Count('id'))
        
        type_labels = {
            'MEETING': 'Görüşme',
            'FOLLOWUP': 'Takip',
            'NOTE': 'Not',
            'PLAN': 'Plan',
            'RISK': 'Risk',
        }
        
        return {
            'labels': [type_labels.get(e['event_type'], e['event_type']) for e in events],
            'values': [e['count'] for e in events],
        }
    
    def _get_weekly_trend(self, coach_id):
        """Son 4 hafta event trendi"""
        from django.utils import timezone
        from datetime import timedelta
        from django.db.models import Count
        from django.db.models.functions import TruncWeek
        
        four_weeks_ago = timezone.now() - timedelta(weeks=4)
        
        weekly_events = (
            CoachingEvent.objects
            .filter(coach_id=coach_id, created_at__gte=four_weeks_ago)
            .annotate(week=TruncWeek('created_at'))
            .values('week')
            .annotate(count=Count('id'))
            .order_by('week')
        )
        
        return {
            'labels': [e['week'].strftime('%d/%m') for e in weekly_events],
            'values': [e['count'] for e in weekly_events],
        }


class StudentTimelineView(APIView):
    """
    GET /api/coaching/intelligence/student/<student_id>/timeline/
    Öğrenci coaching timeline'ı
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request, student_id):
        denied = _deny_if_no_student_access(request, student_id)
        if denied:
            return denied
        try:
            from apps.ogrenci.domain.models import Ogrenci
            
            try:
                student = Ogrenci.objects.get(id=student_id)
            except Ogrenci.DoesNotExist:
                return Response({
                    'success': False,
                    'error': 'Öğrenci bulunamadı'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Aktif assignment
            assignment = CoachStudentAssignment.objects.filter(
                student_id=student_id,
                end_date__isnull=True
            ).select_related('coach', 'coach__teacher').first()
            
            if not assignment:
                return Response({
                    'success': True,
                    'data': {
                        'student': {
                            'id': student.id,
                            'ad': student.ad,
                            'soyad': student.soyad,
                        },
                        'assignment': None,
                        'timeline': [],
                        'risk': None,
                    }
                })
            
            # Risk analizi
            risk_engine = RiskEngine()
            risk = risk_engine.analyze_student(assignment)
            
            # Timeline events
            events = CoachingEvent.objects.filter(
                student=assignment.student
            ).order_by('-created_at')[:20]
            
            timeline = [
                {
                    'id': e.id,
                    'event_type': e.event_type,
                    'event_type_display': e.get_event_type_display(),
                    'baslik': e.title,
                    'aciklama': e.description[:100] + '...' if e.description and len(e.description) > 100 else e.description,
                    'durum': e.status,
                    'durum_display': e.get_status_display(),
                    'planned_date': e.event_date.isoformat() if e.event_date else None,
                    'completed_date': None,
                    'created_at': e.created_at.isoformat(),
                    'is_auto': e.event_source.startswith('auto_') if e.event_source else False,
                    'event_source': e.event_source,
                }
                for e in events
            ]
            
            return Response({
                'success': True,
                'data': {
                    'student': {
                        'id': student.id,
                        'ad': student.ad,
                        'soyad': student.soyad,
                    },
                    'assignment': {
                        'id': assignment.id,
                        'coach_id': assignment.coach_id,
                        'coach_name': f"{assignment.coach.teacher.ad} {assignment.coach.teacher.soyad}" if assignment.coach.teacher else 'N/A',
                        'baslangic_tarihi': assignment.start_date.isoformat() if assignment.start_date else None,
                        'durum': 'ACTIVE' if assignment.end_date is None else 'ENDED',
                    },
                    'risk': {
                        'score': risk.score,
                        'level': risk.level.value,
                        'reasons': risk.reasons,
                    } if risk else None,
                    'timeline': timeline,
                }
            })
        except Exception as e:
            logger.exception(f"Öğrenci timeline alınırken hata: student_id={student_id}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RiskListView(APIView):
    """
    GET /api/coaching/intelligence/risk-list/
    Tüm yüksek riskli öğrenciler
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        denied = _deny_if_not_admin(request)
        if denied:
            return denied
        try:
            coach_id = request.query_params.get('coach_id')
            limit = int(request.query_params.get('limit', 50))
            
            risk_engine = RiskEngine()
            
            if coach_id:
                high_risk = risk_engine.get_high_risk_students(coach_id=int(coach_id))
            else:
                high_risk = risk_engine.get_high_risk_students()
            
            # StudentRisk dataclass'larını dict'e dönüştür
            students_data = [
                {
                    'student_id': r.student_id,
                    'student_name': r.student_name,
                    'coach_id': r.coach_id,
                    'coach_name': r.coach_name,
                    'risk_score': r.risk_score,
                    'risk_level': r.risk_level.value,
                    'reasons': r.reasons,
                    'last_event_date': r.last_event_date.isoformat() if r.last_event_date else None,
                    'assignment_start_date': r.assignment_start_date.isoformat() if r.assignment_start_date else None,
                }
                for r in high_risk[:limit]
            ]
            
            return Response({
                'success': True,
                'data': {
                    'total_count': len(high_risk),
                    'students': students_data,
                }
            })
        except Exception as e:
            logger.exception("Risk listesi alınırken hata")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RunIntelligenceCycleView(APIView):
    """
    POST /api/coaching/intelligence/run-cycle/
    Intelligence döngüsünü manuel tetikle (admin only)
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        try:
            if not (request.user.is_superuser or is_resource_admin(request.user)):
                return Response({
                    'success': False,
                    'error': 'Bu işlem için yetkiniz yok'
                }, status=status.HTTP_403_FORBIDDEN)
            
            skip_events = request.data.get('skip_events', False)
            skip_metrics = request.data.get('skip_metrics', False)
            
            results = {}
            
            # Risk analizi
            risk_engine = RiskEngine()
            results['risk'] = risk_engine.get_risk_summary()
            
            # Event üretimi
            if not skip_events:
                generator = EventGenerator()
                results['events'] = generator.run_all()
            
            # Metrik hesaplama
            if not skip_metrics:
                metrics_service = CoachMetricsService()
                metrics_results = metrics_service.refresh_all_metrics()
                results['metrics'] = {
                    'coaches_count': len(metrics_results['coaches']),
                    'dashboard': metrics_results['dashboard'],
                }
            
            return Response({
                'success': True,
                'data': results,
            })
        except Exception as e:
            logger.exception("Intelligence cycle çalıştırılırken hata")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
