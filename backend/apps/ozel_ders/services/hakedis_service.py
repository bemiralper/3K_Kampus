from __future__ import annotations

from typing import Optional

from django.db import transaction
from django.db.models import Sum

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHakedis,
    HakedisDurumu,
    OturumDurumu,
)
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.ucret_engine import evaluate


def serialize_hakedis(h: BirebirHakedis) -> dict:
    return {
        'id': h.id,
        'oturum': h.oturum_id,
        'ogretmen': h.ogretmen_id,
        'ogretmen_ad': getattr(h.ogretmen, 'tam_ad', str(h.ogretmen_id)),
        'ders': h.ders_id,
        'ders_ad': getattr(h.ders, 'ad', None) or str(h.ders_id),
        'ders_kisa_ad': (getattr(h.ders, 'kisa_ad', None) or '').strip(),
        'tarih': h.tarih.isoformat(),
        'sure_dk': h.sure_dk,
        'birim_ucret': float(h.birim_ucret),
        'tutar': float(h.tutar),
        'aciklama': h.aciklama,
        'durum': h.durum,
        'durum_display': h.get_durum_display(),
        'aylik_hakedis': h.aylik_hakedis_id,
        'session_date': h.oturum.session_date.isoformat() if h.oturum_id else None,
        'start_time': h.oturum.start_time.strftime('%H:%M') if h.oturum_id else None,
        'ogrenci': h.oturum.ogrenci_id if h.oturum_id else None,
    }


@transaction.atomic
def sync_hakedis_for_oturum(oturum: BirebirDersOturumu) -> Optional[BirebirHakedis]:
    """
    Yoklama sonrası çağrılır.
    Ücretlenebilir durumdaysa TASLAK hakediş oluştur/güncelle;
    değilse henüz bordroya işlenmemiş hakedişi iptal et.
    """
    existing = BirebirHakedis.objects.filter(oturum=oturum).first()
    if existing and existing.durum in (
        HakedisDurumu.ONAYLANDI,
        HakedisDurumu.BORDOYA_ISLENDI,
    ):
        # Kilitli — durum değişikliğinde hakedişe dokunma
        return existing

    sonuc = evaluate(oturum)
    if not sonuc.payable:
        if existing and existing.durum == HakedisDurumu.TASLAK:
            existing.durum = HakedisDurumu.IPTAL
            existing.aciklama = sonuc.reason
            existing.tutar = sonuc.tutar
            existing.birim_ucret = sonuc.birim_ucret
            existing.sure_dk = sonuc.sure_dk
            existing.save()
        return existing

    aciklama = (
        f'{oturum.get_oturum_turu_display()} · {sonuc.sozlesme_turu} · '
        f'{sonuc.mesai_modu} · {sonuc.reason}'
    )
    if existing:
        existing.ogretmen_id = oturum.ogretmen_id
        existing.ders_id = oturum.ders_id
        existing.tarih = oturum.session_date
        existing.sure_dk = sonuc.sure_dk
        existing.birim_ucret = sonuc.birim_ucret
        existing.tutar = sonuc.tutar
        existing.aciklama = aciklama
        existing.durum = HakedisDurumu.TASLAK
        existing.save()
        return existing

    return BirebirHakedis.objects.create(
        oturum=oturum,
        ogretmen_id=oturum.ogretmen_id,
        ders_id=oturum.ders_id,
        tarih=oturum.session_date,
        sure_dk=sonuc.sure_dk,
        birim_ucret=sonuc.birim_ucret,
        tutar=sonuc.tutar,
        aciklama=aciklama,
        durum=HakedisDurumu.TASLAK,
    )


@transaction.atomic
def approve_hakedis(hakedis_id: int, *, kurum_id: int, sube_id: int) -> BirebirHakedis:
    try:
        h = BirebirHakedis.objects.select_related('oturum', 'ogretmen', 'ders').get(
            pk=hakedis_id,
            oturum__kurum_id=kurum_id,
            oturum__sube_id=sube_id,
        )
    except BirebirHakedis.DoesNotExist:
        raise OzelDersError('Hakediş bulunamadı.', 'not_found', 404)

    if h.durum == HakedisDurumu.BORDOYA_ISLENDI:
        raise OzelDersError('Bordroya işlenmiş hakediş onaylanamaz.', 'locked')
    if h.durum == HakedisDurumu.IPTAL:
        raise OzelDersError('İptal hakediş onaylanamaz.', 'cancelled')
    if h.tutar <= 0:
        raise OzelDersError('Sıfır tutarlı hakediş onaylanamaz.', 'zero_amount')

    h.durum = HakedisDurumu.ONAYLANDI
    h.save(update_fields=['durum', 'updated_at'])
    return h


@transaction.atomic
def cancel_hakedis(hakedis_id: int, *, kurum_id: int, sube_id: int) -> BirebirHakedis:
    try:
        h = BirebirHakedis.objects.select_related('oturum').get(
            pk=hakedis_id,
            oturum__kurum_id=kurum_id,
            oturum__sube_id=sube_id,
        )
    except BirebirHakedis.DoesNotExist:
        raise OzelDersError('Hakediş bulunamadı.', 'not_found', 404)

    if h.durum == HakedisDurumu.BORDOYA_ISLENDI:
        raise OzelDersError('Bordroya işlenmiş hakediş iptal edilemez.', 'locked')

    h.durum = HakedisDurumu.IPTAL
    h.save(update_fields=['durum', 'updated_at'])
    return h


def list_hakedis(
    *,
    kurum_id: int,
    sube_id: int,
    durum: Optional[str] = None,
    ogretmen_id: Optional[int] = None,
    yil: Optional[int] = None,
    ay: Optional[int] = None,
) -> list[dict]:
    qs = BirebirHakedis.objects.filter(
        oturum__kurum_id=kurum_id,
        oturum__sube_id=sube_id,
    ).select_related('ogretmen', 'ders', 'oturum')
    if durum:
        qs = qs.filter(durum=durum)
    if ogretmen_id:
        qs = qs.filter(ogretmen_id=ogretmen_id)
    if yil:
        qs = qs.filter(tarih__year=yil)
    if ay:
        qs = qs.filter(tarih__month=ay)
    return [serialize_hakedis(h) for h in qs]
