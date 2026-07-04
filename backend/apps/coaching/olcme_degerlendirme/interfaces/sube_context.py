"""Mandatory şube bağlamı — ölçme değerlendirme endpoint'leri."""
from rest_framework.response import Response

from shared.context import get_secili_kurum_id
from shared.sube_context import assert_record_sube_access as _assert_record
from shared.sube_context import resolve_mandatory_sube as _resolve_mandatory


def _error_response(err):
    return Response({'error': err['error']}, status=err['status'])


def resolve_mandatory_olcme_sube(request, kurum_id):
    """
    Zorunlu şube bağlamını çözümler.

    Returns:
        (sube_id, None) başarılı
        (None, Response) hata
    """
    sube_id, err = _resolve_mandatory(request, kurum_id)
    if err:
        return None, _error_response(err)
    return sube_id, None


def assert_olcme_record_sube_access(request, kurum_id, record_sube_id, *, allow_null_sube=False):
    err = _assert_record(
        request, kurum_id, record_sube_id, allow_null_sube=allow_null_sube,
    )
    if err:
        return _error_response(err)
    return None


def mandatory_olcme_context(request):
    """
    Liste/oluşturma endpoint'leri için zorunlu kurum + şube bağlamı.

    Returns:
        (ctx_dict, None) veya (None, Response)
    """
    kurum_id = get_secili_kurum_id(request)
    if not kurum_id:
        return None, Response({'error': 'Kurum bağlamı zorunludur.'}, status=400)

    sube_id, err = resolve_mandatory_olcme_sube(request, kurum_id)
    if err:
        return None, err

    return {'kurum_id': kurum_id, 'sube_id': sube_id}, None


def assert_olcme_exam_access(request, exam):
    """Tekil sınav kaydı için şube erişim doğrulaması."""
    if not exam or not exam.kurum_id:
        return Response({'error': 'Kayıt bu şubeye ait değil.'}, status=403)
    return assert_olcme_record_sube_access(request, exam.kurum_id, exam.sube_id)


def get_exam_or_response(request, exam_pk, *, active_only=True):
    """Sınavı getir ve şube erişimini doğrula."""
    from apps.coaching.olcme_degerlendirme.models import Exam

    qs = Exam.objects.filter(pk=exam_pk)
    if active_only:
        qs = qs.filter(is_active=True)
    try:
        exam = qs.get()
    except Exam.DoesNotExist:
        return None, Response({'error': 'Sınav bulunamadı.'}, status=404)

    err = assert_olcme_exam_access(request, exam)
    if err:
        return None, err
    return exam, None
