"""
Schedule View API'leri

Program görüntüleme endpointleri:
- /api/schedule/class/ - Sınıf programı
- /api/schedule/teacher/ - Öğretmen programı
- /api/schedule/student/ - Öğrenci programı
- /api/schedule/room/ - Oda programı
- /api/schedule/daily-flow/ - Günlük akış

Tüm endpointler:
- Aktif eğitim yılını otomatik kullanır
- schedule_version zorunlu (verilmezse aktif versiyon fallback)
- Ortak grid serializer formatı döner
"""

from datetime import date
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.academic.domain import (
    ProgramGridCell, ScheduleVersion, WeeklyDay, TimeSlot, 
    StudentClassPlacement, CellStatus
)
from apps.academic.interfaces.sube_context import (
    gate_schedule_template_drf,
    gate_sinif_drf,
    mandatory_academic_context_drf,
)
from apps.egitim_yili.domain.models import EgitimYili


def get_active_egitim_yili():
    """Aktif eğitim yılını getir"""
    try:
        return EgitimYili.objects.get(aktif_mi=True)
    except EgitimYili.DoesNotExist:
        return None


def get_schedule_version(version_id, term_id, schedule_template_id=None, weekly_cycle_id=None):
    """
    Schedule version'ı getir.
    version_id verilmezse aktif versiyona fallback.
    """
    if version_id:
        try:
            return ScheduleVersion.objects.get(id=version_id)
        except ScheduleVersion.DoesNotExist:
            return None
    
    # Aktif versiyona fallback
    return ScheduleVersion.get_active_for_term(
        term_id=term_id,
        schedule_template_id=schedule_template_id,
        weekly_cycle_id=weekly_cycle_id
    )


def _gate_loaded_version(request, version):
    if not version:
        return None
    _, _, err = gate_schedule_template_drf(request, version.schedule_template_id)
    return err


def serialize_grid_response(cells, days, slots):
    """
    Ortak grid response formatı.
    
    Returns:
    {
        days: [...],
        slots: [...],
        cells: [...]
    }
    """
    # Günleri serialize et
    days_data = [
        {
            "id": d.id,
            "name": d.name,
            "short_name": d.day_name_short,
            "order": d.order
        }
        for d in days
    ]
    
    # Slotları serialize et
    slots_data = [
        {
            "id": s.id,
            "name": s.name,
            "start": s.start_time.strftime("%H:%M") if s.start_time else None,
            "end": s.end_time.strftime("%H:%M") if s.end_time else None,
            "order": s.order
        }
        for s in slots
    ]
    
    # Hücreleri serialize et
    cells_data = []
    for c in cells:
        cell_data = {
            "id": c.id,
            "day_id": c.weekly_day_id,
            "timeslot_id": c.timeslot_id,
            "status": c.status,
            "status_display": c.get_status_display(),
            "lesson": None,
            "teacher": None,
            "classroom": None,
            "room": None,
            "is_double_block_start": c.is_double_block_start,
            "notes": c.notes
        }
        
        # Ders bilgisi
        if c.ders:
            cell_data["lesson"] = {
                "id": c.ders.id,
                "name": c.ders.ad,
                "code": getattr(c.ders, 'kod', None)
            }
        
        # Öğretmen bilgisi
        if c.ogretmen:
            cell_data["teacher"] = {
                "id": c.ogretmen.id,
                "name": f"{c.ogretmen.ad} {c.ogretmen.soyad}",
                "short_name": f"{c.ogretmen.ad[0]}. {c.ogretmen.soyad}" if c.ogretmen.ad else c.ogretmen.soyad
            }
        
        # Sınıf bilgisi
        if c.sinif:
            cell_data["classroom"] = {
                "id": c.sinif.id,
                "name": c.sinif.ad,
                "code": getattr(c.sinif, 'kod', None)
            }
        
        # Oda bilgisi (varsa)
        # TODO: Oda modeli entegrasyonu
        # if c.room:
        #     cell_data["room"] = {"id": c.room.id, "name": c.room.name}
        
        cells_data.append(cell_data)
    
    return {
        "days": days_data,
        "slots": slots_data,
        "cells": cells_data
    }


# ==================== SINIF PROGRAMI ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def class_schedule_api(request):
    """
    Sınıf programı (Haftalık Grid)
    
    GET /api/schedule/class/?classroom_id=&term_id=&version_id=
    
    Query params:
    - classroom_id (required): Sınıf ID
    - term_id (required): Dönem ID  
    - version_id (optional): Versiyon ID (default: aktif versiyon)
    """
    classroom_id = request.query_params.get('classroom_id')
    term_id = request.query_params.get('term_id')
    version_id = request.query_params.get('version_id')
    
    if not classroom_id:
        return Response({"error": "classroom_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not term_id:
        return Response({"error": "term_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

    _, err = mandatory_academic_context_drf(request)
    if err:
        return err

    _, _, gate_err = gate_sinif_drf(request, classroom_id)
    if gate_err:
        return gate_err
    
    # Aktif eğitim yılı
    egitim_yili = get_active_egitim_yili()
    if not egitim_yili:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    # Versiyon
    version = get_schedule_version(version_id, term_id)
    if not version:
        return Response({
            "error": "Program versiyonu bulunamadı",
            "days": [],
            "slots": [],
            "cells": []
        })

    gate_err = _gate_loaded_version(request, version)
    if gate_err:
        return gate_err
    
    # Günler ve slotlar
    days = WeeklyDay.objects.filter(
        weekly_cycle=version.weekly_cycle,
        is_active=True
    ).order_by('order')
    
    slots = TimeSlot.objects.filter(
        schedule_template=version.schedule_template,
        slot_type='LESSON',
        is_active=True
    ).order_by('order')
    
    # Grid hücreleri
    cells = ProgramGridCell.objects.filter(
        schedule_version=version,
        sinif_id=classroom_id,
        is_active=True
    ).select_related('ders', 'ogretmen', 'sinif', 'weekly_day', 'timeslot')
    
    # Response
    data = serialize_grid_response(cells, days, slots)
    data["version"] = {
        "id": version.id,
        "name": version.name,
        "is_active": version.is_active,
        "is_locked": version.is_locked
    }
    data["egitim_yili"] = {
        "id": egitim_yili.id,
        "display": f"{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}"
    }
    
    return Response(data)


# ==================== ÖĞRETMEN PROGRAMI ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def teacher_schedule_api(request):
    """
    Öğretmen programı (Haftalık Grid)
    
    GET /api/schedule/teacher/?teacher_id=&term_id=&version_id=
    
    Query params:
    - teacher_id (required): Öğretmen ID
    - term_id (required): Dönem ID
    - version_id (optional): Versiyon ID
    """
    teacher_id = request.query_params.get('teacher_id')
    term_id = request.query_params.get('term_id')
    version_id = request.query_params.get('version_id')
    
    if not teacher_id:
        return Response({"error": "teacher_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not term_id:
        return Response({"error": "term_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

    _, err = mandatory_academic_context_drf(request)
    if err:
        return err
    
    egitim_yili = get_active_egitim_yili()
    if not egitim_yili:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    version = get_schedule_version(version_id, term_id)
    if not version:
        return Response({
            "error": "Program versiyonu bulunamadı",
            "days": [],
            "slots": [],
            "cells": []
        })

    gate_err = _gate_loaded_version(request, version)
    if gate_err:
        return gate_err
    
    days = WeeklyDay.objects.filter(
        weekly_cycle=version.weekly_cycle,
        is_active=True
    ).order_by('order')
    
    slots = TimeSlot.objects.filter(
        schedule_template=version.schedule_template,
        slot_type='LESSON',
        is_active=True
    ).order_by('order')
    
    # Öğretmenin derslerini getir
    cells = ProgramGridCell.objects.filter(
        schedule_version=version,
        ogretmen_id=teacher_id,
        is_active=True
    ).select_related('ders', 'ogretmen', 'sinif', 'weekly_day', 'timeslot')
    
    data = serialize_grid_response(cells, days, slots)
    data["version"] = {
        "id": version.id,
        "name": version.name,
        "is_active": version.is_active,
        "is_locked": version.is_locked
    }
    data["egitim_yili"] = {
        "id": egitim_yili.id,
        "display": f"{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}"
    }
    
    return Response(data)


# ==================== ÖĞRENCİ PROGRAMI ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def student_schedule_api(request):
    """
    Öğrenci programı (Haftalık Grid)
    
    GET /api/schedule/student/?student_id=&term_id=&version_id=
    
    Öğrencinin aktif sınıf yerleşimini bulur ve o sınıfın programını döner.
    
    Query params:
    - student_id (required): Öğrenci ID
    - term_id (required): Dönem ID
    - version_id (optional): Versiyon ID
    """
    student_id = request.query_params.get('student_id')
    term_id = request.query_params.get('term_id')
    version_id = request.query_params.get('version_id')
    
    if not student_id:
        return Response({"error": "student_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not term_id:
        return Response({"error": "term_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

    _, err = mandatory_academic_context_drf(request)
    if err:
        return err
    
    egitim_yili = get_active_egitim_yili()
    if not egitim_yili:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    # Öğrencinin aktif sınıf yerleşimini bul
    placement = StudentClassPlacement.objects.filter(
        ogrenci_id=student_id,
        term_id=term_id,
        is_active=True
    ).select_related('sinif').first()
    
    if not placement:
        return Response({
            "error": "Öğrenci için aktif sınıf yerleşimi bulunamadı",
            "days": [],
            "slots": [],
            "cells": []
        })

    _, _, gate_err = gate_sinif_drf(request, placement.classroom_id)
    if gate_err:
        return gate_err
    
    version = get_schedule_version(version_id, term_id)
    if not version:
        return Response({
            "error": "Program versiyonu bulunamadı",
            "days": [],
            "slots": [],
            "cells": []
        })

    gate_err = _gate_loaded_version(request, version)
    if gate_err:
        return gate_err
    
    days = WeeklyDay.objects.filter(
        weekly_cycle=version.weekly_cycle,
        is_active=True
    ).order_by('order')
    
    slots = TimeSlot.objects.filter(
        schedule_template=version.schedule_template,
        slot_type='LESSON',
        is_active=True
    ).order_by('order')
    
    # Sınıfın programını getir
    cells = ProgramGridCell.objects.filter(
        schedule_version=version,
        sinif_id=placement.sinif_id,
        is_active=True
    ).select_related('ders', 'ogretmen', 'sinif', 'weekly_day', 'timeslot')
    
    data = serialize_grid_response(cells, days, slots)
    data["version"] = {
        "id": version.id,
        "name": version.name,
        "is_active": version.is_active,
        "is_locked": version.is_locked
    }
    data["egitim_yili"] = {
        "id": egitim_yili.id,
        "display": f"{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}"
    }
    data["student_placement"] = {
        "classroom_id": placement.sinif_id,
        "classroom_name": placement.sinif.ad if placement.sinif else None,
        "placement_type": placement.placement_type
    }
    
    return Response(data)


# ==================== ODA PROGRAMI ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def room_schedule_api(request):
    """
    Oda programı (Haftalık Grid)
    
    GET /api/schedule/room/?room_id=&term_id=&version_id=
    
    TODO: Oda modeli entegrasyonu gerekli.
    Şimdilik placeholder olarak bırakıldı.
    
    Query params:
    - room_id (required): Oda ID
    - term_id (required): Dönem ID
    - version_id (optional): Versiyon ID
    """
    room_id = request.query_params.get('room_id')
    term_id = request.query_params.get('term_id')
    version_id = request.query_params.get('version_id')
    
    if not room_id:
        return Response({"error": "room_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not term_id:
        return Response({"error": "term_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

    _, err = mandatory_academic_context_drf(request)
    if err:
        return err
    
    egitim_yili = get_active_egitim_yili()
    if not egitim_yili:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    version = get_schedule_version(version_id, term_id)
    if not version:
        return Response({
            "error": "Program versiyonu bulunamadı",
            "days": [],
            "slots": [],
            "cells": []
        })

    gate_err = _gate_loaded_version(request, version)
    if gate_err:
        return gate_err
    
    days = WeeklyDay.objects.filter(
        weekly_cycle=version.weekly_cycle,
        is_active=True
    ).order_by('order')
    
    slots = TimeSlot.objects.filter(
        schedule_template=version.schedule_template,
        slot_type='LESSON',
        is_active=True
    ).order_by('order')
    
    # TODO: Oda bazlı filtreleme
    # cells = ProgramGridCell.objects.filter(
    #     schedule_version=version,
    #     room_id=room_id,
    #     is_active=True
    # ).select_related('ders', 'ogretmen', 'sinif', 'weekly_day', 'timeslot')
    
    cells = []  # Placeholder
    
    data = serialize_grid_response(cells, days, slots)
    data["version"] = {
        "id": version.id,
        "name": version.name,
        "is_active": version.is_active,
        "is_locked": version.is_locked
    }
    data["egitim_yili"] = {
        "id": egitim_yili.id,
        "display": f"{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}"
    }
    data["info"] = "Oda programı henüz aktif değil. Oda modeli entegrasyonu gerekli."
    
    return Response(data)


# ==================== GÜNLÜK AKIŞ ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def daily_flow_api(request):
    """
    Günlük akış (kronolojik liste)
    
    GET /api/schedule/daily-flow/?date=&teacher_id=&classroom_id=&room_id=
    
    Belirli bir gün için dersleri kronolojik sırada listeler.
    
    Query params:
    - date (optional): Tarih (YYYY-MM-DD, default: bugün)
    - teacher_id (optional): Öğretmen filtresi
    - classroom_id (optional): Sınıf filtresi
    - room_id (optional): Oda filtresi
    - term_id (required): Dönem ID
    - version_id (optional): Versiyon ID
    """
    date_str = request.query_params.get('date')
    teacher_id = request.query_params.get('teacher_id')
    classroom_id = request.query_params.get('classroom_id')
    room_id = request.query_params.get('room_id')
    term_id = request.query_params.get('term_id')
    version_id = request.query_params.get('version_id')
    
    if not term_id:
        return Response({"error": "term_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

    _, err = mandatory_academic_context_drf(request)
    if err:
        return err

    if classroom_id:
        _, _, gate_err = gate_sinif_drf(request, classroom_id)
        if gate_err:
            return gate_err
    
    # Tarih parse
    if date_str:
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            return Response({"error": "Geçersiz tarih formatı. YYYY-MM-DD kullanın."}, status=status.HTTP_400_BAD_REQUEST)
    else:
        target_date = date.today()
    
    egitim_yili = get_active_egitim_yili()
    if not egitim_yili:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)
    
    version = get_schedule_version(version_id, term_id)
    if not version:
        return Response({
            "error": "Program versiyonu bulunamadı",
            "date": str(target_date),
            "day_name": None,
            "items": []
        })

    gate_err = _gate_loaded_version(request, version)
    if gate_err:
        return gate_err
    
    # Haftanın günü (0=Pazartesi, 6=Pazar)
    weekday = target_date.weekday()
    
    # WeeklyDay'i bul (day_of_week enum ile)
    # day_of_week: MONDAY=0, TUESDAY=1, ...
    day = WeeklyDay.objects.filter(
        weekly_cycle=version.weekly_cycle,
        day_of_week=weekday,
        is_active=True
    ).first()
    
    if not day:
        return Response({
            "date": str(target_date),
            "day_name": None,
            "info": "Bu gün için program bulunamadı (tatil veya hafta sonu)",
            "items": []
        })
    
    # Filtreleme
    cells_qs = ProgramGridCell.objects.filter(
        schedule_version=version,
        weekly_day=day,
        is_active=True,
        status__in=[CellStatus.FILLED, CellStatus.EXAM, CellStatus.HOLIDAY]
    ).select_related('ders', 'ogretmen', 'sinif', 'timeslot').order_by('timeslot__order')
    
    if teacher_id:
        cells_qs = cells_qs.filter(ogretmen_id=teacher_id)
    if classroom_id:
        cells_qs = cells_qs.filter(sinif_id=classroom_id)
    # TODO: room_id filtresi
    
    # Kronolojik liste
    items = []
    for c in cells_qs:
        item = {
            "timeslot_id": c.timeslot_id,
            "start": c.timeslot.start_time.strftime("%H:%M") if c.timeslot.start_time else None,
            "end": c.timeslot.end_time.strftime("%H:%M") if c.timeslot.end_time else None,
            "status": c.status,
            "status_display": c.get_status_display(),
            "lesson": None,
            "teacher": None,
            "classroom": None,
            "room": None
        }
        
        if c.ders:
            item["lesson"] = {"id": c.ders.id, "name": c.ders.ad}
        if c.ogretmen:
            item["teacher"] = {
                "id": c.ogretmen.id,
                "name": f"{c.ogretmen.ad} {c.ogretmen.soyad}"
            }
        if c.sinif:
            item["classroom"] = {"id": c.sinif.id, "name": c.sinif.ad}
        
        items.append(item)
    
    return Response({
        "date": str(target_date),
        "day_name": day.name,
        "day_id": day.id,
        "version": {
            "id": version.id,
            "name": version.name
        },
        "egitim_yili": {
            "id": egitim_yili.id,
            "display": f"{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}"
        },
        "items": items
    })
