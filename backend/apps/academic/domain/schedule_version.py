"""
ScheduleVersion Model
Ders programı versiyonlarını saklar ve yönetir.

Her dönem için birden fazla program versiyonu olabilir.
Sadece bir versiyon aktif olabilir.
Kilitli versiyonlar değiştirilemez.

Kullanım:
- Taslak oluştur
- Düzenle
- Kilitle
- Aktif yap
- Kopyala

Entegrasyon:
- ProgramGridCell.schedule_version → Bu versiyon
- Yoklama → Aktif versiyonu kullanır
- Öğrenci paneli → Aktif versiyonu gösterir
"""

from django.db import models
from django.conf import settings


class ScheduleVersion(models.Model):
    """
    Program Versiyonu
    
    Ders programlarının versiyonlu yönetimi için.
    Her dönem için birden fazla versiyon olabilir, 
    ancak sadece biri aktif olabilir.
    """
    
    # Eğitim Yılı (otomatik aktif yıl)
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='schedule_versions',
        verbose_name='Eğitim Yılı',
        help_text='Bu versiyonun ait olduğu eğitim yılı'
    )
    
    # Dönem
    term = models.ForeignKey(
        'term.Term',
        on_delete=models.CASCADE,
        related_name='schedule_versions',
        verbose_name='Dönem',
        help_text='Bu versiyonun ait olduğu dönem'
    )
    
    # Zaman Şablonu
    schedule_template = models.ForeignKey(
        'academic.ScheduleTemplate',
        on_delete=models.CASCADE,
        related_name='schedule_versions',
        verbose_name='Zaman Şablonu',
        help_text='Bu versiyonun kullandığı zaman şablonu'
    )
    
    # Haftalık Döngü
    weekly_cycle = models.ForeignKey(
        'academic.WeeklyCycle',
        on_delete=models.CASCADE,
        related_name='schedule_versions',
        verbose_name='Haftalık Döngü',
        help_text='Bu versiyonun kullandığı haftalık döngü'
    )
    
    # Versiyon adı
    name = models.CharField(
        max_length=200,
        verbose_name='Versiyon Adı',
        help_text='Örn: Taslak v1, Onaylı 2024-25 1.Dönem'
    )
    
    # Açıklama
    description = models.TextField(
        blank=True,
        null=True,
        verbose_name='Açıklama',
        help_text='Versiyon hakkında açıklama'
    )
    
    # Aktif mi? (Dönem başına tek aktif versiyon)
    is_active = models.BooleanField(
        default=False,
        verbose_name='Aktif mi',
        help_text='Aktif versiyon yoklama, görüntüleme vb. için kullanılır'
    )
    
    # Kilitli mi? (Kilitli versiyon değiştirilemez)
    is_locked = models.BooleanField(
        default=False,
        verbose_name='Kilitli mi',
        help_text='Kilitli versiyonlar düzenlenemez, sadece görüntülenir'
    )
    
    # Oluşturan kullanıcı
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_schedule_versions',
        verbose_name='Oluşturan'
    )
    
    # Zaman damgaları
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Oluşturulma Tarihi')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Güncellenme Tarihi')

    class Meta:
        db_table = 'academic_schedule_version'
        verbose_name = 'Program Versiyonu'
        verbose_name_plural = 'Program Versiyonları'
        ordering = ['-created_at']
        indexes = [
            models.Index(
                fields=['term', 'is_active'],
                name='idx_version_term_active'
            ),
            models.Index(
                fields=['egitim_yili', 'is_active'],
                name='idx_version_year_active'
            ),
        ]
        constraints = [
            # Aynı dönem + template + cycle için tek aktif versiyon
            models.UniqueConstraint(
                fields=['term', 'schedule_template', 'weekly_cycle'],
                condition=models.Q(is_active=True),
                name='unique_active_version_per_term_template_cycle'
            )
        ]

    def __str__(self):
        status = "🔒" if self.is_locked else ("✅" if self.is_active else "📝")
        return f"{status} {self.name} - {self.term.name}"

    def save(self, *args, **kwargs):
        """
        Kaydetmeden önce validasyonlar:
        - Eğer is_active=True yapılıyorsa, aynı term+template+cycle için diğerlerini pasif yap
        """
        if self.is_active:
            # Diğer aktif versiyonları pasif yap
            ScheduleVersion.objects.filter(
                term=self.term,
                schedule_template=self.schedule_template,
                weekly_cycle=self.weekly_cycle,
                is_active=True
            ).exclude(pk=self.pk).update(is_active=False)
        
        super().save(*args, **kwargs)

    def activate(self):
        """Bu versiyonu aktif yap"""
        self.is_active = True
        self.save()

    def lock(self):
        """Bu versiyonu kilitle"""
        self.is_locked = True
        self.save()

    def unlock(self):
        """Bu versiyonun kilidini aç"""
        self.is_locked = False
        self.save()

    def duplicate(self, new_name: str = None, created_by=None):
        """
        Bu versiyonun bir kopyasını oluştur.
        Kilitli versiyonlar da kopyalanabilir.
        
        Args:
            new_name: Yeni versiyon adı (default: "{eski_ad} - Kopya")
            created_by: Kopyayı oluşturan kullanıcı
            
        Returns:
            Yeni ScheduleVersion instance
        """
        from apps.academic.domain import ProgramGridCell
        
        # Yeni versiyon oluştur
        new_version = ScheduleVersion.objects.create(
            egitim_yili=self.egitim_yili,
            term=self.term,
            schedule_template=self.schedule_template,
            weekly_cycle=self.weekly_cycle,
            name=new_name or f"{self.name} - Kopya",
            description=f"'{self.name}' versiyonundan kopyalandı",
            is_active=False,
            is_locked=False,
            created_by=created_by
        )
        
        # Grid hücrelerini kopyala
        cells = ProgramGridCell.objects.filter(schedule_version=self)
        for cell in cells:
            # Yeni hücre oluştur (pk olmadan)
            cell.pk = None
            cell.schedule_version = new_version
            cell.save()
        
        return new_version

    @property
    def cell_count(self):
        """Bu versiyondaki toplam hücre sayısı"""
        return self.grid_cells.count()

    @property
    def filled_cell_count(self):
        """Bu versiyondaki dolu hücre sayısı"""
        return self.grid_cells.filter(status='FILLED').count()

    @property
    def completion_rate(self):
        """Doluluk oranı (%)"""
        total = self.cell_count
        if total == 0:
            return 0
        return round(self.filled_cell_count / total * 100, 1)

    @classmethod
    def get_active_for_term(cls, term_id, schedule_template_id=None, weekly_cycle_id=None):
        """
        Belirli dönem için aktif versiyonu getir.
        
        Args:
            term_id: Dönem ID
            schedule_template_id: Opsiyonel şablon filtresi
            weekly_cycle_id: Opsiyonel döngü filtresi
            
        Returns:
            ScheduleVersion veya None
        """
        qs = cls.objects.filter(term_id=term_id, is_active=True)
        
        if schedule_template_id:
            qs = qs.filter(schedule_template_id=schedule_template_id)
        if weekly_cycle_id:
            qs = qs.filter(weekly_cycle_id=weekly_cycle_id)
        
        return qs.first()

    @classmethod
    def create_legacy_version(cls, egitim_yili, term, schedule_template, weekly_cycle):
        """
        Backfill için Legacy versiyon oluştur.
        Migration sırasında kullanılır.
        """
        version, created = cls.objects.get_or_create(
            egitim_yili=egitim_yili,
            term=term,
            schedule_template=schedule_template,
            weekly_cycle=weekly_cycle,
            name='Legacy/Imported',
            defaults={
                'description': 'Migration sırasında otomatik oluşturuldu',
                'is_active': True,
                'is_locked': False
            }
        )
        return version, created
