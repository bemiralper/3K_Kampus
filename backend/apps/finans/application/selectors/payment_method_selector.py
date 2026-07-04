"""
Ödeme Yöntemi Selector
Read-only sorgular için özelleştirilmiş sorgu katmanı.
View'lar doğrudan bu selector'ı kullanır — Service üzerinden geçmez.
"""
from django.db.models import F

from apps.finans.infrastructure.payment_method_repository import OdemeYontemiRepository


class OdemeYontemiSelector:
    """Ödeme yöntemleri için read-only sorgular."""

    def __init__(self):
        self.repo = OdemeYontemiRepository()

    def get_by_id(self, pk):
        """Tek bir kayıt getirir."""
        return self.repo.get_by_id(pk)

    def get_all_by_kurum(self, kurum_id):
        """Kuruma ait tüm aktif (silinmemiş) ödeme yöntemlerini döndürür."""
        return self.repo.get_by_kurum(kurum_id)

    def get_active_by_kurum(self, kurum_id):
        """Kuruma ait sadece aktif ödeme yöntemlerini döndürür."""
        return self.repo.get_active_by_kurum(kurum_id)

    def get_by_tip(self, kurum_id, tip):
        """Kuruma ait belirli tipteki ödeme yöntemlerini döndürür."""
        return self.repo.get_by_tip(kurum_id, tip)

    def get_by_mali_hesap(self, mali_hesap_id, sadece_aktif=True):
        """Bir mali hesaba ait ödeme yöntemlerini döndürür."""
        return self.repo.get_by_mali_hesap(mali_hesap_id, sadece_aktif=sadece_aktif)

    def get_dropdown_list(self, kurum_id, mali_hesap_id=None):
        """
        Dropdown/select için optimize edilmiş liste.
        id, ad, tip, mali_hesap_id döndürür.

        mali_hesap_id verilirse SADECE o hesaba ait ödeme yöntemleri döner
        (Mali Hesap -> Ödeme Yöntemi cascade akışı için).
        """
        qs = self.repo.get_active_by_kurum(kurum_id)
        if mali_hesap_id:
            qs = qs.filter(mali_hesap_id=mali_hesap_id)
        return qs.values(
            'id', 'ad', 'tip', 'mali_hesap_id', mali_hesap_ad=F('mali_hesap__ad'),
        )

    def get_count(self, kurum_id):
        """Kuruma ait toplam kayıt sayısı."""
        return self.repo.count_by_kurum(kurum_id)
