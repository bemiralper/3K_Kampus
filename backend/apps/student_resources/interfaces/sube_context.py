"""Mandatory şube bağlamı — öğrenci kaynak havuzu endpoint'leri."""
from rest_framework.response import Response

from shared.context import get_secili_kurum_id
from shared.sube_context import assert_record_sube_access as _assert_record
from shared.sube_context import resolve_mandatory_sube as _resolve_mandatory


def _error_response(err):
    return Response({'error': err['error']}, status=err['status'])


def resolve_mandatory_student_resources_sube(request, kurum_id):
    sube_id, err = _resolve_mandatory(request, kurum_id)
    if err:
        return None, _error_response(err)
    return sube_id, None


def assert_student_resource_record_sube_access(request, student):
    if not student or not student.kurum_id:
        return Response({'error': 'Kayıt bu şubeye ait değil.'}, status=403)
    err = _assert_record(request, student.kurum_id, student.sube_id)
    if err:
        return _error_response(err)
    return None


def mandatory_student_resources_context(request):
    kurum_id = get_secili_kurum_id(request)
    if not kurum_id:
        return None, Response({'error': 'Kurum bağlamı zorunludur.'}, status=400)

    sube_id, err = resolve_mandatory_student_resources_sube(request, kurum_id)
    if err:
        return None, err

    return {'kurum_id': kurum_id, 'sube_id': sube_id}, None


def filter_assignments_by_student_sube(queryset, sube_id, *, prefix='student'):
    return queryset.filter(**{f'{prefix}__sube_id': sube_id})
