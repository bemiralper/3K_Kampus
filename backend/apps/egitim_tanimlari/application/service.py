"""
Egitim Tanimlari Application - Service Layer
Enterprise DDD Pattern
"""
from typing import List, Optional

from apps.egitim_tanimlari.models import SinifSeviyesi, Alan, Ders, Brans
from apps.egitim_tanimlari.infrastructure.repository import (
    SinifSeviyesiRepository, AlanRepository, DersRepository, BransRepository
)


class SinifSeviyesiService:
    def __init__(self):
        self.repository = SinifSeviyesiRepository()

    def get_all_sinif_seviyeleri(self, sube_id: int) -> List[SinifSeviyesi]:
        return list(self.repository.get_all(sube_id))

    def get_sinif_seviyesi(self, seviye_id: int, sube_id: int | None = None) -> Optional[SinifSeviyesi]:
        return self.repository.get_by_id(seviye_id, sube_id)

    def get_sinif_seviyesi_by_id(self, seviye_id: int, sube_id: int | None = None) -> Optional[SinifSeviyesi]:
        return self.get_sinif_seviyesi(seviye_id, sube_id)

    def create_sinif_seviyesi(self, data: dict) -> SinifSeviyesi:
        self._validate_sinif_seviyesi_data(data)
        return self.repository.create(data)

    def update_sinif_seviyesi(self, seviye_id: int, data: dict, sube_id: int | None = None) -> Optional[SinifSeviyesi]:
        self._validate_sinif_seviyesi_data(data, is_update=True)
        return self.repository.update(seviye_id, data, sube_id)

    def delete_sinif_seviyesi(self, seviye_id: int, sube_id: int | None = None) -> bool:
        return self.repository.delete(seviye_id, sube_id)

    def _validate_sinif_seviyesi_data(self, data: dict, is_update: bool = False) -> None:
        if not is_update:
            if not data.get('ad'):
                raise ValueError("Sınıf seviyesi adı zorunludur")
            if not data.get('kod'):
                raise ValueError("Sınıf seviyesi kodu zorunludur")
        if data.get('sira') is None:
            data['sira'] = 0


class AlanService:
    def __init__(self):
        self.repository = AlanRepository()

    def get_all_alanlar(self, sube_id: int) -> List[Alan]:
        return list(self.repository.get_all(sube_id))

    def get_alan(self, alan_id: int, sube_id: int | None = None) -> Optional[Alan]:
        return self.repository.get_by_id(alan_id, sube_id)

    def get_alan_by_id(self, alan_id: int, sube_id: int | None = None) -> Optional[Alan]:
        return self.get_alan(alan_id, sube_id)

    def create_alan(self, data: dict) -> Alan:
        self._validate_alan_data(data)
        return self.repository.create(data)

    def update_alan(self, alan_id: int, data: dict, sube_id: int | None = None) -> Optional[Alan]:
        self._validate_alan_data(data, is_update=True)
        return self.repository.update(alan_id, data, sube_id)

    def delete_alan(self, alan_id: int, sube_id: int | None = None) -> bool:
        return self.repository.delete(alan_id, sube_id)

    def _validate_alan_data(self, data: dict, is_update: bool = False) -> None:
        if not is_update:
            if not data.get('ad'):
                raise ValueError("Alan adı zorunludur")
            if not data.get('kod'):
                raise ValueError("Alan kodu zorunludur")


class DersService:
    def __init__(self):
        self.repository = DersRepository()

    def get_all_dersler(self, sube_id: int) -> List[Ders]:
        return list(self.repository.get_all(sube_id))

    def get_ders(self, ders_id: int, sube_id: int | None = None) -> Optional[Ders]:
        return self.repository.get_by_id(ders_id, sube_id)

    def get_ders_by_id(self, ders_id: int, sube_id: int | None = None) -> Optional[Ders]:
        return self.get_ders(ders_id, sube_id)

    def create_ders(self, data: dict) -> Ders:
        self._validate_ders_data(data)
        return self.repository.create(data)

    def update_ders(self, ders_id: int, data: dict, sube_id: int | None = None) -> Optional[Ders]:
        self._validate_ders_data(data, is_update=True)
        return self.repository.update(ders_id, data, sube_id)

    def delete_ders(self, ders_id: int, sube_id: int | None = None) -> bool:
        return self.repository.delete(ders_id, sube_id)

    def _validate_ders_data(self, data: dict, is_update: bool = False) -> None:
        if not is_update:
            if not data.get('ad'):
                raise ValueError("Ders adı zorunludur")
            if not data.get('kod'):
                raise ValueError("Ders kodu zorunludur")


class BransService:
    def __init__(self):
        self.repository = BransRepository()

    def get_all_branslar(self, sube_id: int) -> List[Brans]:
        return list(self.repository.get_all(sube_id))

    def get_brans(self, brans_id: int, sube_id: int | None = None) -> Optional[Brans]:
        return self.repository.get_by_id(brans_id, sube_id)

    def get_brans_by_id(self, brans_id: int, sube_id: int | None = None) -> Optional[Brans]:
        return self.get_brans(brans_id, sube_id)

    def create_brans(self, data: dict) -> Brans:
        self._validate_brans_data(data)
        return self.repository.create(data)

    def update_brans(self, brans_id: int, data: dict, sube_id: int | None = None) -> Optional[Brans]:
        self._validate_brans_data(data, is_update=True)
        return self.repository.update(brans_id, data, sube_id)

    def delete_brans(self, brans_id: int, sube_id: int | None = None) -> bool:
        return self.repository.delete(brans_id, sube_id)

    def _validate_brans_data(self, data: dict, is_update: bool = False) -> None:
        if not is_update:
            if not data.get('ad'):
                raise ValueError("Branş adı zorunludur")
            if not data.get('kod'):
                raise ValueError("Branş kodu zorunludur")
