"""
Predictive API Views

Endpoints:
- /api/coaching/predictive/dashboard/
- /api/coaching/predictive/student/<id>/scores/
- /api/coaching/predictive/student/<id>/weekly-plan/
- /api/coaching/predictive/coach-match/<student_id>/
- /api/coaching/predictive/high-risk/
"""
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authentication import SessionAuthentication

from django.utils import timezone
from django.db.models import Count, Avg, Q

logger = logging.getLogger(__name__)


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """CSRF kontrolünü devre dışı bırakan session authentication"""
    def enforce_csrf(self, request):
        return


class PredictiveDashboardView(APIView):
    """
    GET /api/coaching/predictive/dashboard/
    Predictive analytics dashboard verileri
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    
    def get(self, request):
        try:
            from apps.coaching.predictive.models import PredictiveCache, StudentFeatureSnapshot
            from apps.coaching.predictive.features.student_features import StudentFeatureExtractor
            from apps.coaching.models import CoachProfile, CoachStudentAssignment
            
            # Cache'den istatistikler
            cache_stats = PredictiveCache.objects.aggregate(
                total=Count('student_id'),
                avg_dropout=Avg('dropout_score'),
                avg_success=Avg('success_score'),
                avg_engagement=Avg('engagement_score'),
                critical_count=Count('student_id', filter=Q(dropout_level='critical')),
                high_risk_count=Count('student_id', filter=Q(dropout_level='high')),
                medium_risk_count=Count('student_id', filter=Q(dropout_level='medium')),
                low_risk_count=Count('student_id', filter=Q(dropout_level='low')),
                intervention_count=Count('student_id', filter=Q(intervention_required=True)),
            )
            
            # Koç istatistikleri
            coach_stats = {
                'total_coaches': CoachProfile.objects.filter(is_active=True).count(),
                'total_assignments': CoachStudentAssignment.objects.filter(end_date__isnull=True).count(),
            }
            
            # Risk dağılımı
            risk_distribution = {
                'labels': ['Düşük', 'Orta', 'Yüksek', 'Kritik'],
                'values': [
                    cache_stats['low_risk_count'] or 0,
                    cache_stats['medium_risk_count'] or 0,
                    cache_stats['high_risk_count'] or 0,
                    cache_stats['critical_count'] or 0,
                ],
                'colors': ['#22c55e', '#eab308', '#f97316', '#ef4444'],
            }
            
            # Başarı dağılımı
            success_dist = PredictiveCache.objects.values('success_score').annotate(count=Count('student_id'))
            success_buckets = {'excellent': 0, 'good': 0, 'moderate': 0, 'low': 0}
            for item in success_dist:
                score = item['success_score']
                if score >= 80:
                    success_buckets['excellent'] += item['count']
                elif score >= 60:
                    success_buckets['good'] += item['count']
                elif score >= 40:
                    success_buckets['moderate'] += item['count']
                else:
                    success_buckets['low'] += item['count']
            
            success_distribution = {
                'labels': ['Mükemmel', 'İyi', 'Orta', 'Düşük'],
                'values': [
                    success_buckets['excellent'],
                    success_buckets['good'],
                    success_buckets['moderate'],
                    success_buckets['low'],
                ],
                'colors': ['#22c55e', '#3b82f6', '#eab308', '#ef4444'],
            }
            
            # Trend (son 7 gün)
            from datetime import timedelta
            today = timezone.now().date()
            week_ago = today - timedelta(days=7)
            
            daily_trend = []
            for i in range(7):
                day = week_ago + timedelta(days=i+1)
                day_stats = StudentFeatureSnapshot.objects.filter(
                    snapshot_date=day
                ).aggregate(
                    avg_dropout=Avg('scores__dropout_score'),
                    count=Count('id')
                )
                daily_trend.append({
                    'date': day.isoformat(),
                    'avg_dropout': round(day_stats['avg_dropout'] or 0, 1),
                    'count': day_stats['count'] or 0,
                })
            
            # En yüksek riskli 5 öğrenci
            top_risk = PredictiveCache.objects.filter(
                dropout_level__in=['critical', 'high']
            ).select_related('student').order_by('-dropout_score')[:5]
            
            top_risk_list = [
                {
                    'student_id': cache.student_id,
                    'student_name': f"{cache.student.ad} {cache.student.soyad}",
                    'dropout_score': cache.dropout_score,
                    'dropout_level': cache.dropout_level,
                    'intervention_required': cache.intervention_required,
                }
                for cache in top_risk
            ]
            
            return Response({
                'success': True,
                'data': {
                    'overview': {
                        'total_students': cache_stats['total'] or 0,
                        'avg_dropout_score': round(cache_stats['avg_dropout'] or 0, 1),
                        'avg_success_score': round(cache_stats['avg_success'] or 0, 1),
                        'avg_engagement': round(cache_stats['avg_engagement'] or 0, 1),
                        'critical_count': cache_stats['critical_count'] or 0,
                        'intervention_required': cache_stats['intervention_count'] or 0,
                    },
                    'coaches': coach_stats,
                    'risk_distribution': risk_distribution,
                    'success_distribution': success_distribution,
                    'daily_trend': daily_trend,
                    'top_risk_students': top_risk_list,
                }
            })
        except Exception as e:
            logger.exception("Predictive dashboard hatası")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StudentScoresView(APIView):
    """
    GET /api/coaching/predictive/student/<student_id>/scores/
    Öğrenci skorları
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    
    def get(self, request, student_id):
        try:
            from apps.ogrenci.models import Ogrenci
            from apps.coaching.predictive.models import PredictiveCache, StudentFeatureSnapshot
            from apps.coaching.models import CoachStudentAssignment
            
            # Öğrenci kontrolü
            try:
                student = Ogrenci.objects.get(id=student_id)
            except Ogrenci.DoesNotExist:
                return Response({
                    'success': False,
                    'error': 'Öğrenci bulunamadı'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Cache'den skorları al
            try:
                cache = PredictiveCache.objects.get(student_id=student_id)
                scores = {
                    'dropout_score': cache.dropout_score,
                    'dropout_level': cache.dropout_level,
                    'success_score': cache.success_score,
                    'engagement_score': cache.engagement_score,
                    'intervention_required': cache.intervention_required,
                    'last_updated': cache.last_updated.isoformat(),
                }
            except PredictiveCache.DoesNotExist:
                scores = None
            
            # Son snapshot
            latest_snapshot = StudentFeatureSnapshot.get_latest_for_student(student_id)
            snapshot_data = None
            if latest_snapshot:
                snapshot_data = {
                    'date': latest_snapshot.snapshot_date.isoformat(),
                    'features': latest_snapshot.features,
                    'scores': latest_snapshot.scores,
                }
            
            # Trend (son 30 gün)
            trend_data = list(StudentFeatureSnapshot.get_trend(student_id, days=30))
            trend = [
                {
                    'date': t['snapshot_date'].isoformat(),
                    'dropout_score': t['scores'].get('dropout_score', 0),
                    'success_score': t['scores'].get('success_score', 0),
                }
                for t in trend_data
            ]
            
            # Aktif assignment
            assignment = CoachStudentAssignment.objects.filter(
                student_id=student_id,
                end_date__isnull=True
            ).select_related('coach', 'coach__teacher').first()
            
            assignment_data = None
            if assignment:
                assignment_data = {
                    'id': assignment.id,
                    'coach_id': assignment.coach_id,
                    'coach_name': f"{assignment.coach.teacher.ad} {assignment.coach.teacher.soyad}" if assignment.coach and assignment.coach.teacher else 'N/A',
                    'start_date': assignment.start_date.isoformat() if assignment.start_date else None,
                }
            
            return Response({
                'success': True,
                'data': {
                    'student': {
                        'id': student.id,
                        'ad': student.ad,
                        'soyad': student.soyad,
                    },
                    'assignment': assignment_data,
                    'scores': scores,
                    'latest_snapshot': snapshot_data,
                    'trend': trend,
                }
            })
        except Exception as e:
            logger.exception(f"Student scores hatası: student_id={student_id}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StudentWeeklyPlanView(APIView):
    """
    GET /api/coaching/predictive/student/<student_id>/weekly-plan/
    Öğrenci haftalık plan önerisi
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    
    def get(self, request, student_id):
        try:
            from apps.ogrenci.models import Ogrenci
            from apps.coaching.predictive.models import PredictiveCache
            from apps.coaching.models import CoachStudentAssignment
            from apps.coaching.predictive.features.student_features import StudentFeatureExtractor
            from apps.coaching.predictive.scoring import WeeklyPlanGenerator, DropoutScorer
            
            # Öğrenci kontrolü
            try:
                student = Ogrenci.objects.get(id=student_id)
            except Ogrenci.DoesNotExist:
                return Response({
                    'success': False,
                    'error': 'Öğrenci bulunamadı'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Cache'den plan al
            try:
                cache = PredictiveCache.objects.get(student_id=student_id)
                weekly_plan = cache.weekly_plan
            except PredictiveCache.DoesNotExist:
                # Cache yoksa hesapla
                assignment = CoachStudentAssignment.objects.filter(
                    student_id=student_id,
                    end_date__isnull=True
                ).first()
                
                if not assignment:
                    return Response({
                        'success': False,
                        'error': 'Aktif koç ataması bulunamadı'
                    }, status=status.HTTP_404_NOT_FOUND)
                
                extractor = StudentFeatureExtractor()
                features = extractor.extract_features(assignment)
                
                dropout_scorer = DropoutScorer()
                dropout = dropout_scorer.calculate(features)
                
                generator = WeeklyPlanGenerator()
                plan = generator.generate(features, dropout)
                weekly_plan = plan.to_dict()
            
            return Response({
                'success': True,
                'data': {
                    'student': {
                        'id': student.id,
                        'ad': student.ad,
                        'soyad': student.soyad,
                    },
                    'weekly_plan': weekly_plan,
                }
            })
        except Exception as e:
            logger.exception(f"Weekly plan hatası: student_id={student_id}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CoachMatchView(APIView):
    """
    GET /api/coaching/predictive/coach-match/<student_id>/
    Öğrenci için koç eşleştirme önerileri
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    
    def get(self, request, student_id):
        try:
            from apps.ogrenci.models import Ogrenci
            from apps.coaching.predictive.models import PredictiveCache
            from apps.coaching.predictive.scoring import CoachMatchScorer
            
            # Öğrenci kontrolü
            try:
                student = Ogrenci.objects.get(id=student_id)
            except Ogrenci.DoesNotExist:
                return Response({
                    'success': False,
                    'error': 'Öğrenci bulunamadı'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Risk skoru al
            risk_score = 0
            needs_attention = False
            try:
                cache = PredictiveCache.objects.get(student_id=student_id)
                risk_score = cache.dropout_score
                needs_attention = cache.intervention_required
            except PredictiveCache.DoesNotExist:
                pass
            
            # Eşleştirme yap
            scorer = CoachMatchScorer()
            matches = scorer.get_matches(
                student_id=student_id,
                risk_score=risk_score,
                needs_high_attention=needs_attention,
                limit=int(request.query_params.get('limit', 5))
            )
            
            match_list = [
                {
                    'coach_id': m.coach_id,
                    'coach_name': m.coach_name,
                    'match_score': m.match_score,
                    'factors': m.factors,
                    'capacity_available': m.capacity_available,
                    'current_load': m.current_load,
                    'capacity_total': m.capacity_total,
                    'load_percentage': int((m.current_load / m.capacity_total * 100) if m.capacity_total else 0),
                }
                for m in matches
            ]
            
            return Response({
                'success': True,
                'data': {
                    'student': {
                        'id': student.id,
                        'ad': student.ad,
                        'soyad': student.soyad,
                        'risk_score': risk_score,
                        'needs_attention': needs_attention,
                    },
                    'matches': match_list,
                }
            })
        except Exception as e:
            logger.exception(f"Coach match hatası: student_id={student_id}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class HighRiskView(APIView):
    """
    GET /api/coaching/predictive/high-risk/
    Yüksek riskli öğrenciler listesi
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    
    def get(self, request):
        try:
            from apps.coaching.predictive.models import PredictiveCache
            
            # Filtreler
            level = request.query_params.get('level')  # critical, high, medium
            coach_id = request.query_params.get('coach_id')
            limit = int(request.query_params.get('limit', 50))
            
            queryset = PredictiveCache.objects.select_related('student')
            
            # Level filtresi
            if level:
                queryset = queryset.filter(dropout_level=level)
            else:
                # Varsayılan: critical + high
                queryset = queryset.filter(dropout_level__in=['critical', 'high'])
            
            # Koç filtresi
            if coach_id:
                from apps.coaching.models import CoachStudentAssignment
                student_ids = CoachStudentAssignment.objects.filter(
                    coach_id=coach_id,
                    end_date__isnull=True
                ).values_list('student_id', flat=True)
                queryset = queryset.filter(student_id__in=student_ids)
            
            # Sırala ve limitle
            queryset = queryset.order_by('-dropout_score')[:limit]
            
            students = [
                {
                    'student_id': cache.student_id,
                    'student_name': f"{cache.student.ad} {cache.student.soyad}",
                    'dropout_score': cache.dropout_score,
                    'dropout_level': cache.dropout_level,
                    'success_score': cache.success_score,
                    'engagement_score': cache.engagement_score,
                    'intervention_required': cache.intervention_required,
                    'weekly_plan': cache.weekly_plan,
                }
                for cache in queryset
            ]
            
            return Response({
                'success': True,
                'data': {
                    'total_count': len(students),
                    'students': students,
                }
            })
        except Exception as e:
            logger.exception("High risk listesi hatası")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RunPredictiveCycleView(APIView):
    """
    POST /api/coaching/predictive/run-cycle/
    Predictive döngüsünü manuel tetikle (admin only)
    """
    authentication_classes = [CsrfExemptSessionAuthentication]
    
    def post(self, request):
        try:
            # Sadece superuser çalıştırabilir
            if not request.user.is_superuser:
                return Response({
                    'success': False,
                    'error': 'Bu işlem için yetkiniz yok'
                }, status=status.HTTP_403_FORBIDDEN)
            
            from django.core.management import call_command
            from io import StringIO
            
            out = StringIO()
            
            skip_snapshot = request.data.get('skip_snapshot', False)
            skip_events = request.data.get('skip_events', False)
            
            call_command(
                'run_predictive_cycle',
                skip_snapshot=skip_snapshot,
                skip_events=skip_events,
                stdout=out
            )
            
            return Response({
                'success': True,
                'data': {
                    'output': out.getvalue(),
                }
            })
        except Exception as e:
            logger.exception("Run predictive cycle hatası")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
