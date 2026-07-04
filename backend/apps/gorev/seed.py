"""Varsayılan görev tipleri — kurum başına seed."""

DEFAULT_GOREV_TIPLERI = [
    {'kod': 'BILGILENDIRME', 'ad': 'Bilgilendirme', 'renk': '#64748B', 'ikon': 'ℹ️', 'sira': 1},
    {'kod': 'HATIRLATMA', 'ad': 'Hatırlatma', 'renk': '#F59E0B', 'ikon': '⏰', 'sira': 2},
    {'kod': 'YAPILACAK', 'ad': 'Yapılacak İş', 'renk': '#3B82F6', 'ikon': '📋', 'sira': 3},
    {'kod': 'TELEFON', 'ad': 'Telefon Görüşmesi', 'renk': '#8B5CF6', 'ikon': '📞', 'sira': 4},
    {'kod': 'TOPLANTI', 'ad': 'Toplantı', 'renk': '#06B6D4', 'ikon': '👥', 'sira': 5},
    {'kod': 'EVRAK', 'ad': 'Evrak', 'renk': '#78716C', 'ikon': '📄', 'sira': 6},
    {'kod': 'KONTROL', 'ad': 'Kontrol', 'renk': '#10B981', 'ikon': '✅', 'sira': 7},
    {'kod': 'TAKIP', 'ad': 'Takip', 'renk': '#6366F1', 'ikon': '🔍', 'sira': 8},
    {'kod': 'ACIL', 'ad': 'Acil', 'renk': '#EF4444', 'ikon': '🚨', 'sira': 9},
    # Koç otomatik türleri
    {'kod': 'OGRENCI_GORUSME', 'ad': 'Öğrenci Görüşmesi', 'renk': '#3B82F6', 'ikon': '🎓', 'sira': 10},
    {'kod': 'HAFTALIK_GORUSME', 'ad': 'Haftalık Görüşme', 'renk': '#6366F1', 'ikon': '📅', 'sira': 11},
    {'kod': 'VELI_GORUSME', 'ad': 'Veli Görüşmesi', 'renk': '#8B5CF6', 'ikon': '👨‍👩‍👧', 'sira': 12},
    {'kod': 'DENEME_ANALIZ', 'ad': 'Deneme Analizi', 'renk': '#10B981', 'ikon': '📊', 'sira': 13},
    {'kod': 'ODEV_KONTROL', 'ad': 'Ödev Kontrolü', 'renk': '#F59E0B', 'ikon': '📝', 'sira': 14},
    # Muhasebe otomatik türleri
    {'kod': 'TAKSIT_GUNU', 'ad': 'Taksit Günü', 'renk': '#3B82F6', 'ikon': '💳', 'sira': 20},
    {'kod': 'GECIKEN_ODEME', 'ad': 'Geciken Ödeme', 'renk': '#EF4444', 'ikon': '⚠️', 'sira': 21},
    {'kod': 'SENET_TARIHI', 'ad': 'Senet Tarihi', 'renk': '#78716C', 'ikon': '📜', 'sira': 22},
    {'kod': 'FATURA', 'ad': 'Fatura Kesilecek', 'renk': '#06B6D4', 'ikon': '🧾', 'sira': 23},
    {'kod': 'MAKBUZ', 'ad': 'Makbuz Teslimi', 'renk': '#10B981', 'ikon': '🧾', 'sira': 24},
    {'kod': 'BANKA_TAHSILAT', 'ad': 'Banka Tahsilatı', 'renk': '#6366F1', 'ikon': '🏦', 'sira': 25},
    {'kod': 'PERSONEL_MAAS', 'ad': 'Personel Maaşı', 'renk': '#8B5CF6', 'ikon': '💰', 'sira': 26},
    {'kod': 'VERGI', 'ad': 'Vergi Günü', 'renk': '#F97316', 'ikon': '📋', 'sira': 27},
    {'kod': 'SGK', 'ad': 'SGK Bildirimi', 'renk': '#64748B', 'ikon': '🏛️', 'sira': 28},
    {'kod': 'KDV', 'ad': 'KDV', 'renk': '#F59E0B', 'ikon': '📊', 'sira': 29},
    {'kod': 'AIDAT', 'ad': 'Aidat', 'renk': '#06B6D4', 'ikon': '🏢', 'sira': 30},
]


def seed_gorev_tipleri(kurum_id: int):
    from apps.gorev.domain.models import GorevTipi

    created = []
    for tip_data in DEFAULT_GOREV_TIPLERI:
        tip, was_created = GorevTipi.objects.update_or_create(
            kurum_id=kurum_id,
            kod=tip_data['kod'],
            defaults={
                **tip_data,
                'is_system': True,
                'is_active': True,
                'is_deleted': False,
            },
        )
        if was_created:
            created.append(tip)
    return created
