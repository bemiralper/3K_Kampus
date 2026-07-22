"""
Sonuç Analiz View'ları  (views/analysis_views.py)

Tüm analiz endpoint'leri:
  - exam_analysis_summary     → Genel sınav özet paneli
  - exam_analysis_sections    → Ders bazlı analiz
  - exam_analysis_students    → Öğrenci bazlı detay
  - exam_analysis_rankings    → Sıralama ve yüzdelik dilim
  - exam_analysis_questions   → Madde (soru) analizi
  - exam_analysis_classes     → Sınıf/Şube analizi
  - exam_analysis_strategy    → Strateji önerisi (otomatik yorum)
"""
import math
import logging
from collections import defaultdict
from decimal import Decimal

from django.db.models import (
    Avg, Sum, Max, Min, Count, Q, F, Value, CharField,
    DecimalField, FloatField,
)
from django.db.models.functions import Concat, Cast

from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes, authentication_classes, renderer_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response

from shared.export.drf_renderers import CsvRenderer, XlsxRenderer

from ..models import (
    Exam, ExamSection, ExamSession,
    AnswerKey, AnswerKeyItem,
    StudentAnswer, StudentSectionScore,
    Outcome,
)
from ..views import CsrfExemptSessionAuthentication
from ..interfaces.sube_context import get_exam_or_response
from ..services.scoring import (
    calculate_score_for_exam,
    calculate_all_ayt_scores,
    calculate_ayt_score,
    _get_linked_tyt_nets,
    estimate_ranking,
    calculate_percentile,
    calculate_std_dev,
)

from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.sinif.domain.models import Sinif

logger = logging.getLogger(__name__)


def _get_student_alan(student, egitim_yili):
    """
    Öğrencinin alan bilgisini (SAYISAL / SOZEL / ESIT_AGIRLIK) döndürür.
    student: Ogrenci instance veya None
    egitim_yili: Exam.egitim_yili
    Returns: str veya None  (ör. 'SAYISAL', 'SOZEL', 'ESIT_AGIRLIK')
    """
    if not student or not egitim_yili:
        return None
    try:
        kayit = OgrenciKayit.objects.filter(
            ogrenci=student,
            egitim_yili=egitim_yili,
            aktif_mi=True,
        ).select_related('sinif__alan').first()
        if kayit and kayit.sinif and kayit.sinif.alan:
            return kayit.sinif.alan.kod
    except Exception:
        pass
    return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  YARDIMCILAR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _get_exam_or_404(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return None, err
    try:
        exam = Exam.objects.prefetch_related('sections', 'sections__sub_sections').get(pk=exam.pk)
    except Exam.DoesNotExist:
        return None, Response({'error': 'Sınav bulunamadı.'}, status=404)
    return exam, None


def _get_session_answers(exam, session_id=None):
    """Sınav veya belirli bir oturumdaki tüm öğrenci cevaplarını getir."""
    qs = StudentAnswer.objects.filter(
        session__exam=exam,
        session__status='COMPLETED',
    ).select_related('student', 'session').prefetch_related('section_scores__section')

    if session_id:
        qs = qs.filter(session_id=session_id)
    return qs


def _safe_float(val):
    if val is None:
        return 0.0
    return float(val)


def _median(values):
    """Medyan hesapla."""
    if not values:
        return 0.0
    sorted_v = sorted(values)
    n = len(sorted_v)
    if n % 2 == 0:
        return (sorted_v[n // 2 - 1] + sorted_v[n // 2]) / 2
    return sorted_v[n // 2]


def _build_section_map(exam):
    """Section id → name map + alt bölüm ilişkileri."""
    sections = exam.sections.all().order_by('order')
    sec_map = {}
    for sec in sections:
        sec_map[sec.id] = {
            'id': sec.id,
            'name': sec.name,
            'question_count': sec.question_count,
            'question_start': sec.question_start,
            'question_end': sec.question_end,
            'is_sub': sec.is_sub_section,
            'parent_id': sec.parent_section_id,
        }
    return sec_map


def _build_scoring_nets(answer, exam) -> dict:
    """
    Puan hesaplama için section_nets sözlüğü oluştur.

    TYT: Sadece 4 ana bölüm (Türkçe, Sosyal Bilimler, Temel Matematik, Fen Bilimleri).
         Alt bölümler (Fizik, Kimya, Matematik vb.) ana bölümün içinde zaten sayılıyor.
         Alt bölüm gönderilirse çift sayım olur — ÖRN: "Matematik" alt bölüm → "Temel Matematik"
         katsayısı ikinci kez uygulanır ve puan 500'ü aşar!

    AYT: Ana bölüm neti öncelikli. Alt bölüm neti sadece ana bölümle
         isim çakışması yoksa eklenir (ör: Fizik, Kimya, Biyoloji ayrı katsayılı).
    """
    is_tyt = exam.exam_type in ('YKS_TYT', 'DENEME', 'LGS')

    result = {}
    for ss in answer.section_scores.all():
        sec = ss.section
        net_val = _safe_float(ss.net)

        if is_tyt:
            # TYT: Sadece ana bölümlerin netlerini al
            if not sec.is_sub_section:
                result[sec.name] = net_val
        else:
            # AYT: Ana bölüm öncelikli, alt bölüm çakışmazsa eklenir
            if not sec.is_sub_section:
                result[sec.name] = net_val
            else:
                if sec.name not in result:
                    result[sec.name] = net_val

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  1️⃣ GENEL SINAV ÖZET PANELİ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_analysis_summary(request, exam_pk):
    """
    Genel sınav özet paneli.

    GET /exams/{exam_pk}/analysis/summary/?session_id=X
    """
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err

    session_id = request.query_params.get('session_id')
    answers = _get_session_answers(exam, session_id)

    if not answers.exists():
        return Response({
            'exam_name': exam.name,
            'exam_type': exam.exam_type,
            'exam_date': str(exam.exam_date) if exam.exam_date else None,
            'katilim': 0,
            'message': 'Henüz sonuç yüklenmedi.',
        })

    total_students = answers.count()
    nets = [_safe_float(a.total_net) for a in answers]
    corrects = [a.total_correct for a in answers]

    is_ayt = exam.exam_type == 'YKS_AYT'

    # Puan hesapla
    scores = []            # Varsayılan puan (TYT → TYT, AYT → SAY)
    ayt_all_scores = []    # AYT: [{SAY: .., EA: .., SOZ: ..}, ...]
    for a in answers:
        sec_nets = _build_scoring_nets(a, exam)
        if is_ayt:
            tyt_nets = _get_linked_tyt_nets(exam, a.student_id, a.raw_student_name, a.raw_student_id) if hasattr(exam, 'linked_tyt_exam') and exam.linked_tyt_exam else {}
            all_scores_data = calculate_all_ayt_scores(sec_nets, tyt_nets)
            ayt_all_scores.append(all_scores_data)
            scores.append(all_scores_data['SAY']['puan'])
        else:
            score_data = calculate_score_for_exam(exam, sec_nets, student_id=a.student_id, raw_student_name=a.raw_student_name, raw_student_id=a.raw_student_id)
            scores.append(score_data['puan'])

    avg_net = sum(nets) / len(nets) if nets else 0
    median_net = _median(nets)
    max_net = max(nets) if nets else 0
    min_net = min(nets) if nets else 0
    std_dev_net = calculate_std_dev(nets)

    avg_score = sum(scores) / len(scores) if scores else 0
    max_score = max(scores) if scores else 0
    min_score = min(scores) if scores else 0
    std_dev_score = calculate_std_dev(scores)

    # AYT puan türleri istatistikleri
    puan_turleri = None
    if is_ayt and ayt_all_scores:
        puan_turleri = {}
        for pt in ('SAY', 'EA', 'SOZ'):
            pt_scores = [s[pt]['puan'] for s in ayt_all_scores]
            puan_turleri[pt] = {
                'ortalama': round(sum(pt_scores) / len(pt_scores), 2) if pt_scores else 0,
                'max': round(max(pt_scores), 2) if pt_scores else 0,
                'min': round(min(pt_scores), 2) if pt_scores else 0,
                'std_sapma': calculate_std_dev(pt_scores),
            }

    # Başarı yüzdesi: toplam soru sayısının %50'sinden fazla net yapanlar
    total_q = exam.total_questions
    threshold = total_q * 0.5 if total_q else 60  # varsayılan 60
    success_count = sum(1 for n in nets if n >= threshold)
    success_pct = round((success_count / total_students) * 100, 1) if total_students else 0

    # Önceki sınava göre değişim
    prev_exam = (
        Exam.objects
        .filter(
            exam_type=exam.exam_type,
            kurum=exam.kurum,
            pk__lt=exam.pk,
            status__in=['RESULTS_UPLOADED', 'COMPLETED'],
        )
        .order_by('-pk')
        .first()
    )
    trend = None
    if prev_exam:
        prev_answers = _get_session_answers(prev_exam)
        if prev_answers.exists():
            prev_nets = [_safe_float(a.total_net) for a in prev_answers]
            prev_avg = sum(prev_nets) / len(prev_nets) if prev_nets else 0
            diff = round(avg_net - prev_avg, 2)
            trend = {
                'prev_exam_name': prev_exam.name,
                'prev_avg_net': round(prev_avg, 2),
                'diff': diff,
                'direction': 'up' if diff > 0 else 'down' if diff < 0 else 'same',
            }

    # Oturum listesi
    sessions = ExamSession.objects.filter(exam=exam, status='COMPLETED').values(
        'id', 'original_filename', 'total_rows', 'created_at'
    )

    return Response({
        'exam_name': exam.name,
        'exam_type': exam.exam_type,
        'exam_type_display': exam.get_exam_type_display(),
        'exam_date': str(exam.exam_date) if exam.exam_date else None,
        'total_questions': total_q,

        'katilim': total_students,
        'ortalama_net': round(avg_net, 2),
        'medyan_net': round(median_net, 2),
        'max_net': round(max_net, 2),
        'min_net': round(min_net, 2),
        'std_sapma_net': std_dev_net,

        'ortalama_puan': round(avg_score, 2),
        'max_puan': round(max_score, 2),
        'min_puan': round(min_score, 2),
        'std_sapma_puan': std_dev_score,

        'basari_yuzdesi': success_pct,
        'basari_esik': threshold,

        # AYT sınavları için SAY/EA/SÖZ puan istatistikleri
        'puan_turleri': puan_turleri,

        'linked_tyt_exam': {
            'id': exam.linked_tyt_exam.id,
            'name': exam.linked_tyt_exam.name,
        } if hasattr(exam, 'linked_tyt_exam') and exam.linked_tyt_exam else None,

        'trend': trend,
        'sessions': list(sessions),
    })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  2️⃣ DERS BAZLI ANALİZ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_analysis_sections(request, exam_pk):
    """
    Ders bazlı analiz.

    GET /exams/{exam_pk}/analysis/sections/?session_id=X
    """
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err

    session_id = request.query_params.get('session_id')
    answers = _get_session_answers(exam, session_id)
    sec_map = _build_section_map(exam)

    if not answers.exists():
        return Response({'sections': [], 'message': 'Sonuç yok.'})

    # Tüm section score'larını topla
    all_scores = StudentSectionScore.objects.filter(
        student_answer__in=answers,
    ).select_related('section')

    # Section bazında gruplama
    section_data = defaultdict(lambda: {
        'nets': [], 'corrects': [], 'wrongs': [], 'empties': [],
    })

    for ss in all_scores:
        sid = ss.section_id
        section_data[sid]['nets'].append(_safe_float(ss.net))
        section_data[sid]['corrects'].append(ss.correct)
        section_data[sid]['wrongs'].append(ss.wrong)
        section_data[sid]['empties'].append(ss.empty)

    result_sections = []
    for sid, data in section_data.items():
        sec_info = sec_map.get(sid, {})
        if not sec_info:
            continue

        nets = data['nets']
        corrects = data['corrects']
        wrongs = data['wrongs']
        empties = data['empties']
        q_count = sec_info.get('question_count', 0) or 1

        avg_net = sum(nets) / len(nets) if nets else 0
        avg_correct = sum(corrects) / len(corrects) if corrects else 0
        avg_wrong = sum(wrongs) / len(wrongs) if wrongs else 0
        avg_empty = sum(empties) / len(empties) if empties else 0
        empty_pct = round((avg_empty / q_count) * 100, 1) if q_count else 0

        # Dağılım analizi — dinamik aralıklar
        step = max(1, q_count // 4)
        ranges = []
        for i in range(0, q_count + 1, step):
            end = min(i + step, q_count + 1)
            count = sum(1 for n in nets if i <= n < end)
            ranges.append({
                'label': f'{i}–{end - 1}' if end - 1 > i else str(i),
                'min': i,
                'max': end - 1,
                'count': count,
            })
        # Son aralık: step'ten fazla net yapanlar
        if ranges and ranges[-1]['max'] < max(nets, default=0):
            overflow = sum(1 for n in nets if n > ranges[-1]['max'])
            if overflow:
                ranges.append({
                    'label': f'{ranges[-1]["max"] + 1}+',
                    'min': ranges[-1]['max'] + 1,
                    'max': 999,
                    'count': overflow,
                })

        result_sections.append({
            'section_id': sid,
            'section_name': sec_info['name'],
            'question_count': q_count,
            'is_sub_section': sec_info.get('is_sub', False),
            'parent_id': sec_info.get('parent_id'),
            'student_count': len(nets),

            'ortalama_net': round(avg_net, 2),
            'ortalama_dogru': round(avg_correct, 2),
            'ortalama_yanlis': round(avg_wrong, 2),
            'ortalama_bos': round(avg_empty, 2),
            'bos_orani': empty_pct,
            'max_net': round(max(nets), 2) if nets else 0,
            'min_net': round(min(nets), 2) if nets else 0,
            'std_sapma': calculate_std_dev(nets),
            'medyan_net': round(_median(nets), 2),

            'dagilim': ranges,
        })

    # Sırala: üst bölümler önce, alt bölümler sonra
    result_sections.sort(key=lambda x: (
        x.get('is_sub_section', False),
        sec_map.get(x['section_id'], {}).get('order', 0) if x['section_id'] in sec_map else 999,
    ))

    return Response({'sections': result_sections})


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  4️⃣ ÖĞRENCİ BAZLI DETAY ANALİZ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_analysis_students(request, exam_pk):
    """
    Öğrenci bazlı detay analiz.

    GET /exams/{exam_pk}/analysis/students/?session_id=X&student_id=Y
    """
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err

    session_id = request.query_params.get('session_id')
    student_id = request.query_params.get('student_id')
    ranking_year = int(request.query_params.get('ranking_year', 2025))

    answers = _get_session_answers(exam, session_id)
    if not answers.exists():
        return Response({'students': [], 'message': 'Sonuç yok.'})

    sec_map = _build_section_map(exam)
    all_nets = [_safe_float(a.total_net) for a in answers]
    is_ayt = exam.exam_type == 'YKS_AYT'

    # Puan hesapla ve sırala
    student_list = []
    for a in answers:
        sec_nets = _build_scoring_nets(a, exam)
        section_details = []
        for ss in a.section_scores.all():
            sec_name = ss.section.name
            section_details.append({
                'section_id': ss.section_id,
                'section_name': sec_name,
                'correct': ss.correct,
                'wrong': ss.wrong,
                'empty': ss.empty,
                'net': _safe_float(ss.net),
                'question_count': sec_map.get(ss.section_id, {}).get('question_count', 0),
            })

        # AYT sınavlarında 3 puan türünü hesapla
        if is_ayt:
            tyt_nets = _get_linked_tyt_nets(exam, a.student_id, a.raw_student_name, a.raw_student_id) if hasattr(exam, 'linked_tyt_exam') and exam.linked_tyt_exam else {}
            all_scores_data = calculate_all_ayt_scores(sec_nets, tyt_nets)
            score_data = all_scores_data['SAY']  # Varsayılan sıralama için SAY puanı
            puan_turleri_student = {
                pt: {
                    'puan': d['puan'],
                    'ham_puan': d['ham_puan'],
                    'ayt_net': d['ayt_net'],
                    'tyt_net': d.get('tyt_net', 0),
                }
                for pt, d in all_scores_data.items()
            }
        else:
            score_data = calculate_score_for_exam(exam, sec_nets, student_id=a.student_id, raw_student_name=a.raw_student_name, raw_student_id=a.raw_student_id)
            puan_turleri_student = None

        ranking_data = estimate_ranking(score_data['puan'], exam.exam_type, ranking_year)

        # Güçlü / zayıf alanlar
        sorted_sections = sorted(section_details, key=lambda x: x['net'], reverse=True)
        strong = sorted_sections[:2] if len(sorted_sections) >= 2 else sorted_sections
        weak = sorted_sections[-2:] if len(sorted_sections) >= 2 else []

        # Sınıf bilgisi + Alan
        sinif_adi = ''
        alan_kodu = _get_student_alan(a.student, exam.egitim_yili)
        if a.student:
            kayit = OgrenciKayit.objects.filter(
                ogrenci=a.student,
                egitim_yili=exam.egitim_yili,
                aktif_mi=True,
            ).select_related('sinif').first()
            if kayit:
                sinif_adi = kayit.sinif.ad

        student_list.append({
            'answer_id': a.id,
            'student_id': a.student_id,
            'student_name': f'{a.student.ad} {a.student.soyad}' if a.student else (a.raw_student_name or a.raw_student_id),
            'raw_student_id': a.raw_student_id,
            'sinif': sinif_adi,
            'alan': alan_kodu,
            'toplam_net': _safe_float(a.total_net),
            'total_correct': a.total_correct,
            'total_wrong': a.total_wrong,
            'total_empty': a.total_empty,
            'puan': score_data['puan'],
            'ham_puan': score_data['ham_puan'],
            'puan_turleri': puan_turleri_student,
            'tahmini_siralama': ranking_data.get('tahmini_siralama'),
            'yuzdelik_dilim': ranking_data.get('yuzdelik_dilim'),
            'kurum_ici_yuzdelik': calculate_percentile(_safe_float(a.total_net), all_nets),
            'section_details': section_details,
            'strong_areas': [{'name': s['section_name'], 'net': s['net']} for s in strong],
            'weak_areas': [{'name': s['section_name'], 'net': s['net']} for s in weak],
        })

    # student_id filtresi
    if student_id:
        student_list = [s for s in student_list if str(s.get('student_id')) == student_id]

    # Puana göre sırala
    student_list.sort(key=lambda x: x['puan'], reverse=True)

    # Kurum içi sıralama ekle
    for idx, s in enumerate(student_list, 1):
        s['kurum_ici_sira'] = idx
        s['toplam_ogrenci'] = len(student_list)

    # Öğrenci geçmiş sınavları (net gelişim trendi)
    if student_id:
        for stu in student_list:
            sid = stu.get('student_id')
            if sid:
                past_answers = (
                    StudentAnswer.objects
                    .filter(
                        student_id=sid,
                        session__exam__exam_type=exam.exam_type,
                        session__exam__kurum=exam.kurum,
                        session__status='COMPLETED',
                    )
                    .select_related('session__exam')
                    .order_by('session__exam__exam_date', 'session__exam__created_at')
                )
                trend_data = []
                for pa in past_answers:
                    trend_data.append({
                        'exam_id': pa.session.exam_id,
                        'exam_name': pa.session.exam.name,
                        'exam_date': str(pa.session.exam.exam_date) if pa.session.exam.exam_date else None,
                        'toplam_net': _safe_float(pa.total_net),
                    })
                stu['net_trend'] = trend_data

    return Response({
        'students': student_list,
        'total_students': len(student_list),
    })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  4️⃣-B ÖĞRENCİ DETAY (tek öğrenci — sınıf/kurum kıyaslama verisi ile)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_analysis_student_detail(request, exam_pk, answer_pk):
    """
    Tek öğrencinin detaylı analizi — sınıf/kurum ortalamalarıyla kıyaslama.

    GET /exams/{exam_pk}/analysis/students/{answer_pk}/detail/
    """
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err

    try:
        answer = StudentAnswer.objects.select_related('student', 'session').prefetch_related(
            'section_scores__section'
        ).get(pk=answer_pk, session__exam=exam)
    except StudentAnswer.DoesNotExist:
        return Response({'error': 'Öğrenci cevabı bulunamadı.'}, status=404)

    ranking_year = int(request.query_params.get('ranking_year', 2025))
    sec_map = _build_section_map(exam)

    # ── Tüm cevaplar (kurum ortalaması için) ──────────────────────────────
    all_answers = _get_session_answers(exam)
    all_nets = [_safe_float(a.total_net) for a in all_answers]
    total_students = len(all_nets)
    kurum_avg_net = sum(all_nets) / total_students if total_students else 0

    # Kurum section ortalamalarını hesapla
    kurum_section_nets = defaultdict(list)
    for a in all_answers:
        for ss in a.section_scores.all():
            kurum_section_nets[ss.section_id].append(_safe_float(ss.net))

    kurum_section_avgs = {}
    for sec_id, nets in kurum_section_nets.items():
        kurum_section_avgs[sec_id] = round(sum(nets) / len(nets), 2) if nets else 0

    # ── Sınıf ortalaması ──────────────────────────────────────────────────
    sinif_adi = ''
    sinif_avg_net = 0
    sinif_section_avgs = {}
    sinif_student_count = 0
    sinif_rank = 0

    if answer.student:
        kayit = OgrenciKayit.objects.filter(
            ogrenci=answer.student,
            egitim_yili=exam.egitim_yili,
            aktif_mi=True,
        ).select_related('sinif').first()

        if kayit:
            sinif_adi = kayit.sinif.ad
            # Aynı sınıftaki diğer öğrencileri bul
            sinif_student_ids = list(
                OgrenciKayit.objects.filter(
                    sinif=kayit.sinif,
                    egitim_yili=exam.egitim_yili,
                    aktif_mi=True,
                ).values_list('ogrenci_id', flat=True)
            )
            sinif_answers = all_answers.filter(student_id__in=sinif_student_ids)
            sinif_nets = [_safe_float(a.total_net) for a in sinif_answers]
            sinif_student_count = len(sinif_nets)
            sinif_avg_net = round(sum(sinif_nets) / len(sinif_nets), 2) if sinif_nets else 0

            # Sınıf section ortalamaları
            sinif_sec_nets = defaultdict(list)
            for a in sinif_answers:
                for ss in a.section_scores.all():
                    sinif_sec_nets[ss.section_id].append(_safe_float(ss.net))
            for sec_id, nets in sinif_sec_nets.items():
                sinif_section_avgs[sec_id] = round(sum(nets) / len(nets), 2) if nets else 0

            # Sınıf içi sıralama
            sinif_nets_sorted = sorted(sinif_nets, reverse=True)
            student_net = _safe_float(answer.total_net)
            sinif_rank = sinif_nets_sorted.index(student_net) + 1 if student_net in sinif_nets_sorted else 0

    # ── Öğrenci section detayları + kıyaslama ─────────────────────────────
    section_details = []
    for ss in answer.section_scores.all():
        sec_info = sec_map.get(ss.section_id, {})
        q_count = sec_info.get('question_count', 1) or 1
        net_val = _safe_float(ss.net)
        kurum_avg = kurum_section_avgs.get(ss.section_id, 0)
        sinif_avg = sinif_section_avgs.get(ss.section_id, 0)

        # Verimlilik: net / soru sayısı * 100
        verimlilik = round((net_val / q_count) * 100, 1) if q_count else 0
        kurum_verimlilik = round((kurum_avg / q_count) * 100, 1) if q_count else 0
        sinif_verimlilik = round((sinif_avg / q_count) * 100, 1) if q_count else 0

        # Boş bırakma maliyeti: boş * (1/4) potansiyel net kaybı
        bos_maliyet = round(ss.empty * 0.25, 2)

        # Yanlış / (Doğru + Yanlış) oranı — hız vs doğruluk
        attempted = ss.correct + ss.wrong
        hata_orani = round((ss.wrong / attempted) * 100, 1) if attempted else 0

        section_details.append({
            'section_id': ss.section_id,
            'section_name': ss.section.name,
            'is_sub_section': sec_info.get('is_sub', False),
            'parent_id': sec_info.get('parent_id'),
            'correct': ss.correct,
            'wrong': ss.wrong,
            'empty': ss.empty,
            'net': net_val,
            'question_count': q_count,
            'verimlilik': verimlilik,
            'kurum_avg_net': kurum_avg,
            'sinif_avg_net': sinif_avg,
            'kurum_verimlilik': kurum_verimlilik,
            'sinif_verimlilik': sinif_verimlilik,
            'diff_kurum': round(net_val - kurum_avg, 2),
            'diff_sinif': round(net_val - sinif_avg, 2),
            'bos_potansiyel': bos_maliyet,
            'hata_orani': hata_orani,
        })

    # ── Genel bilgiler ────────────────────────────────────────────────────
    student_net = _safe_float(answer.total_net)
    sec_nets = _build_scoring_nets(answer, exam)
    is_ayt = exam.exam_type == 'YKS_AYT'

    if is_ayt:
        tyt_nets = _get_linked_tyt_nets(exam, answer.student_id, answer.raw_student_name, answer.raw_student_id) if hasattr(exam, 'linked_tyt_exam') and exam.linked_tyt_exam else {}
        all_scores_data = calculate_all_ayt_scores(sec_nets, tyt_nets)
        score_data = all_scores_data['SAY']
        puan_turleri_detail = {
            pt: {
                'puan': d['puan'],
                'ham_puan': d['ham_puan'],
                'ayt_net': d['ayt_net'],
                'tyt_net': d.get('tyt_net', 0),
            }
            for pt, d in all_scores_data.items()
        }
    else:
        score_data = calculate_score_for_exam(exam, sec_nets, student_id=answer.student_id, raw_student_name=answer.raw_student_name, raw_student_id=answer.raw_student_id)
        puan_turleri_detail = None

    ranking_data = estimate_ranking(score_data['puan'], exam.exam_type, ranking_year)
    kurum_percentile = calculate_percentile(student_net, all_nets)

    # Kurum sırası
    sorted_all_nets = sorted(all_nets, reverse=True)
    kurum_sira = sorted_all_nets.index(student_net) + 1 if student_net in sorted_all_nets else 0

    # Güçlü / Zayıf
    sorted_sections = sorted(section_details, key=lambda x: x['net'], reverse=True)
    strong = sorted_sections[:2] if len(sorted_sections) >= 2 else sorted_sections
    weak = sorted_sections[-2:] if len(sorted_sections) >= 2 else []

    # ── Net gelişim trendi ────────────────────────────────────────────────
    net_trend = []
    if answer.student:
        past_answers = (
            StudentAnswer.objects
            .filter(
                student=answer.student,
                session__exam__exam_type=exam.exam_type,
                session__exam__kurum=exam.kurum,
                session__status='COMPLETED',
            )
            .select_related('session__exam')
            .prefetch_related('section_scores__section')
            .order_by('session__exam__exam_date', 'session__exam__created_at')
        )
        for pa in past_answers:
            pa_sections = {}
            for pss in pa.section_scores.all():
                pa_sections[pss.section.name] = _safe_float(pss.net)
            net_trend.append({
                'exam_id': pa.session.exam_id,
                'exam_name': pa.session.exam.name,
                'exam_date': str(pa.session.exam.exam_date) if pa.session.exam.exam_date else None,
                'toplam_net': _safe_float(pa.total_net),
                'section_nets': pa_sections,
            })

    # ── Toplam boş maliyet analizi ────────────────────────────────────────
    total_empty = answer.total_empty
    total_bos_potansiyel = round(total_empty * 0.25, 2)

    # Doğruluk oranı
    attempted = answer.total_correct + answer.total_wrong
    dogruluk_orani = round((answer.total_correct / attempted) * 100, 1) if attempted else 0

    student_name = f'{answer.student.ad} {answer.student.soyad}' if answer.student else (answer.raw_student_name or answer.raw_student_id)

    return Response({
        'answer_id': answer.id,
        'student_id': answer.student_id,
        'student_name': student_name,
        'raw_student_id': answer.raw_student_id,
        'sinif': sinif_adi,
        'sinif_student_count': sinif_student_count,
        'sinif_rank': sinif_rank,
        'toplam_net': student_net,
        'total_correct': answer.total_correct,
        'total_wrong': answer.total_wrong,
        'total_empty': answer.total_empty,
        'total_questions': exam.total_questions,
        'puan': score_data['puan'],
        'ham_puan': score_data['ham_puan'],
        'puan_turleri': puan_turleri_detail,
        'tahmini_siralama': ranking_data.get('tahmini_siralama'),
        'yuzdelik_dilim': ranking_data.get('yuzdelik_dilim'),
        'kurum_ici_yuzdelik': kurum_percentile,
        'kurum_ici_sira': kurum_sira,
        'toplam_ogrenci': total_students,
        'kurum_avg_net': round(kurum_avg_net, 2),
        'sinif_avg_net': sinif_avg_net,
        'section_details': section_details,
        'strong_areas': [{'name': sd['section_name'], 'net': sd['net']} for sd in strong],
        'weak_areas': [{'name': sd['section_name'], 'net': sd['net']} for sd in weak],
        'net_trend': net_trend,
        'dogruluk_orani': dogruluk_orani,
        'toplam_bos_potansiyel': total_bos_potansiyel,
        'referans_yil': ranking_data.get('referans_yil', 2025),
    })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  5️⃣ SINIF / ŞUBE ANALİZİ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_analysis_classes(request, exam_pk):
    """
    Sınıf/Şube analizi.

    GET /exams/{exam_pk}/analysis/classes/?session_id=X
    """
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err

    session_id = request.query_params.get('session_id')
    answers = _get_session_answers(exam, session_id)

    if not answers.exists():
        return Response({'classes': [], 'message': 'Sonuç yok.'})

    # Öğrenci → sınıf map
    student_ids = [a.student_id for a in answers if a.student_id]
    kayitlar = OgrenciKayit.objects.filter(
        ogrenci_id__in=student_ids,
        egitim_yili=exam.egitim_yili,
        aktif_mi=True,
    ).select_related('sinif').values('ogrenci_id', 'sinif__id', 'sinif__ad')

    student_sinif_map = {k['ogrenci_id']: k for k in kayitlar}

    # Sınıf bazında gruplama
    class_data = defaultdict(lambda: {'nets': [], 'students': 0, 'section_nets': defaultdict(list)})

    for a in answers:
        sinif_info = student_sinif_map.get(a.student_id)
        sinif_name = sinif_info['sinif__ad'] if sinif_info else 'Sınıfsız'
        sinif_id = sinif_info['sinif__id'] if sinif_info else 0

        key = f'{sinif_id}_{sinif_name}'
        class_data[key]['sinif_id'] = sinif_id
        class_data[key]['sinif_name'] = sinif_name
        class_data[key]['nets'].append(_safe_float(a.total_net))
        class_data[key]['students'] += 1

        for ss in a.section_scores.all():
            class_data[key]['section_nets'][ss.section.name].append(_safe_float(ss.net))

    result = []
    for key, data in class_data.items():
        nets = data['nets']
        avg_net = sum(nets) / len(nets) if nets else 0
        threshold = exam.total_questions * 0.5 if exam.total_questions else 60
        success_count = sum(1 for n in nets if n >= threshold)
        success_pct = round((success_count / len(nets)) * 100, 1) if nets else 0

        # Ders bazlı ortalamaları
        section_avgs = {}
        for sec_name, sec_nets in data['section_nets'].items():
            section_avgs[sec_name] = round(sum(sec_nets) / len(sec_nets), 2) if sec_nets else 0

        result.append({
            'sinif_id': data.get('sinif_id', 0),
            'sinif_name': data.get('sinif_name', ''),
            'student_count': data['students'],
            'ortalama_net': round(avg_net, 2),
            'max_net': round(max(nets), 2) if nets else 0,
            'min_net': round(min(nets), 2) if nets else 0,
            'medyan_net': round(_median(nets), 2),
            'std_sapma': calculate_std_dev(nets),
            'basari_yuzdesi': success_pct,
            'section_avgs': section_avgs,
        })

    result.sort(key=lambda x: x['ortalama_net'], reverse=True)

    return Response({'classes': result})


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  7️⃣ SIRALAMA ve YÜZDELİK DİLİM
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@renderer_classes([JSONRenderer, XlsxRenderer, CsvRenderer])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_analysis_rankings(request, exam_pk):
    """
    Sıralama ve yüzdelik dilim analizi.

    GET /exams/{exam_pk}/analysis/rankings/?session_id=X
    Excel/CSV dışa aktarma: ?format=xlsx veya ?format=csv
    """
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err

    session_id = request.query_params.get('session_id')
    ranking_year = int(request.query_params.get('ranking_year', 2025))
    answers = _get_session_answers(exam, session_id)

    if not answers.exists():
        return Response({'rankings': [], 'message': 'Sonuç yok.'})

    sec_map = _build_section_map(exam)

    # Section sıralama bilgisi (frontend tablo başlıkları için)
    all_sections = exam.sections.all().order_by('order')
    sections_info = []
    for sec in all_sections:
        sections_info.append({
            'id': sec.id,
            'name': sec.name,
            'is_sub_section': sec.is_sub_section,
            'parent_id': sec.parent_section_id,
            'question_count': sec.question_count,
        })

    # Puan hesapla
    is_ayt = exam.exam_type == 'YKS_AYT'
    ranking_list = []
    for a in answers:
        sec_nets = _build_scoring_nets(a, exam)
        section_scores_detail = {}  # str(section_id) → {net, correct, wrong, empty}
        for ss in a.section_scores.all():
            section_scores_detail[str(ss.section_id)] = {
                'net': _safe_float(ss.net),
                'correct': ss.correct,
                'wrong': ss.wrong,
                'empty': ss.empty,
            }

        if is_ayt:
            tyt_nets = _get_linked_tyt_nets(exam, a.student_id, a.raw_student_name, a.raw_student_id) if hasattr(exam, 'linked_tyt_exam') and exam.linked_tyt_exam else {}
            all_scores_data = calculate_all_ayt_scores(sec_nets, tyt_nets)
            score_data = all_scores_data['SAY']
            # Her puan türü için puan + tahmini sıralama
            _pt_type_map = {'SAY': 'YKS_AYT', 'EA': 'YKS_AYT_EA', 'SOZ': 'YKS_AYT_SOZ'}
            puan_turleri_r = {}
            for pt, d in all_scores_data.items():
                pt_est = estimate_ranking(d['puan'], _pt_type_map.get(pt, 'YKS_AYT'), ranking_year)
                puan_turleri_r[pt] = {
                    'puan': d['puan'],
                    'tahmini_siralama': pt_est.get('tahmini_siralama'),
                    'yuzdelik_dilim': pt_est.get('yuzdelik_dilim'),
                }
        else:
            score_data = calculate_score_for_exam(exam, sec_nets, student_id=a.student_id, raw_student_name=a.raw_student_name, raw_student_id=a.raw_student_id)
            puan_turleri_r = None

        est = estimate_ranking(score_data['puan'], exam.exam_type, ranking_year)

        # Sınıf ve Alan bilgisi
        sinif_adi = ''
        alan_kodu = _get_student_alan(a.student, exam.egitim_yili)
        if a.student:
            kayit = OgrenciKayit.objects.filter(
                ogrenci=a.student,
                egitim_yili=exam.egitim_yili,
                aktif_mi=True,
            ).select_related('sinif').first()
            if kayit:
                sinif_adi = kayit.sinif.ad

        ranking_list.append({
            'answer_id': a.id,
            'student_id': a.student_id,
            'student_name': f'{a.student.ad} {a.student.soyad}' if a.student else (a.raw_student_name or a.raw_student_id),
            'raw_student_id': a.raw_student_id or '',
            'toplam_net': _safe_float(a.total_net),
            'total_correct': a.total_correct,
            'total_wrong': a.total_wrong,
            'total_empty': a.total_empty,
            'puan': score_data['puan'],
            'puan_turleri': puan_turleri_r,
            'tahmini_siralama': est.get('tahmini_siralama'),
            'yuzdelik_dilim': est.get('yuzdelik_dilim'),
            'section_nets': section_scores_detail,
            'sinif': sinif_adi,
            'alan': alan_kodu,
        })

    # Puana göre sırala
    ranking_list.sort(key=lambda x: x['puan'], reverse=True)

    all_scores = [r['puan'] for r in ranking_list]
    total = len(ranking_list)

    for idx, r in enumerate(ranking_list, 1):
        r['kurum_ici_sira'] = idx
        r['toplam_ogrenci'] = total
        r['kurum_ici_yuzdelik'] = calculate_percentile(r['puan'], all_scores)

    # Yüzdelik dilim dağılımı
    top_10_count = sum(1 for r in ranking_list if r['kurum_ici_yuzdelik'] >= 90)
    bottom_10_count = sum(1 for r in ranking_list if r['kurum_ici_yuzdelik'] <= 10)

    # ── Kurs geneli section ortalamaları ──
    section_avgs = {}  # str(section_id) → {avg_correct, avg_wrong, avg_net}
    section_collectors = defaultdict(lambda: {'corrects': [], 'wrongs': [], 'nets': []})
    for r in ranking_list:
        for sec_id, sec_data in r['section_nets'].items():
            section_collectors[sec_id]['corrects'].append(sec_data['correct'])
            section_collectors[sec_id]['wrongs'].append(sec_data['wrong'])
            section_collectors[sec_id]['nets'].append(sec_data['net'])
    for sec_id, coll in section_collectors.items():
        cnt = len(coll['nets'])
        section_avgs[sec_id] = {
            'avg_correct': round(sum(coll['corrects']) / cnt, 1) if cnt else 0,
            'avg_wrong': round(sum(coll['wrongs']) / cnt, 1) if cnt else 0,
            'avg_net': round(sum(coll['nets']) / cnt, 2) if cnt else 0,
        }

    # ── Kurs geneli puan türü ortalamaları ──
    puan_turleri_avgs = {}
    if is_ayt:
        for pt in ['SAY', 'EA', 'SOZ']:
            vals = [r['puan_turleri'][pt]['puan'] for r in ranking_list if r.get('puan_turleri') and pt in r['puan_turleri']]
            puan_turleri_avgs[pt] = round(sum(vals) / len(vals), 3) if vals else 0

    # ── Sınıf bazlı section ortalamaları ──
    sinif_section_collectors = defaultdict(lambda: defaultdict(lambda: {'corrects': [], 'wrongs': [], 'nets': []}))
    sinif_net_collectors = defaultdict(list)
    sinif_puan_collectors = defaultdict(list)
    sinif_pt_collectors = defaultdict(lambda: defaultdict(list))
    for r in ranking_list:
        sn = r.get('sinif') or 'Sınıfsız'
        sinif_net_collectors[sn].append(r['toplam_net'])
        sinif_puan_collectors[sn].append(r['puan'])
        for sec_id, sec_data in r['section_nets'].items():
            sinif_section_collectors[sn][sec_id]['corrects'].append(sec_data['correct'])
            sinif_section_collectors[sn][sec_id]['wrongs'].append(sec_data['wrong'])
            sinif_section_collectors[sn][sec_id]['nets'].append(sec_data['net'])
        if is_ayt and r.get('puan_turleri'):
            for pt in ['SAY', 'EA', 'SOZ']:
                if pt in r['puan_turleri']:
                    sinif_pt_collectors[sn][pt].append(r['puan_turleri'][pt]['puan'])

    sinif_avgs = {}
    for sn in sinif_net_collectors:
        sec_avgs_for_sinif = {}
        for sec_id, coll in sinif_section_collectors[sn].items():
            cnt = len(coll['nets'])
            sec_avgs_for_sinif[sec_id] = {
                'avg_correct': round(sum(coll['corrects']) / cnt, 1) if cnt else 0,
                'avg_wrong': round(sum(coll['wrongs']) / cnt, 1) if cnt else 0,
                'avg_net': round(sum(coll['nets']) / cnt, 2) if cnt else 0,
            }
        nets = sinif_net_collectors[sn]
        puans = sinif_puan_collectors[sn]
        pt_avgs = {}
        for pt, vals in sinif_pt_collectors[sn].items():
            pt_avgs[pt] = round(sum(vals) / len(vals), 3) if vals else 0
        sinif_avgs[sn] = {
            'student_count': len(nets),
            'avg_net': round(sum(nets) / len(nets), 2) if nets else 0,
            'avg_puan': round(sum(puans) / len(puans), 3) if puans else 0,
            'section_avgs': sec_avgs_for_sinif,
            'puan_turleri_avgs': pt_avgs,
        }

    avg_net_val = round(sum(r['toplam_net'] for r in ranking_list) / total, 2) if total else 0
    avg_score_val = round(sum(all_scores) / len(all_scores), 2) if all_scores else 0

    export_format = (request.query_params.get('format') or '').lower()
    if export_format in ('csv', 'xlsx'):
        from apps.coaching.application.olcme_rankings_export import (
            build_export_columns,
            build_export_meta,
            build_export_rows,
            build_export_stats,
        )
        from shared.export import CsvExportService, ExcelExportService

        rows = build_export_rows(ranking_list, is_ayt=is_ayt)
        columns = build_export_columns(is_ayt=is_ayt)
        meta = build_export_meta(request, exam, report_title=f'{exam.name} — Sıralama Sonuçları')
        filename = f'{exam.name}_siralama'
        if export_format == 'xlsx':
            stats = build_export_stats(ranking_list, avg_net=avg_net_val, avg_score=avg_score_val)
            return ExcelExportService.export(rows, columns, meta=meta, stats=stats, filename=filename)
        return CsvExportService.export(rows, columns, meta=meta, filename=filename)

    return Response({
        'rankings': ranking_list,
        'sections': sections_info,
        'total_students': total,
        'top_10_count': top_10_count,
        'bottom_10_count': bottom_10_count,
        'avg_score': avg_score_val,
        'avg_net': avg_net_val,
        'section_avgs': section_avgs,
        'puan_turleri_avgs': puan_turleri_avgs,
        'sinif_avgs': sinif_avgs,
        'referans_yil': ranking_year,
    })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  8️⃣ ZORLUK ANALİZİ (Madde Analizi)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_analysis_questions(request, exam_pk):
    """
    Madde (soru) analizi — zorluk derecesi, ayırt edicilik, çeldirici analizi.

    GET /exams/{exam_pk}/analysis/questions/?session_id=X&section_id=Y
    """
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err

    session_id = request.query_params.get('session_id')
    section_id = request.query_params.get('section_id')

    answers = _get_session_answers(exam, session_id)
    if not answers.exists():
        return Response({'questions': [], 'message': 'Sonuç yok.'})

    total_students = answers.count()

    # Cevap anahtarı
    answer_key = AnswerKey.objects.filter(exam=exam, is_primary=True).first()
    if not answer_key:
        answer_key = AnswerKey.objects.filter(exam=exam).first()
    if not answer_key:
        return Response({'error': 'Cevap anahtarı bulunamadı.'}, status=400)

    ak_items = AnswerKeyItem.objects.filter(answer_key=answer_key).select_related('section', 'outcome')
    if section_id:
        ak_items = ak_items.filter(section_id=section_id)
    ak_items = ak_items.order_by('question_number')

    # Öğrenci cevaplarını topla
    # Her soru için: A/B/C/D/E/Boş sayısı + doğru/yanlış/boş
    question_stats = {}
    for item in ak_items:
        q_no = str(item.question_number)
        question_stats[q_no] = {
            'question_number': item.question_number,
            'correct_answer': item.correct_answer,
            'is_cancelled': item.is_cancelled,
            'section_id': item.section_id,
            'section_name': item.section.name,
            'outcome_id': item.outcome_id,
            'outcome_code': item.outcome.code if item.outcome else '',
            'outcome_text': item.outcome.text if item.outcome else '',
            'choices': {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'EMPTY': 0},
            'correct_count': 0,
            'wrong_count': 0,
            'empty_count': 0,
        }

    # Toplam net bazında sıralama (üst %27 - alt %27 için)
    sorted_answers = sorted(answers, key=lambda a: _safe_float(a.total_net), reverse=True)
    top_27_count = max(1, int(total_students * 0.27))
    top_group = sorted_answers[:top_27_count]
    bottom_group = sorted_answers[-top_27_count:]

    top_correct = defaultdict(int)
    bottom_correct = defaultdict(int)

    for a in answers:
        comp = a.comparison or {}
        for q_no, q_data in question_stats.items():
            c = comp.get(q_no, {})
            given = c.get('given', '')
            result = c.get('result', 'empty')

            if given in ('A', 'B', 'C', 'D', 'E'):
                q_data['choices'][given] += 1
            else:
                q_data['choices']['EMPTY'] += 1

            if result == 'correct' or result == 'cancelled':
                q_data['correct_count'] += 1
            elif result == 'wrong':
                q_data['wrong_count'] += 1
            else:
                q_data['empty_count'] += 1

    # Üst-alt grup analizi
    for a in top_group:
        comp = a.comparison or {}
        for q_no in question_stats:
            c = comp.get(q_no, {})
            if c.get('result') in ('correct', 'cancelled'):
                top_correct[q_no] += 1

    for a in bottom_group:
        comp = a.comparison or {}
        for q_no in question_stats:
            c = comp.get(q_no, {})
            if c.get('result') in ('correct', 'cancelled'):
                bottom_correct[q_no] += 1

    # Sonuçları derle
    questions_result = []
    for q_no, q_data in question_stats.items():
        correct_pct = round((q_data['correct_count'] / total_students) * 100, 1) if total_students else 0
        wrong_pct = round((q_data['wrong_count'] / total_students) * 100, 1) if total_students else 0
        empty_pct = round((q_data['empty_count'] / total_students) * 100, 1) if total_students else 0

        # Zorluk seviyesi
        if correct_pct >= 70:
            difficulty = 'Kolay'
        elif correct_pct >= 40:
            difficulty = 'Orta'
        else:
            difficulty = 'Zor'

        # Ayırt edicilik indeksi: (Üst %27 doğru oranı - Alt %27 doğru oranı)
        top_pct = (top_correct.get(q_no, 0) / top_27_count) if top_27_count else 0
        bot_pct = (bottom_correct.get(q_no, 0) / top_27_count) if top_27_count else 0
        discrimination = round(top_pct - bot_pct, 3)

        # Çeldirici analizi — en çok seçilen yanlış şık
        wrong_choices = {
            k: v for k, v in q_data['choices'].items()
            if k != q_data['correct_answer'] and k != 'EMPTY' and v > 0
        }
        top_distractor = max(wrong_choices, key=wrong_choices.get) if wrong_choices else None
        top_distractor_pct = round((wrong_choices.get(top_distractor, 0) / total_students) * 100, 1) if top_distractor and total_students else 0

        questions_result.append({
            'question_number': q_data['question_number'],
            'correct_answer': q_data['correct_answer'],
            'is_cancelled': q_data['is_cancelled'],
            'section_id': q_data['section_id'],
            'section_name': q_data['section_name'],
            'outcome_id': q_data['outcome_id'],
            'outcome_code': q_data['outcome_code'],
            'outcome_text': q_data['outcome_text'],

            'correct_pct': correct_pct,
            'wrong_pct': wrong_pct,
            'empty_pct': empty_pct,
            'difficulty': difficulty,
            'discrimination': discrimination,

            'choices': q_data['choices'],
            'top_distractor': top_distractor,
            'top_distractor_pct': top_distractor_pct,
        })

    questions_result.sort(key=lambda x: x['question_number'])

    return Response({
        'questions': questions_result,
        'total_students': total_students,
    })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  9️⃣ STRATEJİ ÖNERİ PANELİ (Otomatik Yorum)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_analysis_strategy(request, exam_pk):
    """
    Otomatik strateji önerileri.

    GET /exams/{exam_pk}/analysis/strategy/?session_id=X
    """
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err

    session_id = request.query_params.get('session_id')
    answers = _get_session_answers(exam, session_id)

    if not answers.exists():
        return Response({'strategies': [], 'message': 'Sonuç yok.'})

    total_students = answers.count()
    strategies = []

    # Ders bazlı analiz
    all_scores = StudentSectionScore.objects.filter(
        student_answer__in=answers,
    ).select_related('section')

    section_stats = defaultdict(lambda: {'nets': [], 'empties': [], 'wrongs': []})
    for ss in all_scores:
        name = ss.section.name
        section_stats[name]['nets'].append(_safe_float(ss.net))
        section_stats[name]['empties'].append(ss.empty)
        section_stats[name]['wrongs'].append(ss.wrong)
        section_stats[name]['q_count'] = ss.section.question_count

    for sec_name, data in section_stats.items():
        nets = data['nets']
        if not nets:
            continue
        avg_net = sum(nets) / len(nets)
        avg_empty = sum(data['empties']) / len(data['empties'])
        avg_wrong = sum(data['wrongs']) / len(data['wrongs'])
        q_count = data.get('q_count', 1) or 1

        # Düşük net uyarısı
        net_ratio = avg_net / q_count
        if net_ratio < 0.3:
            strategies.append({
                'type': 'warning',
                'icon': '⚠️',
                'title': f'{sec_name} — Kritik Seviye',
                'message': f'{sec_name} net ortalaması {avg_net:.1f} ile kritik seviyededir ({q_count} soruda %{net_ratio*100:.0f} başarı).',
                'priority': 1,
            })
        elif net_ratio < 0.5:
            strategies.append({
                'type': 'info',
                'icon': '📊',
                'title': f'{sec_name} — Geliştirilebilir',
                'message': f'{sec_name} ortalaması {avg_net:.1f} net. Bu alanda çalışma yoğunluğu artırılmalıdır.',
                'priority': 2,
            })

        # Yüksek boş oranı
        empty_ratio = avg_empty / q_count
        if empty_ratio > 0.3:
            strategies.append({
                'type': 'warning',
                'icon': '📝',
                'title': f'{sec_name} — Yüksek Boş Oranı',
                'message': f'{sec_name} dersinde ortalama {avg_empty:.1f} soru boş bırakılmaktadır (%{empty_ratio*100:.0f}).',
                'priority': 2,
            })

        # İyi performans
        if net_ratio >= 0.7:
            strategies.append({
                'type': 'success',
                'icon': '✅',
                'title': f'{sec_name} — İyi Performans',
                'message': f'{sec_name} dersinde ortalama {avg_net:.1f} net ile güçlü performans gösterilmektedir.',
                'priority': 3,
            })

    # Trend analizi
    prev_exam = (
        Exam.objects
        .filter(
            exam_type=exam.exam_type,
            kurum=exam.kurum,
            pk__lt=exam.pk,
            status__in=['RESULTS_UPLOADED', 'COMPLETED'],
        )
        .order_by('-pk')
        .first()
    )
    if prev_exam:
        prev_answers = _get_session_answers(prev_exam)
        if prev_answers.exists():
            prev_nets = [_safe_float(a.total_net) for a in prev_answers]
            curr_nets = [_safe_float(a.total_net) for a in answers]
            prev_avg = sum(prev_nets) / len(prev_nets) if prev_nets else 0
            curr_avg = sum(curr_nets) / len(curr_nets) if curr_nets else 0
            diff = curr_avg - prev_avg

            if diff < -3:
                strategies.append({
                    'type': 'warning',
                    'icon': '📉',
                    'title': 'Genel Düşüş Trendi',
                    'message': f'Genel net ortalaması önceki sınava ({prev_exam.name}) göre {abs(diff):.1f} net düşüş göstermektedir.',
                    'priority': 1,
                })
            elif diff > 3:
                strategies.append({
                    'type': 'success',
                    'icon': '📈',
                    'title': 'Genel Artış Trendi',
                    'message': f'Genel net ortalaması önceki sınava ({prev_exam.name}) göre {diff:.1f} net artış göstermektedir.',
                    'priority': 1,
                })

    # Kazanım bazlı zayıf noktalar (eğer cevap anahtarında kazanım varsa)
    ak = AnswerKey.objects.filter(exam=exam, is_primary=True).first()
    if ak:
        outcome_items = AnswerKeyItem.objects.filter(
            answer_key=ak,
            outcome__isnull=False,
        ).select_related('outcome', 'section')

        if outcome_items.exists():
            outcome_stats = defaultdict(lambda: {'correct': 0, 'total': 0, 'name': '', 'section': ''})
            for item in outcome_items:
                q_no = str(item.question_number)
                for a in answers:
                    comp = a.comparison or {}
                    c = comp.get(q_no, {})
                    outcome_stats[item.outcome_id]['total'] += 1
                    outcome_stats[item.outcome_id]['name'] = item.outcome.text[:80]
                    outcome_stats[item.outcome_id]['section'] = item.section.name
                    if c.get('result') in ('correct', 'cancelled'):
                        outcome_stats[item.outcome_id]['correct'] += 1

            for oid, odata in outcome_stats.items():
                if odata['total'] > 0:
                    success_rate = odata['correct'] / odata['total']
                    if success_rate < 0.35:
                        strategies.append({
                            'type': 'warning',
                            'icon': '🎯',
                            'title': f'Kritik Kazanım — {odata["section"]}',
                            'message': f'"{odata["name"]}" kazanımında başarı oranı %{success_rate*100:.0f} ile kritik seviyededir.',
                            'priority': 1,
                        })

    # Sırala: öncelik sırasına göre
    strategies.sort(key=lambda x: x['priority'])

    return Response({'strategies': strategies})


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  🔟 KARŞILAŞTIRMALI ANALİZ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_analysis_comparison(request, exam_pk):
    """
    Karşılaştırmalı analiz — önceki sınavlarla karşılaştırma.

    GET /exams/{exam_pk}/analysis/comparison/
    """
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err

    # Aynı türdeki son 5 sınav
    past_exams = (
        Exam.objects
        .filter(
            exam_type=exam.exam_type,
            kurum=exam.kurum,
            status__in=['RESULTS_UPLOADED', 'COMPLETED'],
        )
        .order_by('-exam_date', '-created_at')[:6]
    )

    comparison_data = []
    for pe in past_exams:
        pe_answers = _get_session_answers(pe)
        if not pe_answers.exists():
            continue

        nets = [_safe_float(a.total_net) for a in pe_answers]
        avg_net = sum(nets) / len(nets) if nets else 0
        katilim = len(nets)

        # Ders bazlı ortalamaları
        sec_scores = StudentSectionScore.objects.filter(
            student_answer__in=pe_answers,
        ).select_related('section')

        sec_avgs = defaultdict(list)
        for ss in sec_scores:
            sec_avgs[ss.section.name].append(_safe_float(ss.net))

        section_avgs = {
            name: round(sum(vals) / len(vals), 2) if vals else 0
            for name, vals in sec_avgs.items()
        }

        comparison_data.append({
            'exam_id': pe.id,
            'exam_name': pe.name,
            'exam_date': str(pe.exam_date) if pe.exam_date else None,
            'is_current': pe.id == exam.id,
            'katilim': katilim,
            'ortalama_net': round(avg_net, 2),
            'max_net': round(max(nets), 2) if nets else 0,
            'min_net': round(min(nets), 2) if nets else 0,
            'section_avgs': section_avgs,
        })

    return Response({'comparisons': comparison_data})
