from django.core.validators import RegexValidator
from rest_framework import serializers

from apps.egitim_tanimlari.models import Alan, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.okul.models import Okul
from apps.sube.domain.models import Sube

from ..domain.sinif_seviyesi_rules import sinif_seviyesi_requires_alan
from ..domain.models import (
    DraftAddress,
    DraftEnrollment,
    DraftGuardian,
    DraftPackageSelection,
    DraftStudent,
    LocationCity,
    LocationDistrict,
    LookupOption,
    WizardDraft,
)

TC_VALIDATOR = RegexValidator(r"^\d{11}$", "TC Kimlik No 11 haneli olmalıdır")
PHONE_VALIDATOR = RegexValidator(
    r"^(\(5\d{2}\)\s?\d{3}\s?\d{2}\s?\d{2}|05\d{2}\s?\d{3}\s?\d{2}\s?\d{2})$",
    "Geçersiz telefon formatı. Örnek: (5XX) XXX XX XX veya 05XX XXX XX XX"
)
NAME_VALIDATOR = RegexValidator(r"^[A-Za-zÇĞİÖŞÜçğıöşü\s]+$", "Ad ve soyad sadece harflerden oluşmalıdır")
STUDENT_NO_VALIDATOR = RegexValidator(r"^\d{3,10}$", "Öğrenci No 3-10 haneli bir sayı olmalıdır")


class LookupOptionField(serializers.PrimaryKeyRelatedField):
    def __init__(self, *args, category_code: str | None = None, **kwargs):
        self.category_code = category_code
        super().__init__(*args, **kwargs)

    def get_queryset(self):
        queryset = LookupOption.objects.filter(is_active=True)
        if self.category_code:
            queryset = queryset.filter(category__code=self.category_code)
        return queryset


class DraftStudentSerializer(serializers.ModelSerializer):
    kayit_turu = LookupOptionField(category_code="registration_type")
    cinsiyet = LookupOptionField(category_code="gender", required=False, allow_null=True)
    il = serializers.PrimaryKeyRelatedField(queryset=LocationCity.objects.filter(is_active=True))
    ilce = serializers.PrimaryKeyRelatedField(queryset=LocationDistrict.objects.filter(is_active=True))

    class Meta:
        model = DraftStudent
        fields = [
            "kayit_turu",
            "tc_kimlik_no",
            "ad",
            "soyad",
            "dogum_tarihi",
            "cinsiyet",
            "email",
            "telefon",
            "il",
            "ilce",
            "ogrenci_kendi_velisi",
        ]

    def validate_tc_kimlik_no(self, value):
        TC_VALIDATOR(value)
        return value

    def validate_ad(self, value):
        NAME_VALIDATOR(value)
        return value.strip().title()

    def validate_soyad(self, value):
        NAME_VALIDATOR(value)
        return value.strip().title()

    def validate_telefon(self, value):
        PHONE_VALIDATOR(value)
        return value

    def validate(self, attrs):
        il = attrs.get("il")
        ilce = attrs.get("ilce")
        if il and ilce and ilce.city_id != il.id:
            raise serializers.ValidationError({"ilce": "İlçe, seçilen ile ait olmalıdır"})
        return attrs


class DraftEnrollmentSerializer(serializers.ModelSerializer):
    egitim_yili = serializers.PrimaryKeyRelatedField(queryset=EgitimYili.objects.filter(aktif_mi=True))
    sinif_seviyesi = serializers.PrimaryKeyRelatedField(queryset=SinifSeviyesi.objects.filter(aktif_mi=True))
    alan = serializers.PrimaryKeyRelatedField(queryset=Alan.objects.filter(aktif_mi=True), required=False, allow_null=True)
    sube = serializers.PrimaryKeyRelatedField(queryset=Sube.objects.filter(aktif_mi=True), required=False, allow_null=True)
    giris_turu = LookupOptionField(category_code="entry_type")
    school = serializers.PrimaryKeyRelatedField(queryset=Okul.objects.all(), required=False, allow_null=True)

    class Meta:
        model = DraftEnrollment
        fields = [
            "ogrenci_no",
            "egitim_yili",
            "sinif_seviyesi",
            "alan",
            "sube",
            "kaydi_alan",
            "giris_tarihi",
            "giris_turu",
            "school",
            "geldigi_okul",
            "referans",
        ]
        read_only_fields = ["kaydi_alan"]

    def validate_ogrenci_no(self, value):
        STUDENT_NO_VALIDATOR(value)
        return value

    def validate(self, attrs):
        sinif_seviyesi = attrs.get("sinif_seviyesi")
        ogrenci_no = attrs.get("ogrenci_no")
        if sinif_seviyesi and ogrenci_no:
            prefix = getattr(sinif_seviyesi, "ogrenci_no_prefix", "") or ""
            if prefix and not ogrenci_no.startswith(prefix):
                raise serializers.ValidationError({"ogrenci_no": "Öğrenci no sınıf seviyesi prefixi ile başlamalıdır"})
        if sinif_seviyesi and sinif_seviyesi_requires_alan(sinif_seviyesi) and not attrs.get("alan"):
            raise serializers.ValidationError({"alan": "Seçilen sınıf seviyesinde alan zorunludur"})
        return attrs


class DraftAddressSerializer(serializers.ModelSerializer):
    adres_turu = LookupOptionField(category_code="address_type")
    il = serializers.PrimaryKeyRelatedField(queryset=LocationCity.objects.filter(is_active=True))
    ilce = serializers.PrimaryKeyRelatedField(queryset=LocationDistrict.objects.filter(is_active=True))

    class Meta:
        model = DraftAddress
        fields = [
            "adres_turu",
            "adres",
            "il",
            "ilce",
            "posta_kodu",
            "varsayilan",
        ]

    def validate_adres(self, value):
        return " ".join([part.capitalize() for part in value.split()])

    def validate(self, attrs):
        il = attrs.get("il")
        ilce = attrs.get("ilce")
        if il and ilce and ilce.city_id != il.id:
            raise serializers.ValidationError({"ilce": "İlçe, seçilen ile ait olmalıdır"})
        return attrs


class DraftGuardianSerializer(serializers.ModelSerializer):
    veli_turu = LookupOptionField(category_code="guardian_type")
    sms_bildirimleri = LookupOptionField(category_code="sms_notification", many=True, required=False)

    class Meta:
        model = DraftGuardian
        fields = [
            "veli_turu",
            "tc_kimlik_no",
            "ad",
            "soyad",
            "email",
            "telefon",
            "telefonlar",
            "sms_bildirimleri",
            "egitim_seviyesi",
            "meslek",
            "calistigi_kurum",
        ]

    def validate_tc_kimlik_no(self, value):
        if value:
            TC_VALIDATOR(value)
        return value

    def validate_ad(self, value):
        NAME_VALIDATOR(value)
        return value.strip().title()

    def validate_soyad(self, value):
        NAME_VALIDATOR(value)
        return value.strip().title()

    def validate_telefon(self, value):
        if value:
            PHONE_VALIDATOR(value)
        return value


class DraftPackageSerializer(serializers.ModelSerializer):
    paket_turu = LookupOptionField(category_code="package_type")

    class Meta:
        model = DraftPackageSelection
        fields = [
            "paket_turu",
            "paket_id",
            "paket_adi",
        ]


class WizardDraftSerializer(serializers.ModelSerializer):
    student = DraftStudentSerializer(read_only=True)
    enrollment = DraftEnrollmentSerializer(read_only=True)
    addresses = DraftAddressSerializer(many=True, read_only=True)
    guardians = DraftGuardianSerializer(many=True, read_only=True)
    packages = DraftPackageSerializer(many=True, read_only=True)

    class Meta:
        model = WizardDraft
        fields = [
            "id",
            "status",
            "current_step",
            "last_saved_at",
            "created_at",
            "student",
            "enrollment",
            "addresses",
            "guardians",
            "packages",
        ]
