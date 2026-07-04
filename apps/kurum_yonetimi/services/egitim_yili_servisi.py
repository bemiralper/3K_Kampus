"""
Yeni Eğitim Yılı Başlatma Servisi

Yeni bir eğitim yılı oluşturur ve gerekli tüm adımları gerçekleştirir:
1. EğitimYılı kaydı oluştur
2. PostgreSQL schema oluştur
3. Gerekli tabloları schema içinde oluştur
4. Master dataları kopyala (sınıf tanımları, dersler vb.)
5. Transactional dataları sıfırla
"""

from django.db import transaction, connection
from django.utils import timezone
from apps.kurum_yonetimi.models import Kurum, Sube, EgitimYili
from apps.kurum_yonetimi.services.schema_manager import (
    create_schema,
    create_tables_in_schema,
    schema_exists
)
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class YeniEgitimYiliServisi:
    """
    Yeni eğitim yılı oluşturma ve başlatma işlemlerini yöneten servis.
    """
    
    @staticmethod
    @transaction.atomic
    def yeni_egitim_yili_baslat(kurum_id, sube_id, yil, baslangic_tarihi, bitis_tarihi, 
                                 onceki_yildan_kopyala=True):
        """
        Yeni eğitim yılı başlatır.
        
        Args:
            kurum_id (int): Kurum ID
            sube_id (int): Şube ID
            yil (str): Eğitim yılı (örn: "2024-2025")
            baslangic_tarihi (date): Başlangıç tarihi
            bitis_tarihi (date): Bitiş tarihi
            onceki_yildan_kopyala (bool): Önceki yıldan master data kopyalansın mı?
            
        Returns:
            EgitimYili: Oluşturulan eğitim yılı objesi
            
        Raises:
            Exception: İşlem başarısız olursa
        """
        
        # 1. Validasyonlar
        try:
            kurum = Kurum.objects.get(id=kurum_id, aktif_mi=True)
        except Kurum.DoesNotExist:
            raise ValueError(f"Kurum bulunamadı: {kurum_id}")
        
        try:
            sube = Sube.objects.get(id=sube_id, kurum=kurum, aktif_mi=True)
        except Sube.DoesNotExist:
            raise ValueError(f"Şube bulunamadı: {sube_id}")
        
        # Aynı yıl var mı kontrol et
        if EgitimYili.objects.filter(kurum=kurum, sube=sube, yil=yil).exists():
            raise ValueError(f"Bu eğitim yılı zaten mevcut: {yil}")
        
        # 2. Schema adını oluştur
        yil_temiz = yil.replace('-', '_').replace('/', '_')
        schema_adi = f"kurum_{kurum_id}_{yil_temiz}"
        
        if schema_exists(schema_adi):
            raise ValueError(f"Bu schema zaten mevcut: {schema_adi}")
        
        logger.info(f"Yeni eğitim yılı başlatılıyor: {schema_adi}")
        
        # 3. EğitimYılı kaydı oluştur
        egitim_yili = EgitimYili.objects.create(
            kurum=kurum,
            sube=sube,
            yil=yil,
            schema_adi=schema_adi,
            baslangic_tarihi=baslangic_tarihi,
            bitis_tarihi=bitis_tarihi,
            aktif_mi=False  # İlk oluşturulduğunda pasif
        )
        
        logger.info(f"EgitimYili kaydı oluşturuldu: {egitim_yili.id}")
        
        try:
            # 4. PostgreSQL schema oluştur
            create_schema(schema_adi)
            logger.info(f"Schema oluşturuldu: {schema_adi}")
            
            # 5. Gerekli tabloları oluştur
            create_tables_in_schema(schema_adi)
            logger.info(f"Tablolar oluşturuldu: {schema_adi}")
            
            # 6. Master dataları kopyala (eğer isteniyorsa)
            if onceki_yildan_kopyala:
                onceki_yil = YeniEgitimYiliServisi._get_onceki_egitim_yili(kurum, sube, yil)
                if onceki_yil:
                    YeniEgitimYiliServisi._kopyala_master_data(
                        onceki_yil.schema_adi,
                        schema_adi,
                        egitim_yili.id
                    )
                    logger.info(f"Master data kopyalandı: {onceki_yil.schema_adi} -> {schema_adi}")
                else:
                    logger.warning("Kopyalanacak önceki eğitim yılı bulunamadı")
            
            # 7. Başarılı mesajı
            logger.info(f"✓ Yeni eğitim yılı başarıyla oluşturuldu: {schema_adi}")
            return egitim_yili
            
        except Exception as e:
            logger.error(f"Eğitim yılı oluşturma hatası: {str(e)}")
            # Transaction rollback olacak
            raise
    
    @staticmethod
    def _get_onceki_egitim_yili(kurum, sube, yeni_yil):
        """
        Önceki eğitim yılını bulur.
        
        Args:
            kurum: Kurum objesi
            sube: Şube objesi
            yeni_yil (str): Yeni eğitim yılı
            
        Returns:
            EgitimYili: Önceki eğitim yılı veya None
        """
        return EgitimYili.objects.filter(
            kurum=kurum,
            sube=sube
        ).exclude(
            yil=yeni_yil
        ).order_by('-yil').first()
    
    @staticmethod
    def _kopyala_master_data(kaynak_schema, hedef_schema, yeni_egitim_yili_id):
        """
        Önceki yıldan master dataları kopyalar.
        
        Master Data:
        - Sınıf tanımları (siniflar)
        - Diğer referans datalar
        
        Transactional Data (KOPYALANMAZ):
        - Öğrenciler
        - Notlar
        - Yoklamalar
        - Ödemeler
        - Denemeler
        - Koçluk kayıtları
        
        Args:
            kaynak_schema (str): Kaynak schema adı
            hedef_schema (str): Hedef schema adı
            yeni_egitim_yili_id (int): Yeni eğitim yılı ID
        """
        
        with connection.cursor() as cursor:
            # Sınıf tanımlarını kopyala (öğrenciler olmadan)
            cursor.execute(f"""
                INSERT INTO "{hedef_schema}".siniflar 
                    (kurum_id, sube_id, egitim_yili_id, ad, kod, kapasite, aktif_mi, created_at, updated_at)
                SELECT 
                    kurum_id, 
                    sube_id, 
                    %s,  -- Yeni eğitim yılı ID
                    ad, 
                    kod, 
                    kapasite, 
                    aktif_mi,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM "{kaynak_schema}".siniflar
                WHERE aktif_mi = TRUE
            """, [yeni_egitim_yili_id])
            
            kopyalanan_sinif_sayisi = cursor.rowcount
            logger.info(f"{kopyalanan_sinif_sayisi} sınıf tanımı kopyalandı")
            
            # NOT: Öğrenciler, notlar, yoklamalar vb. KESİNLİKLE kopyalanmaz
            # Bunlar transactional data'dır ve her yıl sıfırdan başlar
    
    @staticmethod
    def egitim_yilini_aktif_et(egitim_yili_id):
        """
        Belirtilen eğitim yılını aktif hale getirir.
        Aynı kurum/şube için diğer aktif yılları pasif eder.
        
        Args:
            egitim_yili_id (int): Aktif edilecek eğitim yılı ID
            
        Returns:
            EgitimYili: Güncellenen eğitim yılı
        """
        egitim_yili = EgitimYili.objects.get(id=egitim_yili_id)
        
        # Aynı kurum/şube için diğer aktif yılları pasif et
        EgitimYili.objects.filter(
            kurum=egitim_yili.kurum,
            sube=egitim_yili.sube,
            aktif_mi=True
        ).update(aktif_mi=False)
        
        # Bu yılı aktif et
        egitim_yili.aktif_mi = True
        egitim_yili.save()
        
        logger.info(f"Eğitim yılı aktif edildi: {egitim_yili.schema_adi}")
        return egitim_yili


# Kullanım örneği:
"""
from apps.kurum_yonetimi.services.egitim_yili_servisi import YeniEgitimYiliServisi
from datetime import date

# Yeni eğitim yılı başlat
egitim_yili = YeniEgitimYiliServisi.yeni_egitim_yili_baslat(
    kurum_id=1,
    sube_id=1,
    yil="2024-2025",
    baslangic_tarihi=date(2024, 9, 1),
    bitis_tarihi=date(2025, 6, 30),
    onceki_yildan_kopyala=True
)

# Aktif et
YeniEgitimYiliServisi.egitim_yilini_aktif_et(egitim_yili.id)
"""
