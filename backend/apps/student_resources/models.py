"""
Öğrenci Kaynak Havuzu - Models
StudentResourceAssignment: Öğrencilere atanan kaynakların yönetimi
"""

from django.db import models
from django.db.models import Q
from django.conf import settings


class StudentResourceAssignment(models.Model):
    """
    Öğrenci Kaynak Ataması
    Bir öğrenciye atanan kaynağı temsil eder
    """
    
    class Status(models.TextChoices):
        ASSIGNED = 'ASSIGNED', 'Atandı'
        IN_PROGRESS = 'IN_PROGRESS', 'Devam Ediyor'
        COMPLETED = 'COMPLETED', 'Tamamlandı'
        CANCELLED = 'CANCELLED', 'İptal Edildi'
        OVERDUE = 'OVERDUE', 'Süresi Geçti'
    
    class OwnershipType(models.TextChoices):
        STUDENT_OWNED = 'STUDENT_OWNED', 'Öğrencide Var'
        TO_PURCHASE = 'TO_PURCHASE', 'Satın Alınacak'
        INSTITUTION_PROVIDED = 'INSTITUTION_PROVIDED', 'Kurum Verecek'
    
    # İlişkiler
    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='resource_assignments',
        verbose_name='Öğrenci'
    )
    
    coach = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_resources',
        verbose_name='Koç'
    )
    
    lesson = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.CASCADE,
        related_name='student_resource_assignments',
        verbose_name='Ders'
    )
    
    resource_book = models.ForeignKey(
        'resources.ResourceBook',
        on_delete=models.CASCADE,
        related_name='student_assignments',
        verbose_name='Kaynak Kitap'
    )
    
    # Snapshot (atama anındaki değerler)
    difficulty_level_snapshot = models.CharField(
        'Zorluk Seviyesi (Snapshot)',
        max_length=20,
        blank=True,
        help_text='Atama anındaki zorluk seviyesi'
    )
    
    # Sahiplik Durumu
    ownership_type = models.CharField(
        'Sahiplik Durumu',
        max_length=25,
        choices=OwnershipType.choices,
        default=OwnershipType.TO_PURCHASE,
        help_text='Kaynağın temin şekli'
    )
    
    # Durum ve İlerleme
    status = models.CharField(
        'Durum',
        max_length=20,
        choices=Status.choices,
        default=Status.ASSIGNED
    )
    
    progress_percent = models.PositiveSmallIntegerField(
        'İlerleme %',
        default=0,
        help_text='0-100 arası ilerleme yüzdesi'
    )
    
    # Tarihler
    assigned_at = models.DateTimeField('Atanma Tarihi', auto_now_add=True)
    due_date = models.DateField('Son Tarih', null=True, blank=True)
    completed_at = models.DateTimeField('Tamamlanma Tarihi', null=True, blank=True)
    
    # Notlar
    notes = models.TextField('Notlar', blank=True)
    
    # Soft Delete
    is_active = models.BooleanField('Aktif', default=True)
    deleted_at = models.DateTimeField('Silinme Tarihi', null=True, blank=True)
    
    # Meta
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'student_resource_assignment'
        verbose_name = 'Öğrenci Kaynak Ataması'
        verbose_name_plural = 'Öğrenci Kaynak Atamaları'
        ordering = ['-assigned_at']
        indexes = [
            models.Index(fields=['student']),
            models.Index(fields=['coach']),
            models.Index(fields=['lesson']),
            models.Index(fields=['resource_book']),
            models.Index(fields=['status']),
            models.Index(fields=['is_active']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'resource_book'],
                condition=Q(is_active=True),
                name='unique_active_student_resource',
            ),
        ]
    
    def __str__(self):
        return f"{self.student} - {self.resource_book.ad}"
    
    def save(self, *args, **kwargs):
        # Snapshot zorluk seviyesini kaydet
        if not self.difficulty_level_snapshot and self.resource_book:
            if self.resource_book.zorluk_min and self.resource_book.zorluk_max:
                self.difficulty_level_snapshot = f"{self.resource_book.zorluk_min}-{self.resource_book.zorluk_max}"
            elif self.resource_book.zorluk_min:
                self.difficulty_level_snapshot = f"{self.resource_book.zorluk_min}+"
            elif self.resource_book.zorluk_max:
                self.difficulty_level_snapshot = f"1-{self.resource_book.zorluk_max}"
        super().save(*args, **kwargs)
    
    @property
    def is_overdue(self):
        """Son tarih geçmiş mi?"""
        from django.utils import timezone
        if self.due_date and self.status not in [self.Status.COMPLETED, self.Status.CANCELLED]:
            return timezone.now().date() > self.due_date
        return False


class ResourcePurchaseList(models.Model):
    """
    Satın Alma Listesi
    Öğrencinin kırtasiyeden alması gereken kaynakların listesi
    """
    
    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Taslak'
        FINALIZED = 'FINALIZED', 'Kesinleşti'
        DELIVERED = 'DELIVERED', 'Teslim Edildi'
        CANCELLED = 'CANCELLED', 'İptal Edildi'
    
    class ListType(models.TextChoices):
        PURCHASE = 'PURCHASE', 'Kırtasiye Listesi'
        INSTITUTION = 'INSTITUTION', 'Kurum Verecek Listesi'
    
    # Öğrenci
    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='purchase_lists',
        verbose_name='Öğrenci'
    )
    
    # Listeyi oluşturan koç
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_purchase_lists',
        verbose_name='Oluşturan'
    )
    
    # Liste Türü
    list_type = models.CharField(
        'Liste Türü',
        max_length=20,
        choices=ListType.choices,
        default=ListType.PURCHASE
    )
    
    # Durum
    status = models.CharField(
        'Durum',
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )
    
    # Tarihler
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    finalized_at = models.DateTimeField('Kesinleşme Tarihi', null=True, blank=True)
    delivered_at = models.DateTimeField('Teslim Tarihi', null=True, blank=True)
    
    # Notlar
    notes = models.TextField('Notlar', blank=True)
    title = models.CharField('Liste Başlığı', max_length=200, blank=True)
    
    # Kırtasiye bilgisi (PDF için)
    stationery_name = models.CharField('Kırtasiye Adı', max_length=200, blank=True)
    stationery_address = models.TextField('Kırtasiye Adresi', blank=True)
    
    class Meta:
        db_table = 'resource_purchase_list'
        verbose_name = 'Satın Alma Listesi'
        verbose_name_plural = 'Satın Alma Listeleri'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['student']),
            models.Index(fields=['status']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        return f"{self.student} - {self.created_at.strftime('%d.%m.%Y')}"
    
    @property
    def total_items(self):
        return self.items.count()
    
    @property
    def total_books(self):
        return sum(item.quantity for item in self.items.all())


class ResourcePurchaseListItem(models.Model):
    """
    Satın Alma Listesi Kalemi
    Listedeki her bir kaynak
    """

    class ItemStatus(models.TextChoices):
        PENDING = 'PENDING', 'Bekliyor'
        RECEIVED = 'RECEIVED', 'Alındı'
        NOT_RECEIVED = 'NOT_RECEIVED', 'Alınmadı'
        CANCELLED = 'CANCELLED', 'İptal'

    purchase_list = models.ForeignKey(
        ResourcePurchaseList,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='Satın Alma Listesi'
    )
    
    assignment = models.ForeignKey(
        StudentResourceAssignment,
        on_delete=models.CASCADE,
        related_name='purchase_list_items',
        verbose_name='Kaynak Ataması',
        null=True,
        blank=True,
    )

    resource_book = models.ForeignKey(
        'resources.ResourceBook',
        on_delete=models.CASCADE,
        related_name='purchase_list_items',
        verbose_name='Kaynak Kitap',
        null=True,
        blank=True,
    )

    lesson = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.PROTECT,
        related_name='purchase_list_items',
        verbose_name='Ders',
        null=True,
        blank=True,
    )
    
    # Adet
    quantity = models.PositiveSmallIntegerField('Adet', default=1)

    item_status = models.CharField(
        'Kalem Durumu',
        max_length=20,
        choices=ItemStatus.choices,
        default=ItemStatus.PENDING,
    )

    source_note = models.CharField(
        'Temini / Kaynak Yeri',
        max_length=300,
        blank=True,
        help_text='Örn: Çağrı Kitap Kırtasiye',
    )
    
    # PDF için snapshot
    book_name_snapshot = models.CharField('Kaynak Adı', max_length=300, blank=True)
    book_publisher_snapshot = models.CharField('Yayınevi', max_length=200, blank=True)
    lesson_name_snapshot = models.CharField('Ders Adı', max_length=200, blank=True)
    difficulty_snapshot = models.CharField('Zorluk', max_length=20, blank=True)
    
    class Meta:
        db_table = 'resource_purchase_list_item'
        verbose_name = 'Satın Alma Kalemi'
        verbose_name_plural = 'Satın Alma Kalemleri'
        constraints = [
            models.UniqueConstraint(
                fields=['purchase_list', 'assignment'],
                condition=models.Q(assignment__isnull=False),
                name='uniq_purchase_list_assignment',
            ),
            models.UniqueConstraint(
                fields=['purchase_list', 'resource_book'],
                condition=models.Q(resource_book__isnull=False),
                name='uniq_purchase_list_resource_book',
            ),
        ]
    
    def __str__(self):
        name = self.book_name_snapshot
        if not name and self.assignment_id:
            name = self.assignment.resource_book.ad
        elif not name and self.resource_book_id:
            name = self.resource_book.ad
        return f"{self.purchase_list} - {name or 'Kaynak'}"
    
    def save(self, *args, **kwargs):
        if self.assignment_id:
            if not self.book_name_snapshot:
                book = self.assignment.resource_book
                self.book_name_snapshot = book.ad
                self.book_publisher_snapshot = book.yayinevi or ''
                self.lesson_name_snapshot = self.assignment.lesson.ad
                self.difficulty_snapshot = _book_difficulty_display(book)
        elif self.resource_book_id:
            book = self.resource_book
            if not self.book_name_snapshot:
                self.book_name_snapshot = book.ad
                self.book_publisher_snapshot = book.yayinevi or ''
            if not self.lesson_name_snapshot:
                lesson = self.lesson or book.ders
                self.lesson_name_snapshot = lesson.ad if lesson else ''
            if not self.difficulty_snapshot:
                self.difficulty_snapshot = _book_difficulty_display(book)
        super().save(*args, **kwargs)


def _book_difficulty_display(book):
    if book.zorluk_min and book.zorluk_max:
        return f"{book.zorluk_min}-{book.zorluk_max}"
    if book.zorluk_min:
        return f"{book.zorluk_min}+"
    if book.zorluk_max:
        return f"1-{book.zorluk_max}"
    return ''
