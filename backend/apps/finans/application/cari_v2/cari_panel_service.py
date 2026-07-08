"""
Cari v2 — Türe özel panel servisi.

Her cari türü için (müşteri, tedarikçi, karma, gelir hesabı, gider hesabı,
diğer) ön planda gösterilecek metrik ve grafik verilerini üretir.
Tüm hesaplamalar burada yapılır.
"""
from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Count, F, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.finans.application.selectors.cari_hesap_selector import CariHesapSelector
from apps.finans.application.cari_v2.cari_risk_service import hesapla_risk
from apps.finans.constants.cari_types import CariHareketTuru, CariHesapTuru
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository


class CariPanelService:
    def __init__(self):
        self.selector = CariHesapSelector()
        self.repo = CariHesapRepository

    def _islem(self, hesap_id):
        return self.selector._islem_totals_map([hesap_id]).get(hesap_id, {})

    def _aylik_seri(self, qs, tarih_alani, tutar_alani, ay_sayisi=12):
        bugun = timezone.localdate()
        ilk_ay = (bugun.replace(day=1) - timedelta(days=ay_sayisi * 31)).replace(day=1)
        rows = (
            qs.filter(**{f'{tarih_alani}__gte': ilk_ay})
            .annotate(ay=TruncMonth(tarih_alani))
            .values('ay')
            .annotate(toplam=Sum(tutar_alani))
            .order_by('ay')
        )
        return [
            {'ay': r['ay'].strftime('%Y-%m'), 'toplam': float(r['toplam'] or 0)}
            for r in rows if r['ay']
        ]

    def _kategori_dagilim(self, qs, kategori_ad_alani, tutar_alani):
        rows = (
            qs.values(kategori_ad_alani)
            .annotate(toplam=Sum(tutar_alani), adet=Count('id'))
            .order_by('-toplam')
        )
        return [
            {
                'kategori': r[kategori_ad_alani] or 'Kategorisiz',
                'toplam': float(r['toplam'] or 0),
                'adet': r['adet'],
            }
            for r in rows
        ]

    def header(self, hesap_id):
        """Detay üst bölümü: kart + durum + net bakiye + risk + vade."""
        ozet = self.selector.cari_ozet(hesap_id)
        if not ozet:
            return None
        hesap = self.repo.get_by_id(hesap_id)
        acik_borc = float(hesap.acik_borc)
        risk = hesapla_risk(
            acik_borc, float(hesap.risk_limiti or 0), float(ozet['vadesi_gecmis']),
        )
        ozet.update({
            'acik_borc': acik_borc,
            'acik_alacak': float(hesap.acik_alacak),
            'risk_limiti': float(hesap.risk_limiti or 0),
            'kategori': hesap.kategori,
            'aktif_mi': hesap.aktif_mi,
            'etiketler': [
                {'id': e.id, 'ad': e.ad, 'renk': e.renk}
                for e in hesap.etiketler.all()
            ],
            **risk,
        })
        return ozet

    def panel(self, hesap_id):
        """Türe göre panel verisi."""
        hesap = self.repo.get_by_id(hesap_id)
        if not hesap:
            return None
        tur = hesap.hesap_turu
        islem = self._islem(hesap_id)

        base = {
            'hesap_turu': tur,
            'panel_tipi': tur,
        }

        if tur in (CariHesapTuru.MUSTERI, CariHesapTuru.KARMA, CariHesapTuru.GELIR_HESABI):
            base['musteri'] = self._musteri_panel(hesap, islem)
        if tur in (CariHesapTuru.TEDARIKCI, CariHesapTuru.KARMA, CariHesapTuru.GIDER_HESABI):
            base['tedarikci'] = self._tedarikci_panel(hesap, islem)
        if tur == CariHesapTuru.GELIR_HESABI:
            base['gelir'] = self._gelir_panel(hesap)
        if tur == CariHesapTuru.GIDER_HESABI:
            base['gider'] = self._gider_panel(hesap)
        if tur == CariHesapTuru.KARMA:
            base['net'] = {
                'net_bakiye': float(hesap.bakiye),
                'bakiye_durumu': hesap.bakiye_durumu,
                'acik_borc': float(hesap.acik_borc),
                'acik_alacak': float(hesap.acik_alacak),
            }
        if tur == CariHesapTuru.DIGER:
            base['diger'] = {
                'net_bakiye': float(hesap.bakiye),
                'toplam_borc': float(hesap.toplam_borc),
                'toplam_alacak': float(hesap.toplam_alacak),
                'bakiye_durumu': hesap.bakiye_durumu,
            }
        return base

    def _musteri_panel(self, hesap, islem):
        gelir_qs = GelirKaydi.objects.filter(cari_hesap=hesap)
        onayli = gelir_qs.filter(durum__in=['onaylandi', 'kismi_tahsil', 'tahsil_edildi'])
        return {
            'toplam_satis': islem.get(CariHareketTuru.SATIS, 0),
            'toplam_tahsilat': islem.get(CariHareketTuru.TAHSILAT, 0),
            'acik_alacak': float(hesap.acik_alacak),
            'son_odeme_tarihi': self._son_hareket_tarihi(hesap, CariHareketTuru.TAHSILAT),
            'satis_analizi': self._aylik_seri(
                onayli, 'fatura_tarihi', 'net_tutar',
            ),
        }

    def _tedarikci_panel(self, hesap, islem):
        gider_qs = GiderKaydi.objects.filter(cari_hesap=hesap)
        onayli = gider_qs.filter(durum__in=['onaylandi', 'kismi_odendi', 'odendi'])
        return {
            'toplam_alis': islem.get(CariHareketTuru.ALIS, 0),
            'toplam_odeme': islem.get(CariHareketTuru.ODEME, 0),
            'acik_borc': float(hesap.acik_borc),
            'son_alis_tarihi': self._son_hareket_tarihi(hesap, CariHareketTuru.ALIS),
            'tedarik_analizi': self._aylik_seri(
                onayli, 'fatura_tarihi', 'net_tutar',
            ),
        }

    def _gelir_panel(self, hesap):
        gelir_qs = GelirKaydi.objects.filter(cari_hesap=hesap).exclude(durum='iptal')
        agg = gelir_qs.aggregate(
            toplam=Sum('net_tutar'),
            tahsil=Sum('tahsil_edilen'),
        )
        toplam = float(agg['toplam'] or 0)
        tahsil = float(agg['tahsil'] or 0)
        return {
            'toplam_gelir': toplam,
            'tahsil_edilen': tahsil,
            'bekleyen_gelir': round(toplam - tahsil, 2),
            'aylik_grafik': self._aylik_seri(gelir_qs, 'fatura_tarihi', 'net_tutar'),
            'kategori_analizi': self._kategori_dagilim(
                gelir_qs, 'gelir_kategorisi__ad', 'net_tutar',
            ),
            'son_hareketler': self._son_gelirler(hesap),
        }

    def _gider_panel(self, hesap):
        gider_qs = GiderKaydi.objects.filter(cari_hesap=hesap).exclude(durum='iptal')
        agg = gider_qs.aggregate(
            toplam=Sum('net_tutar'),
            odenen=Sum('odenen_toplam'),
        )
        toplam = float(agg['toplam'] or 0)
        odenen = float(agg['odenen'] or 0)
        onay_bekleyen = float(
            gider_qs.filter(durum='onay_bekliyor').aggregate(t=Sum('net_tutar'))['t'] or 0
        )
        return {
            'toplam_gider': toplam,
            'odenen': odenen,
            'kalan': round(toplam - odenen, 2),
            'onay_bekleyen': onay_bekleyen,
            'aylik_grafik': self._aylik_seri(gider_qs, 'fatura_tarihi', 'net_tutar'),
            'kategori_analizi': self._kategori_dagilim(
                gider_qs, 'gider_kategorisi__ad', 'net_tutar',
            ),
            'son_hareketler': self._son_giderler(hesap),
        }

    def _son_hareket_tarihi(self, hesap, islem_turu):
        h = (
            hesap.hareketler.filter(islem_turu=islem_turu)
            .order_by('-islem_tarihi', '-created_at')
            .first()
        )
        return h.islem_tarihi.isoformat() if h else None

    def _son_gelirler(self, hesap, limit=10):
        rows = (
            GelirKaydi.objects.filter(cari_hesap=hesap)
            .exclude(durum='iptal')
            .order_by('-fatura_tarihi', '-created_at')[:limit]
        )
        return [
            {
                'id': g.id,
                'fatura_no': g.fatura_no,
                'fatura_tarihi': g.fatura_tarihi.isoformat(),
                'net_tutar': float(g.net_tutar),
                'tahsil_edilen': float(g.tahsil_edilen),
                'kalan': float(g.kalan_tutar),
                'durum': g.durum,
                'aciklama': g.aciklama,
            }
            for g in rows
        ]

    def _son_giderler(self, hesap, limit=10):
        rows = (
            GiderKaydi.objects.filter(cari_hesap=hesap)
            .exclude(durum='iptal')
            .order_by('-fatura_tarihi', '-created_at')[:limit]
        )
        return [
            {
                'id': g.id,
                'fatura_no': g.fatura_no,
                'fatura_tarihi': g.fatura_tarihi.isoformat(),
                'net_tutar': float(g.net_tutar),
                'odenen_toplam': float(g.odenen_toplam),
                'kalan': float(g.kalan_tutar),
                'durum': g.durum,
                'aciklama': g.aciklama,
            }
            for g in rows
        ]
