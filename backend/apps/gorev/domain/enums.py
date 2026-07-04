from django.db import models


class GorevOncelik(models.TextChoices):
    KRITIK = 'KRITIK', 'Kritik'
    YUKSEK = 'YUKSEK', 'Yüksek'
    NORMAL = 'NORMAL', 'Normal'
    DUSUK = 'DUSUK', 'Düşük'


class GorevDurum(models.TextChoices):
    BEKLIYOR = 'BEKLIYOR', 'Bekliyor'
    BASLADI = 'BASLADI', 'Başladı'
    DEVAM_EDIYOR = 'DEVAM_EDIYOR', 'Devam Ediyor'
    TAMAMLANDI = 'TAMAMLANDI', 'Tamamlandı'
    TAMAMLANMADI = 'TAMAMLANMADI', 'Tamamlanamadı'
    IPTAL = 'IPTAL', 'İptal'


class HedefTipi(models.TextChoices):
    KULLANICI = 'KULLANICI', 'Kullanıcı'
    ROL = 'ROL', 'Rol'
    TUM_PERSONEL = 'TUM_PERSONEL', 'Tüm Personel'
    GRUP = 'GRUP', 'Grup'


class TekrarTipi(models.TextChoices):
    GUNLUK = 'GUNLUK', 'Her Gün'
    HAFTALIK_PAZARTESI = 'HAFTALIK_PAZARTESI', 'Her Pazartesi'
    HAFTALIK_CUMA = 'HAFTALIK_CUMA', 'Her Cuma'
    HAFTALIK = 'HAFTALIK', 'Her Hafta (belirli gün)'
    AYLIK_GUN = 'AYLIK_GUN', 'Her Ayın Belirli Günü'
    AY_SONU = 'AY_SONU', 'Her Ay Sonu'
