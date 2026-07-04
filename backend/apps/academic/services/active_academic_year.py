"""
Aktif Eğitim Yılı Servisi

Bu servis aktif eğitim yılını yönetir.
Tüm akademik işlemler için tek bir aktif yıl olmalıdır.

KURALLAR:
- Birden fazla aktif yıl varsa hata
- Aktif yıl yoksa hata
- Frontend yıl seçmez, backend otomatik atar
"""
from apps.egitim_yili.domain.models import EgitimYili


class ActiveAcademicYearError(Exception):
    """Aktif akademik yıl ile ilgili hatalar"""
    pass


class NoActiveAcademicYearError(ActiveAcademicYearError):
    """Aktif akademik yıl bulunamadı"""
    def __init__(self, message="Aktif eğitim yılı bulunamadı. Lütfen bir eğitim yılını aktif olarak işaretleyin."):
        self.message = message
        super().__init__(self.message)


class MultipleActiveAcademicYearsError(ActiveAcademicYearError):
    """Birden fazla aktif akademik yıl var"""
    def __init__(self, count: int):
        self.message = f"Birden fazla aktif eğitim yılı bulundu ({count} adet). Sadece bir eğitim yılı aktif olabilir."
        super().__init__(self.message)


class ActiveAcademicYearService:
    """
    Aktif Eğitim Yılı Servisi
    
    Kullanım:
    >>> service = ActiveAcademicYearService()
    >>> active_year = service.get_active_year()
    >>> # veya
    >>> active_year = service.get_active_year_or_none()
    """
    
    @staticmethod
    def get_active_year() -> EgitimYili:
        """
        Aktif eğitim yılını döndürür.
        
        Raises:
            NoActiveAcademicYearError: Aktif yıl yoksa
            MultipleActiveAcademicYearsError: Birden fazla aktif yıl varsa
        
        Returns:
            EgitimYili: Aktif eğitim yılı
        """
        active_years = EgitimYili.objects.filter(aktif_mi=True)
        count = active_years.count()
        
        if count == 0:
            raise NoActiveAcademicYearError()
        
        if count > 1:
            raise MultipleActiveAcademicYearsError(count)
        
        return active_years.first()
    
    @staticmethod
    def get_active_year_or_none() -> EgitimYili | None:
        """
        Aktif eğitim yılını döndürür, yoksa None.
        Birden fazla varsa yine hata fırlatır.
        
        Returns:
            EgitimYili | None: Aktif eğitim yılı veya None
        """
        active_years = EgitimYili.objects.filter(aktif_mi=True)
        count = active_years.count()
        
        if count == 0:
            return None
        
        if count > 1:
            raise MultipleActiveAcademicYearsError(count)
        
        return active_years.first()
    
    @staticmethod
    def get_active_year_id() -> int:
        """
        Aktif eğitim yılının ID'sini döndürür.
        
        Returns:
            int: Aktif eğitim yılı ID
        """
        return ActiveAcademicYearService.get_active_year().id
    
    @staticmethod
    def get_active_year_display() -> str:
        """
        Aktif eğitim yılının gösterim stringini döndürür.
        Örn: "2025-2026"
        
        Returns:
            str: Aktif eğitim yılı string
        """
        year = ActiveAcademicYearService.get_active_year()
        return str(year)
    
    @staticmethod
    def validate_year_is_active(year_id: int) -> bool:
        """
        Verilen yılın aktif olup olmadığını kontrol eder.
        
        Args:
            year_id: Kontrol edilecek yıl ID
            
        Returns:
            bool: Aktif mi
        """
        try:
            active_year = ActiveAcademicYearService.get_active_year()
            return active_year.id == year_id
        except ActiveAcademicYearError:
            return False


# Kısayol fonksiyonlar
def get_active_academic_year() -> EgitimYili:
    """Aktif eğitim yılını döndürür (kısayol)"""
    return ActiveAcademicYearService.get_active_year()


def get_active_academic_year_id() -> int:
    """Aktif eğitim yılı ID'sini döndürür (kısayol)"""
    return ActiveAcademicYearService.get_active_year_id()
