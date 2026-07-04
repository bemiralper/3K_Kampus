"""
Kütüphane Domain Models
Kütüphane / Sessiz Çalışma Alanı Yönetim Modülü
"""
import uuid
from django.db import models


# ──────────────────────────────────────
# ENUM CHOICES
# ──────────────────────────────────────

class LibraryStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Aktif'
    INACTIVE = 'INACTIVE', 'Pasif'
    MAINTENANCE = 'MAINTENANCE', 'Bakımda'


class SeatType(models.TextChoices):
    STANDARD = 'STANDARD', 'Standart'
    PREMIUM = 'PREMIUM', 'Premium'
    ACCESSIBLE = 'ACCESSIBLE', 'Engelli Erişimli'


class SeatStatus(models.TextChoices):
    AVAILABLE = 'AVAILABLE', 'Boş'
    OCCUPIED = 'OCCUPIED', 'Dolu'
    RESERVED = 'RESERVED', 'Rezerve'
    OUT_OF_SERVICE = 'OUT_OF_SERVICE', 'Kullanım Dışı'


class LockerSize(models.TextChoices):
    STANDARD = 'STANDARD', 'Standart'
    SMALL = 'SMALL', 'Küçük'
    MEDIUM = 'MEDIUM', 'Orta'
    LARGE = 'LARGE', 'Büyük'


class LockerLockType(models.TextChoices):
    KEY = 'KEY', 'Anahtar'
    COMBINATION = 'COMBINATION', 'Şifreli'
    ELECTRONIC = 'ELECTRONIC', 'Elektronik'


class LockerStatus(models.TextChoices):
    AVAILABLE = 'AVAILABLE', 'Boş'
    ASSIGNED = 'ASSIGNED', 'Atanmış'
    MAINTENANCE = 'MAINTENANCE', 'Bakımda'


class SessionCode(models.TextChoices):
    MORNING = 'MORNING', 'Sabah'
    AFTERNOON = 'AFTERNOON', 'Öğle'
    EVENING = 'EVENING', 'Akşam'
    CUSTOM = 'CUSTOM', 'Özel'


class AssignmentType(models.TextChoices):
    PERMANENT = 'PERMANENT', 'Kalıcı'
    TEMPORARY = 'TEMPORARY', 'Geçici'
    TRIAL = 'TRIAL', 'Deneme'
    MAKEUP = 'MAKEUP', 'Telafi'
    GUEST = 'GUEST', 'Misafir'


class AssignmentStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Aktif'
    ENDED = 'ENDED', 'Sona Erdi'
    SUSPENDED = 'SUSPENDED', 'Askıya Alındı'


class LockerAssignmentType(models.TextChoices):
    PERMANENT = 'PERMANENT', 'Kalıcı'
    TEMPORARY = 'TEMPORARY', 'Geçici'


class AttendanceSessionStatus(models.TextChoices):
    OPEN = 'OPEN', 'Açık'
    CLOSED = 'CLOSED', 'Kapalı'
    CANCELLED = 'CANCELLED', 'İptal'


class AttendanceStatus(models.TextChoices):
    PRESENT = 'PRESENT', 'Geldi'
    LATE = 'LATE', 'Geç Geldi'
    ABSENT = 'ABSENT', 'Gelmedi'
    NOT_AT_DESK = 'NOT_AT_DESK', 'Masada Yok'
    EXCUSED = 'EXCUSED', 'İzinli'


class AttendanceNotificationEventType(models.TextChoices):
    ABSENT = 'ABSENT', 'Gelmedi'
    LATE = 'LATE', 'Geç Geldi'
    EXIT = 'EXIT', 'Çıkış'


class TemporarySeatingReason(models.TextChoices):
    TRIAL = 'TRIAL', 'Deneme'
    GUEST = 'GUEST', 'Misafir'
    EXAM_PREP = 'EXAM_PREP', 'Sınav Hazırlık'
    MAKEUP = 'MAKEUP', 'Telafi'
    OTHER = 'OTHER', 'Diğer'


class TemporarySeatingStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Aktif'
    ENDED = 'ENDED', 'Sona Erdi'
    EXPIRED = 'EXPIRED', 'Süresi Doldu'
    CANCELLED = 'CANCELLED', 'İptal'


class AuditAction(models.TextChoices):
    CREATE = 'CREATE', 'Oluşturma'
    UPDATE = 'UPDATE', 'Güncelleme'
    DELETE = 'DELETE', 'Silme'
    STATUS_CHANGE = 'STATUS_CHANGE', 'Durum Değişikliği'


class ExemptionType(models.TextChoices):
    """Öğrenci izin tipi"""
    PERIOD = 'PERIOD', 'Periyot İzni'
    FULL_DAY = 'FULL_DAY', 'Tam Gün İzni'


class DayOfWeek(models.IntegerChoices):
    """Haftanın günleri (Python weekday uyumlu)"""
    MONDAY = 0, 'Pazartesi'
    TUESDAY = 1, 'Salı'
    WEDNESDAY = 2, 'Çarşamba'
    THURSDAY = 3, 'Perşembe'
    FRIDAY = 4, 'Cuma'
    SATURDAY = 5, 'Cumartesi'
    SUNDAY = 6, 'Pazar'


class AttendanceType(models.TextChoices):
    """Yoklama tipi"""
    PERIOD = 'PERIOD', 'Periyot Yoklaması'
    LESSON = 'LESSON', 'Ders Bazlı Yoklama'


# ──────────────────────────────────────
# MODELS
# ──────────────────────────────────────

class Library(models.Model):
    """
    Kütüphane / Sessiz Çalışma Salonu
    Aggregate Root
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField('Kurum ID')
    sube_id = models.IntegerField('Şube ID')
    ad = models.CharField('Salon Adı', max_length=150)
    kod = models.CharField('Salon Kodu', max_length=20)
    aciklama = models.TextField('Açıklama', blank=True, default='')
    kapasite = models.PositiveIntegerField('Toplam Kapasite')
    durum = models.CharField(
        'Durum', max_length=20,
        choices=LibraryStatus.choices,
        default=LibraryStatus.ACTIVE
    )
    calisma_saatleri = models.JSONField('Çalışma Saatleri', default=dict)
    dolap_var_mi = models.BooleanField('Dolap Alanı Var mı', default=False)
    dolap_sayisi = models.PositiveIntegerField('Dolap Sayısı', default=0)
    max_gecici_sure_saat = models.PositiveIntegerField('Maks Geçici Süre (Saat)', default=4)
    kurallar = models.TextField('Kütüphane Kuralları', blank=True, default='')

    aktif_mi = models.BooleanField('Aktif', default=True)
    is_deleted = models.BooleanField('Silinmiş', default=False)
    deleted_at = models.DateTimeField('Silinme Tarihi', null=True, blank=True)
    created_by = models.IntegerField('Oluşturan', null=True, blank=True)
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'kutuphane_salon'
        verbose_name = 'Kütüphane Salonu'
        verbose_name_plural = 'Kütüphane Salonları'
        ordering = ['ad']
        indexes = [
            models.Index(fields=['kurum_id']),
            models.Index(fields=['sube_id']),
            models.Index(fields=['kod']),
            models.Index(fields=['durum']),
            models.Index(fields=['is_deleted']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['kurum_id', 'sube_id', 'kod'],
                condition=models.Q(is_deleted=False),
                name='unique_kurum_sube_salon_kod'
            ),
            models.UniqueConstraint(
                fields=['kurum_id', 'sube_id', 'ad'],
                condition=models.Q(is_deleted=False),
                name='unique_kurum_sube_salon_ad'
            ),
        ]

    def __str__(self):
        return f"{self.ad} ({self.kod})"


class SessionDefinition(models.Model):
    """
    Oturum Tanımı (Sabah, Öğle, Akşam vb.)
    Her salonun kendi oturum/periyot tanımları vardır.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    library = models.ForeignKey(
        Library, on_delete=models.CASCADE,
        related_name='oturum_tanimlari',
        verbose_name='Kütüphane'
    )
    ad = models.CharField('Oturum Adı', max_length=50)
    kod = models.CharField(
        'Oturum Kodu', max_length=20,
        choices=SessionCode.choices,
        default=SessionCode.CUSTOM
    )
    baslangic_saati = models.TimeField('Başlangıç Saati')
    bitis_saati = models.TimeField('Bitiş Saati')
    sira = models.PositiveIntegerField('Sıralama', default=0)
    aktif_mi = models.BooleanField('Aktif', default=True)
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'kutuphane_oturum_tanimi'
        verbose_name = 'Oturum Tanımı'
        verbose_name_plural = 'Oturum Tanımları'
        ordering = ['library', 'sira']
        indexes = [
            models.Index(fields=['library', 'aktif_mi']),
        ]

    def __str__(self):
        return f"{self.ad} ({self.baslangic_saati}-{self.bitis_saati})"


class SubeDersProgrami(models.Model):
    """
    Şube Ders Programı
    
    Her şubenin kendi ders saatleri ve mola zamanları vardır.
    Ders saatleri şube bazlıdır. Her periyot (Sabah/Öğle/Akşam) için
    kaç ders olduğu ve süreleri bu tabloda tanımlanır.
    
    ders_saatleri JSON formatı:
    {
        "MORNING": {
            "ders_sayisi": 4,
            "ders_suresi_dk": 40,
            "dersler": [
                {"ders_no": 1, "baslangic": "08:30", "bitis": "09:10"},
                {"ders_no": 2, "baslangic": "09:20", "bitis": "10:00"},
                {"ders_no": 3, "baslangic": "10:10", "bitis": "10:50"},
                {"ders_no": 4, "baslangic": "11:00", "bitis": "11:40"}
            ],
            "molalar": [
                {"sonra_ders_no": 1, "sure_dk": 10},
                {"sonra_ders_no": 2, "sure_dk": 10},
                {"sonra_ders_no": 3, "sure_dk": 10}
            ]
        },
        "AFTERNOON": { ... },
        "EVENING": { ... }
    }
    
    gun_bazli_aktiflik JSON formatı:
    {
        "0": {"aktif": true, "periyotlar": ["MORNING", "AFTERNOON", "EVENING"]},
        "1": {"aktif": true, "periyotlar": ["MORNING", "AFTERNOON"]},
        "5": {"aktif": true, "periyotlar": ["MORNING"]},
        "6": {"aktif": false, "periyotlar": []}
    }
    Keys: 0=Pazartesi ... 6=Pazar (Python weekday)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sube_id = models.IntegerField('Şube ID')
    kurum_id = models.IntegerField('Kurum ID')
    ad = models.CharField('Program Adı', max_length=100, default='Varsayılan Program')
    ders_saatleri = models.JSONField(
        'Ders Saatleri',
        default=dict,
        help_text='Periyot bazlı ders saatleri ve molalar'
    )
    gun_bazli_aktiflik = models.JSONField(
        'Gün Bazlı Aktiflik',
        default=dict,
        help_text='Hangi gün hangi periyotlar aktif'
    )
    aktif_mi = models.BooleanField('Aktif', default=True)
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'kutuphane_sube_ders_programi'
        verbose_name = 'Şube Ders Programı'
        verbose_name_plural = 'Şube Ders Programları'
        ordering = ['sube_id', 'ad']
        indexes = [
            models.Index(fields=['sube_id']),
            models.Index(fields=['kurum_id']),
            models.Index(fields=['kurum_id', 'aktif_mi']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['sube_id'],
                condition=models.Q(aktif_mi=True),
                name='unique_sube_aktif_program'
            ),
        ]

    def __str__(self):
        return f"Ders Programı: Şube #{self.sube_id} - {self.ad}"

    def get_ders_saatleri_for_period(self, period_code: str) -> dict:
        """Belirli bir periyodun ders saatlerini döndürür"""
        return self.ders_saatleri.get(period_code, {})

    def get_aktif_periyotlar(self, gun: int) -> list:
        """Belirli bir günün aktif periyotlarını döndürür"""
        gun_str = str(gun)
        gun_info = self.gun_bazli_aktiflik.get(gun_str, {})
        if not gun_info.get('aktif', False):
            return []
        return gun_info.get('periyotlar', [])

    def get_ders_count_for_period(self, period_code: str) -> int:
        """Periyottaki ders sayısını döndürür"""
        period_data = self.ders_saatleri.get(period_code, {})
        return period_data.get('ders_sayisi', 0)


class OgrenciIzin(models.Model):
    """
    Öğrenci İzin Kaydı
    
    Haftalık tekrarlı izinler. Bir öğrenci belirli günlerde
    belirli periyotlardan izinli olabilir.
    Örn: "Her Pazartesi akşam izinli", "Her Çarşamba tam gün izinli"
    
    İzin bir kez tanımlanır, haftalık tekrarlanır.
    Gerektiğinde değiştirilebilir veya belirli bir tarih aralığı verilebilir.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ogrenci_id = models.IntegerField('Öğrenci ID')
    kurum_id = models.IntegerField('Kurum ID')
    library = models.ForeignKey(
        Library, on_delete=models.CASCADE,
        related_name='ogrenci_izinleri',
        verbose_name='Kütüphane',
        null=True, blank=True,
        help_text='Boş ise tüm salonlar için geçerli'
    )
    izin_tipi = models.CharField(
        'İzin Tipi', max_length=20,
        choices=ExemptionType.choices,
        default=ExemptionType.PERIOD
    )
    gun = models.IntegerField(
        'Gün',
        choices=DayOfWeek.choices,
        help_text='Haftanın günü (0=Pazartesi ... 6=Pazar)'
    )
    periyot_kodu = models.CharField(
        'Periyot Kodu', max_length=20,
        choices=SessionCode.choices,
        null=True, blank=True,
        help_text='İzin tipi PERIOD ise hangi periyot (FULL_DAY ise null)'
    )
    baslangic_tarihi = models.DateField(
        'Başlangıç Tarihi',
        help_text='İznin geçerli olduğu başlangıç tarihi'
    )
    bitis_tarihi = models.DateField(
        'Bitiş Tarihi',
        null=True, blank=True,
        help_text='Null ise süresiz'
    )
    sebep = models.CharField('İzin Sebebi', max_length=255, blank=True, default='')
    aktif_mi = models.BooleanField('Aktif', default=True)
    olusturan_id = models.IntegerField('Oluşturan Personel ID', null=True, blank=True)
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'kutuphane_ogrenci_izin'
        verbose_name = 'Öğrenci İzni'
        verbose_name_plural = 'Öğrenci İzinleri'
        ordering = ['ogrenci_id', 'gun', 'periyot_kodu']
        indexes = [
            models.Index(fields=['ogrenci_id', 'aktif_mi']),
            models.Index(fields=['kurum_id']),
            models.Index(fields=['gun', 'periyot_kodu']),
            models.Index(fields=['library', 'gun']),
        ]

    def __str__(self):
        gun_str = self.get_gun_display()
        if self.izin_tipi == ExemptionType.FULL_DAY:
            return f"Öğrenci #{self.ogrenci_id} - {gun_str} Tam Gün İzinli"
        return f"Öğrenci #{self.ogrenci_id} - {gun_str} {self.get_periyot_kodu_display()} İzinli"

    def is_valid_on_date(self, tarih) -> bool:
        """Verilen tarihte bu izin geçerli mi?"""
        if not self.aktif_mi:
            return False
        if tarih < self.baslangic_tarihi:
            return False
        if self.bitis_tarihi and tarih > self.bitis_tarihi:
            return False
        # Gün kontrolü
        return tarih.weekday() == self.gun


class Seat(models.Model):
    """
    Masa / Oturma Pozisyonu
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    library = models.ForeignKey(
        Library, on_delete=models.CASCADE,
        related_name='masalar',
        verbose_name='Kütüphane'
    )
    masa_no = models.CharField('Masa Numarası', max_length=20)
    etiket = models.CharField('Etiket', max_length=50, blank=True, default='')
    bolge = models.CharField('Bölge', max_length=50, blank=True, default='')
    masa_tipi = models.CharField(
        'Masa Tipi', max_length=20,
        choices=SeatType.choices,
        default=SeatType.STANDARD
    )
    durum = models.CharField(
        'Durum', max_length=20,
        choices=SeatStatus.choices,
        default=SeatStatus.AVAILABLE
    )
    priz_var_mi = models.BooleanField('Priz Var mı', default=False)
    lamba_var_mi = models.BooleanField('Lamba Var mı', default=False)
    pozisyon_x = models.FloatField('Pozisyon X', default=0)
    pozisyon_y = models.FloatField('Pozisyon Y', default=0)
    pozisyon_w = models.PositiveIntegerField('Genişlik', default=1)
    pozisyon_h = models.PositiveIntegerField('Yükseklik', default=1)
    notlar = models.TextField('Notlar', blank=True, default='')
    sira = models.PositiveIntegerField('Sıralama', default=0)

    aktif_mi = models.BooleanField('Aktif', default=True)
    is_deleted = models.BooleanField('Silinmiş', default=False)
    deleted_at = models.DateTimeField('Silinme Tarihi', null=True, blank=True)
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'kutuphane_masa'
        verbose_name = 'Masa'
        verbose_name_plural = 'Masalar'
        ordering = ['library', 'sira', 'masa_no']
        indexes = [
            models.Index(fields=['library', 'durum']),
            models.Index(fields=['library', 'masa_tipi']),
            models.Index(fields=['is_deleted']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['library', 'masa_no'],
                condition=models.Q(is_deleted=False),
                name='unique_library_masa_no'
            ),
        ]

    def __str__(self):
        return f"Masa {self.masa_no} ({self.library.ad})"


class Locker(models.Model):
    """
    Dolap — Kurum bazlı (kütüphaneden bağımsız)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField('Kurum ID')
    sube_id = models.IntegerField('Şube ID')
    dolap_no = models.CharField('Dolap Numarası', max_length=20)
    boyut = models.CharField(
        'Boyut', max_length=10,
        choices=LockerSize.choices,
        default=LockerSize.STANDARD
    )
    kilit_tipi = models.CharField(
        'Kilit Tipi', max_length=20,
        choices=LockerLockType.choices,
        default=LockerLockType.KEY
    )
    anahtar_no = models.CharField('Anahtar No', max_length=20, blank=True, default='')
    durum = models.CharField(
        'Durum', max_length=20,
        choices=LockerStatus.choices,
        default=LockerStatus.AVAILABLE
    )

    aktif_mi = models.BooleanField('Aktif', default=True)
    is_deleted = models.BooleanField('Silinmiş', default=False)
    deleted_at = models.DateTimeField('Silinme Tarihi', null=True, blank=True)
    son_bosaltma_tarihi = models.DateTimeField('Son Boşaltma Tarihi', null=True, blank=True)
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'kutuphane_dolap'
        verbose_name = 'Dolap'
        verbose_name_plural = 'Dolaplar'
        ordering = ['kurum_id', 'dolap_no']
        indexes = [
            models.Index(fields=['kurum_id', 'durum']),
            models.Index(fields=['sube_id']),
            models.Index(fields=['is_deleted']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['kurum_id', 'sube_id', 'dolap_no'],
                condition=models.Q(is_deleted=False),
                name='unique_kurum_sube_dolap_no'
            ),
        ]

    def __str__(self):
        return f"Dolap {self.dolap_no} (Kurum #{self.kurum_id})"


class SeatAssignment(models.Model):
    """
    Masa Ataması
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    library = models.ForeignKey(
        Library, on_delete=models.CASCADE,
        related_name='masa_atamalari',
        verbose_name='Kütüphane'
    )
    seat = models.ForeignKey(
        Seat, on_delete=models.CASCADE,
        related_name='atamalar',
        verbose_name='Masa'
    )
    ogrenci_id = models.IntegerField('Öğrenci ID')
    atama_tipi = models.CharField(
        'Atama Tipi', max_length=20,
        choices=AssignmentType.choices,
        default=AssignmentType.PERMANENT
    )
    baslangic_tarihi = models.DateField('Başlangıç Tarihi')
    bitis_tarihi = models.DateField('Bitiş Tarihi', null=True, blank=True)
    durum = models.CharField(
        'Durum', max_length=20,
        choices=AssignmentStatus.choices,
        default=AssignmentStatus.ACTIVE
    )
    atayan_id = models.IntegerField('Atayan Personel ID', null=True, blank=True)
    sonlandiran_id = models.IntegerField('Sonlandıran Personel ID', null=True, blank=True)
    sonlanma_tarihi = models.DateTimeField('Sonlanma Tarihi', null=True, blank=True)
    sonlanma_sebebi = models.CharField('Sonlanma Sebebi', max_length=200, blank=True, default='')
    notlar = models.TextField('Notlar', blank=True, default='')
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'kutuphane_masa_atama'
        verbose_name = 'Masa Ataması'
        verbose_name_plural = 'Masa Atamaları'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['library', 'durum']),
            models.Index(fields=['seat', 'durum']),
            models.Index(fields=['ogrenci_id', 'durum']),
        ]

    def __str__(self):
        return f"Masa {self.seat.masa_no} → Öğrenci #{self.ogrenci_id}"


class LockerAssignment(models.Model):
    """
    Dolap Ataması — Kurum bazlı (kütüphaneden bağımsız)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField('Kurum ID')
    locker = models.ForeignKey(
        Locker, on_delete=models.CASCADE,
        related_name='atamalar',
        verbose_name='Dolap'
    )
    ogrenci_id = models.IntegerField('Öğrenci ID')
    atama_tipi = models.CharField(
        'Atama Tipi', max_length=20,
        choices=LockerAssignmentType.choices,
        default=LockerAssignmentType.PERMANENT
    )
    depozit_odendi = models.DecimalField(
        'Ödenen Depozit', max_digits=10, decimal_places=2,
        default=0, blank=True
    )
    depozit_iade_edildi = models.BooleanField('Depozit İade Edildi mi', default=False)
    depozit_iade_tarihi = models.DateField('İade Tarihi', null=True, blank=True)
    anahtar_verildi = models.BooleanField('Anahtar Verildi mi', default=False)
    anahtar_no = models.CharField('Anahtar No', max_length=20, blank=True, default='')
    baslangic_tarihi = models.DateField('Başlangıç Tarihi')
    bitis_tarihi = models.DateField('Bitiş Tarihi', null=True, blank=True)
    durum = models.CharField(
        'Durum', max_length=20,
        choices=AssignmentStatus.choices,
        default=AssignmentStatus.ACTIVE
    )
    atayan_id = models.IntegerField('Atayan Personel ID', null=True, blank=True)
    notlar = models.TextField('Notlar', blank=True, default='')
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'kutuphane_dolap_atama'
        verbose_name = 'Dolap Ataması'
        verbose_name_plural = 'Dolap Atamaları'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['kurum_id', 'durum']),
            models.Index(fields=['locker', 'durum']),
            models.Index(fields=['ogrenci_id', 'durum']),
        ]

    def __str__(self):
        return f"Dolap {self.locker.dolap_no} → Öğrenci #{self.ogrenci_id}"


class AttendanceSession(models.Model):
    """
    Yoklama Oturumu
    
    Periyot yoklaması: ders_no = null, yoklama_tipi = PERIOD
    Ders bazlı yoklama: ders_no = 1,2,3..., yoklama_tipi = LESSON
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    library = models.ForeignKey(
        Library, on_delete=models.CASCADE,
        related_name='yoklama_oturumlari',
        verbose_name='Kütüphane'
    )
    session_definition = models.ForeignKey(
        SessionDefinition, on_delete=models.SET_NULL,
        related_name='yoklama_oturumlari',
        verbose_name='Oturum Tanımı',
        null=True, blank=True
    )
    periyot_kodu = models.CharField(
        'Periyot Kodu', max_length=20,
        choices=SessionCode.choices,
        default=SessionCode.MORNING,
        help_text='Yoklama periyodu: MORNING, AFTERNOON, EVENING, CUSTOM'
    )
    sube_ders_programi = models.ForeignKey(
        SubeDersProgrami, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='yoklama_oturumlari',
        verbose_name='Ders Programı',
        help_text='Yoklama anındaki ders programı referansı'
    )
    tarih = models.DateField('Yoklama Tarihi')
    yoklama_tipi = models.CharField(
        'Yoklama Tipi', max_length=20,
        choices=AttendanceType.choices,
        default=AttendanceType.PERIOD,
        help_text='PERIOD=Tüm periyot için tek yoklama, LESSON=Ders bazlı yoklama'
    )
    ders_no = models.PositiveIntegerField(
        'Ders Numarası',
        null=True, blank=True,
        help_text='Ders bazlı yoklama ise ders numarası (1,2,3...). Periyot yoklaması ise null.'
    )
    durum = models.CharField(
        'Durum', max_length=20,
        choices=AttendanceSessionStatus.choices,
        default=AttendanceSessionStatus.OPEN
    )
    acan_id = models.IntegerField('Açan Personel ID')
    acilis_zamani = models.DateTimeField('Açılış Zamanı', auto_now_add=True)
    kapatan_id = models.IntegerField('Kapatan Personel ID', null=True, blank=True)
    kapanis_zamani = models.DateTimeField('Kapanış Zamanı', null=True, blank=True)
    notlar = models.TextField('Notlar', blank=True, default='')

    class Meta:
        db_table = 'kutuphane_yoklama_oturum'
        verbose_name = 'Yoklama Oturumu'
        verbose_name_plural = 'Yoklama Oturumları'
        ordering = ['-tarih', '-acilis_zamani']
        indexes = [
            models.Index(fields=['library', 'tarih']),
            models.Index(fields=['durum']),
            models.Index(fields=['tarih', 'yoklama_tipi']),
        ]
        constraints = [
            # Periyot yoklaması: library + periyot_kodu + tarih benzersiz
            models.UniqueConstraint(
                fields=['library', 'periyot_kodu', 'tarih'],
                condition=models.Q(yoklama_tipi='PERIOD'),
                name='unique_yoklama_period'
            ),
            # Ders yoklaması: library + periyot_kodu + tarih + ders_no benzersiz
            models.UniqueConstraint(
                fields=['library', 'periyot_kodu', 'tarih', 'ders_no'],
                condition=models.Q(yoklama_tipi='LESSON'),
                name='unique_yoklama_lesson'
            ),
        ]

    def __str__(self):
        if self.ders_no:
            return f"{self.get_periyot_kodu_display()} - {self.ders_no}. Ders - {self.tarih}"
        return f"{self.get_periyot_kodu_display()} - {self.tarih}"


class AttendanceRecord(models.Model):
    """
    Yoklama Kaydı
    
    AttendanceSession'a bağlı. Her öğrenci için bir kayıt.
    Session zaten yoklama_tipi ve ders_no bilgisini taşıdığından,
    record'da tekrar ders_no tutmaya gerek yok.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    attendance_session = models.ForeignKey(
        AttendanceSession, on_delete=models.CASCADE,
        related_name='kayitlar',
        verbose_name='Yoklama Oturumu'
    )
    ogrenci_id = models.IntegerField('Öğrenci ID')
    seat = models.ForeignKey(
        Seat, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='yoklama_kayitlari',
        verbose_name='Masa'
    )
    durum = models.CharField(
        'Durum', max_length=20,
        choices=AttendanceStatus.choices,
        default=AttendanceStatus.PRESENT
    )
    giris_saati = models.TimeField('Giriş Saati', null=True, blank=True)
    cikis_saati = models.TimeField('Çıkış Saati', null=True, blank=True)
    izinli_mi = models.BooleanField(
        'Otomatik İzinli mi',
        default=False,
        help_text='Öğrenci izin kaydı nedeniyle otomatik olarak EXCUSED yapıldı mı'
    )
    kaydeden_id = models.IntegerField('Kaydeden Personel ID')
    kayit_zamani = models.DateTimeField('Kayıt Zamanı', auto_now_add=True)
    notlar = models.CharField('Notlar', max_length=200, blank=True, default='')

    class Meta:
        db_table = 'kutuphane_yoklama_kayit'
        verbose_name = 'Yoklama Kaydı'
        verbose_name_plural = 'Yoklama Kayıtları'
        ordering = ['ogrenci_id']
        indexes = [
            models.Index(fields=['attendance_session', 'ogrenci_id']),
            models.Index(fields=['ogrenci_id', 'durum']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['attendance_session', 'ogrenci_id'],
                name='unique_yoklama_kayit_ogrenci'
            ),
        ]

    def __str__(self):
        return f"Öğrenci #{self.ogrenci_id} - {self.get_durum_display()}"


class AttendanceNotificationConfig(models.Model):
    """Kurum bazlı yoklama veli bildirimi şablon eşlemesi."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField('Kurum ID', unique=True)
    absent_template = models.ForeignKey(
        'communication.MessageTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
        verbose_name='Gelmedi şablonu',
    )
    late_template = models.ForeignKey(
        'communication.MessageTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
        verbose_name='Geç kalma şablonu',
    )
    exit_template = models.ForeignKey(
        'communication.MessageTemplate',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
        verbose_name='Çıkış şablonu',
    )
    is_active = models.BooleanField('Aktif', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'kutuphane_yoklama_bildirim_ayar'
        verbose_name = 'Yoklama Bildirim Ayarı'
        verbose_name_plural = 'Yoklama Bildirim Ayarları'


class AttendanceNotificationLog(models.Model):
    """Oturum + olay bazlı veli bildirim kaydı (dedup)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    attendance_session = models.ForeignKey(
        AttendanceSession,
        on_delete=models.CASCADE,
        related_name='bildirim_loglari',
    )
    attendance_record = models.ForeignKey(
        AttendanceRecord,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='bildirim_loglari',
    )
    ogrenci_id = models.IntegerField('Öğrenci ID')
    veli_id = models.IntegerField('Veli ID')
    event_type = models.CharField(
        max_length=20,
        choices=AttendanceNotificationEventType.choices,
    )
    message = models.ForeignKey(
        'communication.Message',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
    )
    template_id = models.UUIDField(null=True, blank=True)
    sent_by_id = models.IntegerField('Gönderen', null=True, blank=True)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'kutuphane_yoklama_bildirim_log'
        verbose_name = 'Yoklama Bildirim Logu'
        verbose_name_plural = 'Yoklama Bildirim Logları'
        constraints = [
            models.UniqueConstraint(
                fields=['attendance_session', 'ogrenci_id', 'event_type', 'veli_id'],
                name='unique_yoklama_bildirim_per_veli',
            ),
        ]
        indexes = [
            models.Index(fields=['attendance_session', 'event_type']),
            models.Index(fields=['ogrenci_id', 'event_type']),
        ]


class TemporarySeating(models.Model):
    """
    Geçici Oturma Kaydı
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    library = models.ForeignKey(
        Library, on_delete=models.CASCADE,
        related_name='gecici_oturmalar',
        verbose_name='Kütüphane'
    )
    seat = models.ForeignKey(
        Seat, on_delete=models.CASCADE,
        related_name='gecici_oturmalar',
        verbose_name='Masa'
    )
    ogrenci_id = models.IntegerField('Öğrenci ID')
    sebep = models.CharField(
        'Sebep', max_length=20,
        choices=TemporarySeatingReason.choices,
        default=TemporarySeatingReason.OTHER
    )
    baslangic_zamani = models.DateTimeField('Başlangıç Zamanı')
    beklenen_bitis_zamani = models.DateTimeField('Beklenen Bitiş')
    gercek_bitis_zamani = models.DateTimeField('Gerçek Bitiş', null=True, blank=True)
    durum = models.CharField(
        'Durum', max_length=20,
        choices=TemporarySeatingStatus.choices,
        default=TemporarySeatingStatus.ACTIVE
    )
    onaylayan_id = models.IntegerField('Onaylayan Personel ID')
    notlar = models.TextField('Notlar', blank=True, default='')
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)

    class Meta:
        db_table = 'kutuphane_gecici_oturma'
        verbose_name = 'Geçici Oturma'
        verbose_name_plural = 'Geçici Oturmalar'
        ordering = ['-baslangic_zamani']
        indexes = [
            models.Index(fields=['library', 'durum']),
            models.Index(fields=['seat', 'durum']),
            models.Index(fields=['ogrenci_id']),
        ]

    def __str__(self):
        return f"Geçici: Öğrenci #{self.ogrenci_id} → Masa {self.seat.masa_no}"


class LibraryAuditLog(models.Model):
    """
    Kütüphane Modülü Denetim Logu
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity_type = models.CharField('Varlık Tipi', max_length=50)
    entity_id = models.UUIDField('Varlık ID')
    action = models.CharField(
        'İşlem', max_length=20,
        choices=AuditAction.choices
    )
    old_values = models.JSONField('Eski Değerler', null=True, blank=True)
    new_values = models.JSONField('Yeni Değerler', null=True, blank=True)
    performed_by = models.IntegerField('İşlemi Yapan', null=True, blank=True)
    performed_at = models.DateTimeField('İşlem Zamanı', auto_now_add=True)
    ip_address = models.GenericIPAddressField('IP Adresi', null=True, blank=True)
    description = models.CharField('Açıklama', max_length=255, blank=True, default='')

    class Meta:
        db_table = 'kutuphane_denetim_log'
        verbose_name = 'Denetim Logu'
        verbose_name_plural = 'Denetim Logları'
        ordering = ['-performed_at']
        indexes = [
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['performed_at']),
        ]

    def __str__(self):
        return f"{self.entity_type} - {self.get_action_display()} - {self.performed_at}"
