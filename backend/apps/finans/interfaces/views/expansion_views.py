"""
Finans modülü genişletme API view'ları — Faz 1–3.
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework.response import Response

from apps.finans.application.export.export_service import ExportService
from apps.finans.application.overdue_reminder_service import OverdueReminderService
from apps.finans.application.period.period_service import PeriodService, parse_date
from apps.finans.application.reports.report_service import REPORT_SLUGS, ReportService
from apps.finans.interfaces.views.base import FinansAPIView
from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube
from apps.finans.application.overdue_tracking_service import (
    OVERDUE_EXPORT_COLUMNS,
    OverdueTrackingService,
    params_from_request,
    resolve_export_columns,
)
from shared.context import get_secili_kurum_id
from shared.permissions import FinansModulePermission, user_has_any_permission


class FinansManageAndCommunicationWritePermission(FinansModulePermission):
    """POST hatırlatma — finans.manage + communication.write."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return super().has_permission(request, view)
        return (
            user_has_any_permission(request.user, 'finans.manage')
            and user_has_any_permission(request.user, 'communication.write', 'communication.manage')
        )


def _int_param(value):
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _bool_param(value) -> bool:
    if value in (None, '', False):
        return False
    if isinstance(value, bool):
        return value
    return str(value).lower() in ('1', 'true', 'yes', 'on')


def _resolve_kurum_id(request) -> int | None:
    return _int_param(request.query_params.get('kurum_id')) or get_secili_kurum_id(request)


def _resolve_kurum_id_from_body(request) -> int | None:
    return _int_param(request.data.get('kurum_id')) or get_secili_kurum_id(request)


def _enrich_filters_meta(filters_meta: dict | None, kurum_id: int | None) -> dict:
    meta = dict(filters_meta or {})
    if kurum_id and 'kurum_ad' not in meta:
        try:
            from apps.kurum.domain.models import Kurum

            ad = Kurum.objects.filter(id=kurum_id).values_list('ad', flat=True).first()
            if ad:
                meta['kurum_ad'] = ad
        except Exception:
            pass
    sube_id = meta.get('sube_id')
    if sube_id and 'sube_ad' not in meta and 'sube' not in meta:
        try:
            from apps.sube.domain.models import Sube

            ad = Sube.objects.filter(id=sube_id).values_list('ad', flat=True).first()
            if ad:
                meta['sube_ad'] = ad
        except Exception:
            pass
    return meta


def _parse_odeme_yontemi_ids(request) -> list[int] | None:
    ids = []
    for raw in request.query_params.getlist('odeme_yontemi_id'):
        parsed = _int_param(raw)
        if parsed:
            ids.append(parsed)
    return ids or None


def _parse_odeme_yontemi_tipleri(request) -> list[str] | None:
    tips = []
    for raw in request.query_params.getlist('odeme_yontemi_tipi'):
        val = (raw or '').strip()
        if val:
            tips.append(val)
    return tips or None


def _normalize_kaynak(value: str | None) -> str | None:
    if not value or value == 'hepsi':
        return None
    return value


class ExportFormatMixin:
    """DRF ?format=csv 404 sorununu önler — export formatını view'da işler."""

    EXPORT_FORMATS = ('json', 'csv', 'xlsx', 'pdf')

    def initial(self, request, *args, **kwargs):
        raw = request.query_params.get('format', 'json')
        self.export_format = raw.lower() if raw else 'json'
        if self.export_format in ('csv', 'xlsx', 'pdf') and hasattr(request, '_request'):
            mutable = request._request.GET.copy()
            mutable.pop('format', None)
            request._request.GET = mutable
        super().initial(request, *args, **kwargs)

    def get_export_format(self) -> str:
        return getattr(self, 'export_format', 'json')


def _paginate(rows: list, page: int, page_size: int) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 500)
    total = len(rows)
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    start = (page - 1) * page_size
    end = start + page_size
    return {
        'count': total,
        'page': page,
        'page_size': page_size,
        'total_pages': total_pages,
        'results': rows[start:end],
    }


def _export_or_json(request, rows, columns, *, title, filters_meta=None, extra=None, export_format=None):
    fmt = (export_format or request.query_params.get('format') or 'json').lower()
    if fmt == 'json':
        payload = {
            'title': title,
            'filters': filters_meta or {},
            'count': len(rows),
            'results': rows,
        }
        if extra:
            payload.update(extra)
        return Response(payload)

    try:
        kurum_id = _int_param((filters_meta or {}).get('kurum_id'))
        meta = _enrich_filters_meta(filters_meta, kurum_id)
        orientation = ExportService._normalize_orientation(
            request.query_params.get('orientation'),
        )
        result = ExportService.build(
            fmt, rows, columns, title=title, filters_meta=meta, orientation=orientation,
        )
    except (ValueError, RuntimeError) as exc:
        return Response({'error': str(exc)}, status=400)

    if isinstance(result, dict):
        if extra:
            result.update(extra)
        return Response(result)
    return result


OVERDUE_COLUMNS = OVERDUE_EXPORT_COLUMNS

PERIOD_DETAIL_COLUMNS = [
    {'key': 'tarih', 'label': 'Tarih'},
    {'key': 'kaynak', 'label': 'Kaynak'},
    {'key': 'tutar', 'label': 'Tutar (TL)'},
    {'key': 'aciklama', 'label': 'Açıklama'},
    {'key': 'sube_ad', 'label': 'Şube'},
    {'key': 'odeme_yontemi_tipi', 'label': 'Ödeme Yöntemi'},
]


class OverduePaymentsView(ExportFormatMixin, FinansAPIView):
    """GET /finans/api/overdue-payments/ — Geciken Taksitler takip merkezi."""

    def get(self, request):
        kurum_id = _resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        params = params_from_request(request)
        params.kurum_id = kurum_id
        params.sube_id = sube_id

        if _bool_param(request.query_params.get('bu_ay_vadesi')):
            today = timezone.localdate()
            params.baslangic = today.replace(day=1)
            params.bitis = today

        service = OverdueTrackingService()
        fmt = self.get_export_format()

        if fmt != 'json':
            rows = service.export_rows(params)
            ozet = service.compute_ozet(params)
            export_columns = resolve_export_columns(
                OVERDUE_COLUMNS,
                request.query_params.get('columns'),
            )
            filters_meta = {
                'kurum_id': kurum_id,
                'sube_id': sube_id or '',
                'egitim_yili_id': params.egitim_yili_id or '',
                'durum': params.durum,
                'toplam_kalan': ozet.get('toplam_geciken_tutar'),
                'adet': ozet.get('toplam_taksit_sayisi'),
            }
            return _export_or_json(
                request,
                rows,
                export_columns,
                title='Geciken Taksitler',
                filters_meta=filters_meta,
                extra={'ozet': ozet},
                export_format=fmt,
            )

        return Response(service.list_page(params))


class OverduePaymentDetailView(FinansAPIView):
    """GET /finans/api/overdue-payments/<taksit_id>/"""

    def get(self, request, taksit_id: int):
        kurum_id = _resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        detail = OverdueTrackingService().get_detail(taksit_id, kurum_id, sube_id=sube_id)
        if not detail:
            return Response({'error': 'Kayıt bulunamadı.'}, status=404)
        return Response(detail)


class PeriodSummaryView(FinansAPIView):
    """GET /finans/api/period-summary/"""

    def get(self, request):
        kurum_id = _resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        baslangic = parse_date(request.query_params.get('baslangic'))
        bitis = parse_date(request.query_params.get('bitis'))
        if not baslangic or not bitis:
            return Response({'error': 'baslangic ve bitis zorunlu (YYYY-MM-DD)'}, status=400)

        data = PeriodService.period_summary(
            kurum_id=kurum_id,
            baslangic=baslangic,
            bitis=bitis,
            mode=request.query_params.get('mode', 'alinan'),
            sube_id=sube_id,
            egitim_yili_id=_int_param(request.query_params.get('egitim_yili_id')),
            odeme_yontemi_tipi=request.query_params.get('odeme_yontemi_tipi') or None,
            odeme_yontemi_tipleri=_parse_odeme_yontemi_tipleri(request),
            odeme_yontemi_ids=_parse_odeme_yontemi_ids(request),
            kaynak=_normalize_kaynak(request.query_params.get('kaynak')),
        )
        return Response(data)


class PeriodDetailsView(ExportFormatMixin, FinansAPIView):
    """GET /finans/api/period-details/"""

    def get(self, request):
        kurum_id = _resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        baslangic = parse_date(request.query_params.get('baslangic'))
        bitis = parse_date(request.query_params.get('bitis'))
        if not baslangic or not bitis:
            return Response({'error': 'baslangic ve bitis zorunlu (YYYY-MM-DD)'}, status=400)

        mode = request.query_params.get('mode', 'alinan')
        rows = PeriodService.period_details(
            kurum_id=kurum_id,
            baslangic=baslangic,
            bitis=bitis,
            mode=mode,
            sube_id=sube_id,
            egitim_yili_id=_int_param(request.query_params.get('egitim_yili_id')),
            odeme_yontemi_tipi=request.query_params.get('odeme_yontemi_tipi') or None,
            odeme_yontemi_tipleri=_parse_odeme_yontemi_tipleri(request),
            odeme_yontemi_ids=_parse_odeme_yontemi_ids(request),
            kaynak=_normalize_kaynak(request.query_params.get('kaynak')),
        )

        page = _int_param(request.query_params.get('page')) or 1
        page_size = _int_param(request.query_params.get('page_size')) or 50

        fmt = self.get_export_format()
        if fmt != 'json':
            export_rows = [
                {
                    'tarih': r['tarih'],
                    'kaynak': r['kaynak_label'],
                    'tutar': r['tutar'],
                    'aciklama': r.get('aciklama') or '',
                    'sube_ad': '',
                    'odeme_yontemi_tipi': r.get('odeme_yontemi_tipi') or '',
                }
                for r in rows
            ]
            return _export_or_json(
                request,
                export_rows,
                PERIOD_DETAIL_COLUMNS,
                title='Dönem Detayları',
                filters_meta={'baslangic': baslangic.isoformat(), 'bitis': bitis.isoformat()},
                export_format=fmt,
            )

        paginated = _paginate(rows, page, page_size)
        paginated['mode'] = mode
        paginated['baslangic'] = baslangic.isoformat()
        paginated['bitis'] = bitis.isoformat()
        return Response(paginated)


PERIOD_REPORT_ALINAN_COLUMNS = [
    {'key': 'tarih', 'label': 'Tarih'},
    {'key': 'kisi_adi', 'label': 'Kişi'},
    {'key': 'kaynak_label', 'label': 'Kaynak'},
    {'key': 'tutar', 'label': 'Tutar (TL)'},
    {'key': 'odeme_yontemi', 'label': 'Ödeme Yöntemi'},
    {'key': 'tahsil_durumu_label', 'label': 'Durum'},
    {'key': 'aciklama', 'label': 'Açıklama'},
]

PERIOD_REPORT_BEKLENEN_COLUMNS = [
    {'key': 'vade_tarihi', 'label': 'Vade'},
    {'key': 'kisi_adi', 'label': 'Kişi'},
    {'key': 'kaynak_label', 'label': 'Kaynak'},
    {'key': 'toplam_tutar', 'label': 'Toplam (TL)'},
    {'key': 'odenen_tutar', 'label': 'Alınan (TL)'},
    {'key': 'kalan_tutar', 'label': 'Kalan (TL)'},
    {'key': 'odeme_yontemi', 'label': 'Ödeme Yöntemi'},
    {'key': 'tahsil_durumu_label', 'label': 'Durum'},
    {'key': 'aciklama', 'label': 'Açıklama'},
]


class PeriodReportExportView(ExportFormatMixin, FinansAPIView):
    """GET /finans/api/period-report/ — grafikli dönem tahsilat raporu (PDF/Excel/CSV)."""

    def get(self, request):
        kurum_id = _resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        baslangic = parse_date(request.query_params.get('baslangic'))
        bitis = parse_date(request.query_params.get('bitis'))
        if not baslangic or not bitis:
            return Response({'error': 'baslangic ve bitis zorunlu (YYYY-MM-DD)'}, status=400)

        mode = request.query_params.get('mode', 'alinan')
        kaynak = _normalize_kaynak(request.query_params.get('kaynak'))
        kwargs = dict(
            kurum_id=kurum_id,
            baslangic=baslangic,
            bitis=bitis,
            mode=mode,
            sube_id=sube_id,
            egitim_yili_id=_int_param(request.query_params.get('egitim_yili_id')),
            odeme_yontemi_tipi=request.query_params.get('odeme_yontemi_tipi') or None,
            odeme_yontemi_tipleri=_parse_odeme_yontemi_tipleri(request),
            odeme_yontemi_ids=_parse_odeme_yontemi_ids(request),
            kaynak=kaynak,
        )
        payload = PeriodService.period_report_payload(**kwargs)
        fmt = self.get_export_format()
        ozet = payload.get('ozet') or {}
        rows = payload.get('rows') or []

        mode_label = 'Alınan Ödemeler' if mode == 'alinan' else 'Beklenen Ödemeler'
        title = f'Dönem Tahsilat — {mode_label}'

        kaynak_labels = {'sozlesme': 'Sözleşme', 'gelir': 'Gelir', 'cari': 'Cari', None: 'Tümü'}
        filters_meta = _enrich_filters_meta({
            'kurum_id': kurum_id,
            'sube_id': sube_id or '',
            'baslangic': baslangic.isoformat(),
            'bitis': bitis.isoformat(),
            'mode': mode,
            'kaynak': kaynak or '',
            'kaynak_label': kaynak_labels.get(kaynak, kaynak or 'Tümü'),
            'toplam_tutar': ozet.get('toplam_tutar'),
            'toplam_alinan': ozet.get('toplam_alinan'),
            'toplam_kalan': ozet.get('toplam_kalan'),
            'toplam_adet': ozet.get('toplam_adet'),
            'report_kind': 'period_tahsilat',
        }, kurum_id)
        if request.user.is_authenticated:
            filters_meta['raporu_olusturan'] = (
                request.user.get_full_name() or request.user.username
            )

        if fmt == 'json':
            return Response(payload)

        if fmt == 'pdf':
            from apps.finans.application.export.period_report_html import build_period_report_html
            from apps.communication.application.html_to_pdf import render_html_to_pdf
            from django.http import HttpResponse

            kurum_ad = filters_meta.get('kurum_ad')
            orientation = ExportService._normalize_orientation(
                request.query_params.get('orientation'),
            )
            html_doc = build_period_report_html(
                mode=mode,
                baslangic=baslangic.isoformat(),
                bitis=bitis.isoformat(),
                ozet=ozet,
                rows=rows,
                filters_meta=filters_meta,
                kurum_ad=kurum_ad,
                orientation=orientation,
            )
            try:
                pdf_bytes = render_html_to_pdf(
                    html_doc,
                    landscape=(orientation == 'landscape'),
                )
            except RuntimeError:
                from apps.communication.application.pdf_render_service import PdfRenderService

                pdf_bytes = PdfRenderService.render_simple_text_pdf(
                    title,
                    f'{title}\n{filters_meta.get("baslangic")} — {filters_meta.get("bitis")}\n'
                    f'Toplam: {ozet.get("toplam_tutar")} TL\nKayıt: {len(rows)}',
                )
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            safe = ''.join(c if c.isalnum() or c in '-_' else '_' for c in title)
            response['Content-Disposition'] = f'attachment; filename="{safe}.pdf"'
            return response

        export_rows = []
        if mode == 'beklenen':
            columns = PERIOD_REPORT_BEKLENEN_COLUMNS
            for r in rows:
                export_rows.append({
                    'vade_tarihi': r.get('vade_tarihi') or r.get('tarih'),
                    'kisi_adi': r.get('kisi_adi'),
                    'kaynak_label': r.get('kaynak_label'),
                    'toplam_tutar': r.get('toplam_tutar'),
                    'odenen_tutar': r.get('odenen_tutar'),
                    'kalan_tutar': r.get('kalan_tutar'),
                    'odeme_yontemi': r.get('odeme_yontemi') or '',
                    'tahsil_durumu_label': r.get('tahsil_durumu_label'),
                    'aciklama': r.get('aciklama') or '',
                })
        else:
            columns = PERIOD_REPORT_ALINAN_COLUMNS
            for r in rows:
                export_rows.append({
                    'tarih': r.get('tarih'),
                    'kisi_adi': r.get('kisi_adi'),
                    'kaynak_label': r.get('kaynak_label'),
                    'tutar': r.get('tutar'),
                    'odeme_yontemi': r.get('odeme_yontemi') or r.get('odeme_yontemi_tipi') or '',
                    'tahsil_durumu_label': r.get('tahsil_durumu_label') or 'Alındı',
                    'aciklama': r.get('aciklama') or '',
                })

        return _export_or_json(
            request,
            export_rows,
            columns,
            title=title,
            filters_meta=filters_meta,
            extra={'ozet': ozet, 'yontem_dagilimi': ozet.get('yontem_dagilimi')},
            export_format=fmt,
        )


class OverdueReminderPreviewView(FinansAPIView):
    """POST /finans/api/overdue-reminders/preview/"""
    permission_classes = [FinansManageAndCommunicationWritePermission]

    def post(self, request):
        kurum_id = _resolve_kurum_id_from_body(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        _, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        taksit_ids = request.data.get('taksit_ids') or []
        if not isinstance(taksit_ids, list) or not taksit_ids:
            return Response({'error': 'taksit_ids listesi zorunlu'}, status=400)

        template = request.data.get('template') or ''
        veli_selections = request.data.get('veli_selections') or {}
        result = OverdueReminderService.preview(
            kurum_id,
            [int(x) for x in taksit_ids],
            template=template,
            veli_selections=veli_selections,
        )
        return Response(result)


class OverdueReminderSendView(FinansAPIView):
    """POST /finans/api/overdue-reminders/send/"""
    permission_classes = [FinansManageAndCommunicationWritePermission]

    def post(self, request):
        kurum_id = _resolve_kurum_id_from_body(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        _, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        taksit_ids = request.data.get('taksit_ids') or []
        if not isinstance(taksit_ids, list) or not taksit_ids:
            return Response({'error': 'taksit_ids listesi zorunlu'}, status=400)

        force_resend = bool(request.data.get('force_resend', False))
        template = request.data.get('template') or ''
        veli_selections = request.data.get('veli_selections') or {}
        result = OverdueReminderService.send_bulk(
            kurum_id,
            [int(x) for x in taksit_ids],
            template=template,
            force_resend=force_resend,
            sent_by_user_id=request.user.id if request.user.is_authenticated else None,
            veli_selections=veli_selections,
        )
        return Response(result)


class FinansSlugReportView(ExportFormatMixin, FinansAPIView):
    """GET /finans/api/reports/{slug}/"""

    def get(self, request, slug):
        if slug not in REPORT_SLUGS:
            return Response({'error': f'Bilinmeyen rapor: {slug}'}, status=404)

        kurum_id = _int_param(request.query_params.get('kurum_id'))
        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        params = {
            'baslangic': request.query_params.get('baslangic'),
            'bitis': request.query_params.get('bitis'),
            'sube_id': sube_id,
            'egitim_yili_id': _int_param(request.query_params.get('egitim_yili_id')),
            'odeme_yontemi_tipi': request.query_params.get('odeme_yontemi_tipi') or None,
            'kaynak': request.query_params.get('kaynak') or None,
        }

        try:
            report = ReportService.run(slug, kurum_id=kurum_id, params=params)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)

        fmt = self.get_export_format()
        if fmt == 'json':
            return Response(_build_json_report(slug, report, params))

        rows = _report_rows_for_export(slug, report)
        columns = _report_columns(slug)
        return _export_or_json(
            request,
            rows,
            columns,
            title=_report_title(slug),
            filters_meta={k: v for k, v in params.items() if v},
            extra={k: v for k, v in report.items() if k != 'rows'},
            export_format=fmt,
        )


REPORT_TITLES = {
    'cek-bilgileri': 'Çek Bilgileri',
    'cek-senet-listesi': 'Çek ve Senet Listesi',
    'gunluk-satis': 'Günlük Satış Raporu',
    'gunluk-satis-detay': 'Günlük Satış (Detaylı)',
    'aylik-satis': 'Satış Raporu (Ay Bazlı)',
    'tahsilat-analiz': 'Tahsilat Listesi ve Analizleri',
}

TAHSILAT_KAYNAK_LABELS = {
    'sozlesme': 'Sözleşme',
    'gelir': 'Gelir',
    'cari': 'Cari',
}


def _report_title(slug: str) -> str:
    return REPORT_TITLES.get(slug, slug.replace('-', ' ').title())


def _tahsilat_analiz_rows(report: dict) -> list[dict]:
    kaynaklar = report.get('kaynaklar') or {}
    return [
        {
            'kaynak': TAHSILAT_KAYNAK_LABELS.get(key, key),
            'toplam': (value or {}).get('toplam', 0),
            'adet': (value or {}).get('adet', 0),
        }
        for key, value in kaynaklar.items()
    ]


def _normalize_report_rows(slug: str, rows: list[dict]) -> list[dict]:
    if slug != 'gunluk-satis-detay':
        return rows
    return [
        {
            'tarih': r.get('tarih', ''),
            'kaynak': r.get('kaynak_label', r.get('kaynak', '')),
            'tutar': r.get('tutar', ''),
            'aciklama': r.get('aciklama') or '',
            'sube_ad': r.get('sube_ad', ''),
            'odeme_yontemi_tipi': r.get('odeme_yontemi_tipi') or '',
        }
        for r in rows
    ]


def _report_rows_for_export(slug: str, report: dict) -> list[dict]:
    if slug == 'tahsilat-analiz':
        return _tahsilat_analiz_rows(report)
    return _normalize_report_rows(slug, report.get('rows', []))


def _build_report_summary(report: dict) -> dict | None:
    summary: dict = {}
    ozet = report.get('ozet')
    if isinstance(ozet, dict):
        summary.update(ozet)
    for key in ('toplam', 'genel_toplam', 'count'):
        if key in report and report[key] is not None:
            summary[key] = report[key]
    return summary or None


def _build_json_report(slug: str, report: dict, params: dict) -> dict:
    columns = _report_columns(slug)
    rows = _report_rows_for_export(slug, report)
    keys = [c['key'] for c in columns]
    return {
        'slug': slug,
        'title': _report_title(slug),
        'generated_at': timezone.now().isoformat(),
        'filters': {k: v for k, v in params.items() if v is not None},
        'columns': columns,
        'rows': [{k: row.get(k, '') for k in keys} for row in rows],
        'summary': _build_report_summary(report),
    }


def _report_columns(slug: str) -> list[dict]:
    mapping = {
        'cek-bilgileri': [
            {'key': 'cek_senet_no', 'label': 'No'},
            {'key': 'banka_adi', 'label': 'Banka'},
            {'key': 'vade_tarihi', 'label': 'Vade'},
            {'key': 'durum_label', 'label': 'Durum'},
            {'key': 'tutar', 'label': 'Tutar'},
            {'key': 'sozlesme_no', 'label': 'Sözleşme'},
        ],
        'cek-senet-listesi': [
            {'key': 'cek_senet_no', 'label': 'No'},
            {'key': 'banka_adi', 'label': 'Banka'},
            {'key': 'vade_tarihi', 'label': 'Vade'},
            {'key': 'durum_label', 'label': 'Durum'},
            {'key': 'tutar', 'label': 'Tutar'},
            {'key': 'sozlesme_no', 'label': 'Sözleşme'},
        ],
        'gunluk-satis': [
            {'key': 'tarih', 'label': 'Tarih'},
            {'key': 'toplam', 'label': 'Toplam (TL)'},
        ],
        'gunluk-satis-detay': PERIOD_DETAIL_COLUMNS,
        'aylik-satis': [
            {'key': 'ay', 'label': 'Ay'},
            {'key': 'ay_label', 'label': 'Dönem'},
            {'key': 'toplam', 'label': 'Toplam (TL)'},
        ],
        'tahsilat-analiz': [
            {'key': 'kaynak', 'label': 'Kaynak'},
            {'key': 'toplam', 'label': 'Toplam (TL)'},
            {'key': 'adet', 'label': 'Adet'},
        ],
    }
    return mapping.get(slug, PERIOD_DETAIL_COLUMNS)
