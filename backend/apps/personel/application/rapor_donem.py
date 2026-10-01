"""Personel maliyet raporu — eğitim yılı ay aralığı.

Eğitim yılı Eylül (başlangıç) ile Ağustos (bitiş) arasındadır.
1. dönem Eylül–Ocak, 2. dönem Şubat–Haziran, yaz Temmuz–Ağustos.
"""
from __future__ import annotations

AY_ADLARI = {
    1: 'Ocak', 2: 'Şubat', 3: 'Mart', 4: 'Nisan',
    5: 'Mayıs', 6: 'Haziran', 7: 'Temmuz', 8: 'Ağustos',
    9: 'Eylül', 10: 'Ekim', 11: 'Kasım', 12: 'Aralık',
}

AY_KISA = {
    1: 'Oca', 2: 'Şub', 3: 'Mar', 4: 'Nis', 5: 'May', 6: 'Haz',
    7: 'Tem', 8: 'Ağu', 9: 'Eyl', 10: 'Eki', 11: 'Kas', 12: 'Ara',
}

DONEM_AD = {
    '1': '1. Dönem',
    '2': '2. Dönem',
    'yaz': 'Yaz dönemi',
}

# (yıl farkı, ay) — fark başlangıç yılına göredir
_DONEM_AYLAR = {
    '1': [(0, 9), (0, 10), (0, 11), (0, 12), (1, 1)],
    '2': [(1, 2), (1, 3), (1, 4), (1, 5), (1, 6)],
    'yaz': [(1, 7), (1, 8)],
}


def egitim_yili_tum_aylar(baslangic_yil: int, bitis_yil: int) -> list[tuple[int, int]]:
    """Eylül–Aralık başlangıç yılı, Ocak–Ağustos bitiş yılı."""
    aylar = [(baslangic_yil, m) for m in range(9, 13)]
    aylar.extend((bitis_yil, m) for m in range(1, 9))
    return aylar


def resolve_rapor_aylari(
    *,
    baslangic_yil: int,
    bitis_yil: int,
    kapsam: str = 'yillik',
    donem: str | None = None,
    aylar_param: str | None = None,
) -> list[tuple[int, int]]:
    """Seçilen kapsamdaki (yıl, ay) çiftlerini eğitim yılı sırasıyla döndürür."""
    tum = egitim_yili_tum_aylar(baslangic_yil, bitis_yil)
    kapsam = (kapsam or 'yillik').strip().lower()

    if kapsam == 'yillik':
        return tum

    if kapsam == 'donem':
        anahtar = (donem or '').strip().lower()
        if anahtar not in _DONEM_AYLAR:
            raise ValueError('Geçersiz dönem. 1, 2 veya yaz seçin.')
        return [(baslangic_yil + offset, ay) for offset, ay in _DONEM_AYLAR[anahtar]]

    if kapsam == 'aylar':
        ham = (aylar_param or '').strip()
        if not ham:
            raise ValueError('En az bir ay seçin.')
        secili: set[tuple[int, int]] = set()
        gecerli = set(tum)
        for part in ham.split(','):
            part = part.strip()
            if not part:
                continue
            try:
                yil_s, ay_s = part.split('-', 1)
                pair = (int(yil_s), int(ay_s))
            except ValueError as exc:
                raise ValueError(f'Ay biçimi geçersiz: {part}') from exc
            if pair not in gecerli:
                raise ValueError(f'{part} bu eğitim yılına ait değil.')
            secili.add(pair)
        if not secili:
            raise ValueError('En az bir ay seçin.')
        return [pair for pair in tum if pair in secili]

    raise ValueError('Geçersiz kapsam. yillik, donem veya aylar kullanın.')
