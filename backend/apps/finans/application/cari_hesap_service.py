"""
Cari Hesap Service — İş kuralları katmanı
"""
from django.db import transaction

from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository


class CariHesapService:
    """Cari Hesap iş kuralları."""

    def __init__(self):
        self.repo = CariHesapRepository

    def create(self, data: dict):
        """
        Yeni cari hesap oluşturur.
        Returns: (CariHesap, None) veya (None, error_dict)
        """
        errors = self._validate_create(data)
        if errors:
            return None, errors

        # Vergi no benzersizlik kontrolü
        vergi_no = data.get('vergi_no', '')
        if vergi_no and self.repo.vergi_no_kontrol(
            data['kurum_id'], vergi_no, sube_id=data.get('sube_id'),
        ):
            return None, {'vergi_no': 'Bu vergi numarası zaten kayıtlı.'}

        # Hesap kodu otomatik oluştur (kullanıcı girmediyse)
        if not data.get('hesap_kodu'):
            data['hesap_kodu'] = self._generate_hesap_kodu(
                data['kurum_id'], data.get('hesap_turu', 'tedarikci'), data.get('sube_id'),
            )

        hesap = self.repo.create(data)
        return hesap, None

    def _generate_hesap_kodu(self, kurum_id, hesap_turu: str, sube_id=None) -> str:
        """
        Otomatik hesap kodu üretir.
        Format: CH-{TÜR_KODU}-{SIRA:04d}
        Örnek: CH-TDR-0001, CH-MST-0002, CH-KRM-0003
        """
        tur_kodlari = {
            'tedarikci': 'TDR',
            'musteri': 'MST',
            'karma': 'KRM',
            'gelir_hesabi': 'GLR',
            'gider_hesabi': 'GDR',
            'diger': 'DGR',
        }
        tur_kodu = tur_kodlari.get(hesap_turu, 'CRI')
        prefix = f'CH-{tur_kodu}-'

        son_sira = self.repo.son_hesap_kodu_sirasi(kurum_id, prefix, sube_id=sube_id)
        yeni_sira = son_sira + 1
        return f'{prefix}{yeni_sira:04d}'

    def update(self, hesap_id: int, data: dict):
        """
        Cari hesap bilgilerini günceller.
        Returns: (CariHesap, None) veya (None, error_dict)
        """
        hesap = self.repo.get_by_id(hesap_id)
        if not hesap:
            return None, {'genel': 'Cari hesap bulunamadı.'}

        # Vergi no benzersizlik kontrolü (güncelleme)
        vergi_no = data.get('vergi_no', hesap.vergi_no)
        if vergi_no and self.repo.vergi_no_kontrol(
            hesap.kurum_id, vergi_no, sube_id=hesap.sube_id, haric_id=hesap.pk,
        ):
            return None, {'vergi_no': 'Bu vergi numarası zaten kayıtlı.'}

        hesap = self.repo.update(hesap, data)
        return hesap, None

    def soft_delete(self, hesap_id: int):
        """Soft delete uygular."""
        hesap = self.repo.get_by_id(hesap_id)
        if not hesap:
            return None, {'genel': 'Cari hesap bulunamadı.'}

        # Açık bakiyesi varsa silinemez
        if hesap.bakiye != 0:
            return None, {'genel': 'Açık bakiyesi olan cari hesap silinemez.'}

        hesap = self.repo.soft_delete(hesap)
        return hesap, None

    def toggle_aktif(self, hesap_id: int):
        """Aktif/pasif durumunu değiştirir."""
        hesap = self.repo.get_by_id(hesap_id)
        if not hesap:
            return None, {'genel': 'Cari hesap bulunamadı.'}

        hesap = self.repo.toggle_aktif(hesap)
        return hesap, None

    # ─── Validasyon ──────────────────────────────

    def _validate_create(self, data):
        errors = {}

        if not data.get('kurum_id') and not data.get('kurum'):
            errors['kurum'] = 'Kurum bilgisi zorunludur.'
        if not data.get('sube_id') and not data.get('sube'):
            errors['sube'] = 'Şube bilgisi zorunludur.'
        if not data.get('unvan'):
            errors['unvan'] = 'Ünvan zorunludur.'
        if not data.get('hesap_turu'):
            errors['hesap_turu'] = 'Hesap türü zorunludur.'

        return errors if errors else None
