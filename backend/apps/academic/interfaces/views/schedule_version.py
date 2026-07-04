"""
Schedule Version API'leri

Versiyon yönetimi endpointleri:
- GET /api/schedule/versions/ - Liste
- POST /api/schedule/versions/ - Oluştur
- PUT /api/schedule/versions/{id}/ - Güncelle
- POST /api/schedule/versions/{id}/activate/ - Aktif yap
- POST /api/schedule/versions/{id}/duplicate/ - Kopyala
- POST /api/schedule/versions/{id}/lock/ - Kilitle
- POST /api/schedule/versions/{id}/unlock/ - Kilidi aç
"""

from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academic.domain import ScheduleVersion, ScheduleTemplate, WeeklyCycle
from apps.academic.interfaces.sube_context import (
    filter_by_sube_id,
    gate_schedule_template_drf,
    gate_weekly_cycle_drf,
    mandatory_academic_context_drf,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.term.domain.models import Term


def get_active_egitim_yili():
    """Aktif eğitim yılını getir"""
    try:
        return EgitimYili.objects.get(aktif_mi=True)
    except EgitimYili.DoesNotExist:
        return None


def _gate_version_drf(request, version):
    _, _, err = gate_schedule_template_drf(request, version.schedule_template_id)
    return err


def serialize_version(version):
    """ScheduleVersion serialize"""
    return {
        "id": version.id,
        "name": version.name,
        "description": version.description,
        "is_active": version.is_active,
        "is_locked": version.is_locked,
        "term": {
            "id": version.term.id,
            "name": version.term.name
        } if version.term else None,
        "schedule_template": {
            "id": version.schedule_template.id,
            "name": version.schedule_template.name
        } if version.schedule_template else None,
        "weekly_cycle": {
            "id": version.weekly_cycle.id,
            "name": version.weekly_cycle.name
        } if version.weekly_cycle else None,
        "egitim_yili": {
            "id": version.egitim_yili.id,
            "display": f"{version.egitim_yili.baslangic_yil}-{version.egitim_yili.bitis_yil}"
        } if version.egitim_yili else None,
        "created_by": {
            "id": version.created_by.id,
            "username": version.created_by.username
        } if version.created_by else None,
        "cell_count": version.cell_count,
        "filled_cell_count": version.filled_cell_count,
        "completion_rate": version.completion_rate,
        "created_at": version.created_at.isoformat() if version.created_at else None,
        "updated_at": version.updated_at.isoformat() if version.updated_at else None
    }


# ==================== LİSTE ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def version_list_api(request):
    """
    Versiyonları listele
    
    GET /api/schedule/versions/?term_id=&schedule_template_id=&weekly_cycle_id=
    
    Query params:
    - term_id (optional): Dönem filtresi
    - schedule_template_id (optional): Şablon filtresi
    - weekly_cycle_id (optional): Döngü filtresi
    """
    term_id = request.query_params.get('term_id')
    schedule_template_id = request.query_params.get('schedule_template_id')
    weekly_cycle_id = request.query_params.get('weekly_cycle_id')

    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    
    egitim_yili = get_active_egitim_yili()
    if not egitim_yili:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    versions = ScheduleVersion.objects.filter(
        egitim_yili=egitim_yili
    ).select_related('term', 'schedule_template', 'weekly_cycle', 'created_by')
    versions = filter_by_sube_id(versions, ctx['sube_id'], field_path='schedule_template__sube_id')
    
    if term_id:
        versions = versions.filter(term_id=term_id)
    if schedule_template_id:
        _, _, gate_err = gate_schedule_template_drf(request, schedule_template_id)
        if gate_err:
            return gate_err
        versions = versions.filter(schedule_template_id=schedule_template_id)
    if weekly_cycle_id:
        _, _, gate_err = gate_weekly_cycle_drf(request, weekly_cycle_id)
        if gate_err:
            return gate_err
        versions = versions.filter(weekly_cycle_id=weekly_cycle_id)
    
    versions = versions.order_by('-created_at')
    
    data = [serialize_version(v) for v in versions]
    
    return Response({
        "versions": data,
        "egitim_yili": {
            "id": egitim_yili.id,
            "display": f"{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}"
        }
    })


# ==================== OLUŞTUR ====================

@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def version_create_api(request):
    """
    Yeni versiyon oluştur
    
    POST /api/schedule/versions/
    
    Body:
    {
        "name": "Taslak v1",
        "description": "...",
        "term_id": 1,
        "schedule_template_id": 1,
        "weekly_cycle_id": 1
    }
    """
    name = request.data.get('name')
    description = request.data.get('description', '')
    term_id = request.data.get('term_id')
    schedule_template_id = request.data.get('schedule_template_id')
    weekly_cycle_id = request.data.get('weekly_cycle_id')
    
    if not name:
        return Response({"error": "name zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not term_id:
        return Response({"error": "term_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not schedule_template_id:
        return Response({"error": "schedule_template_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not weekly_cycle_id:
        return Response({"error": "weekly_cycle_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

    _, _, gate_err = gate_schedule_template_drf(request, schedule_template_id)
    if gate_err:
        return gate_err
    _, _, gate_err = gate_weekly_cycle_drf(request, weekly_cycle_id)
    if gate_err:
        return gate_err
    
    egitim_yili = get_active_egitim_yili()
    if not egitim_yili:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    # Validasyon
    try:
        term = Term.objects.get(id=term_id)
    except Term.DoesNotExist:
        return Response({"error": "Dönem bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        template = ScheduleTemplate.objects.get(id=schedule_template_id)
    except ScheduleTemplate.DoesNotExist:
        return Response({"error": "Zaman şablonu bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        cycle = WeeklyCycle.objects.get(id=weekly_cycle_id)
    except WeeklyCycle.DoesNotExist:
        return Response({"error": "Haftalık döngü bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    # Oluştur
    version = ScheduleVersion.objects.create(
        egitim_yili=egitim_yili,
        term=term,
        schedule_template=template,
        weekly_cycle=cycle,
        name=name,
        description=description,
        is_active=False,
        is_locked=False,
        created_by=request.user if request.user.is_authenticated else None
    )
    
    return Response(serialize_version(version), status=status.HTTP_201_CREATED)


# ==================== GÜNCELLE ====================

@csrf_exempt
@api_view(['PUT', 'PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def version_update_api(request, pk):
    """
    Versiyonu güncelle
    
    PUT /api/schedule/versions/{id}/
    
    Body:
    {
        "name": "Yeni ad",
        "description": "..."
    }
    
    NOT: Kilitli versiyon güncellenemez.
    """
    try:
        version = ScheduleVersion.objects.get(id=pk)
    except ScheduleVersion.DoesNotExist:
        return Response({"error": "Versiyon bulunamadı"}, status=status.HTTP_404_NOT_FOUND)

    gate_err = _gate_version_drf(request, version)
    if gate_err:
        return gate_err
    
    if version.is_locked:
        return Response({"error": "Kilitli versiyon güncellenemez"}, status=status.HTTP_403_FORBIDDEN)
    
    name = request.data.get('name')
    description = request.data.get('description')
    
    if name:
        version.name = name
    if description is not None:
        version.description = description
    
    version.save()
    
    return Response(serialize_version(version))


# ==================== AKTİF YAP ====================

@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def version_activate_api(request, pk):
    """
    Versiyonu aktif yap
    
    POST /api/schedule/versions/{id}/activate/
    
    Aynı term+template+cycle için diğer versiyonları pasif yapar.
    """
    try:
        version = ScheduleVersion.objects.get(id=pk)
    except ScheduleVersion.DoesNotExist:
        return Response({"error": "Versiyon bulunamadı"}, status=status.HTTP_404_NOT_FOUND)

    gate_err = _gate_version_drf(request, version)
    if gate_err:
        return gate_err
    
    version.activate()
    
    return Response({
        "success": True,
        "message": f"'{version.name}' versiyonu aktif yapıldı",
        "version": serialize_version(version)
    })


# ==================== KOPYALA ====================

@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def version_duplicate_api(request, pk):
    """
    Versiyonu kopyala
    
    POST /api/schedule/versions/{id}/duplicate/
    
    Body:
    {
        "name": "Kopya adı"  // opsiyonel
    }
    
    Kilitli versiyonlar da kopyalanabilir.
    Grid hücreleri de kopyalanır.
    """
    try:
        version = ScheduleVersion.objects.get(id=pk)
    except ScheduleVersion.DoesNotExist:
        return Response({"error": "Versiyon bulunamadı"}, status=status.HTTP_404_NOT_FOUND)

    gate_err = _gate_version_drf(request, version)
    if gate_err:
        return gate_err
    
    new_name = request.data.get('name')
    created_by = request.user if request.user.is_authenticated else None
    
    new_version = version.duplicate(new_name=new_name, created_by=created_by)
    
    return Response({
        "success": True,
        "message": f"'{version.name}' versiyonu kopyalandı",
        "version": serialize_version(new_version)
    }, status=status.HTTP_201_CREATED)


# ==================== KİLİTLE ====================

@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def version_lock_api(request, pk):
    """
    Versiyonu kilitle
    
    POST /api/schedule/versions/{id}/lock/
    """
    try:
        version = ScheduleVersion.objects.get(id=pk)
    except ScheduleVersion.DoesNotExist:
        return Response({"error": "Versiyon bulunamadı"}, status=status.HTTP_404_NOT_FOUND)

    gate_err = _gate_version_drf(request, version)
    if gate_err:
        return gate_err
    
    version.lock()
    
    return Response({
        "success": True,
        "message": f"'{version.name}' versiyonu kilitlendi",
        "version": serialize_version(version)
    })


# ==================== KİLİDİ AÇ ====================

@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def version_unlock_api(request, pk):
    """
    Versiyonun kilidini aç
    
    POST /api/schedule/versions/{id}/unlock/
    """
    try:
        version = ScheduleVersion.objects.get(id=pk)
    except ScheduleVersion.DoesNotExist:
        return Response({"error": "Versiyon bulunamadı"}, status=status.HTTP_404_NOT_FOUND)

    gate_err = _gate_version_drf(request, version)
    if gate_err:
        return gate_err
    
    version.unlock()
    
    return Response({
        "success": True,
        "message": f"'{version.name}' versiyonunun kilidi açıldı",
        "version": serialize_version(version)
    })


# ==================== DETAY ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def version_detail_api(request, pk):
    """
    Versiyon detayı
    
    GET /api/schedule/versions/{id}/
    """
    try:
        version = ScheduleVersion.objects.select_related(
            'term', 'schedule_template', 'weekly_cycle', 'egitim_yili', 'created_by'
        ).get(id=pk)
    except ScheduleVersion.DoesNotExist:
        return Response({"error": "Versiyon bulunamadı"}, status=status.HTTP_404_NOT_FOUND)

    gate_err = _gate_version_drf(request, version)
    if gate_err:
        return gate_err
    
    return Response(serialize_version(version))


# ==================== SİL ====================

@csrf_exempt
@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def version_delete_api(request, pk):
    """
    Versiyonu sil
    
    DELETE /api/schedule/versions/{id}/
    
    NOT: Kilitli veya aktif versiyon silinemez.
    """
    try:
        version = ScheduleVersion.objects.get(id=pk)
    except ScheduleVersion.DoesNotExist:
        return Response({"error": "Versiyon bulunamadı"}, status=status.HTTP_404_NOT_FOUND)

    gate_err = _gate_version_drf(request, version)
    if gate_err:
        return gate_err
    
    if version.is_locked:
        return Response({"error": "Kilitli versiyon silinemez"}, status=status.HTTP_403_FORBIDDEN)
    
    if version.is_active:
        return Response({"error": "Aktif versiyon silinemez. Önce başka bir versiyonu aktif yapın."}, status=status.HTTP_403_FORBIDDEN)
    
    name = version.name
    version.delete()
    
    return Response({
        "success": True,
        "message": f"'{name}' versiyonu silindi"
    })
