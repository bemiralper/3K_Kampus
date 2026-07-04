"""
Ogrenci Repository Layer
DDD Pattern - Infrastructure
"""
import re
from django.db.models import Q, Count, Prefetch
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit


class OgrenciRepository:
    """Repository for Ogrenci entity"""
    
    def get_all(self, kurum_id=None, sube_id=None, aktif_only=True):
        """Tüm öğrencileri getir"""
        queryset = Ogrenci.objects.select_related('kurum', 'sube')
        
        if kurum_id:
            queryset = queryset.filter(kurum_id=kurum_id)
        if sube_id:
            queryset = queryset.filter(sube_id=sube_id)
        if aktif_only:
            queryset = queryset.filter(aktif_mi=True)
        
        return queryset.order_by('soyad', 'ad')
    
    def get_by_id(self, pk):
        """ID'ye göre öğrenci getir"""
        try:
            return Ogrenci.objects.select_related('kurum', 'sube').get(pk=pk)
        except Ogrenci.DoesNotExist:
            return None
    
    def get_by_tc(self, tc_kimlik_no, kurum_id):
        """TC Kimlik No'ya göre öğrenci getir"""
        try:
            return Ogrenci.objects.get(tc_kimlik_no=tc_kimlik_no, kurum_id=kurum_id)
        except Ogrenci.DoesNotExist:
            return None
    
    def search(self, query, kurum_id=None, sube_id=None, limit=50):
        """Öğrenci ara (ad, soyad, TC, telefon, veli — akıllı arama)"""
        from django.db.models import Value, CharField
        from django.db.models import Func, F
        
        class RegexpReplace(Func):
            function = 'REGEXP_REPLACE'
        
        queryset = Ogrenci.objects.filter(aktif_mi=True)
        
        if kurum_id:
            queryset = queryset.filter(kurum_id=kurum_id)
        if sube_id:
            queryset = queryset.filter(sube_id=sube_id)
        
        # Telefon alanını temizle (sadece rakamlar)
        queryset = queryset.annotate(
            telefon_clean=RegexpReplace(
                F('telefon'), Value(r'[^0-9]'), Value(''), Value('g'),
                output_field=CharField()
            )
        )
        
        words = query.strip().split()
        for word in words:
            digits_only = re.sub(r'[^0-9]', '', word)
            word_q = (
                Q(ad__icontains=word) |
                Q(soyad__icontains=word) |
                Q(veliler__ad__icontains=word) |
                Q(veliler__soyad__icontains=word)
            )
            if digits_only:
                word_q = word_q | (
                    Q(tc_kimlik_no__icontains=digits_only) |
                    Q(telefon_clean__icontains=digits_only) |
                    Q(veliler__tc_kimlik_no__icontains=digits_only)
                )
            queryset = queryset.filter(word_q)
        
        return queryset.distinct().order_by('soyad', 'ad')[:limit]
    
    def create(self, data):
        """Yeni öğrenci oluştur"""
        ogrenci = Ogrenci.objects.create(**data)
        return ogrenci
    
    def update(self, pk, data):
        """Öğrenci güncelle"""
        ogrenci = self.get_by_id(pk)
        if ogrenci:
            for key, value in data.items():
                setattr(ogrenci, key, value)
            ogrenci.save()
        return ogrenci
    
    def delete(self, pk):
        """Öğrenci sil (soft delete - pasife al)"""
        ogrenci = self.get_by_id(pk)
        if ogrenci:
            ogrenci.aktif_mi = False
            ogrenci.save()
            return True
        return False
    
    def hard_delete(self, pk):
        """Öğrenci kalıcı sil"""
        ogrenci = self.get_by_id(pk)
        if ogrenci:
            ogrenci.delete()
            return True
        return False
    
    def get_count(self, kurum_id=None, sube_id=None, aktif_only=True):
        """Öğrenci sayısını getir"""
        queryset = Ogrenci.objects.all()
        
        if kurum_id:
            queryset = queryset.filter(kurum_id=kurum_id)
        if sube_id:
            queryset = queryset.filter(sube_id=sube_id)
        if aktif_only:
            queryset = queryset.filter(aktif_mi=True)
        
        return queryset.count()


class OgrenciKayitRepository:
    """Repository for OgrenciKayit entity"""
    
    def get_all(self, kurum_id=None, sube_id=None, egitim_yili_id=None, sinif_id=None, aktif_only=True):
        """Tüm kayıtları getir"""
        queryset = OgrenciKayit.objects.select_related(
            'ogrenci', 'sinif', 'egitim_yili', 'kurum', 'sube',
            'sinif__sinif_seviyesi'
        )
        
        if kurum_id:
            queryset = queryset.filter(kurum_id=kurum_id)
        if sube_id:
            queryset = queryset.filter(sube_id=sube_id)
        if egitim_yili_id:
            queryset = queryset.filter(egitim_yili_id=egitim_yili_id)
        if sinif_id:
            queryset = queryset.filter(sinif_id=sinif_id)
        if aktif_only:
            queryset = queryset.filter(aktif_mi=True)
        
        return queryset.order_by('ogrenci__soyad', 'ogrenci__ad')
    
    def get_by_id(self, pk):
        """ID'ye göre kayıt getir"""
        try:
            return OgrenciKayit.objects.select_related(
                'ogrenci', 'sinif', 'egitim_yili'
            ).get(pk=pk)
        except OgrenciKayit.DoesNotExist:
            return None
    
    def get_by_ogrenci_and_yil(self, ogrenci_id, egitim_yili_id):
        """Öğrenci ve yıla göre kayıt getir"""
        try:
            return OgrenciKayit.objects.select_related(
                'ogrenci', 'sinif', 'egitim_yili'
            ).get(ogrenci_id=ogrenci_id, egitim_yili_id=egitim_yili_id)
        except OgrenciKayit.DoesNotExist:
            return None
    
    def create(self, data):
        """Yeni kayıt oluştur"""
        kayit = OgrenciKayit.objects.create(**data)
        return kayit
    
    def update(self, pk, data):
        """Kayıt güncelle"""
        kayit = self.get_by_id(pk)
        if kayit:
            for key, value in data.items():
                setattr(kayit, key, value)
            kayit.save()
        return kayit
    
    def delete(self, pk):
        """Kayıt sil"""
        kayit = self.get_by_id(pk)
        if kayit:
            kayit.delete()
            return True
        return False
    
    def get_students_by_sinif(self, sinif_id, egitim_yili_id, aktif_only=True):
        """Sınıfa göre öğrencileri getir"""
        queryset = OgrenciKayit.objects.select_related('ogrenci').filter(
            sinif_id=sinif_id,
            egitim_yili_id=egitim_yili_id
        )
        if aktif_only:
            queryset = queryset.filter(aktif_mi=True, ogrenci__aktif_mi=True)
        
        return queryset.order_by('ogrenci__soyad', 'ogrenci__ad')
    
    def get_count_by_sinif(self, sinif_id, egitim_yili_id):
        """Sınıftaki öğrenci sayısı"""
        return OgrenciKayit.objects.filter(
            sinif_id=sinif_id,
            egitim_yili_id=egitim_yili_id,
            aktif_mi=True
        ).count()
