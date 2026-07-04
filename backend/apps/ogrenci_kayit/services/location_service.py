"""
İl / ilçe seed — tüm Türkiye illeri, yalnızca Erzurum ilçeleri.
"""
import json
from pathlib import Path

from apps.ogrenci_kayit.domain.models import LocationCity, LocationDistrict

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "turkiye_iller.json"
DEFAULT_CITY_CODE = "25"
DEFAULT_DISTRICT_NAME = "Yakutiye"


def _load_data() -> dict:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def ensure_locations() -> int:
    """Boşsa illeri ve Erzurum ilçelerini yükle."""
    payload = _load_data()
    created = 0

    LocationCity.objects.filter(is_default=True).update(is_default=False)

    for city in payload.get("cities", []):
        _, was_created = LocationCity.objects.update_or_create(
            code=city["code"],
            defaults={
                "name": city["name"],
                "is_default": city.get("is_default", city["code"] == DEFAULT_CITY_CODE),
                "is_active": True,
            },
        )
        if was_created:
            created += 1

    erzurum = LocationCity.objects.filter(code=DEFAULT_CITY_CODE).first()
    if erzurum:
        for district_name in payload.get("erzurum_districts", []):
            _, was_created = LocationDistrict.objects.get_or_create(
                city=erzurum,
                name=district_name,
                defaults={"is_active": True},
            )
            if was_created:
                created += 1

    return created


def get_default_city():
    city = LocationCity.objects.filter(code=DEFAULT_CITY_CODE, is_active=True).first()
    if city:
        if not city.is_default:
            LocationCity.objects.filter(is_default=True).update(is_default=False)
            city.is_default = True
            city.save(update_fields=["is_default"])
        return city
    return LocationCity.objects.filter(is_default=True, is_active=True).first()


def get_default_district(city=None):
    city = city or get_default_city()
    if not city:
        return None
    return LocationDistrict.objects.filter(
        city=city,
        name=DEFAULT_DISTRICT_NAME,
        is_active=True,
    ).first()
