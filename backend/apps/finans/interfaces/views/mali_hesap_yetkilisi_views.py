"""
Mali Hesap Yetkilisi API Views
Kurumdaki tüm mali hesaplardan sorumlu kişi CRUD — şube bağlamı zorunlu.
"""
import logging

from django.db import DatabaseError
from django.db.models import Q
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status

from apps.finans.domain.mali_hesap_yetkilisi import MaliHesapYetkilisi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.interfaces.serializers.mali_hesap_yetkilisi_serializer import (
    MaliHesapYetkilisiSerializer,
    MaliHesapYetkilisiCreateSerializer,
)

logger = logging.getLogger(__name__)


def _yetkililer_for_kurum(kurum_id):
    """Kurum geneli + (eski) hesap bazlı kayıtlar. kolon yoksa hesap üzerinden düşer."""
    try:
        return MaliHesapYetkilisi.objects.filter(
            Q(kurum_id=kurum_id) | Q(mali_hesap__sube__kurum_id=kurum_id),
        ).select_related('personel').distinct().order_by('siralama', 'ad_soyad')
    except DatabaseError:
        logger.exception('Mali hesap yetkilisi kurum filtresi başarısız')
        return MaliHesapYetkilisi.objects.filter(
            mali_hesap__sube__kurum_id=kurum_id,
        ).select_related('personel').order_by('siralama', 'ad_soyad')


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
        instance = MaliHesapYetkilisi.objects.select_related(
            'mali_hesap__sube', 'kurum',
        ).get(pk=yetkili_pk)
    except MaliHesapYetkilisi.DoesNotExist:
        return None, Response(
            {'error': 'Yetkili kaydı bulunamadı.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    kurum_id = instance.kurum_id
    record_sube_id = None
    if instance.mali_hesap_id:
        kurum_id = kurum_id or instance.mali_hesap.sube.kurum_id
        record_sube_id = instance.mali_hesap.sube_id
    if not kurum_id:
        return None, Response(
            {'error': 'Yetkili kaydı kurum bilgisi eksik.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from apps.finans.interfaces.views.sube_context import (
        assert_record_sube_access,
        resolve_mandatory_finans_sube,
    )

    if record_sube_id:
        err = assert_record_sube_access(request, kurum_id, record_sube_id)
        if err:
            return None, err
    else:
        _, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return None, err
    return instance, None


class MaliHesapYetkilisiListCreateView(APIView):
    """
    GET  /finans/api/mali-hesaplar/<mali_hesap_id>/yetkililer/  → Kurum listesi
    POST /finans/api/mali-hesaplar/<mali_hesap_id>/yetkililer/  → Tüm hesaplara ekle
    """

    def get(self, request, mali_hesap_id):
        hesap, err = _mali_hesap_sube_gate(request, mali_hesap_id)
        if err:
            return err

        try:
            qs = _yetkililer_for_kurum(hesap.sube.kurum_id)
            serializer = MaliHesapYetkilisiSerializer(qs, many=True)
            return Response({'yetkililer': serializer.data, 'toplam': qs.count()})
        except DatabaseError:
            logger.exception('Mali hesap yetkilileri listelenemedi')
            return Response(
                {
                    'error': 'Yetkili listesi alınamadı. Veritabanı güncellemesi gerekli.',
                    'yetkililer': [],
                    'toplam': 0,
                },
                status=status.HTTP_200_OK,
            )

    def post(self, request, mali_hesap_id):
        hesap, err = _mali_hesap_sube_gate(request, mali_hesap_id)
        if err:
            return err

        input_serializer = MaliHesapYetkilisiCreateSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': input_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = dict(input_serializer.validated_data)
        personel_id = payload.get('personel_id')
        if personel_id:
            from apps.personel.domain.models import Personel
            personel = Personel.objects.filter(pk=personel_id).first()
            if personel:
                if not (payload.get('telefon') or '').strip():
                    payload['telefon'] = (personel.cep_telefon or personel.telefon or '').strip()
                if not (payload.get('ad_soyad') or '').strip():
                    payload['ad_soyad'] = f'{personel.ad} {personel.soyad}'.strip()
        try:
            instance = MaliHesapYetkilisi.objects.create(
                kurum_id=hesap.sube.kurum_id,
                mali_hesap=None,
                **payload,
            )
        except DatabaseError:
            logger.exception('Kurum yetkilisi kaydı oluşturulamadı')
            return Response(
                {'error': 'Yetkili kaydedilemedi. Veritabanı güncellemesi gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
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
