"""
Ödeme Yöntemi Application Service
İş kurallarını orchestrate eder, validation yapar, repository'ye delege eder.

Sorumluluklar:
- Input validation
- Business rule enforcement
- Repository çağrıları
- Error handling
"""
from apps.finans.application.finans_tanim_usage import get_odeme_yontemi_delete_block_message
from apps.finans.infrastructure.payment_method_repository import OdemeYontemiRepository
from apps.finans.infrastructure.financial_account_repository import MaliHesapRepository
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.application.cek_senet.cek_senet_helpers import is_cek_senet_tip


class OdemeYontemiService:
    """Ödeme Yöntemi iş mantığı servisi."""

    def __init__(self):
        self.repo = OdemeYontemiRepository()
        self.mali_hesap_repo = MaliHesapRepository()

    # ─── CREATE ──────────────────────────────────

    def create(self, kurum_id, data):
        """
        Yeni ödeme yöntemi oluşturur. Her ödeme yöntemi bir Mali Hesaba bağlıdır.

        Validasyonlar:
        - mali_hesap_id zorunlu ve bu kuruma ait olmalı
        - ad boş olamaz
        - tip geçerli olmalı
        - mali_hesap + ad benzersiz olmalı
        - komisyon_orani >= 0
        - valor_gun >= 0

        Returns:
            (instance, None) başarılı ise
            (None, error_dict) hatalı ise
        """
        errors = self._validate_create(kurum_id, data)
        if errors:
            return None, errors

        create_data = {
            'mali_hesap_id': data.get('mali_hesap_id') or None,
            'kurum_id': kurum_id,
            'ad': data['ad'].strip(),
            'tip': data.get('tip', OdemeYontemiTipi.NAKIT),
            'komisyon_orani': data.get('komisyon_orani') or 0,
            'valor_gun': data.get('valor_gun') or 0,
            'siralama': data.get('siralama') or 0,
            'aktif_mi': data.get('aktif_mi', True),
            'aciklama': data.get('aciklama') or '',
        }

        instance = self.repo.create(create_data)
        return instance, None

    # ─── UPDATE ──────────────────────────────────

    def update(self, pk, data):
        """
        Mevcut ödeme yöntemini günceller.

        Returns:
            (instance, None) başarılı ise
            (None, error_dict) hatalı ise
        """
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Ödeme yöntemi bulunamadı.'}

        errors = self._validate_update(instance, data)
        if errors:
            return None, errors

        update_data = {}
        if 'ad' in data:
            update_data['ad'] = data['ad'].strip()
        if 'tip' in data:
            update_data['tip'] = data['tip']
        if 'komisyon_orani' in data:
            update_data['komisyon_orani'] = data['komisyon_orani'] or 0
        if 'valor_gun' in data:
            update_data['valor_gun'] = data['valor_gun'] or 0
        if 'siralama' in data:
            update_data['siralama'] = data['siralama'] or 0
        if 'aktif_mi' in data:
            update_data['aktif_mi'] = data['aktif_mi']
        if 'aciklama' in data:
            update_data['aciklama'] = data['aciklama'] or ''
        if 'mali_hesap_id' in data:
            update_data['mali_hesap_id'] = data['mali_hesap_id'] or None

        instance = self.repo.update(instance, update_data)
        return instance, None

    # ─── SOFT DELETE ─────────────────────────────

    def soft_delete(self, pk):
        """
        Ödeme yöntemini soft delete yapar.

        Returns:
            (instance, None) başarılı ise
            (None, error_dict) hatalı ise
        """
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Ödeme yöntemi bulunamadı.'}

        block_message = get_odeme_yontemi_delete_block_message(pk)
        if block_message:
            return None, {'detail': block_message}

        instance = self.repo.soft_delete(instance)
        return instance, None

    # ─── ACTIVATE / DEACTIVATE ───────────────────

    def activate(self, pk):
        """Ödeme yöntemini aktif hale getirir."""
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Ödeme yöntemi bulunamadı.'}

        instance = self.repo.activate(instance)
        return instance, None

    def deactivate(self, pk):
        """Ödeme yöntemini pasif hale getirir."""
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Ödeme yöntemi bulunamadı.'}

        instance = self.repo.deactivate(instance)
        return instance, None

    # ─── VALIDATION ──────────────────────────────

    def _validate_create(self, kurum_id, data):
        """Create işlemi validasyonu."""
        errors = {}

        tip = data.get('tip', OdemeYontemiTipi.NAKIT)
        cek_senet = is_cek_senet_tip(tip)

        # Mali hesap — çek/senet hariç zorunlu
        mali_hesap_id = data.get('mali_hesap_id')
        mali_hesap = None
        if not cek_senet:
            if not mali_hesap_id:
                errors['mali_hesap_id'] = 'Mali hesap seçimi zorunludur.'
            else:
                mali_hesap = self.mali_hesap_repo.get_by_id(mali_hesap_id)
                if not mali_hesap:
                    errors['mali_hesap_id'] = 'Seçilen mali hesap bulunamadı.'
                elif mali_hesap.sube.kurum_id != int(kurum_id):
                    errors['mali_hesap_id'] = 'Seçilen mali hesap bu kuruma ait değil.'
        elif mali_hesap_id:
            mali_hesap = self.mali_hesap_repo.get_by_id(mali_hesap_id)
            if not mali_hesap:
                errors['mali_hesap_id'] = 'Seçilen mali hesap bulunamadı.'
            elif mali_hesap.sube.kurum_id != int(kurum_id):
                errors['mali_hesap_id'] = 'Seçilen mali hesap bu kuruma ait değil.'

        # Ad zorunlu
        ad = data.get('ad', '').strip()
        if not ad:
            errors['ad'] = 'Ödeme yöntemi adı zorunludur.'

        # Tip geçerli mi
        if tip not in OdemeYontemiTipi.get_values():
            errors['tip'] = f'Geçersiz ödeme yöntemi tipi: {tip}'

        # Benzersizlik
        if ad:
            if mali_hesap_id and self.repo.exists_by_mali_hesap_and_ad(mali_hesap_id, ad):
                errors['ad'] = 'Bu mali hesap için aynı isimde bir ödeme yöntemi zaten mevcut.'
            elif cek_senet and not mali_hesap_id and self.repo.exists_by_kurum_and_ad(
                kurum_id, ad, mali_hesapsiz=True,
            ):
                errors['ad'] = 'Bu kurum için aynı isimde bir çek/senet yöntemi zaten mevcut.'

        # Komisyon >= 0 (null → 0; frontend boş alanları null gönderir)
        komisyon = data.get('komisyon_orani')
        if komisyon is None:
            komisyon = 0
        try:
            komisyon = float(komisyon)
            if komisyon < 0:
                errors['komisyon_orani'] = 'Komisyon oranı negatif olamaz.'
            if komisyon > 100:
                errors['komisyon_orani'] = 'Komisyon oranı %100\'den büyük olamaz.'
        except (TypeError, ValueError):
            errors['komisyon_orani'] = 'Geçersiz komisyon oranı.'

        # Valör >= 0 (null → 0)
        valor = data.get('valor_gun')
        if valor is None:
            valor = 0
        try:
            valor = int(valor)
            if valor < 0:
                errors['valor_gun'] = 'Valör gün negatif olamaz.'
        except (TypeError, ValueError):
            errors['valor_gun'] = 'Geçersiz valör gün değeri.'

        return errors if errors else None

    def _validate_update(self, instance, data):
        """Update işlemi validasyonu."""
        errors = {}

        tip = data.get('tip', instance.tip)
        cek_senet = is_cek_senet_tip(tip)

        # Mali hesap değişiyorsa kontrolü
        mali_hesap_id = data.get('mali_hesap_id')
        target_mali_hesap_id = mali_hesap_id if mali_hesap_id is not None else instance.mali_hesap_id
        if mali_hesap_id:
            mali_hesap = self.mali_hesap_repo.get_by_id(mali_hesap_id)
            if not mali_hesap:
                errors['mali_hesap_id'] = 'Seçilen mali hesap bulunamadı.'
            elif mali_hesap.sube.kurum_id != instance.kurum_id:
                errors['mali_hesap_id'] = 'Seçilen mali hesap bu kuruma ait değil.'
        elif not cek_senet and not target_mali_hesap_id:
            errors['mali_hesap_id'] = 'Mali hesap seçimi zorunludur.'

        # Ad değişiyorsa uniqueness kontrolü
        ad = data.get('ad', '').strip() if 'ad' in data else instance.ad
        if ad and ad != instance.ad:
            if target_mali_hesap_id and self.repo.exists_by_mali_hesap_and_ad(
                target_mali_hesap_id, ad, exclude_id=instance.pk,
            ):
                errors['ad'] = 'Bu mali hesap için aynı isimde bir ödeme yöntemi zaten mevcut.'
            elif cek_senet and not target_mali_hesap_id and self.repo.exists_by_kurum_and_ad(
                instance.kurum_id, ad, exclude_id=instance.pk, mali_hesapsiz=True,
            ):
                errors['ad'] = 'Bu kurum için aynı isimde bir çek/senet yöntemi zaten mevcut.'

        # Tip geçerli mi
        tip = data.get('tip')
        if tip and tip not in OdemeYontemiTipi.get_values():
            errors['tip'] = f'Geçersiz ödeme yöntemi tipi: {tip}'

        # Komisyon >= 0
        komisyon = data.get('komisyon_orani')
        if komisyon is not None:
            try:
                komisyon = float(komisyon)
                if komisyon < 0:
                    errors['komisyon_orani'] = 'Komisyon oranı negatif olamaz.'
                if komisyon > 100:
                    errors['komisyon_orani'] = 'Komisyon oranı %100\'den büyük olamaz.'
            except (TypeError, ValueError):
                errors['komisyon_orani'] = 'Geçersiz komisyon oranı.'

        # Valör >= 0
        valor = data.get('valor_gun')
        if valor is not None:
            try:
                valor = int(valor)
                if valor < 0:
                    errors['valor_gun'] = 'Valör gün negatif olamaz.'
            except (TypeError, ValueError):
                errors['valor_gun'] = 'Geçersiz valör gün değeri.'

        return errors if errors else None
