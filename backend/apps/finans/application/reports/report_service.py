"""
Finans slug raporları — tüm gelir kaynakları (Faz 3).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.finans.application.period.period_service import PeriodService, parse_date
from apps.finans.application.cari_balance import cari_bagimsiz_tahsilat_q
from apps.finans.constants.cari_types import CariHareketTuru
from apps.finans.constants.gider_types import OdemeDurum
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.odeme_takip.domain.cek_senet import CekSenetDetay, CekSenetDurum
from apps.odeme_takip.domain.enums import SozlesmeDurum, TahsilatDurum, TahsilatTuru
from apps.odeme_takip.domain.models import Sozlesme, Tahsilat, Taksit

REPORT_SLUGS = {
    'cek-bilgileri',
    'cek-senet-listesi',
    'gunluk-satis',
    'gunluk-satis-detay',
    'aylik-satis',
    'tahsilat-analiz',
}

AY_ISIMLERI = {
    1: 'Ocak', 2: 'Şubat', 3: 'Mart', 4: 'Nisan',
    5: 'Mayıs', 6: 'Haziran', 7: 'Temmuz', 8: 'Ağustos',
    9: 'Eylül', 10: 'Ekim', 11: 'Kasım', 12: 'Aralık',
}


class ReportService:
    """Slug bazlı finans raporları."""

    @classmethod
    def run(cls, slug: str, *, kurum_id: int, params: dict) -> dict:
        if slug not in REPORT_SLUGS:
            raise ValueError(f'Bilinmeyen rapor: {slug}')

        baslangic = parse_date(params.get('baslangic'))
        bitis = parse_date(params.get('bitis'))
        if not baslangic or not bitis:
            today = timezone.localdate()
            bitis = bitis or today
            baslangic = baslangic or (today - timedelta(days=30))

        common = {
            'kurum_id': kurum_id,
            'baslangic': baslangic,
            'bitis': bitis,
            'sube_id': params.get('sube_id'),
            'egitim_yili_id': params.get('egitim_yili_id'),
            'odeme_yontemi_tipi': params.get('odeme_yontemi_tipi'),
            'kaynak': params.get('kaynak'),
        }

        handlers = {
            'cek-bilgileri': cls._cek_bilgileri,
            'cek-senet-listesi': cls._cek_senet_listesi,
            'gunluk-satis': cls._gunluk_satis,
            'gunluk-satis-detay': cls._gunluk_satis_detay,
            'aylik-satis': cls._aylik_satis,
            'tahsilat-analiz': cls._tahsilat_analiz,
        }
        return handlers[slug](**common)

    @classmethod
    def _cek_bilgileri(cls, **kw) -> dict:
        qs = cls._cek_senet_base_qs(**kw)
        durum_dagilimi = list(
            qs.values('durum').annotate(adet=Count('id')).order_by('durum')
        )
        portfoyde = qs.filter(
            durum__in=[CekSenetDurum.PORTFOYDE, CekSenetDurum.BEKLIYOR, CekSenetDurum.TAHSILDE],
        ).count()
        tahsil = qs.filter(
            durum__in=[CekSenetDurum.TAHSIL, CekSenetDurum.TAHSIL_EDILDI, CekSenetDurum.ODENDI],
        ).count()
        karsiliksiz = qs.filter(durum=CekSenetDurum.KARSILIKSIZ).count()
        return {
            'slug': 'cek-bilgileri',
            'ozet': {
                'toplam': qs.count(),
                'portfoyde': portfoyde,
                'tahsil': tahsil,
                'karsiliksiz': karsiliksiz,
            },
            'durum_dagilimi': [
                {'durum': d['durum'], 'label': CekSenetDurum.get_label(d['durum']), 'adet': d['adet']}
                for d in durum_dagilimi
            ],
            'rows': cls._cek_senet_rows(qs[:200]),
        }

    @classmethod
    def _cek_senet_listesi(cls, **kw) -> dict:
        qs = cls._cek_senet_base_qs(**kw)
        return {
            'slug': 'cek-senet-listesi',
            'count': qs.count(),
            'rows': cls._cek_senet_rows(qs),
        }

    @classmethod
    def _cek_senet_base_qs(cls, **kw):
        baslangic = kw['baslangic']
        bitis = kw['bitis']
        kurum_id = kw['kurum_id']
        qs = CekSenetDetay.objects.filter(
            vade_tarihi__gte=baslangic,
            vade_tarihi__lte=bitis,
        ).select_related('taksit__sozlesme', 'tahsilat__sozlesme', 'odeme_yontemi')

        sube_id = kw.get('sube_id')
        egitim_yili_id = kw.get('egitim_yili_id')
        if kurum_id:
            qs = qs.filter(
                Q(kurum_id=kurum_id)
                | Q(taksit__sozlesme__kurum_id=kurum_id)
                | Q(tahsilat__sozlesme__kurum_id=kurum_id)
            )
        if sube_id:
            qs = qs.filter(
                Q(sube_id=sube_id)
                | Q(taksit__sozlesme__sube_id=sube_id)
                | Q(tahsilat__sozlesme__sube_id=sube_id)
            )
        if egitim_yili_id:
            qs = qs.filter(
                Q(taksit__sozlesme__egitim_yili_id=egitim_yili_id)
                | Q(tahsilat__sozlesme__egitim_yili_id=egitim_yili_id)
            )
        return qs.order_by('vade_tarihi', 'cek_senet_no')

    @classmethod
    def _cek_senet_rows(cls, qs) -> list[dict]:
        rows = []
        for det in qs:
            sozlesme = None
            tutar = 0
            tutar = det.tutar or 0
            if det.taksit_id:
                sozlesme = det.taksit.sozlesme
                if not tutar:
                    tutar = det.taksit.kalan_tutar or det.taksit.tutar
            elif det.tahsilat_id:
                sozlesme = det.tahsilat.sozlesme
                if not tutar:
                    tutar = det.tahsilat.tutar
            elif det.cari_hesap_id:
                tutar = det.tutar or 0
            rows.append({
                'cek_senet_no': det.cek_senet_no,
                'banka_adi': det.banka_adi,
                'vade_tarihi': det.vade_tarihi.isoformat(),
                'durum': det.durum,
                'durum_label': CekSenetDurum.get_label(det.durum),
                'yon': det.yon,
                'yon_label': dict(CekSenetDetay._meta.get_field('yon').choices).get(det.yon, det.yon),
                'arac_tipi': det.arac_tipi,
                'tutar': tutar,
                'sozlesme_no': sozlesme.sozlesme_no if sozlesme else '',
                'cari_label': det.cari_hesap.gorunen_ad if det.cari_hesap_id else '',
            })
        return rows

    @classmethod
    def _gunluk_satis(cls, **kw) -> dict:
        baslangic = kw['baslangic']
        bitis = kw['bitis']
        daily: dict[str, int] = defaultdict(int)

        for row in PeriodService.period_details(
            kurum_id=kw['kurum_id'],
            baslangic=baslangic,
            bitis=bitis,
            mode='alinan',
            sube_id=kw.get('sube_id'),
            egitim_yili_id=kw.get('egitim_yili_id'),
            odeme_yontemi_tipi=kw.get('odeme_yontemi_tipi'),
            kaynak=kw.get('kaynak'),
        ):
            daily[row['tarih']] += int(row['tutar'])

        rows = [
            {'tarih': d, 'toplam': daily[d]}
            for d in sorted(daily.keys())
        ]
        return {
            'slug': 'gunluk-satis',
            'rows': rows,
            'toplam': sum(r['toplam'] for r in rows),
        }

    @classmethod
    def _gunluk_satis_detay(cls, **kw) -> dict:
        rows = PeriodService.period_details(
            kurum_id=kw['kurum_id'],
            baslangic=kw['baslangic'],
            bitis=kw['bitis'],
            mode='alinan',
            sube_id=kw.get('sube_id'),
            egitim_yili_id=kw.get('egitim_yili_id'),
            odeme_yontemi_tipi=kw.get('odeme_yontemi_tipi'),
            kaynak=kw.get('kaynak'),
        )
        return {
            'slug': 'gunluk-satis-detay',
            'count': len(rows),
            'rows': rows,
            'toplam': sum(int(r['tutar']) for r in rows),
        }

    @classmethod
    def _aylik_satis(cls, **kw) -> dict:
        baslangic = kw['baslangic']
        bitis = kw['bitis']
        monthly: dict[str, int] = defaultdict(int)

        for row in PeriodService.period_details(
            kurum_id=kw['kurum_id'],
            baslangic=baslangic,
            bitis=bitis,
            mode='alinan',
            sube_id=kw.get('sube_id'),
            egitim_yili_id=kw.get('egitim_yili_id'),
            odeme_yontemi_tipi=kw.get('odeme_yontemi_tipi'),
            kaynak=kw.get('kaynak'),
        ):
            month_key = row['tarih'][:7]
            monthly[month_key] += int(row['tutar'])

        rows = []
        for key in sorted(monthly.keys()):
            y, m = key.split('-')
            rows.append({
                'ay': key,
                'ay_label': f"{AY_ISIMLERI[int(m)]} {y}",
                'toplam': monthly[key],
            })
        return {
            'slug': 'aylik-satis',
            'rows': rows,
            'toplam': sum(r['toplam'] for r in rows),
        }

    @classmethod
    def _tahsilat_analiz(cls, **kw) -> dict:
        kurum_id = kw['kurum_id']
        sube_id = kw.get('sube_id')
        egitim_yili_id = kw.get('egitim_yili_id')
        baslangic = kw['baslangic']
        bitis = kw['bitis']

        f = Q(kurum_id=kurum_id, durum__in=[
            SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS, SozlesmeDurum.TAMAMLANDI,
        ])
        if sube_id:
            f &= Q(sube_id=sube_id)
        if egitim_yili_id:
            f &= Q(egitim_yili_id=egitim_yili_id)
        sozlesme_ids = list(Sozlesme.objects.filter(f).values_list('id', flat=True))

        tahsilat_filter = Q(
            sozlesme_id__in=sozlesme_ids,
            durum=TahsilatDurum.AKTIF,
            tahsilat_tarihi__gte=baslangic,
            tahsilat_tarihi__lte=bitis,
        ) & ~Q(tahsilat_turu=TahsilatTuru.IADE)

        if kw.get('odeme_yontemi_tipi'):
            tahsilat_filter &= Q(odeme_yontemi__tip=kw['odeme_yontemi_tipi'])

        sozlesme_tahsil = Tahsilat.objects.filter(tahsilat_filter).aggregate(
            toplam=Sum('tutar'), adet=Count('id'),
        )

        gelir_q = Q(
            gelir_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.TAMAMLANDI,
            tahsilat_tarihi__gte=baslangic,
            tahsilat_tarihi__lte=bitis,
        )
        if sube_id:
            gelir_q &= Q(gelir_kaydi__sube_id=sube_id)
        if egitim_yili_id:
            gelir_q &= Q(gelir_kaydi__egitim_yili_id=egitim_yili_id)
        if kw.get('odeme_yontemi_tipi'):
            gelir_q &= Q(odeme_yontemi__tip=kw['odeme_yontemi_tipi'])
        gelir_tahsil = GelirTahsilat.objects.filter(gelir_q).aggregate(
            toplam=Sum('tutar'), adet=Count('id'),
        )

        cari_q = Q(
            kurum_id=kurum_id,
            islem_turu=CariHareketTuru.TAHSILAT,
            islem_tarihi__gte=baslangic,
            islem_tarihi__lte=bitis,
        ) & cari_bagimsiz_tahsilat_q()
        if sube_id:
            cari_q &= Q(sube_id=sube_id)
        if egitim_yili_id:
            cari_q &= Q(egitim_yili_id=egitim_yili_id)
        cari_tahsil = CariHareket.objects.filter(cari_q).aggregate(
            toplam=Sum('tutar'), adet=Count('id'),
        )

        yontem_dagilimi = list(
            Tahsilat.objects.filter(tahsilat_filter)
            .values('odeme_yontemi__tip', 'odeme_yontemi__ad')
            .annotate(toplam=Sum('tutar'), adet=Count('id'))
            .order_by('-toplam')
        )

        taksit_durum = list(
            Taksit.objects.filter(sozlesme_id__in=sozlesme_ids)
            .values('durum')
            .annotate(adet=Count('id'), toplam=Sum('tutar'))
        )

        soz_toplam = int(sozlesme_tahsil['toplam'] or 0)
        gel_toplam = int(gelir_tahsil['toplam'] or 0)
        cari_toplam = int(cari_tahsil['toplam'] or 0)

        return {
            'slug': 'tahsilat-analiz',
            'baslangic': baslangic.isoformat(),
            'bitis': bitis.isoformat(),
            'kaynaklar': {
                'sozlesme': {'toplam': soz_toplam, 'adet': sozlesme_tahsil['adet'] or 0},
                'gelir': {'toplam': gel_toplam, 'adet': gelir_tahsil['adet'] or 0},
                'cari': {'toplam': cari_toplam, 'adet': cari_tahsil['adet'] or 0},
            },
            'genel_toplam': soz_toplam + gel_toplam + cari_toplam,
            'yontem_dagilimi': [
                {
                    'tip': y['odeme_yontemi__tip'] or '',
                    'tip_label': OdemeYontemiTipi.get_label(y['odeme_yontemi__tip'] or ''),
                    'yontem': y['odeme_yontemi__ad'] or 'Belirtilmemiş',
                    'toplam': y['toplam'] or 0,
                    'adet': y['adet'] or 0,
                }
                for y in yontem_dagilimi
            ],
            'taksit_durum_dagilimi': [
                {'durum': d['durum'], 'adet': d['adet'], 'toplam': d['toplam'] or 0}
                for d in taksit_durum
            ],
        }
