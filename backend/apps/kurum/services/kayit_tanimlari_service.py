"""
Öğrenci kayıt sihirbazı lookup tanımları.

Sabit sistem lookup'ları (giriş türü, cinsiyet vb.) otomatik seed edilir.
Kayıt türü Kurum Yönetimi üzerinden yönetilebilir.
"""
from apps.ogrenci_kayit.domain.models import LookupCategory, LookupOption
from shared.utils import generate_kod

REGISTRATION_TYPE_CODE = "registration_type"
GENDER_CODE = "gender"
ENTRY_TYPE_CODE = "entry_type"

# Migration 0001_initial seed verisi — sabit sistem lookup'ları
SYSTEM_LOOKUPS = {
    REGISTRATION_TYPE_CODE: {
        "name": "Kayıt Türü",
        "defaults": [
            ("asil", "Asil"),
            ("misafir", "Misafir"),
            ("yaz_programi", "Yaz Programı"),
        ],
        "auto_code": True,
        "empty_label_error": "Kayıt türü adı zorunludur",
    },
    ENTRY_TYPE_CODE: {
        "name": "Giriş Türü",
        "defaults": [
            ("yeni_kayit", "Yeni Kayıt"),
            ("kayit_yenileme", "Kayıt Yenileme"),
            ("zorunlu_kayit", "Zorunlu Kayıt"),
            ("on_kayit", "Ön Kayıt"),
            ("kayit_gorusmesi", "Kayıt Görüşmesi"),
        ],
        "auto_code": True,
        "empty_label_error": "Giriş türü adı zorunludur",
    },
    "address_type": {
        "name": "Adres Türü",
        "defaults": [
            ("ev", "Ev"),
            ("is", "İş"),
            ("diger", "Diğer"),
        ],
        "auto_code": True,
        "empty_label_error": "Adres türü adı zorunludur",
    },
    "guardian_type": {
        "name": "Veli Türü",
        "defaults": [
            ("anne", "Anne"),
            ("baba", "Baba"),
            ("kiz_kardes", "Kız Kardeş"),
            ("erkek_kardes", "Erkek Kardeş"),
            ("dayi_amca", "Dayı / Amca"),
            ("hala_teyze", "Hala / Teyze"),
            ("egitim_masraf", "Eğitim masraflarını karşılayan"),
            ("diger", "Diğer"),
        ],
        "auto_code": True,
        "empty_label_error": "Veli türü adı zorunludur",
    },
    "package_type": {
        "name": "Paket Türü",
        "defaults": [
            ("grup_dersi", "Grup Dersi"),
            ("ozel_ders", "Özel Ders"),
            ("deneme", "Deneme"),
            ("davranis", "Davranış"),
        ],
        "auto_code": True,
        "empty_label_error": "Paket türü adı zorunludur",
    },
    GENDER_CODE: {
        "name": "Cinsiyet",
        "defaults": [
            ("E", "Erkek"),
            ("K", "Kadın"),
        ],
        "auto_code": False,
        "empty_label_error": "Cinsiyet adı zorunludur",
    },
    "sms_notification": {
        "name": "SMS Bildirim Tipi",
        "defaults": [
            ("devamsizlik", "Devamsızlık"),
            ("odeme", "Ödeme"),
            ("duyuru", "Duyuru"),
        ],
        "auto_code": True,
        "empty_label_error": "Bildirim tipi adı zorunludur",
    },
}


def ensure_category(category_code: str) -> LookupCategory:
    config = SYSTEM_LOOKUPS[category_code]
    category, _ = LookupCategory.objects.get_or_create(
        code=category_code,
        defaults={"name": config["name"], "is_active": True},
    )
    return category


def seed_category_defaults(category_code: str) -> int:
    config = SYSTEM_LOOKUPS[category_code]
    category = ensure_category(category_code)
    created = 0
    for order, (code, label) in enumerate(config["defaults"], start=1):
        _, was_created = LookupOption.objects.get_or_create(
            category=category,
            code=code,
            defaults={"label": label, "order": order, "is_active": True},
        )
        if was_created:
            created += 1
    return created


def ensure_all_system_lookups() -> int:
    """Tüm sabit lookup kategorilerini boşsa doldur."""
    created = 0
    for category_code in SYSTEM_LOOKUPS:
        category = ensure_category(category_code)
        if not category.options.exists():
            created += seed_category_defaults(category_code)
    return created


def seed_all_default_kayit_tanimlari() -> int:
    """Tüm sistem lookup varsayılanlarını oluştur (reset_app_data vb.)."""
    return sum(seed_category_defaults(code) for code in SYSTEM_LOOKUPS)


def seed_default_registration_types() -> int:
    return seed_category_defaults(REGISTRATION_TYPE_CODE)


def seed_default_genders() -> int:
    return seed_category_defaults(GENDER_CODE)


def list_lookup_options(category_code: str, include_inactive: bool = False):
    if category_code not in SYSTEM_LOOKUPS:
        raise ValueError(f"Bilinmeyen lookup kategorisi: {category_code}")

    category = ensure_category(category_code)
    if not category.options.exists():
        seed_category_defaults(category_code)

    qs = LookupOption.objects.filter(category=category).order_by("order", "label")
    if not include_inactive:
        qs = qs.filter(is_active=True)
    return qs


def list_registration_types(include_inactive: bool = False):
    return list_lookup_options(REGISTRATION_TYPE_CODE, include_inactive)


def list_genders(include_inactive: bool = False):
    return list_lookup_options(GENDER_CODE, include_inactive)


def list_entry_types(include_inactive: bool = False):
    return list_lookup_options(ENTRY_TYPE_CODE, include_inactive)


def serialize_option(option: LookupOption) -> dict:
    return {
        "id": option.id,
        "code": option.code,
        "label": option.label,
        "order": option.order,
        "is_active": option.is_active,
    }


def create_lookup_option(category_code: str, data: dict) -> LookupOption:
    if category_code != REGISTRATION_TYPE_CODE:
        raise ValueError("Bu lookup kategorisi yönetilemez")

    config = SYSTEM_LOOKUPS[category_code]
    category = ensure_category(category_code)
    label = (data.get("label") or "").strip()
    if not label:
        raise ValueError(config["empty_label_error"])

    code = (data.get("code") or "").strip()
    if not code:
        if config["auto_code"]:
            code = generate_kod(label).lower()
        else:
            raise ValueError("Kod zorunludur")

    if LookupOption.objects.filter(category=category, code=code).exists():
        raise ValueError(f'"{code}" kodu zaten kullanılıyor')

    max_order = category.options.order_by("-order").values_list("order", flat=True).first() or 0
    return LookupOption.objects.create(
        category=category,
        code=code,
        label=label,
        order=data.get("order") or max_order + 1,
        is_active=data.get("is_active", True),
    )


def update_lookup_option(category_code: str, option_id: int, data: dict) -> LookupOption:
    if category_code != REGISTRATION_TYPE_CODE:
        raise ValueError("Bu lookup kategorisi yönetilemez")

    config = SYSTEM_LOOKUPS[category_code]
    category = ensure_category(category_code)
    option = LookupOption.objects.get(id=option_id, category=category)

    label = (data.get("label") or option.label).strip()
    if not label:
        raise ValueError(config["empty_label_error"])
    option.label = label

    if "order" in data and data["order"] is not None:
        option.order = int(data["order"])

    if "is_active" in data:
        option.is_active = bool(data["is_active"])

    option.save()
    return option


def delete_lookup_option(category_code: str, option_id: int) -> None:
    if category_code != REGISTRATION_TYPE_CODE:
        raise ValueError("Bu lookup kategorisi yönetilemez")

    category = ensure_category(category_code)
    LookupOption.objects.filter(id=option_id, category=category).delete()


def create_registration_type(data: dict) -> LookupOption:
    return create_lookup_option(REGISTRATION_TYPE_CODE, data)


def update_registration_type(option_id: int, data: dict) -> LookupOption:
    return update_lookup_option(REGISTRATION_TYPE_CODE, option_id, data)


def delete_registration_type(option_id: int) -> None:
    delete_lookup_option(REGISTRATION_TYPE_CODE, option_id)
