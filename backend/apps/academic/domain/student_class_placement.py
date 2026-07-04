"""
StudentClassPlacement Model

Öğrenci Sınıf Yerleşimi
Öğrencileri sınıflara ve isteğe bağlı alt gruplara yerleştirir.

KULLANIM:
- Aynı öğrenci farklı dönemlerde farklı sınıfta olabilir
- Kapasite, çakışma ve aktif yıl kurallarıyla güvenli yerleşim
- Soft delete ile pasifleştirme

NOT: Bu modül ders programı üretmez; sadece yerleşim verisini tutar.

ENTEGRASYON NOTLARI:
# TODO: Yoklama modülü StudentClassPlacement üzerinden çalışır
# TODO: Ders Programı öğrenci görünümü bu yerleşime göre filtrelenir
# TODO: Sınav planlama sınıf listelerini buradan çeker
"""
from django.db import models


class PlacementType(models.TextChoices):
    """Yerleşim Türü"""
    PRIMARY = 'PRIMARY', 'Asıl Öğrenci'
    GUEST = 'GUEST', 'Misafir Öğrenci'
    TRANSFER = 'TRANSFER', 'Nakil Öğrenci'
    TEMPORARY = 'TEMPORARY', 'Geçici Yerleşim'
    AUDIT = 'AUDIT', 'Dinleyici'


class StudentClassPlacement(models.Model):
    """
    Öğrenci Sınıf Yerleşimi
    
    KURALLAR:
    - academic_year otomatik aktif yıldan alınır (frontend'den gelmez)
    - Aynı dönem içinde tek aktif sınıf (unique constraint)
    - Classroom kapasitesi aşılırsa hata
    - Group kapasitesi varsa aşımda hata
    - group.classroom == classroom olmalı
    - start_date ≤ end_date (varsa)
    - Pasif öğrenci eklenemez
    
    UNIQUE (aktif kayıt için): (academic_year, term, student)
    """
    
    # Eğitim Yılı (otomatik - aktif yıl)
    academic_year = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='student_placements',
        verbose_name='Eğitim Yılı'
    )
    
    # Dönem
    term = models.ForeignKey(
        'term.Term',
        on_delete=models.CASCADE,
        related_name='student_placements',
        verbose_name='Dönem'
    )
    
    # Öğrenci
    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='class_placements',
        verbose_name='Öğrenci'
    )
    
    # Sınıf
    classroom = models.ForeignKey(
        'sinif.Sinif',
        on_delete=models.CASCADE,
        related_name='student_placements',
        verbose_name='Sınıf'
    )
    
    # Alt Grup (opsiyonel)
    group = models.ForeignKey(
        'academic.ClassroomGroup',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='placements',
        verbose_name='Alt Grup'
    )
    
    # Yerleşim Türü
    placement_type = models.CharField(
        'Yerleşim Türü',
        max_length=20,
        choices=PlacementType.choices,
        default=PlacementType.PRIMARY
    )
    
    # Tarihler (opsiyonel)
    start_date = models.DateField(
        'Başlangıç Tarihi',
        null=True,
        blank=True,
        help_text='Yerleşimin geçerli olduğu başlangıç tarihi'
    )
    end_date = models.DateField(
        'Bitiş Tarihi',
        null=True,
        blank=True,
        help_text='Yerleşimin geçerli olduğu bitiş tarihi'
    )
    
    # Durum
    is_active = models.BooleanField('Aktif', default=True)
    
    # Notlar
    notes = models.TextField(
        'Notlar',
        null=True,
        blank=True
    )
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'academic_student_class_placement'
        verbose_name = 'Öğrenci Sınıf Yerleşimi'
        verbose_name_plural = 'Öğrenci Sınıf Yerleşimleri'
        ordering = ['classroom__ad', 'student__ad', 'student__soyad']
        constraints = [
            # Aynı dönem içinde tek aktif sınıf
            models.UniqueConstraint(
                fields=['academic_year', 'term', 'student'],
                condition=models.Q(is_active=True),
                name='unique_active_student_term_placement'
            )
        ]
        indexes = [
            models.Index(fields=['academic_year', 'term', 'is_active']),
            models.Index(fields=['classroom', 'is_active']),
            models.Index(fields=['student', 'is_active']),
            models.Index(fields=['group', 'is_active']),
        ]
    
    def __str__(self):
        group_str = f" ({self.group.name})" if self.group else ""
        return f"{self.student.ad} {self.student.soyad} → {self.classroom.ad}{group_str}"
    
    @property
    def student_full_name(self) -> str:
        """Öğrenci tam adı"""
        return f"{self.student.ad} {self.student.soyad}"
    
    @property
    def placement_type_display(self) -> str:
        """Yerleşim türü görüntüleme adı"""
        return PlacementType(self.placement_type).label


# TODO: sürükle-bırak sınıf/grup taşıma
# TODO: otomatik dengeleme (eşit dağıtım)
# TODO: transfer geçmişi timeline
# TODO: veli bilgilendirme tetikleyici
# TODO: yoklama başlangıç tarihine göre aktiflik
# TODO: CSV içe aktarma
# TODO: sınıf kapasite öneri motoru
# TODO: paralel şube akıllı dağıtım
