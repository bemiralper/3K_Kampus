"""
PostgreSQL Schema Yönetimi

Dynamic schema oluşturma, silme ve yönetim fonksiyonları.
Her eğitim yılı için ayrı schema oluşturulur.
"""

from django.db import connection
from django.db.utils import ProgrammingError
import logging

logger = logging.getLogger(__name__)


def create_schema(schema_name):
    """
    PostgreSQL schema oluşturur.
    
    Args:
        schema_name (str): Oluşturulacak schema adı
        
    Returns:
        bool: Başarılı ise True
        
    Raises:
        ProgrammingError: Schema oluşturulamazsa
    """
    try:
        with connection.cursor() as cursor:
            # Schema var mı kontrol et
            cursor.execute(
                "SELECT schema_name FROM information_schema.schemata WHERE schema_name = %s",
                [schema_name]
            )
            if cursor.fetchone():
                logger.warning(f"Schema zaten mevcut: {schema_name}")
                return True
            
            # Schema oluştur
            cursor.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"')
            logger.info(f"Schema oluşturuldu: {schema_name}")
            return True
            
    except ProgrammingError as e:
        logger.error(f"Schema oluşturma hatası: {schema_name} - {str(e)}")
        raise


def drop_schema(schema_name, cascade=False):
    """
    PostgreSQL schema siler.
    
    Args:
        schema_name (str): Silinecek schema adı
        cascade (bool): Cascade ile silme (tüm objeler silinir)
        
    Returns:
        bool: Başarılı ise True
    """
    try:
        with connection.cursor() as cursor:
            cascade_sql = "CASCADE" if cascade else ""
            cursor.execute(f'DROP SCHEMA IF EXISTS "{schema_name}" {cascade_sql}')
            logger.info(f"Schema silindi: {schema_name}")
            return True
            
    except ProgrammingError as e:
        logger.error(f"Schema silme hatası: {schema_name} - {str(e)}")
        raise


def create_tables_in_schema(schema_name):
    """
    Belirtilen schema içinde eğitim yılı tablolarını oluşturur.
    
    Her tablo şu alanları içermek ZORUNDA:
    - id
    - kurum_id
    - sube_id
    - egitim_yili_id
    
    Args:
        schema_name (str): Tabloların oluşturulacağı schema adı
    """
    
    tables = [
        # Öğrenci tablosu
        f"""
        CREATE TABLE IF NOT EXISTS "{schema_name}".ogrenciler (
            id BIGSERIAL PRIMARY KEY,
            kurum_id BIGINT NOT NULL,
            sube_id BIGINT NOT NULL,
            egitim_yili_id BIGINT NOT NULL,
            tc_kimlik_no VARCHAR(11) UNIQUE,
            ad VARCHAR(100) NOT NULL,
            soyad VARCHAR(100) NOT NULL,
            dogum_tarihi DATE,
            cinsiyet VARCHAR(1),
            telefon VARCHAR(20),
            email VARCHAR(255),
            adres TEXT,
            aktif_mi BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_kurum FOREIGN KEY (kurum_id) REFERENCES public.kurumlar(id),
            CONSTRAINT fk_sube FOREIGN KEY (sube_id) REFERENCES public.subeler(id),
            CONSTRAINT fk_egitim_yili FOREIGN KEY (egitim_yili_id) REFERENCES public.egitim_yillari(id)
        )
        """,
        
        # Sınıf tablosu
        f"""
        CREATE TABLE IF NOT EXISTS "{schema_name}".siniflar (
            id BIGSERIAL PRIMARY KEY,
            kurum_id BIGINT NOT NULL,
            sube_id BIGINT NOT NULL,
            egitim_yili_id BIGINT NOT NULL,
            ad VARCHAR(100) NOT NULL,
            kod VARCHAR(50) NOT NULL,
            kapasite INTEGER DEFAULT 30,
            aktif_mi BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_kurum FOREIGN KEY (kurum_id) REFERENCES public.kurumlar(id),
            CONSTRAINT fk_sube FOREIGN KEY (sube_id) REFERENCES public.subeler(id),
            CONSTRAINT fk_egitim_yili FOREIGN KEY (egitim_yili_id) REFERENCES public.egitim_yillari(id),
            UNIQUE(egitim_yili_id, kod)
        )
        """,
        
        # Öğrenci-Sınıf Atama tablosu
        f"""
        CREATE TABLE IF NOT EXISTS "{schema_name}".ogrenci_sinif_atamalari (
            id BIGSERIAL PRIMARY KEY,
            kurum_id BIGINT NOT NULL,
            sube_id BIGINT NOT NULL,
            egitim_yili_id BIGINT NOT NULL,
            ogrenci_id BIGINT NOT NULL,
            sinif_id BIGINT NOT NULL,
            atama_tarihi DATE NOT NULL,
            aktif_mi BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_kurum FOREIGN KEY (kurum_id) REFERENCES public.kurumlar(id),
            CONSTRAINT fk_sube FOREIGN KEY (sube_id) REFERENCES public.subeler(id),
            CONSTRAINT fk_egitim_yili FOREIGN KEY (egitim_yili_id) REFERENCES public.egitim_yillari(id),
            CONSTRAINT fk_ogrenci FOREIGN KEY (ogrenci_id) REFERENCES "{schema_name}".ogrenciler(id),
            CONSTRAINT fk_sinif FOREIGN KEY (sinif_id) REFERENCES "{schema_name}".siniflar(id)
        )
        """,
        
        # Yoklama tablosu
        f"""
        CREATE TABLE IF NOT EXISTS "{schema_name}".yoklamalar (
            id BIGSERIAL PRIMARY KEY,
            kurum_id BIGINT NOT NULL,
            sube_id BIGINT NOT NULL,
            egitim_yili_id BIGINT NOT NULL,
            ogrenci_id BIGINT NOT NULL,
            sinif_id BIGINT NOT NULL,
            tarih DATE NOT NULL,
            durum VARCHAR(20) NOT NULL,
            aciklama TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_kurum FOREIGN KEY (kurum_id) REFERENCES public.kurumlar(id),
            CONSTRAINT fk_sube FOREIGN KEY (sube_id) REFERENCES public.subeler(id),
            CONSTRAINT fk_egitim_yili FOREIGN KEY (egitim_yili_id) REFERENCES public.egitim_yillari(id),
            CONSTRAINT fk_ogrenci FOREIGN KEY (ogrenci_id) REFERENCES "{schema_name}".ogrenciler(id),
            CONSTRAINT fk_sinif FOREIGN KEY (sinif_id) REFERENCES "{schema_name}".siniflar(id)
        )
        """,
        
        # Notlar tablosu
        f"""
        CREATE TABLE IF NOT EXISTS "{schema_name}".notlar (
            id BIGSERIAL PRIMARY KEY,
            kurum_id BIGINT NOT NULL,
            sube_id BIGINT NOT NULL,
            egitim_yili_id BIGINT NOT NULL,
            ogrenci_id BIGINT NOT NULL,
            sinif_id BIGINT NOT NULL,
            ders_adi VARCHAR(100) NOT NULL,
            sinav_turu VARCHAR(50) NOT NULL,
            puan DECIMAL(5, 2) NOT NULL,
            tarih DATE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_kurum FOREIGN KEY (kurum_id) REFERENCES public.kurumlar(id),
            CONSTRAINT fk_sube FOREIGN KEY (sube_id) REFERENCES public.subeler(id),
            CONSTRAINT fk_egitim_yili FOREIGN KEY (egitim_yili_id) REFERENCES public.egitim_yillari(id),
            CONSTRAINT fk_ogrenci FOREIGN KEY (ogrenci_id) REFERENCES "{schema_name}".ogrenciler(id),
            CONSTRAINT fk_sinif FOREIGN KEY (sinif_id) REFERENCES "{schema_name}".siniflar(id)
        )
        """,
        
        # Ödemeler tablosu
        f"""
        CREATE TABLE IF NOT EXISTS "{schema_name}".odemeler (
            id BIGSERIAL PRIMARY KEY,
            kurum_id BIGINT NOT NULL,
            sube_id BIGINT NOT NULL,
            egitim_yili_id BIGINT NOT NULL,
            ogrenci_id BIGINT NOT NULL,
            tutar DECIMAL(10, 2) NOT NULL,
            odeme_tarihi DATE NOT NULL,
            odeme_turu VARCHAR(50) NOT NULL,
            aciklama TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_kurum FOREIGN KEY (kurum_id) REFERENCES public.kurumlar(id),
            CONSTRAINT fk_sube FOREIGN KEY (sube_id) REFERENCES public.subeler(id),
            CONSTRAINT fk_egitim_yili FOREIGN KEY (egitim_yili_id) REFERENCES public.egitim_yillari(id),
            CONSTRAINT fk_ogrenci FOREIGN KEY (ogrenci_id) REFERENCES "{schema_name}".ogrenciler(id)
        )
        """,
        
        # Denemeler tablosu
        f"""
        CREATE TABLE IF NOT EXISTS "{schema_name}".denemeler (
            id BIGSERIAL PRIMARY KEY,
            kurum_id BIGINT NOT NULL,
            sube_id BIGINT NOT NULL,
            egitim_yili_id BIGINT NOT NULL,
            ogrenci_id BIGINT NOT NULL,
            deneme_adi VARCHAR(200) NOT NULL,
            deneme_tarihi DATE NOT NULL,
            toplam_dogru INTEGER,
            toplam_yanlis INTEGER,
            toplam_bos INTEGER,
            net DECIMAL(5, 2),
            puan DECIMAL(6, 3),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_kurum FOREIGN KEY (kurum_id) REFERENCES public.kurumlar(id),
            CONSTRAINT fk_sube FOREIGN KEY (sube_id) REFERENCES public.subeler(id),
            CONSTRAINT fk_egitim_yili FOREIGN KEY (egitim_yili_id) REFERENCES public.egitim_yillari(id),
            CONSTRAINT fk_ogrenci FOREIGN KEY (ogrenci_id) REFERENCES "{schema_name}".ogrenciler(id)
        )
        """,
        
        # Koçluk Kayıtları tablosu
        f"""
        CREATE TABLE IF NOT EXISTS "{schema_name}".kocluk_kayitlari (
            id BIGSERIAL PRIMARY KEY,
            kurum_id BIGINT NOT NULL,
            sube_id BIGINT NOT NULL,
            egitim_yili_id BIGINT NOT NULL,
            ogrenci_id BIGINT NOT NULL,
            koc_id BIGINT,
            gorusme_tarihi TIMESTAMP WITH TIME ZONE NOT NULL,
            gorusme_notu TEXT,
            aksiyon_plani TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_kurum FOREIGN KEY (kurum_id) REFERENCES public.kurumlar(id),
            CONSTRAINT fk_sube FOREIGN KEY (sube_id) REFERENCES public.subeler(id),
            CONSTRAINT fk_egitim_yili FOREIGN KEY (egitim_yili_id) REFERENCES public.egitim_yillari(id),
            CONSTRAINT fk_ogrenci FOREIGN KEY (ogrenci_id) REFERENCES "{schema_name}".ogrenciler(id)
        )
        """,
    ]
    
    try:
        with connection.cursor() as cursor:
            for table_sql in tables:
                cursor.execute(table_sql)
                
            # İndeksler oluştur
            indexes = [
                f'CREATE INDEX IF NOT EXISTS idx_ogrenciler_kurum ON "{schema_name}".ogrenciler(kurum_id)',
                f'CREATE INDEX IF NOT EXISTS idx_ogrenciler_sube ON "{schema_name}".ogrenciler(sube_id)',
                f'CREATE INDEX IF NOT EXISTS idx_ogrenciler_egitim_yili ON "{schema_name}".ogrenciler(egitim_yili_id)',
                f'CREATE INDEX IF NOT EXISTS idx_siniflar_egitim_yili ON "{schema_name}".siniflar(egitim_yili_id)',
                f'CREATE INDEX IF NOT EXISTS idx_yoklamalar_tarih ON "{schema_name}".yoklamalar(tarih)',
                f'CREATE INDEX IF NOT EXISTS idx_notlar_ogrenci ON "{schema_name}".notlar(ogrenci_id)',
                f'CREATE INDEX IF NOT EXISTS idx_odemeler_ogrenci ON "{schema_name}".odemeler(ogrenci_id)',
                f'CREATE INDEX IF NOT EXISTS idx_denemeler_ogrenci ON "{schema_name}".denemeler(ogrenci_id)',
            ]
            
            for index_sql in indexes:
                cursor.execute(index_sql)
                
        logger.info(f"Tablolar oluşturuldu: {schema_name}")
        return True
        
    except ProgrammingError as e:
        logger.error(f"Tablo oluşturma hatası: {schema_name} - {str(e)}")
        raise


def schema_exists(schema_name):
    """
    Schema'nın var olup olmadığını kontrol eder.
    
    Args:
        schema_name (str): Kontrol edilecek schema adı
        
    Returns:
        bool: Schema varsa True
    """
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name = %s",
            [schema_name]
        )
        return cursor.fetchone() is not None


def get_all_schemas():
    """
    Sistemdeki tüm custom schemaları listeler.
    
    Returns:
        list: Schema adları listesi
    """
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT schema_name 
            FROM information_schema.schemata 
            WHERE schema_name LIKE 'kurum_%'
            ORDER BY schema_name
            """
        )
        return [row[0] for row in cursor.fetchall()]
