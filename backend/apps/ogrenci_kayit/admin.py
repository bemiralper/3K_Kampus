from django.contrib import admin

from .models import (
    DraftAddress,
    DraftEnrollment,
    DraftGuardian,
    DraftPackageSelection,
    DraftStudent,
    LocationCity,
    LocationDistrict,
    LookupCategory,
    LookupOption,
    WizardDraft,
    WizardRule,
)


@admin.register(LookupCategory)
class LookupCategoryAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["code", "name"]


@admin.register(LookupOption)
class LookupOptionAdmin(admin.ModelAdmin):
    list_display = ["category", "label", "code", "order", "is_active"]
    list_filter = ["category", "is_active"]
    search_fields = ["label", "code"]


@admin.register(LocationCity)
class LocationCityAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "is_default", "is_active"]
    list_filter = ["is_default", "is_active"]
    search_fields = ["name", "code"]


@admin.register(LocationDistrict)
class LocationDistrictAdmin(admin.ModelAdmin):
    list_display = ["city", "name", "is_active"]
    list_filter = ["city", "is_active"]
    search_fields = ["name"]


@admin.register(WizardRule)
class WizardRuleAdmin(admin.ModelAdmin):
    list_display = ["code", "trigger_field", "action", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["code", "trigger_field", "target_field"]


@admin.register(WizardDraft)
class WizardDraftAdmin(admin.ModelAdmin):
    list_display = ["id", "kurum", "sube", "status", "current_step", "created_at"]
    list_filter = ["status", "current_step"]
    search_fields = ["id"]


@admin.register(DraftStudent)
class DraftStudentAdmin(admin.ModelAdmin):
    list_display = ["draft", "ad", "soyad", "tc_kimlik_no", "il", "ilce"]
    search_fields = ["tc_kimlik_no", "ad", "soyad"]


@admin.register(DraftEnrollment)
class DraftEnrollmentAdmin(admin.ModelAdmin):
    list_display = ["draft", "ogrenci_no", "egitim_yili", "sinif_seviyesi", "giris_tarihi"]
    list_filter = ["egitim_yili", "sinif_seviyesi"]


@admin.register(DraftAddress)
class DraftAddressAdmin(admin.ModelAdmin):
    list_display = ["draft", "adres_turu", "il", "ilce", "varsayilan"]
    list_filter = ["adres_turu", "il", "ilce"]


@admin.register(DraftGuardian)
class DraftGuardianAdmin(admin.ModelAdmin):
    list_display = ["draft", "veli_turu", "ad", "soyad", "telefon"]
    search_fields = ["ad", "soyad", "telefon", "tc_kimlik_no"]


@admin.register(DraftPackageSelection)
class DraftPackageSelectionAdmin(admin.ModelAdmin):
    list_display = ["draft", "paket_turu", "paket_adi", "paket_id"]
    list_filter = ["paket_turu"]


