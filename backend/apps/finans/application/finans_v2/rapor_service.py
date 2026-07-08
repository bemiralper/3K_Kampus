"""
Gelir & Gider v2 — Raporlama servisi.

Desteklenen raporlar (slug):
  gelir-analizi, gider-analizi, kategori-analizi, cari-analizi,
  aylik-karsilastirma, yillik-karsilastirma, trend-analizi, kdv-analizi,
  nakit-akisi, finans-ozeti, vade-borc

Her rapor {baslik, kpis, seriler, columns, rows, ozet} yapısında döner ve
ortak export altyapısı (PDF/Excel/CSV) tarafından kullanılabilir.
Tüm hesaplama backend'de yapılır.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth, TruncYear
from django.utils import timezone

from apps.finans.constants.cari_types import GelirDurum
from apps.finans.constants.gider_types import GiderDurum, KdvOrani, OdemeDurum
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.application.finans_v2.filters import parse_date_safe

SLUGS = {
    'gelir-analizi', 'gider-analizi', 'kategori-analizi', 'cari-analizi',
    'aylik-karsilastirma', 'yillik-karsilastirma', 'trend-analizi',
    'kdv-analizi', 'nakit-akisi', 'finans-ozeti', 'vade-borc',
}

_AY_KISA = ['', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
            'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']


def _f(v):
    return float(v or 0)


class FinansV2RaporService:
    def build(self, slug, kurum_id, sube_id=None, params=None):
        params = params or {}
        method = {
            'gelir-analizi': self.gelir_analizi,
            'gider-analizi': self.gider_analizi,
            'kategori-analizi': self.kategori_analizi,
            'cari-analizi': self.cari_analizi,
            'aylik-karsilastirma': self.aylik_karsilastirma,
            'yillik-karsilastirma': self.yillik_karsilastirma,
            'trend-analizi': self.trend_analizi,
            'kdv-analizi': self.kdv_analizi,
            'nakit-akisi': self.nakit_akisi,
            'finans-ozeti': self.finans_ozeti,
            'vade-borc': self.vade_borc,
        }.get(slug)
        if not method:
            return None
        return method(kurum_id, sube_id, params)
    # ─── Yardımcılar ──────────────────────────────
    def _gelir_qs(self, kurum_id, sube_id, params):
        qs = GelirKaydi.objects.filter(kurum_id=kurum_id).exclude(durum=GelirDurum.IPTAL)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        return self._tarih(qs, params, 'fatura_tarihi')

    def _gider_qs(self, kurum_id, sube_id, params):
        qs = GiderKaydi.objects.filter(kurum_id=kurum_id).exclude(durum=GiderDurum.IPTAL)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        return self._tarih(qs, params, 'fatura_tarihi')

    @staticmethod
    def _tarih(qs, params, alan):
        bas = parse_date_safe(params.get('baslangic'))
        if bas:
            qs = qs.filter(**{f'{alan}__gte': bas})
        bit = parse_date_safe(params.get('bitis'))
        if bit:
            qs = qs.filter(**{f'{alan}__lte': bit})
        return qs

    @staticmethod
    def _aylik(qs, tarih_alan, tutar_alan):
        rows = (
            qs.annotate(ay=TruncMonth(tarih_alan))
            .values('ay')
            .annotate(deger=Sum(tutar_alan))
            .order_by('ay')
        )
        out = []
        for r in rows:
            ay = r['ay']
            if not ay:
                continue
            out.append({
                'ay': ay.strftime('%Y-%m'),
                'label': f'{_AY_KISA[ay.month]} {ay.year}',
                'deger': _f(r['deger']),
            })
        return out

    # ─── 1. Gelir Analizi ─────────────────────────
    def gelir_analizi(self, kurum_id, sube_id, params):
        qs = self._gelir_qs(kurum_id, sube_id, params)
        agg = qs.aggregate(toplam=Sum('net_tutar'), tahsil=Sum('tahsil_edilen'),
                           kdv=Sum('kdv_tutar'), adet=Count('id'))
        toplam, tahsil = _f(agg['toplam']), _f(agg['tahsil'])
        rows = [
            {'kategori': r['gelir_kategorisi__ad'] or 'Kategorisiz',
             'toplam': _f(r['t']), 'adet': r['adet']}
            for r in qs.values('gelir_kategorisi__ad')
            .annotate(t=Sum('net_tutar'), adet=Count('id')).order_by('-t')
        ]
        return {
            'baslik': 'Gelir Analizi',
            'kpis': [
                {'label': 'Toplam Gelir', 'value': toplam, 'format': 'tl'},
                {'label': 'Tahsil Edilen', 'value': tahsil, 'format': 'tl'},
                {'label': 'Bekleyen', 'value': round(toplam - tahsil, 2), 'format': 'tl'},
                {'label': 'Kayıt Sayısı', 'value': agg['adet'] or 0, 'format': 'int'},
            ],
            'seriler': {
                'aylik': self._aylik(qs, 'fatura_tarihi', 'net_tutar'),
                'dagitim': [{'label': r['kategori'], 'deger': r['toplam']} for r in rows[:8]],
            },
            'columns': [
                {'key': 'kategori', 'label': 'Kategori'},
                {'key': 'toplam', 'label': 'Tutar', 'format': 'tl'},
                {'key': 'adet', 'label': 'Adet', 'format': 'int'},
            ],
            'rows': rows,
        }

    # ─── 2. Gider Analizi ─────────────────────────
    def gider_analizi(self, kurum_id, sube_id, params):
        qs = self._gider_qs(kurum_id, sube_id, params)
        agg = qs.aggregate(toplam=Sum('net_tutar'), odenen=Sum('odenen_toplam'),
                           kdv=Sum('kdv_tutar'), adet=Count('id'))
        toplam, odenen = _f(agg['toplam']), _f(agg['odenen'])
        rows = [
            {'kategori': r['gider_kategorisi__ad'] or 'Kategorisiz',
             'toplam': _f(r['t']), 'adet': r['adet']}
            for r in qs.values('gider_kategorisi__ad')
            .annotate(t=Sum('net_tutar'), adet=Count('id')).order_by('-t')
        ]
        return {
            'baslik': 'Gider Analizi',
            'kpis': [
                {'label': 'Toplam Gider', 'value': toplam, 'format': 'tl'},
                {'label': 'Ödenen', 'value': odenen, 'format': 'tl'},
                {'label': 'Kalan', 'value': round(toplam - odenen, 2), 'format': 'tl'},
                {'label': 'Kayıt Sayısı', 'value': agg['adet'] or 0, 'format': 'int'},
            ],
            'seriler': {
                'aylik': self._aylik(qs, 'fatura_tarihi', 'net_tutar'),
                'dagitim': [{'label': r['kategori'], 'deger': r['toplam']} for r in rows[:8]],
            },
            'columns': [
                {'key': 'kategori', 'label': 'Kategori'},
                {'key': 'toplam', 'label': 'Tutar', 'format': 'tl'},
                {'key': 'adet', 'label': 'Adet', 'format': 'int'},
            ],
            'rows': rows,
        }

    # ─── 3. Kategori Analizi (modul parametreli) ──
    def kategori_analizi(self, kurum_id, sube_id, params):
        modul = params.get('modul', 'gelir')
        if modul == 'gider':
            qs = self._gider_qs(kurum_id, sube_id, params)
            alan = 'gider_kategorisi__ad'
            baslik = 'Gider Kategori Analizi'
        else:
            qs = self._gelir_qs(kurum_id, sube_id, params)
            alan = 'gelir_kategorisi__ad'
            baslik = 'Gelir Kategori Analizi'

        toplam = _f(qs.aggregate(t=Sum('net_tutar'))['t'])
        rows = []
        for r in qs.values(alan).annotate(t=Sum('net_tutar'), adet=Count('id')).order_by('-t'):
            tutar = _f(r['t'])
            rows.append({
                'kategori': r[alan] or 'Kategorisiz',
                'toplam': tutar,
                'adet': r['adet'],
                'yuzde': round(tutar / toplam * 100, 2) if toplam else 0,
            })
        return {
            'baslik': baslik,
            'kpis': [
                {'label': 'Toplam', 'value': toplam, 'format': 'tl'},
                {'label': 'Kategori Sayısı', 'value': len(rows), 'format': 'int'},
            ],
            'seriler': {'dagitim': [{'label': r['kategori'], 'deger': r['toplam']} for r in rows[:10]]},
            'columns': [
                {'key': 'kategori', 'label': 'Kategori'},
                {'key': 'toplam', 'label': 'Tutar', 'format': 'tl'},
                {'key': 'adet', 'label': 'Adet', 'format': 'int'},
                {'key': 'yuzde', 'label': 'Pay (%)', 'format': 'pct'},
            ],
            'rows': rows,
        }

    # ─── 4. Cari Bazlı Analiz ─────────────────────
    def cari_analizi(self, kurum_id, sube_id, params):
        gelir_qs = self._gelir_qs(kurum_id, sube_id, params)
        gider_qs = self._gider_qs(kurum_id, sube_id, params)

        gelir_map = {
            r['cari_hesap__unvan']: _f(r['t'])
            for r in gelir_qs.values('cari_hesap__unvan').annotate(t=Sum('net_tutar'))
        }
        gider_map = {
            r['cari_hesap__unvan']: _f(r['t'])
            for r in gider_qs.values('cari_hesap__unvan').annotate(t=Sum('net_tutar'))
        }
        cariler = set(gelir_map) | set(gider_map)
        rows = []
        for c in cariler:
            g = gelir_map.get(c, 0)
            d = gider_map.get(c, 0)
            rows.append({
                'cari': c or 'Tanımsız',
                'gelir': round(g, 2),
                'gider': round(d, 2),
                'net': round(g - d, 2),
            })
        rows.sort(key=lambda r: r['gelir'] + r['gider'], reverse=True)
        return {
            'baslik': 'Cari Bazlı Analiz',
            'kpis': [
                {'label': 'Toplam Gelir', 'value': round(sum(gelir_map.values()), 2), 'format': 'tl'},
                {'label': 'Toplam Gider', 'value': round(sum(gider_map.values()), 2), 'format': 'tl'},
                {'label': 'Cari Sayısı', 'value': len(cariler), 'format': 'int'},
            ],
            'columns': [
                {'key': 'cari', 'label': 'Cari Hesap'},
                {'key': 'gelir', 'label': 'Gelir', 'format': 'tl'},
                {'key': 'gider', 'label': 'Gider', 'format': 'tl'},
                {'key': 'net', 'label': 'Net', 'format': 'tl'},
            ],
            'rows': rows,
        }

    # ─── 5. Aylık Karşılaştırma (gelir vs gider) ──
    def aylik_karsilastirma(self, kurum_id, sube_id, params):
        return self._karsilastirma(kurum_id, sube_id, params, TruncMonth, 'Aylık Karşılaştırma')

    # ─── 6. Yıllık Karşılaştırma ──────────────────
    def yillik_karsilastirma(self, kurum_id, sube_id, params):
        return self._karsilastirma(kurum_id, sube_id, params, TruncYear, 'Yıllık Karşılaştırma')

    def _karsilastirma(self, kurum_id, sube_id, params, trunc, baslik):
        gelir_qs = self._gelir_qs(kurum_id, sube_id, params)
        gider_qs = self._gider_qs(kurum_id, sube_id, params)

        def bucket(qs):
            out = {}
            for r in (qs.annotate(p=trunc('fatura_tarihi')).values('p')
                      .annotate(t=Sum('net_tutar')).order_by('p')):
                if r['p']:
                    out[r['p']] = _f(r['t'])
            return out

        gmap, dmap = bucket(gelir_qs), bucket(gider_qs)
        keys = sorted(set(gmap) | set(dmap))
        aylik = trunc is TruncMonth
        rows = []
        for k in keys:
            g, d = gmap.get(k, 0), dmap.get(k, 0)
            label = f'{_AY_KISA[k.month]} {k.year}' if aylik else str(k.year)
            rows.append({
                'donem': label,
                'gelir': round(g, 2),
                'gider': round(d, 2),
                'net': round(g - d, 2),
            })
        return {
            'baslik': baslik,
            'kpis': [
                {'label': 'Toplam Gelir', 'value': round(sum(gmap.values()), 2), 'format': 'tl'},
                {'label': 'Toplam Gider', 'value': round(sum(dmap.values()), 2), 'format': 'tl'},
                {'label': 'Net', 'value': round(sum(gmap.values()) - sum(dmap.values()), 2), 'format': 'tl'},
            ],
            'seriler': {'karsilastirma': rows},
            'columns': [
                {'key': 'donem', 'label': 'Dönem'},
                {'key': 'gelir', 'label': 'Gelir', 'format': 'tl'},
                {'key': 'gider', 'label': 'Gider', 'format': 'tl'},
                {'key': 'net', 'label': 'Net', 'format': 'tl'},
            ],
            'rows': rows,
        }

    # ─── 7. Trend Analizi ─────────────────────────
    def trend_analizi(self, kurum_id, sube_id, params):
        data = self._karsilastirma(kurum_id, sube_id, params, TruncMonth, 'Trend Analizi')
        rows = data['rows']
        # kümülatif net
        kumulatif = 0
        for r in rows:
            kumulatif += r['net']
            r['kumulatif_net'] = round(kumulatif, 2)
        data['baslik'] = 'Trend Analizi'
        data['columns'].append({'key': 'kumulatif_net', 'label': 'Kümülatif Net', 'format': 'tl'})
        return data

    # ─── 8. KDV Analizi ───────────────────────────
    def kdv_analizi(self, kurum_id, sube_id, params):
        gelir_qs = self._gelir_qs(kurum_id, sube_id, params)
        gider_qs = self._gider_qs(kurum_id, sube_id, params)

        rows = []
        for oran, label in KdvOrani.CHOICES:
            g = _f(gelir_qs.filter(kdv_orani=oran).aggregate(t=Sum('kdv_tutar'))['t'])
            d = _f(gider_qs.filter(kdv_orani=oran).aggregate(t=Sum('kdv_tutar'))['t'])
            rows.append({
                'oran': label,
                'gelir_kdv': round(g, 2),
                'gider_kdv': round(d, 2),
                'fark': round(g - d, 2),
            })
        toplam_gelir_kdv = _f(gelir_qs.aggregate(t=Sum('kdv_tutar'))['t'])
        toplam_gider_kdv = _f(gider_qs.aggregate(t=Sum('kdv_tutar'))['t'])
        return {
            'baslik': 'KDV Analizi',
            'kpis': [
                {'label': 'Hesaplanan KDV (Gelir)', 'value': round(toplam_gelir_kdv, 2), 'format': 'tl'},
                {'label': 'İndirilecek KDV (Gider)', 'value': round(toplam_gider_kdv, 2), 'format': 'tl'},
                {'label': 'KDV Farkı', 'value': round(toplam_gelir_kdv - toplam_gider_kdv, 2), 'format': 'tl'},
            ],
            'columns': [
                {'key': 'oran', 'label': 'KDV Oranı'},
                {'key': 'gelir_kdv', 'label': 'Gelir KDV', 'format': 'tl'},
                {'key': 'gider_kdv', 'label': 'Gider KDV', 'format': 'tl'},
                {'key': 'fark', 'label': 'Fark', 'format': 'tl'},
            ],
            'rows': rows,
        }

    # ─── 9. Nakit Akışı ───────────────────────────
    def nakit_akisi(self, kurum_id, sube_id, params):
        tahsilat_qs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id, durum=OdemeDurum.TAMAMLANDI,
        )
        odeme_qs = GiderOdeme.objects.filter(
            gider_kaydi__kurum_id=kurum_id, durum=OdemeDurum.TAMAMLANDI,
        )
        if sube_id:
            tahsilat_qs = tahsilat_qs.filter(gelir_kaydi__sube_id=sube_id)
            odeme_qs = odeme_qs.filter(gider_kaydi__sube_id=sube_id)
        tahsilat_qs = self._tarih(tahsilat_qs, params, 'tahsilat_tarihi')
        odeme_qs = self._tarih(odeme_qs, params, 'odeme_tarihi')

        def bucket(qs, alan):
            out = {}
            for r in (qs.annotate(ay=TruncMonth(alan)).values('ay')
                      .annotate(t=Sum('tutar')).order_by('ay')):
                if r['ay']:
                    out[r['ay']] = _f(r['t'])
            return out

        gmap = bucket(tahsilat_qs, 'tahsilat_tarihi')
        dmap = bucket(odeme_qs, 'odeme_tarihi')
        keys = sorted(set(gmap) | set(dmap))
        rows = []
        kumulatif = 0
        for k in keys:
            giris, cikis = gmap.get(k, 0), dmap.get(k, 0)
            net = giris - cikis
            kumulatif += net
            rows.append({
                'donem': f'{_AY_KISA[k.month]} {k.year}',
                'giris': round(giris, 2),
                'cikis': round(cikis, 2),
                'net': round(net, 2),
                'kumulatif': round(kumulatif, 2),
            })
        toplam_giris = round(sum(gmap.values()), 2)
        toplam_cikis = round(sum(dmap.values()), 2)
        return {
            'baslik': 'Nakit Akışı',
            'kpis': [
                {'label': 'Nakit Girişi', 'value': toplam_giris, 'format': 'tl'},
                {'label': 'Nakit Çıkışı', 'value': toplam_cikis, 'format': 'tl'},
                {'label': 'Net Nakit Akışı', 'value': round(toplam_giris - toplam_cikis, 2), 'format': 'tl'},
            ],
            'seriler': {'nakit': rows},
            'columns': [
                {'key': 'donem', 'label': 'Dönem'},
                {'key': 'giris', 'label': 'Giriş', 'format': 'tl'},
                {'key': 'cikis', 'label': 'Çıkış', 'format': 'tl'},
                {'key': 'net', 'label': 'Net', 'format': 'tl'},
                {'key': 'kumulatif', 'label': 'Kümülatif', 'format': 'tl'},
            ],
            'rows': rows,
        }

    # ─── 10. Finans Özeti ─────────────────────────
    def finans_ozeti(self, kurum_id, sube_id, params):
        gelir_qs = self._gelir_qs(kurum_id, sube_id, params)
        gider_qs = self._gider_qs(kurum_id, sube_id, params)

        gelir_agg = gelir_qs.aggregate(t=Sum('net_tutar'), tahsil=Sum('tahsil_edilen'), adet=Count('id'))
        gider_agg = gider_qs.aggregate(t=Sum('net_tutar'), odenen=Sum('odenen_toplam'), adet=Count('id'))

        toplam_gelir = _f(gelir_agg['t'])
        toplam_gider = _f(gider_agg['t'])
        tahsil = _f(gelir_agg['tahsil'])
        odenen = _f(gider_agg['odenen'])

        aylik_gelir = {r['ay']: r['deger'] for r in self._aylik(gelir_qs, 'fatura_tarihi', 'net_tutar')}
        aylik_gider = {r['ay']: r['deger'] for r in self._aylik(gider_qs, 'fatura_tarihi', 'net_tutar')}
        aylar = sorted(set(aylik_gelir) | set(aylik_gider))
        seri = [
            {
                'donem': a,
                'gelir': round(aylik_gelir.get(a, 0), 2),
                'gider': round(aylik_gider.get(a, 0), 2),
                'net': round(aylik_gelir.get(a, 0) - aylik_gider.get(a, 0), 2),
            }
            for a in aylar
        ]

        rows = [
            {'kalem': 'Toplam Gelir', 'tutar': round(toplam_gelir, 2)},
            {'kalem': 'Tahsil Edilen', 'tutar': round(tahsil, 2)},
            {'kalem': 'Bekleyen Tahsilat', 'tutar': round(toplam_gelir - tahsil, 2)},
            {'kalem': 'Toplam Gider', 'tutar': round(toplam_gider, 2)},
            {'kalem': 'Ödenen', 'tutar': round(odenen, 2)},
            {'kalem': 'Bekleyen Ödeme', 'tutar': round(toplam_gider - odenen, 2)},
            {'kalem': 'Net Kâr/Zarar', 'tutar': round(toplam_gelir - toplam_gider, 2)},
        ]
        return {
            'baslik': 'Finans Özeti',
            'kpis': [
                {'label': 'Toplam Gelir', 'value': round(toplam_gelir, 2), 'format': 'tl'},
                {'label': 'Toplam Gider', 'value': round(toplam_gider, 2), 'format': 'tl'},
                {'label': 'Net Kâr/Zarar', 'value': round(toplam_gelir - toplam_gider, 2), 'format': 'tl'},
                {'label': 'Gelir/Gider Kayıt', 'value': (gelir_agg['adet'] or 0) + (gider_agg['adet'] or 0), 'format': 'int'},
            ],
            'seriler': {'ozet': seri},
            'columns': [
                {'key': 'kalem', 'label': 'Kalem'},
                {'key': 'tutar', 'label': 'Tutar', 'format': 'tl'},
            ],
            'rows': rows,
        }

    # ─── 11. Vade Borç Takibi (ödenmemiş gider taksitleri) ──
    def vade_borc(self, kurum_id, sube_id, params):
        """Cari tedarikçilere olan vadesi gelen/gelecek borçlar — gider taksit + verilen çek/senet."""
        from collections import defaultdict
        from datetime import timedelta

        from apps.finans.infrastructure.gider_repository import GiderTaksitRepository
        from apps.odeme_takip.domain.cek_senet import CekSenetDetay, CekSenetDurum, CekSenetYon

        today = timezone.localdate()
        gorunum = (params.get('gorunum') or 'detay').lower()
        vade_durumu = (params.get('vade_durumu') or 'tumu').lower()
        bas = parse_date_safe(params.get('baslangic'))
        bit = parse_date_safe(params.get('bitis'))

        qs = GiderTaksitRepository._odenecek_taksit_qs(kurum_id, sube_id)
        qs = qs.select_related(
            'gider_kaydi',
            'gider_kaydi__cari_hesap',
            'gider_kaydi__gider_kategorisi',
            'gider_kaydi__odeme_yontemi',
        )

        if bas:
            qs = qs.filter(vade_tarihi__gte=bas)
        if bit:
            qs = qs.filter(vade_tarihi__lte=bit)

        if vade_durumu == 'gecmis':
            qs = qs.filter(vade_tarihi__lt=today)
        elif vade_durumu == 'gelen':
            qs = qs.filter(
                vade_tarihi__gte=today,
                vade_tarihi__lte=today + timedelta(days=30),
            )
        elif vade_durumu == 'gelecek':
            qs = qs.filter(vade_tarihi__gt=today)

        taksitler = list(qs.order_by('vade_tarihi', 'gider_kaydi__cari_hesap__unvan'))

        # Verilen çek/senet vadeleri (aktif, ödenmemiş)
        cek_qs = CekSenetDetay.objects.filter(
            kurum_id=kurum_id,
            yon=CekSenetYon.VERILEN,
            durum__in=CekSenetDurum.AKTIF_DURUMLAR,
        ).select_related('cari_hesap', 'odeme_yontemi')
        if sube_id:
            cek_qs = cek_qs.filter(sube_id=sube_id)
        if bas:
            cek_qs = cek_qs.filter(vade_tarihi__gte=bas)
        if bit:
            cek_qs = cek_qs.filter(vade_tarihi__lte=bit)
        if vade_durumu == 'gecmis':
            cek_qs = cek_qs.filter(vade_tarihi__lt=today)
        elif vade_durumu == 'gelen':
            cek_qs = cek_qs.filter(
                vade_tarihi__gte=today,
                vade_tarihi__lte=today + timedelta(days=30),
            )
        elif vade_durumu == 'gelecek':
            cek_qs = cek_qs.filter(vade_tarihi__gt=today)
        verilen_cekler = list(cek_qs.order_by('vade_tarihi', 'cari_hesap__unvan'))

        def _vade_durum_label(vade):
            if vade < today:
                return 'Vadesi Geçmiş'
            if vade <= today + timedelta(days=30):
                return 'Vadesi Gelen'
            return 'Gelecek Vadeli'

        toplam_kalan = 0.0
        vadesi_gecmis = 0.0
        vadesi_gelen = 0.0
        for t in taksitler:
            kalan = _f(t.kalan_tutar)
            toplam_kalan += kalan
            if t.vade_tarihi < today:
                vadesi_gecmis += kalan
            elif t.vade_tarihi <= today + timedelta(days=30):
                vadesi_gelen += kalan
        for detay in verilen_cekler:
            kalan = float(detay.tutar or 0)
            toplam_kalan += kalan
            if detay.vade_tarihi < today:
                vadesi_gecmis += kalan
            elif detay.vade_tarihi <= today + timedelta(days=30):
                vadesi_gelen += kalan

        if gorunum == 'ozet':
            buckets: dict[int, dict] = defaultdict(lambda: {
                'cari': '—',
                'taksit_sayisi': 0,
                'toplam_kalan': 0.0,
                'vadesi_gecmis': 0.0,
                'ilk_vade': None,
                'son_vade': None,
            })
            for t in taksitler:
                cari = t.gider_kaydi.cari_hesap
                cid = cari.id if cari else 0
                b = buckets[cid]
                b['cari'] = cari.unvan if cari else '—'
                kalan = _f(t.kalan_tutar)
                b['taksit_sayisi'] += 1
                b['toplam_kalan'] += kalan
                if t.vade_tarihi < today:
                    b['vadesi_gecmis'] += kalan
                vd = t.vade_tarihi.isoformat()
                if not b['ilk_vade'] or vd < b['ilk_vade']:
                    b['ilk_vade'] = vd
                if not b['son_vade'] or vd > b['son_vade']:
                    b['son_vade'] = vd
            for detay in verilen_cekler:
                cari = detay.cari_hesap
                cid = cari.id if cari else -detay.id
                b = buckets[cid]
                b['cari'] = cari.unvan if cari else '—'
                kalan = float(detay.tutar or 0)
                b['taksit_sayisi'] += 1
                b['toplam_kalan'] += kalan
                if detay.vade_tarihi < today:
                    b['vadesi_gecmis'] += kalan
                vd = detay.vade_tarihi.isoformat()
                if not b['ilk_vade'] or vd < b['ilk_vade']:
                    b['ilk_vade'] = vd
                if not b['son_vade'] or vd > b['son_vade']:
                    b['son_vade'] = vd

            rows = [
                {
                    'cari': v['cari'],
                    'taksit_sayisi': v['taksit_sayisi'],
                    'toplam_kalan': round(v['toplam_kalan'], 2),
                    'vadesi_gecmis': round(v['vadesi_gecmis'], 2),
                    'ilk_vade': v['ilk_vade'],
                    'son_vade': v['son_vade'],
                }
                for v in sorted(buckets.values(), key=lambda x: -x['toplam_kalan'])
            ]
            columns = [
                {'key': 'cari', 'label': 'Cari (Tedarikçi)'},
                {'key': 'taksit_sayisi', 'label': 'Taksit', 'format': 'int'},
                {'key': 'toplam_kalan', 'label': 'Toplam Kalan', 'format': 'tl'},
                {'key': 'vadesi_gecmis', 'label': 'Vadesi Geçmiş', 'format': 'tl'},
                {'key': 'ilk_vade', 'label': 'İlk Vade', 'format': 'date'},
                {'key': 'son_vade', 'label': 'Son Vade', 'format': 'date'},
            ]
            baslik = 'Vade Borç Özet Raporu'
        else:
            rows = []
            for t in taksitler:
                g = t.gider_kaydi
                cari = g.cari_hesap
                kalan = _f(t.kalan_tutar)
                gecikme = (today - t.vade_tarihi).days if t.vade_tarihi < today else 0
                rows.append({
                    'vade_tarihi': t.vade_tarihi.isoformat(),
                    'cari': cari.unvan if cari else '—',
                    'fatura_no': g.fatura_no or f'G-{g.id}',
                    'kategori': g.gider_kategorisi.ad if g.gider_kategorisi else '—',
                    'taksit': f"{t.taksit_no}/{g.taksit_sayisi or 1}",
                    'tutar': round(_f(t.tutar), 2),
                    'odenen': round(_f(t.odenen_tutar), 2),
                    'kalan': round(kalan, 2),
                    'gecikme_gun': gecikme if gecikme > 0 else 0,
                    'durum': _vade_durum_label(t.vade_tarihi),
                    'odeme_yontemi': g.odeme_yontemi.ad if g.odeme_yontemi else '—',
                })
            for detay in verilen_cekler:
                cari = detay.cari_hesap
                kalan = float(detay.tutar or 0)
                gecikme = (today - detay.vade_tarihi).days if detay.vade_tarihi < today else 0
                arac = 'Verilen Çek' if detay.arac_tipi == 'cek' else 'Verilen Senet'
                rows.append({
                    'vade_tarihi': detay.vade_tarihi.isoformat(),
                    'cari': cari.unvan if cari else '—',
                    'fatura_no': detay.cek_senet_no or f'ÇS-{detay.id}',
                    'kategori': arac,
                    'taksit': '—',
                    'tutar': round(kalan, 2),
                    'odenen': 0,
                    'kalan': round(kalan, 2),
                    'gecikme_gun': gecikme if gecikme > 0 else 0,
                    'durum': _vade_durum_label(detay.vade_tarihi),
                    'odeme_yontemi': detay.odeme_yontemi.ad if detay.odeme_yontemi else arac,
                })
            rows.sort(key=lambda r: (r['vade_tarihi'], r['cari']))
            columns = [
                {'key': 'vade_tarihi', 'label': 'Vade', 'format': 'date'},
                {'key': 'cari', 'label': 'Cari (Tedarikçi)'},
                {'key': 'fatura_no', 'label': 'Belge No'},
                {'key': 'kategori', 'label': 'Gider Kategorisi'},
                {'key': 'taksit', 'label': 'Taksit'},
                {'key': 'tutar', 'label': 'Tutar', 'format': 'tl'},
                {'key': 'odenen', 'label': 'Ödenen', 'format': 'tl'},
                {'key': 'kalan', 'label': 'Kalan', 'format': 'tl'},
                {'key': 'gecikme_gun', 'label': 'Gecikme (gün)', 'format': 'int'},
                {'key': 'durum', 'label': 'Vade Durumu'},
                {'key': 'odeme_yontemi', 'label': 'Ödeme Yöntemi'},
            ]
            baslik = 'Vade Borç Detay Raporu'

        cari_sayisi = len({
            *(t.gider_kaydi.cari_hesap_id for t in taksitler if t.gider_kaydi.cari_hesap_id),
            *(d.cari_hesap_id for d in verilen_cekler if d.cari_hesap_id),
        })
        kayit_sayisi = len(taksitler) + len(verilen_cekler)

        return {
            'baslik': baslik,
            'kpis': [
                {'label': 'Toplam Kalan Borç', 'value': round(toplam_kalan, 2), 'format': 'tl'},
                {'label': 'Vadesi Geçmiş', 'value': round(vadesi_gecmis, 2), 'format': 'tl'},
                {'label': 'Vadesi Gelen (30 gün)', 'value': round(vadesi_gelen, 2), 'format': 'tl'},
                {'label': 'Taksit / Çek Sayısı', 'value': kayit_sayisi, 'format': 'int'},
            ],
            'seriler': {
                'vade_dagilim': [
                    {'label': 'Vadesi Geçmiş', 'deger': round(vadesi_gecmis, 2)},
                    {'label': 'Vadesi Gelen', 'deger': round(vadesi_gelen, 2)},
                    {'label': 'Gelecek Vadeli', 'deger': round(toplam_kalan - vadesi_gecmis - vadesi_gelen, 2)},
                ],
            },
            'columns': columns,
            'rows': rows,
            'ozet': {
                'toplam_kalan': round(toplam_kalan, 2),
                'vadesi_gecmis': round(vadesi_gecmis, 2),
                'vadesi_gelen': round(vadesi_gelen, 2),
                'taksit_sayisi': kayit_sayisi,
                'cari_sayisi': cari_sayisi,
            },
        }

