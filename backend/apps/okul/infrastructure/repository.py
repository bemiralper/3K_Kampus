"""Okul repository — tüm sorgular şube filtresi ile."""
from typing import Optional

from django.db.models import QuerySet

from apps.okul.models import Okul


def _sube_filter(qs: QuerySet, sube_id: int) -> QuerySet:
    return qs.filter(sube_id=sube_id)


class OkulRepository:
    @staticmethod
    def get_all(sube_id: int) -> QuerySet:
        return _sube_filter(Okul.objects.all(), sube_id)

    @staticmethod
    def get_by_id(okul_id: int, sube_id: int | None = None) -> Optional[Okul]:
        try:
            qs = Okul.objects.filter(id=okul_id)
            if sube_id is not None:
                qs = qs.filter(sube_id=sube_id)
            return qs.get()
        except Okul.DoesNotExist:
            return None

    @staticmethod
    def create(data: dict) -> Okul:
        return Okul.objects.create(**data)

    @staticmethod
    def update(okul_id: int, data: dict, sube_id: int | None = None) -> Optional[Okul]:
        okul = OkulRepository.get_by_id(okul_id, sube_id)
        if not okul:
            return None
        for key, value in data.items():
            setattr(okul, key, value)
        okul.save()
        return okul

    @staticmethod
    def delete(okul_id: int, sube_id: int | None = None) -> bool:
        okul = OkulRepository.get_by_id(okul_id, sube_id)
        if not okul:
            return False
        okul.delete()
        return True

    @staticmethod
    def count_students(okul_id: int, sube_id: int) -> int:
        from apps.ogrenci.domain.models import OgrenciKayit

        return OgrenciKayit.objects.filter(school_id=okul_id, sube_id=sube_id).count()
