"""
ClassroomGroup Model

Sınıf Alt Grupları (Opsiyonel)
Örnek: A grubu, B grubu, Lab-1, Etüt-2

KULLANIM:
- Bir sınıfın alt gruplarını tanımlar
- Öğrenci yerleşiminde grup bazlı filtreleme sağlar
- Kapasite kontrolü yapar (opsiyonel)
"""
from django.db import models


class ClassroomGroup(models.Model):
    """
    Sınıf Alt Grubu
    
    KURALLAR:
    - Bir sınıfa birden fazla alt grup tanımlanabilir
    - Grup kapasitesi sınıf kapasitesinden bağımsızdır
    - is_active=False soft delete
    
    UNIQUE: (classroom, name)
    """
    
    # İlişkiler
    classroom = models.ForeignKey(
        'sinif.Sinif',
        on_delete=models.CASCADE,
        related_name='groups',
        verbose_name='Sınıf'
    )
    
    # Grup bilgileri
    name = models.CharField(
        'Grup Adı',
        max_length=50,
        help_text='Örn: A, B, Lab-1, Etüt-2'
    )
    
    # Kapasite (opsiyonel)
    capacity = models.PositiveIntegerField(
        'Kapasite',
        null=True,
        blank=True,
        help_text='Grup kapasitesi (boş = sınırsız)'
    )
    
    # Durum
    is_active = models.BooleanField('Aktif', default=True)
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'academic_classroom_group'
        verbose_name = 'Sınıf Alt Grubu'
        verbose_name_plural = 'Sınıf Alt Grupları'
        ordering = ['classroom', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['classroom', 'name'],
                condition=models.Q(is_active=True),
                name='unique_active_classroom_group'
            )
        ]
        indexes = [
            models.Index(fields=['classroom', 'is_active']),
        ]
    
    def __str__(self):
        return f"{self.classroom.ad} - {self.name}"
    
    @property
    def current_count(self) -> int:
        """Gruptaki aktif öğrenci sayısı"""
        return self.placements.filter(is_active=True).count()
    
    @property
    def available_capacity(self) -> int | None:
        """Kalan kapasite (kapasite tanımlıysa)"""
        if self.capacity is None:
            return None
        return max(0, self.capacity - self.current_count)
    
    @property
    def is_full(self) -> bool:
        """Kapasite doldu mu?"""
        if self.capacity is None:
            return False
        return self.current_count >= self.capacity
