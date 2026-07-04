"""Mandatory şube bağlamı — koçluk modülü endpoint'leri."""
from rest_framework.response import Response

from shared.context import get_secili_kurum_id, get_secili_egitim_yili_id
from shared.sube_context import assert_record_sube_access as _assert_record
from shared.sube_context import resolve_mandatory_sube as _resolve_mandatory


def _error_response(err):
    return Response({'success': False, 'error': err['error']}, status=err['status'])


def resolve_mandatory_coaching_sube(request, kurum_id):
    sube_id, err = _resolve_mandatory(request, kurum_id)
    if err:
        return None, _error_response(err)
    return sube_id, None


def assert_coaching_student_sube_access(request, kurum_id, student_sube_id):
    err = _assert_record(request, kurum_id, student_sube_id)
    if err:
        return _error_response(err)
    return None


def mandatory_coaching_context(request):
    """
    Liste/oluşturma endpoint'leri için zorunlu kurum + şube bağlamı.

    Returns:
        (ctx_dict, None) veya (None, Response)
    """
    kurum_id = get_secili_kurum_id(request)
    if not kurum_id:
        return None, Response({'success': False, 'error': 'Kurum bağlamı zorunludur.'}, status=400)

    sube_id, err = resolve_mandatory_coaching_sube(request, kurum_id)
    if err:
        return None, err

    return {
        'kurum_id': kurum_id,
        'sube_id': sube_id,
        'egitim_yili_id': get_secili_egitim_yili_id(request),
    }, None


def filter_queryset_by_student_sube(queryset, sube_id, *, prefix='student'):
    return queryset.filter(**{f'{prefix}__sube_id': sube_id})


def assert_assignment_record_sube_access(request, assignment):
    """CoachStudentAssignment — öğrenci şubesi üzerinden erişim."""
    student = assignment.student
    if not student or not student.kurum_id:
        return Response({'success': False, 'error': 'Kayıt bu şubeye ait değil.'}, status=403)
    return assert_coaching_student_sube_access(request, student.kurum_id, student.sube_id)
