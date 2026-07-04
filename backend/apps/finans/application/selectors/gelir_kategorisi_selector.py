"""
Gelir Kategorisi Selector — Read-only sorgular
"""
from apps.finans.infrastructure.gelir_kategorisi_repository import GelirKategorisiRepository


class GelirKategorisiSelector:
    def __init__(self):
        self.repo = GelirKategorisiRepository()

    def get_by_id(self, pk):
        return self.repo.get_by_id(pk)

    def get_all_by_kurum(self, kurum_id, sube_id=None):
        return self.repo.get_by_kurum(kurum_id, sube_id=sube_id)

    def get_ana_kategoriler(self, kurum_id, sube_id=None):
        return self.repo.get_ana_kategoriler(kurum_id, sube_id=sube_id)

    def get_alt_kategoriler(self, parent_id):
        return self.repo.get_alt_kategoriler(parent_id)

    def get_tree(self, kurum_id, sube_id=None):
        all_items = list(self.repo.get_tree(kurum_id, sube_id=sube_id))

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
