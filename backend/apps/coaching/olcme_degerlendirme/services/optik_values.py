"""Sınav katılımcısını optik şablon jetonlarına çevirir."""
from __future__ import annotations

import re

from .optik_print import class_parts

_SLUG_RE = re.compile(r'[^0-9A-Za-zÇĞİÖŞÜçğıöşü]+')


def optik_filename(exam_name: str) -> str:
    slug = _SLUG_RE.sub('-', (exam_name or 'sinav').strip()).strip('-')
    return f'{(slug or "sinav")[:80]}-optik.pdf'


def _yer(birincil, yedek, attr: str) -> str:
    """Şubedeki il veya ilçe doluysa onu, boşsa kurumdakini kullan."""
    primary = (getattr(birincil, attr, '') or '').strip() if birincil is not None else ''
    if primary:
        return primary
    return (getattr(yedek, attr, '') or '').strip()


def _il_ilce(il: str, ilce: str) -> str:
    parts = [p for p in ((il or '').strip(), (ilce or '').strip()) if p]
    return ' / '.join(parts)


def _salon_sira(salon: str, sira: str) -> str:
    parts = [p for p in ((salon or '').strip(), (sira or '').strip()) if p]
    return ' / '.join(parts)


def participant_value_rows(exam, participants) -> list[dict]:
    """Katılımcı sırasını koruyarak her sayfanın jeton sözlüğünü üretir."""
    from apps.ogrenci.domain.models import OgrenciKayit

    ids = [p.student_id for p in participants]
    kayitlar = OgrenciKayit.objects.filter(
        ogrenci_id__in=ids, aktif_mi=True, kurum_id=exam.kurum_id,
    ).select_related('sinif', 'school')
    if exam.sube_id:
        kayitlar = kayitlar.filter(sube_id=exam.sube_id)
    if exam.egitim_yili_id:
        kayitlar = kayitlar.filter(egitim_yili_id=exam.egitim_yili_id)
    kayit_by = {}
    for kayit in kayitlar.order_by('-id'):
        kayit_by.setdefault(kayit.ogrenci_id, kayit)

    kurum = exam.kurum
    kurum_ad = getattr(kurum, 'ad', '') or ''
    sinav_subesi = exam.sube if getattr(exam, 'sube_id', None) else None
    il = _yer(sinav_subesi, kurum, 'il')
    ilce = _yer(sinav_subesi, kurum, 'ilce')
    rows = []
    for participant in participants:
        student = participant.student
        kayit = kayit_by.get(student.pk)
        sinif_ad = ''
        okul = ''
        numara = ''
        if kayit:
            numara = (kayit.okul_no or '').strip()
            sinif_ad = getattr(kayit.sinif, 'ad', '') or ''
            if kayit.school_id:
                okul = (kayit.school.ad or '').strip()
            if not okul:
                okul = (kayit.geldigi_okul or '').strip()
        if not okul:
            okul = kurum_ad
        sinif, sube, sinif_sube = class_parts(sinif_ad)
        salon = participant.room.name if participant.room_id else ''
        sira = '' if participant.seat_no is None else str(participant.seat_no)
        oturum = participant.exam_session.name if participant.exam_session_id else ''
        rows.append({
            'ad': (student.ad or '').strip(),
            'soyad': (student.soyad or '').strip(),
            'sinif': sinif,
            'sube': sube,
            'sinif_sube': sinif_sube,
            'numara': numara,
            'ogrenci_no': numara,
            'okul': okul,
            'il': il,
            'ilce': ilce,
            'il_ilce': _il_ilce(il, ilce),
            'salon': _salon_sira(salon, sira),
            'sira': sira,
            'oturum': oturum,
            'deneme_adi': (exam.name or '').strip(),
            'sinav_no': str(exam.pk),
            'tc': (student.tc_kimlik_no or '').strip(),
            'telefon': (student.telefon or '').strip(),
            'kurum': kurum_ad,
        })
    return rows
