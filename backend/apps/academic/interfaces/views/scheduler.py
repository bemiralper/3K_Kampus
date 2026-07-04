"""
Scheduler API Views

Ders Programı Otomatik Oluşturma API'leri:
- POST /run-preview/ - Önizleme çalıştırma
- POST /run-execute/ - Gerçek çalıştırma
- POST /reset-grid/ - Grid sıfırlama
- GET /runs/ - Çalıştırma logları
"""
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academic.services.scheduler_engine import SchedulerService
from apps.academic.domain import ScheduleRun
from apps.academic.interfaces.sube_context import (
    filter_by_sube_id,
    gate_schedule_template_drf,
    gate_sinif_drf,
    gate_weekly_cycle_drf,
    mandatory_academic_context_drf,
)


def _gate_scheduler_params(request, *, schedule_template_id, weekly_cycle_id, classroom_id=None):
    _, _, err = gate_schedule_template_drf(request, schedule_template_id)
    if err:
        return err
    _, _, err = gate_weekly_cycle_drf(request, weekly_cycle_id)
    if err:
        return err
    if classroom_id:
        _, _, err = gate_sinif_drf(request, classroom_id)
        if err:
            return err
    return None


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def run_preview(request):
    """
    Önizleme çalıştır
    
    Grid'e yazmaz, simülasyon sonucu döner.
    
    Body:
    {
        "term_id": 1,
        "schedule_template_id": 1,
        "weekly_cycle_id": 1,
        "classroom_id": null  // opsiyonel
    }
    """
    term_id = request.data.get('term_id')
    schedule_template_id = request.data.get('schedule_template_id')
    weekly_cycle_id = request.data.get('weekly_cycle_id')
    classroom_id = request.data.get('classroom_id')  # sinif_id olarak kullanılacak
    
    # Validasyon
    if not term_id:
        return Response({"error": "term_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not schedule_template_id:
        return Response({"error": "schedule_template_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not weekly_cycle_id:
        return Response({"error": "weekly_cycle_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

    gate_err = _gate_scheduler_params(
        request,
        schedule_template_id=schedule_template_id,
        weekly_cycle_id=weekly_cycle_id,
        classroom_id=classroom_id,
    )
    if gate_err:
        return gate_err
    
    # Aktif eğitim yılı
    from apps.egitim_yili.domain.models import EgitimYili
    try:
        egitim_yili = EgitimYili.objects.get(aktif_mi=True)
    except EgitimYili.DoesNotExist:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        result = SchedulerService.preview(
            egitim_yili_id=egitim_yili.id,
            term_id=term_id,
            schedule_template_id=schedule_template_id,
            weekly_cycle_id=weekly_cycle_id,
            sinif_id=classroom_id
        )
        return Response(result)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def run_execute(request):
    """
    Gerçek çalıştırma
    
    Grid'e yazar, ScheduleRun log oluşturur.
    
    Body:
    {
        "term_id": 1,
        "schedule_template_id": 1,
        "weekly_cycle_id": 1,
        "classroom_id": null  // opsiyonel
    }
    """
    term_id = request.data.get('term_id')
    schedule_template_id = request.data.get('schedule_template_id')
    weekly_cycle_id = request.data.get('weekly_cycle_id')
    classroom_id = request.data.get('classroom_id')
    
    # Validasyon
    if not term_id:
        return Response({"error": "term_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not schedule_template_id:
        return Response({"error": "schedule_template_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not weekly_cycle_id:
        return Response({"error": "weekly_cycle_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

    gate_err = _gate_scheduler_params(
        request,
        schedule_template_id=schedule_template_id,
        weekly_cycle_id=weekly_cycle_id,
        classroom_id=classroom_id,
    )
    if gate_err:
        return gate_err
    
    # Aktif eğitim yılı
    from apps.egitim_yili.domain.models import EgitimYili
    try:
        egitim_yili = EgitimYili.objects.get(aktif_mi=True)
    except EgitimYili.DoesNotExist:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        result = SchedulerService.execute(
            egitim_yili_id=egitim_yili.id,
            term_id=term_id,
            schedule_template_id=schedule_template_id,
            weekly_cycle_id=weekly_cycle_id,
            sinif_id=classroom_id
        )
        return Response(result)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def reset_grid(request):
    """
    Grid sıfırla
    
    FILLED → EMPTY
    LOCKED dokunulmaz
    
    Body:
    {
        "schedule_template_id": 1,
        "weekly_cycle_id": 1,
        "classroom_id": null  // opsiyonel
    }
    """
    schedule_template_id = request.data.get('schedule_template_id')
    weekly_cycle_id = request.data.get('weekly_cycle_id')
    classroom_id = request.data.get('classroom_id')
    
    # Validasyon
    if not schedule_template_id:
        return Response({"error": "schedule_template_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not weekly_cycle_id:
        return Response({"error": "weekly_cycle_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

    gate_err = _gate_scheduler_params(
        request,
        schedule_template_id=schedule_template_id,
        weekly_cycle_id=weekly_cycle_id,
        classroom_id=classroom_id,
    )
    if gate_err:
        return gate_err
    
    try:
        result = SchedulerService.reset_grid(
            schedule_template_id=schedule_template_id,
            weekly_cycle_id=weekly_cycle_id,
            sinif_id=classroom_id
        )
        return Response(result)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def list_runs(request):
    """
    Çalıştırma loglarını listele
    
    Query params:
    - term_id
    - classroom_id
    - run_type (PREVIEW, EXECUTE, RESET)
    - limit (default: 20)
    """
    term_id = request.query_params.get('term_id')
    classroom_id = request.query_params.get('classroom_id')
    run_type = request.query_params.get('run_type')
    limit = int(request.query_params.get('limit', 20))

    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err
    
    # Aktif eğitim yılı
    from apps.egitim_yili.domain.models import EgitimYili
    try:
        egitim_yili = EgitimYili.objects.get(aktif_mi=True)
    except EgitimYili.DoesNotExist:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    runs = ScheduleRun.objects.filter(egitim_yili=egitim_yili)
    runs = filter_by_sube_id(runs, ctx['sube_id'], field_path='schedule_template__sube_id')
    
    if term_id:
        runs = runs.filter(term_id=term_id)
    if classroom_id:
        _, _, gate_err = gate_sinif_drf(request, classroom_id)
        if gate_err:
            return gate_err
        runs = runs.filter(sinif_id=classroom_id)
    if run_type:
        runs = runs.filter(run_type=run_type)
    
    runs = runs.order_by('-created_at')[:limit]
    
    data = []
    for run in runs:
        data.append({
            "id": run.id,
            "term_id": run.term_id,
            "term_name": run.term.name if run.term else None,
            "sinif_id": run.sinif_id,
            "sinif_name": run.sinif.ad if run.sinif else "Tüm Sınıflar",
            "run_type": run.run_type,
            "run_type_display": run.get_run_type_display(),
            "status": run.status,
            "status_display": run.get_status_display(),
            "total_jobs": run.total_jobs,
            "placed_jobs": run.placed_jobs,
            "failed_jobs": run.failed_jobs,
            "success_rate": run.success_rate,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "duration_seconds": run.duration_seconds
        })
    
    return Response({"runs": data})


@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def get_run_detail(request, run_id):
    """
    Çalıştırma detayını getir
    """
    try:
        run = ScheduleRun.objects.select_related('term', 'sinif', 'schedule_template', 'weekly_cycle').get(id=run_id)
    except ScheduleRun.DoesNotExist:
        return Response({"error": "Çalıştırma bulunamadı"}, status=status.HTTP_404_NOT_FOUND)

    _, _, gate_err = gate_schedule_template_drf(request, run.schedule_template_id)
    if gate_err:
        return gate_err
    
    return Response({
        "id": run.id,
        "term_id": run.term_id,
        "term_name": run.term.name if run.term else None,
        "sinif_id": run.sinif_id,
        "sinif_name": run.sinif.ad if run.sinif else "Tüm Sınıflar",
        "schedule_template_id": run.schedule_template_id,
        "schedule_template_name": run.schedule_template.name if run.schedule_template else None,
        "weekly_cycle_id": run.weekly_cycle_id,
        "weekly_cycle_name": run.weekly_cycle.name if run.weekly_cycle else None,
        "run_type": run.run_type,
        "run_type_display": run.get_run_type_display(),
        "status": run.status,
        "status_display": run.get_status_display(),
        "total_jobs": run.total_jobs,
        "placed_jobs": run.placed_jobs,
        "failed_jobs": run.failed_jobs,
        "success_rate": run.success_rate,
        "log_json": run.log_json,
        "error_message": run.error_message,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "duration_seconds": run.duration_seconds,
        "created_at": run.created_at.isoformat() if run.created_at else None
    })
