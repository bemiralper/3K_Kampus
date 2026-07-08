"""
Cari v2 — Etiket servisi (CRUD).
"""
from __future__ import annotations

from django.db.models import Count

from apps.finans.domain.cari_etiket import CariEtiket


class CariEtiketService:
    def list(self, kurum_id, sube_id=None):
        qs = CariEtiket.objects.filter(kurum_id=kurum_id)
        if sube_id:
            from django.db.models import Q
            qs = qs.filter(Q(sube_id=sube_id) | Q(sube__isnull=True))
        qs = qs.annotate(cari_sayisi=Count('cari_hesaplar')).order_by('ad')
        return [
            {
                'id': e.id,
                'ad': e.ad,
                'renk': e.renk,
                'sube_id': e.sube_id,
                'cari_sayisi': e.cari_sayisi,
            }
            for e in qs
        ]

    def create(self, kurum_id, ad, renk='#0262a7', sube_id=None):
        ad = (ad or '').strip()
        if not ad:
            return None, {'ad': 'Etiket adı zorunludur.'}
        if CariEtiket.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, ad__iexact=ad,
        ).exists():
            return None, {'ad': 'Bu etiket zaten mevcut.'}
        etiket = CariEtiket.objects.create(
            kurum_id=kurum_id, sube_id=sube_id, ad=ad, renk=renk or '#0262a7',
        )
        return etiket, None

    def update(self, etiket_id, kurum_id, ad=None, renk=None):
        try:
            etiket = CariEtiket.objects.get(id=etiket_id, kurum_id=kurum_id)
        except CariEtiket.DoesNotExist:
            return None, {'genel': 'Etiket bulunamadı.'}
        if ad is not None:
            etiket.ad = ad.strip()
        if renk is not None:
            etiket.renk = renk
        etiket.save()
        return etiket, None

    def delete(self, etiket_id, kurum_id):
        try:
            etiket = CariEtiket.objects.get(id=etiket_id, kurum_id=kurum_id)
        except CariEtiket.DoesNotExist:
            return False, {'genel': 'Etiket bulunamadı.'}
        etiket.silindi_mi = True
        etiket.save(update_fields=['silindi_mi', 'updated_at'])
        return True, None
