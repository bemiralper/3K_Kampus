"""
Database Router

Dynamic schema routing için kullanılır.
Eğitim yılı bazlı modeller için doğru schema'yı seçer.
"""

from django.conf import settings


class TenantRouter:
    """
    Multi-schema routing.
    
    public schema'da olan modeller:
    - Kurum
    - Sube
    - EgitimYili
    - Django built-in modeller
    
    Dynamic schema'da olan modeller:
    - Ogrenci
    - Sinif
    - OgrenciSinifAtama
    - Yoklama
    - Not
    - Odeme
    - Deneme
    - KoclukKayit
    """
    
    def db_for_read(self, model, **hints):
        """
        Okuma işlemleri için database seç.
        """
        # Şimdilik her şey default database'de
        return 'default'
    
    def db_for_write(self, model, **hints):
        """
        Yazma işlemleri için database seç.
        """
        # Şimdilik her şey default database'de
        return 'default'
    
    def allow_relation(self, obj1, obj2, **hints):
        """
        İki obje arasında relation'a izin ver.
        """
        return True
    
    def allow_migrate(self, db, app_label, model_name=None, **hints):
        """
        Migration'lara izin ver.
        """
        return True
