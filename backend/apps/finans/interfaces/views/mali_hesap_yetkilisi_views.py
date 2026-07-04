"""
Mali Hesap Yetkilisi API Views
Bilgilendirme amaçlı yetkili/sorumlu kişi CRUD — şube bağlamı zorunlu.
"""
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status

from apps.finans.domain.mali_hesap_yetkilisi import MaliHesapYetkilisi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.interfaces.serializers.mali_hesap_yetkilisi_serializer import (
    MaliHesapYetkilisiSerializer,
    MaliHesapYetkilisiCreateSerializer,
)


def _mali_hesap_sube_gate(request, mali_hesap_id):
    try:
        hesap = MaliHesap.objects.select_related('sube').get(pk=mali_hesap_id)
    except MaliHesap.DoesNotExist:
        return None, Response(
            {'error': 'Mali hesap bulunamadı.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    from apps.finans.interfaces.views.sube_context import assert_record_sube_access

    err = assert_record_sube_access(request, hesap.sube.kurum_id, hesap.sube_id)
    if err:
        return None, err
    return hesap, None


def _yetkili_sube_gate(request, yetkili_pk):
    try:
        instance = MaliHesapYetkilisi.objects.select_related('mali_hesap__sube').get(pk=yetkili_pk)
    except MaliHesapYetkilisi.DoesNotExist:
        return None, Response(
            {'error': 'Yetkili kaydı bulunamadı.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    hesap = instance.mali_hesap
    from apps.finans.interfaces.views.sube_context import assert_record_sube_access

    err = assert_record_sube_access(request, hesap.sube.kurum_id, hesap.sube_id)
    if err:
        return None, err
    return instance, None


class MaliHesapYetkilisiListCreateView(APIView):
    """
    GET  /finans/api/mali-hesaplar/<mali_hesap_id>/yetkililer/  → Liste
    POST /finans/api/mali-hesaplar/<mali_hesap_id>/yetkililer/  → Yeni ekle
    """

    def get(self, request, mali_hesap_id):
        _, err = _mali_hesap_sube_gate(request, mali_hesap_id)
        if err:
            return err

        qs = MaliHesapYetkilisi.objects.filter(
            mali_hesap_id=mali_hesap_id,
        ).select_related('personel').order_by('siralama', 'ad_soyad')
        serializer = MaliHesapYetkilisiSerializer(qs, many=True)
        return Response({'yetkililer': serializer.data, 'toplam': qs.count()})

    def post(self, request, mali_hesap_id):
        _, err = _mali_hesap_sube_gate(request, mali_hesap_id)
        if err:
            return err

        input_serializer = MaliHesapYetkilisiCreateSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': input_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance = MaliHesapYetkilisi.objects.create(
            mali_hesap_id=mali_hesap_id,
            **input_serializer.validated_data,
        )
        output = MaliHesapYetkilisiSerializer(instance).data
        return Response(output, status=status.HTTP_201_CREATED)


class MaliHesapYetkilisiDetailView(APIView):
    """
    PUT    /finans/api/yetkililer/<pk>/  → Güncelle
    DELETE /finans/api/yetkililer/<pk>/  → Sil (kalıcı — bu bir tanım/rehber kaydı)
    """

    def put(self, request, pk):
        instance, err = _yetkili_sube_gate(request, pk)
        if err:
            return err

        input_serializer = MaliHesapYetkilisiCreateSerializer(data=request.data, partial=True)
        if not input_serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': input_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for key, value in input_serializer.validated_data.items():
            setattr(instance, key, value)
        instance.save()

        output = MaliHesapYetkilisiSerializer(instance).data
        return Response(output)

    def delete(self, request, pk):
        instance, err = _yetkili_sube_gate(request, pk)
        if err:
            return err

        instance.delete()
        return Response({'message': 'Yetkili kaydı silindi.', 'id': pk})
