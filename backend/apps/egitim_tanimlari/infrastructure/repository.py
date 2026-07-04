"""
Egitim Tanimlari Infrastructure - Repository Layer
Enterprise DDD Pattern
"""
from typing import Optional

from django.db.models import QuerySet

from apps.egitim_tanimlari.models import SinifSeviyesi, Alan, Ders, Brans


def _sube_filter(qs: QuerySet, sube_id: int) -> QuerySet:
    return qs.filter(sube_id=sube_id)


class SinifSeviyesiRepository:
    """Repository for SinifSeviyesi entity"""

    @staticmethod
    def get_all(sube_id: int) -> QuerySet:
        return _sube_filter(
            SinifSeviyesi.objects.prefetch_related('alanlar'),
            sube_id,
        )

    @staticmethod
    def get_by_id(seviye_id: int, sube_id: int | None = None) -> Optional[SinifSeviyesi]:
        try:
            qs = SinifSeviyesi.objects.prefetch_related('alanlar').filter(id=seviye_id)
            if sube_id is not None:
                qs = qs.filter(sube_id=sube_id)
            return qs.get()
        except SinifSeviyesi.DoesNotExist:
            return None

    @staticmethod
    def create(data: dict) -> SinifSeviyesi:
        alanlar = data.pop('alanlar', [])
        seviye = SinifSeviyesi.objects.create(**data)
        if alanlar:
            seviye.alanlar.set(alanlar)
        return seviye

    @staticmethod
    def update(seviye_id: int, data: dict, sube_id: int | None = None) -> Optional[SinifSeviyesi]:
        seviye = SinifSeviyesiRepository.get_by_id(seviye_id, sube_id)
        if seviye:
            alanlar = data.pop('alanlar', None)
            for key, value in data.items():
                setattr(seviye, key, value)
            seviye.save()
            if alanlar is not None:
                seviye.alanlar.set(alanlar)
        return seviye

    @staticmethod
    def delete(seviye_id: int, sube_id: int | None = None) -> bool:
        seviye = SinifSeviyesiRepository.get_by_id(seviye_id, sube_id)
        if seviye:
            seviye.delete()
            return True
        return False


class AlanRepository:
    @staticmethod
    def get_all(sube_id: int) -> QuerySet:
        return _sube_filter(Alan.objects.all(), sube_id)

    @staticmethod
    def get_by_id(alan_id: int, sube_id: int | None = None) -> Optional[Alan]:
        try:
            qs = Alan.objects.filter(id=alan_id)
            if sube_id is not None:
                qs = qs.filter(sube_id=sube_id)
            return qs.get()
        except Alan.DoesNotExist:
            return None

    @staticmethod
    def create(data: dict) -> Alan:
        return Alan.objects.create(**data)

    @staticmethod
    def update(alan_id: int, data: dict, sube_id: int | None = None) -> Optional[Alan]:
        alan = AlanRepository.get_by_id(alan_id, sube_id)
        if alan:
            for key, value in data.items():
                setattr(alan, key, value)
            alan.save()
        return alan

    @staticmethod
    def delete(alan_id: int, sube_id: int | None = None) -> bool:
        alan = AlanRepository.get_by_id(alan_id, sube_id)
        if alan:
            alan.delete()
            return True
        return False


class DersRepository:
    @staticmethod
    def get_all(sube_id: int) -> QuerySet:
        return _sube_filter(
            Ders.objects.prefetch_related('sinif_seviyeleri', 'alanlar'),
            sube_id,
        )

    @staticmethod
    def get_by_id(ders_id: int, sube_id: int | None = None) -> Optional[Ders]:
        try:
            qs = Ders.objects.prefetch_related('sinif_seviyeleri', 'alanlar').filter(id=ders_id)
            if sube_id is not None:
                qs = qs.filter(sube_id=sube_id)
            return qs.get()
        except Ders.DoesNotExist:
            return None

    @staticmethod
    def create(data: dict) -> Ders:
        sinif_seviyeleri = data.pop('sinif_seviyeleri', [])
        alanlar = data.pop('alanlar', [])
        ders = Ders.objects.create(**data)
        if sinif_seviyeleri:
            ders.sinif_seviyeleri.set(sinif_seviyeleri)
        if alanlar:
            ders.alanlar.set(alanlar)
        return ders

    @staticmethod
    def update(ders_id: int, data: dict, sube_id: int | None = None) -> Optional[Ders]:
        ders = DersRepository.get_by_id(ders_id, sube_id)
        if ders:
            sinif_seviyeleri = data.pop('sinif_seviyeleri', None)
            alanlar = data.pop('alanlar', None)
            for key, value in data.items():
                setattr(ders, key, value)
            ders.save()
            if sinif_seviyeleri is not None:
                ders.sinif_seviyeleri.set(sinif_seviyeleri)
            if alanlar is not None:
                ders.alanlar.set(alanlar)
        return ders

    @staticmethod
    def delete(ders_id: int, sube_id: int | None = None) -> bool:
        ders = DersRepository.get_by_id(ders_id, sube_id)
        if ders:
            ders.delete()
            return True
        return False


class BransRepository:
    @staticmethod
    def get_all(sube_id: int) -> QuerySet:
        return _sube_filter(Brans.objects.all(), sube_id)

    @staticmethod
    def get_by_id(brans_id: int, sube_id: int | None = None) -> Optional[Brans]:
        try:
            qs = Brans.objects.filter(id=brans_id)
            if sube_id is not None:
                qs = qs.filter(sube_id=sube_id)
            return qs.get()
        except Brans.DoesNotExist:
            return None

    @staticmethod
    def create(data: dict) -> Brans:
        return Brans.objects.create(**data)

    @staticmethod
    def update(brans_id: int, data: dict, sube_id: int | None = None) -> Optional[Brans]:
        brans = BransRepository.get_by_id(brans_id, sube_id)
        if brans:
            for key, value in data.items():
                setattr(brans, key, value)
            brans.save()
        return brans

    @staticmethod
    def delete(brans_id: int, sube_id: int | None = None) -> bool:
        brans = BransRepository.get_by_id(brans_id, sube_id)
        if brans:
            brans.delete()
            return True
        return False
