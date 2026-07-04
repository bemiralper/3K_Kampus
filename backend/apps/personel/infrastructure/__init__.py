"""
Personel Infrastructure Layer
"""
from apps.personel.infrastructure.repositories import (
    PersonelRepository,
    PersonelGorevlendirmeRepository
)

__all__ = [
    'PersonelRepository',
    'PersonelGorevlendirmeRepository'
]
