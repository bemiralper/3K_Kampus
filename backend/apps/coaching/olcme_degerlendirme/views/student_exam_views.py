"""
Öğrenci Sınav Görünümü — Öğrenci detay sayfasındaki Sınav sekmesi için
backend/apps/coaching/olcme_degerlendirme/views/student_exam_views.py

Endpoint:
  GET  /student-exams/<student_id>/
       → Öğrencinin girdiği tüm sınavlar, puanlar, sıralama, ders bazlı net, trend
"""
import logging
from collections import defaultdict

from django.db.models import Max
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import StudentAnswer
from apps.coaching.services.coach_access import user_can_access_student
from ..views import CsrfExemptSessionAuthentication
from ..services.scoring import (
    build_scoring_nets,
    calculate_score_for_exam,
    estimate_ranking,
)
from ..services.scoring_settings import resolve_puan_yili

from apps.ogrenci.domain.models import Ogrenci

logger = logging.getLogger(__name__)


def _safe_float(val):
    if val is None:
        return 0.0
    return float(val)


def _latest_matched_peer_answers(exam):
    """Eşleşmiş, tamamlanmış, öğrenci başına son yükleme — prefetch'li."""
    qs = (
        StudentAnswer.objects
        .filter(
            session__exam=exam,
            session__status='COMPLETED',
            student__isnull=False,
        )
        .prefetch_related('section_scores__section')
    )
    latest_ids = (
        StudentAnswer.objects
        .filter(
            session__exam=exam,
            session__status='COMPLETED',
            student__isnull=False,
        )
        .values('student_id')
        .annotate(latest_id=Max('id'))
        .values_list('latest_id', flat=True)
    )
    return list(qs.filter(id__in=latest_ids))


def _peer_puan_list(exam, year):
    scores = []
    for ea in _latest_matched_peer_answers(exam):
        nets = build_scoring_nets(ea, exam)
        scores.append(calculate_score_for_exam(
            exam, nets, year=year,
            student_id=ea.student_id,
            raw_student_name=ea.raw_student_name,
            raw_student_id=ea.raw_student_id,
        )['puan'])
    return scores


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def student_exam_results(request, student_id):
    """
    Öğrencinin girdiği tüm sınavların sonuçları + KPI + ders bazlı netler + trend.
    """
    if not user_can_access_student(request.user, student_id):
        return Response({'error': 'Bu öğrenciye erişim yetkiniz yok.'}, status=403)

    try:
        ogrenci = Ogrenci.objects.get(pk=student_id)
    except Ogrenci.DoesNotExist:
        logger.warning('[student_exam_results] Öğrenci bulunamadı: student_id=%s', student_id)
        return Response({'error': 'Öğrenci bulunamadı.'}, status=404)

    raw_year = request.query_params.get('ranking_year')
    request_year = int(raw_year) if raw_year not in (None, '') else None
    exam_type_filter = request.query_params.get('exam_type')

    answers_qs = (
        StudentAnswer.objects
        .filter(
            student=ogrenci,
            session__status='COMPLETED',
            session__exam__is_active=True,
        )
        .select_related('session__exam')
        .prefetch_related('section_scores__section')
        .order_by('session__exam__exam_date', 'session__exam__created_at', 'id')
    )

    if exam_type_filter:
        answers_qs = answers_qs.filter(session__exam__exam_type=exam_type_filter)

    # Aynı sınavda birden fazla DAT yüklemesi varsa son kaydı tut.
    latest_by_exam = {}
    for answer in answers_qs:
        latest_by_exam[answer.session.exam_id] = answer
    answers = list(latest_by_exam.values())
    answers.sort(key=lambda a: (
        a.session.exam.exam_date or a.session.exam.created_at.date(),
        a.session.exam.created_at,
        a.id,
    ))

    if not answers:
        return Response({
            'student_name': f'{ogrenci.ad} {ogrenci.soyad}',
            'exams': [],
            'kpi': None,
            'net_trend': [],
        })

    exam_results = []
    trend_data = []
    all_nets = []
    all_scores = []
    section_net_totals = defaultdict(list)
    peer_score_cache = {}

    for answer in answers:
        exam = answer.session.exam
        section_details = []
        for ss in answer.section_scores.all():
            sec_name = ss.section.name
            net_val = _safe_float(ss.net)
            section_details.append({
                'section_id': ss.section_id,
                'section_name': sec_name,
                'correct': ss.correct,
                'wrong': ss.wrong,
                'empty': ss.empty,
                'net': net_val,
                'question_count': ss.section.question_count,
                'is_sub_section': ss.section.is_sub_section,
            })
            if not ss.section.is_sub_section:
                section_net_totals[sec_name].append(net_val)

        year = resolve_puan_yili(exam, request_year)
        sec_nets = build_scoring_nets(answer, exam)
        score_data = calculate_score_for_exam(
            exam, sec_nets, year=year,
            student_id=answer.student_id,
            raw_student_name=answer.raw_student_name,
            raw_student_id=answer.raw_student_id,
        )
        puan = score_data['puan']
        ham_puan = score_data['ham_puan']
        ranking_data = estimate_ranking(puan, exam.exam_type, year)

        if exam.id not in peer_score_cache:
            peer_score_cache[exam.id] = _peer_puan_list(exam, year)
        all_exam_scores = peer_score_cache[exam.id]
        total_in_exam = len(all_exam_scores)
        all_exam_scores_sorted = sorted(all_exam_scores, reverse=True)
        try:
            kurum_ici_sira = all_exam_scores_sorted.index(puan) + 1
        except ValueError:
            kurum_ici_sira = total_in_exam

        net_val = _safe_float(answer.total_net)
        all_nets.append(net_val)
        all_scores.append(puan)

        exam_row = {
            'exam_id': exam.id,
            'exam_name': exam.name,
            'exam_type': exam.exam_type,
            'exam_type_display': exam.get_exam_type_display(),
            'exam_date': str(exam.exam_date) if exam.exam_date else None,
            'status': exam.status,
            'total_correct': answer.total_correct,
            'total_wrong': answer.total_wrong,
            'total_empty': answer.total_empty,
            'total_net': net_val,
            'puan': puan,
            'ham_puan': ham_puan,
            'tahmini_siralama': ranking_data.get('tahmini_siralama'),
            'yuzdelik_dilim': ranking_data.get('yuzdelik_dilim'),
            'kurum_ici_sira': kurum_ici_sira,
            'toplam_ogrenci': total_in_exam,
            'section_details': section_details,
        }
        exam_results.append(exam_row)

        section_nets_for_trend = {}
        for sd in section_details:
            if not sd.get('is_sub_section'):
                section_nets_for_trend[sd['section_name']] = sd['net']

        trend_data.append({
            'exam_id': exam.id,
            'exam_name': exam.name,
            'exam_date': str(exam.exam_date) if exam.exam_date else None,
            'toplam_net': net_val,
            'puan': puan,
            'section_nets': section_nets_for_trend,
        })

    toplam_sinav = len(all_nets)
    ortalama_net = round(sum(all_nets) / toplam_sinav, 2) if toplam_sinav else 0
    ortalama_puan = round(sum(all_scores) / toplam_sinav, 2) if toplam_sinav else 0
    son_sinav_net = all_nets[-1] if all_nets else 0
    son_sinav_puan = all_scores[-1] if all_scores else 0
    net_degisim = round(all_nets[-1] - all_nets[-2], 2) if len(all_nets) >= 2 else None
    puan_degisim = round(all_scores[-1] - all_scores[-2], 2) if len(all_scores) >= 2 else None

    en_iyi_ders = None
    en_zayif_ders = None
    if section_net_totals:
        section_avgs = {
            name: round(sum(nets) / len(nets), 2)
            for name, nets in section_net_totals.items()
            if nets
        }
        if section_avgs:
            en_iyi_ders = max(section_avgs, key=section_avgs.get)
            en_zayif_ders = min(section_avgs, key=section_avgs.get)

    kpi = {
        'toplam_sinav': toplam_sinav,
        'ortalama_net': ortalama_net,
        'max_net': round(max(all_nets), 2) if all_nets else 0,
        'min_net': round(min(all_nets), 2) if all_nets else 0,
        'ortalama_puan': ortalama_puan,
        'max_puan': round(max(all_scores), 2) if all_scores else 0,
        'min_puan': round(min(all_scores), 2) if all_scores else 0,
        'son_sinav_net': round(son_sinav_net, 2),
        'son_sinav_puan': round(son_sinav_puan, 2),
        'net_degisim': net_degisim,
        'puan_degisim': puan_degisim,
        'en_iyi_ders': en_iyi_ders,
        'en_zayif_ders': en_zayif_ders,
    }

    return Response({
        'student_name': f'{ogrenci.ad} {ogrenci.soyad}',
        'exams': exam_results,
        'kpi': kpi,
        'net_trend': trend_data,
    })
