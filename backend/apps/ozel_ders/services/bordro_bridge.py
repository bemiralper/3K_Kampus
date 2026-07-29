"""Onaylı birebir hakedişleri AylikHakedis.ozel_ders_hakedis_toplam alanına aktarır."""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from apps.ozel_ders.domain.models import BirebirHakedis, HakedisDurumu
from apps.ozel_ders.services.errors import OzelDersError


@transaction.atomic
def apply_approved_to_bordro(
    *,
    kurum_id: int,
    sube_id: int,
    yil: int,
    ay: int,
    ogretmen_id: int | None = None,
) -> dict:
    from apps.personel.domain.sozlesme_models import (
        AylikHakedis,
        PersonelSozlesme,
        SozlesmeDurumu,
    )

    qs = BirebirHakedis.objects.filter(
        oturum__kurum_id=kurum_id,
        oturum__sube_id=sube_id,
        durum=HakedisDurumu.ONAYLANDI,
        tarih__year=yil,
        tarih__month=ay,
    ).select_related('oturum')
    if ogretmen_id:
        qs = qs.filter(ogretmen_id=ogretmen_id)

    by_teacher: dict[int, list[BirebirHakedis]] = {}
    for h in qs:
        by_teacher.setdefault(h.ogretmen_id, []).append(h)

    updated = 0
    linked = 0
    for teacher_id, items in by_teacher.items():
        soz = (
            PersonelSozlesme.objects.filter(
                personel_id=teacher_id,
                kurum_id=kurum_id,
                durum=SozlesmeDurumu.AKTIF,
            )
            .filter(sube_id=sube_id)
            .order_by('-id')
            .first()
        )
        if not soz:
            soz = (
                PersonelSozlesme.objects.filter(
                    personel_id=teacher_id,
                    kurum_id=kurum_id,
                    durum=SozlesmeDurumu.AKTIF,
                )
                .order_by('-id')
                .first()
            )
        if not soz:
            raise OzelDersError(
                f'Öğretmen #{teacher_id} için aktif sözleşme bulunamadı.',
                'no_contract',
            )

        toplam = sum((h.tutar for h in items), Decimal('0.00'))
        bordro, _ = AylikHakedis.objects.get_or_create(
            sozlesme=soz,
            yil=yil,
            ay=ay,
            defaults={
                'sabit_maas': soz.brut_maas or Decimal('0.00'),
                'ders_basi_ucret': soz.ders_birim_ucret or Decimal('0.00'),
            },
        )
        if bordro.durum in ('ONAYLANDI', 'ODENDI'):
            raise OzelDersError(
                f'Bordro kilitli ({teacher_id} {ay}/{yil}).',
                'bordro_locked',
            )

        # Mevcut ozel_ders toplamını yeniden yaz (yalnızca bu ayın ONAYLANDI aktarımı)
        # Daha önce BORDOYA_ISLENDI olanlar zaten toplamda — onları koru
        already = BirebirHakedis.objects.filter(
            aylik_hakedis=bordro,
            durum=HakedisDurumu.BORDOYA_ISLENDI,
        ).aggregate(t=Sum('tutar'))['t'] or Decimal('0.00')

        new_total = already + toplam
        bordro.ozel_ders_hakedis_toplam = new_total
        bordro.hesapla()
        bordro.save()
        updated += 1

        for h in items:
            h.durum = HakedisDurumu.BORDOYA_ISLENDI
            h.aylik_hakedis = bordro
            h.save(update_fields=['durum', 'aylik_hakedis', 'updated_at'])
            linked += 1

    return {
        'bordro_updated': updated,
        'hakedis_linked': linked,
        'yil': yil,
        'ay': ay,
    }


def list_for_bordro(aylik_hakedis_id: int) -> list[dict]:
    from apps.ozel_ders.services.hakedis_service import serialize_hakedis

    qs = BirebirHakedis.objects.filter(
        aylik_hakedis_id=aylik_hakedis_id,
    ).select_related('ogretmen', 'ders', 'oturum')
    return [serialize_hakedis(h) for h in qs]
