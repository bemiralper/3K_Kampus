"""Zorunlu şube bağlamı — ödeme takip API."""
from rest_framework import status
from rest_framework.response import Response

from shared.context import get_secili_kurum_id, get_secili_egitim_yili_id, _request_payload_get
from shared.sube_context import assert_record_sube_access, resolve_mandatory_sube


def resolve_mandatory_odeme_context(request, *, kurum_id=None):
    """
    Kurum + zorunlu şube + eğitim yılı bağlamını çözümler.

    Returns:
        (kurum_id, sube_id, egitim_yili_id, None) veya (None, None, None, Response)
    """
    resolved_kurum = (
        kurum_id
        or get_secili_kurum_id(request)
        or request.GET.get('kurum_id')
        or _request_payload_get(request, 'kurum_id')
    )
    if not resolved_kurum:
        return None, None, None, Response(
            {'error': 'kurum_id parametresi veya aktif kurum bağlamı zorunludur.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    sube_id, err = resolve_mandatory_sube(request, resolved_kurum)
    if err:
        return None, None, None, Response({'error': err['error']}, status=err['status'])

    egitim_yili_id = get_secili_egitim_yili_id(request) or request.GET.get('egitim_yili_id')
    return resolved_kurum, sube_id, egitim_yili_id, None


def assert_sozlesme_record_access(request, sozlesme):
    """Tekil sözleşme kaydında aktif şube doğrulaması."""
    if not sozlesme:
        return Response({'error': 'Sözleşme bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

    err = assert_record_sube_access(request, sozlesme.kurum_id, sozlesme.sube_id)
    if err:
        return Response({'error': err['error']}, status=err['status'])
    return None


def assert_tahsilat_record_access(request, tahsilat):
    if not tahsilat:
        return Response({'error': 'Tahsilat bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    if not tahsilat.sozlesme_id:
        return Response({'error': 'Tahsilat sözleşmeye bağlı değil.'}, status=status.HTTP_400_BAD_REQUEST)
    return assert_sozlesme_record_access(request, tahsilat.sozlesme)


def assert_indirim_record_access(request, indirim_id):
    from apps.odeme_takip.domain.models import SozlesmeIndirimi

    try:
        indirim = SozlesmeIndirimi.objects.select_related('sozlesme').get(pk=indirim_id)
    except SozlesmeIndirimi.DoesNotExist:
        return Response({'error': 'İndirim bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    return assert_sozlesme_record_access(request, indirim.sozlesme)


def assert_kalem_record_access(request, kalem_id):
    from apps.odeme_takip.domain.models import SozlesmeKalemi

    try:
        kalem = SozlesmeKalemi.objects.select_related('sozlesme').get(pk=kalem_id)
    except SozlesmeKalemi.DoesNotExist:
        return Response({'error': 'Kalem bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    return assert_sozlesme_record_access(request, kalem.sozlesme)


def assert_taksit_record_access(request, taksit_id):
    from apps.odeme_takip.domain.models import Taksit

    try:
        taksit = Taksit.objects.select_related('sozlesme').get(pk=taksit_id)
    except Taksit.DoesNotExist:
        return Response({'error': 'Taksit bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    return assert_sozlesme_record_access(request, taksit.sozlesme)


def gate_sozlesme_pk(request, pk):
    """Sözleşmeyi yükle ve şube erişimini doğrula."""
    from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService

    sozlesme = SozlesmeService().get_by_id(pk)
    err_resp = assert_sozlesme_record_access(request, sozlesme)
    if err_resp:
        return None, err_resp
    return sozlesme, None
