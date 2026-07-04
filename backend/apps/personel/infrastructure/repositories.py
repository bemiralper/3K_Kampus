"""
Personel Repository Layer
DDD Pattern - Infrastructure
"""
from django.db.models import Q, Count, Prefetch
from apps.personel.domain.models import Personel, PersonelGorevlendirme


class PersonelRepository:
    """Repository for Personel entity"""
    
    def get_all(self, kurum_id=None, sube_id=None, aktif_only=True):
        """Tüm personelleri getir"""
        queryset = Personel.objects.select_related('kurum', 'sube', 'user')
        
        if kurum_id:
            queryset = queryset.filter(kurum_id=kurum_id)
        if sube_id:
            queryset = queryset.filter(sube_id=sube_id)
        if aktif_only:
            queryset = queryset.filter(aktif_mi=True)
        
        return queryset.order_by('soyad', 'ad')
    
    def get_by_id(self, pk):
        """ID'ye göre personel getir"""
        try:
            return Personel.objects.select_related('kurum', 'sube', 'user').get(pk=pk)
        except Personel.DoesNotExist:
            return None
    
    def get_by_tc(self, tc_kimlik_no, kurum_id):
        """TC Kimlik No'ya göre personel getir"""
        try:
            return Personel.objects.get(tc_kimlik_no=tc_kimlik_no, kurum_id=kurum_id)
        except Personel.DoesNotExist:
            return None
    
    def search(self, query, kurum_id=None, sube_id=None, limit=50, personel_ids=None):
        """Personel ara (ad, soyad, TC, telefon — akıllı arama)"""
        import re
        from django.db.models import Value, CharField, Func, F
        
        class RegexpReplace(Func):
            function = 'REGEXP_REPLACE'
        
        queryset = Personel.objects.filter(aktif_mi=True)
        
        if kurum_id:
            queryset = queryset.filter(kurum_id=kurum_id)
        if sube_id:
            queryset = queryset.filter(sube_id=sube_id)
        if personel_ids is not None:
            queryset = queryset.filter(id__in=personel_ids)
        
        # Telefon alanlarını temizle (sadece rakamlar)
        queryset = queryset.annotate(
            telefon_clean=RegexpReplace(
                F('telefon'), Value(r'[^0-9]'), Value(''), Value('g'),
                output_field=CharField()
            ),
            cep_telefon_clean=RegexpReplace(
                F('cep_telefon'), Value(r'[^0-9]'), Value(''), Value('g'),
                output_field=CharField()
            )
        )
        
        words = query.strip().split()
        for word in words:
            digits_only = re.sub(r'[^0-9]', '', word)
            word_q = (
                Q(ad__icontains=word) |
                Q(soyad__icontains=word) |
                Q(email__icontains=word)
            )
            if digits_only:
                word_q = word_q | (
                    Q(tc_kimlik_no__icontains=digits_only) |
                    Q(telefon_clean__icontains=digits_only) |
                    Q(cep_telefon_clean__icontains=digits_only)
                )
            queryset = queryset.filter(word_q)
        
        return queryset.select_related('kurum', 'sube', 'user').order_by('soyad', 'ad')[:limit]
    
    def create(self, data):
        """Yeni personel oluştur"""
        personel = Personel.objects.create(**data)
        return personel
    
    def update(self, pk, data):
        """Personel güncelle"""
        personel = self.get_by_id(pk)
        if personel:
            for key, value in data.items():
                setattr(personel, key, value)
            personel.save()
        return personel
    
    def delete(self, pk):
        """Personel sil (soft delete - pasife al)"""
        personel = self.get_by_id(pk)
        if personel:
            personel.aktif_mi = False
            personel.save()
            return True
        return False
    
    def hard_delete(self, pk):
        """Personel kalıcı sil"""
        personel = self.get_by_id(pk)
        if personel:
            personel.delete()
            return True
        return False
    
    def get_count(self, kurum_id=None, sube_id=None, aktif_only=True):
        """Personel sayısını getir"""
        queryset = Personel.objects.all()
        
        if kurum_id:
            queryset = queryset.filter(kurum_id=kurum_id)
        if sube_id:
            queryset = queryset.filter(sube_id=sube_id)
        if aktif_only:
            queryset = queryset.filter(aktif_mi=True)
        
        return queryset.count()
    
    def get_without_user_account(self, kurum_id=None, sube_id=None):
        """Sisteme giriş hesabı olmayan personelleri getir"""
        queryset = Personel.objects.filter(aktif_mi=True, user__isnull=True)
        
        if kurum_id:
            queryset = queryset.filter(kurum_id=kurum_id)
        if sube_id:
            queryset = queryset.filter(sube_id=sube_id)
        
        return queryset.order_by('soyad', 'ad')


# NOT: PersonelRolRepository kaldırıldı. Roller artık apps.roller.models.Role üzerinden yönetilmektedir.


class PersonelGorevlendirmeRepository:
    """Repository for PersonelGorevlendirme entity"""
    
    def get_all(self, kurum_id, egitim_yili_id=None, sube_id=None, aktif_only=True):
        """Tüm görevlendirmeleri getir"""
        queryset = PersonelGorevlendirme.objects.select_related(
            'personel', 'egitim_yili', 'rol', 'gorev_sube', 'brans'
        ).filter(kurum_id=kurum_id)
        
        if egitim_yili_id:
            queryset = queryset.filter(egitim_yili_id=egitim_yili_id)
        if sube_id:
            queryset = queryset.filter(gorev_sube_id=sube_id)
        if aktif_only:
            queryset = queryset.filter(aktif_mi=True)
        
        return queryset.order_by('personel__soyad', 'personel__ad')
    
    def get_by_id(self, pk):
        """ID'ye göre görevlendirme getir"""
        try:
            return PersonelGorevlendirme.objects.select_related(
                'personel', 'egitim_yili', 'rol', 'gorev_sube', 'brans'
            ).get(pk=pk)
        except PersonelGorevlendirme.DoesNotExist:
            return None
    
    def get_by_personel_and_year(self, personel_id, egitim_yili_id):
        """Personelin belirli yıldaki görevlendirmelerini getir"""
        return PersonelGorevlendirme.objects.filter(
            personel_id=personel_id,
            egitim_yili_id=egitim_yili_id,
            aktif_mi=True
        ).select_related('rol', 'gorev_sube', 'brans')
    
    def get_by_role(self, rol_id, egitim_yili_id, kurum_id, sube_id=None):
        """Belirli roldeki personelleri getir"""
        queryset = PersonelGorevlendirme.objects.filter(
            rol_id=rol_id,
            egitim_yili_id=egitim_yili_id,
            kurum_id=kurum_id,
            aktif_mi=True
        ).select_related('personel', 'gorev_sube')
        
        if sube_id:
            queryset = queryset.filter(gorev_sube_id=sube_id)
        
        return queryset.order_by('personel__soyad', 'personel__ad')
    
    def create(self, data):
        """Yeni görevlendirme oluştur"""
        return PersonelGorevlendirme.objects.create(**data)
    
    def update(self, pk, data):
        """Görevlendirme güncelle"""
        gorevlendirme = self.get_by_id(pk)
        if gorevlendirme:
            for key, value in data.items():
                setattr(gorevlendirme, key, value)
            gorevlendirme.save()
        return gorevlendirme
    
    def delete(self, pk):
        """Görevlendirme sil (soft delete)"""
        gorevlendirme = self.get_by_id(pk)
        if gorevlendirme:
            gorevlendirme.aktif_mi = False
            gorevlendirme.save()
            return True
        return False
