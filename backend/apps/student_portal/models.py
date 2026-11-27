from django.conf import settings
from django.db import models


class StudentPortalAccount(models.Model):
    """
    Öğrenci ile Django User arasındaki izole portal hesap bağı.
    Mevcut `ogrenci` tablosuna dokunmadan çoklu kurum güvenli eşleme sağlar.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='student_portal_account',
        verbose_name='Kullanıcı',
    )
    ogrenci = models.OneToOneField(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='portal_account',
        verbose_name='Öğrenci',
    )
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='student_portal_accounts',
        verbose_name='Kurum',
    )
    is_enabled = models.BooleanField(
        'Portal Erişimi Açık',
        default=True,
    )
    preferences = models.JSONField(
        'Portal Tercihleri',
        default=dict,
        blank=True,
    )
    read_announcement_ids = models.JSONField(
        'Okunan Duyuru Kimlikleri',
        default=list,
        blank=True,
    )
    last_seen_at = models.DateTimeField(
        'Son Görülme',
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_student_portal_accounts',
        verbose_name='Oluşturan',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'student_portal_account'
        verbose_name = 'Öğrenci Portal Hesabı'
        verbose_name_plural = 'Öğrenci Portal Hesapları'
        indexes = [
            models.Index(fields=['kurum', 'is_enabled'], name='spa_kurum_enabled_idx'),
        ]

    def __str__(self):
        return f'{self.ogrenci} ({self.user.username})'


class StudentCoachMessage(models.Model):
    """
    Öğrenci portalı üzerinden öğrenci <-> birincil koç çift yönlü mesajlaşma kaydı.
    Meta WhatsApp kuyruğundan tamamen bağımsız ve izoledir.
    """

    class SenderKind(models.TextChoices):
        STUDENT = 'student', 'Öğrenci'
        COACH = 'coach', 'Koç'

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='student_coach_messages',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='student_coach_messages',
        verbose_name='Şube',
    )
    student = models.ForeignKey(
        'ogrenci.Ogrenci',
        on_delete=models.CASCADE,
        related_name='portal_coach_messages',
        verbose_name='Öğrenci',
    )
    coach = models.ForeignKey(
        'coaching.CoachProfile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='portal_student_messages',
        verbose_name='Koç',
    )
    sender_kind = models.CharField(
        'Gönderen Türü',
        max_length=16,
        choices=SenderKind.choices,
    )
    sender_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sent_student_portal_messages',
        verbose_name='Gönderen Kullanıcı',
    )
    body = models.TextField('Mesaj')
    read_by_student_at = models.DateTimeField('Öğrenci Okuma Zamanı', null=True, blank=True)
    read_by_coach_at = models.DateTimeField('Koç Okuma Zamanı', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'student_portal_coach_message'
        verbose_name = 'Öğrenci-Koç Portal Mesajı'
        verbose_name_plural = 'Öğrenci-Koç Portal Mesajları'
        ordering = ['created_at', 'id']
        indexes = [
            models.Index(fields=['student', 'created_at'], name='spcm_student_created_idx'),
            models.Index(fields=['coach', 'read_by_coach_at'], name='spcm_coach_unread_idx'),
            models.Index(fields=['student', 'read_by_student_at'], name='spcm_student_unread_idx'),
        ]

    def __str__(self):
        return f'{self.student} [{self.sender_kind}]: {self.body[:40]}'
