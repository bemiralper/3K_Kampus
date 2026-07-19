"""
Koç portalı — öğrenci listesi ve profil BFF veri katmanı.
"""
from datetime import date

from django.db.models import Count, Max, Q

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.coaching.intelligence.services.risk_engine import RiskEngine
from apps.coaching.models import CoachStudentAssignment, GorusmeKaydi
from apps.coaching.services.coach_access import (
    get_coach_profile,
    is_resource_admin,
    scoped_student_ids,
)
from apps.coaching.study_program.models import WeeklyProgram
from apps.ogrenci.domain.models import Ogrenci, OgrenciAdres, OgrenciKayit, OgrenciVeli
from apps.student_resources.models import StudentResourceAssignment
from shared.context import get_secili_egitim_yili_id, get_secili_kurum_id


def get_coach_student_queryset(user, request, sube_id=None):
    """Koç veya admin kapsamındaki öğrenci queryset'i."""
    allowed = scoped_student_ids(user)
    qs = Ogrenci.objects.filter(aktif_mi=True)

    if allowed is None:
        kurum_id = get_secili_kurum_id(request)
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
    elif not allowed:
        return Ogrenci.objects.none()
    else:
        qs = qs.filter(id__in=allowed)

    if sube_id:
        qs = qs.filter(sube_id=sube_id)

    return qs.order_by('ad', 'soyad')


def _active_kayit_map(student_ids, request):
    """Öğrenci başına aktif kayıt (sınıf, okul no)."""
    egitim_yili_id = get_secili_egitim_yili_id(request)
    qs = OgrenciKayit.objects.filter(
        ogrenci_id__in=student_ids,
        aktif_mi=True,
    ).select_related('sinif')
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    kayit_map = {}
    for kayit in qs.order_by('-egitim_yili_id', '-id'):
        if kayit.ogrenci_id not in kayit_map:
            kayit_map[kayit.ogrenci_id] = kayit
    return kayit_map


def _last_meeting_map(student_ids):
    rows = (
        GorusmeKaydi.objects.filter(
            ogrenci_id__in=student_ids,
            durum='tamamlandi',
        )
        .values('ogrenci_id')
        .annotate(last_date=Max('gorusme_tarihi'))
    )
    return {r['ogrenci_id']: r['last_date'] for r in rows}


def _overdue_homework_map(student_ids):
    manual = (
        ManualAssignment.objects.filter(
            student_id__in=student_ids,
            status=ManualAssignment.Status.OVERDUE,
            is_active=True,
        )
        .values('student_id')
        .annotate(cnt=Count('id'))
    )
    resource = (
        StudentResourceAssignment.objects.filter(
            student_id__in=student_ids,
            status=StudentResourceAssignment.Status.OVERDUE,
            is_active=True,
        )
        .values('student_id')
        .annotate(cnt=Count('id'))
    )
    result = {}
    for row in manual:
        result[row['student_id']] = result.get(row['student_id'], 0) + row['cnt']
    for row in resource:
        result[row['student_id']] = result.get(row['student_id'], 0) + row['cnt']
    return result


def _risk_map(student_ids):
    """Best-effort risk skorları (intelligence RiskEngine)."""
    assignments = (
        CoachStudentAssignment.objects.filter(
            student_id__in=student_ids,
            end_date__isnull=True,
        )
        .select_related('student', 'coach', 'coach__teacher')
        .order_by('student_id', '-is_primary', '-start_date')
    )
    assignment_by_student = {}
    for assignment in assignments:
        if assignment.student_id not in assignment_by_student:
            assignment_by_student[assignment.student_id] = assignment

    engine = RiskEngine()
    result = {}
    for sid, assignment in assignment_by_student.items():
        try:
            risk = engine.analyze_student(assignment)
            result[sid] = {
                'risk_score': risk.risk_score,
                'risk_label': risk.risk_level.value,
            }
        except Exception:
            pass
    return result


def _needs_meeting_map(student_ids, last_meeting):
    """
    Takip görüşmesi gerekli mi — RiskEngine.INACTIVITY_DAYS_CRITICAL (14 gün) ile uyumlu.
    Son tamamlanan görüşmeden bu yana geçen süre veya hiç görüşme yoksa True.
    """
    threshold = RiskEngine.INACTIVITY_DAYS_CRITICAL
    today = date.today()
    result = {}
    for sid in student_ids:
        last_date = last_meeting.get(sid)
        if last_date is None:
            result[sid] = True
        else:
            result[sid] = (today - last_date).days >= threshold
    return result


def _meeting_today_map(student_ids):
    """Bugün planlanmış görüşmesi olan öğrenciler."""
    today = date.today()
    rows = (
        GorusmeKaydi.objects.filter(
            ogrenci_id__in=student_ids,
            gorusme_tarihi=today,
            durum='planlandi',
        )
        .values('ogrenci_id')
        .annotate(cnt=Count('id'))
    )
    return {r['ogrenci_id']: r['cnt'] for r in rows}


def _veli_contact_map(student_ids):
    """Öğrenci başına varsayılan veli telefonu ve id."""
    from apps.ogrenci.application.veli_contact import default_veli_contact

    result = {}
    for sid in student_ids:
        contact = default_veli_contact(sid)
        if contact:
            result[sid] = contact
    return result


def _profil_foto_map(student_ids):
    result = {}
    for ogrenci in Ogrenci.objects.filter(id__in=student_ids).only('id', 'profil_foto'):
        if ogrenci.profil_foto:
            result[ogrenci.id] = ogrenci.profil_foto.url
    return result


def build_coach_student_list(user, request, sube_id=None):
    """GET /api/coaching/students/ yanıt gövdesi."""
    students = list(
        get_coach_student_queryset(user, request, sube_id=sube_id).values('id', 'ad', 'soyad')
    )
    if not students:
        return []

    student_ids = [s['id'] for s in students]
    kayit_map = _active_kayit_map(student_ids, request)
    last_meeting = _last_meeting_map(student_ids)
    overdue = _overdue_homework_map(student_ids)
    risks = _risk_map(student_ids)
    veli_contacts = _veli_contact_map(student_ids)
    photos = _profil_foto_map(student_ids)
    meetings_today = _meeting_today_map(student_ids)
    needs_meeting = _needs_meeting_map(student_ids, last_meeting)

    rows = []
    for s in students:
        sid = s['id']
        kayit = kayit_map.get(sid)
        risk = risks.get(sid, {})
        last_date = last_meeting.get(sid)
        rows.append({
            'id': sid,
            'ad': s['ad'],
            'soyad': s['soyad'],
            'sinif': kayit.sinif.ad if kayit and kayit.sinif else None,
            'okul_no': kayit.okul_no if kayit else '',
            'risk_label': risk.get('risk_label'),
            'risk_score': risk.get('risk_score'),
            'last_meeting_date': last_date.isoformat() if last_date else None,
            'overdue_homework_count': overdue.get(sid, 0),
            'veli_telefon': (veli_contacts.get(sid) or {}).get('telefon'),
            'veli_id': (veli_contacts.get(sid) or {}).get('id'),
            'profil_foto': photos.get(sid),
            'meeting_today_count': meetings_today.get(sid, 0),
            'needs_meeting': needs_meeting.get(sid, False),
        })
    return rows


def _resolve_hedef(student_id):
    """COACH_PORTAL_DECISIONS: manuel ödev coach_notes → haftalık program coach_note."""
    active_statuses = [
        ManualAssignment.Status.ASSIGNED,
        ManualAssignment.Status.IN_PROGRESS,
        ManualAssignment.Status.OVERDUE,
    ]
    manual = (
        ManualAssignment.objects.filter(
            student_id=student_id,
            is_active=True,
            status__in=active_statuses,
        )
        .exclude(coach_notes='')
        .order_by('-updated_at')
        .values('coach_notes')
        .first()
    )
    if manual and manual['coach_notes'].strip():
        return {'source': 'manual_assignment', 'text': manual['coach_notes'].strip()}

    today = date.today()
    program = (
        WeeklyProgram.objects.filter(
            student_id=student_id,
            is_template=False,
            week_start__lte=today,
            week_end__gte=today,
        )
        .exclude(coach_note='')
        .order_by('-week_start')
        .values('coach_note', 'week_start', 'week_end', 'completion_percent')
        .first()
    )
    if program and program['coach_note'].strip():
        return {
            'source': 'weekly_program',
            'text': program['coach_note'].strip(),
            'week_start': program['week_start'].isoformat(),
            'week_end': program['week_end'].isoformat(),
            'completion_percent': program['completion_percent'],
        }
    return {'source': 'none', 'text': None}


def _format_date(value, format_str='%d.%m.%Y'):
    return value.strftime(format_str) if value else ''


def _get_active_kayit_detail(student_id, request):
    """Profil için aktif kayıt — sınıf seviyesi ve eğitim yılı dahil."""
    egitim_yili_id = get_secili_egitim_yili_id(request)
    qs = OgrenciKayit.objects.filter(
        ogrenci_id=student_id,
        aktif_mi=True,
    ).select_related('sinif', 'sinif__sinif_seviyesi', 'sinif_seviyesi', 'egitim_yili')
    if egitim_yili_id:
        kayit = qs.filter(egitim_yili_id=egitim_yili_id).order_by('-id').first()
        if kayit:
            return kayit
    # Seçili yılda kayıt yoksa en güncel aktif kayıttan kimlik alanlarını doldur
    return qs.order_by('-egitim_yili_id', '-id').first()


def _build_coach_student_identity(student, kayit, veli_contact):
    """
    Ana LMS ogrenci_api ile uyumlu öğrenci kimlik/detay alanları (ek_hizmetler hariç).
    """
    sinif_bilgi = None
    egitim_yili_bilgi = None
    sinif_seviyesi_bilgi = None
    okul_no = ''
    kayit_tarihi = ''

    if kayit:
        okul_no = kayit.okul_no or ''
        kayit_tarihi = _format_date(kayit.kayit_tarihi) if kayit.kayit_tarihi else ''
        if kayit.sinif:
            sinif_bilgi = {
                'id': kayit.sinif.id,
                'ad': kayit.sinif.ad,
            }
        # Admin ogrenci_api ile aynı: kayıt FK veya sınıf.sinif_seviyesi (ad örn. "11. Sınıf")
        seviye_obj = kayit.sinif_seviyesi or (
            kayit.sinif.sinif_seviyesi if kayit.sinif else None
        )
        if seviye_obj:
            sinif_seviyesi_bilgi = {
                'id': seviye_obj.id,
                'ad': seviye_obj.ad,
            }
        if kayit.egitim_yili:
            egitim_yili_bilgi = {
                'id': kayit.egitim_yili.id,
                'ad': kayit.egitim_yili.yil_str,
            }

    adresler = []
    for adres in OgrenciAdres.objects.filter(ogrenci=student).order_by('-varsayilan', '-id'):
        adresler.append({
            'id': adres.id,
            'adres_turu': adres.adres_turu,
            'adres_turu_display': dict(OgrenciAdres.ADRES_TURU_CHOICES).get(
                adres.adres_turu, adres.adres_turu
            ),
            'adres': adres.adres,
            'il': adres.il,
            'ilce': adres.ilce,
            'posta_kodu': adres.posta_kodu or '',
            'varsayilan': adres.varsayilan,
        })

    varsayilan_adres = adresler[0] if adresler else None
    adres_text = ''
    if varsayilan_adres:
        adres_parts = [varsayilan_adres['adres']]
        if varsayilan_adres['ilce']:
            adres_parts.append(varsayilan_adres['ilce'])
        if varsayilan_adres['il']:
            adres_parts.append(varsayilan_adres['il'])
        adres_text = ', '.join(filter(None, adres_parts))

    veliler = []
    for veli in OgrenciVeli.objects.filter(ogrenci=student).order_by('-varsayilan', '-id'):
        veliler.append({
            'id': veli.id,
            'veli_turu': veli.veli_turu,
            'veli_turu_display': dict(OgrenciVeli.VELI_TURU_CHOICES).get(
                veli.veli_turu, veli.veli_turu
            ),
            'tc_kimlik_no': veli.tc_kimlik_no or '',
            'ad': veli.ad,
            'soyad': veli.soyad,
            'tam_ad': f'{veli.ad} {veli.soyad}'.strip(),
            'telefon': veli.telefon or '',
            'email': veli.email or '',
            'meslek': veli.meslek or '',
            'varsayilan': veli.varsayilan,
        })

    varsayilan_veli = veliler[0] if veliler else None
    profil_foto = student.profil_foto.url if student.profil_foto else None

    return {
        'id': student.id,
        'ad': student.ad,
        'soyad': student.soyad,
        'tam_ad': student.tam_ad,
        'full_name': student.tam_ad,
        'tc_kimlik_no': student.tc_kimlik_no or '',
        'dogum_tarihi': _format_date(student.dogum_tarihi),
        'dogum_tarihi_iso': student.dogum_tarihi.isoformat() if student.dogum_tarihi else '',
        'cinsiyet': student.cinsiyet or '',
        'cinsiyet_display': dict(student.CINSIYET_CHOICES).get(student.cinsiyet, '-'),
        'kayit_turu': student.kayit_turu or 'asil',
        'kayit_turu_display': dict(student.KAYIT_TURU_CHOICES).get(
            student.kayit_turu, 'Asil'
        ),
        'telefon': student.telefon or '',
        'email': student.email or '',
        'adres': adres_text or student.adres or '',
        'veli_ad_soyad': (
            varsayilan_veli['tam_ad'] if varsayilan_veli else (student.veli_ad_soyad or '')
        ),
        'veli_telefon': (
            (varsayilan_veli['telefon'] if varsayilan_veli and varsayilan_veli.get('telefon') else None)
            or (student.veli_telefon or '')
        ),
        'veli_adi': veli_contact['ad'] if veli_contact else None,
        'veli': veli_contact,
        'adresler': adresler,
        'veliler': veliler,
        'aktif_mi': student.aktif_mi,
        'created_at': _format_date(student.created_at),
        'updated_at': _format_date(student.updated_at),
        'kurum': {
            'id': student.kurum_id,
            'ad': student.kurum.ad if student.kurum else '',
        } if student.kurum_id else None,
        'sube': {
            'id': student.sube_id,
            'ad': student.sube.ad if student.sube else '',
        } if student.sube_id else None,
        'okul_no': okul_no,
        'sinif': sinif_bilgi,
        'sinif_seviyesi': sinif_seviyesi_bilgi,
        'egitim_yili': egitim_yili_bilgi,
        'kayit_tarihi': kayit_tarihi,
        'profil_foto': profil_foto,
    }


def _veli_contact(student_id):
    from apps.ogrenci.application.veli_contact import default_veli_contact

    contact = default_veli_contact(student_id)
    if not contact:
        return None
    veli = OgrenciVeli.objects.filter(id=contact['id']).first()
    if not veli:
        return None
    tel = contact['telefon']
    return {
        'id': veli.id,
        'ad': f'{veli.ad} {veli.soyad}'.strip(),
        'telefon': tel,
        'tel_link': f'tel:{tel}' if tel else None,
        'veli_turu': veli.veli_turu,
        'veli_turu_display': dict(OgrenciVeli.VELI_TURU_CHOICES).get(
            veli.veli_turu, veli.veli_turu
        ),
    }


def _exam_quick_summary(student_id):
    from apps.coaching.olcme_degerlendirme.models import StudentAnswer

    answers = (
        StudentAnswer.objects.filter(
            student_id=student_id,
            session__status='COMPLETED',
        )
        .select_related('session__exam')
        .order_by('-session__exam__exam_date', '-id')
    )
    total = answers.count()
    if not total:
        return {'total_exams': 0, 'last_exam_net': None, 'last_exam_name': None, 'last_exam_date': None}

    last = answers.first()
    exam = last.session.exam
    return {
        'total_exams': total,
        'last_exam_net': float(last.total_net) if last.total_net is not None else None,
        'last_exam_name': exam.name if exam else None,
        'last_exam_date': str(exam.exam_date) if exam and exam.exam_date else None,
    }


def build_coach_student_profile(user, request, student_id):
    """GET /api/coaching/students/{id}/profile/ aggregate."""
    try:
        student = Ogrenci.objects.select_related('kurum', 'sube').get(
            pk=student_id, aktif_mi=True
        )
    except Ogrenci.DoesNotExist:
        return None

    kayit = _get_active_kayit_detail(student_id, request)

    coach_profile = get_coach_profile(user)
    primary_assignment = (
        CoachStudentAssignment.objects.filter(
            student_id=student_id,
            end_date__isnull=True,
        )
        .select_related('coach', 'coach__teacher')
        .order_by('-is_primary', '-start_date')
        .first()
    )

    is_my_primary = False
    if coach_profile and primary_assignment:
        is_my_primary = primary_assignment.coach_id == coach_profile.id

    risk_data = None
    if primary_assignment:
        try:
            risk = RiskEngine().analyze_student(primary_assignment)
            risk_data = {
                'score': risk.risk_score,
                'label': risk.risk_level.value,
                'reasons': risk.reasons,
            }
        except Exception:
            pass

    recent_meetings = (
        GorusmeKaydi.objects.filter(ogrenci_id=student_id)
        .select_related('koc__teacher')
        .order_by('-gorusme_tarihi', '-id')[:5]
    )
    meeting_rows = [
        {
            'id': g.id,
            'gorusme_turu': g.gorusme_turu,
            'durum': g.durum,
            'gorusme_tarihi': g.gorusme_tarihi.isoformat(),
            'konu': g.konu,
            'koc_name': (
                f'{g.koc.teacher.ad} {g.koc.teacher.soyad}'
                if g.koc and g.koc.teacher else None
            ),
            'can_edit': bool(
                coach_profile and g.koc_id == coach_profile.id
            ),
        }
        for g in recent_meetings
    ]

    today = date.today()
    current_program = (
        WeeklyProgram.objects.filter(
            student_id=student_id,
            is_template=False,
            week_start__lte=today,
            week_end__gte=today,
        )
        .order_by('-week_start')
        .values(
            'id', 'week_start', 'week_end',
            'completion_percent', 'total_block_count', 'coach_note',
        )
        .first()
    )

    manual_stats = ManualAssignment.objects.filter(
        student_id=student_id,
        is_active=True,
    ).aggregate(
        pending=Count('id', filter=Q(status__in=[
            ManualAssignment.Status.ASSIGNED,
            ManualAssignment.Status.IN_PROGRESS,
        ])),
        overdue=Count('id', filter=Q(status=ManualAssignment.Status.OVERDUE)),
    )

    last_meeting = _last_meeting_map([student_id]).get(student_id)
    overdue_total = _overdue_homework_map([student_id]).get(student_id, 0)
    exam_summary = _exam_quick_summary(student_id)

    veli_contact = _veli_contact(student_id)

    hedef = _resolve_hedef(student_id)
    total_meeting_count = GorusmeKaydi.objects.filter(ogrenci_id=student_id).count()
    coach_name = (
        f'{primary_assignment.coach.teacher.ad} {primary_assignment.coach.teacher.soyad}'
        if primary_assignment and primary_assignment.coach and primary_assignment.coach.teacher
        else None
    )

    return {
        'student': _build_coach_student_identity(student, kayit, veli_contact),
        'coach_context': {
            'is_admin': is_resource_admin(user),
            'is_coach': coach_profile is not None,
            'coach_profile_id': coach_profile.id if coach_profile else None,
            'is_primary_coach': is_my_primary,
            'coach_name': coach_name,
            'primary_coach_name': coach_name,
            'hedef': (hedef or {}).get('text') if isinstance(hedef, dict) else None,
            'assignment_start_date': (
                primary_assignment.start_date.isoformat()
                if primary_assignment and primary_assignment.start_date else None
            ),
            'can_edit_all_meetings': is_resource_admin(user),
            'total_meeting_count': total_meeting_count,
        },
        'risk': risk_data,
        'overview': {
            'hedef': hedef,
            'recent_meetings': meeting_rows,
            'current_week_program': current_program,
            'exam_summary': exam_summary,
            'pending_manual_assignments': manual_stats.get('pending', 0),
        },
        'quick_stats': {
            'overdue_homework_count': overdue_total,
            'overdue_homework': overdue_total,
            'last_meeting_date': last_meeting.isoformat() if last_meeting else None,
            'program_completion_percent': (
                current_program['completion_percent'] if current_program else None
            ),
            'pending_manual_assignments': manual_stats.get('pending', 0),
            'overdue_manual_assignments': manual_stats.get('overdue', 0),
            'total_meetings': total_meeting_count,
            **exam_summary,
        },
        'last_meeting': (
            {
                'date': last_meeting.isoformat(),
                'konu': meeting_rows[0]['konu'] if meeting_rows else None,
            }
            if last_meeting
            else None
        ),
    }
