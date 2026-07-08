"""
Ödeme Yöntemi API Views
Kurum düzeyinde ödeme yöntemi CRUD + toggle + dropdown.
"""
from django.db.models import F, Q
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status

from apps.finans.application.payment_method_service import OdemeYontemiService
from apps.finans.application.selectors.payment_method_selector import OdemeYontemiSelector
from apps.finans.interfaces.serializers.payment_method_serializer import (
    OdemeYontemiListSerializer,
    OdemeYontemiDetailSerializer,
    OdemeYontemiCreateSerializer,
    OdemeYontemiUpdateSerializer,
)
from apps.finans.constants.payment_types import OdemeYontemiTipi


class OdemeYontemiListCreateView(APIView):
    """
    GET  /finans/api/odeme-yontemleri/?kurum_id=X    → Liste
    POST /finans/api/odeme-yontemleri/                → Yeni oluştur
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

        selector = OdemeYontemiSelector()
        queryset = selector.get_all_by_kurum(kurum_id).filter(
            Q(mali_hesap__sube_id=sube_id) | Q(mali_hesap__isnull=True),
        )

        # Opsiyonel filtreler
        tip = request.query_params.get('tip')
        if tip:
            queryset = queryset.filter(tip=tip)

        aktif = request.query_params.get('aktif')
        if aktif is not None:
            aktif_bool = aktif.lower() in ('true', '1', 'yes')
            queryset = queryset.filter(aktif_mi=aktif_bool)

        mali_hesap_id = request.query_params.get('mali_hesap_id')
        if mali_hesap_id:
            from apps.finans.application.odeme_yontemi_plan_helpers import (
                filter_odeme_yontemleri_for_mali_hesap,
            )
            queryset = filter_odeme_yontemleri_for_mali_hesap(
                queryset, mali_hesap_id, kurum_id=kurum_id,
            )

        serializer = OdemeYontemiListSerializer(queryset, many=True)
        return Response({
            'odeme_yontemleri': serializer.data,
            'toplam': queryset.count(),
            'tip_secenekleri': OdemeYontemiTipi.CHOICES,
        })

    def post(self, request):
        input_serializer = OdemeYontemiCreateSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': input_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        kurum_id = request.data.get('kurum_id')
        if not kurum_id:
            return Response(
                {'error': 'kurum_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.finans.domain.financial_account import MaliHesap
        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        mali_hesap_id = input_serializer.validated_data.get('mali_hesap_id')
        tip = input_serializer.validated_data.get('tip', OdemeYontemiTipi.NAKIT)
        cek_senet = tip in (OdemeYontemiTipi.CEK, OdemeYontemiTipi.SENET)

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        if not cek_senet:
            if not mali_hesap_id:
                return Response(
                    {'error': 'Ödeme yöntemi oluşturulamadı.', 'details': {'mali_hesap_id': 'Mali hesap zorunludur.'}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                mali_hesap = MaliHesap.objects.get(pk=mali_hesap_id)
            except MaliHesap.DoesNotExist:
                return Response(
                    {'error': 'Ödeme yöntemi oluşturulamadı.', 'details': {'mali_hesap_id': 'Seçilen mali hesap bulunamadı.'}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if int(mali_hesap.sube_id) != int(sube_id):
                return Response(
                    {'error': 'Kayıt bu şubeye ait değil.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        service = OdemeYontemiService()
        instance, errors = service.create(kurum_id, input_serializer.validated_data)

        if errors:
            return Response(
                {'error': 'Ödeme yöntemi oluşturulamadı.', 'details': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output = OdemeYontemiDetailSerializer(instance).data
        return Response(output, status=status.HTTP_201_CREATED)


class OdemeYontemiDetailView(APIView):
    """
    GET    /finans/api/odeme-yontemleri/<pk>/  → Detay
    PUT    /finans/api/odeme-yontemleri/<pk>/  → Güncelle
    DELETE /finans/api/odeme-yontemleri/<pk>/  → Soft delete
    """

    def get(self, request, pk):
        selector = OdemeYontemiSelector()
        instance = selector.get_by_id(pk)
        if not instance:
            return Response(
                {'error': 'Ödeme yöntemi bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(
            request, instance.kurum_id,
            instance.mali_hesap.sube_id if instance.mali_hesap_id else None,
            allow_null_sube=instance.mali_hesap_id is None,
        )
        if err:
            return err

        serializer = OdemeYontemiDetailSerializer(instance)
        return Response(serializer.data)

    def put(self, request, pk):
        selector = OdemeYontemiSelector()
        instance = selector.get_by_id(pk)
        if not instance:
            return Response(
                {'error': 'Ödeme yöntemi bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(
            request, instance.kurum_id,
            instance.mali_hesap.sube_id if instance.mali_hesap_id else None,
            allow_null_sube=instance.mali_hesap_id is None,
        )
        if err:
            return err

        input_serializer = OdemeYontemiUpdateSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': input_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = OdemeYontemiService()
        instance, errors = service.update(pk, input_serializer.validated_data)

        if errors:
            return Response(
                {'error': 'Ödeme yöntemi güncellenemedi.', 'details': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output = OdemeYontemiDetailSerializer(instance).data
        return Response(output)

    def delete(self, request, pk):
        selector = OdemeYontemiSelector()
        instance = selector.get_by_id(pk)
        if not instance:
            return Response(
                {'error': 'Ödeme yöntemi bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(
            request, instance.kurum_id,
            instance.mali_hesap.sube_id if instance.mali_hesap_id else None,
            allow_null_sube=instance.mali_hesap_id is None,
        )
        if err:
            return err

        service = OdemeYontemiService()
        instance, errors = service.soft_delete(pk)

        if errors:
            return Response(
                {'error': 'Silme işlemi başarısız.', 'details': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {'message': 'Ödeme yöntemi silindi.', 'id': pk},
            status=status.HTTP_200_OK,
        )


class OdemeYontemiToggleView(APIView):
    """
    POST /finans/api/odeme-yontemleri/<pk>/toggle/  → Aktif/Pasif toggle
    """

    def post(self, request, pk):
        selector = OdemeYontemiSelector()
        instance = selector.get_by_id(pk)
        if not instance:
            return Response(
                {'error': 'Ödeme yöntemi bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(
            request, instance.kurum_id,
            instance.mali_hesap.sube_id if instance.mali_hesap_id else None,
            allow_null_sube=instance.mali_hesap_id is None,
        )
        if err:
            return err

        service = OdemeYontemiService()
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

        output = OdemeYontemiDetailSerializer(instance).data
        return Response({
            'message': f'Ödeme yöntemi {action} yapıldı.',
            'odeme_yontemi': output,
        })


class OdemeYontemiDropdownView(APIView):
    """
    GET /finans/api/odeme-yontemleri/dropdown/?kurum_id=X&mali_hesap_id=Y  → Dropdown listesi
    Sadece aktif kayıtlar — id, ad, tip, mali_hesap_id döndürür.

    mali_hesap_id verilirse SADECE o mali hesaba ait ödeme yöntemleri döner.
    Bu, tüm tahsilat/gider/gelir formlarındaki "önce Mali Hesap seç, sonra
    sadece o hesaba ait Ödeme Yöntemi listelensin" akışının temelidir.
    """

    def get(self, request):
        kurum_id = (
            request.query_params.get('kurum_id')
            or getattr(request, 'active_kurum_id', None)
            or request.META.get('HTTP_X_KURUM_ID')
        )
        if not kurum_id:
            return Response(
                {'error': 'kurum_id parametresi zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        mali_hesap_id = request.query_params.get('mali_hesap_id')

        selector = OdemeYontemiSelector()
        if mali_hesap_id:
            data = list(selector.get_dropdown_list(kurum_id, mali_hesap_id=mali_hesap_id))
        else:
            from apps.finans.application.odeme_yontemi_plan_helpers import (
                dedupe_odeme_yontemleri_for_plan,
                ensure_kurum_plan_odeme_yontemleri,
            )

            ensure_kurum_plan_odeme_yontemleri(int(kurum_id))
            qs = selector.get_active_by_kurum(kurum_id).filter(
                Q(mali_hesap__sube_id=sube_id) | Q(mali_hesap__isnull=True),
            )
            data = dedupe_odeme_yontemleri_for_plan(qs)
        return Response({'odeme_yontemleri': data})
