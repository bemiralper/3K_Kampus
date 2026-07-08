"""
Gelir v2 — API view'ları.
Kök: /finans/api/gelir/v2/...
Tüm view'lar FinansModulePermission + zorunlu şube bağlamı kullanır.
"""
from rest_framework import status
from rest_framework.response import Response

from apps.finans.application.gelir_v2.gelir_command_service import GelirCommandService
from apps.finans.application.gelir_v2.gelir_query_service import GelirQueryService
from apps.finans.application.gelir_v2.gelir_dashboard_service import GelirDashboardService
from apps.finans.application.finans_v2.audit import get_client_ip
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.interfaces.serializers.gelir_gider_v2_serializers import (
    GelirV2CreateSerializer,
    GelirV2UpdateSerializer,
)
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from apps.finans.interfaces.views.sube_context import (
    assert_record_sube_access,
    resolve_mandatory_finans_sube,
)


def _require_kurum(request, *, from_body=False):
    src = request.data if from_body else request.query_params
    kurum_id = src.get('kurum_id')
    if not kurum_id:
        return None, Response(
            {'error': 'kurum_id parametresi zorunludur.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return kurum_id, None


def _gate(request, pk):
    gelir = (
        GelirKaydi.objects.select_related(
            'cari_hesap', 'gelir_kategorisi', 'gelir_kaynagi', 'proje',
            'odeme_yontemi', 'olusturan', 'mali_hesap',
        ).prefetch_related('etiketler').filter(pk=pk).first()
    )
    if not gelir:
        return None, Response({'detail': 'Gelir kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    err = assert_record_sube_access(request, gelir.kurum_id, gelir.sube_id)
    if err:
        return None, err
    return gelir, None


_FILTER_KEYS = [
    'arama', 'durum', 'cari_hesap_id', 'gelir_kategorisi_id', 'gelir_kaynagi_id',
    'proje_id', 'odeme_yontemi_id', 'olusturan_id', 'etiket_id', 'belge_no',
    'baslangic', 'bitis', 'tutar_min', 'tutar_max', 'kdv_var', 'kdv_orani',
    'tahsil_durumu',
]


def _collect_filters(qp):
    return {k: qp.get(k) for k in _FILTER_KEYS if qp.get(k) not in (None, '')}


class GelirV2ListCreateView(APIView):
    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err
        data = GelirQueryService().list_paginated(
            kurum_id, sube_id,
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
        serializer = GelirV2CreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = dict(serializer.validated_data)
        data['kurum_id'] = int(kurum_id)
        data['sube_id'] = sube_id
        gelir, errors = GelirCommandService().create(
            data,
            islem_yapan=request.user if request.user.is_authenticated else None,
            ip_adresi=get_client_ip(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(GelirQueryService.serialize(gelir), status=status.HTTP_201_CREATED)


class GelirV2DetailView(APIView):
    def get(self, request, pk):
        gelir, err = _gate(request, pk)
        if err:
            return err
        return Response(GelirQueryService.serialize(gelir))

    def put(self, request, pk):
        gelir, err = _gate(request, pk)
        if err:
            return err
        serializer = GelirV2UpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        gelir, errors = GelirCommandService().update(
            pk, dict(serializer.validated_data),
            islem_yapan=request.user if request.user.is_authenticated else None,
            ip_adresi=get_client_ip(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(GelirQueryService.serialize(gelir))

    patch = put

    def delete(self, request, pk):
        gelir, err = _gate(request, pk)
        if err:
            return err
        _, errors = GelirCommandService().soft_delete(
            pk, islem_yapan=request.user if request.user.is_authenticated else None,
            ip_adresi=get_client_ip(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GelirV2OnaylaView(APIView):
    def post(self, request, pk):
        gelir, err = _gate(request, pk)
        if err:
            return err
        gelir, errors = GelirCommandService().onayla(
            pk, islem_yapan=request.user if request.user.is_authenticated else None,
            ip_adresi=get_client_ip(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(GelirQueryService.serialize(gelir))


class GelirV2IptalView(APIView):
    def post(self, request, pk):
        gelir, err = _gate(request, pk)
        if err:
            return err
        gelir, errors = GelirCommandService().iptal_et(
            pk, islem_yapan=request.user if request.user.is_authenticated else None,
            ip_adresi=get_client_ip(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(GelirQueryService.serialize(gelir))


class GelirV2DashboardView(APIView):
    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err
        return Response(GelirDashboardService().summary(kurum_id, sube_id))
