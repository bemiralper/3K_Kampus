import uuid

from django.conf import settings
from django.db import models


class MobileDeviceSession(models.Model):
    """Bir cihazın mobil oturumu. Web `lms_sessionid` kaydı değildir."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='mobile_device_sessions',
    )
    device_key = models.CharField(max_length=128)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'mobile_device_session'
        indexes = [
            models.Index(fields=['user', 'device_key'], name='mob_sess_user_device'),
        ]


class MobileRefreshToken(models.Model):
    """Tek kullanımlık refresh. Düz metin saklanmaz, yalnız SHA-256 özeti durur."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        MobileDeviceSession,
        on_delete=models.CASCADE,
        related_name='refresh_tokens',
    )
    secret_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'mobile_refresh_token'


class DersSubjectLink(models.Model):
    """Kurum dersini müfredat konusuna bağlar. Öğretmen bu eşlemeyi yazmaz."""

    ders = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.CASCADE,
        related_name='subject_links',
    )
    topic = models.ForeignKey(
        'olcme_degerlendirme.Topic',
        on_delete=models.CASCADE,
        related_name='ders_links',
    )

    class Meta:
        db_table = 'ders_subject_link'
        constraints = [
            models.UniqueConstraint(fields=['ders', 'topic'], name='ders_subject_link_unique'),
        ]


class IslenenKonu(models.Model):
    """Bir ders gerçekleşmesinde işlenen konu veya serbest not."""

    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='islenen_konular')
    sube = models.ForeignKey('sube.Sube', on_delete=models.CASCADE, related_name='islenen_konular')
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='islenen_konular',
    )
    term = models.ForeignKey('term.Term', on_delete=models.CASCADE, related_name='islenen_konular')
    class_lesson_plan = models.ForeignKey(
        'academic.ClassLessonPlan',
        on_delete=models.CASCADE,
        related_name='islenen_konular',
    )
    ogretmen = models.ForeignKey(
        'personel.Personel',
        on_delete=models.PROTECT,
        related_name='islenen_konular',
    )
    session_date = models.DateField()
    lesson_session = models.ForeignKey(
        'academic.LessonSession',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='islenen_konular',
    )
    program_grid_cell = models.ForeignKey(
        'academic.ProgramGridCell',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='islenen_konular',
    )
    topic = models.ForeignKey(
        'olcme_degerlendirme.Topic',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='islenen_kayitlar',
    )
    note = models.TextField(blank=True, default='')
    idempotency_key = models.CharField(max_length=80, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='islenen_konular',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'islenen_konu'
        indexes = [
            models.Index(
                fields=['class_lesson_plan', 'session_date'],
                name='islenen_plan_date',
            ),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(topic__isnull=False) | ~models.Q(note=''),
                name='islenen_konu_topic_or_note',
            ),
            models.UniqueConstraint(
                fields=['lesson_session', 'topic'],
                condition=models.Q(topic__isnull=False, lesson_session__isnull=False),
                name='islenen_konu_session_topic',
            ),
            models.UniqueConstraint(
                fields=['program_grid_cell', 'session_date', 'topic'],
                condition=models.Q(topic__isnull=False, lesson_session__isnull=True),
                name='islenen_konu_cell_topic',
            ),
            models.UniqueConstraint(
                fields=['created_by', 'idempotency_key'],
                condition=~models.Q(idempotency_key=''),
                name='islenen_konu_idempotent',
            ),
        ]


class IslenenKazanim(models.Model):
    """İşlenen konu kaydında işaretlenen kazanım. İşaret kaydı tamamlamak için gerekmez."""

    islenen_konu = models.ForeignKey(
        IslenenKonu,
        on_delete=models.CASCADE,
        related_name='kazanimlar',
    )
    outcome = models.ForeignKey(
        'olcme_degerlendirme.Outcome',
        on_delete=models.PROTECT,
        related_name='islenen_kayitlar',
    )

    class Meta:
        db_table = 'islenen_kazanim'
        constraints = [
            models.UniqueConstraint(fields=['islenen_konu', 'outcome'], name='islenen_kazanim_unique'),
        ]


class DersNotu(models.Model):
    """Sınıfa yüklenen ders notu. Dosya Google Drive'da durur, burada yalnız kimliği vardır."""

    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='ders_notlari')
    sube = models.ForeignKey('sube.Sube', on_delete=models.CASCADE, related_name='ders_notlari')
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='ders_notlari',
    )
    term = models.ForeignKey('term.Term', on_delete=models.CASCADE, related_name='ders_notlari')
    class_lesson_plan = models.ForeignKey(
        'academic.ClassLessonPlan',
        on_delete=models.CASCADE,
        related_name='ders_notlari',
    )
    ogretmen = models.ForeignKey(
        'personel.Personel',
        on_delete=models.PROTECT,
        related_name='ders_notlari',
    )
    session_date = models.DateField()
    file_name = models.CharField(max_length=180)
    drive_file_id = models.CharField(max_length=128, unique=True)
    mime_type = models.CharField(max_length=80)
    size = models.PositiveIntegerField()
    idempotency_key = models.CharField(max_length=80, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='ders_notlari',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ders_notu'
        indexes = [
            models.Index(fields=['class_lesson_plan', 'session_date'], name='ders_notu_plan_date'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['created_by', 'idempotency_key'],
                condition=~models.Q(idempotency_key=''),
                name='ders_notu_idempotent',
            ),
        ]


class BoardDisplay(models.Model):
    """Şube tahtası. Eşleştirme kodu ve yoklama jetonu düz metin saklanmaz."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device_key = models.CharField(max_length=128, unique=True)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='board_displays',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='board_displays',
    )
    poll_token_hash = models.CharField(max_length=64, unique=True)
    pair_code_hash = models.CharField(max_length=64, null=True, blank=True, unique=True)
    pair_code_expires_at = models.DateTimeField(null=True, blank=True)
    holder = models.ForeignKey(
        'personel.Personel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='held_boards',
    )
    class_lesson_plan = models.ForeignKey(
        'academic.ClassLessonPlan',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='board_displays',
    )
    lesson_label = models.CharField(max_length=200, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'board_display'
