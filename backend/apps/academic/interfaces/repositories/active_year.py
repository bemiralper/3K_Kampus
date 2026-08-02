"""
Aktif eğitim yılı kısayolu — geç bağlanan sürüm.

`apps.academic.services` paketinin `__init__` dosyası bu paketteki
repository'leri import eder. Repository'ler de servis kısayolunu modül
seviyesinde import ederse (repositories paketi önce yüklendiğinde) döngüsel
import oluşur. Bu sarmalayıcı, servisi ilk çağrıda yükleyerek döngüyü kırar.
"""


def get_active_academic_year():
    from apps.academic.services.active_academic_year import (
        get_active_academic_year as _get_active_academic_year,
    )

    return _get_active_academic_year()
