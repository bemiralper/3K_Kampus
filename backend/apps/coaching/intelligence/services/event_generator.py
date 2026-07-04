"""
Event Generator - Otomatik CoachingEvent Üretimi

Event Sources:
- auto_risk: Risk skoru yüksek öğrenciler için
- auto_followup: Takip gerektiren durumlar
- auto_inactivity: İnaktif öğrenciler için

Duplication Guard:
Unique: (event_source, reference_id, student, coach)
"""
import logging
from datetime import date, datetime, timedelta
from typing import List, Optional, Dict, Tuple

from django.db import transaction
from django.utils import timezone

from .risk_engine import RiskEngine, RiskLevel, StudentRisk

logger = logging.getLogger(__name__)


class EventGenerator:
    """
    Otomatik event üretici
    
    Üretilen event tipleri:
    - RISK: Yüksek riskli öğrenciler için bildirim
    - MEETING: Otomatik takip görüşmesi planlaması
    """
    
    # Event source değerleri
    SOURCE_AUTO_RISK = 'auto_risk'
    SOURCE_AUTO_FOLLOWUP = 'auto_followup'
    SOURCE_AUTO_INACTIVITY = 'auto_inactivity'
    
    def __init__(self):
        self.risk_engine = RiskEngine()
    
    def _get_duplicate_key(self, source: str, reference_id: int, student_id: int, coach_id: int) -> str:
        """Unique key oluştur"""
        return f"{source}_{reference_id}_{student_id}_{coach_id}"
    
    def _event_exists(self, source: str, reference_id: int, student_id: int, coach_id: int) -> bool:
        """
        Aynı event var mı kontrol et
        
        Duplicate guard için:
        - Aynı source
        - Aynı reference_id
        - Aynı student
        - Aynı coach
        - Status: pending veya in_progress (tamamlanan/iptal edilen tekrar oluşturulabilir)
        """
        from apps.coaching.models import CoachingEvent
        
        return CoachingEvent.objects.filter(
            event_source=source,
            reference_id=reference_id,
            student_id=student_id,
            coach_id=coach_id,
            status__in=['pending', 'in_progress']
        ).exists()
    
    def generate_risk_events(self) -> Tuple[int, int]:
        """
        Yüksek riskli öğrenciler için RISK event oluştur
        
        Returns:
            (created_count, skipped_count)
        """
        from apps.coaching.models import CoachingEvent
        
        logger.info("Risk event üretimi başlatılıyor...")
        
        high_risk = self.risk_engine.get_high_risk_students()
        
        created = 0
        skipped = 0
        today = date.today()
        
        for risk in high_risk:
            # Reference ID olarak bugünün tarihi + student ID kullan
            # Bu sayede günde 1 kez üretilebilir
            reference_id = int(f"{today.strftime('%Y%m%d')}{risk.student_id}")
            
            # Duplicate kontrolü
            if self._event_exists(
                self.SOURCE_AUTO_RISK,
                reference_id,
                risk.student_id,
                risk.coach_id
            ):
                skipped += 1
                continue
            
            # Event oluştur
            try:
                CoachingEvent.objects.create(
                    student_id=risk.student_id,
                    coach_id=risk.coach_id,
                    event_type='RISK',
                    title=f"⚠️ Yüksek Risk Bildirimi - {risk.student_name}",
                    description=self._format_risk_description(risk),
                    event_date=timezone.now(),
                    status='pending',
                    event_source=self.SOURCE_AUTO_RISK,
                    reference_id=reference_id,
                    metadata={
                        'risk_score': risk.risk_score,
                        'risk_level': risk.risk_level.value,
                        'reasons': risk.reasons,
                        'auto_generated': True,
                        'generated_at': timezone.now().isoformat(),
                    }
                )
                created += 1
                logger.debug(f"Risk event oluşturuldu: student={risk.student_id}")
            except Exception as e:
                logger.error(f"Risk event oluşturma hatası: {e}")
        
        logger.info(f"Risk event üretimi tamamlandı. Oluşturulan: {created}, Atlanan: {skipped}")
        
        return created, skipped
    
    def _format_risk_description(self, risk: StudentRisk) -> str:
        """Risk açıklama metni oluştur"""
        lines = [
            f"Risk Skoru: {risk.risk_score}/100",
            f"Risk Seviyesi: {risk.risk_level.value.upper()}",
            "",
            "Tespit Edilen Sorunlar:",
        ]
        
        for i, reason in enumerate(risk.reasons, 1):
            lines.append(f"  {i}. {reason}")
        
        lines.extend([
            "",
            "Önerilen Aksiyon:",
            "  - Öğrenci ile iletişime geçin",
            "  - Bir görüşme planlayın",
            "  - Risk nedenlerini değerlendirin",
        ])
        
        return "\n".join(lines)
    
    def generate_inactivity_events(self, inactivity_days: int = 14) -> Tuple[int, int]:
        """
        İnaktif öğrenciler için takip event oluştur
        
        Args:
            inactivity_days: Kaç gün inaktiflik sonrası event oluşturulsun
            
        Returns:
            (created_count, skipped_count)
        """
        from apps.coaching.models import CoachProfile, CoachStudentAssignment, CoachingEvent
        
        logger.info(f"İnaktivite event üretimi başlatılıyor (threshold={inactivity_days} gün)...")
        
        today = date.today()
        threshold_date = today - timedelta(days=inactivity_days)
        
        # Aktif atamalar
        active_assignments = CoachStudentAssignment.objects.filter(
            end_date__isnull=True
        ).select_related('student', 'coach', 'coach__teacher')
        
        created = 0
        skipped = 0
        
        for assignment in active_assignments:
            # Son event tarihini bul
            last_event = CoachingEvent.objects.filter(
                student=assignment.student,
                coach=assignment.coach
            ).order_by('-event_date').first()
            
            if last_event:
                last_date = last_event.event_date.date()
            else:
                last_date = assignment.start_date
            
            # İnaktif mi?
            if last_date > threshold_date:
                continue  # Aktif, event gerekmez
            
            days_inactive = (today - last_date).days
            
            # Reference ID: haftalık bazda (aynı hafta içinde tekrar üretme)
            week_number = today.isocalendar()[1]
            reference_id = int(f"{today.year}{week_number:02d}{assignment.student_id}")
            
            # Duplicate kontrolü
            if self._event_exists(
                self.SOURCE_AUTO_INACTIVITY,
                reference_id,
                assignment.student_id,
                assignment.coach_id
            ):
                skipped += 1
                continue
            
            # Event oluştur
            try:
                CoachingEvent.objects.create(
                    student=assignment.student,
                    coach=assignment.coach,
                    event_type='MEETING',
                    title=f"📅 Takip Görüşmesi Gerekli - {assignment.student.ad} {assignment.student.soyad}",
                    description=f"Bu öğrenci ile {days_inactive} gündür iletişim yok. Takip görüşmesi planlamanız önerilir.",
                    event_date=timezone.now() + timedelta(days=1),  # Yarın için planla
                    status='pending',
                    event_source=self.SOURCE_AUTO_INACTIVITY,
                    reference_id=reference_id,
                    metadata={
                        'days_inactive': days_inactive,
                        'last_event_date': last_date.isoformat() if last_date else None,
                        'auto_generated': True,
                        'generated_at': timezone.now().isoformat(),
                    }
                )
                created += 1
            except Exception as e:
                logger.error(f"Inactivity event oluşturma hatası: {e}")
        
        logger.info(f"İnaktivite event üretimi tamamlandı. Oluşturulan: {created}, Atlanan: {skipped}")
        
        return created, skipped
    
    def generate_followup_events(self) -> Tuple[int, int]:
        """
        Tamamlanan görüşmeler için takip event oluştur
        (metadata'da followup_needed flag varsa)
        
        Returns:
            (created_count, skipped_count)
        """
        from apps.coaching.models import CoachingEvent
        
        logger.info("Followup event üretimi başlatılıyor...")
        
        # Takip gerektiren tamamlanmış eventler
        completed_with_followup = CoachingEvent.objects.filter(
            status='completed',
            event_type='MEETING',
            metadata__followup_needed=True
        ).exclude(
            metadata__followup_created=True
        ).select_related('student', 'coach')
        
        created = 0
        skipped = 0
        
        for event in completed_with_followup:
            reference_id = event.id  # Orijinal event ID'si
            
            # Duplicate kontrolü
            if self._event_exists(
                self.SOURCE_AUTO_FOLLOWUP,
                reference_id,
                event.student_id,
                event.coach_id
            ):
                skipped += 1
                continue
            
            # Takip event oluştur
            try:
                followup_date = event.metadata.get('followup_date')
                if followup_date:
                    event_date = datetime.fromisoformat(followup_date)
                else:
                    event_date = timezone.now() + timedelta(days=7)  # 1 hafta sonra
                
                CoachingEvent.objects.create(
                    student=event.student,
                    coach=event.coach,
                    event_type='MEETING',
                    title=f"🔄 Takip Görüşmesi - {event.student.ad} {event.student.soyad}",
                    description=f"'{event.title}' görüşmesinin takibi.\n\nÖnceki görüşme notları:\n{event.description or 'Not yok'}",
                    event_date=event_date,
                    status='pending',
                    event_source=self.SOURCE_AUTO_FOLLOWUP,
                    reference_id=reference_id,
                    metadata={
                        'original_event_id': event.id,
                        'original_event_title': event.title,
                        'auto_generated': True,
                        'generated_at': timezone.now().isoformat(),
                    }
                )
                
                # Orijinal event'i işaretle
                event.metadata['followup_created'] = True
                event.save(update_fields=['metadata'])
                
                created += 1
            except Exception as e:
                logger.error(f"Followup event oluşturma hatası: {e}")
        
        logger.info(f"Followup event üretimi tamamlandı. Oluşturulan: {created}, Atlanan: {skipped}")
        
        return created, skipped
    
    @transaction.atomic
    def run_all(self) -> Dict:
        """
        Tüm event üretim işlemlerini çalıştır
        
        Returns:
            {
                'risk_events': {'created': int, 'skipped': int},
                'inactivity_events': {'created': int, 'skipped': int},
                'followup_events': {'created': int, 'skipped': int},
                'total_created': int,
                'total_skipped': int,
            }
        """
        logger.info("=== Event Generator: Tam döngü başlatılıyor ===")
        
        risk_created, risk_skipped = self.generate_risk_events()
        inact_created, inact_skipped = self.generate_inactivity_events()
        followup_created, followup_skipped = self.generate_followup_events()
        
        result = {
            'risk_events': {'created': risk_created, 'skipped': risk_skipped},
            'inactivity_events': {'created': inact_created, 'skipped': inact_skipped},
            'followup_events': {'created': followup_created, 'skipped': followup_skipped},
            'total_created': risk_created + inact_created + followup_created,
            'total_skipped': risk_skipped + inact_skipped + followup_skipped,
        }
        
        logger.info(f"=== Event Generator: Tamamlandı. Toplam: {result['total_created']} oluşturuldu, {result['total_skipped']} atlandı ===")
        
        return result
