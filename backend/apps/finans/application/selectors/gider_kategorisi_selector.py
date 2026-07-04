"""
Gider Kategorisi Selector
Read-only sorgular için özelleştirilmiş sorgu katmanı.
View'lar doğrudan bu selector'ı kullanır — Service üzerinden geçmez.
"""
from apps.finans.infrastructure.gider_kategorisi_repository import GiderKategorisiRepository


class GiderKategorisiSelector:
    """Gider kategorileri için read-only sorgular."""

    def __init__(self):
        self.repo = GiderKategorisiRepository()

    def get_by_id(self, pk):
        """Tek bir kayıt getirir."""
        return self.repo.get_by_id(pk)

    def get_all_by_kurum(self, kurum_id, sube_id=None):
        """Kuruma (ve opsiyonel şubeye) ait tüm aktif kategorileri döndürür."""
        return self.repo.get_by_kurum(kurum_id, sube_id=sube_id)

    def get_ana_kategoriler(self, kurum_id, sube_id=None):
        """Kuruma ait ana kategorileri döndürür."""
        return self.repo.get_ana_kategoriler(kurum_id, sube_id=sube_id)

    def get_alt_kategoriler(self, parent_id):
        """Bir ana kategorinin alt kategorilerini döndürür."""
        return self.repo.get_alt_kategoriler(parent_id)

    def get_tree(self, kurum_id, sube_id=None):
        """
        Kuruma ait kategorileri ağaç yapısında döndürür.
        Tüm veriyi tek sorguda çeker, Python'da ağaç oluşturur.

        Returns:
            list[dict]: Ana kategoriler, her birinde alt_kategoriler listesi
        """
        all_items = list(self.repo.get_tree(kurum_id, sube_id=sube_id))

        # Ana ve alt kategorileri ayır
        ana_map = {}
        alt_list = []

        for item in all_items:
            if item.parent_id is None:
                ana_map[item.pk] = {
                    'id': item.pk,
                    'ad': item.ad,
                    'ikon': item.ikon,
                    'renk': item.renk,
                    'aciklama': item.aciklama,
                    'siralama': item.siralama,
                    'aktif_mi': item.aktif_mi,
                    'created_at': item.created_at,
                    'updated_at': item.updated_at,
                    'alt_kategoriler': [],
                }
            else:
                alt_list.append(item)

        # Alt kategorileri ebeveynlere ekle
        for item in alt_list:
            parent_data = ana_map.get(item.parent_id)
            if parent_data:
                parent_data['alt_kategoriler'].append({
                    'id': item.pk,
                    'ad': item.ad,
                    'ikon': item.ikon,
                    'renk': item.renk,
                    'aciklama': item.aciklama,
                    'siralama': item.siralama,
                    'aktif_mi': item.aktif_mi,
                    'parent_id': item.parent_id,
                    'created_at': item.created_at,
                    'updated_at': item.updated_at,
                })

        return list(ana_map.values())

    def get_dropdown_list(self, kurum_id, sube_id=None):
        """
        Dropdown/select için optimize edilmiş ağaç.
        Gider kaydı oluştururken alt kategori seçimi için kullanılır.
        Sadece aktif kategoriler.
        """
        qs = self.repo.get_aktif_by_kurum(kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        all_items = list(qs.values('id', 'ad', 'parent_id', 'ikon'))

        # Ağaç yapısında döndür
        ana_map = {}
        alt_list = []

        for item in all_items:
            if item['parent_id'] is None:
                item['alt_kategoriler'] = []
                ana_map[item['id']] = item
            else:
                alt_list.append(item)

        for item in alt_list:
            parent = ana_map.get(item['parent_id'])
            if parent:
                parent['alt_kategoriler'].append(item)

        return list(ana_map.values())

    def get_count(self, kurum_id):
        """Kuruma ait toplam kategori sayısı."""
        return self.repo.count_by_kurum(kurum_id)
