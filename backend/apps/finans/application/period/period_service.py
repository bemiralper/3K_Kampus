"""
Dönem özeti ve detay aggregation — sözleşme + gelir + cari kaynakları.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from django.db.models import Q, Sum, Count
from django.utils import timezone

from apps.finans.constants.cari_types import CariHareketTuru
from apps.finans.constants.gider_types import OdemeDurum
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.odeme_takip.domain.enums import SozlesmeDurum, TahsilatDurum, TahsilatTuru
from apps.odeme_takip.domain.models import Sozlesme, Tahsilat, Taksit


KAYNAK_LABELS = {
    'sozlesme': 'Sözleşme Tahsilatı',
    'gelir': 'Gelir Kaydı',
    'cari': 'Cari Hesap',
}


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _sozlesme_ids(kurum_id, sube_id=None, egitim_yili_id=None) -> list[int]:
    f = Q(kurum_id=kurum_id, durum__in=[
        SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS, SozlesmeDurum.TAMAMLANDI,
    ])
    if sube_id:
        f &= Q(sube_id=sube_id)
    if egitim_yili_id:
        f &= Q(egitim_yili_id=egitim_yili_id)
    return list(Sozlesme.objects.filter(f).values_list('id', flat=True))


def _normalize_kaynak(kaynak: str | None) -> str | None:
    if not kaynak or kaynak == 'hepsi':
        return None
    return kaynak


def _yontem_filter(
    odeme_yontemi_tipi=None,
    odeme_yontemi_tipleri: list[str] | None = None,
    odeme_yontemi_ids=None,
) -> Q:
    q = Q()
    tips: list[str] = list(odeme_yontemi_tipleri or [])
    if odeme_yontemi_tipi:
        tips.append(odeme_yontemi_tipi)
    tips = list(dict.fromkeys(t for t in tips if t))
    if tips:
        q &= Q(odeme_yontemi__tip__in=tips)
    if odeme_yontemi_ids:
        q &= Q(odeme_yontemi_id__in=odeme_yontemi_ids)
    return q


def _yontem_label(tip: str | None) -> str:
    if not tip:
        return 'Belirtilmemiş'
    return OdemeYontemiTipi.get_label(tip) or tip


def _tahsil_durumu(odenen: int, kalan: int) -> str:
    if kalan <= 0 and odenen > 0:
        return 'odendi'
    if odenen > 0 and kalan > 0:
        return 'kismi'
    return 'bekliyor'


def _tahsil_durumu_label(durum: str) -> str:
    return {
        'odendi': 'Alındı',
        'kismi': 'Kısmi Alındı',
        'bekliyor': 'Alınmadı',
    }.get(durum, durum)


def _selected_yontem_tipleri(kwargs) -> list[str]:
    tips: list[str] = list(kwargs.get('odeme_yontemi_tipleri') or [])
    tip = kwargs.get('odeme_yontemi_tipi')
    if tip:
        tips.append(tip)
    return list(dict.fromkeys(t for t in tips if t))


def _taksit_yontem_tipleri(taksit_id: int) -> set[str]:
    return set(
        Tahsilat.objects.filter(
            taksit_id=taksit_id,
            durum=TahsilatDurum.AKTIF,
        )
        .exclude(tahsilat_turu=TahsilatTuru.IADE)
        .exclude(odeme_yontemi__tip__isnull=True)
        .exclude(odeme_yontemi__tip='')
        .values_list('odeme_yontemi__tip', flat=True)
        .distinct()
    )


def _taksit_yontem_label(taksit_id: int) -> str | None:
    tips = sorted(_taksit_yontem_tipleri(taksit_id))
    if not tips:
        return None
    return ', '.join(_yontem_label(t) for t in tips)


def _gelir_yontem_tipleri(gelir_id: int) -> set[str]:
    return set(
        GelirTahsilat.objects.filter(
            gelir_kaydi_id=gelir_id,
            durum=OdemeDurum.TAMAMLANDI,
        )
        .exclude(odeme_yontemi__tip__isnull=True)
        .exclude(odeme_yontemi__tip='')
        .values_list('odeme_yontemi__tip', flat=True)
        .distinct()
    )


def _gelir_yontem_label(gelir_id: int) -> str | None:
    tips = sorted(_gelir_yontem_tipleri(gelir_id))
    if not tips:
        return None
    return ', '.join(_yontem_label(t) for t in tips)


def _beklenen_row_matches_yontem(row: dict, selected_tips: list[str]) -> bool:
    if not selected_tips:
        return True
    if row.get('tahsil_durumu') == 'bekliyor':
        return True
    row_tips = set(row.get('odeme_yontemi_tipleri') or [])
    return bool(row_tips & set(selected_tips))


def _aggregate_yontem_rows(yontem_rows: list[dict], toplam_tutar: int) -> list[dict]:
    """Ödeme yöntemlerini tip bazında birleştirir (banka/POS ayrımı yok)."""
    yontem_map: dict[str, dict] = {}
    for y in yontem_rows:
        tip = y.get('odeme_yontemi__tip') or ''
        key = tip or '_belirtilmemis'
        if key not in yontem_map:
            yontem_map[key] = {'toplam': 0, 'adet': 0, 'yontem_tipi': tip}
        yontem_map[key]['toplam'] += int(y.get('toplam') or 0)
        yontem_map[key]['adet'] += int(y.get('adet') or 0)

    yontem_dagilimi = []
    for item in sorted(yontem_map.values(), key=lambda x: -x['toplam']):
        oran = (item['toplam'] / toplam_tutar * 100) if toplam_tutar else 0
        yontem_dagilimi.append({
            'yontem': _yontem_label(item['yontem_tipi']),
            'yontem_tipi': item['yontem_tipi'],
            'toplam': item['toplam'],
            'adet': item['adet'],
            'oran': round(oran, 1),
        })
    return yontem_dagilimi


def _kayit_zamani(dt) -> str | None:
    if not dt:
        return None
    return timezone.localtime(dt).isoformat()


class PeriodService:
    """Dönem bazlı alınan / beklenen tutar aggregation."""

    @classmethod
    def period_summary(
        cls,
        *,
        kurum_id: int,
        baslangic: date,
        bitis: date,
        mode: str = 'alinan',
        sube_id=None,
        egitim_yili_id=None,
        odeme_yontemi_tipi: str | None = None,
        odeme_yontemi_tipleri: list[str] | None = None,
        odeme_yontemi_ids: list[int] | None = None,
        kaynak: str | None = None,
    ) -> dict:
        mode = (mode or 'alinan').lower()
        kaynak = _normalize_kaynak(kaynak)
        if mode == 'beklenen':
            return cls._summary_beklenen(
                kurum_id=kurum_id,
                baslangic=baslangic,
                bitis=bitis,
                sube_id=sube_id,
                egitim_yili_id=egitim_yili_id,
                odeme_yontemi_tipi=odeme_yontemi_tipi,
                odeme_yontemi_tipleri=odeme_yontemi_tipleri,
                kaynak=kaynak,
            )
        return cls._summary_alinan(
            kurum_id=kurum_id,
            baslangic=baslangic,
            bitis=bitis,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            odeme_yontemi_tipi=odeme_yontemi_tipi,
            odeme_yontemi_tipleri=odeme_yontemi_tipleri,
            odeme_yontemi_ids=odeme_yontemi_ids,
            kaynak=kaynak,
        )

    @classmethod
    def _build_kaynak_kirilimi(cls, kaynaklar: dict[str, dict], toplam_tutar: int = 0) -> list[dict]:
        return [
            {
                'kaynak': key,
                'kaynak_label': KAYNAK_LABELS.get(key, key),
                'toplam': int(kaynaklar[key]['toplam'] or 0),
                'adet': int(kaynaklar[key]['adet'] or 0),
                'oran': round(int(kaynaklar[key]['toplam'] or 0) / toplam_tutar * 100, 1) if toplam_tutar else 0,
            }
            for key in ('sozlesme', 'gelir', 'cari')
            if kaynaklar.get(key, {}).get('toplam') or kaynaklar.get(key, {}).get('adet')
        ]

    @classmethod
    def _daily_grafik(cls, rows: list[dict]) -> list[dict]:
        by_day: dict[str, int] = defaultdict(int)
        for row in rows:
            day = str(row.get('tarih', ''))[:10]
            if day:
                by_day[day] += int(row.get('tutar') or 0)
        return [
            {'label': day, 'tutar': tutar}
            for day, tutar in sorted(by_day.items())
        ]

    @classmethod
    def _summary_alinan(cls, **kwargs) -> dict:
        kurum_id = kwargs['kurum_id']
        baslangic = kwargs['baslangic']
        bitis = kwargs['bitis']
        sube_id = kwargs.get('sube_id')
        egitim_yili_id = kwargs.get('egitim_yili_id')
        odeme_yontemi_tipi = kwargs.get('odeme_yontemi_tipi')
        odeme_yontemi_tipleri = kwargs.get('odeme_yontemi_tipleri')
        odeme_yontemi_ids = kwargs.get('odeme_yontemi_ids')
        kaynak = kwargs.get('kaynak')
        yontem_q = _yontem_filter(odeme_yontemi_tipi, odeme_yontemi_tipleri, odeme_yontemi_ids)

        sozlesme_data = {'toplam': 0, 'adet': 0}
        gelir_data = {'toplam': 0, 'adet': 0}
        cari_data = {'toplam': 0, 'adet': 0}
        yontem_rows: list[dict] = []
        detail_rows: list[dict] = []

        if not kaynak or kaynak == 'sozlesme':
            soz_ids = _sozlesme_ids(kurum_id, sube_id, egitim_yili_id)
            th_q = Q(
                sozlesme_id__in=soz_ids,
                durum=TahsilatDurum.AKTIF,
                tahsilat_tarihi__gte=baslangic,
                tahsilat_tarihi__lte=bitis,
            ) & ~Q(tahsilat_turu=TahsilatTuru.IADE) & yontem_q
            agg = Tahsilat.objects.filter(th_q).aggregate(t=Sum('tutar'), a=Count('id'))
            sozlesme_data = {'toplam': int(agg['t'] or 0), 'adet': int(agg['a'] or 0)}
            yontem_rows.extend(
                Tahsilat.objects.filter(th_q)
                .values('odeme_yontemi__tip', 'odeme_yontemi__ad')
                .annotate(toplam=Sum('tutar'), adet=Count('id'))
            )
            for th in Tahsilat.objects.filter(th_q).only('tahsilat_tarihi', 'tutar'):
                detail_rows.append({'tarih': th.tahsilat_tarihi.isoformat(), 'tutar': th.tutar})

        if not kaynak or kaynak == 'gelir':
            gt_q = Q(
                gelir_kaydi__kurum_id=kurum_id,
                durum=OdemeDurum.TAMAMLANDI,
                tahsilat_tarihi__gte=baslangic,
                tahsilat_tarihi__lte=bitis,
            ) & yontem_q
            if sube_id:
                gt_q &= Q(gelir_kaydi__sube_id=sube_id)
            if egitim_yili_id:
                gt_q &= Q(gelir_kaydi__egitim_yili_id=egitim_yili_id)
            agg = GelirTahsilat.objects.filter(gt_q).aggregate(t=Sum('tutar'), a=Count('id'))
            gelir_data = {'toplam': int(agg['t'] or 0), 'adet': int(agg['a'] or 0)}
            yontem_rows.extend(
                GelirTahsilat.objects.filter(gt_q)
                .values('odeme_yontemi__tip', 'odeme_yontemi__ad')
                .annotate(toplam=Sum('tutar'), adet=Count('id'))
            )
            for gt in GelirTahsilat.objects.filter(gt_q).only('tahsilat_tarihi', 'tutar'):
                detail_rows.append({'tarih': gt.tahsilat_tarihi.isoformat(), 'tutar': int(gt.tutar)})

        if not kaynak or kaynak == 'cari':
            ch_q = Q(
                kurum_id=kurum_id,
                islem_turu=CariHareketTuru.TAHSILAT,
                islem_tarihi__gte=baslangic,
                islem_tarihi__lte=bitis,
            )
            if sube_id:
                ch_q &= Q(sube_id=sube_id)
            if egitim_yili_id:
                ch_q &= Q(egitim_yili_id=egitim_yili_id)
            agg = CariHareket.objects.filter(ch_q).aggregate(t=Sum('tutar'), a=Count('id'))
            cari_data = {'toplam': int(agg['t'] or 0), 'adet': int(agg['a'] or 0)}
            for ch in CariHareket.objects.filter(ch_q).only('islem_tarihi', 'tutar'):
                detail_rows.append({'tarih': ch.islem_tarihi.isoformat(), 'tutar': int(ch.tutar)})

        kaynaklar = {'sozlesme': sozlesme_data, 'gelir': gelir_data, 'cari': cari_data}
        toplam_tutar = sum(k['toplam'] for k in kaynaklar.values())
        toplam_adet = sum(k['adet'] for k in kaynaklar.values())

        yontem_dagilimi = _aggregate_yontem_rows(yontem_rows, toplam_tutar)

        beklenen = cls._expected_total(
            kurum_id=kurum_id,
            baslangic=baslangic,
            bitis=bitis,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
            kaynak=kaynak,
        )
        tahsil_orani = None
        if beklenen > 0:
            tahsil_orani = round(toplam_tutar / beklenen * 100, 1)

        return {
            'mode': 'alinan',
            'baslangic': baslangic.isoformat(),
            'bitis': bitis.isoformat(),
            'ozet': {
                'toplam_tutar': toplam_tutar,
                'toplam_adet': toplam_adet,
                'tahsil_orani': tahsil_orani,
                'beklenen_tutar': beklenen if beklenen else None,
                'yontem_dagilimi': yontem_dagilimi,
                'kaynak_kirilimi': cls._build_kaynak_kirilimi(kaynaklar, toplam_tutar),
                'grafik': cls._daily_grafik(detail_rows),
            },
        }

    @classmethod
    def _expected_total(cls, **kwargs) -> int:
        data = cls._summary_beklenen_raw(**kwargs)
        return sum(int(v['toplam']) for v in data.values())

    @classmethod
    def _summary_beklenen_raw(cls, **kwargs) -> dict[str, dict]:
        kurum_id = kwargs['kurum_id']
        baslangic = kwargs['baslangic']
        bitis = kwargs['bitis']
        sube_id = kwargs.get('sube_id')
        egitim_yili_id = kwargs.get('egitim_yili_id')
        kaynak = kwargs.get('kaynak')

        sozlesme_beklenen = {'toplam': 0, 'adet': 0, 'alinan': 0, 'kalan': 0}
        gelir_beklenen = {'toplam': 0, 'adet': 0, 'alinan': 0, 'kalan': 0}
        cari_beklenen = {'toplam': 0, 'adet': 0, 'alinan': 0, 'kalan': 0}

        if not kaynak or kaynak == 'sozlesme':
            soz_ids = _sozlesme_ids(kurum_id, sube_id, egitim_yili_id)
            adet = 0
            toplam = 0
            alinan = 0
            kalan = 0
            for t in Taksit.objects.filter(
                sozlesme_id__in=soz_ids,
                vade_tarihi__gte=baslangic,
                vade_tarihi__lte=bitis,
            ):
                tutar = int(t.tutar or 0)
                odenen = int(t.odenen_tutar or 0)
                kalan_t = int(t.kalan_tutar or 0)
                toplam += tutar
                alinan += odenen
                kalan += kalan_t
                adet += 1
            sozlesme_beklenen = {'toplam': toplam, 'adet': adet, 'alinan': alinan, 'kalan': kalan}

        if not kaynak or kaynak == 'gelir':
            from apps.finans.domain.gelir_kaydi import GelirKaydi
            from apps.finans.constants.cari_types import GelirDurum

            gq = Q(
                kurum_id=kurum_id,
                durum=GelirDurum.ONAYLANDI,
                vade_tarihi__gte=baslangic,
                vade_tarihi__lte=bitis,
            )
            if sube_id:
                gq &= Q(sube_id=sube_id)
            if egitim_yili_id:
                gq &= Q(egitim_yili_id=egitim_yili_id)
            adet = 0
            toplam = 0
            alinan = 0
            kalan = 0
            for g in GelirKaydi.objects.filter(gq).prefetch_related('tahsilatlar'):
                brut = int(g.brut_tutar)
                odenen = sum(
                    int(t.tutar) for t in g.tahsilatlar.filter(durum=OdemeDurum.TAMAMLANDI)
                )
                kalan_t = brut - odenen
                toplam += brut
                alinan += odenen
                kalan += max(kalan_t, 0)
                adet += 1
            gelir_beklenen = {'toplam': toplam, 'adet': adet, 'alinan': alinan, 'kalan': kalan}

        return {
            'sozlesme': sozlesme_beklenen,
            'gelir': gelir_beklenen,
            'cari': cari_beklenen,
        }

    @classmethod
    def _beklenen_yontem_dagilimi(cls, **kwargs) -> list[dict]:
        """Vadesi dönem içinde olan kalemlere yapılan tahsilatların yöntem dağılımı."""
        kurum_id = kwargs['kurum_id']
        baslangic = kwargs['baslangic']
        bitis = kwargs['bitis']
        sube_id = kwargs.get('sube_id')
        egitim_yili_id = kwargs.get('egitim_yili_id')
        kaynak = kwargs.get('kaynak')
        selected_tips = _selected_yontem_tipleri(kwargs)
        yontem_rows: list[dict] = []

        if not kaynak or kaynak == 'sozlesme':
            soz_ids = _sozlesme_ids(kurum_id, sube_id, egitim_yili_id)
            taksit_ids = list(Taksit.objects.filter(
                sozlesme_id__in=soz_ids,
                vade_tarihi__gte=baslangic,
                vade_tarihi__lte=bitis,
            ).values_list('id', flat=True))
            if taksit_ids:
                th_q = Q(
                    taksit_id__in=taksit_ids,
                    durum=TahsilatDurum.AKTIF,
                ) & ~Q(tahsilat_turu=TahsilatTuru.IADE)
                if selected_tips:
                    th_q &= Q(odeme_yontemi__tip__in=selected_tips)
                yontem_rows.extend(
                    Tahsilat.objects.filter(th_q)
                    .values('odeme_yontemi__tip')
                    .annotate(toplam=Sum('tutar'), adet=Count('id'))
                )

        if not kaynak or kaynak == 'gelir':
            from apps.finans.domain.gelir_kaydi import GelirKaydi
            from apps.finans.constants.cari_types import GelirDurum

            gq = Q(
                kurum_id=kurum_id,
                durum=GelirDurum.ONAYLANDI,
                vade_tarihi__gte=baslangic,
                vade_tarihi__lte=bitis,
            )
            if sube_id:
                gq &= Q(sube_id=sube_id)
            if egitim_yili_id:
                gq &= Q(egitim_yili_id=egitim_yili_id)
            gelir_ids = list(GelirKaydi.objects.filter(gq).values_list('id', flat=True))
            if gelir_ids:
                gt_q = Q(
                    gelir_kaydi_id__in=gelir_ids,
                    durum=OdemeDurum.TAMAMLANDI,
                )
                if selected_tips:
                    gt_q &= Q(odeme_yontemi__tip__in=selected_tips)
                yontem_rows.extend(
                    GelirTahsilat.objects.filter(gt_q)
                    .values('odeme_yontemi__tip')
                    .annotate(toplam=Sum('tutar'), adet=Count('id'))
                )

        toplam_alinan = sum(int(y.get('toplam') or 0) for y in yontem_rows)
        return _aggregate_yontem_rows(yontem_rows, toplam_alinan)

    @classmethod
    def _summary_beklenen(cls, **kwargs) -> dict:
        baslangic = kwargs['baslangic']
        bitis = kwargs['bitis']
        kaynaklar = cls._summary_beklenen_raw(**kwargs)
        toplam_beklenen = sum(int(v['toplam']) for v in kaynaklar.values())
        toplam_alinan = sum(int(v.get('alinan') or 0) for v in kaynaklar.values())
        toplam_kalan = sum(int(v.get('kalan') or 0) for v in kaynaklar.values())
        toplam_adet = sum(int(v['adet']) for v in kaynaklar.values())

        rows = cls.period_details(mode='beklenen', **kwargs)
        grafik_rows = [
            {'tarih': r.get('vade_tarihi') or r.get('tarih'), 'tutar': r.get('toplam_tutar') or r['tutar']}
            for r in rows
        ]
        yontem_dagilimi = cls._beklenen_yontem_dagilimi(**kwargs)
        tahsil_orani = round(toplam_alinan / toplam_beklenen * 100, 1) if toplam_beklenen else None

        kirilim_kaynaklar = {
            k: {'toplam': v['toplam'], 'adet': v['adet']}
            for k, v in kaynaklar.items()
        }

        return {
            'mode': 'beklenen',
            'baslangic': baslangic.isoformat(),
            'bitis': bitis.isoformat(),
            'ozet': {
                'toplam_tutar': toplam_beklenen,
                'toplam_adet': toplam_adet,
                'toplam_alinan': toplam_alinan,
                'toplam_kalan': toplam_kalan,
                'tahsil_orani': tahsil_orani,
                'beklenen_tutar': toplam_beklenen,
                'yontem_dagilimi': yontem_dagilimi,
                'kaynak_kirilimi': cls._build_kaynak_kirilimi(kirilim_kaynaklar, toplam_beklenen),
                'grafik': cls._daily_grafik(grafik_rows),
            },
        }

    @classmethod
    def period_details(
        cls,
        *,
        kurum_id: int,
        baslangic: date,
        bitis: date,
        mode: str = 'alinan',
        sube_id=None,
        egitim_yili_id=None,
        odeme_yontemi_tipi: str | None = None,
        odeme_yontemi_tipleri: list[str] | None = None,
        odeme_yontemi_ids: list[int] | None = None,
        kaynak: str | None = None,
    ) -> list[dict]:
        mode = (mode or 'alinan').lower()
        kaynak = _normalize_kaynak(kaynak)
        yontem_q = _yontem_filter(odeme_yontemi_tipi, odeme_yontemi_tipleri, odeme_yontemi_ids)
        rows: list[dict] = []

        if mode == 'beklenen':
            selected_tips = _selected_yontem_tipleri({
                'odeme_yontemi_tipi': odeme_yontemi_tipi,
                'odeme_yontemi_tipleri': odeme_yontemi_tipleri,
            })
            soz_ids = _sozlesme_ids(kurum_id, sube_id, egitim_yili_id)
            if not kaynak or kaynak == 'sozlesme':
                for t in Taksit.objects.filter(
                    sozlesme_id__in=soz_ids,
                    vade_tarihi__gte=baslangic,
                    vade_tarihi__lte=bitis,
                ).select_related('sozlesme__ogrenci', 'sozlesme__sube'):
                    ogr = t.sozlesme.ogrenci
                    kisi = f'{ogr.ad} {ogr.soyad}'.strip() if ogr else '—'
                    toplam_t = int(t.tutar or 0)
                    odenen = int(t.odenen_tutar or 0)
                    kalan = int(t.kalan_tutar or 0)
                    durum = _tahsil_durumu(odenen, kalan)
                    yontem_tipleri = sorted(_taksit_yontem_tipleri(t.id))
                    rows.append({
                        'id': t.id,
                        'kaynak': 'sozlesme',
                        'kaynak_label': KAYNAK_LABELS['sozlesme'],
                        'kisi_adi': kisi,
                        'tutar': kalan,
                        'toplam_tutar': toplam_t,
                        'odenen_tutar': odenen,
                        'kalan_tutar': kalan,
                        'tahsil_durumu': durum,
                        'tahsil_durumu_label': _tahsil_durumu_label(durum),
                        'odeme_yontemi': _taksit_yontem_label(t.id),
                        'odeme_yontemi_tipi': yontem_tipleri[0] if len(yontem_tipleri) == 1 else None,
                        'odeme_yontemi_tipleri': yontem_tipleri,
                        'tarih': t.vade_tarihi.isoformat(),
                        'vade_tarihi': t.vade_tarihi.isoformat(),
                        'aciklama': f"Sözleşme {t.sozlesme.sozlesme_no} — Taksit {t.taksit_no}",
                        'sozlesme_id': t.sozlesme_id,
                        'sozlesme_no': t.sozlesme.sozlesme_no,
                        'gelir_id': None,
                        'cari_hesap_id': None,
                    })
            if not kaynak or kaynak == 'gelir':
                from apps.finans.domain.gelir_kaydi import GelirKaydi
                from apps.finans.constants.cari_types import GelirDurum

                gq = Q(
                    kurum_id=kurum_id,
                    durum=GelirDurum.ONAYLANDI,
                    vade_tarihi__gte=baslangic,
                    vade_tarihi__lte=bitis,
                )
                if sube_id:
                    gq &= Q(sube_id=sube_id)
                if egitim_yili_id:
                    gq &= Q(egitim_yili_id=egitim_yili_id)
                for g in GelirKaydi.objects.filter(gq).select_related('cari_hesap'):
                    odenen = sum(
                        int(t.tutar) for t in g.tahsilatlar.filter(durum=OdemeDurum.TAMAMLANDI)
                    )
                    toplam_t = int(g.brut_tutar)
                    kalan = toplam_t - odenen
                    durum = _tahsil_durumu(odenen, max(kalan, 0))
                    yontem_tipleri = sorted(_gelir_yontem_tipleri(g.id))
                    rows.append({
                        'id': g.id,
                        'kaynak': 'gelir',
                        'kaynak_label': KAYNAK_LABELS['gelir'],
                        'kisi_adi': g.cari_hesap.unvan if g.cari_hesap_id else (g.fatura_no or f'Gelir #{g.id}'),
                        'tutar': max(kalan, 0),
                        'toplam_tutar': toplam_t,
                        'odenen_tutar': odenen,
                        'kalan_tutar': max(kalan, 0),
                        'tahsil_durumu': durum,
                        'tahsil_durumu_label': _tahsil_durumu_label(durum),
                        'odeme_yontemi': _gelir_yontem_label(g.id),
                        'odeme_yontemi_tipi': yontem_tipleri[0] if len(yontem_tipleri) == 1 else None,
                        'odeme_yontemi_tipleri': yontem_tipleri,
                        'tarih': g.vade_tarihi.isoformat() if g.vade_tarihi else '',
                        'vade_tarihi': g.vade_tarihi.isoformat() if g.vade_tarihi else None,
                        'aciklama': g.fatura_no or f'Gelir #{g.id}',
                        'sozlesme_id': None,
                        'sozlesme_no': None,
                        'gelir_id': g.id,
                        'cari_hesap_id': g.cari_hesap_id,
                    })
            if selected_tips:
                rows = [r for r in rows if _beklenen_row_matches_yontem(r, selected_tips)]
            rows.sort(key=lambda r: (r['tarih'], r['id']))
            return rows

        if not kaynak or kaynak == 'sozlesme':
            soz_ids = _sozlesme_ids(kurum_id, sube_id, egitim_yili_id)
            th_q = Q(
                sozlesme_id__in=soz_ids,
                durum=TahsilatDurum.AKTIF,
                tahsilat_tarihi__gte=baslangic,
                tahsilat_tarihi__lte=bitis,
            ) & ~Q(tahsilat_turu=TahsilatTuru.IADE) & yontem_q
            for th in Tahsilat.objects.filter(th_q).select_related(
                'sozlesme__ogrenci', 'sozlesme__sube', 'odeme_yontemi',
            ):
                ogr = th.sozlesme.ogrenci
                kisi = f'{ogr.ad} {ogr.soyad}'.strip() if ogr else '—'
                rows.append({
                    'id': th.id,
                    'kaynak': 'sozlesme',
                    'kaynak_label': KAYNAK_LABELS['sozlesme'],
                    'kisi_adi': kisi,
                    'tutar': th.tutar,
                    'odeme_yontemi': _yontem_label(th.odeme_yontemi.tip) if th.odeme_yontemi_id else None,
                    'odeme_yontemi_tipi': th.odeme_yontemi.tip if th.odeme_yontemi_id else None,
                    'tahsil_durumu': 'odendi',
                    'tahsil_durumu_label': 'Alındı',
                    'tarih': th.tahsilat_tarihi.isoformat(),
                    'kayit_zamani': _kayit_zamani(th.created_at),
                    'vade_tarihi': None,
                    'aciklama': f"Söz. {th.sozlesme.sozlesme_no}",
                    'sozlesme_id': th.sozlesme_id,
                    'sozlesme_no': th.sozlesme.sozlesme_no,
                    'gelir_id': None,
                    'cari_hesap_id': None,
                })

        if not kaynak or kaynak == 'gelir':
            gt_q = Q(
                gelir_kaydi__kurum_id=kurum_id,
                durum=OdemeDurum.TAMAMLANDI,
                tahsilat_tarihi__gte=baslangic,
                tahsilat_tarihi__lte=bitis,
            ) & yontem_q
            if sube_id:
                gt_q &= Q(gelir_kaydi__sube_id=sube_id)
            if egitim_yili_id:
                gt_q &= Q(gelir_kaydi__egitim_yili_id=egitim_yili_id)
            for gt in GelirTahsilat.objects.filter(gt_q).select_related(
                'gelir_kaydi__sube', 'gelir_kaydi__cari_hesap', 'odeme_yontemi',
            ):
                gk = gt.gelir_kaydi
                kisi = (
                    gk.cari_hesap.unvan if gk.cari_hesap_id
                    else (gk.fatura_no or f'Gelir #{gk.id}')
                )
                rows.append({
                    'id': gt.id,
                    'kaynak': 'gelir',
                    'kaynak_label': KAYNAK_LABELS['gelir'],
                    'kisi_adi': kisi,
                    'tutar': int(gt.tutar),
                    'odeme_yontemi': _yontem_label(gt.odeme_yontemi.tip) if gt.odeme_yontemi_id else None,
                    'odeme_yontemi_tipi': gt.odeme_yontemi.tip if gt.odeme_yontemi_id else None,
                    'tahsil_durumu': 'odendi',
                    'tahsil_durumu_label': 'Alındı',
                    'tarih': gt.tahsilat_tarihi.isoformat(),
                    'kayit_zamani': _kayit_zamani(gt.created_at),
                    'vade_tarihi': None,
                    'aciklama': gk.fatura_no or f'Gelir #{gk.id}',
                    'sozlesme_id': None,
                    'sozlesme_no': None,
                    'gelir_id': gk.id,
                    'cari_hesap_id': gk.cari_hesap_id,
                })

        if not kaynak or kaynak == 'cari':
            ch_q = Q(
                kurum_id=kurum_id,
                islem_turu=CariHareketTuru.TAHSILAT,
                islem_tarihi__gte=baslangic,
                islem_tarihi__lte=bitis,
            )
            if sube_id:
                ch_q &= Q(sube_id=sube_id)
            if egitim_yili_id:
                ch_q &= Q(egitim_yili_id=egitim_yili_id)
            for ch in CariHareket.objects.filter(ch_q).select_related('sube', 'cari_hesap'):
                rows.append({
                    'id': ch.id,
                    'kaynak': 'cari',
                    'kaynak_label': KAYNAK_LABELS['cari'],
                    'kisi_adi': str(ch.cari_hesap) if ch.cari_hesap_id else '—',
                    'tutar': int(ch.tutar),
                    'odeme_yontemi': None,
                    'odeme_yontemi_tipi': None,
                    'tahsil_durumu': 'odendi',
                    'tahsil_durumu_label': 'Alındı',
                    'tarih': ch.islem_tarihi.isoformat(),
                    'kayit_zamani': _kayit_zamani(ch.created_at),
                    'vade_tarihi': None,
                    'aciklama': ch.aciklama or str(ch.cari_hesap),
                    'sozlesme_id': None,
                    'sozlesme_no': None,
                    'gelir_id': None,
                    'cari_hesap_id': ch.cari_hesap_id,
                })

        rows.sort(key=lambda r: (r['tarih'], r['id']))
        return rows

    @classmethod
    def period_report_payload(cls, **kwargs) -> dict:
        """Tam rapor dışa aktarma için özet + tüm satırlar."""
        summary = cls.period_summary(**kwargs)
        rows = cls.period_details(**kwargs)
        return {**summary, 'rows': rows, 'count': len(rows)}
