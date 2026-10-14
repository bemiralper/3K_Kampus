"""Katılımcı jetonlarına daire dizisi kaynaklarını ekler.

Mevcut optik değer üretimi olduğu gibi kullanılır. Yeni anahtarlar yalnızca
bu şablonun baskısına yazılır; eski şablon jetonları değişmez.
"""
from __future__ import annotations

from .optik_print import SAMPLE_VALUES
from .optik_values import participant_value_rows


SAMPLE_DAIRE = {
    **SAMPLE_VALUES,
    'ad_soyad': 'Ayşe Yılmaz',
    'email': 'ayse@3kkampus.example',
    'veli_ad_soyad': 'Mehmet Yılmaz',
    'veli_telefon': '5551112233',
    'kitapcik': 'A',
}


def daire_value_rows(exam, participants, *, booklet_mode='none', booklet='A') -> list[dict]:
    if booklet_mode not in {'none', 'fixed', 'alternating_ab'}:
        raise ValueError('Kitapçık dağıtım yöntemi geçersiz.')
    if booklet_mode != 'none':
        booklet = (booklet or 'A').strip().upper()
        if booklet not in {'A', 'B', 'C', 'D'}:
            raise ValueError('Kitapçık A, B, C veya D olmalıdır.')
    base = participant_value_rows(exam, participants)
    rows = []
    for index, (participant, row) in enumerate(zip(participants, base)):
        student = participant.student
        item = dict(row)
        item['ad_soyad'] = ' '.join(
            part for part in ((item.get('ad') or '').strip(), (item.get('soyad') or '').strip()) if part
        )
        item['email'] = (getattr(student, 'email', '') or '').strip()
        item['veli_ad_soyad'] = (getattr(student, 'veli_ad_soyad', '') or '').strip()
        item['veli_telefon'] = (getattr(student, 'veli_telefon', '') or '').strip()
        if booklet_mode == 'none':
            item['kitapcik'] = ''
        elif booklet_mode == 'alternating_ab':
            item['kitapcik'] = 'A' if index % 2 == 0 else 'B'
        else:
            item['kitapcik'] = booklet
        rows.append(item)
    return rows
