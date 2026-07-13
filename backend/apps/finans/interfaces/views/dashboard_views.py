"""
Finans Dashboard API Views
Kurum yöneticisi için özet finansal veriler, grafikler ve widgetlar.
"""
from datetime import date, timedelta
from django.db.models import Sum, Q, Count, Case, When, IntegerField
from django.utils import timezone
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response

from apps.odeme_takip.domain.models import Sozlesme, Taksit, Tahsilat
from apps.odeme_takip.domain.enums import (
    SozlesmeDurum, TaksitDurum, TahsilatDurum, TahsilatTuru,
)
from apps.finans.application.dashboard_overview_service import DashboardOverviewService
from apps.finans.application.period.period_service import parse_date


class FinansDashboardView(APIView):
    """
    GET /finans/api/dashboard/?kurum_id=...&sube_id=...&egitim_yili_id=...
    
    Dönen veri yapısı:
    {
      ozet_kartlar: { bugunki_kasa, toplam_alacak, toplam_borc, bu_ay_gelir, bu_ay_gider, net_kar_zarar },
      widgetlar: { bugun_tahsil_edilen, bugun_odenen_gider, bu_ay_odenecek_borclar, geciken_odemeler, geciken_toplam_tutar },
      vade_takvimi: [ { ogrenci_adi, sozlesme_no, taksit_no, vade_tarihi, tutar, kalan_tutar } ],
      son_islemler: [ { id, tip, ogrenci_adi, tutar, tarih, aciklama } ],
      tahsilat_orani: { genel_oran, bu_ay_oran, toplam_odenen, toplam_borc },
      aylik_gelir_gider: [ { ay, gelir, gider } ],
      tahsilat_performans: [ { ay, toplam_tahsilat, sozlesme_sayisi } ],
    }
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        sube_id = request.query_params.get('sube_id')
        egitim_yili_id = request.query_params.get('egitim_yili_id')

        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        egitim_yili_id = request.query_params.get('egitim_yili_id')

        # ─── Base querysetler ─────────────────────────────────
        aktif_durumlar = [SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS]
        tum_durumlar = [SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS, SozlesmeDurum.TAMAMLANDI]

        sozlesme_filter = Q(kurum_id=kurum_id)
        if sube_id:
            sozlesme_filter &= Q(sube_id=sube_id)
        if egitim_yili_id:
            sozlesme_filter &= Q(egitim_yili_id=egitim_yili_id)

        # Aktif sözleşmeler
        aktif_sozlesmeler = Sozlesme.objects.filter(sozlesme_filter, durum__in=aktif_durumlar)
        tum_sozlesmeler = Sozlesme.objects.filter(sozlesme_filter, durum__in=tum_durumlar)
        aktif_sozlesme_ids = list(aktif_sozlesmeler.values_list('id', flat=True))
        tum_sozlesme_ids = list(tum_sozlesmeler.values_list('id', flat=True))

        bugun = timezone.localdate()
        ay_basi = bugun.replace(day=1)
        yedi_gun_sonra = bugun + timedelta(days=7)

        # ─── 1. ÖZET KARTLAR ─────────────────────────────────
        # Toplam alacak = aktif sözleşmelerin net_tutar toplamı
        toplam_alacak = aktif_sozlesmeler.aggregate(t=Sum('net_tutar'))['t'] or 0

        # Toplam ödenen (tüm aktif tahsilatlar)
        tahsilat_filter = Q(sozlesme_id__in=tum_sozlesme_ids, durum=TahsilatDurum.AKTIF)
        tahsilat_filter_iade_haric = tahsilat_filter & ~Q(tahsilat_turu=TahsilatTuru.IADE)

        toplam_odenen = Tahsilat.objects.filter(tahsilat_filter_iade_haric).aggregate(t=Sum('tutar'))['t'] or 0

        # Toplam borç = toplam alacak - toplam ödenen
        toplam_borc = toplam_alacak - toplam_odenen

        # Bu ay gelir (bu ay yapılan tahsilatlar)
        bu_ay_gelir = Tahsilat.objects.filter(
            tahsilat_filter_iade_haric,
            tahsilat_tarihi__gte=ay_basi,
            tahsilat_tarihi__lte=bugun,
        ).aggregate(t=Sum('tutar'))['t'] or 0

        # Bu ay gider — şimdilik 0 (gider modülü sonra eklenecek)
        bu_ay_gider = 0

        # Net kar/zarar
        net_kar_zarar = bu_ay_gelir - bu_ay_gider

        # Bugünkü kasa = bugün yapılan tahsilatlar
        bugunki_kasa = Tahsilat.objects.filter(
            tahsilat_filter_iade_haric,
            tahsilat_tarihi=bugun,
        ).aggregate(t=Sum('tutar'))['t'] or 0

        ozet_kartlar = {
            'bugunki_kasa': bugunki_kasa,
            'toplam_alacak': toplam_alacak,
            'toplam_borc': toplam_borc,
            'toplam_odenen': toplam_odenen,
            'bu_ay_gelir': bu_ay_gelir,
            'bu_ay_gider': bu_ay_gider,
            'net_kar_zarar': net_kar_zarar,
        }

        # ─── 2. WİDGETLAR ────────────────────────────────────
        bugun_tahsil = bugunki_kasa  # aynı veri

        # Bu ay ödenecek borçlar (bu ay vadesi gelen ödenmemiş taksitler)
        bu_ay_odenecek = Taksit.objects.filter(
            sozlesme_id__in=aktif_sozlesme_ids,
            vade_tarihi__gte=ay_basi,
            vade_tarihi__lte=bugun.replace(day=28) + timedelta(days=4),  # ay sonu
            durum__in=[TaksitDurum.BEKLEMEDE, TaksitDurum.GECIKTI, TaksitDurum.KISMI_ODENDI],
        ).aggregate(t=Sum('kalan_tutar'))['t'] or 0

        # Geciken ödemeler
        geciken = Taksit.objects.filter(
            sozlesme_id__in=aktif_sozlesme_ids,
            vade_tarihi__lt=bugun,
            durum__in=[TaksitDurum.BEKLEMEDE, TaksitDurum.GECIKTI, TaksitDurum.KISMI_ODENDI],
        ).aggregate(
            toplam=Sum('kalan_tutar'),
            adet=Count('id'),
        )

        widgetlar = {
            'bugun_tahsil_edilen': bugun_tahsil,
            'bugun_odenen_gider': 0,  # gider modülü sonra
            'bu_ay_odenecek_borclar': bu_ay_odenecek,
            'geciken_odemeler': geciken['adet'] or 0,
            'geciken_toplam_tutar': geciken['toplam'] or 0,
        }

        # ─── 3. VADE TAKVİMİ (Önümüzdeki 7 gün) ─────────────
        yaklasan_taksitler = Taksit.objects.filter(
            sozlesme_id__in=aktif_sozlesme_ids,
            vade_tarihi__gte=bugun,
            vade_tarihi__lte=yedi_gun_sonra,
            durum__in=[TaksitDurum.BEKLEMEDE, TaksitDurum.KISMI_ODENDI],
        ).select_related('sozlesme', 'sozlesme__ogrenci').order_by('vade_tarihi')[:20]

        vade_takvimi = []
        for t in yaklasan_taksitler:
            ogr = t.sozlesme.ogrenci
            vade_takvimi.append({
                'sozlesme_id': t.sozlesme_id,
                'sozlesme_no': t.sozlesme.sozlesme_no,
                'ogrenci_adi': f"{ogr.ad} {ogr.soyad}" if ogr else "—",
                'taksit_no': t.taksit_no,
                'vade_tarihi': t.vade_tarihi.isoformat(),
                'tutar': t.tutar,
                'kalan_tutar': t.kalan_tutar,
            })

        # ─── 4. SON İŞLEMLER (Son 10 tahsilat) ───────────────
        son_tahsilatlar = Tahsilat.objects.filter(
            sozlesme_id__in=tum_sozlesme_ids,
        ).select_related('sozlesme', 'sozlesme__ogrenci').order_by('-created_at')[:10]

        son_islemler = []
        for th in son_tahsilatlar:
            ogr = th.sozlesme.ogrenci
            son_islemler.append({
                'id': th.id,
                'tip': th.tahsilat_turu,
                'durum': th.durum,
                'ogrenci_adi': f"{ogr.ad} {ogr.soyad}" if ogr else "—",
                'sozlesme_no': th.sozlesme.sozlesme_no,
                'tutar': th.tutar,
                'tarih': th.tahsilat_tarihi.isoformat() if th.tahsilat_tarihi else None,
                'aciklama': th.aciklama or '',
            })

        # ─── 5. TAHSİLAT ORANI ───────────────────────────────
        genel_oran = round(toplam_odenen * 100 / toplam_alacak, 1) if toplam_alacak > 0 else 0

        # Bu ay oranı
        bu_ay_beklenen = Taksit.objects.filter(
            sozlesme_id__in=aktif_sozlesme_ids,
            vade_tarihi__gte=ay_basi,
            vade_tarihi__lte=bugun,
        ).aggregate(t=Sum('tutar'))['t'] or 0

        bu_ay_oran = round(bu_ay_gelir * 100 / bu_ay_beklenen, 1) if bu_ay_beklenen > 0 else 0

        tahsilat_orani = {
            'genel_oran': genel_oran,
            'bu_ay_oran': bu_ay_oran,
            'toplam_odenen': toplam_odenen,
            'toplam_borc': toplam_borc,
        }

        # ─── 6. AYLIK GELİR-GİDER GRAFİĞİ (Son 12 ay) ──────
        aylik_gelir_gider = []
        for i in range(11, -1, -1):
            # i ay öncesi
            t = bugun - timedelta(days=i * 30)
            m_basi = t.replace(day=1)
            if t.month == 12:
                m_sonu = t.replace(year=t.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                m_sonu = t.replace(month=t.month + 1, day=1) - timedelta(days=1)

            gelir = Tahsilat.objects.filter(
                tahsilat_filter_iade_haric,
                tahsilat_tarihi__gte=m_basi,
                tahsilat_tarihi__lte=m_sonu,
            ).aggregate(t=Sum('tutar'))['t'] or 0

            aylik_gelir_gider.append({
                'ay': m_basi.strftime('%Y-%m'),
                'ay_label': m_basi.strftime('%b %Y'),
                'gelir': gelir,
                'gider': 0,  # gider modülü sonra
            })

        # ─── 7. TAHSİLAT PERFORMANSI (Son 6 ay) ─────────────
        tahsilat_performans = []
        for i in range(5, -1, -1):
            t = bugun - timedelta(days=i * 30)
            m_basi = t.replace(day=1)
            if t.month == 12:
                m_sonu = t.replace(year=t.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                m_sonu = t.replace(month=t.month + 1, day=1) - timedelta(days=1)

            ay_tahsilat = Tahsilat.objects.filter(
                tahsilat_filter_iade_haric,
                tahsilat_tarihi__gte=m_basi,
                tahsilat_tarihi__lte=m_sonu,
            ).aggregate(
                toplam=Sum('tutar'),
                adet=Count('id'),
            )

            # O aydaki beklenen (vadesi gelen taksitler)
            ay_beklenen = Taksit.objects.filter(
                sozlesme_id__in=aktif_sozlesme_ids,
                vade_tarihi__gte=m_basi,
                vade_tarihi__lte=m_sonu,
            ).aggregate(t=Sum('tutar'))['t'] or 0

            tahsilat_performans.append({
                'ay': m_basi.strftime('%Y-%m'),
                'ay_label': m_basi.strftime('%b %Y'),
                'toplam_tahsilat': ay_tahsilat['toplam'] or 0,
                'tahsilat_adedi': ay_tahsilat['adet'] or 0,
                'beklenen': ay_beklenen,
                'oran': round((ay_tahsilat['toplam'] or 0) * 100 / ay_beklenen, 1) if ay_beklenen > 0 else 0,
            })

        # ─── 8. GECİKEN ÖDEMELER DETAY ───────────────────────
        geciken_detay = Taksit.objects.filter(
            sozlesme_id__in=aktif_sozlesme_ids,
            vade_tarihi__lt=bugun,
            durum__in=[TaksitDurum.BEKLEMEDE, TaksitDurum.GECIKTI, TaksitDurum.KISMI_ODENDI],
        ).select_related('sozlesme', 'sozlesme__ogrenci').order_by('vade_tarihi')[:15]

        geciken_odemeler_listesi = []
        for t in geciken_detay:
            ogr = t.sozlesme.ogrenci
            gecik_gun = (bugun - t.vade_tarihi).days
            geciken_odemeler_listesi.append({
                'sozlesme_id': t.sozlesme_id,
                'sozlesme_no': t.sozlesme.sozlesme_no,
                'ogrenci_adi': f"{ogr.ad} {ogr.soyad}" if ogr else "—",
                'taksit_no': t.taksit_no,
                'vade_tarihi': t.vade_tarihi.isoformat(),
                'tutar': t.tutar,
                'kalan_tutar': t.kalan_tutar,
                'gecikme_gun': gecik_gun,
            })

        return Response({
            'ozet_kartlar': ozet_kartlar,
            'widgetlar': widgetlar,
            'vade_takvimi': vade_takvimi,
            'son_islemler': son_islemler,
            'tahsilat_orani': tahsilat_orani,
            'aylik_gelir_gider': aylik_gelir_gider,
            'tahsilat_performans': tahsilat_performans,
            'geciken_odemeler_listesi': geciken_odemeler_listesi,
        })


class DashboardOverviewView(APIView):
    """
    GET /finans/api/dashboard/overview/?kurum_id=...&sube_id=...&egitim_yili_id=...
    Birleşik finans dashboard verisi — period, gider, kasa/banka, gecikmiş ödemeler.
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        sube_id = request.query_params.get('sube_id')
        egitim_yili_id = request.query_params.get('egitim_yili_id')

        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        egitim_yili_id = request.query_params.get('egitim_yili_id')
        if not egitim_yili_id:
            from shared.context import get_secili_egitim_yili_id
            egitim_yili_id = get_secili_egitim_yili_id(request)
        referans_tarih = parse_date(request.query_params.get('referans_tarih'))

        data = DashboardOverviewService.build(
            kurum_id=int(kurum_id),
            sube_id=int(sube_id),
            egitim_yili_id=int(egitim_yili_id) if egitim_yili_id else None,
            referans_tarih=referans_tarih,
        )
        return Response(data)
