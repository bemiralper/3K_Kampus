"""
Cari v2 — Kayıtlı görünüm servisi (saved views / filtre kombinasyonları).
"""
from __future__ import annotations

from apps.finans.domain.cari_gorunum import CariKayitliGorunum


class CariGorunumService:
    def list(self, kurum_id, kullanici, sube_id=None):
        qs = CariKayitliGorunum.objects.filter(kurum_id=kurum_id, kullanici=kullanici)
        if sube_id:
            from django.db.models import Q
            qs = qs.filter(Q(sube_id=sube_id) | Q(sube__isnull=True))
        return [self._serialize(g) for g in qs]

    def create(self, kurum_id, kullanici, ad, config, sube_id=None, varsayilan_mi=False):
        ad = (ad or '').strip()
        if not ad:
            return None, {'ad': 'Görünüm adı zorunludur.'}
        if varsayilan_mi:
            CariKayitliGorunum.objects.filter(
                kurum_id=kurum_id, kullanici=kullanici,
            ).update(varsayilan_mi=False)
        g = CariKayitliGorunum.objects.create(
            kurum_id=kurum_id,
            sube_id=sube_id,
            kullanici=kullanici,
            ad=ad,
            config=config or {},
            varsayilan_mi=varsayilan_mi,
        )
        return g, None

    def update(self, gorunum_id, kurum_id, kullanici, ad=None, config=None, varsayilan_mi=None):
        try:
            g = CariKayitliGorunum.objects.get(
                id=gorunum_id, kurum_id=kurum_id, kullanici=kullanici,
            )
        except CariKayitliGorunum.DoesNotExist:
            return None, {'genel': 'Görünüm bulunamadı.'}
        if ad is not None:
            g.ad = ad.strip()
        if config is not None:
            g.config = config
        if varsayilan_mi is not None:
            if varsayilan_mi:
                CariKayitliGorunum.objects.filter(
                    kurum_id=kurum_id, kullanici=kullanici,
                ).exclude(id=g.id).update(varsayilan_mi=False)
            g.varsayilan_mi = varsayilan_mi
        g.save()
        return g, None

    def delete(self, gorunum_id, kurum_id, kullanici):
        try:
            g = CariKayitliGorunum.objects.get(
                id=gorunum_id, kurum_id=kurum_id, kullanici=kullanici,
            )
        except CariKayitliGorunum.DoesNotExist:
            return False, {'genel': 'Görünüm bulunamadı.'}
        g.delete()
        return True, None

    def _serialize(self, g):
        return {
            'id': g.id,
            'ad': g.ad,
            'config': g.config,
            'varsayilan_mi': g.varsayilan_mi,
            'sube_id': g.sube_id,
            'created_at': g.created_at.isoformat() if g.created_at else None,
        }
