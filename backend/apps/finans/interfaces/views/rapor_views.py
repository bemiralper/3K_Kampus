"""
Finans Raporlama API Views
Gelir-gider raporu, tahsilat analizi, borç yaşlandırma ve dönem bazlı raporlar.
"""
from datetime import date, timedelta
from collections import defaultdict

from django.db.models import Sum, Q, Count, F, Case, When, IntegerField, Value, CharField
from django.db.models.functions import TruncMonth, ExtractMonth, ExtractYear
from django.utils import timezone
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response

from apps.odeme_takip.domain.models import Sozlesme, Taksit, Tahsilat
from apps.odeme_takip.domain.enums import (
    SozlesmeDurum, TaksitDurum, TahsilatDurum, TahsilatTuru,
)
from apps.finans.application.selectors.donem_bakiye_selector import DonemBakiyeSelector
from apps.finans.application.selectors.bakiye_hareketi_selector import BakiyeHareketiSelector

AY_ISIMLERI = {
    1: 'Ocak', 2: 'Şubat', 3: 'Mart', 4: 'Nisan',
    5: 'Mayıs', 6: 'Haziran', 7: 'Temmuz', 8: 'Ağustos',
    9: 'Eylül', 10: 'Ekim', 11: 'Kasım', 12: 'Aralık',
}


def ay_label(d: date) -> str:
    """Türkçe ay etiketi: 'Şubat 2026'"""
    return f"{AY_ISIMLERI[d.month]} {d.year}"


def _resolve_rapor_sube(request, kurum_id):
    from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

    sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
    if err:
        return None, err
    return sube_id, None


class GelirGiderRaporView(APIView):
    """
    GET /finans/api/raporlar/gelir-gider/
    ?kurum_id=...&sube_id=...&egitim_yili_id=...

    Aylık gelir-gider dağılımı + özet.
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        egitim_yili_id = request.query_params.get('egitim_yili_id')

        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        sube_id, err = _resolve_rapor_sube(request, kurum_id)
        if err:
            return err

        # ─── Sözleşme Filtresi ────────────────────────────────
        f = Q(kurum_id=kurum_id, sube_id=sube_id)
        if egitim_yili_id:
            f &= Q(egitim_yili_id=egitim_yili_id)

        aktif_durumlar = [
            SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF,
            SozlesmeDurum.DONDURULMUS, SozlesmeDurum.TAMAMLANDI,
        ]
        sozlesme_ids = list(
            Sozlesme.objects.filter(f, durum__in=aktif_durumlar)
            .values_list('id', flat=True)
        )

        tahsilat_base = Q(
            sozlesme_id__in=sozlesme_ids,
            durum=TahsilatDurum.AKTIF,
        )
        tahsilat_gelir = tahsilat_base & ~Q(tahsilat_turu=TahsilatTuru.IADE)
        tahsilat_iade = tahsilat_base & Q(tahsilat_turu=TahsilatTuru.IADE)

        # ─── Aylık Gelir (son 12 ay) ─────────────────────────
        bugun = date.today()
        aylik = []

        for i in range(11, -1, -1):
            t = bugun - timedelta(days=i * 30)
            m_basi = t.replace(day=1)
            if t.month == 12:
                m_sonu = t.replace(year=t.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                m_sonu = t.replace(month=t.month + 1, day=1) - timedelta(days=1)

            gelir = Tahsilat.objects.filter(
                tahsilat_gelir,
                tahsilat_tarihi__gte=m_basi,
                tahsilat_tarihi__lte=m_sonu,
            ).aggregate(t=Sum('tutar'))['t'] or 0

            iade = Tahsilat.objects.filter(
                tahsilat_iade,
                tahsilat_tarihi__gte=m_basi,
                tahsilat_tarihi__lte=m_sonu,
            ).aggregate(t=Sum('tutar'))['t'] or 0

            # Gider şimdilik 0 — GiderKaydi eklenince buraya bağlanacak
            gider = 0

            aylik.append({
                'ay': m_basi.strftime('%Y-%m'),
                'ay_label': ay_label(m_basi),
                'gelir': gelir,
                'iade': iade,
                'gider': gider,
                'net': gelir - iade - gider,
            })

        # ─── Toplamlar ───────────────────────────────────────
        toplam_gelir = sum(a['gelir'] for a in aylik)
        toplam_iade = sum(a['iade'] for a in aylik)
        toplam_gider = sum(a['gider'] for a in aylik)

        # ─── Ödeme Yöntemi Bazlı Gelir Dağılımı ─────────────
        yontem_dagilimi = list(
            Tahsilat.objects.filter(tahsilat_gelir)
            .values('odeme_yontemi__ad')
            .annotate(toplam=Sum('tutar'), adet=Count('id'))
            .order_by('-toplam')
        )

        return Response({
            'aylik': aylik,
            'toplam_gelir': toplam_gelir,
            'toplam_iade': toplam_iade,
            'toplam_gider': toplam_gider,
            'net_gelir': toplam_gelir - toplam_iade - toplam_gider,
            'yontem_dagilimi': [
                {
                    'yontem': y['odeme_yontemi__ad'] or 'Belirtilmemiş',
                    'toplam': y['toplam'],
                    'adet': y['adet'],
                }
                for y in yontem_dagilimi
            ],
        })


class TahsilatAnalizView(APIView):
    """
    GET /finans/api/raporlar/tahsilat-analiz/
    ?kurum_id=...&sube_id=...&egitim_yili_id=...

    Tahsilat performansı, durum dağılımı, aylık performans.
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        egitim_yili_id = request.query_params.get('egitim_yili_id')

        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        sube_id, err = _resolve_rapor_sube(request, kurum_id)
        if err:
            return err

        # ─── Sözleşme Filtresi ────────────────────────────────
        f = Q(kurum_id=kurum_id, sube_id=sube_id)
        if egitim_yili_id:
            f &= Q(egitim_yili_id=egitim_yili_id)

        aktif_durumlar = [SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS, SozlesmeDurum.TAMAMLANDI]
        sozlesmeler = Sozlesme.objects.filter(f, durum__in=aktif_durumlar)
        sozlesme_ids = list(sozlesmeler.values_list('id', flat=True))

        bugun = date.today()
        ay_basi = bugun.replace(day=1)

        # ─── Genel Tahsilat Oranları ─────────────────────────
        toplam_alacak = sozlesmeler.aggregate(t=Sum('net_tutar'))['t'] or 0

        tahsilat_filter = Q(
            sozlesme_id__in=sozlesme_ids,
            durum=TahsilatDurum.AKTIF,
        ) & ~Q(tahsilat_turu=TahsilatTuru.IADE)

        toplam_tahsil = Tahsilat.objects.filter(tahsilat_filter).aggregate(t=Sum('tutar'))['t'] or 0
        genel_oran = round(toplam_tahsil * 100 / toplam_alacak, 1) if toplam_alacak > 0 else 0

        # ─── Taksit Durum Dağılımı ───────────────────────────
        taksitler = Taksit.objects.filter(sozlesme_id__in=sozlesme_ids)
        durum_dagilimi = list(
            taksitler.values('durum')
            .annotate(adet=Count('id'), toplam=Sum('tutar'))
            .order_by('durum')
        )

        # ─── Aylık Tahsilat Performansı (son 6 ay) ──────────
        aylik_performans = []
        for i in range(5, -1, -1):
            t = bugun - timedelta(days=i * 30)
            m_basi = t.replace(day=1)
            if t.month == 12:
                m_sonu = t.replace(year=t.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                m_sonu = t.replace(month=t.month + 1, day=1) - timedelta(days=1)

            tahsil = Tahsilat.objects.filter(
                tahsilat_filter,
                tahsilat_tarihi__gte=m_basi,
                tahsilat_tarihi__lte=m_sonu,
            ).aggregate(
                toplam=Sum('tutar'),
                adet=Count('id'),
            )

            beklenen = Taksit.objects.filter(
                sozlesme_id__in=sozlesme_ids,
                vade_tarihi__gte=m_basi,
                vade_tarihi__lte=m_sonu,
            ).aggregate(t=Sum('tutar'))['t'] or 0

            oran = round((tahsil['toplam'] or 0) * 100 / beklenen, 1) if beklenen > 0 else 0

            aylik_performans.append({
                'ay': m_basi.strftime('%Y-%m'),
                'ay_label': ay_label(m_basi),
                'tahsil_edilen': tahsil['toplam'] or 0,
                'beklenen': beklenen,
                'adet': tahsil['adet'] or 0,
                'oran': oran,
            })

        # ─── Sözleşme Durum Dağılımı ────────────────────────
        tum_durumlar = [
            SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF,
            SozlesmeDurum.DONDURULMUS, SozlesmeDurum.TAMAMLANDI,
            SozlesmeDurum.FESHEDILMIS,
        ]
        sozlesme_filter = Q(kurum_id=kurum_id, sube_id=sube_id)
        if egitim_yili_id:
            sozlesme_filter &= Q(egitim_yili_id=egitim_yili_id)

        sozlesme_dagilimi = list(
            Sozlesme.objects.filter(sozlesme_filter, durum__in=tum_durumlar)
            .values('durum')
            .annotate(adet=Count('id'), toplam=Sum('net_tutar'))
            .order_by('durum')
        )

        return Response({
            'toplam_alacak': toplam_alacak,
            'toplam_tahsil': toplam_tahsil,
            'kalan_borc': toplam_alacak - toplam_tahsil,
            'genel_oran': genel_oran,
            'taksit_durum_dagilimi': [
                {
                    'durum': d['durum'],
                    'adet': d['adet'],
                    'toplam': d['toplam'] or 0,
                }
                for d in durum_dagilimi
            ],
            'aylik_performans': aylik_performans,
            'sozlesme_dagilimi': [
                {
                    'durum': s['durum'],
                    'adet': s['adet'],
                    'toplam': s['toplam'] or 0,
                }
                for s in sozlesme_dagilimi
            ],
        })


class BorcYaslandirmaView(APIView):
    """
    GET /finans/api/raporlar/borc-yaslandirma/
    ?kurum_id=...&sube_id=...&egitim_yili_id=...

    Borç yaşlandırma tablosu — gecikmiş taksitleri gün aralığına göre gruplar.
    0-30 gün, 31-60 gün, 61-90 gün, 90+ gün.
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        egitim_yili_id = request.query_params.get('egitim_yili_id')

        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        sube_id, err = _resolve_rapor_sube(request, kurum_id)
        if err:
            return err

        # ─── Filtre ──────────────────────────────────────────
        f = Q(kurum_id=kurum_id, sube_id=sube_id)
        if egitim_yili_id:
            f &= Q(egitim_yili_id=egitim_yili_id)

        aktif_durumlar = [SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS]
        sozlesme_ids = list(
            Sozlesme.objects.filter(f, durum__in=aktif_durumlar)
            .values_list('id', flat=True)
        )

        bugun = date.today()

        # ─── Gecikmiş Taksitler ──────────────────────────────
        geciken_taksitler = (
            Taksit.objects.filter(
                sozlesme_id__in=sozlesme_ids,
                vade_tarihi__lt=bugun,
                durum__in=[TaksitDurum.BEKLEMEDE, TaksitDurum.GECIKTI, TaksitDurum.KISMI_ODENDI],
            )
            .select_related('sozlesme', 'sozlesme__ogrenci')
            .order_by('vade_tarihi')
        )

        # ─── Yaşlandırma Grupları ────────────────────────────
        gruplar = {
            '0_30': {'label': '0-30 Gün', 'adet': 0, 'toplam': 0, 'detay': []},
            '31_60': {'label': '31-60 Gün', 'adet': 0, 'toplam': 0, 'detay': []},
            '61_90': {'label': '61-90 Gün', 'adet': 0, 'toplam': 0, 'detay': []},
            '90_plus': {'label': '90+ Gün', 'adet': 0, 'toplam': 0, 'detay': []},
        }

        toplam_geciken = 0
        toplam_adet = 0

        for taksit in geciken_taksitler:
            gun = (bugun - taksit.vade_tarihi).days
            kalan = taksit.kalan_tutar

            if gun <= 30:
                grup_key = '0_30'
            elif gun <= 60:
                grup_key = '31_60'
            elif gun <= 90:
                grup_key = '61_90'
            else:
                grup_key = '90_plus'

            gruplar[grup_key]['adet'] += 1
            gruplar[grup_key]['toplam'] += kalan
            toplam_geciken += kalan
            toplam_adet += 1

            ogr = taksit.sozlesme.ogrenci
            # Her gruba en fazla 20 detay ekle
            if len(gruplar[grup_key]['detay']) < 20:
                gruplar[grup_key]['detay'].append({
                    'sozlesme_id': taksit.sozlesme_id,
                    'sozlesme_no': taksit.sozlesme.sozlesme_no,
                    'ogrenci_adi': f"{ogr.ad} {ogr.soyad}" if ogr else "—",
                    'taksit_no': taksit.taksit_no,
                    'vade_tarihi': taksit.vade_tarihi.isoformat(),
                    'tutar': taksit.tutar,
                    'kalan': kalan,
                    'gecikme_gun': gun,
                })

        return Response({
            'gruplar': gruplar,
            'toplam_geciken_tutar': toplam_geciken,
            'toplam_geciken_adet': toplam_adet,
            'tarih': bugun.isoformat(),
        })


class DonemRaporView(APIView):
    """
    GET /finans/api/raporlar/donem/
    ?kurum_id=...&sube_id=...&egitim_yili_id=...

    Dönem bazlı bakiye raporu + yıllar arası karşılaştırma.
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        egitim_yili_id = request.query_params.get('egitim_yili_id')

        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        sube_id, err = _resolve_rapor_sube(request, kurum_id)
        if err:
            return err

        donem_selector = DonemBakiyeSelector()

        # ─── Mevcut Dönem Özeti ──────────────────────────────
        donem_ozet = None
        if egitim_yili_id:
            donem_ozet = donem_selector.get_sube_ozet(
                int(sube_id), int(egitim_yili_id)
            )

        # ─── Yıllar Arası Karşılaştırma ─────────────────────
        yillar_arasi = donem_selector.get_yillar_arasi_karsilastirma(int(kurum_id))

        return Response({
            'donem_ozet': donem_ozet,
            'yillar_arasi': yillar_arasi,
        })
