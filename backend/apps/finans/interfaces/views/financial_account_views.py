"""
Mali Hesap API Views
Şube düzeyinde mali hesap CRUD + toggle + dropdown.
"""
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status

from apps.finans.application.financial_account_service import MaliHesapService
from apps.finans.application.selectors.financial_account_selector import MaliHesapSelector
from apps.finans.interfaces.serializers.financial_account_serializer import (
    MaliHesapListSerializer,
    MaliHesapDetailSerializer,
    MaliHesapCreateSerializer,
    MaliHesapUpdateSerializer,
)
from apps.finans.constants.account_types import MaliHesapTipi, BankaKodu


class MaliHesapListCreateView(APIView):
    """
    GET  /finans/api/mali-hesaplar/?sube_id=X    → Liste
    POST /finans/api/mali-hesaplar/               → Yeni oluştur
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = MaliHesapSelector()
        queryset = selector.get_all_by_sube(sube_id)

        # Opsiyonel filtreler
        tip = request.query_params.get('tip')
        if tip:
            queryset = queryset.filter(tip=tip)

        aktif = request.query_params.get('aktif')
        if aktif is not None:
            aktif_bool = aktif.lower() in ('true', '1', 'yes')
            queryset = queryset.filter(aktif_mi=aktif_bool)

        serializer = MaliHesapListSerializer(queryset, many=True)
        return Response({
            'mali_hesaplar': serializer.data,
            'toplam': queryset.count(),
            'tip_secenekleri': MaliHesapTipi.CHOICES,
            'banka_secenekleri': BankaKodu.CHOICES,
        })

    def post(self, request):
        from shared.context import get_secili_kurum_id
        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        kurum_id = get_secili_kurum_id(request)
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        body_sube_id = request.data.get('sube_id')
        if body_sube_id is not None and int(body_sube_id) != int(sube_id):
            return Response(
                {'error': 'Kayıt bu şubeye ait değil.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        input_serializer = MaliHesapCreateSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': input_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = MaliHesapService()
        instance, errors = service.create(sube_id, input_serializer.validated_data)

        if errors:
            return Response(
                {'error': 'Mali hesap oluşturulamadı.', 'details': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output = MaliHesapDetailSerializer(instance).data
        return Response(output, status=status.HTTP_201_CREATED)


class MaliHesapDetailView(APIView):
    """
    GET    /finans/api/mali-hesaplar/<pk>/  → Detay
    PUT    /finans/api/mali-hesaplar/<pk>/  → Güncelle
    DELETE /finans/api/mali-hesaplar/<pk>/  → Soft delete
    """

    def get(self, request, pk):
        selector = MaliHesapSelector()
        instance = selector.get_by_id(pk)
        if not instance:
            return Response(
                {'error': 'Mali hesap bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, instance.sube.kurum_id, instance.sube_id)
        if err:
            return err

        serializer = MaliHesapDetailSerializer(instance)
        return Response(serializer.data)

    def put(self, request, pk):
        selector = MaliHesapSelector()
        instance = selector.get_by_id(pk)
        if not instance:
            return Response(
                {'error': 'Mali hesap bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, instance.sube.kurum_id, instance.sube_id)
        if err:
            return err

        input_serializer = MaliHesapUpdateSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': input_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = MaliHesapService()
        instance, errors = service.update(pk, input_serializer.validated_data)

        if errors:
            return Response(
                {'error': 'Mali hesap güncellenemedi.', 'details': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output = MaliHesapDetailSerializer(instance).data
        return Response(output)

    def delete(self, request, pk):
        selector = MaliHesapSelector()
        instance = selector.get_by_id(pk)
        if not instance:
            return Response(
                {'error': 'Mali hesap bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, instance.sube.kurum_id, instance.sube_id)
        if err:
            return err

        service = MaliHesapService()
        instance, errors = service.soft_delete(pk)

        if errors:
            return Response(
                {'error': 'Silme işlemi başarısız.', 'details': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {'message': 'Mali hesap silindi.', 'id': pk},
            status=status.HTTP_200_OK,
        )


class MaliHesapToggleView(APIView):
    """
    POST /finans/api/mali-hesaplar/<pk>/toggle/  → Aktif/Pasif toggle
    """

    def post(self, request, pk):
        selector = MaliHesapSelector()
        instance = selector.get_by_id(pk)
        if not instance:
            return Response(
                {'error': 'Mali hesap bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, instance.sube.kurum_id, instance.sube_id)
        if err:
            return err

        service = MaliHesapService()
        if instance.aktif_mi:
            instance, errors = service.deactivate(pk)
            action = 'pasif'
        else:
            instance, errors = service.activate(pk)
            action = 'aktif'

        if errors:
            return Response(
                {'error': f'Durum değiştirilemedi.', 'details': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output = MaliHesapDetailSerializer(instance).data
        return Response({
            'message': f'Mali hesap {action} yapıldı.',
            'mali_hesap': output,
        })


class MaliHesapAgacView(APIView):
    """
    GET /finans/api/mali-hesaplar/agac/?kurum_id=X&sube_id=Y  → Şube bazlı TreeView verisi

    Yeni "Mali Hesaplar" ekranının sol panelinde kullanılır. Her şube bir
    klasör, altında o şubenin mali hesapları listelenir.
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response(
                {'error': 'kurum_id parametresi zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = MaliHesapSelector()
        agac = selector.get_agac(kurum_id, sube_id=sube_id)
        return Response({'subeler': agac})


class MaliHesapDetayView(APIView):
    """
    GET /finans/api/mali-hesaplar/<pk>/detay/  → Genişletilmiş detay
    (Bakiye, son işlem tarihi, ödeme yöntemi sayısı dahil — sağ panel için)
    """

    def get(self, request, pk):
        selector = MaliHesapSelector()
        detay = selector.get_detay(pk)
        if not detay:
            return Response(
                {'error': 'Mali hesap bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        hesap = detay['hesap']
        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, hesap.sube.kurum_id, hesap.sube_id)
        if err:
            return err

        base = MaliHesapDetailSerializer(hesap).data
        base['bakiye'] = detay['bakiye']
        base['son_islem_tarihi'] = detay['son_islem_tarihi']
        base['odeme_yontemi_sayisi'] = detay['odeme_yontemi_sayisi']
        return Response(base)


class MaliHesapDropdownView(APIView):
    """
    GET /finans/api/mali-hesaplar/dropdown/?sube_id=X  → Dropdown listesi (şube bazlı)
    GET /finans/api/mali-hesaplar/dropdown/?kurum_id=X  → Dropdown listesi (kurum bazlı)
    Sadece aktif kayıtlar — id, ad, tip döndürür.
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response(
                {'error': 'kurum_id parametresi zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = MaliHesapSelector()
        data = list(selector.get_dropdown_list(sube_id))
        return Response({'mali_hesaplar': data})
