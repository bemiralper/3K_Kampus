"""
Mali Hesap Application Service
İş kurallarını orchestrate eder, validation yapar, repository'ye delege eder.

Sorumluluklar:
- Input validation
- Business rule enforcement (IBAN zorunluluğu vb.)
- Repository çağrıları
- Error handling
"""
from apps.finans.application.finans_tanim_usage import get_mali_hesap_delete_block_message
from apps.finans.infrastructure.financial_account_repository import MaliHesapRepository
from apps.finans.constants.account_types import MaliHesapTipi, BankaKodu


class MaliHesapService:
    """Mali Hesap iş mantığı servisi."""

    def __init__(self):
        self.repo = MaliHesapRepository()

    # ─── CREATE ──────────────────────────────────

    def create(self, sube_id, data):
        """
        Yeni mali hesap oluşturur.

        Validasyonlar:
        - ad boş olamaz
        - tip geçerli olmalı
        - sube + ad benzersiz olmalı
        - BANKA tipinde IBAN opsiyonel (format kontrolü)
        - IBAN format kontrolü

        Returns:
            (instance, None) başarılı ise
            (None, error_dict) hatalı ise
        """
        errors = self._validate_create(sube_id, data)
        if errors:
            return None, errors

        create_data = self._build_persist_data(data, sube_id=sube_id)

        instance = self.repo.create(create_data)
        return instance, None

    # ─── UPDATE ──────────────────────────────────

    def update(self, pk, data):
        """
        Mevcut mali hesabı günceller.

        Returns:
            (instance, None) başarılı ise
            (None, error_dict) hatalı ise
        """
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Mali hesap bulunamadı.'}

        errors = self._validate_update(instance, data)
        if errors:
            return None, errors

        update_data = {}
        if 'ad' in data:
            update_data['ad'] = data['ad'].strip()
        if 'tip' in data:
            update_data['tip'] = data['tip']
        if any(k in data for k in ('tip', 'banka', 'banka_adi', 'iban', 'hesap_no')):
            merged = {
                'tip': data.get('tip', instance.tip),
                'banka': data.get('banka', instance.banka),
                'banka_adi': data.get('banka_adi', instance.banka_adi),
                'iban': data.get('iban', instance.iban),
                'hesap_no': data.get('hesap_no', instance.hesap_no),
            }
            normalized = self._normalize_banka_fields(merged)
            update_data.update(normalized)
        if 'baslangic_bakiye' in data:
            update_data['baslangic_bakiye'] = data['baslangic_bakiye']
        if 'para_birimi' in data:
            update_data['para_birimi'] = data['para_birimi']
        if 'siralama' in data:
            update_data['siralama'] = data['siralama']
        if 'aktif_mi' in data:
            update_data['aktif_mi'] = data['aktif_mi']
        if 'aciklama' in data:
            update_data['aciklama'] = data['aciklama']

        instance = self.repo.update(instance, update_data)
        return instance, None

    # ─── SOFT DELETE ─────────────────────────────

    def soft_delete(self, pk):
        """
        Mali hesabı soft delete yapar.

        Returns:
            (instance, None) başarılı ise
            (None, error_dict) hatalı ise
        """
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Mali hesap bulunamadı.'}

        block_message = get_mali_hesap_delete_block_message(pk)
        if block_message:
            return None, {'detail': block_message}

        instance = self.repo.soft_delete(instance)
        return instance, None

    # ─── ACTIVATE / DEACTIVATE ───────────────────

    def activate(self, pk):
        """Mali hesabı aktif hale getirir."""
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Mali hesap bulunamadı.'}

        instance = self.repo.activate(instance)
        return instance, None

    def deactivate(self, pk):
        """Mali hesabı pasif hale getirir."""
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Mali hesap bulunamadı.'}

        instance = self.repo.deactivate(instance)
        return instance, None

    # ─── VALIDATION ──────────────────────────────

    def _validate_create(self, sube_id, data):
        """Create işlemi validasyonu."""
        errors = {}

        # Ad zorunlu
        ad = data.get('ad', '').strip()
        if not ad:
            errors['ad'] = 'Mali hesap adı zorunludur.'

        # Tip geçerli mi
        tip = data.get('tip', MaliHesapTipi.KASA)
        if tip not in MaliHesapTipi.get_values():
            errors['tip'] = f'Geçersiz mali hesap tipi: {tip}'

        banka_errors = self._validate_banka_fields(data, tip)
        if banka_errors:
            errors.update(banka_errors)

        # Sube + Ad uniqueness
        if ad and self.repo.exists_by_sube_and_ad(sube_id, ad):
            errors['ad'] = 'Bu şube için aynı isimde bir mali hesap zaten mevcut.'

        # IBAN format kontrolü (girildiyse)
        iban = data.get('iban', '').strip().replace(' ', '')
        if iban:
            iban_errors = self._validate_iban(iban)
            if iban_errors:
                errors['iban'] = iban_errors

        return errors if errors else None

    def _validate_update(self, instance, data):
        """Update işlemi validasyonu."""
        errors = {}

        # Ad değişiyorsa uniqueness kontrolü
        ad = data.get('ad', '').strip()
        if ad and ad != instance.ad:
            if self.repo.exists_by_sube_and_ad(instance.sube_id, ad, exclude_id=instance.pk):
                errors['ad'] = 'Bu şube için aynı isimde bir mali hesap zaten mevcut.'

        # Tip geçerli mi
        tip = data.get('tip', instance.tip)
        if tip not in MaliHesapTipi.get_values():
            errors['tip'] = f'Geçersiz mali hesap tipi: {tip}'

        merged = {
            'banka': data.get('banka', instance.banka),
            'banka_adi': data.get('banka_adi', instance.banka_adi),
            'iban': data.get('iban', instance.iban),
        }
        banka_errors = self._validate_banka_fields(merged, tip)
        if banka_errors:
            errors.update(banka_errors)

        # IBAN format kontrolü (girildiyse)
        if 'iban' in data:
            iban_val = data['iban'].strip().replace(' ', '')
            if iban_val:
                iban_errors = self._validate_iban(iban_val)
                if iban_errors:
                    errors['iban'] = iban_errors

        return errors if errors else None

    def _build_persist_data(self, data, *, sube_id=None):
        tip = data.get('tip', MaliHesapTipi.KASA)
        banka_fields = self._normalize_banka_fields({
            'tip': tip,
            'banka': data.get('banka', ''),
            'banka_adi': data.get('banka_adi', ''),
            'iban': data.get('iban', ''),
            'hesap_no': data.get('hesap_no', ''),
        })
        payload = {
            'ad': data['ad'].strip(),
            'tip': tip,
            **banka_fields,
            'baslangic_bakiye': data.get('baslangic_bakiye', 0),
            'para_birimi': data.get('para_birimi', 'TRY'),
            'siralama': data.get('siralama', 0),
            'aktif_mi': data.get('aktif_mi', True),
            'aciklama': data.get('aciklama', ''),
        }
        if sube_id is not None:
            payload['sube_id'] = sube_id
        return payload

    @staticmethod
    def _resolve_banka_code(data):
        banka = (data.get('banka') or '').strip()
        if banka:
            return banka
        legacy = (data.get('banka_adi') or '').strip()
        return BankaKodu.resolve_from_label(legacy)

    def _validate_banka_fields(self, data, tip):
        errors = {}
        banka = self._resolve_banka_code(data)
        if MaliHesapTipi.banka_zorunlu_mu(tip):
            if not banka:
                errors['banka'] = 'Bu hesap tipi için banka seçimi zorunludur.'
            elif banka not in BankaKodu.get_values():
                errors['banka'] = 'Geçersiz banka seçimi.'
        elif banka and banka not in BankaKodu.get_values():
            errors['banka'] = 'Geçersiz banka seçimi.'
        return errors

    @staticmethod
    def _normalize_banka_fields(data):
        tip = data.get('tip', MaliHesapTipi.KASA)
        banka = MaliHesapService._resolve_banka_code(data)
        if not MaliHesapTipi.banka_zorunlu_mu(tip):
            banka = ''
        iban = (data.get('iban') or '').strip().replace(' ', '')
        hesap_no = (data.get('hesap_no') or '').strip()
        if not MaliHesapTipi.banka_detay_mi(tip):
            iban = ''
            hesap_no = ''
        return {
            'banka': banka,
            'banka_adi': BankaKodu.get_label(banka) if banka else '',
            'iban': iban,
            'hesap_no': hesap_no,
        }

    @staticmethod
    def _validate_iban(iban):
        """IBAN format validasyonu (Türkiye standardı)."""
        if not iban.startswith('TR'):
            return 'IBAN, TR ile başlamalıdır.'
        if len(iban) != 26:
            return 'IBAN 26 karakter olmalıdır.'
        return None
