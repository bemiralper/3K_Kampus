"""
Geciken Taksitler — tahsilat takip merkezi veri katmanı.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from django.db.models import Count, Max, Q, QuerySet, Sum
from django.utils import timezone

from apps.communication.application.integration_hooks import (
    SOURCE_ODEME,
    already_sent,
    recently_sent_within_hours,
)
from apps.odeme_takip.domain.enums import TahsilatDurum, TahsilatTuru, TaksitDurum
from apps.odeme_takip.domain.models import Tahsilat, Taksit
from apps.odeme_takip.domain.overdue import (
    active_sozlesme_q,
    gecikme_gunu,
    get_overdue_taksit_queryset,
    get_upcoming_taksit_queryset,
    overdue_base_q,
)


@dataclass
class OverdueTrackingParams:
    kurum_id: int
    sube_id: int | None = None
    egitim_yili_id: int | None = None
    durum: str = 'gecikmis'  # gecikmis | bugun_vadeli | yaklasan
    baslangic: date | None = None
    bitis: date | None = None
    sinif_id: int | None = None
    ogrenci_id: int | None = None
    rehber_id: int | None = None
    gecikme_araligi: str | None = None  # 1-7 | 8-15 | 16-30 | 30+
    min_tutar: int | None = None
    max_tutar: int | None = None
    min_gecikme_gun: int | None = None
    arama: str = ''
    ordering: str = '-gecikme_gun'
    page: int = 1
    page_size: int = 25


OVERDUE_EXPORT_COLUMNS = [
    {'key': 'ogrenci_adi', 'label': 'Öğrenci'},
    {'key': 'ogrenci_no', 'label': 'Numara'},
    {'key': 'veli_adi', 'label': 'Veli'},
    {'key': 'veli_telefon', 'label': 'Telefon'},
    {'key': 'sube_ad', 'label': 'Şube'},
    {'key': 'sinif_ad', 'label': 'Sınıf'},
    {'key': 'rehber_ogretmen', 'label': 'Rehber Öğretmen'},
    {'key': 'sozlesme_no', 'label': 'Sözleşme No'},
    {'key': 'taksit_no', 'label': 'Taksit No'},
    {'key': 'vade_tarihi', 'label': 'Son Ödeme Tarihi'},
    {'key': 'gecikme_gun', 'label': 'Gecikme Günü'},
    {'key': 'taksit_tutari', 'label': 'Taksit Tutarı'},
    {'key': 'sozlesme_tutari', 'label': 'Toplam Sözleşme Tutarı'},
    {'key': 'toplam_odenen', 'label': 'Toplam Ödenen'},
    {'key': 'toplam_kalan_borc', 'label': 'Toplam Kalan Borç'},
    {'key': 'son_tahsilat_tutari', 'label': 'Son Ödeme Tutarı'},
    {'key': 'kalan_tutar', 'label': 'Kalan Borç'},
    {'key': 'son_tahsilat_tarihi', 'label': 'Son Tahsilat'},
    {'key': 'durum_label', 'label': 'Durum'},
]


def resolve_export_columns(
    all_columns: list[dict[str, str]],
    requested: str | None,
) -> list[dict[str, str]]:
    """İstemciden gelen columns=ogrenci_adi,veli_adi ile export sütunlarını filtreler."""
    if not requested or not str(requested).strip():
        return all_columns
    keys = [k.strip() for k in str(requested).split(',') if k.strip()]
    col_map = {c['key']: c for c in all_columns}
    filtered = [col_map[k] for k in keys if k in col_map]
    return filtered if filtered else all_columns


def _durum_label(gecikme: int, *, liste_durumu: str) -> str:
    if liste_durumu == 'bugun_vadeli':
        return 'Bugün Vadeli'
    if liste_durumu == 'yaklasan':
        return 'Yaklaşan Vade'
    if gecikme >= 30:
        return '30+ Gün Gecikmiş'
    if gecikme >= 8:
        return '8-30 Gün Gecikmiş'
    if gecikme >= 1:
        return '1-7 Gün Gecikmiş'
    return 'Gecikmiş'


def _durum_renk(gecikme: int, *, liste_durumu: str) -> str:
    if liste_durumu in ('bugun_vadeli', 'yaklasan'):
        return 'blue'
    if gecikme >= 30:
        return 'red'
    if gecikme >= 8:
        return 'orange'
    return 'yellow'


class OverdueTrackingService:
    """Geciken taksit listesi, özet ve detay."""

    def build_queryset(self, params: OverdueTrackingParams) -> QuerySet:
        today = timezone.localdate()
        durum = (params.durum or 'gecikmis').lower()

        if durum == 'bugun_vadeli':
            qs = (
                Taksit.objects.filter(
                    vade_tarihi=today,
                    kalan_tutar__gt=0,
                    durum__in=[
                        TaksitDurum.BEKLEMEDE,
                        TaksitDurum.KISMI_ODENDI,
                        TaksitDurum.GECIKTI,
                    ],
                )
                .filter(active_sozlesme_q(
                    kurum_id=params.kurum_id,
                    sube_id=params.sube_id,
                    egitim_yili_id=params.egitim_yili_id,
                ))
            )
        elif durum == 'yaklasan':
            bitis = today + timedelta(days=30)
            qs = get_upcoming_taksit_queryset(
                kurum_id=params.kurum_id,
                sube_id=params.sube_id,
                egitim_yili_id=params.egitim_yili_id,
                baslangic=today + timedelta(days=1),
                bitis=bitis,
                arama='',
            )
        else:
            qs = get_overdue_taksit_queryset(
                kurum_id=params.kurum_id,
                sube_id=params.sube_id,
                egitim_yili_id=params.egitim_yili_id,
                min_gecikme_gun=params.min_gecikme_gun,
                arama='',
            )

        qs = qs.select_related(
            'sozlesme__ogrenci',
            'sozlesme__veli',
            'sozlesme__sube',
            'sozlesme__egitim_yili',
            'sozlesme__kurum',
            'sozlesme__ogrenci_kayit__sinif',
        )

        if params.baslangic:
            qs = qs.filter(vade_tarihi__gte=params.baslangic)
        if params.bitis:
            qs = qs.filter(vade_tarihi__lte=params.bitis)

        if params.sinif_id:
            qs = qs.filter(sozlesme__ogrenci_kayit__sinif_id=params.sinif_id)

        if params.ogrenci_id:
            qs = qs.filter(sozlesme__ogrenci_id=params.ogrenci_id)

        if params.rehber_id:
            from apps.coaching.models import CoachStudentAssignment

            ogrenci_ids = CoachStudentAssignment.objects.filter(
                coach_id=params.rehber_id,
                is_primary=True,
            ).filter(
                Q(end_date__isnull=True) | Q(end_date__gte=today),
            ).values_list('student_id', flat=True)
            qs = qs.filter(sozlesme__ogrenci_id__in=ogrenci_ids)

        if params.gecikme_araligi and durum == 'gecikmis':
            qs = self._apply_gecikme_araligi(qs, params.gecikme_araligi, today)

        if params.min_tutar:
            qs = qs.filter(kalan_tutar__gte=params.min_tutar)
        if params.max_tutar:
            qs = qs.filter(kalan_tutar__lte=params.max_tutar)

        arama = (params.arama or '').strip()
        if arama:
            qs = qs.filter(
                Q(sozlesme__sozlesme_no__icontains=arama)
                | Q(sozlesme__ogrenci__ad__icontains=arama)
                | Q(sozlesme__ogrenci__soyad__icontains=arama)
                | Q(sozlesme__ogrenci_kayit__okul_no__icontains=arama)
                | Q(sozlesme__veli__ad__icontains=arama)
                | Q(sozlesme__veli__soyad__icontains=arama)
                | Q(sozlesme__veli__telefon__icontains=arama)
            )

        order_map = {
            'vade_tarihi': 'vade_tarihi',
            '-vade_tarihi': '-vade_tarihi',
            'kalan_tutar': 'kalan_tutar',
            '-kalan_tutar': '-kalan_tutar',
            'gecikme_gun': 'vade_tarihi',
            '-gecikme_gun': '-vade_tarihi',
            'ogrenci_adi': 'sozlesme__ogrenci__ad',
            '-ogrenci_adi': '-sozlesme__ogrenci__ad',
            'taksit_no': 'taksit_no',
            '-taksit_no': '-taksit_no',
        }
        return qs.order_by(order_map.get(params.ordering, '-vade_tarihi'))

    @staticmethod
    def _apply_gecikme_araligi(qs: QuerySet, aralik: str, today: date) -> QuerySet:
        buckets = {
            '1-7': (1, 7),
            '8-15': (8, 15),
            '16-30': (16, 30),
            '30+': (31, 9999),
        }
        bounds = buckets.get(aralik)
        if not bounds:
            return qs
        min_g, max_g = bounds
        qs = qs.filter(vade_tarihi__lte=today - timedelta(days=min_g))
        if max_g < 9999:
            qs = qs.filter(vade_tarihi__gte=today - timedelta(days=max_g))
        return qs

    def compute_ozet(self, params: OverdueTrackingParams) -> dict[str, Any]:
        today = timezone.localdate()
        overdue_qs = get_overdue_taksit_queryset(
            kurum_id=params.kurum_id,
            sube_id=params.sube_id,
            egitim_yili_id=params.egitim_yili_id,
        )

        agg = overdue_qs.aggregate(
            toplam=Sum('kalan_tutar'),
            adet=Count('id'),
        )
        ogrenci_sayisi = overdue_qs.values('sozlesme__ogrenci_id').distinct().count()

        bugun_vadeli = Taksit.objects.filter(
            vade_tarihi=today,
            kalan_tutar__gt=0,
            durum__in=[TaksitDurum.BEKLEMEDE, TaksitDurum.KISMI_ODENDI, TaksitDurum.GECIKTI],
        ).filter(active_sozlesme_q(
            kurum_id=params.kurum_id,
            sube_id=params.sube_id,
            egitim_yili_id=params.egitim_yili_id,
        )).aggregate(toplam=Sum('kalan_tutar'))

        otuz_artı = overdue_qs.filter(
            vade_tarihi__lte=today - timedelta(days=30),
        ).aggregate(toplam=Sum('kalan_tutar'))

        gecikme_sum = 0
        for vade in overdue_qs.values_list('vade_tarihi', flat=True)[:5000]:
            if vade:
                gecikme_sum += max(0, (today - vade).days)
        adet = agg['adet'] or 0
        ortalama = round(gecikme_sum / adet, 1) if adet else 0

        bu_ay_bas = today.replace(day=1)
        tahsil_bu_ay = Tahsilat.objects.filter(
            sozlesme__kurum_id=params.kurum_id,
            tahsilat_tarihi__gte=bu_ay_bas,
            durum=TahsilatDurum.AKTIF,
            taksit__in=overdue_qs.values('id'),
        ).values('taksit_id').distinct().count()
        basari_orani = round(tahsil_bu_ay / adet * 100, 1) if adet else 0

        return {
            'toplam_geciken_tutar': int(agg['toplam'] or 0),
            'geciken_ogrenci_sayisi': ogrenci_sayisi,
            'bugun_vadesi_gelen': int(bugun_vadeli['toplam'] or 0),
            'otuz_artı_geciken': int(otuz_artı['toplam'] or 0),
            'ortalama_gecikme_gun': ortalama,
            'tahsilat_basarisi_orani': basari_orani,
            # geriye dönük uyumluluk
            'toplam_kalan_tutar': int(agg['toplam'] or 0),
            'toplam_taksit_sayisi': adet,
            'kisi_sayisi': ogrenci_sayisi,
            'ortalama_gecikme_gun_legacy': ortalama,
        }

    def list_page(self, params: OverdueTrackingParams) -> dict[str, Any]:
        qs = self.build_queryset(params)
        total = qs.count()
        page = max(1, params.page)
        page_size = min(max(1, params.page_size), 500)
        start = (page - 1) * page_size
        taksitler = list(qs[start:start + page_size])

        rows = self._serialize_rows(taksitler, params.kurum_id, params.durum)
        total_pages = max(1, (total + page_size - 1) // page_size) if total else 1

        return {
            'ozet': self.compute_ozet(params),
            'count': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'results': rows,
        }

    def export_rows(self, params: OverdueTrackingParams) -> list[dict]:
        qs = self.build_queryset(params)
        taksitler = list(qs[:10000])
        return self._serialize_rows(taksitler, params.kurum_id, params.durum)

    def get_detail(self, taksit_id: int, kurum_id: int, *, sube_id: int | None = None) -> dict | None:
        filters = {'id': taksit_id, 'sozlesme__kurum_id': kurum_id}
        if sube_id is not None:
            filters['sozlesme__sube_id'] = sube_id
        taksit = (
            Taksit.objects.filter(**filters)
            .select_related(
                'sozlesme__ogrenci',
                'sozlesme__veli',
                'sozlesme__sube',
                'sozlesme__ogrenci_kayit__sinif',
            )
            .first()
        )
        if not taksit:
            return None

        row = self._serialize_rows([taksit], kurum_id, 'gecikmis')[0]
        soz = taksit.sozlesme
        ogr = soz.ogrenci

        geciken_qs = Taksit.objects.filter(
            overdue_base_q(),
            sozlesme_id=soz.id,
        )
        geciken_tutar = int(geciken_qs.aggregate(t=Sum('kalan_tutar'))['t'] or 0)
        geciken_adet = geciken_qs.count()

        gecmis = self._communication_history(taksit.id, kurum_id, soz.veli_id)

        return {
            **row,
            'ogrenci': {
                'id': ogr.id if ogr else None,
                'ad_soyad': row['ogrenci_adi'],
                'numara': row['ogrenci_no'],
                'sube': row['sube_ad'],
                'sinif': row['sinif_ad'],
            },
            'finans': {
                'sozlesme_no': soz.sozlesme_no,
                'sozlesme_tutari': soz.net_tutar,
                'toplam_odenen': soz.toplam_odenen,
                'kalan_borc': soz.kalan_borc,
                'geciken_tutar': geciken_tutar,
                'geciken_taksit_sayisi': geciken_adet,
                'son_tahsilat_tarihi': row['son_tahsilat_tarihi'],
            },
            'iletisim': {
                'veli': row['veli_adi'],
                'telefon': row['veli_telefon'],
                'email': getattr(soz.veli, 'email', None) if soz.veli else None,
            },
            'gecmis': gecmis,
        }

    def _serialize_rows(
        self,
        taksitler: list[Taksit],
        kurum_id: int,
        liste_durumu: str,
    ) -> list[dict]:
        if not taksitler:
            return []

        today = timezone.localdate()
        sozlesme_ids = {t.sozlesme_id for t in taksitler}
        ogrenci_ids = {t.sozlesme.ogrenci_id for t in taksitler if t.sozlesme.ogrenci_id}

        son_tahsilat_map = {
            row['sozlesme_id']: row['son']
            for row in Tahsilat.objects.filter(
                sozlesme_id__in=sozlesme_ids,
                durum=TahsilatDurum.AKTIF,
            ).exclude(tahsilat_turu=TahsilatTuru.IADE).values('sozlesme_id').annotate(son=Max('tahsilat_tarihi'))
        }

        son_tahsilat_tutar_map: dict[int, int] = {}
        for tah in Tahsilat.objects.filter(
            sozlesme_id__in=sozlesme_ids,
            durum=TahsilatDurum.AKTIF,
        ).exclude(tahsilat_turu=TahsilatTuru.IADE).order_by('sozlesme_id', '-tahsilat_tarihi', '-id'):
            if tah.sozlesme_id not in son_tahsilat_tutar_map:
                son_tahsilat_tutar_map[tah.sozlesme_id] = int(tah.tutar or 0)

        coach_map = self._coach_map(ogrenci_ids)
        veli_totals = self._veli_totals(taksitler)

        rows = []
        for t in taksitler:
            ogr = t.sozlesme.ogrenci
            veli = t.sozlesme.veli
            veli_id = veli.id if veli else None
            gecikme = gecikme_gunu(t)
            if liste_durumu == 'bugun_vadeli':
                gecikme = 0
            elif liste_durumu == 'yaklasan':
                gecikme = max(0, (t.vade_tarihi - today).days) if t.vade_tarihi else 0

            sinif = None
            if t.sozlesme.ogrenci_kayit_id and t.sozlesme.ogrenci_kayit:
                sinif = t.sozlesme.ogrenci_kayit.sinif

            source_id = f'taksit-{t.id}'
            already_24h = False
            if veli_id:
                already_24h = (
                    already_sent(kurum_id, SOURCE_ODEME, source_id, veli_id=veli_id)
                    or recently_sent_within_hours(
                        kurum_id, SOURCE_ODEME, source_id, veli_id=veli_id, hours=24,
                    )
                )

            son_tah = son_tahsilat_map.get(t.sozlesme_id)
            kayit = t.sozlesme.ogrenci_kayit
            ogrenci_no = (kayit.okul_no or '') if kayit else ''

            rows.append({
                'taksit_id': t.id,
                'sozlesme_id': t.sozlesme_id,
                'sozlesme_no': t.sozlesme.sozlesme_no,
                'ogrenci_id': ogr.id if ogr else None,
                'ogrenci_adi': f'{ogr.ad} {ogr.soyad}'.strip() if ogr else '—',
                'ogrenci_no': ogrenci_no,
                'veli_adi': veli.tam_ad if veli else None,
                'veli_telefon': (veli.telefon or None) if veli else None,
                'veli_email': getattr(veli, 'email', None) if veli else None,
                'sube_id': t.sozlesme.sube_id,
                'sube_ad': getattr(t.sozlesme.sube, 'ad', '') if t.sozlesme.sube_id else '',
                'sinif_id': sinif.id if sinif else None,
                'sinif_ad': sinif.ad if sinif else '',
                'rehber_ogretmen': coach_map.get(ogr.id, '') if ogr else '',
                'taksit_no': t.taksit_no,
                'vade_tarihi': t.vade_tarihi.isoformat() if t.vade_tarihi else '',
                'taksit_tutari': int(t.tutar or 0),
                'sozlesme_tutari': int(t.sozlesme.net_tutar or 0),
                'toplam_odenen': int(t.sozlesme.toplam_odenen or 0),
                'toplam_kalan_borc': int(t.sozlesme.kalan_borc or 0),
                'kalan_tutar': int(t.kalan_tutar or 0),
                'gecikme_gun': gecikme,
                'son_tahsilat_tarihi': son_tah.isoformat() if son_tah else None,
                'son_tahsilat_tutari': son_tahsilat_tutar_map.get(t.sozlesme_id),
                'toplam_gecikmis_tutar': veli_totals.get(veli_id, int(t.kalan_tutar or 0)),
                'durum_label': _durum_label(gecikme, liste_durumu=liste_durumu),
                'durum_renk': _durum_renk(gecikme, liste_durumu=liste_durumu),
                'liste_durumu': liste_durumu,
                'egitim_yili_id': t.sozlesme.egitim_yili_id,
                'already_sent_24h': already_24h,
                'cari_hesap_id': None,
            })
        return rows

    @staticmethod
    def _coach_map(ogrenci_ids: set[int]) -> dict[int, str]:
        if not ogrenci_ids:
            return {}
        from apps.coaching.models import CoachStudentAssignment

        today = timezone.localdate()
        result: dict[int, str] = {}
        qs = CoachStudentAssignment.objects.filter(
            student_id__in=ogrenci_ids,
            is_primary=True,
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=today),
        ).select_related('coach__teacher')
        for a in qs:
            teacher = a.coach.teacher
            result[a.student_id] = f'{teacher.ad} {teacher.soyad}'.strip()
        return result

    @staticmethod
    def _veli_totals(taksitler: list[Taksit]) -> dict[int | None, int]:
        totals: dict[int | None, int] = {}
        for t in taksitler:
            vid = t.sozlesme.veli_id
            totals[vid] = totals.get(vid, 0) + int(t.kalan_tutar or 0)
        return totals

    @staticmethod
    def _communication_history(taksit_id: int, kurum_id: int, veli_id: int | None) -> dict:
        from apps.communication.domain.models import Message

        source_id = f'taksit-{taksit_id}'
        son_wa = Message.objects.filter(
            source_module=SOURCE_ODEME,
            source_ref_id=source_id,
            conversation__kurum_id=kurum_id,
        ).order_by('-created_at').values_list('created_at', flat=True).first()

        son_wa_veli = None
        if veli_id:
            son_wa_veli = Message.objects.filter(
                conversation__kurum_id=kurum_id,
                conversation__veli_id=veli_id,
                direction='OUTBOUND',
            ).order_by('-created_at').values_list('created_at', flat=True).first()

        return {
            'son_arama': None,
            'son_whatsapp': son_wa.isoformat() if son_wa else (
                son_wa_veli.isoformat() if son_wa_veli else None
            ),
            'son_not': None,
        }


def params_from_request(request) -> OverdueTrackingParams:
    from apps.finans.application.period.period_service import parse_date
    from shared.context import get_secili_kurum_id

    def _int(value):
        if value in (None, ''):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    kurum_id = _int(request.query_params.get('kurum_id')) or get_secili_kurum_id(request)

    return OverdueTrackingParams(
        kurum_id=int(kurum_id),
        sube_id=_int(request.query_params.get('sube_id')),
        egitim_yili_id=_int(request.query_params.get('egitim_yili_id')),
        durum=request.query_params.get('durum') or 'gecikmis',
        baslangic=parse_date(request.query_params.get('baslangic')),
        bitis=parse_date(request.query_params.get('bitis')),
        sinif_id=_int(request.query_params.get('sinif_id')),
        ogrenci_id=_int(request.query_params.get('ogrenci_id')),
        rehber_id=_int(request.query_params.get('rehber_id')),
        gecikme_araligi=request.query_params.get('gecikme_araligi') or None,
        min_tutar=_int(request.query_params.get('min_tutar')),
        max_tutar=_int(request.query_params.get('max_tutar')),
        min_gecikme_gun=_int(request.query_params.get('min_gecikme_gun')),
        arama=request.query_params.get('arama', ''),
        ordering=request.query_params.get('ordering', '-gecikme_gun'),
        page=_int(request.query_params.get('page')) or 1,
        page_size=_int(request.query_params.get('page_size')) or 25,
    )
