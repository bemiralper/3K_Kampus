"""
Gelir belgeleri (PDF/HTML) ve ekli belge yönetimi.

Yeni veritabanı tablosu gerektirmez: gelir ekleri ilgili carinin `CariDosya`
tablosunda `[GELIR:<id>]` etiketiyle saklanır; böylece hem gelir detayında
listelenir hem de ilgili carinin Dosyalar sekmesinde izlenebilir.
"""
from __future__ import annotations

from pathlib import Path

from django.db import transaction

from apps.finans.application.gider_belge_service import (
    ALLOWED_EK_EXT,
    MAX_EK_BYTES,
    _render,
)
from apps.finans.constants.gider_types import OdemeDurum
from apps.finans.domain.cari_dosya import CariDosya
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gelir_tahsilat import GelirTahsilat


def _gelir_prefix(gelir_id: int) -> str:
    return f'[GELIR:{gelir_id}]'


def _clean_aciklama(raw: str, gelir_id: int) -> str:
    prefix = _gelir_prefix(gelir_id)
    txt = (raw or '').strip()
    if txt.startswith(prefix):
        return txt[len(prefix):].strip()
    return txt


def serialize_gelir_ek(dosya: CariDosya, gelir_id: int) -> dict:
    return {
        'id': dosya.id,
        'dosya_adi': dosya.dosya_adi,
        'dosya_turu': dosya.dosya_turu,
        'dosya_turu_display': dosya.get_dosya_turu_display(),
        'dosya_url': dosya.dosya_url,
        'aciklama': _clean_aciklama(dosya.aciklama, gelir_id),
        'dosya_boyutu': dosya.dosya_boyutu,
        'dosya_boyutu_fmt': dosya.dosya_boyutu_fmt,
        'yukleyen_adi': (
            (dosya.yukleyen.get_full_name() or dosya.yukleyen.username)
            if dosya.yukleyen_id else None
        ),
        'created_at': dosya.created_at.isoformat() if dosya.created_at else None,
        'sistem_belgesi_degil': True,
    }


def list_gelir_ekler(gelir: GelirKaydi) -> list[dict]:
    prefix = _gelir_prefix(gelir.pk)
    qs = CariDosya.objects.select_related('yukleyen').filter(
        cari_hesap_id=gelir.cari_hesap_id,
        aciklama__startswith=prefix,
    )
    items = [serialize_gelir_ek(d, gelir.pk) for d in qs]
    if gelir.belge:
        items.append({
            'id': None,
            'legacy': True,
            'dosya_adi': gelir.belge.name.rsplit('/', 1)[-1],
            'dosya_turu': 'fatura',
            'dosya_turu_display': 'Ekli Fatura / Belge',
            'dosya_url': gelir.belge.url,
            'aciklama': 'Kayıt belgesi',
            'dosya_boyutu': getattr(gelir.belge, 'size', 0) or 0,
            'dosya_boyutu_fmt': '',
            'yukleyen_adi': None,
            'created_at': None,
            'sistem_belgesi_degil': True,
        })
    return items


@transaction.atomic
def gelir_ek_yukle(gelir: GelirKaydi, dosya, *, yukleyen=None, aciklama='', dosya_turu='fatura'):
    ad = getattr(dosya, 'name', 'belge') or 'belge'
    ext = Path(ad).suffix.lower()
    if ext not in ALLOWED_EK_EXT:
        return None, {'dosya': 'Yalnızca PDF, JPG ve PNG yüklenebilir.'}
    size = getattr(dosya, 'size', 0) or 0
    if size > MAX_EK_BYTES:
        return None, {'dosya': 'Dosya 10 MB sınırını aşıyor.'}

    valid_turler = {k for k, _ in CariDosya.DOSYA_TURLERI}
    tur = dosya_turu if dosya_turu in valid_turler else 'fatura'
    prefix = _gelir_prefix(gelir.pk)
    tagged_aciklama = f'{prefix} {(aciklama or "").strip()}'.strip()

    obj = CariDosya.objects.create(
        cari_hesap_id=gelir.cari_hesap_id,
        kurum_id=gelir.kurum_id,
        dosya=dosya,
        dosya_adi=ad,
        dosya_turu=tur,
        aciklama=tagged_aciklama,
        dosya_boyutu=size,
        yukleyen=yukleyen,
    )
    return obj, None


def gelir_ek_sil(gelir: GelirKaydi, ek_id: int):
    prefix = _gelir_prefix(gelir.pk)
    ek = CariDosya.objects.filter(
        pk=ek_id,
        cari_hesap_id=gelir.cari_hesap_id,
        aciklama__startswith=prefix,
    ).first()
    if not ek:
        return None, {'genel': 'Ekli belge bulunamadı.'}
    if ek.dosya:
        ek.dosya.delete(save=False)
    ek.delete()
    return True, None


def gelir_islem_belgesi(gelir: GelirKaydi, *, fmt='pdf'):
    from apps.finans.application.export.gelir_belge_html import build_gelir_islem_belgesi_html

    html = build_gelir_islem_belgesi_html(gelir)
    no = gelir.fatura_no or f'GLR-{gelir.pk:06d}'
    return _render(html, f'{no}.pdf', fmt)


def tahsilat_makbuzu_belgesi(gelir: GelirKaydi, tahsilat: GelirTahsilat, *, fmt='pdf'):
    from apps.finans.application.export.gelir_belge_html import build_tahsilat_makbuzu_html

    if tahsilat.gelir_kaydi_id != gelir.pk:
        return None, {'genel': 'Tahsilat bu gelir kaydına ait değil.'}
    if tahsilat.durum != OdemeDurum.TAMAMLANDI:
        return None, {'genel': 'Tahsilat makbuzu yalnızca gerçekleşmiş tahsilatlar için oluşturulur.'}

    html = build_tahsilat_makbuzu_html(gelir, tahsilat)
    no = f'THS-{tahsilat.pk:06d}'
    return _render(html, f'{no}.pdf', fmt), None
