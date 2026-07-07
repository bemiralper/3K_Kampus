"""
Personel Application Services
DDD Pattern - Application Layer
"""
from django.db import transaction
from django.contrib.auth.models import User
from apps.personel.domain.models import PersonelGorevlendirme
from apps.personel.infrastructure.repositories import (
    PersonelRepository,
    PersonelGorevlendirmeRepository,
)
from apps.personel.interfaces.sube_context import personel_queryset_for_sube
from apps.roller.models import Role, UserRole
from apps.kimlik.application.kisi_service import KisiService
from apps.kimlik.application.enforcement import assert_identity_for_new_record
from apps.kimlik.exceptions import KimlikConflictError
from apps.kimlik.domain.models import Kisi


def resolve_system_role_for_personel(personel, role_code=None):
    """
    Personel kullanıcı hesabına atanacak sistem rolünü belirler.
    Öncelik: istekte gelen role_code → aktif görevlendirme rolü → ogretmen → ilk sistem rolü.
    """
    if role_code:
        role = Role.objects.filter(code__iexact=role_code, silindi_mi=False).first()
        if role:
            return role

    gorev = (
        PersonelGorevlendirme.objects.filter(personel=personel, aktif_mi=True, rol__isnull=False)
        .select_related('rol')
        .order_by('-egitim_yili_id')
        .first()
    )
    if not gorev:
        gorev = (
            PersonelGorevlendirme.objects.filter(personel=personel, rol__isnull=False)
            .select_related('rol')
            .order_by('-egitim_yili_id')
            .first()
        )
    if gorev and gorev.rol:
        return gorev.rol

    for code in ('ogretmen', 'OGRETMEN'):
        role = Role.objects.filter(code__iexact=code, silindi_mi=False).first()
        if role:
            return role

    return Role.objects.filter(is_system_role=True, silindi_mi=False).order_by('level').first()


def assign_user_role_for_personel(user, personel, role_code=None, must_change_password=True):
    """Personel kullanıcısına görevlendirmedeki (veya verilen) rolü atar veya günceller."""
    role = resolve_system_role_for_personel(personel, role_code=role_code)
    if not role:
        return None

    user_role, _created = UserRole.objects.update_or_create(
        user=user,
        defaults={
            'role': role,
            'kurum': personel.kurum,
            'must_change_password': must_change_password,
        },
    )
    return user_role


class PersonelService:
    """Service for Personel business logic"""
    
    def __init__(self):
        self.repository = PersonelRepository()
    
    def get_all(self, kurum_id=None, sube_id=None, aktif_only=True, egitim_yili_id=None):
        """Tüm personelleri getir"""
        if sube_id and kurum_id:
            return personel_queryset_for_sube(
                kurum_id, sube_id, egitim_yili_id, aktif_only=aktif_only,
            )
        return self.repository.get_all(kurum_id, sube_id, aktif_only)
    
    def get_by_id(self, pk):
        """ID'ye göre personel getir"""
        return self.repository.get_by_id(pk)
    
    def get_by_tc(self, tc_kimlik_no, kurum_id):
        """TC Kimlik No'ya göre personel getir"""
        return self.repository.get_by_tc(tc_kimlik_no, kurum_id)
    
    def search(self, query, kurum_id=None, sube_id=None, limit=50, egitim_yili_id=None):
        """Personel ara"""
        if sube_id and kurum_id:
            visible_ids = personel_queryset_for_sube(
                kurum_id, sube_id, egitim_yili_id, aktif_only=True,
            ).values_list('id', flat=True)
            return self.repository.search(
                query, kurum_id, sube_id=None, limit=limit, personel_ids=visible_ids,
            )
        return self.repository.search(query, kurum_id, sube_id, limit)
    
    def get_count(self, kurum_id=None, sube_id=None, aktif_only=True, egitim_yili_id=None):
        """Personel sayısını getir"""
        if sube_id and kurum_id:
            return personel_queryset_for_sube(
                kurum_id, sube_id, egitim_yili_id, aktif_only=aktif_only,
            ).count()
        return self.repository.get_count(kurum_id, sube_id, aktif_only)
    
    @transaction.atomic
    def create(self, data, create_user_account=False, kisi_id=None):
        """
        Yeni personel oluştur
        
        Args:
            data: Personel verileri
            create_user_account: Otomatik kullanıcı hesabı oluşturulsun mu?
            kisi_id: Mevcut merkezi kişi kaydı (opsiyonel)
        """
        if data.get('tc_kimlik_no'):
            existing = self.repository.get_by_tc(data['tc_kimlik_no'], data['kurum_id'])
            if existing:
                raise KimlikConflictError(
                    f'Bu TC Kimlik No ile kayıtlı personel zaten var: {existing.tam_ad}. Mevcut kişiyi kullanın.',
                    code='duplicate_personel_tc',
                    details={'personel_id': existing.id, 'kisi_id': existing.kisi_id},
                )

        assert_identity_for_new_record(
            data['kurum_id'],
            tc_kimlik_no=data.get('tc_kimlik_no'),
            telefon=data.get('cep_telefon') or data.get('telefon'),
            exclude_kisi_id=kisi_id,
            allow_existing_personel=bool(kisi_id),
            context='personel',
        )
        
        personel = self.repository.create(data)

        kisi = None
        if kisi_id:
            kisi = Kisi.objects.filter(id=kisi_id, kurum_id=data['kurum_id']).first()
        if kisi:
            KisiService.sync_from_profile(kisi, data)
            KisiService.link_personel(personel, kisi)
        else:
            KisiService.link_personel(personel)
        
        if create_user_account and data.get('email'):
            user = self._create_user_account(personel)
            personel.user = user
            personel.save()

        return personel

    @transaction.atomic
    def reuse_existing_for_sube(self, personel_id, kurum_id, sube_id, gorevlendirme_data=None):
        """
        Mevcut personeli farklı şubeye görevlendir — yeni Personel kaydı oluşturmaz.
        """
        personel = self.repository.get_by_id(personel_id)
        if not personel or personel.kurum_id != kurum_id:
            raise ValueError('Personel bulunamadı')

        result = {'personel': personel, 'gorevlendirme': None, 'created_gorevlendirme': False}

        if gorevlendirme_data:
            gorev_repo = PersonelGorevlendirmeRepository()
            existing = PersonelGorevlendirme.objects.filter(
                personel=personel,
                egitim_yili_id=gorevlendirme_data['egitim_yili_id'],
                gorev_sube_id=gorevlendirme_data['gorev_sube_id'],
            ).first()
            if existing:
                result['gorevlendirme'] = existing
            else:
                gorevlendirme_data['personel_id'] = personel.id
                gorevlendirme_data['kurum_id'] = kurum_id
                result['gorevlendirme'] = gorev_repo.create(gorevlendirme_data)
                result['created_gorevlendirme'] = True

        return result
    
    def _create_user_account(self, personel):
        """Personel için kullanıcı hesabı oluştur"""
        # Email adresini username olarak kullan
        username = personel.email
        
        # Eğer zaten varsa, benzersiz bir username oluştur
        counter = 1
        original_username = username
        while User.objects.filter(username=username).exists():
            username = f"{original_username.split('@')[0]}{counter}@{original_username.split('@')[1]}"
            counter += 1
        
        user = User.objects.create_user(
            username=username,
            email=personel.email,
            first_name=personel.ad,
            last_name=personel.soyad,
            password=personel.tc_kimlik_no or User.objects.make_random_password()  # TC veya rastgele şifre
        )
        
        return user
    
    @transaction.atomic
    def update(self, pk, data):
        """Personel güncelle"""
        personel = self.repository.get_by_id(pk)
        if not personel:
            raise ValueError("Personel bulunamadı")
        
        # TC Kimlik No kontrolü (başka personelde var mı?)
        if data.get('tc_kimlik_no'):
            existing = self.repository.get_by_tc(data['tc_kimlik_no'], personel.kurum_id)
            if existing and existing.id != pk:
                raise ValueError(f"Bu TC Kimlik No ile kayıtlı başka personel var: {existing.tam_ad}")
        
        return self.repository.update(pk, data)
    
    def delete(self, pk):
        """Personel sil (soft delete)"""
        return self.repository.delete(pk)
    
    def hard_delete(self, pk):
        """Personel kalıcı sil"""
        return self.repository.hard_delete(pk)
    
    def get_without_user_account(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        """Sisteme giriş hesabı olmayan personelleri getir"""
        if sube_id and kurum_id:
            return personel_queryset_for_sube(
                kurum_id, sube_id, egitim_yili_id, aktif_only=True,
            ).filter(user__isnull=True)
        return self.repository.get_without_user_account(kurum_id, sube_id)
    
    @transaction.atomic
    def create_user_account_for_personel(self, personel_id, password=None):
        """Mevcut personel için kullanıcı hesabı oluştur"""
        personel = self.repository.get_by_id(personel_id)
        if not personel:
            raise ValueError("Personel bulunamadı")
        
        if personel.user:
            raise ValueError("Bu personelin zaten bir kullanıcı hesabı var")
        
        if not personel.email:
            raise ValueError("Kullanıcı hesabı oluşturmak için e-posta adresi gerekli")
        
        user = User.objects.create_user(
            username=personel.email,
            email=personel.email,
            first_name=personel.ad,
            last_name=personel.soyad,
            password=password or personel.tc_kimlik_no or User.objects.make_random_password()
        )
        
        personel.user = user
        personel.save()

        assign_user_role_for_personel(
            user,
            personel,
            must_change_password=not bool(password),
        )
        
        return personel
    
    def toggle_active_status(self, pk):
        """Personel aktif/pasif durumunu değiştir"""
        personel = self.repository.get_by_id(pk)
        if not personel:
            raise ValueError("Personel bulunamadı")
        
        personel.aktif_mi = not personel.aktif_mi
        personel.save()
        
        return personel


# NOT: PersonelRolService kaldırıldı. Roller artık apps.roller modülü üzerinden yönetilmektedir.


class PersonelGorevlendirmeService:
    """Service for PersonelGorevlendirme business logic"""
    
    def __init__(self):
        self.repository = PersonelGorevlendirmeRepository()
    
    def get_all(self, kurum_id, egitim_yili_id=None, sube_id=None, aktif_only=True):
        """Tüm görevlendirmeleri getir"""
        return self.repository.get_all(kurum_id, egitim_yili_id, sube_id, aktif_only)
    
    def get_by_id(self, pk):
        """ID'ye göre görevlendirme getir"""
        return self.repository.get_by_id(pk)
    
    def get_by_personel_and_year(self, personel_id, egitim_yili_id):
        """Personelin belirli yıldaki görevlendirmelerini getir"""
        return self.repository.get_by_personel_and_year(personel_id, egitim_yili_id)
    
    def get_by_role(self, rol_id, egitim_yili_id, kurum_id, sube_id=None):
        """Belirli roldeki personelleri getir (örn: tüm koçlar)"""
        return self.repository.get_by_role(rol_id, egitim_yili_id, kurum_id, sube_id)
    
    @transaction.atomic
    def create(self, data):
        """Yeni görevlendirme oluştur"""
        # Aynı görevlendirme var mı kontrol et
        existing = self.repository.get_by_personel_and_year(
            data['personel_id'], 
            data['egitim_yili_id']
        ).filter(
            gorev_sube_id=data['gorev_sube_id'],
            rol_id=data['rol_id']
        ).first()
        
        if existing:
            raise ValueError("Bu personel için aynı yıl, şube ve rolde görevlendirme zaten var")
        
        return self.repository.create(data)
    
    def update(self, pk, data):
        """Görevlendirme güncelle"""
        return self.repository.update(pk, data)
    
    def delete(self, pk):
        """Görevlendirme sil (soft delete)"""
        return self.repository.delete(pk)
    
    def copy_from_previous_year(self, kurum_id, from_year_id, to_year_id):
        """
        Önceki yıldan görevlendirmeleri kopyala
        
        Yeni eğitim yılı başladığında, önceki yılın görevlendirmelerini
        yeni yıla kopyalamak için kullanılır.
        """
        previous_assignments = self.repository.get_all(kurum_id, from_year_id)
        
        created_count = 0
        for assignment in previous_assignments:
            # Personel hala aktif mi kontrol et
            if not assignment.personel.aktif_mi:
                continue
            
            try:
                self.repository.create({
                    'personel_id': assignment.personel_id,
                    'egitim_yili_id': to_year_id,
                    'rol_id': assignment.rol_id,
                    'gorev_sube_id': assignment.gorev_sube_id,
                    'brans_id': assignment.brans_id,
                    'kurum_id': assignment.kurum_id,
                })
                created_count += 1
            except Exception:
                # Zaten varsa atla
                pass
        
        return created_count
