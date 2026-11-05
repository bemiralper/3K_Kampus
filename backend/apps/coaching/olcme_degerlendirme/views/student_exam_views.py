"""
Öğrenci Sınav Görünümü — Öğrenci detay sayfasındaki Sınav sekmesi için
backend/apps/coaching/olcme_degerlendirme/views/student_exam_views.py

Endpoint:
  GET  /student-exams/<student_id>/
       → Öğrencinin girdiği tüm sınavlar, puanlar, sıralama, ders bazlı net, trend
"""
import logging
from collections import defaultdict
from django.db.models import Max, F
from shared.context import get_secili_egitim_yili_id, get_secili_kurum_id, get_secili_sube_id
from shared.kurum_access import user_can_access_kurum, user_linked_kurum_ids
from shared.sube_access import get_allowed_subeler_for_user
from ..models.scoring_settings import MANAGED_PUAN_YILLARI

from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import StudentAnswer
from apps.coaching.services.coach_access import user_can_access_student
from ..views import CsrfExemptSessionAuthentication
from ..services.development_analysis import build_development_analysis
from ..services.scoring import estimate_ranking
from ..services.scoring_settings import resolve_puan_yili
from ..services.stored_scores import blocks_for_answers
from .analysis_views import (
    _scores_from_block,
    _get_student_alan,
    _ayt11_pt_key,
)

from apps.ogrenci.domain.models import Ogrenci

logger = logging.getLogger(__name__)


def student_exam_scope(request, student_id):
    if not user_can_access_student(request.user, student_id):
        return None, Response({'error': 'Bu öğrenciye erişim yetkiniz yok.'}, status=403)
    student = Ogrenci.objects.filter(pk=student_id).first()
    if not student:
        return None, Response({'error': 'Öğrenci bulunamadı.'}, status=404)
    if not user_can_access_kurum(request.user, student.kurum_id):
        return None, Response({'error': 'Bu kuruma erişim yetkiniz yok.'}, status=403)
    selected = get_secili_kurum_id(request)
    if selected and selected != student.kurum_id:
        return None, Response({'error': 'Öğrenci seçili kuruma ait değil.'}, status=403)
    selected_branch = get_secili_sube_id(request, kurum_id=student.kurum_id)
    if selected_branch and selected_branch != student.sube_id:
        return None, Response({'error': 'Öğrenci seçili şubeye ait değil.'}, status=403)
    if not request.user.is_superuser and user_linked_kurum_ids(request.user):
        allowed = get_allowed_subeler_for_user(request.user, kurum_id=student.kurum_id)
        if not allowed.filter(pk=student.sube_id).exists():
            return None, Response({'error': 'Bu şubeye erişim yetkiniz yok.'}, status=403)
    return student, None


def scoped_answers(request, student):
    qs = StudentAnswer.objects.filter(student=student, session__status='COMPLETED',
        session__exam__kurum_id=student.kurum_id, session__exam__sube_id=student.sube_id, session__exam__is_active=True)
    year = get_secili_egitim_yili_id(request)
    if year:
        qs = qs.filter(session__exam__egitim_yili_id=year)
    latest = qs.order_by().values('session__exam_id').annotate(last=Max('id')).values('last')
    return qs.filter(id__in=latest).select_related('session__exam', 'student').prefetch_related(
        'section_scores__section').order_by(F('session__exam__exam_date').asc(nulls_first=True),
                                           'session__exam__created_at', 'session__exam_id', 'id')


def _safe_float(val):
    if val is None:
        return 0.0
    return float(val)


_UNSET = object()


def _present_answer(exam, answer, year, block, alan_kodu=_UNSET):
    """Kayıtlı puandan koç satırı. Diğer katılımcılar yeniden puanlanmaz."""
    if alan_kodu is _UNSET:
        alan_kodu = _get_student_alan(answer.student, exam.egitim_yili) if answer.student else None
    score_data, ranking_exam_type, puan_turleri, _all, pt_key = _scores_from_block(
        exam, block, alan_kodu, year,
    )
    ranking_data = estimate_ranking(score_data['puan'], ranking_exam_type, year)
    if exam.exam_type in ('YKS_AYT', 'AYT_11'):
        kurum_ici_sira = (block or {}).get('ranks', {}).get(pt_key)
    else:
        kurum_ici_sira = (block or {}).get('kurum_ici_sira')
    toplam = (block or {}).get('toplam_ogrenci') or 0
    return score_data, ranking_data, puan_turleri, kurum_ici_sira, toplam


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def student_exam_results(request, student_id):
    """
    Öğrencinin girdiği tüm sınavların sonuçları + KPI + ders bazlı netler + trend.

    GET /student-exams/<student_id>/
    ?light=1: puan hesaplamadan sınav/net kataloğu; eksik puan null döner.

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
    ogrenci, err = student_exam_scope(request, student_id)
    if err is not None:
        return err

    raw_year = request.query_params.get('ranking_year')
    try:
        request_year = int(raw_year) if raw_year not in (None, '') else None
        if request_year is not None and request_year not in MANAGED_PUAN_YILLARI:
            raise ValueError
    except (ValueError, TypeError):
        return Response({'error': 'Geçerli bir puan referans yılı seçin.'}, status=400)
    light = request.query_params.get('light') == '1'
    exam_type_filter = request.query_params.get('exam_type')  # opsiyonel filtre

    # Öğrencinin tüm cevaplarını al
    answers_qs = scoped_answers(request, ogrenci)

    if exam_type_filter:
        answers_qs = answers_qs.filter(session__exam__exam_type=exam_type_filter)

    answers = list(answers_qs)
    logger.info('[student_exam_results] student_id=%s → %d kayıt bulundu', student_id, len(answers))

    if not answers:
        logger.info('[student_exam_results] student_id=%s → Sınav kaydı yok, boş dönülüyor', student_id)
        return Response({
            'student_name': f'{ogrenci.ad} {ogrenci.soyad}',
            'alan': None,
            'exams': [],
            'kpi': None,
            'net_trend': [],
        })

    exam_results = []
    trend_data = []
    all_nets = []
    all_scores = []
    section_net_totals = defaultdict(list)  # section_name → [netler]

    alan_by_year = {}
    for answer in answers:
        exam = answer.session.exam
        if exam.egitim_yili_id not in alan_by_year:
            alan_by_year[exam.egitim_yili_id] = _get_student_alan(ogrenci, exam.egitim_yili)
        alan_kodu = alan_by_year[exam.egitim_yili_id]

        # Section detayları
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
                'parent_section_id': ss.section.parent_section_id,
                'parent_id': ss.section.parent_section_id,
            })
            # Ders bazlı toplam (ana bölümler)
            if not ss.section.is_sub_section:
                if ss.section.question_count:
                    section_net_totals[sec_name].append(net_val / ss.section.question_count * 100)

        from .analysis_views import _mark_alan_inclusion, _leaf_area_sections
        _mark_alan_inclusion(section_details, exam.exam_type, alan_kodu)
        if light:
            year = request_year or exam.puan_yili or 2026
            field_net = sum(r['net'] for r in _leaf_area_sections(section_details) if r.get('alana_dahil') is not False)
            score_data = {'puan': None, 'ham_puan': None, 'ayt_net': field_net}
            ranking_data, puan_turleri, kurum_ici_sira, total_in_exam = {}, None, 0, 0
        else:
            year = resolve_puan_yili(exam, request_year)
            block = blocks_for_answers(exam, [answer], year).get(answer.id) or {}
            score_data, ranking_data, puan_turleri, kurum_ici_sira, total_in_exam = _present_answer(
                exam, answer, year, block, alan_kodu,
            )
        puan = score_data['puan']
        ham_puan = score_data['ham_puan']
        net_val = _safe_float(score_data.get('ayt_net')) if exam.exam_type == 'YKS_AYT' else _safe_float(answer.total_net)
        all_nets.append(net_val)
        all_scores.append(puan or 0)

        exam_row = {
            'scores_loaded': not light,
            'answer_id': answer.id,
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
            'all_tests_net': _safe_float(answer.total_net),
            'alan': alan_kodu or ('SAYISAL' if exam.exam_type in ('YKS_AYT', 'AYT_11') else None),
            'alan_puan_turu': _ayt11_pt_key(alan_kodu) if exam.exam_type == 'AYT_11' else {'SAYISAL': 'SAY', 'ESIT_AGIRLIK': 'EA', 'SOZEL': 'SOZ'}.get(alan_kodu, 'SAY') if exam.exam_type in ('YKS_AYT', 'AYT_11') else None,
            'referans_yil': ranking_data.get('referans_yil'),
            'egitim_yili_id': exam.egitim_yili_id,
            'total_questions': exam.total_questions,
            'puan': puan,
            'ham_puan': ham_puan,
            'puan_turleri': puan_turleri,
            'tahmini_siralama': ranking_data.get('tahmini_siralama'),
            'yuzdelik_dilim': ranking_data.get('yuzdelik_dilim'),
            'kurum_ici_sira': kurum_ici_sira,
            'toplam_ogrenci': total_in_exam,
            'section_details': section_details,
        }
        if exam.exam_type == 'YKS_AYT':
            from .analysis_views import _leaf_area_sections
            leaves = [r for r in _leaf_area_sections(section_details) if r.get('alana_dahil') is not False]
            for target, key in (('total_correct','correct'), ('total_wrong','wrong'), ('total_empty','empty')):
                exam_row[target] = sum(r[key] for r in leaves)
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
            weakest = min(section_avgs, key=section_avgs.get)
            en_zayif_ders = weakest if section_avgs[weakest] < 55 else None

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

    last_exam = answers[-1].session.exam if answers else None
    alan = _get_student_alan(ogrenci, last_exam.egitim_yili) if last_exam else None

    return Response({
        'student_name': f'{ogrenci.ad} {ogrenci.soyad}',
        'alan': alan,
        'exams': exam_results,
        'scores_loaded': not light,
        'kpi': None if light else kpi,
        'net_trend': [] if light else trend_data,
    })


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def student_exam_development(request, student_id):
    """
    Öğrencinin seçilen sınav penceresindeki ders / konu / kazanım gelişimi.

    GET /student-exams/<student_id>/development/
        ?exam_type=TYT|AYT|LGS|manuel
        &window=1|3|5|10|all
        &exam_ids=1,2,3
        &date_from=YYYY-MM-DD
        &date_to=YYYY-MM-DD
    """
    ogrenci, err = student_exam_scope(request, student_id)
    if err is not None:
        return err

    exam_ids = request.query_params.getlist('exam_ids') or request.query_params.get('exam_ids')
    payload = build_development_analysis(
        ogrenci,
        exam_type=request.query_params.get('exam_type'),
        window=request.query_params.get('window'),
        exam_ids=exam_ids,
        date_from=request.query_params.get('date_from'),
        date_to=request.query_params.get('date_to'),
        answers_queryset=scoped_answers(request, ogrenci),
        custom_selection=request.query_params.get('window') == 'custom',
    )
    return Response(payload)


@api_view(['GET', 'POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def student_exam_study_action(request, student_id):
    from django.db import transaction
    from django.utils import timezone
    from ..models import ExamStudyAction
    student, err = student_exam_scope(request, student_id)
    if err is not None:
        return err
    if request.method == 'GET':
        try:
            action_id = int(request.query_params.get('action_id', ''))
        except (TypeError, ValueError):
            return Response({'error': 'Geçerli bir öneri kimliği gerekli.'}, status=400)
        action = ExamStudyAction.objects.filter(pk=action_id, student=student).first()
        if not action or not scoped_answers(request, student).filter(pk=action.answer_id).exists():
            return Response({'error': 'Öneri seçili dönem/kapsamda bulunamadı.'}, status=404)
        return Response({'id': action.id, 'status': action.status, 'assignment_id': action.assignment_id,
                         'snapshot': action.snapshot, 'note': action.note})
    body = request.data
    status = body.get('status')
    if status not in ('reviewed', 'planned', 'deferred', 'dismissed'):
        return Response({'error': 'Geçersiz karar.'}, status=400)
    if len(str(body.get('note') or '')) > 3000:
        return Response({'error': 'Not en fazla 3000 karakter olmalı.'}, status=400)
    params = body.get('filters') or {}
    if not isinstance(params, dict):
        return Response({'error': 'Geçersiz analiz kapsamı.'}, status=400)
    payload = build_development_analysis(student, exam_type=params.get('exam_type_group'),
        window=params.get('window'), exam_ids=params.get('exam_ids'), date_from=params.get('date_from'),
        date_to=params.get('date_to'), answers_queryset=scoped_answers(request, student),
        custom_selection=params.get('window') == 'custom')
    row = next((r for r in (payload.get('agenda') or {}).get('items', []) if r['key'] == body.get('key')), None)
    if not row or row['revision'] != body.get('revision'):
        return Response({'error': 'Sınav verisi değişti. Analizi yenileyip tekrar inceleyin.'}, status=409)
    with transaction.atomic():
        # Öğrenci kilidi aynı önerinin paralel oluşturulmasını da sıralar.
        Ogrenci.objects.select_for_update().get(pk=student.pk)
        action, _ = ExamStudyAction.objects.select_for_update().get_or_create(student=student,
            source_key=row['key'], defaults={'exam_id': row['exam_id'], 'answer_id': row['answer_id'],
                                           'revision': row['revision'], 'snapshot': {**row, '_filters': payload['filters']}})
        action.events = [*(action.events or []), {'at': timezone.now().isoformat(), 'actor_id': request.user.pk,
            'previous_status': action.status, 'status': status, 'revision': action.revision,
            'note': action.note, 'snapshot': action.snapshot}]
        if not action.assignment_id:
            action.status = status
        action.revision = row['revision']
        action.snapshot = {**row, '_filters': payload['filters']}
        action.note = str(body.get('note') or '')
        action.actor = request.user
        action.save()
    return Response({'id': action.pk, 'status': action.status, 'assignment_id': action.assignment_id})
