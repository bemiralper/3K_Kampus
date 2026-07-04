"""
Gelir Kategorisi API Views
"""
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status

from apps.finans.application.selectors.gelir_kategorisi_selector import GelirKategorisiSelector
from apps.finans.application.gelir_kategorisi_service import GelirKategorisiService
from apps.finans.interfaces.serializers.gelir_kategorisi_serializer import (
    GelirKategorisiDetailSerializer,
    GelirKategorisiCreateSerializer,
    GelirKategorisiUpdateSerializer,
)


class GelirKategorisiTreeView(APIView):
    """GET /finans/api/gelir-kategorileri/tree/?kurum_id=X"""

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

        selector = GelirKategorisiSelector()
        tree = selector.get_tree(kurum_id, sube_id=sube_id)
        return Response({
            'kategoriler': tree,
            'toplam_ana': len(tree),
            'toplam_alt': sum(len(k['alt_kategoriler']) for k in tree),
        })


class GelirKategorisiListCreateView(APIView):
    """GET /finans/api/gelir-kategorileri/ — POST yeni kategori"""

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

        selector = GelirKategorisiSelector()
        parent_id = request.query_params.get('parent_id')
        seviye = request.query_params.get('seviye')

        if seviye == 'ana':
            queryset = selector.get_ana_kategoriler(kurum_id, sube_id=sube_id)
        elif parent_id:
            queryset = selector.get_alt_kategoriler(parent_id)
        else:
            queryset = selector.get_all_by_kurum(kurum_id, sube_id=sube_id)

        aktif = request.query_params.get('aktif')
        if aktif is not None:
            aktif_bool = aktif.lower() in ('true', '1', 'yes')
            queryset = queryset.filter(aktif_mi=aktif_bool)

        serializer = GelirKategorisiDetailSerializer(queryset, many=True)
        return Response({
            'kategoriler': serializer.data,
            'toplam': queryset.count(),
        })

    def post(self, request):
        kurum_id = request.data.get('kurum_id')
        if not kurum_id:
            return Response(
                {'error': 'kurum_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        input_serializer = GelirKategorisiCreateSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': input_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        body_sube_id = input_serializer.validated_data.get('sube_id')
        if body_sube_id is not None and int(body_sube_id) != int(sube_id):
            return Response(
                {'error': 'Kayıt bu şubeye ait değil.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        payload = dict(input_serializer.validated_data)
        payload['sube_id'] = sube_id

        service = GelirKategorisiService()
        instance, errors = service.create(kurum_id, payload)

        if errors:
            return Response(
                {'error': 'Gelir kategorisi oluşturulamadı.', 'details': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output = GelirKategorisiDetailSerializer(instance).data
        return Response(output, status=status.HTTP_201_CREATED)


class GelirKategorisiDetailView(APIView):
    """GET/PUT/DELETE /finans/api/gelir-kategorileri/<pk>/"""

    def get(self, request, pk):
        selector = GelirKategorisiSelector()
        instance = selector.get_by_id(pk)
        if not instance:
            return Response(
                {'error': 'Gelir kategorisi bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, instance.kurum_id, instance.sube_id)
        if err:
            return err

        serializer = GelirKategorisiDetailSerializer(instance)
        return Response(serializer.data)

    def put(self, request, pk):
        selector = GelirKategorisiSelector()
        instance = selector.get_by_id(pk)
        if not instance:
            return Response(
                {'error': 'Gelir kategorisi bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, instance.kurum_id, instance.sube_id)
        if err:
            return err

        input_serializer = GelirKategorisiUpdateSerializer(data=request.data)
        if not input_serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': input_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = GelirKategorisiService()
        instance, errors = service.update(pk, input_serializer.validated_data)

        if errors:
            return Response(
                {'error': 'Gelir kategorisi güncellenemedi.', 'details': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output = GelirKategorisiDetailSerializer(instance).data
        return Response(output)

    def delete(self, request, pk):
        selector = GelirKategorisiSelector()
        instance = selector.get_by_id(pk)
        if not instance:
            return Response(
                {'error': 'Gelir kategorisi bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, instance.kurum_id, instance.sube_id)
        if err:
            return err

        service = GelirKategorisiService()
        instance, errors = service.soft_delete(pk)

        if errors:
            return Response(
                {'error': 'Silme işlemi başarısız.', 'details': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {'message': 'Gelir kategorisi silindi.', 'id': pk},
            status=status.HTTP_200_OK,
        )


class GelirKategorisiToggleView(APIView):
    """POST /finans/api/gelir-kategorileri/<pk>/toggle/"""

    def post(self, request, pk):
        selector = GelirKategorisiSelector()
        instance = selector.get_by_id(pk)
        if not instance:
            return Response(
                {'error': 'Gelir kategorisi bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, instance.kurum_id, instance.sube_id)
        if err:
            return err

        service = GelirKategorisiService()
        instance, errors = service.toggle_aktif(pk)

        if errors:
            return Response(
                {'error': 'Durum değiştirilemedi.', 'details': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output = GelirKategorisiDetailSerializer(instance).data
        return Response({
            'message': f"Kategori {'aktif' if instance.aktif_mi else 'pasif'} yapıldı.",
            'kategori': output,
        })


class GelirKategorisiSeedView(APIView):
    """POST /finans/api/gelir-kategorileri/seed/"""

    def post(self, request):
        kurum_id = request.data.get('kurum_id')
        if not kurum_id:
            return Response(
                {'error': 'kurum_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        body_sube_id = request.data.get('sube_id')
        if body_sube_id is not None and int(body_sube_id) != int(sube_id):
            return Response(
                {'error': 'Kayıt bu şubeye ait değil.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        service = GelirKategorisiService()
        ana_count, alt_count = service.seed_varsayilan(kurum_id, sube_id=sube_id)

        if ana_count == 0:
            return Response({
                'message': 'Bu şube için gelir kategorileri zaten mevcut.',
                'olusturulan_ana': 0,
                'olusturulan_alt': 0,
            })

        return Response({
            'message': f'{ana_count} ana kategori ve {alt_count} alt kategori oluşturuldu.',
            'olusturulan_ana': ana_count,
            'olusturulan_alt': alt_count,
        }, status=status.HTTP_201_CREATED)
