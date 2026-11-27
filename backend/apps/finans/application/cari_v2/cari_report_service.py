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

from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth

from apps.finans.application.cari_hareket_enrichment import build_cari_hareket_meta
from apps.finans.application.ekstre_balance import (
    cari_donem_bakiyesi,
    tarih_parametresi,
)
from apps.finans.application.cari_v2.cari_risk_service import hesapla_risk
from apps.finans.application.selectors.cari_hesap_selector import CariHesapSelector
from apps.finans.constants.cari_types import CariHareketTuru, GelirDurum
from apps.finans.constants.gider_types import GiderDurum
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
        try:
            return method(kurum_id, sube_id, params)
        except ValueError as exc:
            return {'error': str(exc)}

    # ─── Yardımcılar ─────────────────────────────
    def _rapor_rows(self, kurum_id, sube_id, params):
        rows = self.selector.cari_rapor_listesi(
            kurum_id,
            sube_id=sube_id,
            hesap_turu=params.get('hesap_turu'),
            arama=params.get('arama'),
            baslangic=params.get('baslangic'),
            bitis=params.get('bitis'),
        )
        cari_id = params.get('cari_hesap_id')
        if cari_id not in (None, ''):
            try:
                cid = int(cari_id)
                rows = [r for r in rows if r['id'] == cid]
            except (TypeError, ValueError):
                pass
        return rows

    # ─── 1. Ekstre ───────────────────────────────
    def _kapsamdaki_hesap(self, cari_id, kurum_id, sube_id):
        """Cari hesabı yalnızca istenen kurum/şubeye aitse döndürür."""
        try:
            hesap = self.repo.get_by_id(int(cari_id))
        except (TypeError, ValueError):
            return None
        if not hesap or int(hesap.kurum_id) != int(kurum_id):
            return None
        if sube_id not in (None, '') and int(hesap.sube_id) != int(sube_id):
            return None
        return hesap

    def ekstre(self, kurum_id, sube_id, params):
        cari_id = params.get('cari_hesap_id')
        if not cari_id:
            return {'error': 'cari_hesap_id zorunludur.'}
        hesap = self._kapsamdaki_hesap(cari_id, kurum_id, sube_id)
        if not hesap:
            return {'error': 'Cari hesap bulunamadı.'}

        baslangic = tarih_parametresi(params.get('baslangic'))
        bitis = tarih_parametresi(params.get('bitis'))
        if baslangic and bitis and baslangic > bitis:
            return {'error': 'Başlangıç tarihi bitiş tarihinden büyük olamaz.'}
        filtreler = {}
        if baslangic:
            filtreler['baslangic'] = baslangic
        if bitis:
            filtreler['bitis'] = bitis
        hareketler = list(self.selector.hareketler(hesap.pk, filtreler=filtreler or None))
        meta = build_cari_hareket_meta(hareketler)
        donem = cari_donem_bakiyesi(hesap.pk, baslangic=baslangic, bitis=bitis)

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
                'bakiye': _tl(donem.satir_bakiyeleri.get(h.pk)),
                'kategori': km.get('kategori_adi') or '',
            })

        devreden = round(_tl(donem.devreden), 2)
        kapanis = round(_tl(donem.kapanis), 2)
        toplam_borc = _tl(donem.toplam_borc)
        toplam_alacak = _tl(donem.toplam_alacak)

        return {
            'baslik': f'Cari Ekstre — {hesap.gorunen_ad}',
            'kpis': [
                {'label': 'Devreden Bakiye', 'value': devreden, 'format': 'tl'},
                {'label': 'Toplam Borç', 'value': round(toplam_borc, 2), 'format': 'tl'},
                {'label': 'Toplam Alacak', 'value': round(toplam_alacak, 2), 'format': 'tl'},
                {'label': 'Net Bakiye', 'value': round(kapanis, 2), 'format': 'tl'},
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
            'ozet': {
                'devreden': devreden,
                'kapanis': kapanis,
                'toplam_borc': round(toplam_borc, 2),
                'toplam_alacak': round(toplam_alacak, 2),
                'net_bakiye': round(kapanis, 2),
            },
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
        rows = [r for r in self._rapor_rows(kurum_id, sube_id, params) if r['acik_borc_belge'] > 0]
        rows.sort(
            key=lambda r: (r['acik_borc_belge'], r['vadesi_gecmis_odeme']),
            reverse=True,
        )
        for r in rows:
            r['acik_borc'] = round(max(-r['bakiye'], 0.0), 2)
        return {
            'baslik': 'Borç Listesi (Verecekler)',
            'kpis': [
                {'label': 'Borçlu Cari', 'value': len(rows), 'format': 'int'},
                {'label': 'Toplam Borç', 'value': round(sum(r['acik_borc_belge'] for r in rows), 2), 'format': 'tl'},
                {'label': 'Geciken Ödeme', 'value': round(sum(r['vadesi_gecmis_odeme'] for r in rows), 2), 'format': 'tl'},
            ],
            'columns': [
                {'key': 'hesap_kodu', 'label': 'Kod'},
                {'key': 'gorunen_ad', 'label': 'Cari'},
                {'key': 'acik_borc_belge', 'label': 'Açık Borç (Belge)', 'format': 'tl'},
                {'key': 'vadesi_gecmis_odeme', 'label': 'Geciken Ödeme', 'format': 'tl'},
                {'key': 'bakiye', 'label': 'Net Bakiye', 'format': 'tl'},
                {'key': 'son_islem_tarihi', 'label': 'Son İşlem'},
            ],
            'rows': rows,
        }

    # ─── 4. Alacak Listesi ───────────────────────
    def alacak_listesi(self, kurum_id, sube_id, params):
        rows = [r for r in self._rapor_rows(kurum_id, sube_id, params) if r['acik_alacak_belge'] > 0]
        rows.sort(
            key=lambda r: (r['acik_alacak_belge'], r['vadesi_gecmis_tahsilat']),
            reverse=True,
        )
        for r in rows:
            r['acik_alacak'] = round(max(r['bakiye'], 0.0), 2)
        return {
            'baslik': 'Alacak Listesi (Tahsil Edilecekler)',
            'kpis': [
                {'label': 'Alacaklı Cari', 'value': len(rows), 'format': 'int'},
                {'label': 'Toplam Alacak', 'value': round(sum(r['acik_alacak_belge'] for r in rows), 2), 'format': 'tl'},
                {'label': 'Geciken Tahsilat', 'value': round(sum(r['vadesi_gecmis_tahsilat'] for r in rows), 2), 'format': 'tl'},
            ],
            'columns': [
                {'key': 'hesap_kodu', 'label': 'Kod'},
                {'key': 'gorunen_ad', 'label': 'Cari'},
                {'key': 'acik_alacak_belge', 'label': 'Açık Alacak (Belge)', 'format': 'tl'},
                {'key': 'vadesi_gecmis_tahsilat', 'label': 'Geciken Tahsilat', 'format': 'tl'},
                {'key': 'bakiye', 'label': 'Net Bakiye', 'format': 'tl'},
                {'key': 'son_islem_tarihi', 'label': 'Son İşlem'},
            ],
            'rows': rows,
        }

    # ─── 5. Gelir Analizi ────────────────────────
    def gelir_analizi(self, kurum_id, sube_id, params):
        qs = GelirKaydi.objects.filter(kurum_id=kurum_id).exclude(
            durum__in=[GelirDurum.IPTAL, GelirDurum.TASLAK],
        )
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if params.get('cari_hesap_id'):
            qs = qs.filter(cari_hesap_id=params['cari_hesap_id'])
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
        qs = GiderKaydi.objects.filter(kurum_id=kurum_id).exclude(
            durum__in=[GiderDurum.IPTAL, GiderDurum.TASLAK, GiderDurum.ONAY_BEKLIYOR],
        )
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if params.get('cari_hesap_id'):
            qs = qs.filter(cari_hesap_id=params['cari_hesap_id'])
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
        base = self._rapor_rows(kurum_id, sube_id, params)
        kesim_tarihi = tarih_parametresi(params.get('bitis'))
        kovalar = self.selector.vade_yaslandirma(
            [r['id'] for r in base],
            kesim_tarihi=kesim_tarihi,
        )
        gecikme_kovalari = ('g1_30', 'g31_60', 'g61_90', 'g90_ustu')
        yon_etiketi = {'tahsilat': 'Tahsil Edilecek', 'odeme': 'Ödenecek'}

        rows = []
        geciken = {'tahsilat': 0.0, 'odeme': 0.0}
        g90_toplam = 0.0
        for r in base:
            for yon in ('tahsilat', 'odeme'):
                k = (kovalar.get(r['id']) or {}).get(yon)
                toplam = round(sum(k.values()), 2) if k else 0.0
                if not toplam:
                    continue
                geciken[yon] += sum(k[g] for g in gecikme_kovalari)
                g90_toplam += k['g90_ustu']
                rows.append({
                    'gorunen_ad': r['gorunen_ad'],
                    'hesap_kodu': r['hesap_kodu'],
                    'yon': yon_etiketi[yon],
                    **k,
                    'toplam': toplam,
                })
        return {
            'baslik': 'Vade Yaşlandırma Raporu',
            'kpis': [
                {'label': 'Geciken Tahsilat', 'value': round(geciken['tahsilat'], 2), 'format': 'tl'},
                {'label': 'Geciken Ödeme', 'value': round(geciken['odeme'], 2), 'format': 'tl'},
                {'label': '90+ Gün Geciken', 'value': round(g90_toplam, 2), 'format': 'tl'},
            ],
            'columns': [
                {'key': 'gorunen_ad', 'label': 'Cari'},
                {'key': 'yon', 'label': 'Yön'},
                {'key': 'gelecek', 'label': 'Vadesi Gelmemiş', 'format': 'tl'},
                {'key': 'bugun', 'label': 'Bugün', 'format': 'tl'},
                {'key': 'g1_30', 'label': '1–30 Gün', 'format': 'tl'},
                {'key': 'g31_60', 'label': '31–60 Gün', 'format': 'tl'},
                {'key': 'g61_90', 'label': '61–90 Gün', 'format': 'tl'},
                {'key': 'g90_ustu', 'label': '90+ Gün', 'format': 'tl'},
                {'key': 'toplam', 'label': 'Toplam Açık', 'format': 'tl'},
            ],
            'rows': rows,
        }

    # ─── 9. Risk Analizi ─────────────────────────
    def risk_analizi(self, kurum_id, sube_id, params):
        base = self._rapor_rows(kurum_id, sube_id, params)
        ids = [r['id'] for r in base]
        meta_map = {
            c['id']: c
            for c in CariHesap.objects.filter(id__in=ids).values('id', 'risk_limiti', 'hesap_turu')
        }
        rows = []
        dagitim = {}
        for r in base:
            acik_borc = -r['bakiye'] if r['bakiye'] < 0 else 0
            acik_alacak = r['bakiye'] if r['bakiye'] > 0 else 0
            cmeta = meta_map.get(r['id']) or {}
            risk = hesapla_risk(
                acik_borc,
                float(cmeta.get('risk_limiti') or 0),
                r['vadesi_gecmis'],
                acik_alacak=acik_alacak,
                hesap_turu=cmeta.get('hesap_turu') or r.get('hesap_turu'),
            )
            dagitim[risk['risk_durumu']] = dagitim.get(risk['risk_durumu'], 0) + 1
            rows.append({
                'gorunen_ad': r['gorunen_ad'],
                'hesap_kodu': r['hesap_kodu'],
                'hesap_turu_display': r.get('hesap_turu_display') or '',
                'acik_borc': acik_borc,
                'acik_alacak': acik_alacak,
                'acik_alacak_belge': r['acik_alacak_belge'],
                'acik_borc_belge': r['acik_borc_belge'],
                'risk_maruziyeti': risk['risk_maruziyeti'],
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
                {'key': 'hesap_turu_display', 'label': 'Tür'},
                {'key': 'acik_alacak', 'label': 'Net Alacağımız', 'format': 'tl'},
                {'key': 'acik_borc', 'label': 'Net Borcumuz', 'format': 'tl'},
                {'key': 'acik_alacak_belge', 'label': 'Açık Alacak (Belge)', 'format': 'tl'},
                {'key': 'acik_borc_belge', 'label': 'Açık Borç (Belge)', 'format': 'tl'},
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
        if params.get('cari_hesap_id'):
            qs = qs.filter(cari_hesap_id=params['cari_hesap_id'])
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
        net_bakiye = sum(r['bakiye'] for r in rows)
        return [
            {'label': 'Cari Sayısı', 'value': len(rows), 'format': 'int'},
            {'label': 'Toplam Borç', 'value': round(toplam_borc, 2), 'format': 'tl'},
            {'label': 'Toplam Alacak', 'value': round(toplam_alacak, 2), 'format': 'tl'},
            {'label': 'Net Bakiye', 'value': round(net_bakiye, 2), 'format': 'tl'},
        ]

    def _tarih_filtre(self, qs, params, alan):
        baslangic = tarih_parametresi(params.get('baslangic'))
        bitis = tarih_parametresi(params.get('bitis'))
        if baslangic and bitis and baslangic > bitis:
            raise ValueError('Başlangıç tarihi bitiş tarihinden büyük olamaz.')
        if baslangic:
            qs = qs.filter(**{f'{alan}__gte': baslangic})
        if bitis:
            qs = qs.filter(**{f'{alan}__lte': bitis})
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
