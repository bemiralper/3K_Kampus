"""
Gider v2 — Dashboard Service.

İstenen kartlar: Bu Ay Gider, Bugünkü Gider, Bekleyen Ödemeler, Ödenen Tutar,
Ortalama Gider, En Büyük Gider Kalemleri.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum, Avg, Count, F, DecimalField, ExpressionWrapper
from django.utils import timezone

from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.constants.gider_types import GiderDurum

_ZERO = Decimal('0.00')


class GiderDashboardService:
    def _base(self, kurum_id, sube_id):
        qs = GiderKaydi.objects.filter(kurum_id=kurum_id).exclude(durum=GiderDurum.IPTAL)
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

        kalan_expr = ExpressionWrapper(
            F('net_tutar') - F('odenen_toplam'),
            output_field=DecimalField(max_digits=15, decimal_places=2),
        )
        bekleyen = base.filter(
            durum__in=[GiderDurum.ONAYLANDI, GiderDurum.KISMI_ODENDI]
        ).aggregate(t=Sum(kalan_expr))['t'] or _ZERO

        odenen = base.aggregate(t=Sum('odenen_toplam'))['t'] or _ZERO

        genel = base.aggregate(
            toplam=Sum('net_tutar'),
            ortalama=Avg('net_tutar'),
            adet=Count('id'),
        )

        top_kategori = list(
            base.values('gider_kategorisi__ad')
            .annotate(tutar=Sum('net_tutar'), adet=Count('id'))
            .order_by('-tutar')[:5]
        )

        return {
            'kartlar': {
                'bu_ay_gider': str(bu_ay_toplam),
                'bu_ay_adet': bu_ay.count(),
                'bugun_gider': str(bugun_toplam),
                'bekleyen_odeme': str(bekleyen),
                'odenen_tutar': str(odenen),
                'ortalama_gider': str((genel['ortalama'] or _ZERO).quantize(Decimal('0.01'))),
                'toplam_gider': str(genel['toplam'] or _ZERO),
                'toplam_adet': genel['adet'] or 0,
            },
            'en_buyuk_kalemler': [
                {
                    'ad': r['gider_kategorisi__ad'] or 'Kategorisiz',
                    'tutar': str(r['tutar'] or _ZERO),
                    'adet': r['adet'],
                }
                for r in top_kategori
            ],
        }
