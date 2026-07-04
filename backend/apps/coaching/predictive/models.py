"""
Predictive Models

Feature snapshot ve scoring sonuçları için modeller.
"""
from django.db import models
from django.utils import timezone


class StudentFeatureSnapshot(models.Model):
    """
    Öğrenci özellik snapshot'ı
    
    Her gün için öğrenci özelliklerini saklar.
    Tahminsel analiz ve trend takibi için kullanılır.
    """
    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='feature_snapshots',
        verbose_name='Öğrenci'
    )
    coach = models.ForeignKey(
        'coaching.CoachProfile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='student_snapshots',
        verbose_name='Koç'
    )
    assignment = models.ForeignKey(
        'coaching.CoachStudentAssignment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='feature_snapshots',
        verbose_name='Atama'
    )
    
    # Snapshot tarihi
    snapshot_date = models.DateField(
        default=timezone.now,
        verbose_name='Snapshot Tarihi',
        db_index=True
    )
    
    # Feature verileri (JSON)
    features = models.JSONField(
        default=dict,
        verbose_name='Özellikler'
    )
    
    # Hesaplanan skorlar (JSON - hızlı erişim için)
    scores = models.JSONField(
        default=dict,
        verbose_name='Skorlar',
        help_text='dropout_score, success_score, vb.'
    )
    
    # Meta
    generated_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Oluşturulma Zamanı'
    )
    
    class Meta:
        db_table = 'coaching_student_feature_snapshot'
        verbose_name = 'Öğrenci Özellik Snapshot'
        verbose_name_plural = 'Öğrenci Özellik Snapshot\'ları'
        ordering = ['-snapshot_date', '-generated_at']
        unique_together = [['student', 'snapshot_date']]
        indexes = [
            models.Index(fields=['student', 'snapshot_date']),
            models.Index(fields=['coach', 'snapshot_date']),
            models.Index(fields=['snapshot_date']),
        ]
    
    def __str__(self):
        return f"{self.student} - {self.snapshot_date}"
    
    @property
    def dropout_score(self) -> int:
        """Dropout skoru"""
        return self.scores.get('dropout_score', 0)
    
    @property
    def success_score(self) -> int:
        """Başarı skoru"""
        return self.scores.get('success_score', 0)
    
    @property
    def dropout_level(self) -> str:
        """Dropout seviyesi"""
        score = self.dropout_score
        if score >= 80:
            return 'critical'
        elif score >= 60:
            return 'high'
        elif score >= 40:
            return 'medium'
        return 'low'
    
    @classmethod
    def get_latest_for_student(cls, student_id: int):
        """Öğrenci için en son snapshot'ı döndür"""
        return cls.objects.filter(
            student_id=student_id
        ).order_by('-snapshot_date').first()
    
    @classmethod
    def get_trend(cls, student_id: int, days: int = 30):
        """Son N gün için trend verisi döndür"""
        from django.utils import timezone
        from datetime import timedelta
        
        start_date = timezone.now().date() - timedelta(days=days)
        
        return cls.objects.filter(
            student_id=student_id,
            snapshot_date__gte=start_date
        ).order_by('snapshot_date').values(
            'snapshot_date',
            'scores'
        )


class PredictiveCache(models.Model):
    """
    Tahminsel skorları cache'ler
    
    Hızlı erişim için güncel skorları tutar.
    """
    student = models.OneToOneField(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='predictive_cache',
        verbose_name='Öğrenci',
        primary_key=True
    )
    
    # Skorlar
    dropout_score = models.IntegerField(
        default=0,
        verbose_name='Dropout Skoru',
        db_index=True
    )
    dropout_level = models.CharField(
        max_length=20,
        default='low',
        verbose_name='Dropout Seviyesi'
    )
    success_score = models.IntegerField(
        default=0,
        verbose_name='Başarı Skoru',
        db_index=True
    )
    engagement_score = models.IntegerField(
        default=0,
        verbose_name='Etkileşim Skoru'
    )
    
    # Weekly plan
    weekly_plan = models.JSONField(
        default=dict,
        verbose_name='Haftalık Plan Önerisi'
    )
    
    # Intervention flag
    intervention_required = models.BooleanField(
        default=False,
        verbose_name='Müdahale Gerekli',
        db_index=True
    )
    
    # Meta
    last_updated = models.DateTimeField(
        auto_now=True,
        verbose_name='Son Güncelleme'
    )
    
    class Meta:
        db_table = 'coaching_predictive_cache'
        verbose_name = 'Tahminsel Cache'
        verbose_name_plural = 'Tahminsel Cache\'ler'
        indexes = [
            models.Index(fields=['dropout_score']),
            models.Index(fields=['success_score']),
            models.Index(fields=['intervention_required']),
        ]
    
    def __str__(self):
        return f"Cache: {self.student}"
    
    @classmethod
    def get_high_dropout_risk(cls, limit: int = 50):
        """Yüksek dropout riskli öğrencileri döndür"""
        return cls.objects.filter(
            dropout_score__gte=60
        ).select_related('student').order_by('-dropout_score')[:limit]
    
    @classmethod
    def get_intervention_required(cls):
        """Müdahale gereken öğrencileri döndür"""
        return cls.objects.filter(
            intervention_required=True
        ).select_related('student').order_by('-dropout_score')
