"""
Öğrenci Sınav Görünümü — Öğrenci detay sayfasındaki Sınav sekmesi için
backend/apps/coaching/olcme_degerlendirme/views/student_exam_views.py

Endpoint:
  GET  /student-exams/<student_id>/
       → Öğrencinin girdiği tüm sınavlar, puanlar, sıralama, ders bazlı net, trend
"""
import logging
from collections import defaultdict
from decimal import Decimal

from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import (
    Exam, ExamSection, StudentAnswer, StudentSectionScore,
)
from apps.coaching.services.coach_access import user_can_access_student
from ..views import CsrfExemptSessionAuthentication
from ..services.scoring import (
    calculate_score_for_exam,
    estimate_ranking,
    calculate_percentile,
    calculate_std_dev,
)

from apps.ogrenci.domain.models import Ogrenci

logger = logging.getLogger(__name__)


def _safe_float(val):
    if val is None:
        return 0.0
    return float(val)


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def student_exam_results(request, student_id):
    """
    Öğrencinin girdiği tüm sınavların sonuçları + KPI + ders bazlı netler + trend.

    GET /student-exams/<student_id>/

    Response:
    {
      student_name: str,
      exams: [
        {
          exam_id, exam_name, exam_type, exam_type_display, exam_date, status,
          total_correct, total_wrong, total_empty, total_net,
          puan, ham_puan, tahmini_siralama, yuzdelik_dilim,
          kurum_ici_sira, toplam_ogrenci,
          section_details: [{section_name, net, correct, wrong, empty, question_count}],
        }, ...
      ],
      kpi: {
        toplam_sinav, ortalama_net, max_net, min_net,
        ortalama_puan, max_puan, min_puan,
        son_sinav_net, son_sinav_puan,
        net_degisim, puan_degisim,
        en_iyi_ders, en_zayif_ders,
      },
      net_trend: [{exam_id, exam_name, exam_date, toplam_net, puan, section_nets}],
    }
    """
    if not user_can_access_student(request.user, student_id):
        return Response({'error': 'Bu öğrenciye erişim yetkiniz yok.'}, status=403)

    # Öğrenci var mı?
    try:
        ogrenci = Ogrenci.objects.get(pk=student_id)
    except Ogrenci.DoesNotExist:
        logger.warning('[student_exam_results] Öğrenci bulunamadı: student_id=%s', student_id)
        return Response({'error': 'Öğrenci bulunamadı.'}, status=404)

    logger.info('[student_exam_results] student_id=%s (%s %s)', student_id, ogrenci.ad, ogrenci.soyad)

    ranking_year = int(request.query_params.get('ranking_year', 2025))
    exam_type_filter = request.query_params.get('exam_type')  # opsiyonel filtre

    # Öğrencinin tüm cevaplarını al
    answers_qs = (
        StudentAnswer.objects
        .filter(
            student=ogrenci,
            session__status='COMPLETED',
        )
        .select_related('session__exam')
        .prefetch_related('section_scores__section')
        .order_by('session__exam__exam_date', 'session__exam__created_at')
    )

    if exam_type_filter:
        answers_qs = answers_qs.filter(session__exam__exam_type=exam_type_filter)

    logger.info('[student_exam_results] student_id=%s → %d kayıt bulundu', student_id, answers_qs.count())

    if not answers_qs.exists():
        logger.info('[student_exam_results] student_id=%s → Sınav kaydı yok, boş dönülüyor', student_id)
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
    section_net_totals = defaultdict(list)  # section_name → [netler]

    for answer in answers_qs:
        exam = answer.session.exam

        # Section detayları
        sec_nets = {}
        section_details = []
        for ss in answer.section_scores.all():
            sec_name = ss.section.name
            net_val = _safe_float(ss.net)
            sec_nets[sec_name] = net_val
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
            # Ders bazlı toplam (ana bölümler)
            if not ss.section.is_sub_section:
                section_net_totals[sec_name].append(net_val)

        # Puan hesapla
        score_data = calculate_score_for_exam(exam, sec_nets)
        puan = score_data['puan']
        ham_puan = score_data['ham_puan']

        # Sıralama tahmini
        ranking_data = estimate_ranking(puan, exam.exam_type, ranking_year)

        # Kurum içi sıralama: bu sınavdaki tüm cevaplar
        all_exam_answers = (
            StudentAnswer.objects
            .filter(session__exam=exam, session__status='COMPLETED')
        )
        all_exam_nets = [_safe_float(a.total_net) for a in all_exam_answers]
        total_in_exam = len(all_exam_nets)

        # Kurum içi sıra hesapla (puanla)
        all_exam_scores = []
        for ea in all_exam_answers:
            ea_sec_nets = {}
            for ess in ea.section_scores.all():
                ea_sec_nets[ess.section.name] = _safe_float(ess.net)
            ea_score = calculate_score_for_exam(exam, ea_sec_nets)['puan']
            all_exam_scores.append(ea_score)

        all_exam_scores_sorted = sorted(all_exam_scores, reverse=True)
        kurum_ici_sira = (
            all_exam_scores_sorted.index(puan) + 1
            if puan in all_exam_scores_sorted
            else total_in_exam
        )

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

        # Trend verisi — ana bölüm netleri
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

    # ── KPI Hesaplama ─────────────────────────────────────────────────────
    toplam_sinav = len(all_nets)
    ortalama_net = round(sum(all_nets) / toplam_sinav, 2) if toplam_sinav else 0
    ortalama_puan = round(sum(all_scores) / toplam_sinav, 2) if toplam_sinav else 0

    son_sinav_net = all_nets[-1] if all_nets else 0
    son_sinav_puan = all_scores[-1] if all_scores else 0

    # Net / puan değişimi (son iki sınav arası)
    net_degisim = round(all_nets[-1] - all_nets[-2], 2) if len(all_nets) >= 2 else None
    puan_degisim = round(all_scores[-1] - all_scores[-2], 2) if len(all_scores) >= 2 else None

    # En iyi / en zayıf ders (ortalamalara göre)
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
