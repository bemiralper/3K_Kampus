"""
Egitim Paketleri Repository Layer
"""
from apps.egitim_paketleri.models import GrupDersi, OzelDers, Deneme, EkHizmet


class EkHizmetRepository:
    """Repository for EkHizmet entity"""
    
    @staticmethod
    def get_all(kurum_id=None, sube_id=None, egitim_yili_id=None):
        qs = EkHizmet.objects.select_related('egitim_yili', 'kurum', 'sube', 'deneme_paketi').prefetch_related('sinif_seviyeleri')
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs.all()
    
    @staticmethod
    def get_active(kurum_id=None, sube_id=None, egitim_yili_id=None):
        qs = EkHizmet.objects.select_related('egitim_yili', 'kurum', 'sube', 'deneme_paketi').prefetch_related('sinif_seviyeleri').filter(aktif_mi=True)
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs
    
    @staticmethod
    def get_by_id(id):
        try:
            return EkHizmet.objects.select_related('egitim_yili', 'kurum', 'sube', 'deneme_paketi').prefetch_related('sinif_seviyeleri').get(id=id)
        except EkHizmet.DoesNotExist:
            return None
    
    @staticmethod
    def get_by_hizmet_turu(hizmet_turu, kurum_id=None, sube_id=None, egitim_yili_id=None):
        """Belirli bir hizmet türüne ait aktif hizmetleri getir"""
        qs = EkHizmet.objects.filter(hizmet_turu=hizmet_turu, aktif_mi=True)
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs
    
    @staticmethod
    def create(data):
        sinif_seviyeleri = data.pop('sinif_seviyeleri', [])
        ek_hizmet = EkHizmet.objects.create(**data)
        if sinif_seviyeleri:
            ek_hizmet.sinif_seviyeleri.set(sinif_seviyeleri)
        return ek_hizmet
    
    @staticmethod
    def update(ek_hizmet, data):
        sinif_seviyeleri = data.pop('sinif_seviyeleri', None)
        for key, value in data.items():
            setattr(ek_hizmet, key, value)
        ek_hizmet.save()
        if sinif_seviyeleri is not None:
            ek_hizmet.sinif_seviyeleri.set(sinif_seviyeleri)
        return ek_hizmet
    
    @staticmethod
    def delete(ek_hizmet):
        ek_hizmet.delete()


class GrupDersiRepository:
    """Repository for GrupDersi entity"""
    
    @staticmethod
    def get_all(kurum_id=None, sube_id=None, egitim_yili_id=None):
        qs = GrupDersi.objects.select_related('alan', 'egitim_yili', 'kurum', 'sube').prefetch_related(
            'sinif_seviyeleri', 'dersler', 'dahil_ek_hizmetler', 'dahil_denemeler'
        )
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs.all()
    
    @staticmethod
    def get_active(kurum_id=None, sube_id=None, egitim_yili_id=None):
        qs = GrupDersi.objects.select_related('alan', 'egitim_yili', 'kurum', 'sube').prefetch_related(
            'sinif_seviyeleri', 'dersler', 'dahil_ek_hizmetler', 'dahil_denemeler'
        ).filter(aktif_mi=True)
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs
    
    @staticmethod
    def get_by_id(id):
        try:
            return GrupDersi.objects.select_related('alan', 'egitim_yili', 'kurum', 'sube').prefetch_related(
                'sinif_seviyeleri', 'dersler', 'dahil_ek_hizmetler', 'dahil_denemeler'
            ).get(id=id)
        except GrupDersi.DoesNotExist:
            return None
    
    @staticmethod
    def create(data):
        dersler = data.pop('dersler', [])
        sinif_seviyeleri = data.pop('sinif_seviyeleri', [])
        dahil_ek_hizmetler = data.pop('dahil_ek_hizmetler', [])
        dahil_denemeler = data.pop('dahil_denemeler', [])
        grup_dersi = GrupDersi.objects.create(**data)
        if dersler:
            grup_dersi.dersler.set(dersler)
        if sinif_seviyeleri:
            grup_dersi.sinif_seviyeleri.set(sinif_seviyeleri)
        if dahil_ek_hizmetler:
            grup_dersi.dahil_ek_hizmetler.set(dahil_ek_hizmetler)
        if dahil_denemeler:
            grup_dersi.dahil_denemeler.set(dahil_denemeler)
        return grup_dersi
    
    @staticmethod
    def update(grup_dersi, data):
        dersler = data.pop('dersler', None)
        sinif_seviyeleri = data.pop('sinif_seviyeleri', None)
        dahil_ek_hizmetler = data.pop('dahil_ek_hizmetler', None)
        dahil_denemeler = data.pop('dahil_denemeler', None)
        for key, value in data.items():
            setattr(grup_dersi, key, value)
        grup_dersi.save()
        if dersler is not None:
            grup_dersi.dersler.set(dersler)
        if sinif_seviyeleri is not None:
            grup_dersi.sinif_seviyeleri.set(sinif_seviyeleri)
        if dahil_ek_hizmetler is not None:
            grup_dersi.dahil_ek_hizmetler.set(dahil_ek_hizmetler)
        if dahil_denemeler is not None:
            grup_dersi.dahil_denemeler.set(dahil_denemeler)
        return grup_dersi
    
    @staticmethod
    def delete(grup_dersi):
        grup_dersi.delete()


class OzelDersRepository:
    """Repository for OzelDers entity"""
    
    @staticmethod
    def get_all(kurum_id=None, sube_id=None, egitim_yili_id=None):
        qs = OzelDers.objects.select_related('alan', 'egitim_yili', 'kurum', 'sube').prefetch_related('sinif_seviyeleri', 'dersler')
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs.all()
    
    @staticmethod
    def get_active(kurum_id=None, sube_id=None, egitim_yili_id=None):
        qs = OzelDers.objects.select_related('alan', 'egitim_yili', 'kurum', 'sube').prefetch_related('sinif_seviyeleri', 'dersler').filter(aktif_mi=True)
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs
    
    @staticmethod
    def get_by_id(id):
        try:
            return OzelDers.objects.select_related('alan', 'egitim_yili', 'kurum', 'sube').prefetch_related('sinif_seviyeleri', 'dersler').get(id=id)
        except OzelDers.DoesNotExist:
            return None
    
    @staticmethod
    def create(data):
        dersler = data.pop('dersler', [])
        sinif_seviyeleri = data.pop('sinif_seviyeleri', [])
        ozel_ders = OzelDers.objects.create(**data)
        if dersler:
            ozel_ders.dersler.set(dersler)
        if sinif_seviyeleri:
            ozel_ders.sinif_seviyeleri.set(sinif_seviyeleri)
        return ozel_ders
    
    @staticmethod
    def update(ozel_ders, data):
        dersler = data.pop('dersler', None)
        sinif_seviyeleri = data.pop('sinif_seviyeleri', None)
        for key, value in data.items():
            setattr(ozel_ders, key, value)
        ozel_ders.save()
        if dersler is not None:
            ozel_ders.dersler.set(dersler)
        if sinif_seviyeleri is not None:
            ozel_ders.sinif_seviyeleri.set(sinif_seviyeleri)
        return ozel_ders
    
    @staticmethod
    def delete(ozel_ders):
        ozel_ders.delete()


class DenemeRepository:
    """Repository for Deneme entity"""
    
    @staticmethod
    def get_all(kurum_id=None, sube_id=None, egitim_yili_id=None):
        qs = Deneme.objects.select_related('egitim_yili', 'kurum', 'sube').prefetch_related('sinif_seviyeleri')
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs.all()
    
    @staticmethod
    def get_active(kurum_id=None, sube_id=None, egitim_yili_id=None):
        qs = Deneme.objects.select_related('egitim_yili', 'kurum', 'sube').prefetch_related('sinif_seviyeleri').filter(aktif_mi=True)
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs
    
    @staticmethod
    def get_by_id(id):
        try:
            return Deneme.objects.select_related('egitim_yili', 'kurum', 'sube').prefetch_related('sinif_seviyeleri').get(id=id)
        except Deneme.DoesNotExist:
            return None
    
    @staticmethod
    def create(data):
        sinif_seviyeleri = data.pop('sinif_seviyeleri', [])
        deneme = Deneme.objects.create(**data)
        if sinif_seviyeleri:
            deneme.sinif_seviyeleri.set(sinif_seviyeleri)
        return deneme
    
    @staticmethod
    def update(deneme, data):
        sinif_seviyeleri = data.pop('sinif_seviyeleri', None)
        for key, value in data.items():
            setattr(deneme, key, value)
        deneme.save()
        if sinif_seviyeleri is not None:
            deneme.sinif_seviyeleri.set(sinif_seviyeleri)
        return deneme
    
    @staticmethod
    def delete(deneme):
        deneme.delete()


class DavranisPaketiRepository:
    """Repository for DavranisPaketi entity"""
    
    @staticmethod
    def get_all(kurum_id=None, sube_id=None, egitim_yili_id=None):
        from apps.egitim_paketleri.models import DavranisPaketi
        qs = DavranisPaketi.objects.select_related('egitim_yili', 'kurum', 'sube').prefetch_related('sinif_seviyeleri')
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs.all()
    
    @staticmethod
    def get_active(egitim_yili_id=None):
        from apps.egitim_paketleri.models import DavranisPaketi
        qs = DavranisPaketi.objects.select_related('egitim_yili').prefetch_related('sinif_seviyeleri').filter(aktif_mi=True)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        return qs
    
    @staticmethod
    def get_by_id(id):
        from apps.egitim_paketleri.models import DavranisPaketi
        try:
            return DavranisPaketi.objects.select_related('egitim_yili').prefetch_related('sinif_seviyeleri').get(id=id)
        except DavranisPaketi.DoesNotExist:
            return None
