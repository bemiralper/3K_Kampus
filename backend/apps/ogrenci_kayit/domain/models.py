"""
Yeni Öğrenci Kayıt Wizard Domain Models
Kurumsal, ölçeklenebilir ve normalize yapı
"""
import uuid

from django.conf import settings
from django.db import models


class LookupCategory(models.Model):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "wizard_lookup_category"
        verbose_name = "Wizard Kategori"
        verbose_name_plural = "Wizard Kategorileri"
        ordering = ["name"]

    def __str__(self):
        return self.name


class LookupOption(models.Model):
    category = models.ForeignKey(
        LookupCategory,
        on_delete=models.CASCADE,
        related_name="options",
    )
    code = models.CharField(max_length=50)
    label = models.CharField(max_length=200)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(blank=True, null=True)

    class Meta:
        db_table = "wizard_lookup_option"
        verbose_name = "Wizard Seçenek"
        verbose_name_plural = "Wizard Seçenekleri"
        unique_together = ("category", "code")
        ordering = ["category", "order", "label"]

    def __str__(self):
        return f"{self.category.code}: {self.label}"


class LocationCity(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=10, unique=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "wizard_city"
        verbose_name = "İl"
        verbose_name_plural = "İller"
        ordering = ["name"]

    def __str__(self):
        return self.name


class LocationDistrict(models.Model):
    city = models.ForeignKey(
        LocationCity,
        on_delete=models.CASCADE,
        related_name="districts",
    )
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "wizard_district"
        verbose_name = "İlçe"
        verbose_name_plural = "İlçeler"
        ordering = ["name"]
        unique_together = ("city", "name")

    def __str__(self):
        return f"{self.city.name} / {self.name}"


class WizardRule(models.Model):
    code = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, blank=True)
    trigger_field = models.CharField(max_length=100)
    operator = models.CharField(max_length=30)
    trigger_value = models.CharField(max_length=200, blank=True)
    target_field = models.CharField(max_length=100)
    action = models.CharField(max_length=30)
    payload = models.JSONField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "wizard_rule"
        verbose_name = "Wizard Kural"
        verbose_name_plural = "Wizard Kuralları"
        ordering = ["code"]

    def __str__(self):
        return self.code


class WizardDraft(models.Model):
    STATUS_CHOICES = [
        ("draft", "Taslak"),
        ("submitted", "Gönderildi"),
        ("abandoned", "Terk Edildi"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum = models.ForeignKey(
        "kurum.Kurum",
        on_delete=models.PROTECT,
        related_name="wizard_kayitlar",
    )
    sube = models.ForeignKey(
        "sube.Sube",
        on_delete=models.PROTECT,
        related_name="wizard_kayitlar",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="wizard_kayitlari",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    current_step = models.PositiveIntegerField(default=1)
    last_saved_at = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wizard_draft"
        verbose_name = "Wizard Taslak"
        verbose_name_plural = "Wizard Taslaklar"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Wizard {self.id}"


class DraftStudent(models.Model):
    draft = models.OneToOneField(
        WizardDraft,
        on_delete=models.CASCADE,
        related_name="student",
    )
    kayit_turu = models.ForeignKey(
        LookupOption,
        on_delete=models.PROTECT,
        related_name="draft_kayit_turu",
    )
    tc_kimlik_no = models.CharField(max_length=11)
    ad = models.CharField(max_length=100)
    soyad = models.CharField(max_length=100)
    dogum_tarihi = models.DateField(null=True, blank=True)
    cinsiyet = models.ForeignKey(
        LookupOption,
        on_delete=models.PROTECT,
        related_name="draft_cinsiyet",
        null=True,
        blank=True,
    )
    email = models.EmailField(blank=True)
    telefon = models.CharField(max_length=20)
    il = models.ForeignKey(LocationCity, on_delete=models.PROTECT)
    ilce = models.ForeignKey(LocationDistrict, on_delete=models.PROTECT)
    ogrenci_kendi_velisi = models.BooleanField(default=False)

    class Meta:
        db_table = "wizard_draft_student"
        verbose_name = "Wizard Öğrenci"
        verbose_name_plural = "Wizard Öğrenciler"


class DraftEnrollment(models.Model):
    draft = models.OneToOneField(
        WizardDraft,
        on_delete=models.CASCADE,
        related_name="enrollment",
    )
    ogrenci_no = models.CharField(max_length=5)
    egitim_yili = models.ForeignKey("egitim_yili.EgitimYili", on_delete=models.PROTECT)
    sinif_seviyesi = models.ForeignKey("egitim_tanimlari.SinifSeviyesi", on_delete=models.PROTECT)
    alan = models.ForeignKey("egitim_tanimlari.Alan", on_delete=models.PROTECT, null=True, blank=True)
    sube = models.ForeignKey("sube.Sube", on_delete=models.PROTECT, null=True, blank=True)
    kaydi_alan = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="wizard_kayit_alan",
        null=True,
        blank=True,
    )
    giris_tarihi = models.DateField()
    giris_turu = models.ForeignKey(
        LookupOption,
        on_delete=models.PROTECT,
        related_name="draft_giris_turu",
    )
    geldigi_okul = models.CharField(max_length=200, blank=True)
    school = models.ForeignKey(
        'okul.Okul',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='draft_enrollments',
        db_column='school_id',
    )
    referans = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "wizard_draft_enrollment"
        verbose_name = "Wizard Kurumsal Kayıt"
        verbose_name_plural = "Wizard Kurumsal Kayıtlar"


class DraftAddress(models.Model):
    draft = models.ForeignKey(
        WizardDraft,
        on_delete=models.CASCADE,
        related_name="addresses",
    )
    adres_turu = models.ForeignKey(
        LookupOption,
        on_delete=models.PROTECT,
        related_name="draft_adres_turu",
    )
    adres = models.TextField()
    il = models.ForeignKey(LocationCity, on_delete=models.PROTECT)
    ilce = models.ForeignKey(LocationDistrict, on_delete=models.PROTECT)
    posta_kodu = models.CharField(max_length=10, blank=True)
    varsayilan = models.BooleanField(default=False)

    class Meta:
        db_table = "wizard_draft_address"
        verbose_name = "Wizard Adres"
        verbose_name_plural = "Wizard Adresler"


class DraftGuardian(models.Model):
    draft = models.ForeignKey(
        WizardDraft,
        on_delete=models.CASCADE,
        related_name="guardians",
    )
    veli_turu = models.ForeignKey(
        LookupOption,
        on_delete=models.PROTECT,
        related_name="draft_veli_turu",
    )
    tc_kimlik_no = models.CharField(max_length=11, blank=True)
    ad = models.CharField(max_length=100)
    soyad = models.CharField(max_length=100)
    email = models.EmailField(blank=True)
    telefon = models.CharField(max_length=20)
    telefonlar = models.JSONField(
        default=list,
        blank=True,
        help_text='Ek/çoklu telefonlar; telefon alanı WhatsApp varsayılanıdır.',
    )
    sms_bildirimleri = models.ManyToManyField(
        LookupOption,
        related_name="draft_sms_bildirimleri",
        blank=True,
    )
    egitim_seviyesi = models.CharField(max_length=100, blank=True)
    meslek = models.CharField(max_length=100, blank=True)
    calistigi_kurum = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "wizard_draft_guardian"
        verbose_name = "Wizard Veli"
        verbose_name_plural = "Wizard Veliler"


class DraftPackageSelection(models.Model):
    draft = models.ForeignKey(
        WizardDraft,
        on_delete=models.CASCADE,
        related_name="packages",
    )
    paket_turu = models.ForeignKey(
        LookupOption,
        on_delete=models.PROTECT,
        related_name="draft_paket_turu",
    )
    paket_id = models.IntegerField()
    paket_adi = models.CharField(max_length=200)

    class Meta:
        db_table = "wizard_draft_package"
        verbose_name = "Wizard Paket"
        verbose_name_plural = "Wizard Paketler"
