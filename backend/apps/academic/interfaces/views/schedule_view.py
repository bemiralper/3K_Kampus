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
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.authentication import SessionAuthentication
from apps.academic.interfaces.permissions import AcademicModulePermission
from rest_framework.response import Response

from apps.academic.domain import (
    ProgramGridCell, ScheduleVersion, WeeklyDay, TimeSlot,
    StudentClassPlacement, CellStatus
)
from apps.oda.domain.models import Oda
from apps.sinif.domain.models import Sinif
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


def resolve_view_version(request, term_id):
    """
    Görüntüleme endpoint'leri için program çözümü.

    Arayüzde versiyon seçimi yok; kullanıcı dönem + çalışma takvimi seçer.
    Öncelik: açık version_id → (dönem, takvim) programı → dönemin aktif programı.
    """
    version_id = request.query_params.get('version_id')
    if version_id:
        return get_schedule_version(version_id, term_id)

    weekly_cycle_id = request.query_params.get('weekly_cycle_id')
    if weekly_cycle_id:
        return ScheduleVersion.objects.filter(
            term_id=term_id,
            weekly_cycle_id=weekly_cycle_id,
        ).order_by('-is_active', '-id').first()

    return get_schedule_version(None, term_id)


def _gate_loaded_version(request, version):
    if not version:
        return None
    _, _, err = gate_schedule_template_drf(request, version.schedule_template_id)
    return err


def get_version_lesson_slots(version, days):
    """
    Program görünümü için LESSON slotları.
    Versiyon şablonu + aktif günlerin gün bazlı şablonları (birleşik).
    """
    template_ids = set(
        days.filter(schedule_template_id__isnull=False)
        .values_list('schedule_template_id', flat=True)
    )
    if version.schedule_template_id:
        template_ids.add(version.schedule_template_id)
    if not template_ids:
        return TimeSlot.objects.none()
    return TimeSlot.objects.filter(
        schedule_template_id__in=template_ids,
        slot_type='LESSON',
        is_active=True,
    ).order_by('order', 'id')


_CELL_RELATED = (
    'ders', 'ogretmen', 'sinif', 'sinif__oda', 'weekly_day', 'timeslot',
    'schedule_version', 'schedule_version__weekly_cycle',
    'class_lesson_plan', 'class_lesson_plan__ders', 'class_lesson_plan__ogretmen',
)


def _room_from_sinif(sinif):
    oda = getattr(sinif, 'oda', None) if sinif else None
    if not oda:
        return None
    return {'id': oda.id, 'name': oda.ad}


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
            "class_lesson_plan_id": c.class_lesson_plan_id,
            "lesson": None,
            "teacher": None,
            "classroom": None,
            "room": None,
            "is_double_block_start": c.is_double_block_start,
            "notes": c.notes
        }
        
        # Ders bilgisi — görünen ad: plan.gorunen_ad → ders.kisa_ad → ders.ad
        plan = getattr(c, 'class_lesson_plan', None)
        if c.ders:
            from apps.egitim_tanimlari.display import serialize_lesson_label
            cell_data["lesson"] = serialize_lesson_label(
                ders=c.ders,
                plan=plan,
            )

        # Öğretmen: plandaki güncel öğretmen öncelikli (SDP değişince grid anında doğru)
        teacher = None
        if plan is not None and getattr(plan, 'ogretmen_id', None):
            teacher = plan.ogretmen
        elif c.ogretmen_id:
            teacher = c.ogretmen
        if teacher:
            cell_data["teacher"] = {
                "id": teacher.id,
                "name": f"{teacher.ad} {teacher.soyad}",
                "short_name": (
                    f"{teacher.ad[0]}. {teacher.soyad}" if teacher.ad else teacher.soyad
                ),
            }
        
        # Sınıf bilgisi
        if c.sinif:
            cell_data["classroom"] = {
                "id": c.sinif.id,
                "name": c.sinif.ad,
                "code": getattr(c.sinif, 'kod', None)
            }

        cell_data["room"] = _room_from_sinif(c.sinif)

        cell_data["kind"] = "class"
        cell_data["student"] = None
        cells_data.append(cell_data)
    
    return {
        "days": days_data,
        "slots": slots_data,
        "cells": cells_data
    }


def _times_overlap(a_start, a_end, b_start, b_end):
    if not all([a_start, a_end, b_start, b_end]):
        return False
    return a_start < b_end and b_start < a_end


def _overlap_seconds(a_start, a_end, b_start, b_end):
    latest_start = max(a_start, b_start)
    earliest_end = min(a_end, b_end)
    if latest_start >= earliest_end:
        return 0
    from datetime import datetime, date
    start = datetime.combine(date.today(), latest_start)
    end = datetime.combine(date.today(), earliest_end)
    return int((end - start).total_seconds())


def _teacher_name_payload(teacher):
    if not teacher:
        return None
    return {
        "id": teacher.id,
        "name": f"{teacher.ad} {teacher.soyad}",
        "short_name": f"{teacher.ad[0]}. {teacher.soyad}" if teacher.ad else teacher.soyad,
    }


def _private_lesson_overlay(teacher_id, ctx, egitim_yili, day_objs, slot_objs):
    """
    Öğretmenin aktif birebir haftalık slotlarını görüntüleme grid'ine bindirir.
    Sınıf saatiyle çakışanlar o satıra yazılır; çakışmayanlar ekstra satır olur.
    """
    from apps.egitim_tanimlari.display import serialize_lesson_label
    from apps.ozel_ders.domain.models import BirebirHaftalikSlot, ProgramDurumu

    day_list = list(day_objs)
    slot_list = list(slot_objs)
    days_by_dow = {d.day_of_week: d for d in day_list}

    bb_slots = (
        BirebirHaftalikSlot.objects.filter(
            ogretmen_id=teacher_id,
            aktif=True,
            program__durum=ProgramDurumu.AKTIF,
            program__kurum_id=ctx['kurum_id'],
            program__sube_id=ctx['sube_id'],
            program__egitim_yili=egitim_yili,
        )
        .select_related('ders', 'ogretmen', 'oda', 'program', 'program__ogrenci')
        .order_by('gun', 'baslangic', 'id')
    )

    extra_slots = []
    extra_cells = []
    for bb in bb_slots:
        day = days_by_dow.get(bb.gun - 1)
        if not day:
            continue
        ogrenci = getattr(bb.program, 'ogrenci', None)
        ogrenci_ad = ''
        if ogrenci:
            ogrenci_ad = f"{ogrenci.ad} {ogrenci.soyad}".strip()
        student = {'id': ogrenci.id, 'name': ogrenci_ad} if ogrenci else None
        lesson = serialize_lesson_label(ders=bb.ders) if bb.ders else None
        room = {'id': bb.oda.id, 'name': bb.oda.ad} if bb.oda else None
        overlapping = [
            ts for ts in slot_list
            if _times_overlap(bb.baslangic, bb.bitis, ts.start_time, ts.end_time)
        ]
        if overlapping:
            target = max(
                overlapping,
                key=lambda ts: _overlap_seconds(
                    bb.baslangic, bb.bitis, ts.start_time, ts.end_time,
                ),
            )
            timeslot_id = target.id
        else:
            timeslot_id = -bb.id
            extra_slots.append({
                "id": timeslot_id,
                "name": "Özel Ders",
                "start": bb.baslangic.strftime("%H:%M"),
                "end": bb.bitis.strftime("%H:%M"),
                "order": 10_000 + bb.baslangic.hour * 60 + bb.baslangic.minute,
                "kind": "private",
            })
        extra_cells.append({
            "id": -bb.id,
            "day_id": day.id,
            "timeslot_id": timeslot_id,
            "status": "FILLED",
            "status_display": "Özel Ders",
            "kind": "private",
            "class_lesson_plan_id": None,
            "lesson": lesson,
            "teacher": _teacher_name_payload(bb.ogretmen),
            "classroom": student,
            "student": student,
            "room": room,
            "is_double_block_start": False,
            "notes": None,
        })
    return extra_slots, extra_cells


class _CanonDay:
    """Birleşik öğretmen grid'inde günler day_of_week ile hizalanır."""

    def __init__(self, day_of_week, name, short_name, order):
        self.id = day_of_week
        self.day_of_week = day_of_week
        self.name = name
        self.day_name_short = short_name
        self.order = order


def _term_versions_for_teacher(term_id, version_id=None):
    """
    version_id varsa tek versiyon.
    Yoksa dönemdeki her çalışma takvimi için aktif (yoksa en yeni) versiyon.
    """
    if version_id:
        version = get_schedule_version(version_id, term_id)
        return [version] if version else []

    rows = list(
        ScheduleVersion.objects.filter(term_id=term_id)
        .select_related('weekly_cycle', 'schedule_template')
        .order_by('weekly_cycle_id', '-is_active', '-id')
    )
    by_cycle = {}
    for version in rows:
        if version.weekly_cycle_id not in by_cycle:
            by_cycle[version.weekly_cycle_id] = version
    return list(by_cycle.values())


def _canonical_days(versions):
    cycle_ids = [v.weekly_cycle_id for v in versions if v.weekly_cycle_id]
    seen = {}
    for day in WeeklyDay.objects.filter(
        weekly_cycle_id__in=cycle_ids,
        is_active=True,
    ).order_by('order', 'day_of_week'):
        if day.day_of_week in seen:
            continue
        seen[day.day_of_week] = _CanonDay(
            day.day_of_week,
            day.name,
            day.day_name_short,
            day.order if day.order else day.day_of_week + 1,
        )
    return [seen[k] for k in sorted(seen)]


def _merged_lesson_slots(versions):
    template_ids = set()
    cycle_ids = []
    for version in versions:
        if version.schedule_template_id:
            template_ids.add(version.schedule_template_id)
        if version.weekly_cycle_id:
            cycle_ids.append(version.weekly_cycle_id)
    if cycle_ids:
        template_ids.update(
            WeeklyDay.objects.filter(
                weekly_cycle_id__in=cycle_ids,
                is_active=True,
                schedule_template_id__isnull=False,
            ).values_list('schedule_template_id', flat=True)
        )
    if not template_ids:
        return TimeSlot.objects.none()
    return TimeSlot.objects.filter(
        schedule_template_id__in=template_ids,
        slot_type='LESSON',
        is_active=True,
    ).order_by('start_time', 'order', 'id')


def _annotate_teacher_cells(data, cells, merge_days):
    by_id = {c.id: c for c in cells}
    for row in data.get('cells') or []:
        cell = by_id.get(row.get('id'))
        if not cell:
            continue
        version = getattr(cell, 'schedule_version', None)
        cycle = getattr(version, 'weekly_cycle', None) if version else None
        row['calendar_name'] = cycle.name if cycle else None
        if merge_days and cell.weekly_day_id:
            row['day_id'] = cell.weekly_day.day_of_week


def _teacher_cells_qs(teacher_id, versions):
    qs = ProgramGridCell.objects.filter(
        schedule_version_id__in=[v.id for v in versions],
        is_active=True,
    ).filter(
        Q(ogretmen_id=teacher_id) | Q(class_lesson_plan__ogretmen_id=teacher_id)
    ).select_related(*_CELL_RELATED)
    if len(versions) <= 1:
        return list(qs)

    seen = set()
    unique = []
    for cell in qs:
        key = (
            cell.weekly_day.day_of_week if cell.weekly_day_id else None,
            cell.timeslot_id,
            cell.sinif_id,
            cell.class_lesson_plan_id or cell.ders_id,
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(cell)
    return unique


# ==================== SINIF PROGRAMI ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
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
    
    version = resolve_view_version(request, term_id)
    if not version:
        return Response({
            "error": "Bu dönem ve çalışma takvimi için program bulunamadı",
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
    
    slots = get_version_lesson_slots(version, days)
    
    # Grid hücreleri
    cells = ProgramGridCell.objects.filter(
        schedule_version=version,
        sinif_id=classroom_id,
        is_active=True
    ).select_related(*_CELL_RELATED)

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
    if not days.exists():
        data["empty_reason"] = "no_days"
        data["empty_message"] = (
            "Çalışma takviminde aktif gün yok. "
            "Tanımlar → Çalışma Takvimi’nden günleri aktifleştirin."
        )
    elif not slots.exists():
        data["empty_reason"] = "no_slots"
        data["empty_message"] = (
            "Ders saati şablonunda saat yok. "
            "Tanımlar → Ders Saatleri’nden ders saatleri oluşturun."
        )
    else:
        data["empty_reason"] = None
        data["empty_message"] = None
    
    return Response(data)


# ==================== ÖĞRETMEN PROGRAMI ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def teacher_schedule_api(request):
    """
    Öğretmen programı (Haftalık Grid)

    GET /api/schedule/teacher/?teacher_id=&term_id=&version_id=

    version_id verilmezse dönemdeki tüm çalışma takvimi versiyonları
    tek haftalık grid'de birleştirilir (günler day_of_week, saatler union).
    """
    teacher_id = request.query_params.get('teacher_id')
    term_id = request.query_params.get('term_id')
    version_id = request.query_params.get('version_id')

    if not teacher_id:
        return Response({"error": "teacher_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)
    if not term_id:
        return Response({"error": "term_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err

    egitim_yili = get_active_egitim_yili()
    if not egitim_yili:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)

    versions = _term_versions_for_teacher(term_id, version_id)
    gated = []
    first_gate = None
    for version in versions:
        gate_err = _gate_loaded_version(request, version)
        if gate_err:
            first_gate = first_gate or gate_err
            continue
        gated.append(version)
    if not gated:
        if first_gate:
            return first_gate
        return Response({
            "error": "Bu dönem ve çalışma takvimi için program bulunamadı",
            "days": [],
            "slots": [],
            "cells": [],
        })

    merge_days = len(gated) > 1 or not version_id
    if merge_days:
        days = _canonical_days(gated)
        slots = _merged_lesson_slots(gated)
    else:
        version = gated[0]
        days = WeeklyDay.objects.filter(
            weekly_cycle=version.weekly_cycle,
            is_active=True,
        ).order_by('order')
        slots = get_version_lesson_slots(version, days)

    cells = _teacher_cells_qs(teacher_id, gated)
    data = serialize_grid_response(cells, days, slots)
    _annotate_teacher_cells(data, cells, merge_days=merge_days)

    extra_slots, extra_cells = _private_lesson_overlay(
        teacher_id, ctx, egitim_yili, days, slots,
    )
    existing_slot_ids = {s['id'] for s in data['slots']}
    for extra in extra_slots:
        if extra['id'] not in existing_slot_ids:
            data['slots'].append(extra)
            existing_slot_ids.add(extra['id'])
    data['cells'].extend(extra_cells)
    if merge_days:
        used_slot_ids = {c.get('timeslot_id') for c in data['cells']}
        data['slots'] = [s for s in data['slots'] if s['id'] in used_slot_ids]
    data['slots'].sort(key=lambda s: (s.get('start') or '99:99', s.get('end') or '', s.get('order') or 0))
    data['private_count'] = len(extra_cells)
    data['versions'] = [
        {
            "id": v.id,
            "name": v.name,
            "is_active": v.is_active,
            "is_locked": v.is_locked,
            "calendar_name": v.weekly_cycle.name if v.weekly_cycle_id else None,
        }
        for v in gated
    ]
    primary = gated[0]
    data["version"] = {
        "id": primary.id,
        "name": primary.name,
        "is_active": primary.is_active,
        "is_locked": primary.is_locked,
    }
    data["egitim_yili"] = {
        "id": egitim_yili.id,
        "display": f"{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}",
    }

    return Response(data)


# ==================== ÖĞRENCİ PROGRAMI ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
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
    
    version = resolve_view_version(request, term_id)
    if not version:
        return Response({
            "error": "Bu dönem ve çalışma takvimi için program bulunamadı",
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
    
    slots = get_version_lesson_slots(version, days)
    
    # Sınıfın programını getir
    cells = ProgramGridCell.objects.filter(
        schedule_version=version,
        sinif_id=placement.sinif_id,
        is_active=True
    ).select_related(*_CELL_RELATED)

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


def _attach_version_meta(data, version, egitim_yili):
    data["version"] = {
        "id": version.id,
        "name": version.name,
        "is_active": version.is_active,
        "is_locked": version.is_locked,
    }
    data["egitim_yili"] = {
        "id": egitim_yili.id,
        "display": f"{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}",
    }
    return data


def _room_catalog(ctx, version):
    """Şubedeki derslikler + atanan sınıflar + dolu saat sayısı."""
    odalar = list(
        Oda.objects.filter(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            aktif_mi=True,
        ).order_by('ad')
    )
    siniflar = list(
        Sinif.objects.filter(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            aktif_mi=True,
            oda_id__isnull=False,
        ).only('id', 'ad', 'oda_id')
    )
    by_oda = {}
    for sinif in siniflar:
        by_oda.setdefault(sinif.oda_id, []).append({'id': sinif.id, 'name': sinif.ad})

    counts = {}
    if version:
        for row in (
            ProgramGridCell.objects.filter(
                schedule_version=version,
                is_active=True,
                status=CellStatus.FILLED,
                sinif__oda_id__isnull=False,
            )
            .values('sinif__oda_id')
            .annotate(n=Count('id'))
        ):
            counts[row['sinif__oda_id']] = row['n']

    return [
        {
            'id': oda.id,
            'ad': oda.ad,
            'kapasite': oda.kapasite,
            'oda_turu': oda.oda_turu,
            'oda_turu_display': oda.get_oda_turu_display(),
            'classrooms': by_oda.get(oda.id, []),
            'filled_count': counts.get(oda.id, 0),
        }
        for oda in odalar
    ]


def _branch_catalog(version):
    """Versiyonda dolu hücrelerden branş özeti."""
    if not version:
        return []
    rows = (
        ProgramGridCell.objects.filter(
            schedule_version=version,
            is_active=True,
            status=CellStatus.FILLED,
            ders_id__isnull=False,
        )
        .values('ders_id', 'ders__ad', 'ders__kod')
        .annotate(
            filled_count=Count('id'),
            classroom_count=Count('sinif_id', distinct=True),
            teacher_count=Count('ogretmen_id', distinct=True),
        )
        .order_by('ders__ad')
    )
    return [
        {
            'id': row['ders_id'],
            'ad': row['ders__ad'],
            'kod': row['ders__kod'] or '',
            'filled_count': row['filled_count'],
            'classroom_count': row['classroom_count'],
            'teacher_count': row['teacher_count'],
        }
        for row in rows
    ]


# ==================== ODA / DERSLİK PROGRAMI ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def room_schedule_api(request):
    """
    Derslik programı (Haftalık Grid)

    GET /api/academic/schedule/room/?term_id=&version_id=&room_id=

    Sınıfa atanmış fiziksel oda (Sinif.oda) üzerinden filtrelenir.
    room_id verilmezse derslik kataloğu + boş grid döner.
    """
    room_id = request.query_params.get('room_id')
    term_id = request.query_params.get('term_id')
    version_id = request.query_params.get('version_id')

    if not term_id:
        return Response({"error": "term_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return err

    egitim_yili = get_active_egitim_yili()
    if not egitim_yili:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)

    version = resolve_view_version(request, term_id)
    if not version:
        return Response({
            "error": "Bu dönem ve çalışma takvimi için program bulunamadı",
            "days": [],
            "slots": [],
            "cells": [],
            "rooms": [],
        })

    gate_err = _gate_loaded_version(request, version)
    if gate_err:
        return gate_err

    days = WeeklyDay.objects.filter(
        weekly_cycle=version.weekly_cycle,
        is_active=True,
    ).order_by('order')
    slots = get_version_lesson_slots(version, days)
    rooms = _room_catalog(ctx, version)

    cells = []
    selected_room = None
    if room_id:
        try:
            selected_room = next((r for r in rooms if str(r['id']) == str(room_id)), None)
            if selected_room is None:
                oda = Oda.objects.get(
                    id=room_id,
                    kurum_id=ctx['kurum_id'],
                    sube_id=ctx['sube_id'],
                )
                selected_room = {
                    'id': oda.id,
                    'ad': oda.ad,
                    'kapasite': oda.kapasite,
                    'oda_turu': oda.oda_turu,
                    'oda_turu_display': oda.get_oda_turu_display(),
                    'classrooms': [],
                    'filled_count': 0,
                }
        except (Oda.DoesNotExist, ValueError, TypeError):
            return Response({"error": "Derslik bulunamadı"}, status=status.HTTP_404_NOT_FOUND)

        cells = ProgramGridCell.objects.filter(
            schedule_version=version,
            is_active=True,
            sinif__oda_id=room_id,
        ).select_related(*_CELL_RELATED)

    data = serialize_grid_response(cells, days, slots)
    _attach_version_meta(data, version, egitim_yili)
    data['rooms'] = rooms
    data['room'] = selected_room
    data['info'] = (
        'Derslik, sınıfa atanmış fiziksel oda üzerinden hesaplanır. '
        'Oda ataması olmayan sınıflar bu görünümde yer almaz.'
    )
    return Response(data)


# ==================== BRANŞ PROGRAMI ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
def branch_schedule_api(request):
    """
    Branş programı (Haftalık Grid)

    GET /api/academic/schedule/branch/?term_id=&version_id=&ders_id=

    Seçili dersin tüm sınıflardaki yerleşimini gösterir.
    ders_id verilmezse branş kataloğu + boş grid döner.
    """
    ders_id = request.query_params.get('ders_id')
    term_id = request.query_params.get('term_id')
    version_id = request.query_params.get('version_id')

    if not term_id:
        return Response({"error": "term_id zorunludur"}, status=status.HTTP_400_BAD_REQUEST)

    _, err = mandatory_academic_context_drf(request)
    if err:
        return err

    egitim_yili = get_active_egitim_yili()
    if not egitim_yili:
        return Response({"error": "Aktif eğitim yılı bulunamadı"}, status=status.HTTP_400_BAD_REQUEST)

    version = resolve_view_version(request, term_id)
    if not version:
        return Response({
            "error": "Bu dönem ve çalışma takvimi için program bulunamadı",
            "days": [],
            "slots": [],
            "cells": [],
            "dersler": [],
        })

    gate_err = _gate_loaded_version(request, version)
    if gate_err:
        return gate_err

    days = WeeklyDay.objects.filter(
        weekly_cycle=version.weekly_cycle,
        is_active=True,
    ).order_by('order')
    slots = get_version_lesson_slots(version, days)
    dersler = _branch_catalog(version)

    cells = []
    selected = None
    if ders_id:
        selected = next((d for d in dersler if str(d['id']) == str(ders_id)), None)
        if selected is None:
            return Response({"error": "Bu programda seçili branş bulunamadı"}, status=status.HTTP_404_NOT_FOUND)
        cells = ProgramGridCell.objects.filter(
            schedule_version=version,
            is_active=True,
            ders_id=ders_id,
        ).select_related(*_CELL_RELATED)

    data = serialize_grid_response(cells, days, slots)
    _attach_version_meta(data, version, egitim_yili)
    data['dersler'] = dersler
    data['ders'] = selected
    return Response(data)


# ==================== GÜNLÜK AKIŞ ====================

@csrf_exempt
@api_view(['GET'])
@authentication_classes([SessionAuthentication])
@permission_classes([AcademicModulePermission])
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
    
    version = resolve_view_version(request, term_id)
    if not version:
        return Response({
            "error": "Bu dönem ve çalışma takvimi için program bulunamadı",
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
    ).select_related(*_CELL_RELATED).order_by('timeslot__order')

    if teacher_id:
        cells_qs = cells_qs.filter(
            Q(ogretmen_id=teacher_id) | Q(class_lesson_plan__ogretmen_id=teacher_id)
        )
    if classroom_id:
        cells_qs = cells_qs.filter(sinif_id=classroom_id)
    if room_id:
        cells_qs = cells_qs.filter(sinif__oda_id=room_id)

    # Kronolojik liste
    items = []
    for c in cells_qs:
        item = {
            "id": c.id,
            "timeslot_id": c.timeslot_id,
            "start": c.timeslot.start_time.strftime("%H:%M") if c.timeslot.start_time else None,
            "end": c.timeslot.end_time.strftime("%H:%M") if c.timeslot.end_time else None,
            "status": c.status,
            "status_display": c.get_status_display(),
            "lesson": None,
            "teacher": None,
            "classroom": None,
            "room": _room_from_sinif(c.sinif),
        }

        if c.ders:
            from apps.egitim_tanimlari.display import serialize_lesson_label
            item["lesson"] = serialize_lesson_label(
                ders=c.ders,
                plan=getattr(c, 'class_lesson_plan', None),
            )
        teacher = None
        plan = getattr(c, 'class_lesson_plan', None)
        if plan is not None and getattr(plan, 'ogretmen_id', None):
            teacher = plan.ogretmen
        elif c.ogretmen_id:
            teacher = c.ogretmen
        if teacher:
            item["teacher"] = {
                "id": teacher.id,
                "name": f"{teacher.ad} {teacher.soyad}",
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
