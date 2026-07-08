"""
Gider v2 — API view'ları.
Kök: /finans/api/gider/v2/...
"""
from rest_framework import status
from rest_framework.response import Response

from apps.finans.application.gider_v2.gider_command_service import GiderCommandService
from apps.finans.application.gider_v2.gider_query_service import GiderQueryService
from apps.finans.application.gider_v2.gider_dashboard_service import GiderDashboardService
from apps.finans.application.finans_v2.audit import get_client_ip
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.interfaces.serializers.gelir_gider_v2_serializers import (
    GiderV2CreateSerializer,
    GiderV2UpdateSerializer,
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
    gider = (
        GiderKaydi.objects.select_related(
            'cari_hesap', 'gider_kategorisi', 'maliyet_merkezi', 'proje',
            'odeme_yontemi', 'olusturan', 'mali_hesap',
        ).prefetch_related('etiketler').filter(pk=pk).first()
    )
    if not gider:
        return None, Response({'detail': 'Gider kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    err = assert_record_sube_access(request, gider.kurum_id, gider.sube_id, allow_null_sube=True)
    if err:
        return None, err
    return gider, None


_FILTER_KEYS = [
    'arama', 'durum', 'cari_hesap_id', 'gider_kategorisi_id', 'maliyet_merkezi_id',
    'proje_id', 'odeme_yontemi_id', 'olusturan_id', 'etiket_id', 'belge_no',
    'baslangic', 'bitis', 'tutar_min', 'tutar_max', 'kdv_var', 'kdv_orani',
    'odeme_durumu',
]


def _collect_filters(qp):
    return {k: qp.get(k) for k in _FILTER_KEYS if qp.get(k) not in (None, '')}


class GiderV2ListCreateView(APIView):
    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err
        data = GiderQueryService().list_paginated(
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
        serializer = GiderV2CreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = dict(serializer.validated_data)
        data['kurum_id'] = int(kurum_id)
        data['sube_id'] = sube_id
        gider, errors = GiderCommandService().create(
            data,
            islem_yapan=request.user if request.user.is_authenticated else None,
            ip_adresi=get_client_ip(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(GiderQueryService.serialize(gider), status=status.HTTP_201_CREATED)


class GiderV2DetailView(APIView):
    def get(self, request, pk):
        gider, err = _gate(request, pk)
        if err:
            return err
        return Response(GiderQueryService.serialize(gider))

    def put(self, request, pk):
        gider, err = _gate(request, pk)
        if err:
            return err
        serializer = GiderV2UpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        gider, errors = GiderCommandService().update(
            pk, dict(serializer.validated_data),
            islem_yapan=request.user if request.user.is_authenticated else None,
            ip_adresi=get_client_ip(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(GiderQueryService.serialize(gider))

    patch = put

    def delete(self, request, pk):
        gider, err = _gate(request, pk)
        if err:
            return err
        _, errors = GiderCommandService().soft_delete(
            pk, islem_yapan=request.user if request.user.is_authenticated else None,
            ip_adresi=get_client_ip(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GiderV2OnaylaView(APIView):
    def post(self, request, pk):
        gider, err = _gate(request, pk)
        if err:
            return err
        gider, errors = GiderCommandService().onayla(
            pk, islem_yapan=request.user if request.user.is_authenticated else None,
            ip_adresi=get_client_ip(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(GiderQueryService.serialize(gider))


class GiderV2IptalView(APIView):
    def post(self, request, pk):
        gider, err = _gate(request, pk)
        if err:
            return err
        gider, errors = GiderCommandService().iptal_et(
            pk, islem_yapan=request.user if request.user.is_authenticated else None,
            ip_adresi=get_client_ip(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(GiderQueryService.serialize(gider))


class GiderV2DashboardView(APIView):
    def get(self, request):
        kurum_id, err = _require_kurum(request)
        if err:
            return err
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err
        return Response(GiderDashboardService().summary(kurum_id, sube_id))
