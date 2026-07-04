"""
Çek / Senet portföy API view'ları.
"""
from rest_framework.response import Response
from rest_framework import status

from apps.finans.application.cek_senet.cek_senet_service import CekSenetService, serialize_cek_senet
from apps.finans.interfaces.views.base import FinansAPIView
from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube
from shared.context import get_secili_kurum_id
from shared.permissions import FinansModulePermission


def _int_param(value):
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class CekSenetListView(FinansAPIView):
    """GET — portföy listesi; POST — verilen kayıt oluştur."""

    permission_classes = [FinansModulePermission]

    def get(self, request):
        kurum_id = _int_param(request.query_params.get('kurum_id')) or get_secili_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id gerekli'}, status=status.HTTP_400_BAD_REQUEST)

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        service = CekSenetService()
        data = service.list_kayitlar(
            kurum_id,
            sube_id=sube_id,
            yon=request.query_params.get('yon') or None,
            durum=request.query_params.get('durum') or None,
            arama=request.query_params.get('arama', ''),
            page=_int_param(request.query_params.get('page')) or 1,
            page_size=_int_param(request.query_params.get('page_size')) or 25,
        )
        return Response(data)

    def post(self, request):
        kurum_id = _int_param(request.data.get('kurum_id')) or get_secili_kurum_id(request)
        sube_id = _int_param(request.data.get('sube_id'))
        if not kurum_id:
            return Response({'error': 'kurum_id gerekli'}, status=status.HTTP_400_BAD_REQUEST)
        if not sube_id:
            sube_id_res, err = resolve_mandatory_finans_sube(request, kurum_id)
            if err:
                return err
            sube_id = sube_id_res

        payload = dict(request.data)
        payload['kurum_id'] = kurum_id
        payload['sube_id'] = sube_id

        service = CekSenetService()
        if payload.get('yon') == 'verilen' or request.data.get('create_verilen'):
            result, errors = service.create_verilen(payload, user=request.user if request.user.is_authenticated else None)
        else:
            return Response({'error': 'POST yalnızca verilen çek/senet oluşturmak için (yon=verilen)'}, status=status.HTTP_400_BAD_REQUEST)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_201_CREATED)


class CekSenetDetailView(FinansAPIView):
    permission_classes = [FinansModulePermission]

    def get(self, request, pk):
        service = CekSenetService()
        detay = service.get_by_id(pk)
        if not detay:
            return Response({'error': 'Kayıt bulunamadı'}, status=status.HTTP_404_NOT_FOUND)
        payload = serialize_cek_senet(detay)
        payload['allowed_transitions'] = service.allowed_transitions(detay)
        return Response(payload)


class CekSenetTransitionView(FinansAPIView):
    permission_classes = [FinansModulePermission]

    def post(self, request, pk):
        hedef = request.data.get('durum') or request.data.get('hedef_durum')
        if not hedef:
            return Response({'error': 'durum gerekli'}, status=status.HTTP_400_BAD_REQUEST)

        service = CekSenetService()
        detay, errors = service.transition(
            pk,
            hedef,
            payload=request.data,
            user=request.user if request.user.is_authenticated else None,
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        payload = serialize_cek_senet(detay)
        payload['allowed_transitions'] = service.allowed_transitions(detay)
        return Response(payload)


class CekSenetTahsilView(FinansAPIView):
    permission_classes = [FinansModulePermission]

    def post(self, request, pk):
        mali_hesap_id = _int_param(request.data.get('tahsilat_mali_hesap_id') or request.data.get('mali_hesap_id'))
        if not mali_hesap_id:
            return Response({'error': 'tahsilat_mali_hesap_id gerekli'}, status=status.HTTP_400_BAD_REQUEST)

        service = CekSenetService()
        result, errors = service.tahsil_et(
            pk,
            tahsilat_mali_hesap_id=mali_hesap_id,
            tahsilat_tarihi=request.data.get('tahsilat_tarihi'),
            referans_no=request.data.get('referans_no', ''),
            aciklama=request.data.get('aciklama', ''),
            user=request.user if request.user.is_authenticated else None,
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class CekSenetOdeView(FinansAPIView):
    permission_classes = [FinansModulePermission]

    def post(self, request, pk):
        mali_hesap_id = _int_param(request.data.get('odeme_mali_hesap_id') or request.data.get('mali_hesap_id'))
        if not mali_hesap_id:
            return Response({'error': 'odeme_mali_hesap_id gerekli'}, status=status.HTTP_400_BAD_REQUEST)

        service = CekSenetService()
        result, errors = service.ode(
            pk,
            odeme_mali_hesap_id=mali_hesap_id,
            odeme_tarihi=request.data.get('odeme_tarihi'),
            aciklama=request.data.get('aciklama', ''),
            user=request.user if request.user.is_authenticated else None,
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)
