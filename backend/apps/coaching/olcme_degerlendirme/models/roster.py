"""Sınav katılımcı listesi, salon, oturma ve oturum grubu ayarları."""
from django.db import models


class ScheduleGroup(models.TextChoices):
    HAFTA_ICI = 'HAFTA_ICI', 'Hafta İçi'
    HAFTA_SONU = 'HAFTA_SONU', 'Hafta Sonu'


class ExamAudience(models.Model):
    """Seçilen seviye ve/veya deneme paketi (ikisi de boş olabilir)."""

    exam = models.ForeignKey(
        'olcme_degerlendirme.Exam',
        on_delete=models.CASCADE,
        related_name='audiences',
    )
    sinif_seviyesi = models.ForeignKey(
        'egitim_tanimlari.SinifSeviyesi',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='olcme_audiences',
    )
    deneme_paketi = models.ForeignKey(
        'egitim_paketleri.Deneme',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='olcme_audiences',
    )

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Sınav Kitle Kuralı'
        verbose_name_plural = 'Sınav Kitle Kuralları'
        constraints = [
            models.UniqueConstraint(
                fields=['exam', 'sinif_seviyesi', 'deneme_paketi'],
                name='unique_exam_audience_row',
            ),
        ]


class ExamRoom(models.Model):
    exam = models.ForeignKey(
        'olcme_degerlendirme.Exam',
        on_delete=models.CASCADE,
        related_name='rooms',
    )
    name = models.CharField('Salon Adı', max_length=100)
    capacity = models.PositiveIntegerField('Kapasite', default=30)
    order = models.PositiveSmallIntegerField('Sıra', default=0)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Sınav Salonu'
        verbose_name_plural = 'Sınav Salonları'
        ordering = ['exam', 'order', 'id']
        constraints = [
            models.UniqueConstraint(fields=['exam', 'name'], name='unique_exam_room_name'),
        ]

    def __str__(self):
        return f'{self.exam_id} – {self.name}'


class OlcmeSeviyeOturumAyar(models.Model):
    """Şube + sınıf seviyesi için varsayılan hafta içi / hafta sonu grubu."""

    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='olcme_seviye_oturum_ayarlari',
    )
    sinif_seviyesi = models.ForeignKey(
        'egitim_tanimlari.SinifSeviyesi',
        on_delete=models.CASCADE,
        related_name='olcme_oturum_ayarlari',
    )
    preference = models.CharField(
        max_length=12,
        choices=ScheduleGroup.choices,
        default=ScheduleGroup.HAFTA_ICI,
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Seviye Oturum Ayarı'
        verbose_name_plural = 'Seviye Oturum Ayarları'
        constraints = [
            models.UniqueConstraint(
                fields=['sube', 'sinif_seviyesi'],
                name='unique_olcme_seviye_oturum_ayar',
            ),
        ]

    def __str__(self):
        return f'{self.sube_id} {self.sinif_seviyesi_id} {self.preference}'


class OlcmeOgrenciOturumTercihi(models.Model):
    """Öğrencinin şube + eğitim yılındaki hafta içi / hafta sonu override’ı."""

    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='olcme_ogrenci_oturum_tercihleri',
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='olcme_ogrenci_oturum_tercihleri',
    )
    ogrenci = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='olcme_oturum_tercihleri',
    )
    preference = models.CharField(max_length=12, choices=ScheduleGroup.choices)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Öğrenci Oturum Tercihi'
        verbose_name_plural = 'Öğrenci Oturum Tercihleri'
        constraints = [
            models.UniqueConstraint(
                fields=['sube', 'egitim_yili', 'ogrenci'],
                name='unique_olcme_ogrenci_oturum_tercihi',
            ),
        ]

    def __str__(self):
        return f'{self.ogrenci_id} {self.preference}'


class ExamParticipant(models.Model):
    class Source(models.TextChoices):
        AUTO = 'auto', 'Otomatik'
        MANUAL = 'manual', 'Manuel'

    class Attendance(models.TextChoices):
        UNKNOWN = '', 'Belirsiz'
        PRESENT = 'present', 'Geldi'
        ABSENT = 'absent', 'Gelmedi'

    exam = models.ForeignKey(
        'olcme_degerlendirme.Exam',
        on_delete=models.CASCADE,
        related_name='participants',
    )
    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='olcme_exam_participations',
    )
    exam_session = models.ForeignKey(
        'olcme_degerlendirme.ExamSessionModel',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='participants',
    )
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.AUTO)
    sinif_seviyesi = models.ForeignKey(
        'egitim_tanimlari.SinifSeviyesi',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
    )
    deneme_paketi = models.ForeignKey(
        'egitim_paketleri.Deneme',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
    )
    room = models.ForeignKey(
        ExamRoom,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='participants',
    )
    seat_no = models.PositiveIntegerField('Sıra', null=True, blank=True)
    desk_no = models.CharField('Masa / Koltuk', max_length=20, blank=True)
    attendance = models.CharField(
        max_length=10, choices=Attendance.choices, default=Attendance.UNKNOWN, blank=True,
    )
    notified_at = models.DateTimeField('Sınav bilgisi gönderildi', null=True, blank=True)
    notified_room_id = models.PositiveIntegerField(null=True, blank=True)
    notified_seat_no = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def seat_locked(self) -> bool:
        return bool(self.notified_at and self.room_id and self.seat_no)

    @property
    def seat_stale(self) -> bool:
        if not self.notified_at:
            return False
        return self.room_id != self.notified_room_id or self.seat_no != self.notified_seat_no

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Sınav Katılımcısı'
        verbose_name_plural = 'Sınav Katılımcıları'
        ordering = ['room__order', 'seat_no', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['exam', 'student'],
                condition=models.Q(exam_session__isnull=True),
                name='unique_exam_participant_no_session',
            ),
            models.UniqueConstraint(
                fields=['exam', 'student', 'exam_session'],
                condition=models.Q(exam_session__isnull=False),
                name='unique_exam_participant_session',
            ),
            models.UniqueConstraint(
                fields=['exam', 'room', 'seat_no'],
                condition=models.Q(
                    exam_session__isnull=True, room__isnull=False, seat_no__isnull=False,
                ),
                name='unique_exam_room_seat',
            ),
            models.UniqueConstraint(
                fields=['exam_session', 'room', 'seat_no'],
                condition=models.Q(
                    exam_session__isnull=False, room__isnull=False, seat_no__isnull=False,
                ),
                name='unique_exam_session_room_seat',
            ),
        ]

    def __str__(self):
        return f'{self.exam_id} – {self.student_id}'
