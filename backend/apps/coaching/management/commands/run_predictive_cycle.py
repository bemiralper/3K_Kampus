"""
Predictive Cycle Scheduler

run_predictive_cycle management command

İşlemler:
1. Feature snapshot oluştur
2. Skorları hesapla
3. Predictive cache yaz
4. Critical dropout için auto CoachingEvent üret
"""
import logging
from datetime import date
from typing import Dict, List, Any

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Predictive analytics döngüsünü çalıştır'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--skip-snapshot',
            action='store_true',
            help='Feature snapshot oluşturmayı atla'
        )
        parser.add_argument(
            '--skip-events',
            action='store_true',
            help='Otomatik event oluşturmayı atla'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Değişiklik yapmadan çalıştır'
        )
    
    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Predictive cycle başlatılıyor...'))
        
        skip_snapshot = options.get('skip_snapshot', False)
        skip_events = options.get('skip_events', False)
        dry_run = options.get('dry_run', False)
        
        results = {
            'features_extracted': 0,
            'snapshots_created': 0,
            'scores_calculated': 0,
            'cache_updated': 0,
            'events_created': 0,
            'critical_students': [],
            'errors': [],
        }
        
        try:
            # 1. Feature extraction
            self.stdout.write('1. Feature extraction...')
            features_list = self._extract_features()
            results['features_extracted'] = len(features_list)
            
            if not features_list:
                self.stdout.write(self.style.WARNING('Aktif assignment bulunamadı.'))
                return
            
            # 2. Skorları hesapla
            self.stdout.write('2. Skorları hesaplama...')
            scored_data = self._calculate_scores(features_list)
            results['scores_calculated'] = len(scored_data)
            
            # 3. Snapshot oluştur
            if not skip_snapshot and not dry_run:
                self.stdout.write('3. Snapshot oluşturma...')
                snapshot_count = self._create_snapshots(scored_data)
                results['snapshots_created'] = snapshot_count
            
            # 4. Cache güncelle
            if not dry_run:
                self.stdout.write('4. Cache güncelleme...')
                cache_count = self._update_cache(scored_data)
                results['cache_updated'] = cache_count
            
            # 5. Critical dropout için event oluştur
            if not skip_events and not dry_run:
                self.stdout.write('5. Otomatik event oluşturma...')
                events_result = self._create_intervention_events(scored_data)
                results['events_created'] = events_result['count']
                results['critical_students'] = events_result['students']
            
            # Sonuçları yazdır
            self._print_results(results)
            
        except Exception as e:
            logger.exception('Predictive cycle hatası')
            self.stdout.write(self.style.ERROR(f'Hata: {e}'))
            results['errors'].append(str(e))
    
    def _extract_features(self) -> List:
        """Feature'ları çıkar"""
        from apps.coaching.predictive.features.student_features import StudentFeatureExtractor
        
        extractor = StudentFeatureExtractor()
        return extractor.extract_all_features()
    
    def _calculate_scores(self, features_list: List) -> List[Dict]:
        """Tüm skorları hesapla"""
        from apps.coaching.predictive.scoring import (
            DropoutScorer,
            SuccessScorer,
            WeeklyPlanGenerator
        )
        
        dropout_scorer = DropoutScorer()
        success_scorer = SuccessScorer()
        plan_generator = WeeklyPlanGenerator()
        
        scored_data = []
        
        for features in features_list:
            try:
                dropout = dropout_scorer.calculate(features)
                success = success_scorer.calculate(features)
                weekly_plan = plan_generator.generate(features, dropout)
                
                scored_data.append({
                    'features': features,
                    'dropout': dropout,
                    'success': success,
                    'weekly_plan': weekly_plan,
                })
            except Exception as e:
                logger.error(f"Skor hesaplama hatası (student={features.student_id}): {e}")
        
        return scored_data
    
    def _create_snapshots(self, scored_data: List[Dict]) -> int:
        """Snapshot'ları oluştur"""
        from apps.coaching.predictive.models import StudentFeatureSnapshot
        
        today = timezone.now().date()
        count = 0
        
        for data in scored_data:
            features = data['features']
            dropout = data['dropout']
            success = data['success']
            
            try:
                with transaction.atomic():
                    snapshot, created = StudentFeatureSnapshot.objects.update_or_create(
                        student_id=features.student_id,
                        snapshot_date=today,
                        defaults={
                            'coach_id': features.coach_id,
                            'assignment_id': features.assignment_id,
                            'features': features.to_dict(),
                            'scores': {
                                'dropout_score': dropout.score,
                                'dropout_level': dropout.level,
                                'dropout_factors': dropout.factors,
                                'success_score': success.score,
                                'success_level': success.level,
                            }
                        }
                    )
                    if created:
                        count += 1
            except Exception as e:
                logger.error(f"Snapshot oluşturma hatası (student={features.student_id}): {e}")
        
        return count
    
    def _update_cache(self, scored_data: List[Dict]) -> int:
        """Predictive cache güncelle"""
        from apps.coaching.predictive.models import PredictiveCache
        
        count = 0
        
        for data in scored_data:
            features = data['features']
            dropout = data['dropout']
            success = data['success']
            weekly_plan = data['weekly_plan']
            
            try:
                with transaction.atomic():
                    PredictiveCache.objects.update_or_create(
                        student_id=features.student_id,
                        defaults={
                            'dropout_score': dropout.score,
                            'dropout_level': dropout.level,
                            'success_score': success.score,
                            'engagement_score': features.engagement_score,
                            'weekly_plan': weekly_plan.to_dict(),
                            'intervention_required': weekly_plan.intervention_required,
                        }
                    )
                    count += 1
            except Exception as e:
                logger.error(f"Cache güncelleme hatası (student={features.student_id}): {e}")
        
        return count
    
    def _create_intervention_events(self, scored_data: List[Dict]) -> Dict:
        """Critical dropout için otomatik event oluştur"""
        from apps.coaching.models import CoachingEvent
        
        count = 0
        critical_students = []
        
        for data in scored_data:
            features = data['features']
            dropout = data['dropout']
            weekly_plan = data['weekly_plan']
            
            # Sadece critical seviyedekiler
            if dropout.level != 'critical':
                continue
            
            try:
                # Bugün için zaten event var mı kontrol et
                today = timezone.now().date()
                existing = CoachingEvent.objects.filter(
                    student_id=features.student_id,
                    event_source='auto_predictive',
                    event_date__date=today
                ).exists()
                
                if existing:
                    continue
                
                # Yeni event oluştur
                CoachingEvent.objects.create(
                    student_id=features.student_id,
                    coach_id=features.coach_id,
                    event_type='RISK',
                    title=f'🚨 Kritik Dropout Riski: Skor {dropout.score}',
                    description=(
                        f"Dropout Risk Analizi:\n\n"
                        f"Skor: {dropout.score}/100 ({dropout.level.upper()})\n"
                        f"Nedenler: {', '.join(dropout.reasons)}\n\n"
                        f"Haftalık Plan:\n"
                        f"- Önerilen toplantı: {weekly_plan.meetings_suggested}\n"
                        f"- Ödev yoğunluğu: {weekly_plan.homework_volume}\n"
                        f"- Öncelik: {weekly_plan.priority_level}\n\n"
                        f"Öneriler:\n" + '\n'.join(f"• {r}" for r in weekly_plan.recommendations)
                    ),
                    event_date=timezone.now(),
                    status='pending',
                    event_source='auto_predictive',
                    metadata={
                        'dropout_score': dropout.score,
                        'dropout_level': dropout.level,
                        'dropout_factors': dropout.factors,
                        'weekly_plan': weekly_plan.to_dict(),
                        'generated_at': timezone.now().isoformat(),
                    }
                )
                
                count += 1
                critical_students.append({
                    'student_id': features.student_id,
                    'dropout_score': dropout.score,
                })
                
            except Exception as e:
                logger.error(f"Event oluşturma hatası (student={features.student_id}): {e}")
        
        return {
            'count': count,
            'students': critical_students
        }
    
    def _print_results(self, results: Dict):
        """Sonuçları yazdır"""
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 50))
        self.stdout.write(self.style.SUCCESS('PREDICTIVE CYCLE TAMAMLANDI'))
        self.stdout.write(self.style.SUCCESS('=' * 50))
        self.stdout.write(f"Features extracted: {results['features_extracted']}")
        self.stdout.write(f"Scores calculated: {results['scores_calculated']}")
        self.stdout.write(f"Snapshots created: {results['snapshots_created']}")
        self.stdout.write(f"Cache updated: {results['cache_updated']}")
        self.stdout.write(f"Events created: {results['events_created']}")
        
        if results['critical_students']:
            self.stdout.write('')
            self.stdout.write(self.style.WARNING(
                f"⚠️ {len(results['critical_students'])} öğrenci kritik dropout riski altında!"
            ))
            for s in results['critical_students'][:5]:
                self.stdout.write(f"  - Student #{s['student_id']}: Skor {s['dropout_score']}")
        
        if results['errors']:
            self.stdout.write('')
            self.stdout.write(self.style.ERROR(f"Hatalar: {len(results['errors'])}"))
