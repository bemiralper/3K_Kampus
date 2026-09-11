"""
Eşleştirme Şablonu View'ları

  - list_mapping_templates   → Sınav türüne göre filtreli liste
  - create_mapping_template  → Yeni şablon oluştur
  - delete_mapping_template  → Şablon sil

Şablonlar kurum bazlıdır: `mappings` içindeki `ders_<id>` alanları o kurumun
bölüm ID'lerini taşır, bu yüzden başka kurumun şablonu listelenmemeli ve
silinememelidir. Kurumu boş olan eski kayıtlar geçiş dönemi için görünür kalır.
"""
from django.db.models import Q
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from shared.context import get_secili_kurum_id
from shared.permissions import OlcmeModulePermission

from ..models import MappingTemplate
from ..serializers.mapping_template import MappingTemplateSerializer
from ..views import CsrfExemptSessionAuthentication


def _visible_templates(request):
    kurum_id = get_secili_kurum_id(request)
    qs = MappingTemplate.objects.all()
    if kurum_id:
        return qs.filter(Q(kurum_id=kurum_id) | Q(kurum__isnull=True))
    return qs.filter(kurum__isnull=True)


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def list_mapping_templates(request):
    """
    GET /exams/mapping-templates/?exam_type=YKS_TYT
    Sınav türüne göre filtrelenmiş şablonlar.
    """
    exam_type = request.query_params.get('exam_type', '')
    qs = _visible_templates(request)
    if exam_type:
        qs = qs.filter(exam_type=exam_type)
    data = MappingTemplateSerializer(qs, many=True).data
    return Response(data)


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([OlcmeModulePermission])
def create_mapping_template(request):
    """
    POST /exams/mapping-templates/
    JSON body: { name, exam_type, mappings, first_line_is_header, student_id_field }
    """
    serializer = MappingTemplateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=http_status.HTTP_400_BAD_REQUEST)
    serializer.save(
        kurum_id=get_secili_kurum_id(request),
        created_by=request.user if request.user.is_authenticated else None,
    )
    return Response(serializer.data, status=http_status.HTTP_201_CREATED)


@api_view(['DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([OlcmeModulePermission])
def delete_mapping_template(request, template_pk):
    """
    DELETE /exams/mapping-templates/{template_pk}/
    """
    tpl = _visible_templates(request).filter(pk=template_pk).first()
    if tpl is None:
        return Response({'error': 'Şablon bulunamadı.'}, status=404)
    tpl.delete()
    return Response(status=204)
