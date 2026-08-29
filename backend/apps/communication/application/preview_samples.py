"""Bildirim / şablon önizlemesinde kullanılan örnek değişken değerleri."""
from __future__ import annotations

PREVIEW_SAMPLE_VALUES: dict[str, str] = {
    'veli_ad': 'Ayşe Hanım',
    'ogrenci_ad': 'Mehmet Yılmaz',
    'personel_ad': 'Zeynep Kaya',
    'sinif': '12-A',
    'sube': 'Örnek Şube',
    'kurum_ad': 'Örnek Kurum',
    'tarih': '03.08.2026',
    'saat': '14:30',
    'baslik': 'Veli Toplantısı',
    'mesaj': 'Haftalık deneme sınavı sonuçları öğrenci paneline yüklenmiştir.',
    'aciklama': 'Detaylı açıklama',
    'ders_tarihi': '15 Ocak 2026 Pazartesi',
    'ders_saati': '15.00',
    'ders_adi': 'Matematik',
    'ogretmen_ad': 'Tuba Demir',
    'ders_durumu': 'Öğretmen Gelmedi',
    'sebep': 'Hastalık',
    'ek_bilgi': 'Ek not',
    'telafi_notu': (
        'Ders telafi edilecektir. Telafi tarihi ve saati kesinleştiğinde '
        'tarafınıza ayrıca bilgi verilecektir.'
    ),
    'telafi_tarihi': '18 Ocak 2026 Pazar',
    'telafi_saati': '14.00',
}


def sample_context_for(names: tuple[str, ...] | list[str]) -> dict[str, str]:
    """Olay değişkenlerini okunabilir örneklerle doldurur; bilinmeyenler {{ad}} kalır."""
    out: dict[str, str] = {}
    for name in names:
        out[name] = PREVIEW_SAMPLE_VALUES.get(name, f'{{{{{name}}}}}')
    return out
