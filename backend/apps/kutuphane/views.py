"""
Kütüphane Views — API Endpoints
"""
import json
from datetime import date, datetime, timedelta
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q, Avg, F
from django.utils import timezone

from apps.kutuphane.application.service import (
    LibraryService, SeatService, LockerService,
    AssignmentService, AttendanceService,
    TemporarySeatingService,
    SubeDersProgramiService, OgrenciIzinService
)
from apps.kutuphane.infrastructure.repository import (
    LibraryRepository, SeatRepository, LockerRepository,
    SessionDefinitionRepository, SeatAssignmentRepository,
    LockerAssignmentRepository, AttendanceRepository,
    TemporarySeatingRepository,
    AuditLogRepository,
    SubeDersProgramiRepository, OgrenciIzinRepository
)
from apps.kutuphane.domain.models import (
    Library, Seat, Locker, SessionDefinition,
    SeatAssignment, LockerAssignment,
    AttendanceSession, AttendanceRecord,
    TemporarySeating,
    SubeDersProgrami, OgrenciIzin,
    SeatStatus, LockerStatus, AssignmentStatus,
    AttendanceSessionStatus, TemporarySeatingStatus,
    AttendanceType, ExemptionType, SessionCode
)
from apps.kutuphane.coach_scope import (
    require_infra_admin,
    require_kutuphane_operational_access,
    filter_kutuphane_assignments_qs,
)
from apps.kutuphane.sube_context import (
    mandatory_kutuphane_context,
    assert_kutuphane_record_sube_access,
)


def _get_kurum_id(request):
    """Aktif kurum ID'sini al"""
    kurum_id = request.headers.get('X-Kurum-ID') or request.session.get('active_kurum_id')
    if not kurum_id:
        return None
    return int(kurum_id)


def _get_user_id(request):
    """Aktif kullanıcı ID'sini al"""
    return request.user.id if request.user.is_authenticated else None


def _mandatory_ctx(request):
    return mandatory_kutuphane_context(request)


def _salon_qs(ctx):
    return Library.objects.filter(
        kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'], is_deleted=False,
    )


def _check_library_sube(request, library):
    return assert_kutuphane_record_sube_access(request, library.kurum_id, library.sube_id)


def _check_locker_sube(request, locker):
    return assert_kutuphane_record_sube_access(request, locker.kurum_id, locker.sube_id)


def _resolve_library(request, library_id):
    ctx, err = _mandatory_ctx(request)
    if err:
        return None, None, err
    library = LibraryRepository.get_by_id(library_id)
    if not library:
        return None, None, JsonResponse({'success': False, 'error': 'Kütüphane bulunamadı'}, status=404)
    sube_err = _check_library_sube(request, library)
    if sube_err:
        return None, None, sube_err
    return ctx, library, None


def _get_sube_adi(sube_id):
    try:
        from apps.sube.domain.models import Sube
        sube = Sube.objects.filter(id=sube_id).values('ad').first()
        if sube:
            return sube['ad']
    except Exception:
        pass
    return ''


def _get_ogrenci_adi(ogrenci_id):
    """Öğrenci adını cache-friendly getir"""
    try:
        from apps.ogrenci.domain.models import Ogrenci
        o = Ogrenci.objects.filter(id=ogrenci_id).values('ad', 'soyad').first()
        if o:
            return f"{o['ad'].strip()} {o['soyad'].strip()}"
    except Exception:
        pass
    return f"Öğrenci #{ogrenci_id}"


def _serialize_library(lib, include_stats=False):
    data = {
        'id': str(lib.id),
        'kurum_id': lib.kurum_id,
        'sube_id': lib.sube_id,
        'sube_adi': _get_sube_adi(lib.sube_id),
        'ad': lib.ad,
        'kod': lib.kod,
        'aciklama': lib.aciklama,
        'kapasite': lib.kapasite,
        'durum': lib.durum,
        'calisma_saatleri': lib.calisma_saatleri,
        'dolap_var_mi': lib.dolap_var_mi,
        'dolap_sayisi': lib.dolap_sayisi,
        'max_gecici_sure_saat': lib.max_gecici_sure_saat,
        'kurallar': lib.kurallar,
        'aktif_mi': lib.aktif_mi,
        'created_at': lib.created_at.isoformat() if lib.created_at else '',
    }
    if include_stats:
        data['toplam_masa'] = getattr(lib, 'toplam_masa', 0)
        data['aktif_masa'] = getattr(lib, 'toplam_masa', 0) - getattr(lib, 'arizali_masa', 0)
        data['dolu_masa'] = getattr(lib, 'dolu_masa', 0)
        data['bos_masa'] = getattr(lib, 'bos_masa', 0)
        data['arizali_masa'] = getattr(lib, 'arizali_masa', 0)
        data['aktif_atama'] = getattr(lib, 'aktif_atama', 0)
        toplam = data['toplam_masa']
        data['doluluk_yuzde'] = round(
            (data['dolu_masa'] / toplam * 100), 1
        ) if toplam > 0 else 0
        aktif_masa = data['aktif_masa'] or 1
        data['doluluk_orani'] = round(
            (data['aktif_atama'] / aktif_masa * 100), 1
        ) if aktif_masa > 0 else 0
    return data


def _serialize_seat(seat):
    active_assignment = None
    atanan_ogrenci = None
    atama_id = None
    try:
        a = seat.atamalar.filter(durum=AssignmentStatus.ACTIVE).first()
        if a:
            ogrenci_adi = _get_ogrenci_adi(a.ogrenci_id)
            atanan_ogrenci = ogrenci_adi
            atama_id = str(a.id)
            active_assignment = {
                'id': str(a.id),
                'ogrenci_id': a.ogrenci_id,
                'ogrenci_adi': ogrenci_adi,
                'atama_tipi': a.atama_tipi,
                'baslangic_tarihi': a.baslangic_tarihi.isoformat() if a.baslangic_tarihi else '',
            }
    except Exception:
        pass

    return {
        'id': str(seat.id),
        'library_id': str(seat.library_id),
        'kutuphane_id': str(seat.library_id),
        'masa_no': seat.masa_no,
        'etiket': seat.etiket,
        'bolge': seat.bolge,
        'masa_tipi': seat.masa_tipi,
        'durum': seat.durum,
        'priz_var_mi': seat.priz_var_mi,
        'lamba_var_mi': seat.lamba_var_mi,
        'pozisyon_x': float(seat.pozisyon_x) if seat.pozisyon_x else None,
        'pozisyon_y': float(seat.pozisyon_y) if seat.pozisyon_y else None,
        'notlar': seat.notlar,
        'sira': seat.sira,
        'atanan_ogrenci': atanan_ogrenci,
        'atama_id': atama_id,
        'aktif_atama': active_assignment,
    }


def _serialize_locker(locker):
    # Aktif atama bilgisi
    atanan_ogrenci = None
    atama_id = None
    try:
        a = locker.atamalar.filter(durum=AssignmentStatus.ACTIVE).first()
        if a:
            atanan_ogrenci = _get_ogrenci_adi(a.ogrenci_id)
            atama_id = str(a.id)
    except Exception:
        pass

    return {
        'id': str(locker.id),
        'kurum_id': locker.kurum_id,
        'sube_id': locker.sube_id,
        'sube_adi': _get_sube_adi(locker.sube_id),
        'dolap_no': locker.dolap_no,
        'boyut': locker.boyut,
        'kilit_tipi': locker.kilit_tipi,
        'anahtar_no': locker.anahtar_no,
        'durum': locker.durum,
        'atanan_ogrenci': atanan_ogrenci,
        'atama_id': atama_id,
    }


def _serialize_session_definition(sd):
    return {
        'id': str(sd.id),
        'library_id': str(sd.library_id),
        'oturum_adi': sd.ad,
        'oturum_kodu': sd.kod,
        'ad': sd.ad,
        'kod': sd.kod,
        'baslangic_saati': sd.baslangic_saati.strftime('%H:%M') if sd.baslangic_saati else '',
        'bitis_saati': sd.bitis_saati.strftime('%H:%M') if sd.bitis_saati else '',
        'sira': sd.sira,
        'aktif_mi': sd.aktif_mi,
    }


def _serialize_seat_assignment(a):
    return {
        'id': str(a.id),
        'library_id': str(a.library_id),
        'kutuphane_id': str(a.library_id),
        'kutuphane_adi': a.library.ad if hasattr(a, 'library') and a.library else '',
        'seat_id': str(a.seat_id),
        'masa_id': str(a.seat_id),
        'masa_no': a.seat.masa_no if a.seat else '',
        'ogrenci_id': a.ogrenci_id,
        'ogrenci_adi': _get_ogrenci_adi(a.ogrenci_id),
        'atama_tipi': a.atama_tipi,
        'baslangic_tarihi': a.baslangic_tarihi.isoformat() if a.baslangic_tarihi else '',
        'bitis_tarihi': a.bitis_tarihi.isoformat() if a.bitis_tarihi else '',
        'durum': a.durum,
        'notlar': a.notlar,
        'created_at': a.created_at.isoformat() if a.created_at else '',
    }


def _serialize_locker_assignment(a):
    return {
        'id': str(a.id),
        'kurum_id': a.kurum_id,
        'locker_id': str(a.locker_id),
        'dolap_id': str(a.locker_id),
        'dolap_no': a.locker.dolap_no if a.locker else '',
        'ogrenci_id': a.ogrenci_id,
        'ogrenci_adi': _get_ogrenci_adi(a.ogrenci_id),
        'atama_tipi': a.atama_tipi,
        'depozit_odendi': float(a.depozit_odendi or 0) > 0,
        'depozit_tutari': float(a.depozit_odendi or 0),
        'depozit_iade_edildi': a.depozit_iade_edildi,
        'anahtar_verildi': a.anahtar_verildi,
        'baslangic_tarihi': a.baslangic_tarihi.isoformat() if a.baslangic_tarihi else '',
        'bitis_tarihi': a.bitis_tarihi.isoformat() if a.bitis_tarihi else '',
        'durum': a.durum,
        'notlar': a.notlar,
        'created_at': a.created_at.isoformat() if a.created_at else '',
    }


def _serialize_attendance_session(s):
    PERIYOT_LABELS = {'MORNING': 'Sabah', 'AFTERNOON': 'Öğle', 'EVENING': 'Akşam', 'CUSTOM': 'Özel'}
    # Kayıt istatistikleri
    from apps.kutuphane.domain.models import AttendanceRecord, AttendanceStatus as AttStatus
    toplam_kayit = AttendanceRecord.objects.filter(attendance_session_id=s.id).count()
    var_sayisi = AttendanceRecord.objects.filter(
        attendance_session_id=s.id,
        durum=AttStatus.PRESENT
    ).count()
    katilim_orani = round(var_sayisi / toplam_kayit * 100) if toplam_kayit > 0 else 0
    return {
        'id': str(s.id),
        'library_id': str(s.library_id),
        'periyot_kodu': s.periyot_kodu,
        'oturum_adi': PERIYOT_LABELS.get(s.periyot_kodu, s.periyot_kodu),
        'oturum_kodu': s.periyot_kodu,
        'tarih': s.tarih.isoformat() if s.tarih else '',
        'yoklama_tipi': s.yoklama_tipi,
        'ders_no': s.ders_no,
        'durum': s.durum,
        'acan_id': s.acan_id,
        'acilis_zamani': s.acilis_zamani.isoformat() if s.acilis_zamani else '',
        'kapatan_id': s.kapatan_id,
        'kapanis_zamani': s.kapanis_zamani.isoformat() if s.kapanis_zamani else '',
        'sube_ders_programi_id': str(s.sube_ders_programi_id) if s.sube_ders_programi_id else None,
        'toplam_kayit': toplam_kayit,
        'katilim_orani': katilim_orani,
    }


def _serialize_attendance_record(r):
    # ogrenci_adi resolve
    ogrenci_adi = ''
    try:
        from apps.ogrenci.domain.models import Ogrenci
        o = Ogrenci.objects.filter(id=r.ogrenci_id).values('ad', 'soyad').first()
        if o:
            ogrenci_adi = f"{o['ad'].strip()} {o['soyad'].strip()}"
    except Exception:
        ogrenci_adi = f'Öğrenci #{r.ogrenci_id}'
    return {
        'id': str(r.id),
        'ogrenci_id': r.ogrenci_id,
        'ogrenci_adi': ogrenci_adi,
        'seat_id': str(r.seat_id) if r.seat_id else None,
        'masa_no': r.seat.masa_no if r.seat else '',
        'durum': r.durum,
        'giris_saati': r.giris_saati.strftime('%H:%M') if r.giris_saati else '',
        'cikis_saati': r.cikis_saati.strftime('%H:%M') if getattr(r, 'cikis_saati', None) else '',
        'izinli_mi': getattr(r, 'izinli_mi', False),
        'notlar': r.notlar,
    }


def _serialize_temporary_seating(t):
    return {
        'id': str(t.id),
        'library_id': str(t.library_id),
        'seat_id': str(t.seat_id),
        'masa_no': t.seat.masa_no if t.seat else '',
        'ogrenci_id': t.ogrenci_id,
        'sebep': t.sebep,
        'baslangic_zamani': t.baslangic_zamani.isoformat() if t.baslangic_zamani else '',
        'beklenen_bitis_zamani': t.beklenen_bitis_zamani.isoformat() if t.beklenen_bitis_zamani else '',
        'gercek_bitis_zamani': t.gercek_bitis_zamani.isoformat() if t.gercek_bitis_zamani else '',
        'durum': t.durum,
        'notlar': t.notlar,
    }


# ──────────────────────────────────────
# DASHBOARD
# ──────────────────────────────────────

def api_dashboard(request):
    """Dashboard KPI verileri"""
    ctx, err = _mandatory_ctx(request)
    if err:
        return err

    service = LibraryService()
    stats = service.get_dashboard_stats(ctx['kurum_id'], ctx['sube_id'])
    return JsonResponse({'success': True, 'data': stats})


# ──────────────────────────────────────
# TÜM ATAMALAR (Salon-bağımsız)
# ──────────────────────────────────────

def api_all_assignments(request):
    """Tüm salonlardaki atamaları listele (şube bazlı)"""
    ctx, err = _mandatory_ctx(request)
    if err:
        return err

    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    durum = request.GET.get('durum')
    salon_ids = list(_salon_qs(ctx).values_list('id', flat=True))

    # Masa atamaları
    seat_qs = SeatAssignment.objects.filter(library_id__in=salon_ids).select_related('seat', 'library')
    if durum:
        seat_qs = seat_qs.filter(durum=durum)
    seat_qs = filter_kutuphane_assignments_qs(seat_qs, request.user)
    seat_data = [_serialize_seat_assignment(a) for a in seat_qs.order_by('-created_at')]

    # Dolap atamaları — şube bazlı
    locker_ids = list(
        Locker.objects.filter(
            kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'], is_deleted=False,
        ).values_list('id', flat=True)
    )
    locker_qs = LockerAssignment.objects.filter(
        kurum_id=ctx['kurum_id'], locker_id__in=locker_ids,
    ).select_related('locker')
    if durum:
        locker_qs = locker_qs.filter(durum=durum)
    locker_qs = filter_kutuphane_assignments_qs(locker_qs, request.user)
    locker_data = [_serialize_locker_assignment(a) for a in locker_qs.order_by('-created_at')]

    return JsonResponse({
        'success': True,
        'data': {
            'masa_atamalari': seat_data,
            'dolap_atamalari': locker_data,
        }
    })


def _student_resource_matches_filter(filtre, has_masa, has_dolap):
    """Öğrenci kaynak genel görünümü filtre eşleşmesi."""
    if filtre in ('', 'all'):
        return True
    if filtre == 'masa_yok':
        return not has_masa
    if filtre == 'dolap_yok':
        return not has_dolap
    if filtre == 'ikisi_yok':
        return not has_masa and not has_dolap
    if filtre == 'masa_var':
        return has_masa
    if filtre == 'dolap_var':
        return has_dolap
    if filtre == 'ikisi_var':
        return has_masa and has_dolap
    return True


def api_student_resource_overview(request):
    """Tüm öğrencilerin masa ve dolap bilgilerini listele"""
    ctx, err = _mandatory_ctx(request)
    if err:
        return err

    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    filtre = request.GET.get('filtre', 'all')
    search = request.GET.get('search', '').strip()

    salon_ids = list(_salon_qs(ctx).values_list('id', flat=True))

    # Aktif masa atamaları
    seat_assignments = SeatAssignment.objects.filter(
        library_id__in=salon_ids, durum=AssignmentStatus.ACTIVE
    ).select_related('seat', 'library')

    # Aktif dolap atamaları (şube bazlı)
    locker_ids = list(
        Locker.objects.filter(
            kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'], is_deleted=False,
        ).values_list('id', flat=True)
    )
    locker_assignments = LockerAssignment.objects.filter(
        kurum_id=ctx['kurum_id'], locker_id__in=locker_ids, durum=AssignmentStatus.ACTIVE
    ).select_related('locker')

    # Öğrenci ID'lerini topla
    seat_by_student = {}
    for a in seat_assignments:
        seat_by_student[a.ogrenci_id] = {
            'atama_id': str(a.id),
            'masa_no': a.seat.masa_no if a.seat else '',
            'salon_adi': a.library.ad if a.library else '',
            'salon_id': str(a.library_id),
            'atama_tipi': a.atama_tipi,
            'baslangic_tarihi': a.baslangic_tarihi.isoformat() if a.baslangic_tarihi else '',
        }

    locker_by_student = {}
    for a in locker_assignments:
        locker_by_student[a.ogrenci_id] = {
            'atama_id': str(a.id),
            'dolap_no': a.locker.dolap_no if a.locker else '',
            'dolap_id': str(a.locker_id),
            'atama_tipi': a.atama_tipi,
            'baslangic_tarihi': a.baslangic_tarihi.isoformat() if a.baslangic_tarihi else '',
            'anahtar_verildi': a.anahtar_verildi,
        }

    # Tüm öğrenci ID'leri
    all_student_ids = set(seat_by_student.keys()) | set(locker_by_student.keys())

    # Kuruma kayıtlı tüm öğrencileri al — sadece kütüphane ek hizmeti aktif olanlar
    try:
        from apps.ogrenci.domain.models import Ogrenci, OgrenciEkHizmet
        
        # Kütüphane ek hizmeti aktif olan öğrenci ID'leri
        kutuphane_ogrenci_ids = OgrenciEkHizmet.objects.filter(
            ek_hizmet__hizmet_turu='kutuphane',
            aktif_mi=True,
        ).values_list('ogrenci_id', flat=True)
        
        ogrenci_qs = Ogrenci.objects.filter(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            aktif_mi=True,
            id__in=kutuphane_ogrenci_ids,
        ).select_related('sube')
        if search:
            ogrenci_qs = ogrenci_qs.filter(
                Q(ad__icontains=search) | Q(soyad__icontains=search) |
                Q(tc_kimlik_no__icontains=search)
            )
        ogrenciler = list(ogrenci_qs.values('id', 'ad', 'soyad', 'sube__ad', 'profil_foto')[:500])
        all_student_ids |= {o['id'] for o in ogrenciler}
        ogrenci_map = {o['id']: o for o in ogrenciler}
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Öğrenci listesi alınamadı: {e}")
        ogrenci_map = {}

    # Önce arama uygulanmış tam liste; özet kartları bu listeden hesaplanır
    all_records = []
    for sid in all_student_ids:
        oinfo = ogrenci_map.get(sid, {})
        ad = oinfo.get('ad', '')
        soyad = oinfo.get('soyad', '')
        tam_ad = f"{ad} {soyad}".strip() if ad else _get_ogrenci_adi(sid)
        sinif_adi = oinfo.get('sube__ad', '') or ''

        if search and search.lower() not in tam_ad.lower():
            continue

        masa = seat_by_student.get(sid)
        dolap = locker_by_student.get(sid)

        # profil_foto: ImageField'den gelen değer dosya yolu olabilir, URL oluştur
        profil_foto_raw = oinfo.get('profil_foto') or ''
        profil_foto_url = f'/media/{profil_foto_raw}' if profil_foto_raw else None

        all_records.append({
            'ogrenci_id': sid,
            'ogrenci_adi': tam_ad,
            'sinif_adi': sinif_adi,
            'profil_foto': profil_foto_url,
            'masa': masa,
            'dolap': dolap,
        })

    all_records.sort(key=lambda x: x['ogrenci_adi'])

    summary = {
        'toplam': len(all_records),
        'masa_var': sum(1 for r in all_records if r['masa']),
        'dolap_var': sum(1 for r in all_records if r['dolap']),
        'ikisi_var': sum(1 for r in all_records if r['masa'] and r['dolap']),
    }

    results = [
        r for r in all_records
        if _student_resource_matches_filter(
            filtre,
            bool(r['masa']),
            bool(r['dolap']),
        )
    ]

    return JsonResponse({
        'success': True,
        'data': {
            'students': results,
            'summary': summary,
        },
    })


# ──────────────────────────────────────
# LIBRARY CRUD
# ──────────────────────────────────────

@csrf_exempt
def api_library_list_create(request):
    """Kütüphane listele veya oluştur"""
    ctx, err = _mandatory_ctx(request)
    if err:
        return err

    if request.method == 'GET':
        service = LibraryService()
        libraries = service.list_libraries(ctx['kurum_id'], ctx['sube_id'])
        return JsonResponse({
            'success': True,
            'data': [_serialize_library(lib, include_stats=True) for lib in libraries]
        })

    elif request.method == 'POST':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            data = json.loads(request.body)
            user_id = _get_user_id(request)
            service = LibraryService()
            library = service.create_library(ctx['kurum_id'], ctx['sube_id'], data, user_id)
            return JsonResponse({
                'success': True,
                'data': _serialize_library(library),
                'message': f"'{library.ad}' başarıyla oluşturuldu"
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_library_detail(request, pk):
    """Kütüphane detay — GET, PUT, DELETE"""
    ctx, err = _mandatory_ctx(request)
    if err:
        return err

    library = LibraryRepository.get_by_id(pk)
    if not library:
        return JsonResponse({'success': False, 'error': 'Kütüphane bulunamadı'}, status=404)

    sube_err = _check_library_sube(request, library)
    if sube_err:
        return sube_err

    if request.method == 'GET':
        libs = LibraryRepository.get_with_stats(ctx['kurum_id'], ctx['sube_id']).filter(id=pk)
        lib = libs.first() if libs.exists() else library
        return JsonResponse({
            'success': True,
            'data': _serialize_library(lib, include_stats=True)
        })

    elif request.method == 'PUT':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            data = json.loads(request.body)
            user_id = _get_user_id(request)
            service = LibraryService()
            updated = service.update_library(pk, data, user_id)
            return JsonResponse({
                'success': True,
                'data': _serialize_library(updated),
                'message': 'Kütüphane güncellendi'
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            user_id = _get_user_id(request)
            service = LibraryService()
            service.delete_library(pk, user_id)
            return JsonResponse({'success': True, 'message': 'Kütüphane silindi'})
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_library_status(request, pk):
    """Kütüphane durum değiştir"""
    if request.method != 'PUT':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    library = LibraryRepository.get_by_id(pk)
    if not library:
        return JsonResponse({'success': False, 'error': 'Kütüphane bulunamadı'}, status=404)
    sube_err = _check_library_sube(request, library)
    if sube_err:
        return sube_err

    denied = require_infra_admin(request)
    if denied:
        return denied
    try:
        data = json.loads(request.body)
        user_id = _get_user_id(request)
        service = LibraryService()
        updated = service.change_status(pk, data['durum'], user_id)
        return JsonResponse({
            'success': True,
            'data': _serialize_library(updated),
            'message': 'Durum güncellendi'
        })
    except (ValueError, Exception) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


# ──────────────────────────────────────
# SEAT CRUD
# ──────────────────────────────────────

@csrf_exempt
def api_seat_list_create(request, library_id):
    """Masa listele veya oluştur"""
    ctx, library, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method == 'GET':
        service = SeatService()
        seats = service.list_seats(library_id)
        return JsonResponse({
            'success': True,
            'data': [_serialize_seat(s) for s in seats],
            'summary': SeatRepository.get_status_counts(library_id)
        })

    elif request.method == 'POST':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            data = json.loads(request.body)
            user_id = _get_user_id(request)
            service = SeatService()
            seat = service.create_seat(library_id, data, user_id)
            return JsonResponse({
                'success': True,
                'data': _serialize_seat(seat),
                'message': f"Masa {seat.masa_no} oluşturuldu"
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_seat_detail(request, library_id, pk):
    """Masa detay — GET, PUT, DELETE"""
    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    seat = SeatRepository.get_by_id(pk)
    if not seat:
        return JsonResponse({'success': False, 'error': 'Masa bulunamadı'}, status=404)

    if request.method == 'GET':
        return JsonResponse({'success': True, 'data': _serialize_seat(seat)})

    elif request.method == 'PUT':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            data = json.loads(request.body)
            user_id = _get_user_id(request)
            service = SeatService()
            updated = service.update_seat(pk, data, user_id)
            return JsonResponse({
                'success': True,
                'data': _serialize_seat(updated),
                'message': 'Masa güncellendi'
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            user_id = _get_user_id(request)
            service = SeatService()
            service.delete_seat(pk, user_id)
            return JsonResponse({'success': True, 'message': 'Masa silindi'})
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_seat_bulk_create(request, library_id):
    """Toplu masa oluştur"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    denied = require_infra_admin(request)
    if denied:
        return denied
    try:
        data = json.loads(request.body)
        user_id = _get_user_id(request)
        service = SeatService()
        defaults = {
            'masa_tipi': data.get('masa_tipi', 'STANDARD'),
            'bolge': data.get('bolge', ''),
            'priz_var_mi': data.get('priz_var_mi', False),
            'lamba_var_mi': data.get('lamba_var_mi', False),
        }
        # Frontend baslangic/bitis veya start_number/count gönderebilir
        start = data.get('start_number') or data.get('baslangic', 1)
        if 'bitis' in data:
            count = data['bitis'] - start + 1
        else:
            count = data.get('count', 1)
        result = service.bulk_create_seats(
            library_id,
            prefix=data.get('prefix', 'M-'),
            start=int(start),
            count=int(count),
            defaults=defaults,
            user_id=user_id
        )
        return JsonResponse({
            'success': True,
            'data': result,
            'message': f"{result['created_count']} masa oluşturuldu"
        })
    except (ValueError, Exception) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
def api_seat_status(request, library_id, pk):
    """Masa durum değiştir"""
    if request.method != 'PUT':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    denied = require_infra_admin(request)
    if denied:
        return denied
    try:
        data = json.loads(request.body)
        user_id = _get_user_id(request)
        service = SeatService()
        updated = service.change_seat_status(pk, data['durum'], user_id)
        return JsonResponse({
            'success': True,
            'data': _serialize_seat(updated),
            'message': 'Masa durumu güncellendi'
        })
    except (ValueError, Exception) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


# ──────────────────────────────────────
# LOCKER CRUD
# ──────────────────────────────────────

@csrf_exempt
def api_locker_list_create(request):
    """Dolap listele veya oluştur — Şube bazlı"""
    ctx, err = _mandatory_ctx(request)
    if err:
        return err

    if request.method == 'GET':
        lockers = LockerRepository.get_all(ctx['kurum_id'], ctx['sube_id'])
        return JsonResponse({
            'success': True,
            'data': [_serialize_locker(l) for l in lockers],
            'summary': LockerRepository.get_status_counts(ctx['kurum_id'], ctx['sube_id'])
        })

    elif request.method == 'POST':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            data = json.loads(request.body)
            user_id = _get_user_id(request)
            service = LockerService()
            locker = service.create_locker(ctx['kurum_id'], ctx['sube_id'], data, user_id)
            return JsonResponse({
                'success': True,
                'data': _serialize_locker(locker),
                'message': f"Dolap {locker.dolap_no} oluşturuldu"
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_locker_detail(request, pk):
    """Dolap detay — GET, PUT, DELETE"""
    ctx, err = _mandatory_ctx(request)
    if err:
        return err

    locker = LockerRepository.get_by_id(pk)
    if not locker:
        return JsonResponse({'success': False, 'error': 'Dolap bulunamadı'}, status=404)

    sube_err = _check_locker_sube(request, locker)
    if sube_err:
        return sube_err

    if request.method == 'GET':
        return JsonResponse({'success': True, 'data': _serialize_locker(locker)})

    elif request.method == 'PUT':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            data = json.loads(request.body)
            LockerRepository.update(pk, data)
            locker.refresh_from_db()
            return JsonResponse({
                'success': True,
                'data': _serialize_locker(locker),
                'message': 'Dolap güncellendi'
            })
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            user_id = _get_user_id(request)
            service = LockerService()
            service.delete_locker(pk, user_id)
            return JsonResponse({'success': True, 'message': 'Dolap silindi'})
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


# ──────────────────────────────────────
# SESSION DEFINITION
# ──────────────────────────────────────

@csrf_exempt
def api_session_def_list_create(request, library_id):
    """Oturum tanımı listele veya oluştur"""
    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method == 'GET':
        definitions = SessionDefinitionRepository.get_all(library_id)
        return JsonResponse({
            'success': True,
            'data': [_serialize_session_definition(sd) for sd in definitions]
        })

    elif request.method == 'POST':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            data = json.loads(request.body)
            from datetime import time
            start_time = time.fromisoformat(data.get('baslangic_saati', data.get('baslangic_saati', '00:00')))
            end_time = time.fromisoformat(data.get('bitis_saati', data.get('bitis_saati', '00:00')))

            if SessionDefinitionRepository.check_time_overlap(library_id, start_time, end_time):
                return JsonResponse({
                    'success': False, 'error': 'Bu saat aralığında başka oturum var'
                }, status=400)

            # Frontend mapping: oturum_kodu → kod, oturum_adi → ad
            # Türkçe kodları İngilizce enum değerlerine çevir
            _CODE_MAP = {'SABAH': 'MORNING', 'OGLE': 'AFTERNOON', 'AKSAM': 'EVENING', 'GECE': 'EVENING'}
            raw_kod = data.get('oturum_kodu') or data.get('kod', 'CUSTOM')
            normalized_kod = _CODE_MAP.get(raw_kod, raw_kod)
            create_data = {
                'library_id': library_id,
                'ad': data.get('oturum_adi') or data.get('ad', ''),
                'kod': normalized_kod,
                'baslangic_saati': start_time,
                'bitis_saati': end_time,
                'aktif_mi': data.get('aktif_mi', True),
                'sira': data.get('sira', 0),
            }
            sd = SessionDefinitionRepository.create(create_data)
            return JsonResponse({
                'success': True,
                'data': _serialize_session_definition(sd),
                'message': f"Oturum tanımı '{sd.ad}' oluşturuldu"
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_session_def_detail(request, library_id, pk):
    """Oturum tanımı detay — GET, PUT, DELETE"""
    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    sd = SessionDefinitionRepository.get_by_id(pk)
    if not sd:
        return JsonResponse({'success': False, 'error': 'Oturum tanımı bulunamadı'}, status=404)

    if request.method == 'GET':
        return JsonResponse({'success': True, 'data': _serialize_session_definition(sd)})

    elif request.method == 'PUT':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            data = json.loads(request.body)
            if 'baslangic_saati' in data:
                from datetime import time
                data['baslangic_saati'] = time.fromisoformat(data['baslangic_saati'])
            if 'bitis_saati' in data:
                from datetime import time
                data['bitis_saati'] = time.fromisoformat(data['bitis_saati'])
            updated = SessionDefinitionRepository.update(pk, data)
            return JsonResponse({
                'success': True,
                'data': _serialize_session_definition(updated),
                'message': 'Oturum tanımı güncellendi'
            })
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        denied = require_infra_admin(request)
        if denied:
            return denied
        SessionDefinitionRepository.delete(pk)
        return JsonResponse({'success': True, 'message': 'Oturum tanımı silindi'})

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


# ──────────────────────────────────────
# SEAT ASSIGNMENTS
# ──────────────────────────────────────

@csrf_exempt
def api_seat_assignment_list_create(request, library_id):
    """Masa ataması listele veya oluştur"""
    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method == 'GET':
        durum = request.GET.get('durum')
        if durum:
            assignments = SeatAssignment.objects.filter(
                library_id=library_id, durum=durum
            ).select_related('seat', 'library')
        else:
            assignments = SeatAssignmentRepository.get_all(library_id)
        assignments = filter_kutuphane_assignments_qs(assignments, request.user)
        return JsonResponse({
            'success': True,
            'data': [_serialize_seat_assignment(a) for a in assignments]
        })

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            denied = require_kutuphane_operational_access(request, data.get('ogrenci_id'))
            if denied:
                return denied
            data['library_id'] = library_id
            # Frontend mapping: masa_id → seat_id
            if 'masa_id' in data and 'seat_id' not in data:
                data['seat_id'] = data.pop('masa_id')
            if 'baslangic_tarihi' in data:
                data['baslangic_tarihi'] = date.fromisoformat(data['baslangic_tarihi'])
            if 'bitis_tarihi' in data and data['bitis_tarihi']:
                data['bitis_tarihi'] = date.fromisoformat(data['bitis_tarihi'])
            user_id = _get_user_id(request)
            service = AssignmentService()
            assignment = service.create_seat_assignment(data, user_id)
            return JsonResponse({
                'success': True,
                'data': _serialize_seat_assignment(assignment),
                'message': 'Masa ataması oluşturuldu'
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_seat_assignment_end(request, library_id, pk):
    """Masa ataması sonlandır"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    try:
        assignment = SeatAssignment.objects.filter(pk=pk, library_id=library_id).first()
        if not assignment:
            return JsonResponse({'success': False, 'error': 'Atama bulunamadı'}, status=404)
        denied = require_kutuphane_operational_access(request, assignment.ogrenci_id)
        if denied:
            return denied
        data = json.loads(request.body) if request.body else {}
        user_id = _get_user_id(request)
        service = AssignmentService()
        assignment = service.end_seat_assignment(pk, data.get('reason', ''), user_id)
        return JsonResponse({
            'success': True,
            'data': _serialize_seat_assignment(assignment),
            'message': 'Atama sonlandırıldı'
        })
    except (ValueError, Exception) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


# ──────────────────────────────────────
# LOCKER ASSIGNMENTS
# ──────────────────────────────────────

@csrf_exempt
def api_locker_assignment_list_create(request):
    """Dolap ataması listele veya oluştur — Şube bazlı"""
    ctx, err = _mandatory_ctx(request)
    if err:
        return err

    locker_ids = list(
        Locker.objects.filter(
            kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'], is_deleted=False,
        ).values_list('id', flat=True)
    )

    if request.method == 'GET':
        durum = request.GET.get('durum')
        if durum:
            assignments = LockerAssignment.objects.filter(
                kurum_id=ctx['kurum_id'], locker_id__in=locker_ids, durum=durum
            ).select_related('locker')
        else:
            assignments = LockerAssignmentRepository.get_all(ctx['kurum_id']).filter(
                locker_id__in=locker_ids,
            )
        assignments = filter_kutuphane_assignments_qs(assignments, request.user)
        return JsonResponse({
            'success': True,
            'data': [_serialize_locker_assignment(a) for a in assignments]
        })

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            denied = require_kutuphane_operational_access(request, data.get('ogrenci_id'))
            if denied:
                return denied
            data['kurum_id'] = ctx['kurum_id']
            # Frontend mapping: dolap_id → locker_id
            if 'dolap_id' in data and 'locker_id' not in data:
                data['locker_id'] = data.pop('dolap_id')
            locker = LockerRepository.get_by_id(data.get('locker_id'))
            if not locker or locker.sube_id != ctx['sube_id']:
                return JsonResponse({'success': False, 'error': 'Dolap bu şubeye ait değil.'}, status=403)
            if 'baslangic_tarihi' in data:
                data['baslangic_tarihi'] = date.fromisoformat(data['baslangic_tarihi'])
            if 'bitis_tarihi' in data and data['bitis_tarihi']:
                data['bitis_tarihi'] = date.fromisoformat(data['bitis_tarihi'])
            user_id = _get_user_id(request)
            service = AssignmentService()
            assignment = service.create_locker_assignment(data, user_id)
            return JsonResponse({
                'success': True,
                'data': _serialize_locker_assignment(assignment),
                'message': 'Dolap ataması oluşturuldu'
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_locker_assignment_end(request, pk):
    """Dolap ataması sonlandır"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    ctx, err = _mandatory_ctx(request)
    if err:
        return err

    try:
        assignment = LockerAssignment.objects.filter(pk=pk).select_related('locker').first()
        if not assignment:
            return JsonResponse({'success': False, 'error': 'Atama bulunamadı'}, status=404)
        if assignment.locker.sube_id != ctx['sube_id']:
            return JsonResponse({'success': False, 'error': 'Kayıt bu şubeye ait değil.'}, status=403)
        denied = require_kutuphane_operational_access(request, assignment.ogrenci_id)
        if denied:
            return denied
        user_id = _get_user_id(request)
        service = AssignmentService()
        assignment = service.end_locker_assignment(pk, user_id)
        return JsonResponse({
            'success': True,
            'data': _serialize_locker_assignment(assignment),
            'message': 'Dolap ataması sonlandırıldı'
        })
    except (ValueError, Exception) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
def api_locker_assignment_toggle_key(request, pk):
    """Dolap atamasında anahtar verildi/verilmedi durumunu değiştir"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    ctx, err = _mandatory_ctx(request)
    if err:
        return err

    try:
        assignment = LockerAssignment.objects.select_related('locker').get(pk=pk, durum=AssignmentStatus.ACTIVE)
        if assignment.locker.sube_id != ctx['sube_id']:
            return JsonResponse({'success': False, 'error': 'Kayıt bu şubeye ait değil.'}, status=403)
        denied = require_kutuphane_operational_access(request, assignment.ogrenci_id)
        if denied:
            return denied
        assignment.anahtar_verildi = not assignment.anahtar_verildi
        assignment.save(update_fields=['anahtar_verildi'])
        return JsonResponse({
            'success': True,
            'data': _serialize_locker_assignment(assignment),
            'message': f'Anahtar durumu güncellendi: {"Verildi" if assignment.anahtar_verildi else "Verilmedi"}'
        })
    except LockerAssignment.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Aktif dolap ataması bulunamadı'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


# ──────────────────────────────────────
# ATTENDANCE
# ──────────────────────────────────────

@csrf_exempt
def api_attendance_sessions(request, library_id):
    """Yoklama oturumları listele veya oluştur"""
    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method == 'GET':
        tarih_str = request.GET.get('tarih')
        tarih = date.fromisoformat(tarih_str) if tarih_str else None
        sessions = AttendanceRepository.get_sessions(library_id, tarih)
        return JsonResponse({
            'success': True,
            'data': [_serialize_attendance_session(s) for s in sessions]
        })

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            user_id = _get_user_id(request)
            periyot_kodu = data.get('periyot_kodu')
            if not periyot_kodu:
                return JsonResponse({'success': False, 'error': 'periyot_kodu gerekli (MORNING, AFTERNOON, EVENING)'}, status=400)
            service = AttendanceService()
            session = service.open_session(
                library_id,
                periyot_kodu,
                date.fromisoformat(data['tarih']),
                user_id
            )
            return JsonResponse({
                'success': True,
                'data': _serialize_attendance_session(session),
                'message': 'Yoklama oturumu açıldı'
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_attendance_session_detail(request, library_id, pk):
    """Yoklama oturumu detay ve kayıtlar"""
    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method == 'GET':
        service = AttendanceService()
        detail = service.get_session_detail(pk)
        if not detail:
            return JsonResponse({'success': False, 'error': 'Oturum bulunamadı'}, status=404)
        return JsonResponse({
            'success': True,
            'data': {
                'session': _serialize_attendance_session(detail['session']),
                'records': [_serialize_attendance_record(r) for r in detail['records']]
            }
        })
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_attendance_close(request, library_id, pk):
    """Yoklama oturumu kapat"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    try:
        user_id = _get_user_id(request)
        service = AttendanceService()
        session = service.close_session(pk, user_id)
        return JsonResponse({
            'success': True,
            'data': _serialize_attendance_session(session),
            'message': 'Oturum kapatıldı'
        })
    except (ValueError, Exception) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
def api_attendance_reopen(request, library_id, pk):
    """Kapatılmış yoklama oturumunu tekrar aç"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    try:
        user_id = _get_user_id(request)
        service = AttendanceService()
        session = service.reopen_session(pk, user_id)
        return JsonResponse({
            'success': True,
            'data': _serialize_attendance_session(session),
            'message': 'Oturum tekrar açıldı'
        })
    except (ValueError, Exception) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
def api_attendance_records(request, library_id, session_id):
    """Yoklama kayıtları kaydet"""
    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method == 'GET':
        records = AttendanceRepository.get_records(session_id)
        return JsonResponse({
            'success': True,
            'data': [_serialize_attendance_record(r) for r in records]
        })

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            user_id = _get_user_id(request)
            service = AttendanceService()
            result = service.record_attendance(session_id, data.get('records', []), user_id)
            records = result['records']
            saved_count = result['saved']
            return JsonResponse({
                'success': True,
                'data': {
                    'records': [_serialize_attendance_record(r) for r in records],
                    'saved': saved_count,
                    'pending_notifications': result.get('pending_notifications', []),
                },
                'message': f'{saved_count} öğrenci güncellendi'
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def _parse_ogrenci_ids_param(request) -> list[int] | None:
    raw = request.GET.get('ogrenci_ids') or request.GET.get('ogrenci_ids[]')
    if not raw:
        body_ids = None
        if request.method == 'POST' and request.body:
            try:
                payload = json.loads(request.body)
                body_ids = payload.get('ogrenci_ids')
            except (json.JSONDecodeError, TypeError):
                body_ids = None
        if body_ids:
            return [int(x) for x in body_ids]
        return None
    return [int(x.strip()) for x in str(raw).split(',') if x.strip()]


@csrf_exempt
def api_attendance_notify_status(request, library_id, session_id):
    """Oturum veli bildirim durumu."""
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    try:
        from apps.kutuphane.application.notification_service import AttendanceNotificationService

        service = AttendanceNotificationService()
        data = service.get_notification_status(session_id)
        return JsonResponse({'success': True, 'data': data})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
def api_attendance_notify_preview(request, library_id, session_id):
    """Veli bildirimi önizleme."""
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    _, library, err = _resolve_library(request, library_id)
    if err:
        return err

    event_type = request.GET.get('event', '').upper()
    if event_type not in ('ABSENT', 'LATE', 'EXIT'):
        return JsonResponse({'success': False, 'error': 'Geçersiz event parametresi'}, status=400)
    try:
        from apps.kutuphane.application.notification_service import AttendanceNotificationService

        service = AttendanceNotificationService()
        preview = service.preview(
            library.kurum_id,
            session_id,
            event_type,
            _parse_ogrenci_ids_param(request),
        )
        return JsonResponse({
            'success': True,
            'data': {
                'event_type': preview.event_type,
                'template_id': preview.template_id,
                'template_body': preview.template_body,
                'eligible_count': preview.eligible_count,
                'pending_count': preview.pending_count,
                'recipients': [
                    {
                        'ogrenci_id': r.ogrenci_id,
                        'ogrenci_ad': r.ogrenci_ad,
                        'veli_id': r.veli_id,
                        'veli_ad': r.veli_ad,
                        'telefon': r.telefon,
                        'body': r.body,
                        'skip_reason': r.skip_reason,
                    }
                    for r in preview.recipients
                ],
            },
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
def api_attendance_notify_send(request, library_id, session_id):
    """Veli bildirimi gönder."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    _, library, err = _resolve_library(request, library_id)
    if err:
        return err

    try:
        data = json.loads(request.body or '{}')
        event_type = str(data.get('event_type', '')).upper()
        if event_type not in ('ABSENT', 'LATE', 'EXIT'):
            return JsonResponse({'success': False, 'error': 'Geçersiz event_type'}, status=400)

        from apps.kutuphane.application.notification_service import AttendanceNotificationService

        user_id = _get_user_id(request)
        service = AttendanceNotificationService()
        result = service.send(
            library.kurum_id,
            session_id,
            event_type,
            ogrenci_ids=data.get('ogrenci_ids'),
            exclude_veli_ids=data.get('exclude_veli_ids'),
            sent_by_user_id=user_id,
            force_resend=bool(data.get('force_resend')),
        )
        return JsonResponse({
            'success': True,
            'data': {
                'sent': result.sent,
                'skipped': result.skipped,
                'errors': result.errors,
            },
            'message': f'{result.sent} bildirim gönderildi',
        })
    except (json.JSONDecodeError, TypeError, ValueError) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
def api_attendance_notify_config(request):
    """Kurum yoklama bildirim şablon ayarları."""
    kurum_id = getattr(request, 'active_kurum_id', None)
    if not kurum_id:
        kurum_id = request.GET.get('kurum_id') or (
            json.loads(request.body).get('kurum_id') if request.method == 'PATCH' and request.body else None
        )
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'kurum_id gerekli'}, status=400)
    kurum_id = int(kurum_id)

    from apps.kutuphane.application.notification_service import AttendanceNotificationService

    service = AttendanceNotificationService()

    if request.method == 'GET':
        config = service.get_config(kurum_id)
        return JsonResponse({'success': True, 'data': service.serialize_config(config)})

    if request.method in ('PUT', 'PATCH', 'POST'):
        try:
            data = json.loads(request.body or '{}')
            config = service.update_config(
                kurum_id,
                absent_template_id=data.get('absent_template_id'),
                late_template_id=data.get('late_template_id'),
                exit_template_id=data.get('exit_template_id'),
                is_active=data.get('is_active'),
            )
            return JsonResponse({
                'success': True,
                'data': service.serialize_config(config),
                'message': 'Ayarlar güncellendi',
            })
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


# ──────────────────────────────────────
# TEMPORARY SEATING
# ──────────────────────────────────────

@csrf_exempt
def api_temporary_seating_list_create(request, library_id):
    """Geçici oturma listele veya oluştur"""
    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method == 'GET':
        service = TemporarySeatingService()
        # Süresi dolanları otomatik expire yap
        service.expire_overdue(library_id)
        temps = service.list_active(library_id)
        return JsonResponse({
            'success': True,
            'data': [_serialize_temporary_seating(t) for t in temps]
        })

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            denied = require_kutuphane_operational_access(request, data.get('ogrenci_id'))
            if denied:
                return denied
            # Frontend mapping: masa_id → seat_id
            if 'masa_id' in data and 'seat_id' not in data:
                data['seat_id'] = data.pop('masa_id')
            # Frontend sure_dakika → beklenen_bitis_zamani hesapla
            if 'sure_dakika' in data and 'beklenen_bitis_zamani' not in data:
                sure_dk = int(data.pop('sure_dakika'))
                baslangic = timezone.now()
                data['baslangic_zamani'] = baslangic
                data['beklenen_bitis_zamani'] = baslangic + timedelta(minutes=sure_dk)
            if 'baslangic_zamani' in data and isinstance(data['baslangic_zamani'], str):
                data['baslangic_zamani'] = datetime.fromisoformat(data['baslangic_zamani'])
            if 'beklenen_bitis_zamani' in data and isinstance(data['beklenen_bitis_zamani'], str):
                data['beklenen_bitis_zamani'] = datetime.fromisoformat(data['beklenen_bitis_zamani'])
            user_id = _get_user_id(request)
            service = TemporarySeatingService()
            temp = service.create_temporary(library_id, data, user_id)
            return JsonResponse({
                'success': True,
                'data': _serialize_temporary_seating(temp),
                'message': 'Geçici oturma oluşturuldu'
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_temporary_seating_end(request, library_id, pk):
    """Geçici oturma sonlandır"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    try:
        user_id = _get_user_id(request)
        service = TemporarySeatingService()
        temp = service.end_temporary(pk, user_id)
        return JsonResponse({
            'success': True,
            'data': _serialize_temporary_seating(temp),
            'message': 'Geçici oturma sonlandırıldı'
        })
    except (ValueError, Exception) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


# ──────────────────────────────────────
# AUDIT LOGS
# ──────────────────────────────────────

def api_audit_logs(request, library_id):
    """Denetim logları"""
    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method == 'GET':
        logs = AuditLogRepository.get_by_entity('Library', library_id)
        # Ayrıca alt entity'lerin logları da dahil
        from apps.kutuphane.domain.models import LibraryAuditLog
        all_logs = LibraryAuditLog.objects.filter(
            entity_id=library_id
        ).union(
            LibraryAuditLog.objects.filter(
                description__icontains=str(library_id)
            )
        ).order_by('-performed_at')[:50]

        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': str(log.id),
                    'entity_type': log.entity_type,
                    'action': log.action,
                    'description': log.description,
                    'performed_by': log.performed_by,
                    'performed_at': log.performed_at.isoformat() if log.performed_at else '',
                }
                for log in logs[:50]
            ]
        })
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


# ──────────────────────────────────────
# KAPASİTE & ANALİTİK
# ──────────────────────────────────────

def api_analytics(request, library_id):
    """Salon bazlı analitik verileri"""
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    _, library, err = _resolve_library(request, library_id)
    if err:
        return err

    now = timezone.now()
    baslangic_str = request.GET.get('baslangic')
    bitis_str = request.GET.get('bitis')

    if baslangic_str:
        baslangic = date.fromisoformat(baslangic_str)
    else:
        baslangic = (now - timedelta(days=30)).date()

    if bitis_str:
        bitis = date.fromisoformat(bitis_str)
    else:
        bitis = now.date()

    # Masa tipi dağılımı
    masa_tipi_qs = Seat.objects.filter(
        library_id=library_id, is_deleted=False
    ).values('masa_tipi').annotate(sayi=Count('id'))
    masa_tipi_dagilimi = [{'tip': item['masa_tipi'], 'sayi': item['sayi']} for item in masa_tipi_qs]

    # Atama istatistikleri
    toplam_atama = SeatAssignment.objects.filter(library_id=library_id).count()
    aktif_atama = SeatAssignment.objects.filter(
        library_id=library_id, durum=AssignmentStatus.ACTIVE
    ).count()
    sonlanan_atama = SeatAssignment.objects.filter(
        library_id=library_id, durum=AssignmentStatus.ENDED
    ).count()

    ortalama_sure = 0
    sonlanan = SeatAssignment.objects.filter(
        library_id=library_id,
        durum=AssignmentStatus.ENDED,
        sonlanma_tarihi__isnull=False
    )
    if sonlanan.exists():
        toplam_gun = 0
        count = 0
        for a in sonlanan:
            if a.sonlanma_tarihi and a.baslangic_tarihi:
                gun = (a.sonlanma_tarihi.date() - a.baslangic_tarihi).days
                toplam_gun += gun
                count += 1
        if count > 0:
            ortalama_sure = round(toplam_gun / count, 1)

    # Yoklama özeti
    yoklama_oturumlari = AttendanceSession.objects.filter(
        library_id=library_id,
        tarih__gte=baslangic,
        tarih__lte=bitis
    )
    toplam_oturum = yoklama_oturumlari.count()

    ortalama_katilim = 0
    if toplam_oturum > 0:
        total_present = AttendanceRecord.objects.filter(
            attendance_session__library_id=library_id,
            attendance_session__tarih__gte=baslangic,
            attendance_session__tarih__lte=bitis,
            durum__in=['PRESENT', 'LATE']
        ).count()
        total_records = AttendanceRecord.objects.filter(
            attendance_session__library_id=library_id,
            attendance_session__tarih__gte=baslangic,
            attendance_session__tarih__lte=bitis,
        ).count()
        if total_records > 0:
            ortalama_katilim = round(total_present / total_records * 100, 1)

    en_iyi_gun = ''
    en_iyi_gun_qs = yoklama_oturumlari.values('tarih').annotate(
        katilim=Count(
            'kayitlar',
            filter=Q(kayitlar__durum__in=['PRESENT', 'LATE'])
        )
    ).order_by('-katilim').first()
    if en_iyi_gun_qs:
        en_iyi_gun = en_iyi_gun_qs['tarih'].isoformat()

    # Geçici oturma özeti
    gecici_toplam = TemporarySeating.objects.filter(
        library_id=library_id,
        created_at__date__gte=baslangic,
        created_at__date__lte=bitis
    ).count()
    gecici_aktif = TemporarySeating.objects.filter(
        library_id=library_id,
        durum=TemporarySeatingStatus.ACTIVE
    ).count()

    ort_gecici_dk = 0
    gecici_biten = TemporarySeating.objects.filter(
        library_id=library_id,
        durum__in=[TemporarySeatingStatus.ENDED, TemporarySeatingStatus.EXPIRED],
        gercek_bitis_zamani__isnull=False
    )
    if gecici_biten.exists():
        toplam_dk = 0
        cnt = 0
        for g in gecici_biten:
            if g.gercek_bitis_zamani and g.baslangic_zamani:
                dk = (g.gercek_bitis_zamani - g.baslangic_zamani).total_seconds() / 60
                toplam_dk += dk
                cnt += 1
        if cnt > 0:
            ort_gecici_dk = round(toplam_dk / cnt, 1)

    # Doluluk trend
    doluluk_trend = []
    current = baslangic
    while current <= bitis:
        gun_oturumlari = yoklama_oturumlari.filter(tarih=current)
        gun_present = AttendanceRecord.objects.filter(
            attendance_session__in=gun_oturumlari,
            durum__in=['PRESENT', 'LATE']
        ).count()
        gun_total = AttendanceRecord.objects.filter(
            attendance_session__in=gun_oturumlari
        ).count()
        oran = round(gun_present / gun_total * 100, 1) if gun_total > 0 else 0
        doluluk_trend.append({'tarih': current.isoformat(), 'oran': oran})
        current += timedelta(days=1)

    status_counts = SeatRepository.get_status_counts(library_id)
    toplam_masa = sum(status_counts.values())
    dolu_masa = status_counts.get(SeatStatus.OCCUPIED, 0)
    gunluk_ort = round(dolu_masa / toplam_masa * 100, 1) if toplam_masa > 0 else 0

    return JsonResponse({
        'success': True,
        'data': {
            'salon_id': str(library_id),
            'salon_adi': library.ad,
            'tarih_araligi': {
                'baslangic': baslangic.isoformat(),
                'bitis': bitis.isoformat()
            },
            'doluluk_trend': doluluk_trend,
            'gunluk_ortalama_doluluk': gunluk_ort,
            'en_yogun_saatler': [],
            'masa_tipi_dagilimi': masa_tipi_dagilimi,
            'atama_istatistikleri': {
                'toplam_atama': toplam_atama,
                'aktif_atama': aktif_atama,
                'sonlanan_atama': sonlanan_atama,
                'ortalama_sure_gun': ortalama_sure,
            },
            'yoklama_ozeti': {
                'toplam_oturum': toplam_oturum,
                'ortalama_katilim': ortalama_katilim,
                'en_iyi_katilim_gunu': en_iyi_gun,
            },
            'gecici_oturma_ozeti': {
                'toplam': gecici_toplam,
                'aktif': gecici_aktif,
                'ortalama_sure_dakika': ort_gecici_dk,
            },
        }
    })


def api_global_analytics(request):
    """Şube geneli analitik (aktif şubedeki salonlar)"""
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    ctx, err = _mandatory_ctx(request)
    if err:
        return err

    now = timezone.now()
    baslangic_str = request.GET.get('baslangic')
    bitis_str = request.GET.get('bitis')
    if baslangic_str:
        baslangic = date.fromisoformat(baslangic_str)
    else:
        baslangic = (now - timedelta(days=30)).date()
    if bitis_str:
        bitis = date.fromisoformat(bitis_str)
    else:
        bitis = now.date()

    libraries = LibraryRepository.get_with_stats(ctx['kurum_id'], ctx['sube_id'])
    toplam_masa = sum(getattr(l, 'toplam_masa', 0) for l in libraries)
    dolu_masa = sum(getattr(l, 'dolu_masa', 0) for l in libraries)
    bos_masa = sum(getattr(l, 'bos_masa', 0) for l in libraries)
    toplam_dolap = Locker.objects.filter(
        kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'], is_deleted=False,
    ).count()
    atanmis_dolap = Locker.objects.filter(
        kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'], is_deleted=False,
        durum=LockerStatus.ASSIGNED,
    ).count()

    aktif_ogrenci = SeatAssignment.objects.filter(
        library__kurum_id=ctx['kurum_id'],
        library__sube_id=ctx['sube_id'],
        library__is_deleted=False,
        durum=AssignmentStatus.ACTIVE
    ).values('ogrenci_id').distinct().count()

    gecici = TemporarySeating.objects.filter(
        library__kurum_id=ctx['kurum_id'],
        library__sube_id=ctx['sube_id'],
        library__is_deleted=False,
        durum=TemporarySeatingStatus.ACTIVE
    ).count()

    # Yoklama istatistikleri (şube geneli)
    yoklama_base = AttendanceRecord.objects.filter(
        attendance_session__library__kurum_id=ctx['kurum_id'],
        attendance_session__library__sube_id=ctx['sube_id'],
        attendance_session__library__is_deleted=False,
        attendance_session__tarih__gte=baslangic,
        attendance_session__tarih__lte=bitis,
    )
    toplam_yoklama_kayit = yoklama_base.count()
    var_sayisi = yoklama_base.filter(durum__in=['PRESENT', 'LATE']).count()
    gec_sayisi = yoklama_base.filter(durum='LATE').count()
    yok_sayisi = yoklama_base.filter(durum='ABSENT').count()
    izinli_sayisi = yoklama_base.filter(durum='EXEMPT').count()
    toplam_oturum = AttendanceSession.objects.filter(
        library__kurum_id=ctx['kurum_id'],
        library__sube_id=ctx['sube_id'],
        library__is_deleted=False,
        tarih__gte=baslangic,
        tarih__lte=bitis,
    ).count()
    katilim_orani = round(var_sayisi / toplam_yoklama_kayit * 100, 1) if toplam_yoklama_kayit > 0 else 0

    # Durum dağılımı
    durum_dagilimi = []
    if toplam_yoklama_kayit > 0:
        durum_dagilimi = [
            {'durum': 'VAR', 'sayi': var_sayisi - gec_sayisi, 'renk': '#10b981'},
            {'durum': 'GEÇ', 'sayi': gec_sayisi, 'renk': '#f59e0b'},
            {'durum': 'YOK', 'sayi': yok_sayisi, 'renk': '#ef4444'},
            {'durum': 'İZİNLİ', 'sayi': izinli_sayisi, 'renk': '#6366f1'},
        ]

    # Günlük katılım trendi (son N gün)
    gunluk_trend = []
    current = baslangic
    while current <= bitis:
        gun_records = yoklama_base.filter(attendance_session__tarih=current)
        gun_total = gun_records.count()
        gun_var = gun_records.filter(durum__in=['PRESENT', 'LATE']).count()
        gun_gec = gun_records.filter(durum='LATE').count()
        if gun_total > 0:
            gunluk_trend.append({
                'tarih': current.isoformat(),
                'katilim': round(gun_var / gun_total * 100, 1),
                'toplam': gun_total,
                'var': gun_var,
                'gec': gun_gec,
            })
        current += timedelta(days=1)

    # Salon karşılaştırma (yoklama dahil)
    salon_ozet = []
    for lib in libraries:
        t_masa = getattr(lib, 'toplam_masa', 0)
        d_masa = getattr(lib, 'dolu_masa', 0)
        lib_aktif = SeatAssignment.objects.filter(
            library_id=lib.id, durum=AssignmentStatus.ACTIVE
        ).count()
        lib_yoklama = AttendanceRecord.objects.filter(
            attendance_session__library_id=lib.id,
            attendance_session__tarih__gte=baslangic,
            attendance_session__tarih__lte=bitis,
        )
        lib_total_rec = lib_yoklama.count()
        lib_var = lib_yoklama.filter(durum__in=['PRESENT', 'LATE']).count()
        lib_katilim = round(lib_var / lib_total_rec * 100, 1) if lib_total_rec > 0 else 0
        lib_oturum = AttendanceSession.objects.filter(
            library_id=lib.id, tarih__gte=baslangic, tarih__lte=bitis
        ).count()
        salon_ozet.append({
            'id': str(lib.id),
            'ad': lib.ad,
            'kod': lib.kod,
            'durum': lib.durum,
            'kapasite': lib.kapasite,
            'toplam_masa': t_masa,
            'dolu_masa': d_masa,
            'bos_masa': getattr(lib, 'bos_masa', 0),
            'aktif_atama': lib_aktif,
            'toplam_dolap': getattr(lib, 'toplam_dolap', 0),
            'atanmis_dolap': getattr(lib, 'atanmis_dolap', 0),
            'doluluk_yuzde': round(d_masa / t_masa * 100, 1) if t_masa > 0 else 0,
            'katilim_orani': lib_katilim,
            'toplam_oturum': lib_oturum,
        })

    # Masa tipi dağılımı (şube geneli)
    masa_tipi_qs = Seat.objects.filter(
        library__kurum_id=ctx['kurum_id'],
        library__sube_id=ctx['sube_id'],
        library__is_deleted=False,
        is_deleted=False
    ).values('masa_tipi').annotate(sayi=Count('id'))
    masa_tipi_dagilimi = [{'tip': item['masa_tipi'], 'sayi': item['sayi']} for item in masa_tipi_qs]

    # Atama istatistikleri (şube geneli)
    toplam_atama = SeatAssignment.objects.filter(
        library__kurum_id=ctx['kurum_id'],
        library__sube_id=ctx['sube_id'],
        library__is_deleted=False
    ).count()
    aktif_atama = SeatAssignment.objects.filter(
        library__kurum_id=ctx['kurum_id'],
        library__sube_id=ctx['sube_id'],
        library__is_deleted=False,
        durum=AssignmentStatus.ACTIVE
    ).count()
    sonlanan_atama = SeatAssignment.objects.filter(
        library__kurum_id=ctx['kurum_id'],
        library__sube_id=ctx['sube_id'],
        library__is_deleted=False,
        durum=AssignmentStatus.ENDED
    ).count()

    return JsonResponse({
        'success': True,
        'data': {
            'toplam_salon': libraries.count(),
            'toplam_masa': toplam_masa,
            'dolu_masa': dolu_masa,
            'bos_masa': bos_masa,
            'doluluk_yuzde': round(dolu_masa / toplam_masa * 100, 1) if toplam_masa > 0 else 0,
            'toplam_dolap': toplam_dolap,
            'atanmis_dolap': atanmis_dolap,
            'aktif_ogrenci': aktif_ogrenci,
            'gecici_oturma': gecici,
            'tarih_araligi': {
                'baslangic': baslangic.isoformat(),
                'bitis': bitis.isoformat()
            },
            'yoklama': {
                'toplam_oturum': toplam_oturum,
                'toplam_kayit': toplam_yoklama_kayit,
                'katilim_orani': katilim_orani,
                'var_sayisi': var_sayisi,
                'gec_sayisi': gec_sayisi,
                'yok_sayisi': yok_sayisi,
                'izinli_sayisi': izinli_sayisi,
                'durum_dagilimi': durum_dagilimi,
                'gunluk_trend': gunluk_trend,
            },
            'atama': {
                'toplam': toplam_atama,
                'aktif': aktif_atama,
                'sonlanan': sonlanan_atama,
            },
            'masa_tipi_dagilimi': masa_tipi_dagilimi,
            'salonlar': salon_ozet,
        }
    })


# ══════════════════════════════════════════════
# ŞUBE DERS PROGRAMI
# ══════════════════════════════════════════════

def _serialize_ders_programi(program):
    """Ders programını serialize eder"""
    sube_adi = ''
    try:
        from apps.sube.domain.models import Sube
        sube = Sube.objects.filter(id=program.sube_id).values('ad').first()
        if sube:
            sube_adi = sube['ad']
    except Exception:
        pass

    return {
        'id': str(program.id),
        'sube_id': program.sube_id,
        'sube_adi': sube_adi,
        'kurum_id': program.kurum_id,
        'ad': program.ad,
        'ders_saatleri': program.ders_saatleri,
        'gun_bazli_aktiflik': program.gun_bazli_aktiflik,
        'aktif_mi': program.aktif_mi,
        'created_at': program.created_at.isoformat() if program.created_at else '',
        'updated_at': program.updated_at.isoformat() if program.updated_at else '',
    }


@csrf_exempt
def api_ders_programi_list_create(request):
    """
    GET  /kutuphane/api/ders-programi/ — Tüm aktif ders programlarını listele
    POST /kutuphane/api/ders-programi/ — Yeni ders programı oluştur
    Opsiyonel query: ?sube_id=X
    """
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum ID gerekli'}, status=400)

    if request.method == 'GET':
        sube_id = request.GET.get('sube_id')
        if sube_id:
            program = SubeDersProgramiRepository.get_by_sube(int(sube_id))
            if program:
                return JsonResponse({'success': True, 'data': _serialize_ders_programi(program)})
            return JsonResponse({'success': True, 'data': None})
        else:
            programs = SubeDersProgramiRepository.get_aktif(kurum_id)
            return JsonResponse({
                'success': True,
                'data': [_serialize_ders_programi(p) for p in programs]
            })

    elif request.method == 'POST':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            body = json.loads(request.body)
            service = SubeDersProgramiService()

            data = {
                'sube_id': body['sube_id'],
                'kurum_id': kurum_id,
                'ad': body.get('ad', 'Varsayılan Program'),
                'ders_saatleri': body.get('ders_saatleri', {}),
                'gun_bazli_aktiflik': body.get('gun_bazli_aktiflik', {}),
                'aktif_mi': body.get('aktif_mi', True),
            }

            program = service.create_program(data, _get_user_id(request))
            return JsonResponse({
                'success': True,
                'data': _serialize_ders_programi(program)
            }, status=201)
        except (KeyError, ValueError) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_ders_programi_export(request):
    """
    POST /kutuphane/api/ders-programi/export/
    Haftalık çalışma saatleri (ders programı) — kurumsal CSV/Excel dışa aktarma.
    Frontend, ekrandaki pivot tabloyu ({columns, rows}) hesaplayıp gönderir;
    bu uç yalnızca kurumsal şablonla (logo, kurum/şube başlığı) dosyayı üretir.
    Body: { columns: [{key, label}], rows: [{...}], meta: {program_ad, sube_id?, sube_adi?, aktif_gun?, toplam_periyot?, toplam_ders?}, format: 'csv'|'xlsx' }
    """
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum ID gerekli'}, status=400)

    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON formatı.'}, status=400)

    raw_columns = body.get('columns') or []
    raw_rows = body.get('rows') or []
    meta_in = body.get('meta') or {}
    fmt = (body.get('format') or 'xlsx').lower()

    if not raw_columns or not raw_rows:
        return JsonResponse({'success': False, 'error': 'Dışa aktarılacak veri yok.'}, status=400)

    from shared.export.style_manager import ExportColumn, ExportStat, ReportMeta

    columns = [
        ExportColumn(key=c.get('key'), label=c.get('label') or c.get('key'), type='text')
        for c in raw_columns if c.get('key')
    ]

    user = getattr(request, 'user', None)
    generated_by = ''
    if user and getattr(user, 'is_authenticated', False):
        generated_by = user.get_full_name() or user.get_username()

    program_ad = (meta_in.get('program_ad') or 'Ders Programı').strip()
    sube_id = meta_in.get('sube_id')
    sube_adi = _get_sube_adi(sube_id) if sube_id else (meta_in.get('sube_adi') or '')

    meta = ReportMeta(
        report_title=f'{program_ad} — HAFTALIK ÇALIŞMA SAATLERİ',
        kurum_ad=_get_kurum_adi(kurum_id),
        sube_ad=sube_adi,
        generated_by=generated_by,
    )

    stats = [
        ExportStat(label='Aktif Gün', value=meta_in.get('aktif_gun') or 0, type='integer'),
        ExportStat(label='Haftalık Oturum', value=meta_in.get('toplam_periyot') or 0, type='integer'),
        ExportStat(label='Toplam Etüt', value=meta_in.get('toplam_ders') or 0, type='integer'),
    ]
    stats = [s for s in stats if s.value]

    filename = f"ders_programi_{program_ad.replace(' ', '_')}"

    if fmt == 'csv':
        from shared.export import CsvExportService
        return CsvExportService.export(raw_rows, columns, meta=meta, filename=filename)

    from shared.export import ExcelExportService
    return ExcelExportService.export(raw_rows, columns, meta=meta, stats=stats, filename=filename)


@csrf_exempt
def api_ders_programi_detail(request, pk):
    """
    GET    /kutuphane/api/ders-programi/<pk>/ — Detay
    PUT    /kutuphane/api/ders-programi/<pk>/ — Güncelle
    DELETE /kutuphane/api/ders-programi/<pk>/ — Sil
    """
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum ID gerekli'}, status=400)

    if request.method == 'GET':
        program = SubeDersProgramiRepository.get_by_id(pk)
        if not program:
            return JsonResponse({'success': False, 'error': 'Program bulunamadı'}, status=404)
        return JsonResponse({'success': True, 'data': _serialize_ders_programi(program)})

    elif request.method == 'PUT':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            body = json.loads(request.body)
            service = SubeDersProgramiService()

            data = {}
            if 'ad' in body:
                data['ad'] = body['ad']
            if 'ders_saatleri' in body:
                data['ders_saatleri'] = body['ders_saatleri']
            if 'gun_bazli_aktiflik' in body:
                data['gun_bazli_aktiflik'] = body['gun_bazli_aktiflik']
            if 'aktif_mi' in body:
                data['aktif_mi'] = body['aktif_mi']

            program = service.update_program(pk, data, _get_user_id(request))
            if not program:
                return JsonResponse({'success': False, 'error': 'Program bulunamadı'}, status=404)
            return JsonResponse({'success': True, 'data': _serialize_ders_programi(program)})
        except ValueError as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        denied = require_infra_admin(request)
        if denied:
            return denied
        try:
            service = SubeDersProgramiService()
            service.delete_program(pk, _get_user_id(request))
            return JsonResponse({'success': True, 'message': 'Program silindi'})
        except ValueError as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_subeler_with_program(request):
    """
    GET /kutuphane/api/subeler/ — Tüm şubeleri listeler (programı olan/olmayan)
    """
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum ID gerekli'}, status=400)

    try:
        from apps.sube.domain.models import Sube
        subeler = Sube.objects.filter(kurum_id=kurum_id, aktif_mi=True).values('id', 'ad', 'kod')
        program_sube_ids = set(SubeDersProgramiRepository.get_subeler_with_program(kurum_id))

        data = []
        for s in subeler:
            data.append({
                'id': s['id'],
                'ad': s['ad'],
                'kod': s['kod'],
                'program_var': s['id'] in program_sube_ids,
            })

        return JsonResponse({'success': True, 'data': data})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ══════════════════════════════════════════════
# ÖĞRENCİ İZİN YÖNETİMİ
# ══════════════════════════════════════════════

def _serialize_izin(izin):
    """İzni serialize eder"""
    return {
        'id': str(izin.id),
        'ogrenci_id': izin.ogrenci_id,
        'ogrenci_adi': _get_ogrenci_adi(izin.ogrenci_id),
        'kurum_id': izin.kurum_id,
        'library_id': str(izin.library_id) if izin.library_id else None,
        'library_adi': izin.library.ad if izin.library else None,
        'izin_tipi': izin.izin_tipi,
        'gun': izin.gun,
        'gun_adi': izin.get_gun_display(),
        'periyot_kodu': izin.periyot_kodu,
        'periyot_adi': izin.get_periyot_kodu_display() if izin.periyot_kodu else None,
        'baslangic_tarihi': izin.baslangic_tarihi if isinstance(izin.baslangic_tarihi, str) else (izin.baslangic_tarihi.isoformat() if izin.baslangic_tarihi else None),
        'bitis_tarihi': izin.bitis_tarihi if isinstance(izin.bitis_tarihi, str) else (izin.bitis_tarihi.isoformat() if izin.bitis_tarihi else None),
        'sebep': izin.sebep,
        'aktif_mi': izin.aktif_mi,
        'created_at': izin.created_at.isoformat() if izin.created_at else '',
    }


@csrf_exempt
def api_ogrenci_izin_list_create(request):
    """
    GET  /kutuphane/api/izinler/ — İzinleri listele
         Opsiyonel query: ?ogrenci_id=X &library_id=Y
    POST /kutuphane/api/izinler/ — Yeni izin oluştur
    """
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum ID gerekli'}, status=400)

    if request.method == 'GET':
        ogrenci_id = request.GET.get('ogrenci_id')
        library_id = request.GET.get('library_id')

        service = OgrenciIzinService()
        izinler = service.list_izinler(
            kurum_id,
            ogrenci_id=int(ogrenci_id) if ogrenci_id else None,
            library_id=library_id
        )
        return JsonResponse({
            'success': True,
            'data': [_serialize_izin(i) for i in izinler]
        })

    elif request.method == 'POST':
        try:
            body = json.loads(request.body)
            service = OgrenciIzinService()

            # Toplu oluşturma desteği
            if 'izinler' in body:
                # Toplu izin oluşturma
                izinler_data = []
                for izin_item in body['izinler']:
                    denied = require_kutuphane_operational_access(request, izin_item.get('ogrenci_id'))
                    if denied:
                        return denied
                    baslangic_str = izin_item.get('baslangic_tarihi')
                    bitis_str = izin_item.get('bitis_tarihi')
                    izinler_data.append({
                        'ogrenci_id': izin_item['ogrenci_id'],
                        'kurum_id': kurum_id,
                        'library_id': izin_item.get('library_id'),
                        'izin_tipi': izin_item.get('izin_tipi', 'PERIOD'),
                        'gun': izin_item['gun'],
                        'periyot_kodu': izin_item.get('periyot_kodu'),
                        'baslangic_tarihi': date.fromisoformat(baslangic_str) if baslangic_str else date.today(),
                        'bitis_tarihi': date.fromisoformat(bitis_str) if bitis_str else None,
                        'sebep': izin_item.get('sebep', ''),
                    })
                izinler = service.bulk_create_izinler(izinler_data, _get_user_id(request))
                return JsonResponse({
                    'success': True,
                    'data': [_serialize_izin(i) for i in izinler],
                    'message': f'{len(izinler)} izin oluşturuldu'
                }, status=201)
            else:
                # Tekli izin oluşturma
                denied = require_kutuphane_operational_access(request, body.get('ogrenci_id'))
                if denied:
                    return denied
                baslangic_str = body.get('baslangic_tarihi')
                bitis_str = body.get('bitis_tarihi')
                data = {
                    'ogrenci_id': body['ogrenci_id'],
                    'kurum_id': kurum_id,
                    'library_id': body.get('library_id'),
                    'izin_tipi': body.get('izin_tipi', 'PERIOD'),
                    'gun': body['gun'],
                    'periyot_kodu': body.get('periyot_kodu'),
                    'baslangic_tarihi': date.fromisoformat(baslangic_str) if baslangic_str else date.today(),
                    'bitis_tarihi': date.fromisoformat(bitis_str) if bitis_str else None,
                    'sebep': body.get('sebep', ''),
                }
                izin = service.create_izin(data, _get_user_id(request))
                return JsonResponse({
                    'success': True,
                    'data': _serialize_izin(izin)
                }, status=201)
        except (KeyError, ValueError) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'success': False, 'error': f'Sunucu hatası: {str(e)}'}, status=500)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_ogrenci_izin_detail(request, pk):
    """
    GET    /kutuphane/api/izinler/<pk>/ — İzin detayı
    PUT    /kutuphane/api/izinler/<pk>/ — İzin güncelle
    DELETE /kutuphane/api/izinler/<pk>/ — İzin sil
    """
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum ID gerekli'}, status=400)

    if request.method == 'GET':
        izin = OgrenciIzinRepository.get_by_id(pk)
        if not izin:
            return JsonResponse({'success': False, 'error': 'İzin bulunamadı'}, status=404)
        denied = require_kutuphane_operational_access(request, izin.ogrenci_id)
        if denied:
            return denied
        return JsonResponse({'success': True, 'data': _serialize_izin(izin)})

    elif request.method == 'PUT':
        try:
            izin = OgrenciIzinRepository.get_by_id(pk)
            if not izin:
                return JsonResponse({'success': False, 'error': 'İzin bulunamadı'}, status=404)
            denied = require_kutuphane_operational_access(request, izin.ogrenci_id)
            if denied:
                return denied
            body = json.loads(request.body)
            service = OgrenciIzinService()

            data = {}
            for field in ['izin_tipi', 'gun', 'periyot_kodu', 'baslangic_tarihi',
                          'bitis_tarihi', 'sebep', 'aktif_mi', 'library_id']:
                if field in body:
                    data[field] = body[field]

            izin = service.update_izin(pk, data, _get_user_id(request))
            if not izin:
                return JsonResponse({'success': False, 'error': 'İzin bulunamadı'}, status=404)
            return JsonResponse({'success': True, 'data': _serialize_izin(izin)})
        except ValueError as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'success': False, 'error': f'Sunucu hatası: {str(e)}'}, status=500)

    elif request.method == 'DELETE':
        try:
            izin = OgrenciIzinRepository.get_by_id(pk)
            if not izin:
                return JsonResponse({'success': False, 'error': 'İzin bulunamadı'}, status=404)
            denied = require_kutuphane_operational_access(request, izin.ogrenci_id)
            if denied:
                return denied
            service = OgrenciIzinService()
            service.delete_izin(pk, _get_user_id(request))
            return JsonResponse({'success': True, 'message': 'İzin silindi'})
        except ValueError as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'success': False, 'error': f'Sunucu hatası: {str(e)}'}, status=500)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_ogrenci_izin_replace(request):
    """
    POST /kutuphane/api/izinler/degistir/ — Öğrencinin tüm izinlerini değiştir
    Body: { ogrenci_id: int, izinler: [...] }
    """
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum ID gerekli'}, status=400)

    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    try:
        body = json.loads(request.body)
        ogrenci_id = body['ogrenci_id']
        denied = require_kutuphane_operational_access(request, ogrenci_id)
        if denied:
            return denied
        izinler_raw = body.get('izinler', [])

        service = OgrenciIzinService()
        izinler_data = []
        for item in izinler_raw:
            baslangic_str = item.get('baslangic_tarihi')
            bitis_str = item.get('bitis_tarihi')
            izinler_data.append({
                'ogrenci_id': ogrenci_id,
                'kurum_id': kurum_id,
                'library_id': item.get('library_id'),
                'izin_tipi': item.get('izin_tipi', 'PERIOD'),
                'gun': item['gun'],
                'periyot_kodu': item.get('periyot_kodu'),
                'baslangic_tarihi': date.fromisoformat(baslangic_str) if baslangic_str else date.today(),
                'bitis_tarihi': date.fromisoformat(bitis_str) if bitis_str else None,
                'sebep': item.get('sebep', ''),
            })

        izinler = service.replace_student_izinler(
            ogrenci_id, kurum_id, izinler_data, _get_user_id(request)
        )
        return JsonResponse({
            'success': True,
            'data': [_serialize_izin(i) for i in izinler],
            'message': f'{len(izinler)} izin kaydedildi'
        })
    except (KeyError, ValueError) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': f'Sunucu hatası: {str(e)}'}, status=500)


# ══════════════════════════════════════════════
# GELİŞMİŞ YOKLAMA (DERS BAZLI)
# ══════════════════════════════════════════════

@csrf_exempt
def api_attendance_open_lessons(request, library_id):
    """
    POST /kutuphane/api/salon/<library_id>/yoklama/ders-bazli-ac/
    Bir periyodun tüm derslerini tek seferde yoklama oturumu olarak açar.
        Body: { periyot_kodu, tarih, sube_id }
    """
    ctx, _, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    try:
        body = json.loads(request.body)
        service = AttendanceService()

        tarih_str = body.get('tarih', date.today().isoformat())
        tarih_obj = date.fromisoformat(tarih_str)

        periyot_kodu = body.get('periyot_kodu')
        if not periyot_kodu:
            return JsonResponse({'success': False, 'error': 'periyot_kodu gerekli'}, status=400)

        sessions = service.open_all_lesson_sessions(
            library_id=library_id,
            periyot_kodu=periyot_kodu,
            tarih=tarih_obj,
            sube_id=body.get('sube_id', ctx['sube_id']),
            user_id=_get_user_id(request)
        )

        return JsonResponse({
            'success': True,
            'data': [_serialize_attendance_session(s) for s in sessions],
            'message': f'{len(sessions)} ders yoklaması açıldı'
        }, status=201)
    except (KeyError, ValueError) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)




@csrf_exempt
def api_attendance_sheet_data(request, library_id):
    """
    GET /kutuphane/api/salon/<library_id>/yoklama-kagidi/
    Yoklama kağıdı verilerini döndürür (PDF export için).
    Query: ?tarih=YYYY-MM-DD &periyot_kodu=MORNING (opsiyonel)
    """
    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    try:
        tarih_str = request.GET.get('tarih', date.today().isoformat())
        tarih_obj = date.fromisoformat(tarih_str)
        periyot_kodu = request.GET.get('periyot_kodu')

        service = AttendanceService()
        sheet_data = service.get_attendance_sheet_data(
            library_id=library_id,
            tarih=tarih_obj,
            periyot_kodu=periyot_kodu
        )

        PERIYOT_LABELS = {
            'MORNING': 'Sabah',
            'AFTERNOON': 'Öğleden Sonra',
            'EVENING': 'Akşam',
            'CUSTOM': 'Özel',
        }

        # Serialize session columns
        session_columns = []
        for s in sheet_data.get('sessions', []):
            col_label = PERIYOT_LABELS.get(s.periyot_kodu, s.periyot_kodu)
            if s.ders_no:
                col_label += f' - {s.ders_no}. Ders'
            session_columns.append({
                'id': str(s.id),
                'label': col_label,
                'periyot': s.periyot_kodu,
                'ders_no': s.ders_no,
                'durum': s.durum,
            })

        return JsonResponse({
            'success': True,
            'data': {
                'salon_adi': sheet_data['library'].ad if sheet_data.get('library') else '',
                'tarih': tarih_str,
                'columns': session_columns,
                'students': sheet_data.get('students', []),
            }
        })
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


_ATTENDANCE_STATUS_LABELS = ['Var', 'Yok', 'Geç', 'İzinli', 'Masada Değil']


def _get_kurum_adi(kurum_id):
    try:
        from apps.kurum.domain.models import Kurum
        kurum = Kurum.objects.filter(id=kurum_id).values('ad').first()
        if kurum:
            return kurum['ad']
    except Exception:
        pass
    return ''


@csrf_exempt
def api_attendance_sheet_export(request, library_id):
    """
    POST /kutuphane/api/salon/<library_id>/yoklama-export/
    Yoklama kağıdı (günlük/haftalık pivot tablo) — kurumsal CSV/Excel dışa aktarma.
    Frontend, ekrandaki tabloyu (dinamik gün/periyot kolonları) zaten hesaplayıp
    {columns, rows} olarak gönderir; bu uç yalnızca kurumsal şablonla dosyayı üretir.
    Body: { columns: [{key, label}], rows: [{...}], meta: {tarih, mode}, format: 'csv'|'xlsx' }
    """
    ctx, library, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON formatı.'}, status=400)

    raw_columns = body.get('columns') or []
    raw_rows = body.get('rows') or []
    meta_in = body.get('meta') or {}
    fmt = (body.get('format') or 'xlsx').lower()

    if not raw_columns or not raw_rows:
        return JsonResponse({'success': False, 'error': 'Dışa aktarılacak veri yok.'}, status=400)

    from shared.export.style_manager import ExportColumn, ExportStat, ReportMeta

    columns = [
        ExportColumn(key=c.get('key'), label=c.get('label') or c.get('key'), type='text')
        for c in raw_columns if c.get('key')
    ]

    user = getattr(request, 'user', None)
    generated_by = ''
    if user and getattr(user, 'is_authenticated', False):
        generated_by = user.get_full_name() or user.get_username()

    tarih_label = meta_in.get('tarih') or ''
    mode_label = 'Haftalık' if meta_in.get('mode') == 'weekly' else 'Günlük'
    report_title = f'SALON YOKLAMA LİSTESİ — {tarih_label}' if tarih_label else 'SALON YOKLAMA LİSTESİ'

    sube_adi = _get_sube_adi(library.sube_id)
    sube_display = ' — '.join(p for p in [sube_adi, f'{library.ad} ({mode_label})'] if p)

    meta = ReportMeta(
        report_title=report_title,
        kurum_ad=_get_kurum_adi(library.kurum_id),
        sube_ad=sube_display,
        generated_by=generated_by,
    )

    status_counts = {label: 0 for label in _ATTENDANCE_STATUS_LABELS}
    for row in raw_rows:
        for value in row.values():
            if value in status_counts:
                status_counts[value] += 1

    stats = [ExportStat(label='Toplam Öğrenci', value=len(raw_rows), type='integer')]
    for label in _ATTENDANCE_STATUS_LABELS:
        if status_counts[label]:
            stats.append(ExportStat(label=label, value=status_counts[label], type='integer'))

    filename_tarih = (tarih_label or '').replace(' ', '_').replace('/', '-')
    filename = f"yoklama_{'haftalik' if meta_in.get('mode') == 'weekly' else 'gunluk'}_{filename_tarih or 'liste'}"

    if fmt == 'csv':
        from shared.export import CsvExportService
        return CsvExportService.export(raw_rows, columns, meta=meta, filename=filename)

    from shared.export import ExcelExportService
    return ExcelExportService.export(raw_rows, columns, meta=meta, stats=stats, filename=filename)


_SEAT_STATUS_LABELS = {
    'AVAILABLE': 'Müsait',
    'OCCUPIED': 'Dolu',
    'RESERVED': 'Rezerve',
    'OUT_OF_SERVICE': 'Hizmet Dışı',
}


@csrf_exempt
def api_seat_list_export(request, library_id):
    """
    POST /kutuphane/api/salon/<library_id>/masa-export/
    Salon oturma planı — kurumsal CSV/Excel dışa aktarma (shared.export şablonu).
    Body: { columns: [{key, label}], rows: [{...}], format: 'csv'|'xlsx' }
    """
    ctx, library, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON formatı.'}, status=400)

    raw_columns = body.get('columns') or []
    raw_rows = body.get('rows') or []
    fmt = (body.get('format') or 'xlsx').lower()

    if not raw_columns or not raw_rows:
        return JsonResponse({'success': False, 'error': 'Dışa aktarılacak veri yok.'}, status=400)

    from shared.export.style_manager import ExportColumn, ExportStat, ReportMeta

    columns = [
        ExportColumn(key=c.get('key'), label=c.get('label') or c.get('key'), type='text')
        for c in raw_columns if c.get('key')
    ]

    user = getattr(request, 'user', None)
    generated_by = ''
    if user and getattr(user, 'is_authenticated', False):
        generated_by = user.get_full_name() or user.get_username()

    sube_adi = _get_sube_adi(library.sube_id)
    meta = ReportMeta(
        report_title=f'{library.ad} — OTURMA PLANI',
        kurum_ad=_get_kurum_adi(library.kurum_id),
        sube_ad=sube_adi,
        generated_by=generated_by,
    )

    status_counts = {label: 0 for label in _SEAT_STATUS_LABELS.values()}
    assigned_count = 0
    for row in raw_rows:
        durum = row.get('durum') or ''
        if durum in status_counts:
            status_counts[durum] += 1
        if (row.get('ogrenci') or '').strip():
            assigned_count += 1

    stats = [
        ExportStat(label='Toplam Masa', value=len(raw_rows), type='integer'),
        ExportStat(label='Atanmış Öğrenci', value=assigned_count, type='integer'),
    ]
    for label in _SEAT_STATUS_LABELS.values():
        if status_counts[label]:
            stats.append(ExportStat(label=label, value=status_counts[label], type='integer'))

    filename = f"oturma_plani_{(library.ad or 'salon').replace(' ', '_')}"

    if fmt == 'csv':
        from shared.export import CsvExportService
        return CsvExportService.export(raw_rows, columns, meta=meta, filename=filename)

    from shared.export import ExcelExportService
    return ExcelExportService.export(raw_rows, columns, meta=meta, stats=stats, filename=filename)


@csrf_exempt
def api_attendance_weekly_summary(request, library_id):
    """
    GET /kutuphane/api/salon/<library_id>/yoklama-ozet/
    Haftalık yoklama özeti — yoklama kağıdı tablosu için.
    Query: ?baslangic=YYYY-MM-DD &bitis=YYYY-MM-DD
    """
    _, _, err = _resolve_library(request, library_id)
    if err:
        return err

    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    try:
        today = date.today()
        # Varsayılan: Bu haftanın Pazartesi-Pazar aralığı
        baslangic_str = request.GET.get('baslangic', (today - timedelta(days=today.weekday())).isoformat())
        bitis_str = request.GET.get('bitis', (today + timedelta(days=6 - today.weekday())).isoformat())

        baslangic = date.fromisoformat(baslangic_str)
        bitis = date.fromisoformat(bitis_str)

        sessions = AttendanceRepository.get_sessions_by_date_range(library_id, baslangic, bitis)

        # Gün bazlı grupla
        gunler = {}
        for session in sessions:
            tarih_key = session.tarih.isoformat()
            if tarih_key not in gunler:
                gunler[tarih_key] = {
                    'tarih': tarih_key,
                    'gun_adi': ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe',
                                'Cuma', 'Cumartesi', 'Pazar'][session.tarih.weekday()],
                    'oturumlar': []
                }
            gunler[tarih_key]['oturumlar'].append(_serialize_attendance_session(session))

        return JsonResponse({
            'success': True,
            'data': {
                'baslangic': baslangic_str,
                'bitis': bitis_str,
                'gunler': list(gunler.values()),
            }
        })
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)