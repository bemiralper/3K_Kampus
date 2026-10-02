"""Tahsilat faturası — önizleme ve Uyumsoft taslağı."""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.finans.application.e_belge_service import gonder, iptal, onizleme, serialize_ozet
from apps.finans.infrastructure.uyumsoft_client import UyumsoftError
from apps.odeme_takip.domain.models import Tahsilat
from apps.odeme_takip.interfaces.sube_context import assert_tahsilat_record_access
from apps.odeme_takip.permissions import ODEME_TAKIP_PERMISSIONS


def _load(request, pk):
    try:
        tahsilat = Tahsilat.objects.select_related(
            'sozlesme__ogrenci',
            'sozlesme__kurum',
            'sozlesme__veli',
            'e_belge',
        ).prefetch_related(
            'sozlesme__kalemler',
            'sozlesme__ogrenci__veliler',
            'sozlesme__ogrenci__adresler',
        ).get(pk=pk)
    except Tahsilat.DoesNotExist:
        return None, Response({'error': 'Tahsilat bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    err = assert_tahsilat_record_access(request, tahsilat)
    if err:
        return None, err
    return tahsilat, None


def _overrides(request) -> dict:
    data = request.data if isinstance(request.data, dict) else {}
    return {
        'adres': data.get('adres') or '',
        'il': data.get('il') or '',
        'ilce': data.get('ilce') or '',
        'eposta': data.get('eposta') or '',
        'satirlar': data.get('satirlar') if isinstance(data.get('satirlar'), list) else None,
    }


@api_view(['GET'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def tahsilat_fatura(request, pk):
    tahsilat, err = _load(request, pk)
    if err:
        return err
    try:
        return Response(onizleme(tahsilat))
    except UyumsoftError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def tahsilat_fatura_gonder(request, pk):
    tahsilat, err = _load(request, pk)
    if err:
        return err
    try:
        return Response(gonder(tahsilat, request.user, _overrides(request)))
    except UyumsoftError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes(ODEME_TAKIP_PERMISSIONS)
def tahsilat_fatura_iptal(request, pk):
    tahsilat, err = _load(request, pk)
    if err:
        return err
    try:
        return Response(iptal(tahsilat, request.user))
    except UyumsoftError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


def e_belge_ozet(tahsilat):
    return serialize_ozet(tahsilat)
