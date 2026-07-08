"""
Cari Hesap v2 — API view'ları.

Mevcut cari endpoint'lerine paralel çalışır (/finans/api/cari/v2/...).
Tüm view'lar FinansModulePermission + zorunlu şube bağlamı kullanır.
"""
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.finans.application.cari_v2.cari_command_service import CariCommandService
from apps.finans.application.cari_v2.cari_dashboard_service import CariDashboardService
from apps.finans.application.cari_v2.cari_panel_service import CariPanelService
from apps.finans.application.cari_v2.cari_query_service import CariQueryService
from apps.finans.application.cari_v2.cari_report_service import SLUGS, CariReportService
from apps.finans.application.cari_v2.cari_risk_service import hesapla_risk
from apps.finans.application.cari_v2.etiket_service import CariEtiketService
from apps.finans.application.cari_v2.gorunum_service import CariGorunumService
from apps.finans.application.cari_v2.permissions import cari_effective_permissions
from apps.finans.application.cari_hareket_enrichment import build_cari_hareket_meta
from apps.finans.application.selectors.cari_hesap_selector import CariHesapSelector
from apps.finans.interfaces.serializers.cari_hesap_serializer import (
    CariHareketListSerializer,
    CariHesapDropdownSerializer,
)
from apps.finans.interfaces.serializers.cari_v2_serializers import (
    CariV2CreateSerializer,
    CariV2DetailSerializer,
    CariV2UpdateSerializer,
)
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from apps.finans.interfaces.views.sube_context import (
    assert_record_sube_access,
    resolve_mandatory_finans_sube,
)


# ─── Yardımcılar ─────────────────────────────────
def _require_kurum(request, *, from_body=False):
    src = request.data if from_body else request.query_params
    kurum_id = src.get('kurum_id')
    if not kurum_id:
        return None, Response(
            {'error': 'kurum_id parametresi zorunludur.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return kurum_id, None


def _sube_gate(request, pk):
    selector = CariHesapSelector()
    hesap = selector.get_by_id(pk)
    if not hesap:
        return None, Response(
            {'detail': 'Cari hesap bulunamadı.'}, status=status.HTTP_404_NOT_FOUND,
        )
    err = assert_record_sube_access(request, hesap.kurum_id, hesap.sube_id)
    if err:
        return None, err
    return hesap, None


def _collect_filters(qp):
    keys = [
        'arama', 'hesap_turu', 'durum', 'etiketler', 'kategori',
        'bakiye_durumu', 'bakiye_min', 'bakiye_max',
        'borc_min', 'borc_max', 'alacak_min', 'alacak_max',
        'son_islem_baslangic', 'son_islem_bitis',
        'il', 'ilce', 'yetkili', 'gelir_kategori', 'gider_kategori',
        'risk_durumu', 'vade',
    ]
    out = {}
    for k in keys:
        v = qp.get(k)
        if v not in (None, ''):
            out[k] = v
    return out


# ─── Liste + Oluştur ─────────────────────────────
class CariV2ListCreateView(APIView):
    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        service = CariQueryService()
        data = service.list_paginated(
            kurum_id,
            sube_id,
            filters=_collect_filters(request.query_params),
            sort=request.query_params.get('sort'),
            page=request.query_params.get('page', 1),
            page_size=request.query_params.get('page_size', 25),
        )
        return Response(data)

    def post(self, request):
        kurum_id, err = _require_kurum(request, from_body=True)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        serializer = CariV2CreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = dict(serializer.validated_data)
        data['kurum_id'] = kurum_id
        data['sube_id'] = sube_id

        hesap, errors = CariCommandService().create(
            data, islem_yapan=request.user if request.user.is_authenticated else None,
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            CariV2DetailSerializer(hesap).data, status=status.HTTP_201_CREATED,
        )


# ─── Detay ───────────────────────────────────────
class CariV2DetailView(APIView):
    def get(self, request, pk):
        hesap, err = _sube_gate(request, pk)
        if err:
            return err
        data = CariV2DetailSerializer(hesap).data
        header = CariPanelService().header(pk)
        if header:
            data['ozet'] = header
        return Response(data)

    def put(self, request, pk):
        hesap, err = _sube_gate(request, pk)
        if err:
            return err
        serializer = CariV2UpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        hesap, errors = CariCommandService().update(
            pk, dict(serializer.validated_data),
            islem_yapan=request.user if request.user.is_authenticated else None,
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(CariV2DetailSerializer(hesap).data)

    def delete(self, request, pk):
        _, err = _sube_gate(request, pk)
        if err:
            return err
        _, errors = CariCommandService().soft_delete(pk)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response({'detail': 'Cari hesap silindi.'})


class CariV2ToggleView(APIView):
    def post(self, request, pk):
        _, err = _sube_gate(request, pk)
        if err:
            return err
        hesap, errors = CariCommandService().toggle_aktif(pk)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'detail': f'Cari hesap {"aktifleştirildi" if hesap.aktif_mi else "pasifleştirildi"}.',
            'aktif_mi': hesap.aktif_mi,
        })


# ─── Dashboard ───────────────────────────────────
class CariV2DashboardView(APIView):
    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err
        return Response(CariDashboardService().summary(kurum_id, sube_id))


# ─── Panel (türe özel) ───────────────────────────
class CariV2PanelView(APIView):
    def get(self, request, pk):
        _, err = _sube_gate(request, pk)
        if err:
            return err
        panel = CariPanelService().panel(pk)
        if panel is None:
            return Response({'detail': 'Cari hesap bulunamadı.'}, status=404)
        return Response(panel)


# ─── Hareketler (sayfalı) ────────────────────────
class CariV2HareketlerView(APIView):
    def get(self, request, pk):
        _, err = _sube_gate(request, pk)
        if err:
            return err
        selector = CariHesapSelector()
        filtreler = {}
        qp = request.query_params
        if qp.get('islem_turu'):
            val = qp['islem_turu']
            if ',' in val:
                filtreler['islem_turu__in'] = [t.strip() for t in val.split(',')]
            else:
                filtreler['islem_turu'] = val
        if qp.get('yon'):
            filtreler['yon'] = qp['yon']
        if qp.get('baslangic'):
            filtreler['baslangic'] = qp['baslangic']
        if qp.get('bitis'):
            filtreler['bitis'] = qp['bitis']

        qs = selector.hareketler(pk, filtreler=filtreler or None)
        try:
            page = max(1, int(qp.get('page', 1)))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = min(500, max(1, int(qp.get('page_size', 50))))
        except (TypeError, ValueError):
            page_size = 50

        count = qs.count()
        start = (page - 1) * page_size
        hareket_list = list(qs[start:start + page_size])
        serializer = CariHareketListSerializer(
            hareket_list, many=True,
            context={'kaynak_meta': build_cari_hareket_meta(hareket_list)},
        )
        return Response({
            'results': serializer.data,
            'count': count,
            'page': page,
            'page_size': page_size,
            'total_pages': (count + page_size - 1) // page_size if page_size else 1,
        })


# ─── Sekme verileri ──────────────────────────────
class CariV2TabView(APIView):
    """GET /cari/v2/hesaplar/<pk>/tab/<tab>/"""

    def get(self, request, pk, tab):
        hesap, err = _sube_gate(request, pk)
        if err:
            return err
        handler = {
            'gelirler': self._gelirler,
            'giderler': self._giderler,
            'tahsilatlar': self._tahsilatlar,
            'odemeler': self._odemeler,
            'gecmis': self._gecmis,
            'notlar': self._notlar,
        }.get(tab)
        if not handler:
            return Response({'error': 'Geçersiz sekme.'}, status=400)
        return Response(handler(hesap))

    def _gelirler(self, hesap):
        from apps.finans.domain.gelir_kaydi import GelirKaydi
        rows = (
            GelirKaydi.objects.filter(cari_hesap=hesap)
            .select_related('gelir_kategorisi')
            .order_by('-fatura_tarihi', '-created_at')
        )
        return [
            {
                'id': g.id,
                'fatura_no': g.fatura_no,
                'fatura_tarihi': g.fatura_tarihi.isoformat(),
                'vade_tarihi': g.vade_tarihi.isoformat(),
                'kategori': g.gelir_kategorisi.ad if g.gelir_kategorisi else '',
                'net_tutar': float(g.net_tutar),
                'tahsil_edilen': float(g.tahsil_edilen),
                'kalan': float(g.kalan_tutar),
                'durum': g.durum,
                'aciklama': g.aciklama,
            }
            for g in rows
        ]

    def _giderler(self, hesap):
        from apps.finans.domain.gider_kaydi import GiderKaydi
        rows = (
            GiderKaydi.objects.filter(cari_hesap=hesap)
            .select_related('gider_kategorisi')
            .order_by('-fatura_tarihi', '-created_at')
        )
        return [
            {
                'id': g.id,
                'fatura_no': g.fatura_no,
                'fatura_tarihi': g.fatura_tarihi.isoformat(),
                'vade_tarihi': g.vade_tarihi.isoformat(),
                'kategori': g.gider_kategorisi.ad if g.gider_kategorisi else '',
                'net_tutar': float(g.net_tutar),
                'odenen_toplam': float(g.odenen_toplam),
                'kalan': float(g.kalan_tutar),
                'durum': g.durum,
                'aciklama': g.aciklama,
            }
            for g in rows
        ]

    def _hareket_dicts(self, hesap, islem_turu_in):
        selector = CariHesapSelector()
        qs = selector.hareketler(
            hesap.pk, filtreler={'islem_turu__in': islem_turu_in},
        )
        hareket_list = list(qs)
        serializer = CariHareketListSerializer(
            hareket_list, many=True,
            context={'kaynak_meta': build_cari_hareket_meta(hareket_list)},
        )
        return serializer.data

    def _tahsilatlar(self, hesap):
        return self._hareket_dicts(hesap, ['tahsilat'])

    def _odemeler(self, hesap):
        return self._hareket_dicts(hesap, ['odeme', 'mahsup'])

    def _gecmis(self, hesap):
        return self._hareket_dicts(
            hesap,
            ['satis', 'alis', 'tahsilat', 'odeme', 'avans', 'iade',
             'duzeltme', 'mahsup', 'devir', 'acilis'],
        )

    def _notlar(self, hesap):
        return {'notlar': hesap.notlar}


# ─── Raporlar ────────────────────────────────────
class CariV2ReportView(APIView):
    def get(self, request, slug):
        if slug not in SLUGS:
            return Response({'error': 'Geçersiz rapor.'}, status=404)
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err
        params = {k: v for k, v in request.query_params.items()}
        result = CariReportService().build(slug, kurum_id, sube_id, params)
        if result is None:
            return Response({'error': 'Rapor bulunamadı.'}, status=404)
        return Response(result)


class CariV2ReportExportView(APIView):
    def post(self, request, slug):
        if slug not in SLUGS:
            return Response({'error': 'Geçersiz rapor.'}, status=404)
        from apps.finans.application.export.export_service import ExportService
        from apps.finans.interfaces.views.expansion_views import _enrich_filters_meta

        kurum_id, err = _require_kurum(request, from_body=True)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        fmt = (request.data.get('format') or 'csv').lower()
        if fmt not in ExportService.SUPPORTED_FORMATS:
            return Response({'error': f'Desteklenmeyen format: {fmt}'}, status=400)

        params = request.data.get('params') or {}
        result = CariReportService().build(slug, kurum_id, sube_id, params)
        if result is None or result.get('error'):
            return Response({'error': (result or {}).get('error', 'Rapor bulunamadı.')}, status=400)

        columns = result.get('columns') or []
        rows = result.get('rows') or []
        title = result.get('baslik') or 'Cari Rapor'

        filters_meta = request.data.get('filters_meta') or {}
        filters_meta.setdefault('kurum_id', kurum_id)
        filters_meta.setdefault('report_kind', f'cari_{slug.replace("-", "_")}')
        filters_meta.setdefault('rapor_adi', title)
        filters_meta.setdefault('para_birimi', 'TL')
        if request.user.is_authenticated and not filters_meta.get('raporu_olusturan'):
            filters_meta['raporu_olusturan'] = (
                request.user.get_full_name() or request.user.username
            )
        meta = _enrich_filters_meta(filters_meta, kurum_id)
        orientation = ExportService._normalize_orientation(
            request.data.get('orientation') or request.query_params.get('orientation'),
        )

        try:
            out = ExportService.build(
                fmt, rows, columns, title=title,
                filters_meta=meta, orientation=orientation,
            )
        except (ValueError, RuntimeError) as exc:
            return Response({'error': str(exc)}, status=400)
        if isinstance(out, dict):
            return Response(out)
        return out


# ─── Etiketler ───────────────────────────────────
class CariV2EtiketView(APIView):
    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, _ = resolve_mandatory_finans_sube(request, kurum_id)
        return Response(CariEtiketService().list(kurum_id, sube_id))

    def post(self, request):
        kurum_id, err = _require_kurum(request, from_body=True)
        if err:
            return err
        sube_id, serr = resolve_mandatory_finans_sube(request, kurum_id)
        if serr:
            return serr
        etiket, errors = CariEtiketService().create(
            kurum_id, request.data.get('ad'), request.data.get('renk'), sube_id=sube_id,
        )
        if errors:
            return Response(errors, status=400)
        return Response(
            {'id': etiket.id, 'ad': etiket.ad, 'renk': etiket.renk}, status=201,
        )


class CariV2EtiketDetailView(APIView):
    def put(self, request, pk):
        kurum_id, err = _require_kurum(request, from_body=True)
        if err:
            return err
        etiket, errors = CariEtiketService().update(
            pk, kurum_id, ad=request.data.get('ad'), renk=request.data.get('renk'),
        )
        if errors:
            return Response(errors, status=400)
        return Response({'id': etiket.id, 'ad': etiket.ad, 'renk': etiket.renk})

    def delete(self, request, pk):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        ok, errors = CariEtiketService().delete(pk, kurum_id)
        if errors:
            return Response(errors, status=400)
        return Response({'detail': 'Etiket silindi.'})


# ─── Kayıtlı Görünümler ──────────────────────────
class CariV2GorunumView(APIView):
    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, _ = resolve_mandatory_finans_sube(request, kurum_id)
        return Response(
            CariGorunumService().list(kurum_id, request.user, sube_id),
        )

    def post(self, request):
        kurum_id, err = _require_kurum(request, from_body=True)
        if err:
            return err
        sube_id, _ = resolve_mandatory_finans_sube(request, kurum_id)
        g, errors = CariGorunumService().create(
            kurum_id, request.user,
            request.data.get('ad'), request.data.get('config'),
            sube_id=sube_id,
            varsayilan_mi=bool(request.data.get('varsayilan_mi')),
        )
        if errors:
            return Response(errors, status=400)
        return Response(CariGorunumService()._serialize(g), status=201)


class CariV2GorunumDetailView(APIView):
    def put(self, request, pk):
        kurum_id, err = _require_kurum(request, from_body=True)
        if err:
            return err
        g, errors = CariGorunumService().update(
            pk, kurum_id, request.user,
            ad=request.data.get('ad'),
            config=request.data.get('config'),
            varsayilan_mi=request.data.get('varsayilan_mi'),
        )
        if errors:
            return Response(errors, status=400)
        return Response(CariGorunumService()._serialize(g))

    def delete(self, request, pk):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        ok, errors = CariGorunumService().delete(pk, kurum_id, request.user)
        if errors:
            return Response(errors, status=400)
        return Response({'detail': 'Görünüm silindi.'})


# ─── Yetkiler (etkin izinler) ────────────────────
class CariV2PermissionsView(APIView):
    def get(self, request):
        return Response(cari_effective_permissions(request.user))


# ─── Dropdown ────────────────────────────────────
class CariV2DropdownView(APIView):
    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err
        selector = CariHesapSelector()
        hesaplar = selector.dropdown_list(
            kurum_id, sube_id=sube_id, hesap_turu=request.query_params.get('hesap_turu'),
        )
        return Response(CariHesapDropdownSerializer(hesaplar, many=True).data)
