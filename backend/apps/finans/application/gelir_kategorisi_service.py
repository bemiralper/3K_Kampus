"""
Gelir Kategorisi Application Service — seed ve yardımcı iş kuralları
"""
from apps.finans.domain.gelir_kategorisi import GelirKategorisi
from apps.finans.infrastructure.gelir_kategorisi_repository import GelirKategorisiRepository


VARSAYILAN_GELIR_KATEGORILERI = [
    {
        'ad': 'Satış Gelirleri',
        'ikon': '💰',
        'renk': '#10b981',
        'alt': ['POS Satış', 'Nakit Satış', 'Online Satış'],
    },
    {
        'ad': 'Hizmet Gelirleri',
        'ikon': '🛠️',
        'renk': '#3b82f6',
        'alt': ['Danışmanlık', 'Eğitim Hizmeti', 'Abonelik'],
    },
    {
        'ad': 'Diğer Gelirler',
        'ikon': '📦',
        'renk': '#f59e0b',
        'alt': ['Faiz Geliri', 'İade Alınan', 'Diğer'],
    },
]


class GelirKategorisiService:
    def __init__(self):
        self.repo = GelirKategorisiRepository()

    def seed_varsayilan(self, kurum_id, sube_id):
        if self.repo.count_by_sube(sube_id) > 0:
            return 0, 0

        ana_count = 0
        alt_count = 0
        for idx, ana in enumerate(VARSAYILAN_GELIR_KATEGORILERI):
            ana_kat = GelirKategorisi.objects.create(
                kurum_id=kurum_id,
                sube_id=sube_id,
                ad=ana['ad'],
                ikon=ana.get('ikon', ''),
                renk=ana.get('renk', ''),
                siralama=idx,
            )
            ana_count += 1
            for alt_idx, alt_ad in enumerate(ana.get('alt', [])):
                GelirKategorisi.objects.create(
                    kurum_id=kurum_id,
                    sube_id=sube_id,
                    parent=ana_kat,
                    ad=alt_ad,
                    siralama=alt_idx,
                )
                alt_count += 1

        return ana_count, alt_count

    def create(self, kurum_id, data):
        errors = self._validate_create(kurum_id, data)
        if errors:
            return None, errors

        create_data = {
            'kurum_id': kurum_id,
            'sube_id': data['sube_id'],
            'ad': data['ad'].strip(),
            'parent_id': data.get('parent_id'),
            'ikon': data.get('ikon') or '',
            'renk': data.get('renk') or '',
            'aciklama': data.get('aciklama') or '',
            'siralama': data.get('siralama') or 0,
            'aktif_mi': data.get('aktif_mi', True),
        }
        instance = self.repo.create(create_data)
        return instance, None

    def update(self, pk, data):
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Gelir kategorisi bulunamadı.'}

        errors = self._validate_update(instance, data)
        if errors:
            return None, errors

        update_data = {}
        if 'ad' in data:
            update_data['ad'] = data['ad'].strip()
        if 'ikon' in data:
            update_data['ikon'] = data['ikon'] or ''
        if 'renk' in data:
            update_data['renk'] = data['renk'] or ''
        if 'aciklama' in data:
            update_data['aciklama'] = data['aciklama'] or ''
        if 'siralama' in data:
            update_data['siralama'] = data['siralama'] or 0
        if 'aktif_mi' in data:
            update_data['aktif_mi'] = data['aktif_mi']

        instance = self.repo.update(instance, update_data)
        return instance, None

    def soft_delete(self, pk):
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Gelir kategorisi bulunamadı.'}
        instance = self.repo.soft_delete(instance)
        return instance, None

    def toggle_aktif(self, pk):
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Gelir kategorisi bulunamadı.'}
        instance = self.repo.toggle_aktif(instance)
        return instance, None

    def _validate_create(self, kurum_id, data):
        errors = {}
        ad = data.get('ad', '').strip()
        if not ad:
            errors['ad'] = 'Kategori adı zorunludur.'

        sube_id = data.get('sube_id')
        if not sube_id:
            errors['sube_id'] = 'Şube seçimi zorunludur.'

        parent_id = data.get('parent_id')
        if parent_id:
            parent = self.repo.get_by_id(parent_id)
            if not parent:
                errors['parent_id'] = 'Üst kategori bulunamadı.'
            elif parent.kurum_id != int(kurum_id):
                errors['parent_id'] = 'Üst kategori farklı bir kuruma ait.'
            elif sube_id and parent.sube_id != int(sube_id):
                errors['parent_id'] = 'Üst kategori farklı bir şubeye ait.'
            elif parent.parent_id is not None:
                errors['parent_id'] = 'Alt kategori altına kategori eklenemez. Sadece 2 seviye desteklenir.'

        if ad and sube_id and not errors.get('parent_id'):
            if self.repo.exists_by_sube_parent_ad(sube_id, parent_id, ad):
                errors['ad'] = 'Bu isimde bir kategori zaten mevcut.'

        return errors if errors else None

    def _validate_update(self, instance, data):
        errors = {}
        ad = data.get('ad', '').strip() if 'ad' in data else instance.ad
        if not ad:
            errors['ad'] = 'Kategori adı zorunludur.'

        if ad and ad != instance.ad:
            if self.repo.exists_by_sube_parent_ad(
                instance.sube_id, instance.parent_id, ad, exclude_id=instance.pk
            ):
                errors['ad'] = 'Bu isimde bir kategori zaten mevcut.'

        return errors if errors else None
