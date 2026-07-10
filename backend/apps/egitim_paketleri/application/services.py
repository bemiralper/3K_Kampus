"""
Egitim Paketleri Service Layer
"""
from apps.egitim_paketleri.infrastructure.repositories import (
    GrupDersiRepository, OzelDersRepository, DenemeRepository, EkHizmetRepository,
    PremiumPaketRepository, YayinPaketiRepository,
)
from apps.egitim_tanimlari.models import SinifSeviyesi, Alan, Ders
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube


class EkHizmetService:
    """Service for EkHizmet business logic"""
    
    def __init__(self):
        self.repository = EkHizmetRepository()
    
    def get_all(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_all(kurum_id, sube_id, egitim_yili_id)
    
    def get_active(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_active(kurum_id, sube_id, egitim_yili_id)
    
    def get_by_id(self, id):
        return self.repository.get_by_id(id)
    
    def get_by_hizmet_turu(self, hizmet_turu, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_by_hizmet_turu(hizmet_turu, kurum_id, sube_id, egitim_yili_id)
    
    def create(self, data):
        errors = self._validate(data)
        if errors:
            return None, errors
        data = self._process_relations(data)
        ek_hizmet = self.repository.create(data)
        return ek_hizmet, None
    
    def update(self, id, data):
        ek_hizmet = self.repository.get_by_id(id)
        if not ek_hizmet:
            return None, {'error': 'Ek hizmet bulunamadı'}
        errors = self._validate(data, ek_hizmet)
        if errors:
            return None, errors
        data = self._process_relations(data)
        ek_hizmet = self.repository.update(ek_hizmet, data)
        return ek_hizmet, None
    
    def delete(self, id):
        ek_hizmet = self.repository.get_by_id(id)
        if not ek_hizmet:
            return False, {'error': 'Ek hizmet bulunamadı'}
        # Bağımlılık kontrolü — öğrenci kaydı varsa silme
        from apps.ogrenci.domain.models import OgrenciEkHizmet
        if OgrenciEkHizmet.objects.filter(ek_hizmet=ek_hizmet, aktif_mi=True).exists():
            return False, {'error': 'Bu hizmete kayıtlı aktif öğrenciler var, silinemez'}
        self.repository.delete(ek_hizmet)
        return True, None
    
    def _validate(self, data, instance=None):
        errors = {}
        if not data.get('ad'):
            errors['ad'] = 'Hizmet adı zorunludur'
        if not data.get('kod'):
            errors['kod'] = 'Kod zorunludur'
        if not data.get('hizmet_turu'):
            errors['hizmet_turu'] = 'Hizmet türü zorunludur'
        elif data.get('hizmet_turu') == 'deneme':
            errors['hizmet_turu'] = 'Deneme artık ek hizmet olarak tanımlanamaz; Denemeler sekmesini kullanın'
        elif data.get('hizmet_turu') not in ('kutuphane', 'kocluk'):
            errors['hizmet_turu'] = 'Geçerli hizmet türü: kütüphane veya koçluk'
        if not instance:
            if not data.get('egitim_yili_id'):
                errors['egitim_yili'] = 'Eğitim yılı zorunludur'
            if not data.get('kurum_id'):
                errors['kurum'] = 'Kurum zorunludur'
            if not data.get('sube_id'):
                errors['sube'] = 'Şube zorunludur'
        return errors if errors else None
    
    def _process_relations(self, data):
        if 'kurum_id' in data:
            try:
                data['kurum'] = Kurum.objects.get(id=data.pop('kurum_id'))
            except Kurum.DoesNotExist:
                pass
        if 'sube_id' in data:
            try:
                data['sube'] = Sube.objects.get(id=data.pop('sube_id'))
            except Sube.DoesNotExist:
                pass
        if 'egitim_yili_id' in data:
            try:
                data['egitim_yili'] = EgitimYili.objects.get(id=data.pop('egitim_yili_id'))
            except EgitimYili.DoesNotExist:
                pass
        if 'sinif_seviyeleri_ids' in data:
            data['sinif_seviyeleri'] = list(SinifSeviyesi.objects.filter(id__in=data.pop('sinif_seviyeleri_ids')))
        
        # Deneme paketi FK işleme
        if 'deneme_paketi_id' in data:
            deneme_paketi_id = data.pop('deneme_paketi_id')
            if deneme_paketi_id:
                from apps.egitim_paketleri.models import Deneme
                try:
                    data['deneme_paketi'] = Deneme.objects.get(id=deneme_paketi_id)
                except Deneme.DoesNotExist:
                    data['deneme_paketi'] = None
            else:
                data['deneme_paketi'] = None
        
        return data


class GrupDersiService:
    """Service for GrupDersi business logic"""
    
    def __init__(self):
        self.repository = GrupDersiRepository()
    
    def get_all(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_all(kurum_id, sube_id, egitim_yili_id)
    
    def get_active(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_active(kurum_id, sube_id, egitim_yili_id)
    
    def get_by_id(self, id):
        return self.repository.get_by_id(id)
    
    def create(self, data):
        # Validate
        errors = self._validate(data)
        if errors:
            return None, errors
        
        # Process relations
        data = self._process_relations(data)
        
        grup_dersi = self.repository.create(data)
        return grup_dersi, None
    
    def update(self, id, data):
        grup_dersi = self.repository.get_by_id(id)
        if not grup_dersi:
            return None, {'error': 'Grup dersi bulunamadı'}
        
        # Validate
        errors = self._validate(data, grup_dersi)
        if errors:
            return None, errors
        
        # Process relations
        data = self._process_relations(data)
        
        grup_dersi = self.repository.update(grup_dersi, data)
        return grup_dersi, None
    
    def delete(self, id):
        grup_dersi = self.repository.get_by_id(id)
        if not grup_dersi:
            return False, {'error': 'Grup dersi bulunamadı'}
        
        self.repository.delete(grup_dersi)
        return True, None
    
    def _validate(self, data, instance=None):
        errors = {}
        
        if not data.get('ad'):
            errors['ad'] = 'Paket adı zorunludur'
        
        if not data.get('kod'):
            errors['kod'] = 'Kod zorunludur'

        deneme_ids = data.get('dahil_denemeler_ids')
        if deneme_ids is not None and len(deneme_ids) > 1:
            errors['dahil_denemeler_ids'] = 'En fazla bir deneme paketi dahil edilebilir'

        # egitim_yili_id, kurum_id, sube_id sadece create için zorunlu
        if not instance:
            if not data.get('egitim_yili_id'):
                errors['egitim_yili'] = 'Eğitim yılı zorunludur'
            if not data.get('kurum_id'):
                errors['kurum'] = 'Kurum zorunludur'
            if not data.get('sube_id'):
                errors['sube'] = 'Şube zorunludur'
        
        return errors if errors else None
    
    def _process_relations(self, data):
        # Convert kurum_id to kurum
        if 'kurum_id' in data:
            try:
                data['kurum'] = Kurum.objects.get(id=data.pop('kurum_id'))
            except Kurum.DoesNotExist:
                pass
        
        # Convert sube_id to sube
        if 'sube_id' in data:
            try:
                data['sube'] = Sube.objects.get(id=data.pop('sube_id'))
            except Sube.DoesNotExist:
                pass
        
        # Convert egitim_yili_id to egitim_yili
        if 'egitim_yili_id' in data:
            try:
                data['egitim_yili'] = EgitimYili.objects.get(id=data.pop('egitim_yili_id'))
            except EgitimYili.DoesNotExist:
                pass
        
        # Process sinif_seviyeleri (M2M)
        if 'sinif_seviyeleri_ids' in data:
            data['sinif_seviyeleri'] = list(SinifSeviyesi.objects.filter(id__in=data.pop('sinif_seviyeleri_ids')))
        
        # Convert alan_id to alan
        if 'alan_id' in data:
            alan_id = data.pop('alan_id')
            if alan_id:
                try:
                    data['alan'] = Alan.objects.get(id=alan_id)
                except Alan.DoesNotExist:
                    data['alan'] = None
            else:
                data['alan'] = None
        
        # Process dersler
        if 'dersler_ids' in data:
            data['dersler'] = list(Ders.objects.filter(id__in=data.pop('dersler_ids')))
        
        # Process dahil ek hizmetler (M2M) — deneme türü hariç
        if 'dahil_ek_hizmetler_ids' in data:
            from apps.egitim_paketleri.models import EkHizmet
            ids = data.pop('dahil_ek_hizmetler_ids')
            data['dahil_ek_hizmetler'] = list(
                EkHizmet.objects.filter(id__in=ids).exclude(hizmet_turu='deneme')
            )

        # Process dahil denemeler (M2M) — en fazla 1
        if 'dahil_denemeler_ids' in data:
            from apps.egitim_paketleri.models import Deneme
            ids = data.pop('dahil_denemeler_ids') or []
            if len(ids) > 1:
                ids = ids[:1]
            data['dahil_denemeler'] = list(Deneme.objects.filter(id__in=ids))

        # Process dahil yayın paketleri (M2M)
        if 'dahil_yayin_paketleri_ids' in data:
            from apps.egitim_paketleri.models import YayinPaketi
            data['dahil_yayin_paketleri'] = list(YayinPaketi.objects.filter(id__in=data.pop('dahil_yayin_paketleri_ids')))

        return data


class OzelDersService:
    """Service for OzelDers business logic"""
    
    def __init__(self):
        self.repository = OzelDersRepository()
    
    def get_all(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_all(kurum_id, sube_id, egitim_yili_id)
    
    def get_active(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_active(kurum_id, sube_id, egitim_yili_id)
    
    def get_by_id(self, id):
        return self.repository.get_by_id(id)
    
    def create(self, data):
        errors = self._validate(data)
        if errors:
            return None, errors
        
        data = self._process_relations(data)
        ozel_ders = self.repository.create(data)
        return ozel_ders, None
    
    def update(self, id, data):
        ozel_ders = self.repository.get_by_id(id)
        if not ozel_ders:
            return None, {'error': 'Özel ders bulunamadı'}
        
        errors = self._validate(data, ozel_ders)
        if errors:
            return None, errors
        
        data = self._process_relations(data)
        ozel_ders = self.repository.update(ozel_ders, data)
        return ozel_ders, None
    
    def delete(self, id):
        ozel_ders = self.repository.get_by_id(id)
        if not ozel_ders:
            return False, {'error': 'Özel ders bulunamadı'}
        
        self.repository.delete(ozel_ders)
        return True, None
    
    def _validate(self, data, instance=None):
        errors = {}
        
        if not data.get('ad'):
            errors['ad'] = 'Paket adı zorunludur'
        
        if not data.get('kod'):
            errors['kod'] = 'Kod zorunludur'
        
        # egitim_yili_id, kurum_id, sube_id sadece create için zorunlu
        if not instance:
            if not data.get('egitim_yili_id'):
                errors['egitim_yili'] = 'Eğitim yılı zorunludur'
            if not data.get('kurum_id'):
                errors['kurum'] = 'Kurum zorunludur'
            if not data.get('sube_id'):
                errors['sube'] = 'Şube zorunludur'
        
        return errors if errors else None
    
    def _process_relations(self, data):
        # Convert kurum_id to kurum
        if 'kurum_id' in data:
            try:
                data['kurum'] = Kurum.objects.get(id=data.pop('kurum_id'))
            except Kurum.DoesNotExist:
                pass
        
        # Convert sube_id to sube
        if 'sube_id' in data:
            try:
                data['sube'] = Sube.objects.get(id=data.pop('sube_id'))
            except Sube.DoesNotExist:
                pass
        
        # Convert egitim_yili_id to egitim_yili
        if 'egitim_yili_id' in data:
            try:
                data['egitim_yili'] = EgitimYili.objects.get(id=data.pop('egitim_yili_id'))
            except EgitimYili.DoesNotExist:
                pass
        
        # Process sinif_seviyeleri (ManyToMany)
        if 'sinif_seviyeleri_ids' in data:
            data['sinif_seviyeleri'] = list(SinifSeviyesi.objects.filter(id__in=data.pop('sinif_seviyeleri_ids')))
        
        if 'alan_id' in data:
            alan_id = data.pop('alan_id')
            if alan_id:
                try:
                    data['alan'] = Alan.objects.get(id=alan_id)
                except Alan.DoesNotExist:
                    data['alan'] = None
            else:
                data['alan'] = None
        
        if 'dersler_ids' in data:
            data['dersler'] = list(Ders.objects.filter(id__in=data.pop('dersler_ids')))
        
        return data


class DenemeService:
    """Service for Deneme business logic"""
    
    def __init__(self):
        self.repository = DenemeRepository()
    
    def get_all(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_all(kurum_id, sube_id, egitim_yili_id)
    
    def get_active(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_active(kurum_id, sube_id, egitim_yili_id)
    
    def get_by_id(self, id):
        return self.repository.get_by_id(id)
    
    def create(self, data):
        errors = self._validate(data)
        if errors:
            return None, errors
        
        data = self._process_relations(data)
        deneme = self.repository.create(data)
        return deneme, None
    
    def update(self, id, data):
        deneme = self.repository.get_by_id(id)
        if not deneme:
            return None, {'error': 'Deneme bulunamadı'}
        
        errors = self._validate(data, deneme)
        if errors:
            return None, errors
        
        data = self._process_relations(data)
        deneme = self.repository.update(deneme, data)
        return deneme, None
    
    def delete(self, id):
        deneme = self.repository.get_by_id(id)
        if not deneme:
            return False, {'error': 'Deneme bulunamadı'}
        
        self.repository.delete(deneme)
        return True, None
    
    def _validate(self, data, instance=None):
        errors = {}
        
        if not data.get('ad'):
            errors['ad'] = 'Deneme adı zorunludur'
        
        if not data.get('kod'):
            errors['kod'] = 'Kod zorunludur'
        
        if not data.get('deneme_sayisi') or int(data.get('deneme_sayisi', 0)) < 1:
            errors['deneme_sayisi'] = 'Deneme sayısı en az 1 olmalıdır'
        
        # egitim_yili_id, kurum_id, sube_id sadece create için zorunlu
        if not instance:
            if not data.get('egitim_yili_id'):
                errors['egitim_yili'] = 'Eğitim yılı zorunludur'
            if not data.get('kurum_id'):
                errors['kurum'] = 'Kurum zorunludur'
            if not data.get('sube_id'):
                errors['sube'] = 'Şube zorunludur'
        
        return errors if errors else None
    
    def _process_relations(self, data):
        # Convert kurum_id to kurum
        if 'kurum_id' in data:
            try:
                data['kurum'] = Kurum.objects.get(id=data.pop('kurum_id'))
            except Kurum.DoesNotExist:
                pass
        
        # Convert sube_id to sube
        if 'sube_id' in data:
            try:
                data['sube'] = Sube.objects.get(id=data.pop('sube_id'))
            except Sube.DoesNotExist:
                pass
        
        # Convert egitim_yili_id to egitim_yili
        if 'egitim_yili_id' in data:
            try:
                data['egitim_yili'] = EgitimYili.objects.get(id=data.pop('egitim_yili_id'))
            except EgitimYili.DoesNotExist:
                pass
        
        if 'sinif_seviyeleri_ids' in data:
            data['sinif_seviyeleri'] = list(SinifSeviyesi.objects.filter(id__in=data.pop('sinif_seviyeleri_ids')))
        
        return data


class PremiumPaketService:
    """Service for PremiumPaket business logic"""

    def __init__(self):
        self.repository = PremiumPaketRepository()

    def get_all(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_all(kurum_id, sube_id, egitim_yili_id)

    def get_active(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_active(kurum_id, sube_id, egitim_yili_id)

    def get_by_id(self, id):
        return self.repository.get_by_id(id)

    def create(self, data):
        errors = self._validate(data)
        if errors:
            return None, errors
        data = self._process_relations(data)
        premium = self.repository.create(data)
        return premium, None

    def update(self, id, data):
        premium = self.repository.get_by_id(id)
        if not premium:
            return None, {'error': 'Premium paket bulunamadı'}
        errors = self._validate(data, premium)
        if errors:
            return None, errors
        data = self._process_relations(data)
        premium = self.repository.update(premium, data)
        return premium, None

    def delete(self, id):
        premium = self.repository.get_by_id(id)
        if not premium:
            return False, {'error': 'Premium paket bulunamadı'}
        self.repository.delete(premium)
        return True, None

    def _validate(self, data, instance=None):
        errors = {}
        if not data.get('ad'):
            errors['ad'] = 'Paket adı zorunludur'
        if not data.get('kod'):
            errors['kod'] = 'Kod zorunludur'
        deneme_ids = data.get('dahil_denemeler_ids')
        if deneme_ids is not None and len(deneme_ids) > 1:
            errors['dahil_denemeler_ids'] = 'En fazla bir deneme paketi dahil edilebilir'
        if not instance:
            if not data.get('egitim_yili_id'):
                errors['egitim_yili'] = 'Eğitim yılı zorunludur'
            if not data.get('kurum_id'):
                errors['kurum'] = 'Kurum zorunludur'
            if not data.get('sube_id'):
                errors['sube'] = 'Şube zorunludur'
        return errors if errors else None

    def _process_relations(self, data):
        if 'kurum_id' in data:
            try:
                data['kurum'] = Kurum.objects.get(id=data.pop('kurum_id'))
            except Kurum.DoesNotExist:
                pass
        if 'sube_id' in data:
            try:
                data['sube'] = Sube.objects.get(id=data.pop('sube_id'))
            except Sube.DoesNotExist:
                pass
        if 'egitim_yili_id' in data:
            try:
                data['egitim_yili'] = EgitimYili.objects.get(id=data.pop('egitim_yili_id'))
            except EgitimYili.DoesNotExist:
                pass
        if 'sinif_seviyeleri_ids' in data:
            data['sinif_seviyeleri'] = list(SinifSeviyesi.objects.filter(id__in=data.pop('sinif_seviyeleri_ids')))
        if 'dahil_ek_hizmetler_ids' in data:
            from apps.egitim_paketleri.models import EkHizmet
            ids = data.pop('dahil_ek_hizmetler_ids')
            data['dahil_ek_hizmetler'] = list(
                EkHizmet.objects.filter(id__in=ids).exclude(hizmet_turu='deneme')
            )
        if 'dahil_denemeler_ids' in data:
            from apps.egitim_paketleri.models import Deneme
            ids = data.pop('dahil_denemeler_ids') or []
            if len(ids) > 1:
                ids = ids[:1]
            data['dahil_denemeler'] = list(Deneme.objects.filter(id__in=ids))
        if 'dahil_yayin_paketleri_ids' in data:
            from apps.egitim_paketleri.models import YayinPaketi
            data['dahil_yayin_paketleri'] = list(YayinPaketi.objects.filter(id__in=data.pop('dahil_yayin_paketleri_ids')))
        return data


class YayinPaketiService:
    """Service for YayinPaketi business logic"""

    def __init__(self):
        self.repository = YayinPaketiRepository()

    def get_all(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_all(kurum_id, sube_id, egitim_yili_id)

    def get_active(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        return self.repository.get_active(kurum_id, sube_id, egitim_yili_id)

    def get_by_id(self, id):
        return self.repository.get_by_id(id)

    def create(self, data):
        errors = self._validate(data)
        if errors:
            return None, errors
        data = self._process_relations(data)
        yayin = self.repository.create(data)
        return yayin, None

    def update(self, id, data):
        yayin = self.repository.get_by_id(id)
        if not yayin:
            return None, {'error': 'Yayın paketi bulunamadı'}
        errors = self._validate(data, yayin)
        if errors:
            return None, errors
        data = self._process_relations(data)
        yayin = self.repository.update(yayin, data)
        return yayin, None

    def delete(self, id):
        yayin = self.repository.get_by_id(id)
        if not yayin:
            return False, {'error': 'Yayın paketi bulunamadı'}
        # Grup dersi veya premium pakette kullanılıyorsa engelle
        if yayin.dahil_oldugu_grup_dersleri.exists():
            return False, {'error': 'Bu yayın paketi bir grup dersinde kullanılıyor, silinemez'}
        if yayin.dahil_oldugu_premium_paketler.exists():
            return False, {'error': 'Bu yayın paketi bir premium pakette kullanılıyor, silinemez'}
        self.repository.delete(yayin)
        return True, None

    def _validate(self, data, instance=None):
        errors = {}
        if not data.get('ad'):
            errors['ad'] = 'Paket adı zorunludur'
        if not data.get('kod'):
            errors['kod'] = 'Kod zorunludur'
        if not instance:
            if not data.get('egitim_yili_id'):
                errors['egitim_yili'] = 'Eğitim yılı zorunludur'
            if not data.get('kurum_id'):
                errors['kurum'] = 'Kurum zorunludur'
            if not data.get('sube_id'):
                errors['sube'] = 'Şube zorunludur'
        return errors if errors else None

    def _process_relations(self, data):
        if 'kurum_id' in data:
            try:
                data['kurum'] = Kurum.objects.get(id=data.pop('kurum_id'))
            except Kurum.DoesNotExist:
                pass
        if 'sube_id' in data:
            try:
                data['sube'] = Sube.objects.get(id=data.pop('sube_id'))
            except Sube.DoesNotExist:
                pass
        if 'egitim_yili_id' in data:
            try:
                data['egitim_yili'] = EgitimYili.objects.get(id=data.pop('egitim_yili_id'))
            except EgitimYili.DoesNotExist:
                pass
        if 'sinif_seviyeleri_ids' in data:
            data['sinif_seviyeleri'] = list(SinifSeviyesi.objects.filter(id__in=data.pop('sinif_seviyeleri_ids')))
        return data
