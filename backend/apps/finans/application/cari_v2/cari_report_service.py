"""
Cari v2 — Raporlama servisi.

Desteklenen raporlar (slug):
  ekstre, hesap-ozeti, borc-listesi, alacak-listesi, gelir-analizi,
  gider-analizi, hareket-raporu, yaslandirma, risk-analizi,
  tahsilat-performansi, odeme-performansi

Her rapor {baslik, kpis, seriler, columns, rows, ozet} yapısında döner.
columns/rows dışa aktarma (PDF/Excel/CSV) için kullanılır.
"""
from __future__ import annotations

from django.db.models import Count, F, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.finans.application.cari_balance import net_bakiye
from apps.finans.application.cari_hareket_enrichment import build_cari_hareket_meta
from apps.finans.application.ekstre_balance import (
    compute_devreden_bakiye,
    compute_kapanis_bakiye,
)
from apps.finans.application.cari_v2.cari_risk_service import hesapla_risk
from apps.finans.application.selectors.cari_hesap_selector import CariHesapSelector
from apps.finans.constants.cari_types import CariHareketTuru
from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.infrastructure.cari_hesap_repository import CariHesapRepository

SLUGS = {
    'ekstre', 'hesap-ozeti', 'borc-listesi', 'alacak-listesi',
    'gelir-analizi', 'gider-analizi', 'hareket-raporu', 'yaslandirma',
    'risk-analizi', 'tahsilat-performansi', 'odeme-performansi',
}


def _tl(v):
    return float(v or 0)


class CariReportService:
    def __init__(self):
        self.selector = CariHesapSelector()
        self.repo = CariHesapRepository

    def build(self, slug, kurum_id, sube_id=None, params=None):
        params = params or {}
        method = {
            'ekstre': self.ekstre,
            'hesap-ozeti': self.hesap_ozeti,
            'borc-listesi': self.borc_listesi,
            'alacak-listesi': self.alacak_listesi,
            'gelir-analizi': self.gelir_analizi,
            'gider-analizi': self.gider_analizi,
            'hareket-raporu': self.hareket_raporu,
            'yaslandirma': self.yaslandirma,
            'risk-analizi': self.risk_analizi,
            'tahsilat-performansi': self.tahsilat_performansi,
            'odeme-performansi': self.odeme_performansi,
        }.get(slug)
        if not method:
            return None
        return method(kurum_id, sube_id, params)

    # ─── Yardımcılar ─────────────────────────────
    def _rapor_rows(self, kurum_id, sube_id, params):
        return self.selector.cari_rapor_listesi(
            kurum_id,
            sube_id=sube_id,
            hesap_turu=params.get('hesap_turu'),
            arama=params.get('arama'),
            baslangic=params.get('baslangic'),
            bitis=params.get('bitis'),
        )

    # ─── 1. Ekstre ───────────────────────────────
    def ekstre(self, kurum_id, sube_id, params):
        cari_id = params.get('cari_hesap_id')
        if not cari_id:
            return {'error': 'cari_hesap_id zorunludur.'}
        hesap = self.repo.get_by_id(cari_id)
        if not hesap:
            return {'error': 'Cari hesap bulunamadı.'}

        filtreler = {}
        if params.get('baslangic'):
            filtreler['baslangic'] = params['baslangic']
        if params.get('bitis'):
            filtreler['bitis'] = params['bitis']
        hareketler = list(self.selector.hareketler(cari_id, filtreler=filtreler or None))
        meta = build_cari_hareket_meta(hareketler)

        rows = []
        for h in hareketler:
            km = meta.get((h.kaynak_tip, h.kaynak_id), {})
            rows.append({
                'islem_tarihi': h.islem_tarihi.isoformat(),
                'islem_turu': h.get_islem_turu_display(),
                'aciklama': h.aciklama,
                'belge_no': h.belge_no,
                'borc': _tl(h.tutar) if h.yon == 'borc' else 0,
                'alacak': _tl(h.tutar) if h.yon == 'alacak' else 0,
                'bakiye': _tl(h.bakiye_sonrasi),
                'kategori': km.get('kategori_adi') or '',
            })

        row_dicts = [
            {
                'islem_tarihi': h.islem_tarihi.isoformat(),
                'created_at': h.created_at.isoformat() if h.created_at else '',
                'id': h.id,
                'bakiye_oncesi': _tl(h.bakiye_oncesi),
                'bakiye_sonrasi': _tl(h.bakiye_sonrasi),
                'borc_oncesi': _tl(h.borc_oncesi),
                'alacak_oncesi': _tl(h.alacak_oncesi),
                'borc_sonrasi': _tl(h.borc_sonrasi),
                'alacak_sonrasi': _tl(h.alacak_sonrasi),
            }
            for h in hareketler
        ]
        devreden = float(compute_devreden_bakiye(row_dicts))
        kapanis = float(compute_kapanis_bakiye(row_dicts))

        return {
            'baslik': f'Cari Ekstre — {hesap.gorunen_ad}',
            'kpis': [
                {'label': 'Devreden Bakiye', 'value': devreden, 'format': 'tl'},
                {'label': 'Kapanış Bakiyesi', 'value': kapanis, 'format': 'tl'},
                {'label': 'Hareket Sayısı', 'value': len(rows), 'format': 'int'},
            ],
            'columns': [
                {'key': 'islem_tarihi', 'label': 'Tarih'},
                {'key': 'islem_turu', 'label': 'İşlem'},
                {'key': 'aciklama', 'label': 'Açıklama'},
                {'key': 'belge_no', 'label': 'Belge No'},
                {'key': 'borc', 'label': 'Borç', 'format': 'tl'},
                {'key': 'alacak', 'label': 'Alacak', 'format': 'tl'},
                {'key': 'bakiye', 'label': 'Bakiye', 'format': 'tl'},
            ],
            'rows': rows,
            'ozet': {'devreden': devreden, 'kapanis': kapanis},
        }

    # ─── 2. Hesap Özeti ──────────────────────────
    def hesap_ozeti(self, kurum_id, sube_id, params):
        rows = self._rapor_rows(kurum_id, sube_id, params)
        return {
            'baslik': 'Hesap Özeti',
            'kpis': self._liste_kpis(rows),
            'columns': [
                {'key': 'hesap_kodu', 'label': 'Kod'},
                {'key': 'gorunen_ad', 'label': 'Cari'},
                {'key': 'hesap_turu_display', 'label': 'Tür'},
                {'key': 'toplam_borc', 'label': 'Borç', 'format': 'tl'},
                {'key': 'toplam_alacak', 'label': 'Alacak', 'format': 'tl'},
                {'key': 'bakiye', 'label': 'Bakiye', 'format': 'tl'},
            ],
            'rows': rows,
        }

    # ─── 3. Borç Listesi ─────────────────────────
    def borc_listesi(self, kurum_id, sube_id, params):
        rows = [r for r in self._rapor_rows(kurum_id, sube_id, params) if r['bakiye'] < 0]
        rows.sort(key=lambda r: r['bakiye'])
        for r in rows:
            r['acik_borc'] = -r['bakiye']
        return {
            'baslik': 'Borç Listesi (Verecekler)',
            'kpis': [
                {'label': 'Borçlu Cari', 'value': len(rows), 'format': 'int'},
                {'label': 'Toplam Borç', 'value': sum(r['acik_borc'] for r in rows), 'format': 'tl'},
            ],
            'columns': [
                {'key': 'hesap_kodu', 'label': 'Kod'},
                {'key': 'gorunen_ad', 'label': 'Cari'},
                {'key': 'acik_borc', 'label': 'Açık Borç', 'format': 'tl'},
                {'key': 'vadesi_gecmis', 'label': 'Vadesi Geçmiş', 'format': 'tl'},
                {'key': 'son_islem_tarihi', 'label': 'Son İşlem'},
            ],
            'rows': rows,
        }

    # ─── 4. Alacak Listesi ───────────────────────
    def alacak_listesi(self, kurum_id, sube_id, params):
        rows = [r for r in self._rapor_rows(kurum_id, sube_id, params) if r['bakiye'] > 0]
        rows.sort(key=lambda r: r['bakiye'], reverse=True)
        for r in rows:
            r['acik_alacak'] = r['bakiye']
        return {
            'baslik': 'Alacak Listesi (Tahsil Edilecekler)',
            'kpis': [
                {'label': 'Alacaklı Cari', 'value': len(rows), 'format': 'int'},
                {'label': 'Toplam Alacak', 'value': sum(r['acik_alacak'] for r in rows), 'format': 'tl'},
            ],
            'columns': [
                {'key': 'hesap_kodu', 'label': 'Kod'},
                {'key': 'gorunen_ad', 'label': 'Cari'},
                {'key': 'acik_alacak', 'label': 'Açık Alacak', 'format': 'tl'},
                {'key': 'vadesi_gecmis', 'label': 'Vadesi Geçmiş', 'format': 'tl'},
                {'key': 'son_islem_tarihi', 'label': 'Son İşlem'},
            ],
            'rows': rows,
        }

    # ─── 5. Gelir Analizi ────────────────────────
    def gelir_analizi(self, kurum_id, sube_id, params):
        qs = GelirKaydi.objects.filter(kurum_id=kurum_id).exclude(durum='iptal')
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        qs = self._tarih_filtre(qs, params, 'fatura_tarihi')

        agg = qs.aggregate(toplam=Sum('net_tutar'), tahsil=Sum('tahsil_edilen'))
        toplam = _tl(agg['toplam'])
        tahsil = _tl(agg['tahsil'])
        kategori_rows = [
            {
                'kategori': r['gelir_kategorisi__ad'] or 'Kategorisiz',
                'toplam': _tl(r['t']),
                'adet': r['adet'],
            }
            for r in qs.values('gelir_kategorisi__ad')
            .annotate(t=Sum('net_tutar'), adet=Count('id'))
            .order_by('-t')
        ]
        return {
            'baslik': 'Gelir Analizi',
            'kpis': [
                {'label': 'Toplam Gelir', 'value': toplam, 'format': 'tl'},
                {'label': 'Tahsil Edilen', 'value': tahsil, 'format': 'tl'},
                {'label': 'Bekleyen', 'value': round(toplam - tahsil, 2), 'format': 'tl'},
            ],
            'seriler': {'aylik': self._aylik(qs, 'fatura_tarihi', 'net_tutar')},
            'columns': [
                {'key': 'kategori', 'label': 'Kategori'},
                {'key': 'toplam', 'label': 'Tutar', 'format': 'tl'},
                {'key': 'adet', 'label': 'Adet', 'format': 'int'},
            ],
            'rows': kategori_rows,
        }

    # ─── 6. Gider Analizi ────────────────────────
    def gider_analizi(self, kurum_id, sube_id, params):
        qs = GiderKaydi.objects.filter(kurum_id=kurum_id).exclude(durum='iptal')
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        qs = self._tarih_filtre(qs, params, 'fatura_tarihi')

        agg = qs.aggregate(toplam=Sum('net_tutar'), odenen=Sum('odenen_toplam'))
        toplam = _tl(agg['toplam'])
        odenen = _tl(agg['odenen'])
        kategori_rows = [
            {
                'kategori': r['gider_kategorisi__ad'] or 'Kategorisiz',
                'toplam': _tl(r['t']),
                'adet': r['adet'],
            }
            for r in qs.values('gider_kategorisi__ad')
            .annotate(t=Sum('net_tutar'), adet=Count('id'))
            .order_by('-t')
        ]
        return {
            'baslik': 'Gider Analizi',
            'kpis': [
                {'label': 'Toplam Gider', 'value': toplam, 'format': 'tl'},
                {'label': 'Ödenen', 'value': odenen, 'format': 'tl'},
                {'label': 'Kalan', 'value': round(toplam - odenen, 2), 'format': 'tl'},
            ],
            'seriler': {'aylik': self._aylik(qs, 'fatura_tarihi', 'net_tutar')},
            'columns': [
                {'key': 'kategori', 'label': 'Kategori'},
                {'key': 'toplam', 'label': 'Tutar', 'format': 'tl'},
                {'key': 'adet', 'label': 'Adet', 'format': 'int'},
            ],
            'rows': kategori_rows,
        }

    # ─── 7. Hareket Raporu ───────────────────────
    def hareket_raporu(self, kurum_id, sube_id, params):
        qs = CariHareket.objects.filter(kurum_id=kurum_id).select_related(
            'cari_hesap', 'islem_yapan',
        )
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        qs = self._tarih_filtre(qs, params, 'islem_tarihi')
        if params.get('islem_turu'):
            qs = qs.filter(islem_turu=params['islem_turu'])
        if params.get('cari_hesap_id'):
            qs = qs.filter(cari_hesap_id=params['cari_hesap_id'])

        hareketler = list(qs.order_by('-islem_tarihi', '-created_at')[:5000])
        rows = [
            {
                'islem_tarihi': h.islem_tarihi.isoformat(),
                'cari': h.cari_hesap.gorunen_ad,
                'islem_turu': h.get_islem_turu_display(),
                'yon': h.get_yon_display(),
                'tutar': _tl(h.tutar),
                'aciklama': h.aciklama,
                'belge_no': h.belge_no,
            }
            for h in hareketler
        ]
        toplam_borc = sum(r['tutar'] for r, h in zip(rows, hareketler) if h.yon == 'borc')
        toplam_alacak = sum(r['tutar'] for r, h in zip(rows, hareketler) if h.yon == 'alacak')
        return {
            'baslik': 'Hareket Raporu',
            'kpis': [
                {'label': 'Hareket Sayısı', 'value': len(rows), 'format': 'int'},
                {'label': 'Toplam Borç', 'value': toplam_borc, 'format': 'tl'},
                {'label': 'Toplam Alacak', 'value': toplam_alacak, 'format': 'tl'},
            ],
            'columns': [
                {'key': 'islem_tarihi', 'label': 'Tarih'},
                {'key': 'cari', 'label': 'Cari'},
                {'key': 'islem_turu', 'label': 'İşlem'},
                {'key': 'yon', 'label': 'Yön'},
                {'key': 'tutar', 'label': 'Tutar', 'format': 'tl'},
                {'key': 'aciklama', 'label': 'Açıklama'},
            ],
            'rows': rows,
        }

    # ─── 8. Yaşlandırma ──────────────────────────
    def yaslandirma(self, kurum_id, sube_id, params):
        rows = self._rapor_rows(kurum_id, sube_id, params)
        rows = [r for r in rows if r['vadesi_gelen'] or r['vadesi_gecmis'] or r['gelecek_vadeli']]
        toplam_gecmis = sum(r['vadesi_gecmis'] for r in rows)
        toplam_gelen = sum(r['vadesi_gelen'] for r in rows)
        toplam_gelecek = sum(r['gelecek_vadeli'] for r in rows)
        return {
            'baslik': 'Yaşlandırma Raporu',
            'kpis': [
                {'label': 'Vadesi Geçmiş', 'value': toplam_gecmis, 'format': 'tl'},
                {'label': 'Vadesi Gelen', 'value': toplam_gelen, 'format': 'tl'},
                {'label': 'Gelecek Vadeli', 'value': toplam_gelecek, 'format': 'tl'},
            ],
            'columns': [
                {'key': 'gorunen_ad', 'label': 'Cari'},
                {'key': 'vadesi_gecmis', 'label': 'Vadesi Geçmiş', 'format': 'tl'},
                {'key': 'vadesi_gelen', 'label': 'Vadesi Gelen', 'format': 'tl'},
                {'key': 'gelecek_vadeli', 'label': 'Gelecek Vadeli', 'format': 'tl'},
            ],
            'rows': rows,
        }

    # ─── 9. Risk Analizi ─────────────────────────
    def risk_analizi(self, kurum_id, sube_id, params):
        base = self._rapor_rows(kurum_id, sube_id, params)
        ids = [r['id'] for r in base]
        limit_map = dict(
            CariHesap.objects.filter(id__in=ids).values_list('id', 'risk_limiti')
        )
        rows = []
        dagitim = {}
        for r in base:
            acik_borc = -r['bakiye'] if r['bakiye'] < 0 else 0
            risk = hesapla_risk(
                acik_borc, float(limit_map.get(r['id'], 0) or 0), r['vadesi_gecmis'],
            )
            dagitim[risk['risk_durumu']] = dagitim.get(risk['risk_durumu'], 0) + 1
            rows.append({
                'gorunen_ad': r['gorunen_ad'],
                'hesap_kodu': r['hesap_kodu'],
                'acik_borc': acik_borc,
                'risk_limiti': risk['risk_limiti'],
                'kullanim_orani': risk['kullanim_orani'],
                'vadesi_gecmis': r['vadesi_gecmis'],
                'risk_durumu': risk['risk_durumu'],
                'risk_durumu_display': risk['risk_durumu_display'],
                'risk_skoru': risk['risk_skoru'],
            })
        rows.sort(key=lambda x: x['risk_skoru'], reverse=True)
        return {
            'baslik': 'Risk Analizi',
            'kpis': [
                {'label': 'Kritik', 'value': dagitim.get('kritik', 0), 'format': 'int'},
                {'label': 'Riskli', 'value': dagitim.get('riskli', 0), 'format': 'int'},
                {'label': 'Limit Aşıldı', 'value': dagitim.get('limit_asildi', 0), 'format': 'int'},
            ],
            'seriler': {'dagitim': dagitim},
            'columns': [
                {'key': 'gorunen_ad', 'label': 'Cari'},
                {'key': 'acik_borc', 'label': 'Açık Borç', 'format': 'tl'},
                {'key': 'risk_limiti', 'label': 'Risk Limiti', 'format': 'tl'},
                {'key': 'kullanim_orani', 'label': 'Kullanım %', 'format': 'percent'},
                {'key': 'vadesi_gecmis', 'label': 'Vadesi Geçmiş', 'format': 'tl'},
                {'key': 'risk_durumu_display', 'label': 'Risk'},
            ],
            'rows': rows,
        }

    # ─── 10. Tahsilat Performansı ────────────────
    def tahsilat_performansi(self, kurum_id, sube_id, params):
        return self._performans(
            kurum_id, sube_id, params, CariHareketTuru.TAHSILAT, 'Tahsilat Performansı',
        )

    # ─── 11. Ödeme Performansı ───────────────────
    def odeme_performansi(self, kurum_id, sube_id, params):
        return self._performans(
            kurum_id, sube_id, params, CariHareketTuru.ODEME, 'Ödeme Performansı',
        )

    def _performans(self, kurum_id, sube_id, params, islem_turu, baslik):
        qs = CariHareket.objects.filter(kurum_id=kurum_id, islem_turu=islem_turu)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        qs = self._tarih_filtre(qs, params, 'islem_tarihi')
        toplam = _tl(qs.aggregate(t=Sum('tutar'))['t'])
        adet = qs.count()
        aylik = self._aylik(qs, 'islem_tarihi', 'tutar')
        return {
            'baslik': baslik,
            'kpis': [
                {'label': 'Toplam', 'value': toplam, 'format': 'tl'},
                {'label': 'İşlem Sayısı', 'value': adet, 'format': 'int'},
                {'label': 'Ortalama', 'value': round(toplam / adet, 2) if adet else 0, 'format': 'tl'},
            ],
            'seriler': {'aylik': aylik},
            'columns': [
                {'key': 'ay', 'label': 'Ay'},
                {'key': 'toplam', 'label': 'Tutar', 'format': 'tl'},
            ],
            'rows': aylik,
        }

    # ─── Ortak yardımcılar ───────────────────────
    def _liste_kpis(self, rows):
        toplam_borc = sum(-r['bakiye'] for r in rows if r['bakiye'] < 0)
        toplam_alacak = sum(r['bakiye'] for r in rows if r['bakiye'] > 0)
        return [
            {'label': 'Cari Sayısı', 'value': len(rows), 'format': 'int'},
            {'label': 'Toplam Borç', 'value': toplam_borc, 'format': 'tl'},
            {'label': 'Toplam Alacak', 'value': toplam_alacak, 'format': 'tl'},
        ]

    def _tarih_filtre(self, qs, params, alan):
        if params.get('baslangic'):
            qs = qs.filter(**{f'{alan}__gte': params['baslangic']})
        if params.get('bitis'):
            qs = qs.filter(**{f'{alan}__lte': params['bitis']})
        return qs

    def _aylik(self, qs, tarih_alani, tutar_alani):
        rows = (
            qs.annotate(ay=TruncMonth(tarih_alani))
            .values('ay')
            .annotate(toplam=Sum(tutar_alani))
            .order_by('ay')
        )
        return [
            {'ay': r['ay'].strftime('%Y-%m'), 'toplam': _tl(r['toplam'])}
            for r in rows if r['ay']
        ]
