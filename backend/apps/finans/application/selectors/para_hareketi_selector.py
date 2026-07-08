"""
Para Hareketi Selector
"Para Hareketleri" (Tahsilat / Ödeme / İade / Transfer) ekranı için
BakiyeHareketi kayıtlarını birleşik, filtreli ve sayfalı biçimde sunar.

BakiyeHareketi, kasa/banka etkileyen TÜM işlemlerin (tahsilat, gider,
iade, transfer, gelir) tek ve değişmez kaydını tuttuğu için "Para
Hareketleri" ekranının veri kaynağı doğrudan burasıdır — ayrıca her
kaydı okunabilir hale getirmek için kaynak modele (Tahsilat, GelirTahsilat,
GiderOdeme, HesapTransferi) geri referans verilerek zenginleştirilir.
"""
from django.db.models import Q, Sum, Case, When, IntegerField

from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.constants.hareket_types import HareketYonu, HareketKaynagi


class ParaHareketiSelector:

    def list(self, kurum_id, sube_id=None, egitim_yili_id=None, filters=None, page=1, page_size=50):
        qs = BakiyeHareketi.objects.filter(kurum_id=kurum_id).select_related(
            'mali_hesap', 'islem_yapan',
        )
        if sube_id:
            qs = qs.filter(Q(sube_id=sube_id) | Q(sube_id__isnull=True))
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)

        filters = filters or {}
        if filters.get('baslangic'):
            qs = qs.filter(islem_tarihi__gte=filters['baslangic'])
        if filters.get('bitis'):
            qs = qs.filter(islem_tarihi__lte=filters['bitis'])
        if filters.get('kaynak'):
            qs = qs.filter(kaynak=filters['kaynak'])
        if filters.get('yon'):
            qs = qs.filter(yon=filters['yon'])
        if filters.get('mali_hesap_id'):
            qs = qs.filter(mali_hesap_id=filters['mali_hesap_id'])
        if filters.get('islem_yapan_id'):
            qs = qs.filter(islem_yapan_id=filters['islem_yapan_id'])
        if filters.get('arama'):
            qs = qs.filter(aciklama__icontains=filters['arama'])

        agg = qs.aggregate(
            toplam_giris=Sum(
                Case(
                    When(yon=HareketYonu.GIRIS, then='tutar'),
                    default=0,
                    output_field=IntegerField(),
                )
            ),
            toplam_cikis=Sum(
                Case(
                    When(yon=HareketYonu.CIKIS, then='tutar'),
                    default=0,
                    output_field=IntegerField(),
                )
            ),
        )
        filtre_toplam_giris = int(agg['toplam_giris'] or 0)
        filtre_toplam_cikis = int(agg['toplam_cikis'] or 0)

        qs = qs.order_by('-islem_tarihi', '-created_at', '-id')

        count = qs.count()
        page = max(1, int(page))
        page_size = max(1, min(int(page_size), 200))
        start = (page - 1) * page_size
        rows = list(qs[start:start + page_size])

        sayfa_toplam_giris = 0
        sayfa_toplam_cikis = 0
        for r in rows:
            if r.yon == HareketYonu.GIRIS:
                sayfa_toplam_giris += r.tutar
            else:
                sayfa_toplam_cikis += r.tutar

        return {
            'results': [self._enrich(r) for r in rows],
            'count': count,
            'page': page,
            'page_size': page_size,
            'total_pages': (count + page_size - 1) // page_size if page_size else 1,
            'sayfa_toplam_giris': sayfa_toplam_giris,
            'sayfa_toplam_cikis': sayfa_toplam_cikis,
            'toplam_giris': filtre_toplam_giris,
            'toplam_cikis': filtre_toplam_cikis,
            'net_bakiye': filtre_toplam_giris - filtre_toplam_cikis,
        }

    # ─── Zenginleştirme ───────────────────────────

    def _enrich(self, hareket):
        cari_adi = ''
        odeme_yontemi_adi = ''
        belge_no = ''
        detay = self._kaynak_detay(hareket)
        if detay:
            cari_adi = detay.get('cari_adi', '')
            odeme_yontemi_adi = detay.get('odeme_yontemi_adi', '')
            belge_no = detay.get('belge_no', '')

        return {
            'id': hareket.id,
            'mali_hesap_id': hareket.mali_hesap_id,
            'mali_hesap_ad': hareket.mali_hesap.ad if hareket.mali_hesap_id else '',
            'mali_hesap_tip': hareket.mali_hesap.tip if hareket.mali_hesap_id else '',
            'yon': hareket.yon,
            'yon_label': HareketYonu.get_label(hareket.yon),
            'tutar': int(hareket.tutar),
            'signed_tutar': int(hareket.signed_tutar),
            'kaynak': hareket.kaynak,
            'kaynak_label': HareketKaynagi.get_label(hareket.kaynak),
            'kaynak_tip': hareket.kaynak_tip,
            'kaynak_id': hareket.kaynak_id,
            'cari_adi': cari_adi,
            'odeme_yontemi_adi': odeme_yontemi_adi,
            'belge_no': belge_no,
            'bakiye_sonrasi': int(hareket.bakiye_sonrasi) if hareket.bakiye_sonrasi is not None else None,
            'islem_tarihi': str(hareket.islem_tarihi),
            'aciklama': hareket.aciklama or '',
            'islem_yapan': hareket.islem_yapan.get_full_name() if hareket.islem_yapan else None,
            'created_at': hareket.created_at.isoformat() if hareket.created_at else None,
        }

    def _kaynak_detay(self, hareket):
        """
        kaynak_tip + kaynak alanına bakarak orijinal kaydı bulur ve
        cari/öğrenci adı + ödeme yöntemi bilgisini döndürür.

        Not: GelirTahsilat ve GiderOdeme servisleri BakiyeHareketi
        oluştururken kaynak_tip göndermez (boş kalır); bu yüzden
        ayrım `kaynak` (HareketKaynagi) değerine göre yapılır.
        """
        kaynak_id = hareket.kaynak_id
        if not kaynak_id:
            return None

        try:
            if hareket.kaynak_tip == 'tahsilat' and hareket.kaynak in (
                HareketKaynagi.TAHSILAT, HareketKaynagi.TAHSILAT_IPTAL, HareketKaynagi.IADE,
            ):
                from apps.odeme_takip.domain.models import Tahsilat
                th = Tahsilat.objects.select_related(
                    'sozlesme__ogrenci', 'odeme_yontemi',
                ).filter(id=kaynak_id).first()
                if th:
                    ogrenci = th.sozlesme.ogrenci if th.sozlesme else None
                    return {
                        'cari_adi': f'{ogrenci.ad} {ogrenci.soyad}' if ogrenci else (
                            th.sozlesme.sozlesme_no if th.sozlesme else ''
                        ),
                        'odeme_yontemi_adi': th.odeme_yontemi.ad if th.odeme_yontemi_id else '',
                        'belge_no': th.referans_no or '',
                    }

            if hareket.kaynak_tip == 'hesap_transferi' and hareket.kaynak == HareketKaynagi.TRANSFER:
                from apps.finans.domain.hesap_transferi import HesapTransferi
                t = HesapTransferi.objects.select_related('kaynak_hesap', 'hedef_hesap').filter(id=kaynak_id).first()
                if t:
                    return {
                        'cari_adi': f'{t.kaynak_hesap.ad} → {t.hedef_hesap.ad}',
                        'odeme_yontemi_adi': '',
                        'belge_no': f'TRF-{t.id}',
                    }

            if not hareket.kaynak_tip and hareket.kaynak in (
                HareketKaynagi.TAHSILAT, HareketKaynagi.TAHSILAT_IPTAL,
            ):
                from apps.finans.domain.gelir_tahsilat import GelirTahsilat
                gt = GelirTahsilat.objects.select_related(
                    'gelir_kaydi__cari_hesap', 'odeme_yontemi',
                ).filter(id=kaynak_id).first()
                if gt:
                    cari = gt.gelir_kaydi.cari_hesap if gt.gelir_kaydi else None
                    return {
                        'cari_adi': cari.gorunen_ad if cari else '',
                        'odeme_yontemi_adi': gt.odeme_yontemi.ad if gt.odeme_yontemi_id else '',
                    }

            if not hareket.kaynak_tip and hareket.kaynak == HareketKaynagi.AVANS:
                from apps.finans.domain.cari_hesap import CariHesap
                cari = CariHesap.objects.filter(id=kaynak_id).first()
                if cari:
                    return {'cari_adi': cari.gorunen_ad, 'odeme_yontemi_adi': ''}

            if not hareket.kaynak_tip and hareket.kaynak in (
                HareketKaynagi.GIDER, HareketKaynagi.GIDER_IPTAL,
            ):
                from apps.finans.domain.gider_odeme import GiderOdeme
                go = GiderOdeme.objects.select_related(
                    'gider_kaydi__cari_hesap', 'gider_kaydi__gider_kategorisi', 'odeme_yontemi',
                ).filter(id=kaynak_id).first()
                if go:
                    cari = go.gider_kaydi.cari_hesap if go.gider_kaydi else None
                    cari_adi = cari.gorunen_ad if cari else ''
                    if not cari_adi and go.gider_kaydi:
                        kat = go.gider_kaydi.gider_kategorisi
                        if kat and kat.parent and kat.parent.ad == 'Banka Giderleri':
                            cari_adi = f'Banka Masrafı — {kat.ad}'
                        elif kat:
                            cari_adi = f'Banka Masrafı — {kat.ad}'
                    return {
                        'cari_adi': cari_adi,
                        'odeme_yontemi_adi': go.odeme_yontemi.ad if go.odeme_yontemi_id else '',
                        'belge_no': go.gider_kaydi.fatura_no if go.gider_kaydi else '',
                    }
        except Exception:
            return None

        return None
