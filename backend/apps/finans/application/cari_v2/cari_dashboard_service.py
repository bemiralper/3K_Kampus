"""
Cari v2 — Dashboard özet kartları servisi.

Listeye girmeden gösterilen özet kartlarını üretir. Tüm toplamlar
CariHesap / CariHareket verisinden merkezi olarak hesaplanır.
"""
from __future__ import annotations

from datetime import date

from django.db.models import (
    Case,
    Count,
    DecimalField,
    ExpressionWrapper,
    F,
    Q,
    Sum,
    Value,
    When,
)
from django.utils import timezone

from apps.finans.application.cari_v2.cari_risk_service import hesapla_risk, riskli_mi
from apps.finans.application.selectors.cari_hesap_selector import CariHesapSelector
from apps.finans.constants.cari_types import CariHareketTuru
from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.domain.cari_hesap import CariHesap

_DEC = DecimalField(max_digits=15, decimal_places=2)


class CariDashboardService:
    def __init__(self):
        self.selector = CariHesapSelector()

    def _ay_araligi(self, bugun: date):
        ilk = bugun.replace(day=1)
        return ilk, bugun

    def summary(self, kurum_id, sube_id=None):
        qs = CariHesap.objects.filter(kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)

        qs = qs.annotate(
            net_bakiye=ExpressionWrapper(
                F('toplam_borc') - F('toplam_alacak'), output_field=_DEC,
            ),
        )

        agg = qs.aggregate(
            toplam=Count('id'),
            aktif=Count('id', filter=Q(aktif_mi=True)),
            pasif=Count('id', filter=Q(aktif_mi=False)),
            borclu=Count('id', filter=Q(net_bakiye__lt=0)),
            alacakli=Count('id', filter=Q(net_bakiye__gt=0)),
            dengede=Count('id', filter=Q(net_bakiye=0)),
            toplam_acik_alacak=Sum(
                Case(
                    When(net_bakiye__gt=0, then=F('net_bakiye')),
                    default=Value(0),
                    output_field=_DEC,
                )
            ),
            toplam_acik_borc=Sum(
                Case(
                    When(net_bakiye__lt=0, then=F('net_bakiye') * Value(-1)),
                    default=Value(0),
                    output_field=_DEC,
                )
            ),
        )

        # Riskli cari sayısı
        riskli_sayisi = self._riskli_sayisi(qs)

        # Bu ay tahsilat / ödeme (cari hareketlerden)
        bugun = timezone.localdate()
        ilk, son = self._ay_araligi(bugun)
        hareket_qs = CariHareket.objects.filter(
            kurum_id=kurum_id,
            islem_tarihi__gte=ilk,
            islem_tarihi__lte=son,
        )
        if sube_id:
            hareket_qs = hareket_qs.filter(sube_id=sube_id)

        ay = hareket_qs.aggregate(
            bu_ay_tahsilat=Sum(
                'tutar', filter=Q(islem_turu=CariHareketTuru.TAHSILAT)
            ),
            bu_ay_odeme=Sum(
                'tutar', filter=Q(islem_turu=CariHareketTuru.ODEME)
            ),
        )

        return {
            'toplam_cari': agg['toplam'] or 0,
            'aktif_cari': agg['aktif'] or 0,
            'pasif_cari': agg['pasif'] or 0,
            'borclu_cari': agg['borclu'] or 0,
            'alacakli_cari': agg['alacakli'] or 0,
            'dengede_cari': agg['dengede'] or 0,
            'riskli_cari': riskli_sayisi,
            'bu_ay_tahsilat': float(ay['bu_ay_tahsilat'] or 0),
            'bu_ay_odeme': float(ay['bu_ay_odeme'] or 0),
            'bekleyen_tahsilat': float(agg['toplam_acik_alacak'] or 0),
            'bekleyen_odeme': float(agg['toplam_acik_borc'] or 0),
        }

    def _riskli_sayisi(self, qs):
        rows = list(
            qs.annotate(
                f_acik_borc=Case(
                    When(net_bakiye__lt=0, then=F('net_bakiye') * Value(-1)),
                    default=Value(0),
                    output_field=_DEC,
                )
            ).values('id', 'f_acik_borc', 'risk_limiti')
        )
        ids = [r['id'] for r in rows]
        if not ids:
            return 0
        today = timezone.localdate()
        (_vg_o, vgc_o, _gv_o, _vg_t, vgc_t, _gv_t) = self.selector._vade_aging_maps(
            ids, today,
        )
        sayac = 0
        for r in rows:
            hid = r['id']
            vadesi_gecmis = float(vgc_o.get(hid, 0)) + float(vgc_t.get(hid, 0))
            risk = hesapla_risk(
                float(r['f_acik_borc'] or 0),
                float(r['risk_limiti'] or 0),
                vadesi_gecmis,
            )
            if riskli_mi(risk['risk_durumu']):
                sayac += 1
        return sayac
