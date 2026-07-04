"""
Bakiye Hareketi Selector
Read-only sorgular — View'lar doğrudan bu selector'ı kullanır.
"""
from django.db.models import Sum, Q

from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository
from apps.finans.constants.hareket_types import HareketYonu, HareketKaynagi


class BakiyeHareketiSelector:
    """Bakiye hareketleri için read-only sorgular."""

    def __init__(self):
        self.repo = BakiyeHareketiRepository()

    def get_by_id(self, pk):
        """Tek bir hareket getirir."""
        return self.repo.get_by_id(pk)

    def get_by_mali_hesap(self, mali_hesap_id, egitim_yili_id=None):
        """Mali hesaba ait hareketler (en yeniden en eskiye)."""
        return self.repo.get_by_mali_hesap(mali_hesap_id, egitim_yili_id)

    def get_by_sube(self, sube_id, egitim_yili_id=None):
        """Şubeye ait tüm hareketler."""
        return self.repo.get_by_sube(sube_id, egitim_yili_id)

    def get_by_kurum(self, kurum_id, egitim_yili_id=None):
        """Kuruma ait tüm hareketler."""
        return self.repo.get_by_kurum(kurum_id, egitim_yili_id)

    def get_by_kaynak(self, kaynak_tip, kaynak_id):
        """Belirli bir kaynak işlemin hareketleri."""
        return self.repo.get_by_kaynak(kaynak_tip, kaynak_id)

    def get_son_bakiye(self, mali_hesap_id):
        """Mali hesabın güncel bakiyesi."""
        return self.repo.son_bakiye(mali_hesap_id)

    def get_ozet(self, mali_hesap_id, egitim_yili_id):
        """
        Mali hesabın dönem özeti.
        Returns:
            dict: { toplam_giris, toplam_cikis, net, hareket_sayisi }
        """
        giris = self.repo.toplam_giris(mali_hesap_id, egitim_yili_id)
        cikis = self.repo.toplam_cikis(mali_hesap_id, egitim_yili_id)
        sayi = self.repo.hareket_sayisi(mali_hesap_id, egitim_yili_id)

        return {
            'toplam_giris': giris,
            'toplam_cikis': cikis,
            'net': giris - cikis,
            'hareket_sayisi': sayi,
        }

    def get_kaynak_bazli_ozet(self, mali_hesap_id, egitim_yili_id):
        """
        Kaynak tipine göre gruplanmış hareket özeti.
        Örn: Tahsilatlardan 500K giriş, Giderlerden 300K çıkış...
        """
        from apps.finans.domain.bakiye_hareketi import BakiyeHareketi

        qs = BakiyeHareketi.objects.filter(
            mali_hesap_id=mali_hesap_id,
            egitim_yili_id=egitim_yili_id,
        ).values('kaynak', 'yon').annotate(
            toplam=Sum('tutar'),
        ).order_by('kaynak')

        return list(qs)
