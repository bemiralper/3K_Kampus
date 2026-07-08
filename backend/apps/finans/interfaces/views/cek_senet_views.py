"""
Çek / Senet portföy API view'ları.
"""
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser

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


def _current_user(request):
    return request.user if request.user.is_authenticated else None


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
            arac_tipi=request.query_params.get('arac_tipi') or None,
            durum=request.query_params.get('durum') or None,
            sekme=request.query_params.get('sekme') or None,
            vade_baslangic=request.query_params.get('vade_baslangic') or None,
            vade_bitis=request.query_params.get('vade_bitis') or None,
            arama=request.query_params.get('arama', ''),
            sort=request.query_params.get('sort', ''),
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
        user = _current_user(request)
        if payload.get('yon') == 'alinan':
            result, errors = service.create_alinan(payload, user=user)
        elif payload.get('yon') == 'verilen' or request.data.get('create_verilen'):
            result, errors = service.create_verilen(payload, user=user)
        else:
            return Response(
                {'error': 'yon alanı alinan veya verilen olmalı'},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
        payload['timeline'] = service.timeline(pk)
        payload['dosyalar'] = service.dosyalar(pk)
        return Response(payload)

    def patch(self, request, pk):
        service = CekSenetService()
        result, errors = service.guncelle(pk, dict(request.data), user=_current_user(request))
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class CekSenetDashboardView(FinansAPIView):
    permission_classes = [FinansModulePermission]

    def get(self, request):
        kurum_id = _int_param(request.query_params.get('kurum_id')) or get_secili_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id gerekli'}, status=status.HTTP_400_BAD_REQUEST)
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err
        service = CekSenetService()
        return Response(service.dashboard(kurum_id, sube_id=sube_id))


class CekSenetTimelineView(FinansAPIView):
    permission_classes = [FinansModulePermission]

    def get(self, request, pk):
        return Response({'results': CekSenetService().timeline(pk)})


class CekSenetCiroView(FinansAPIView):
    permission_classes = [FinansModulePermission]

    def post(self, request, pk):
        cari_id = _int_param(request.data.get('ciro_edilen_cari_id'))
        if not cari_id:
            return Response({'error': 'ciro_edilen_cari_id gerekli'}, status=status.HTTP_400_BAD_REQUEST)
        result, errors = CekSenetService().ciro_et(
            pk,
            ciro_edilen_cari_id=cari_id,
            ciro_tarihi=request.data.get('ciro_tarihi'),
            aciklama=request.data.get('aciklama', ''),
            user=_current_user(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class CekSenetProtestoView(FinansAPIView):
    permission_classes = [FinansModulePermission]

    def post(self, request, pk):
        result, errors = CekSenetService().protesto_et(
            pk,
            protesto_tarihi=request.data.get('protesto_tarihi'),
            aciklama=request.data.get('aciklama', ''),
            user=_current_user(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class CekSenetIadeView(FinansAPIView):
    permission_classes = [FinansModulePermission]

    def post(self, request, pk):
        result, errors = CekSenetService().iade_et(
            pk,
            iade_tarihi=request.data.get('iade_tarihi'),
            aciklama=request.data.get('aciklama', ''),
            user=_current_user(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class CekSenetIptalView(FinansAPIView):
    permission_classes = [FinansModulePermission]

    def post(self, request, pk):
        result, errors = CekSenetService().iptal_et(
            pk,
            aciklama=request.data.get('aciklama', ''),
            user=_current_user(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class CekSenetDosyaView(FinansAPIView):
    permission_classes = [FinansModulePermission]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, pk):
        return Response({'results': CekSenetService().dosyalar(pk)})

    def post(self, request, pk):
        dosya = request.FILES.get('dosya')
        if not dosya:
            return Response({'error': 'Dosya seçilmedi'}, status=status.HTTP_400_BAD_REQUEST)
        result, errors = CekSenetService().dosya_ekle(
            pk,
            dosya=dosya,
            dosya_adi=request.data.get('dosya_adi', ''),
            dosya_turu=request.data.get('dosya_turu', 'diger'),
            aciklama=request.data.get('aciklama', ''),
            user=_current_user(request),
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_201_CREATED)


class CekSenetDosyaDeleteView(FinansAPIView):
    permission_classes = [FinansModulePermission]

    def delete(self, request, pk, dosya_id):
        ok, errors = CekSenetService().dosya_sil(pk, dosya_id, user=_current_user(request))
        if errors:
            return Response(errors, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True})


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
