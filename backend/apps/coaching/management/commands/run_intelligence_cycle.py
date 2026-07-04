"""
Run Intelligence Cycle Management Command

Kullanım:
    python manage.py run_intelligence_cycle
    python manage.py run_intelligence_cycle --skip-events
    python manage.py run_intelligence_cycle --skip-metrics
    python manage.py run_intelligence_cycle --verbose

Cron ile:
    # Her gün saat 08:00'de çalıştır
    0 8 * * * cd /path/to/project && python manage.py run_intelligence_cycle
"""
import logging
from django.core.management.base import BaseCommand, CommandError

from apps.coaching.intelligence.services import (
    RiskEngine,
    EngagementEngine,
    EventGenerator,
    CoachMetricsService,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Coaching Intelligence döngüsünü çalıştır: risk analizi, event üretimi, metrik hesaplama'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--skip-events',
            action='store_true',
            help='Otomatik event üretimini atla',
        )
        parser.add_argument(
            '--skip-metrics',
            action='store_true',
            help='Metrik hesaplamayı atla',
        )
        parser.add_argument(
            '--skip-risk',
            action='store_true',
            help='Risk analizini atla',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Detaylı çıktı',
        )
    
    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING('🧠 Coaching Intelligence Cycle'))
        self.stdout.write('=' * 50)
        
        verbose = options['verbose']
        results = {}
        
        # 1. Risk Analizi
        if not options['skip_risk']:
            self.stdout.write('\n📊 Risk analizi yapılıyor...')
            try:
                risk_engine = RiskEngine()
                risk_summary = risk_engine.get_risk_summary()
                
                results['risk'] = risk_summary
                
                self.stdout.write(self.style.SUCCESS(
                    f"   ✓ {risk_summary['total_students']} öğrenci analiz edildi"
                ))
                self.stdout.write(f"   - Düşük risk: {risk_summary['low_risk']}")
                self.stdout.write(f"   - Orta risk: {risk_summary['medium_risk']}")
                self.stdout.write(self.style.WARNING(f"   - Yüksek risk: {risk_summary['high_risk']}"))
                
                if verbose and risk_summary['high_risk_students']:
                    self.stdout.write('\n   Yüksek riskli öğrenciler:')
                    for student in risk_summary['high_risk_students'][:5]:
                        self.stdout.write(f"     • {student['student_name']} (skor: {student['risk_score']})")
                    if len(risk_summary['high_risk_students']) > 5:
                        self.stdout.write(f"     ... ve {len(risk_summary['high_risk_students']) - 5} diğer")
                        
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"   ✗ Risk analizi hatası: {e}"))
                logger.exception("Risk analizi hatası")
        
        # 2. Event Üretimi
        if not options['skip_events']:
            self.stdout.write('\n🎯 Otomatik eventler üretiliyor...')
            try:
                generator = EventGenerator()
                event_results = generator.run_all()
                
                results['events'] = event_results
                
                self.stdout.write(self.style.SUCCESS(
                    f"   ✓ Toplam {event_results['total_created']} event oluşturuldu"
                ))
                self.stdout.write(f"   - Risk eventleri: {event_results['risk_events']['created']} oluşturuldu, {event_results['risk_events']['skipped']} atlandı")
                self.stdout.write(f"   - İnaktivite eventleri: {event_results['inactivity_events']['created']} oluşturuldu, {event_results['inactivity_events']['skipped']} atlandı")
                self.stdout.write(f"   - Takip eventleri: {event_results['followup_events']['created']} oluşturuldu, {event_results['followup_events']['skipped']} atlandı")
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"   ✗ Event üretim hatası: {e}"))
                logger.exception("Event üretim hatası")
        
        # 3. Metrik Hesaplama
        if not options['skip_metrics']:
            self.stdout.write('\n📈 Metrikler hesaplanıyor...')
            try:
                metrics_service = CoachMetricsService()
                metrics_results = metrics_service.refresh_all_metrics()
                
                results['metrics'] = {
                    'coaches_count': len(metrics_results['coaches']),
                    'dashboard': metrics_results['dashboard'],
                }
                
                dashboard = metrics_results['dashboard']
                self.stdout.write(self.style.SUCCESS(
                    f"   ✓ {len(metrics_results['coaches'])} koç için metrikler hesaplandı"
                ))
                self.stdout.write(f"   - Toplam öğrenci: {dashboard['total_students']}")
                self.stdout.write(f"   - Riskli öğrenci: {dashboard['total_risk_students']}")
                self.stdout.write(f"   - Haftalık görüşme: {dashboard['weekly_meetings']}")
                self.stdout.write(f"   - Ortalama engagement: {dashboard['avg_engagement_score']:.1f}")
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"   ✗ Metrik hesaplama hatası: {e}"))
                logger.exception("Metrik hesaplama hatası")
        
        # Özet
        self.stdout.write('\n' + '=' * 50)
        self.stdout.write(self.style.SUCCESS('✅ Intelligence cycle tamamlandı!'))
        
        return
