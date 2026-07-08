"""
Gelir v2 — Dashboard Service.

İstenen kartlar: Bu Ay Gelir, Bugünkü Gelir, Bekleyen Tahsilatlar, Tahsil Edilen,
Ortalama Gelir, En Büyük Gelir Kalemleri.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum, Avg, Count, F, DecimalField, ExpressionWrapper
from django.utils import timezone

from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.constants.cari_types import GelirDurum

_ZERO = Decimal('0.00')


class GelirDashboardService:
    def _base(self, kurum_id, sube_id):
        qs = GelirKaydi.objects.filter(kurum_id=kurum_id).exclude(durum=GelirDurum.IPTAL)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        return qs

    def summary(self, kurum_id, sube_id=None):
        bugun = timezone.localdate()
        ay_basi = bugun.replace(day=1)

        base = self._base(kurum_id, sube_id)

        bu_ay = base.filter(fatura_tarihi__gte=ay_basi, fatura_tarihi__lte=bugun)
        bugun_qs = base.filter(fatura_tarihi=bugun)

        bu_ay_toplam = bu_ay.aggregate(t=Sum('net_tutar'))['t'] or _ZERO
        bugun_toplam = bugun_qs.aggregate(t=Sum('net_tutar'))['t'] or _ZERO

        # Bekleyen tahsilat = kalan tutar (net - tahsil) onaylı/kısmi kayıtlarda
        kalan_expr = ExpressionWrapper(
            F('net_tutar') - F('tahsil_edilen'),
            output_field=DecimalField(max_digits=15, decimal_places=2),
        )
        bekleyen = base.filter(
            durum__in=[GelirDurum.ONAYLANDI, GelirDurum.KISMI_TAHSIL]
        ).aggregate(t=Sum(kalan_expr))['t'] or _ZERO

        tahsil_edilen = base.aggregate(t=Sum('tahsil_edilen'))['t'] or _ZERO

        genel = base.aggregate(
            toplam=Sum('net_tutar'),
            ortalama=Avg('net_tutar'),
            adet=Count('id'),
        )

        # En büyük gelir kalemleri — kategori bazlı ilk 5
        top_kategori = list(
            base.exclude(gelir_kategorisi__isnull=True)
            .values('gelir_kategorisi__ad')
            .annotate(tutar=Sum('net_tutar'), adet=Count('id'))
            .order_by('-tutar')[:5]
        )

        return {
            'kartlar': {
                'bu_ay_gelir': str(bu_ay_toplam),
                'bu_ay_adet': bu_ay.count(),
                'bugun_gelir': str(bugun_toplam),
                'bekleyen_tahsilat': str(bekleyen),
                'tahsil_edilen': str(tahsil_edilen),
                'ortalama_gelir': str((genel['ortalama'] or _ZERO).quantize(Decimal('0.01'))),
                'toplam_gelir': str(genel['toplam'] or _ZERO),
                'toplam_adet': genel['adet'] or 0,
            },
            'en_buyuk_kalemler': [
                {
                    'ad': r['gelir_kategorisi__ad'] or 'Kategorisiz',
                    'tutar': str(r['tutar'] or _ZERO),
                    'adet': r['adet'],
                }
                for r in top_kategori
            ],
        }
