"""
Mali Hesap Selector
Read-only sorgular için özelleştirilmiş sorgu katmanı.
View'lar doğrudan bu selector'ı kullanır — Service üzerinden geçmez.
"""
from apps.finans.infrastructure.financial_account_repository import MaliHesapRepository


class MaliHesapSelector:
    """Mali hesaplar için read-only sorgular."""

    def __init__(self):
        self.repo = MaliHesapRepository()

    def get_by_id(self, pk):
        """Tek bir kayıt getirir."""
        return self.repo.get_by_id(pk)

    def get_all_by_sube(self, sube_id):
        """Şubeye ait tüm aktif (silinmemiş) mali hesapları döndürür."""
        return self.repo.get_by_sube(sube_id)

    def get_active_by_sube(self, sube_id):
        """Şubeye ait sadece aktif mali hesapları döndürür."""
        return self.repo.get_active_by_sube(sube_id)

    def get_by_tip(self, sube_id, tip):
        """Şubeye ait belirli tipteki mali hesapları döndürür."""
        return self.repo.get_by_tip(sube_id, tip)

    def get_by_kurum(self, kurum_id):
        """Kuruma ait tüm şubelerdeki mali hesapları döndürür."""
        return self.repo.get_by_kurum(kurum_id)

    def get_dropdown_list(self, sube_id):
        """
        Dropdown/select için optimize edilmiş liste.
        Sadece id, ad, tip döndürür.
        """
        return self.repo.get_active_by_sube(sube_id).values('id', 'ad', 'tip')

    def get_count(self, sube_id):
        """Şubeye ait toplam kayıt sayısı."""
        return self.repo.count_by_sube(sube_id)

    def get_agac(self, kurum_id, sube_id=None):
        """
        Mali Hesaplar ekranının sol panel TreeView'ı için Şube bazlı
        gruplanmış hesap ağacı döndürür.

        Returns:
            list[dict]: [{sube_id, sube_ad, hesaplar: [{id, ad, tip, tip_label,
                          bakiye, para_birimi, aktif_mi, odeme_yontemi_sayisi}]}]
        """
        from apps.finans.application.selectors.bakiye_hareketi_selector import BakiyeHareketiSelector
        from apps.finans.domain.payment_method import OdemeYontemi

        bakiye_selector = BakiyeHareketiSelector()

        hesaplar = self.repo.get_by_kurum(kurum_id)
        if sube_id:
            hesaplar = hesaplar.filter(sube_id=sube_id)

        from django.db.models import Count
        odeme_sayilari = dict(
            OdemeYontemi.objects.filter(mali_hesap__sube__kurum_id=kurum_id, aktif_mi=True)
            .values_list('mali_hesap_id')
            .annotate(sayi=Count('id'))
        )

        subeler = {}
        sube_sira = []
        for hesap in hesaplar:
            sube = hesap.sube
            if sube.id not in subeler:
                subeler[sube.id] = {
                    'sube_id': sube.id,
                    'sube_ad': sube.ad,
                    'hesaplar': [],
                }
                sube_sira.append(sube.id)
            bakiye = bakiye_selector.get_son_bakiye(hesap.id)
            subeler[sube.id]['hesaplar'].append({
                'id': hesap.id,
                'ad': hesap.ad,
                'tip': hesap.tip,
                'tip_label': hesap.get_tip_display(),
                'bakiye': float(bakiye),
                'para_birimi': hesap.para_birimi,
                'aktif_mi': hesap.aktif_mi,
                'odeme_yontemi_sayisi': odeme_sayilari.get(hesap.id, 0),
            })
        return [subeler[sid] for sid in sube_sira]

    def get_detay(self, pk):
        """
        Mali Hesap Detay Paneli için genişletilmiş bilgi seti.
        Bakiye, son işlem tarihi ve ödeme yöntemi sayısını da içerir.
        """
        from apps.finans.application.selectors.bakiye_hareketi_selector import BakiyeHareketiSelector
        from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository
        from apps.finans.domain.payment_method import OdemeYontemi

        hesap = self.repo.get_by_id(pk)
        if not hesap:
            return None

        bakiye_selector = BakiyeHareketiSelector()
        son_hareket = BakiyeHareketiRepository.get_by_mali_hesap(pk, None).first()

        return {
            'hesap': hesap,
            'bakiye': float(bakiye_selector.get_son_bakiye(pk)),
            'son_islem_tarihi': son_hareket.islem_tarihi if son_hareket else None,
            'odeme_yontemi_sayisi': OdemeYontemi.objects.filter(mali_hesap_id=pk).count(),
        }
