"""
Gider Kategorisi Application Service
İş kurallarını orchestrate eder, validation yapar, repository'ye delege eder.

Sorumluluklar:
- Input validation
- Business rule enforcement
- Repository çağrıları
- Varsayılan kategori seed'leme
"""
from apps.finans.infrastructure.gider_kategorisi_repository import GiderKategorisiRepository
from apps.finans.domain.gider_kategorisi import GiderKategorisi


# ─── Varsayılan Kategori Yapısı ──────────────────
VARSAYILAN_KATEGORILER = [
    {
        'ad': 'Personel Giderleri',
        'ikon': '👤',
        'renk': '#3b82f6',
        'alt': [
            'Maaş',
            'SGK Primi',
            'Yemek',
            'Prim',
            'Ek Ders Ücreti',
        ],
    },
    {
        'ad': 'Bina Giderleri',
        'ikon': '🏢',
        'renk': '#8b5cf6',
        'alt': [
            'Kira',
            'Elektrik',
            'Su',
            'Doğalgaz',
            'İnternet',
            'Aidat',
            'Temizlik Malzemesi',
            'Güvenlik',
            'Bakım Onarım',
        ],
    },
    {
        'ad': 'Eğitim Giderleri',
        'ikon': '📚',
        'renk': '#10b981',
        'alt': [
            'Deneme Sınavı Alımı',
            'Kitap Alımı',
            'Fotokopi',
            'Kırtasiye',
            'Akıllı Tahta Bakımı',
            'Projeksiyon',
            'Laboratuvar Malzemesi',
        ],
    },
    {
        'ad': 'Genel Giderler',
        'ikon': '📦',
        'renk': '#f59e0b',
        'alt': [
            'Kargo',
            'Ulaşım',
            'Ofis Giderleri',
            'Misafir Ağırlama',
        ],
    },
    {
        'ad': 'Reklam ve Pazarlama',
        'ikon': '📢',
        'renk': '#ef4444',
        'alt': [
            'Instagram Reklamı',
            'Google Reklamı',
            'Broşür Baskı',
            'Afiş Baskı',
            'Tabela',
            'Sosyal Medya Yönetimi',
        ],
    },
    {
        'ad': 'Teknoloji ve Donanım',
        'ikon': '💻',
        'renk': '#06b6d4',
        'alt': [
            'Bilgisayar',
            'Yazıcı',
            'Server',
            'Yazılım Lisansı',
            'Hosting',
            'Domain',
            'Teknik Servis',
        ],
    },
    {
        'ad': 'Vergi ve Resmi Ödemeler',
        'ikon': '🏛️',
        'renk': '#6366f1',
        'alt': [
            'KDV',
            'Stopaj',
            'Gelir Vergisi',
            'SGK Ödemesi',
        ],
    },
    {
        'ad': 'Banka Giderleri',
        'ikon': '🏦',
        'renk': '#64748b',
        'alt': [
            'Havale Masrafı',
            'EFT Masrafı',
            'FAST Ücreti',
            'POS Komisyonu',
            'Sanal POS Komisyonu',
            'Online Ödeme Komisyonu',
            'Hesap İşletim Ücreti',
            'Döviz Çevrim Masrafı',
            'Diğer Banka Masrafları',
        ],
    },
]


class GiderKategorisiService:
    """Gider Kategorisi iş mantığı servisi."""

    def __init__(self):
        self.repo = GiderKategorisiRepository()

    # ─── CREATE ──────────────────────────────────

    def create(self, kurum_id, data):
        """
        Yeni gider kategorisi oluşturur.

        Validasyonlar:
        - ad boş olamaz
        - kurum + parent + ad benzersiz olmalı
        - parent varsa parent aynı kuruma ait olmalı
        - Alt kategori altına alt kategori eklenemez (max 2 seviye)

        Returns:
            (instance, None) başarılı ise
            (None, error_dict) hatalı ise
        """
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

    # ─── UPDATE ──────────────────────────────────

    def update(self, pk, data):
        """
        Mevcut kategoriyi günceller.

        Returns:
            (instance, None) başarılı ise
            (None, error_dict) hatalı ise
        """
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Gider kategorisi bulunamadı.'}

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

    # ─── SOFT DELETE ─────────────────────────────

    def soft_delete(self, pk):
        """
        Kategoriyi soft delete yapar.
        Ana kategori ise alt kategorileri de silinir.

        Returns:
            (instance, None) başarılı ise
            (None, error_dict) hatalı ise
        """
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Gider kategorisi bulunamadı.'}

        instance = self.repo.soft_delete(instance)
        return instance, None

    # ─── TOGGLE ──────────────────────────────────

    def toggle_aktif(self, pk):
        """
        Aktif/pasif durumunu toggle eder.

        Returns:
            (instance, None) başarılı ise
            (None, error_dict) hatalı ise
        """
        instance = self.repo.get_by_id(pk)
        if not instance:
            return None, {'detail': 'Gider kategorisi bulunamadı.'}

        instance = self.repo.toggle_aktif(instance)
        return instance, None

    # ─── SEED ────────────────────────────────────

    def seed_varsayilan(self, kurum_id, sube_id=None):
        """
        Kurum/şube için varsayılan gider kategorilerini oluşturur.
        sube_id verilirse sadece o şube; verilmezse kurumdaki tüm şubeler.
        """
        from apps.sube.domain.models import Sube

        if sube_id:
            subeler = Sube.objects.filter(id=sube_id, kurum_id=kurum_id)
        else:
            subeler = Sube.objects.filter(kurum_id=kurum_id)

        ana_total = 0
        alt_total = 0
        for sube in subeler:
            existing = self.repo.count_by_sube(sube.id)
            if existing > 0:
                continue
            for idx, kat in enumerate(VARSAYILAN_KATEGORILER):
                ana = self.repo.create({
                    'kurum_id': kurum_id,
                    'sube_id': sube.id,
                    'ad': kat['ad'],
                    'ikon': kat.get('ikon', ''),
                    'renk': kat.get('renk', ''),
                    'siralama': idx + 1,
                    'aktif_mi': True,
                })
                ana_total += 1
                for alt_idx, alt_ad in enumerate(kat.get('alt', [])):
                    self.repo.create({
                        'kurum_id': kurum_id,
                        'sube_id': sube.id,
                        'parent_id': ana.id,
                        'ad': alt_ad,
                        'siralama': alt_idx + 1,
                        'aktif_mi': True,
                    })
                    alt_total += 1
        return ana_total, alt_total

    def ensure_banka_giderleri(self, kurum_id, sube_id):
        """
        Mevcut şubede 'Banka Giderleri' ana kategorisini ve alt kalemlerini oluşturur.
        """
        from apps.finans.constants.kesinti_types import BANKA_GIDERLERI_ANA_KATEGORI

        banka_kat = next(
            (k for k in VARSAYILAN_KATEGORILER if k['ad'] == BANKA_GIDERLERI_ANA_KATEGORI),
            None,
        )
        if not banka_kat:
            return None, 'Banka Giderleri kategori tanımı bulunamadı.'

        ana = self.repo.get_by_sube_ad(sube_id, BANKA_GIDERLERI_ANA_KATEGORI, parent_id=None)
        if not ana:
            sira = self.repo.count_by_sube(sube_id) + 1
            ana = self.repo.create({
                'kurum_id': kurum_id,
                'sube_id': sube_id,
                'ad': banka_kat['ad'],
                'ikon': banka_kat.get('ikon', ''),
                'renk': banka_kat.get('renk', ''),
                'siralama': sira,
                'aktif_mi': True,
            })

        for alt_idx, alt_ad in enumerate(banka_kat.get('alt', [])):
            if not self.repo.exists_by_sube_parent_ad(sube_id, ana.id, alt_ad):
                self.repo.create({
                    'kurum_id': kurum_id,
                    'sube_id': sube_id,
                    'parent_id': ana.id,
                    'ad': alt_ad,
                    'siralama': alt_idx + 1,
                    'aktif_mi': True,
                })

        return ana, None

    def get_banka_gider_kategorisi(self, kurum_id, sube_id, kesinti_turu):
        """Kesinti türüne karşılık gelen alt kategoriyi döndürür."""
        from apps.finans.constants.kesinti_types import KESINTI_ALT_KATEGORI

        alt_ad = KESINTI_ALT_KATEGORI.get(kesinti_turu)
        if not alt_ad:
            return None, f'Bilinmeyen kesinti türü: {kesinti_turu}'

        ana, err = self.ensure_banka_giderleri(kurum_id, sube_id)
        if err:
            return None, err

        alt = self.repo.get_by_sube_ad(sube_id, alt_ad, parent_id=ana.id)
        if not alt:
            return None, f'"{alt_ad}" gider kategorisi bulunamadı.'

        return alt, None

    # ─── PRIVATE VALIDATIONS ─────────────────────

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
