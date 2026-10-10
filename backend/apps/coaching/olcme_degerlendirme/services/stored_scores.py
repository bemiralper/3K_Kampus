"""Kayıtlı puan ve kurum sırası.

Ekranlar formülü yeniden çalıştırmaz. Puanı veya kurum sırasını değiştiren
kayıtlar `refresh_exam_scores` çağırır. Kazanım bağlama, metin düzeltme ve
ekran açmak bu kaydı yazmaz.
"""
from __future__ import annotations

from django.db.models import Max
from django.utils import timezone

from ..models.result import StudentAnswer, StudentStoredScore
from ..models.scoring_settings import MANAGED_PUAN_YILLARI
from .scoring import (
    LGS_EXAM_TYPES,
    _lookup_db_coefficients,
    build_linked_tyt_index,
    calculate_ayt_score,
    calculate_lgs_score,
    calculate_tyt_score,
)

_ALAN_TO_PUAN_TURU = {'SAYISAL': 'SAY', 'ESIT_AGIRLIK': 'EA', 'SOZEL': 'SOZ'}
_AYT_KINDS = {'SAY': 'AYT_SAY', 'EA': 'AYT_EA', 'SOZ': 'AYT_SOZ'}


def _latest_matched_ids(exam) -> set[int]:
    return set(
        StudentAnswer.objects.filter(
            session__exam=exam,
            session__status='COMPLETED',
            student__isnull=False,
        )
        .values('student_id')
        .annotate(latest_id=Max('id'))
        .values_list('latest_id', flat=True)
    )


def _alan_by_student(exam, student_ids) -> dict:
    from ..views.analysis_views import _normalize_alan_kodu
    from apps.ogrenci.domain.models import OgrenciKayit

    if not student_ids or not getattr(exam, 'egitim_yili_id', None):
        return {}
    rows = (
        OgrenciKayit.objects
        .filter(
            ogrenci_id__in=student_ids,
            egitim_yili_id=exam.egitim_yili_id,
            aktif_mi=True,
        )
        .select_related('alan', 'sinif__alan')
    )
    out = {}
    for kayit in rows:
        raw = ad = None
        if kayit.alan_id:
            raw, ad = kayit.alan.kod, kayit.alan.ad
        elif kayit.sinif_id and getattr(kayit.sinif, 'alan_id', None):
            raw, ad = kayit.sinif.alan.kod, kayit.sinif.alan.ad
        out[kayit.ogrenci_id] = _normalize_alan_kodu(raw) or _normalize_alan_kodu(ad)
    return out


def _coef_cache(exam):
    cache = {}

    def coef(year, kind):
        key = (int(year), kind)
        if key not in cache:
            cache[key] = _lookup_db_coefficients(exam.kurum_id, int(year), kind)
        return cache[key]

    return coef


def _score_answer(exam, sec_nets, tyt_nets, year, coef):
    exam_type = exam.exam_type
    if exam_type == 'YKS_AYT':
        pts = {}
        for pt, kind in _AYT_KINDS.items():
            data = calculate_ayt_score(
                sec_nets, tyt_nets, puan_turu=pt, year=year,
                coefficients=coef(year, kind),
            )
            pts[pt] = {
                'puan': float(data['puan']),
                'ham_puan': float(data['ham_puan']),
                'ayt_net': float(data.get('ayt_net') or 0),
                'tyt_net': float(data.get('tyt_net') or 0),
            }
        return {'puan_turleri': pts, 'ranks': {}}
    if exam_type in LGS_EXAM_TYPES:
        kind = 'LGS_7' if exam_type == 'LGS_7' else 'LGS'
        data = calculate_lgs_score(
            sec_nets, year=year, coefficients=coef(year, kind), exam=exam, kind=kind,
        )
    else:
        data = calculate_tyt_score(
            sec_nets, year=year, coefficients=coef(year, 'TYT'),
        )
    return {
        'puan': float(data['puan']),
        'ham_puan': float(data['ham_puan']),
    }


def _apply_ranks(exam, answers, year_blocks, alan):
    cohort_ids = _latest_matched_ids(exam)
    cohort = [a for a in answers if a.id in cohort_ids]
    total = len(cohort)
    if exam.exam_type == 'YKS_AYT':
        for pt in ('SAY', 'EA', 'SOZ'):
            ordered = sorted(
                cohort,
                key=lambda a: year_blocks[a.id]['puan_turleri'][pt]['puan'],
                reverse=True,
            )
            for idx, answer in enumerate(ordered, 1):
                year_blocks[answer.id]['ranks'][pt] = idx
        for answer in cohort:
            pt_key = _ALAN_TO_PUAN_TURU.get(alan.get(answer.student_id), 'SAY')
            chosen = year_blocks[answer.id]['puan_turleri'][pt_key]
            year_blocks[answer.id]['puan'] = chosen['puan']
            year_blocks[answer.id]['ham_puan'] = chosen['ham_puan']
            year_blocks[answer.id]['ayt_net'] = chosen['ayt_net']
            year_blocks[answer.id]['tyt_net'] = chosen['tyt_net']
            year_blocks[answer.id]['kurum_ici_sira'] = year_blocks[answer.id]['ranks'].get(pt_key)
            year_blocks[answer.id]['toplam_ogrenci'] = total
        for answer in answers:
            if answer.id in cohort_ids:
                continue
            pt_key = 'SAY'
            chosen = year_blocks[answer.id]['puan_turleri'][pt_key]
            year_blocks[answer.id]['puan'] = chosen['puan']
            year_blocks[answer.id]['ham_puan'] = chosen['ham_puan']
            year_blocks[answer.id]['ayt_net'] = chosen['ayt_net']
            year_blocks[answer.id]['tyt_net'] = chosen['tyt_net']
            year_blocks[answer.id]['toplam_ogrenci'] = total
        return
    ordered = sorted(cohort, key=lambda a: year_blocks[a.id]['puan'], reverse=True)
    for idx, answer in enumerate(ordered, 1):
        year_blocks[answer.id]['kurum_ici_sira'] = idx
        year_blocks[answer.id]['toplam_ogrenci'] = total
    for answer in answers:
        if answer.id not in cohort_ids:
            year_blocks[answer.id]['toplam_ogrenci'] = total


def _save_payload(exam, payload: dict) -> None:
    ids = list(payload)
    existing = {
        row.student_answer_id: row
        for row in StudentStoredScore.objects.filter(student_answer_id__in=ids)
    }
    now = timezone.now()
    create_rows = []
    update_rows = []
    for answer_id, by_year in payload.items():
        row = existing.get(answer_id)
        if row is None:
            create_rows.append(StudentStoredScore(
                student_answer_id=answer_id,
                by_year=by_year,
                updated_at=now,
            ))
        else:
            row.by_year = by_year
            row.updated_at = now
            update_rows.append(row)
    if create_rows:
        StudentStoredScore.objects.bulk_create(create_rows, batch_size=500)
    if update_rows:
        StudentStoredScore.objects.bulk_update(update_rows, ['by_year', 'updated_at'], batch_size=500)
    StudentStoredScore.objects.filter(
        student_answer__session__exam=exam,
    ).exclude(student_answer_id__in=ids).delete()


def _refresh_linked_ayt(exam, follow_linked: bool) -> None:
    if not follow_linked or getattr(exam, 'exam_type', None) != 'YKS_TYT':
        return
    try:
        ayt = exam.linked_ayt_exam
    except Exception:
        return
    if ayt is not None:
        refresh_exam_scores(ayt, follow_linked=False)


def refresh_exam_scores(exam, *, follow_linked: bool = True) -> int:
    """Sınavdaki kayıtlı cevaplardan puan ve kurum sırasını yazar.

    Optik dosyayı yeniden okumaz. Netler StudentAnswer / bölüm skorundadır.
    """
    answers = list(
        StudentAnswer.objects
        .filter(session__exam=exam, session__status='COMPLETED')
        .select_related('student')
        .prefetch_related('section_scores__section')
    )
    if not answers:
        StudentStoredScore.objects.filter(student_answer__session__exam=exam).delete()
        _refresh_linked_ayt(exam, follow_linked)
        return 0

    from ..views.analysis_views import _build_scoring_nets

    student_ids = [a.student_id for a in answers if a.student_id]
    index = build_linked_tyt_index(exam, student_ids) if exam.exam_type == 'YKS_AYT' else None
    alan = _alan_by_student(exam, student_ids)
    coef = _coef_cache(exam)
    nets_by_id = {a.id: _build_scoring_nets(a, exam) for a in answers}
    tyt_by_id = {}
    if index is not None:
        for answer in answers:
            tyt_by_id[answer.id] = index.nets_for(
                answer.student_id, answer.raw_student_name, answer.raw_student_id,
            )

    payload = {a.id: {} for a in answers}
    for year in MANAGED_PUAN_YILLARI:
        year_blocks = {
            a.id: _score_answer(exam, nets_by_id[a.id], tyt_by_id.get(a.id) or {}, year, coef)
            for a in answers
        }
        _apply_ranks(exam, answers, year_blocks, alan)
        for answer in answers:
            payload[answer.id][str(year)] = year_blocks[answer.id]

    _save_payload(exam, payload)
    _refresh_linked_ayt(exam, follow_linked)
    return len(answers)


def refresh_kurum_scores(kurum_id) -> int:
    """Katsayı tablosu değişince kurumdaki sonuçlu sınavların puanını yeniler."""
    from ..models.exam import Exam

    total = 0
    for exam in Exam.objects.filter(kurum_id=kurum_id):
        if StudentAnswer.objects.filter(
            session__exam=exam, session__status='COMPLETED',
        ).exists():
            total += refresh_exam_scores(exam, follow_linked=False)
    return total


def blocks_for_answers(exam, answers, year) -> dict[int, dict]:
    """İstenen yılın kayıtlı puanı. Eksik satır varsa sınav bir kez yazılır."""
    answers = list(answers)
    if not answers:
        return {}
    year_key = str(int(year))
    ids = [a.id for a in answers]

    def load():
        return {
            row.student_answer_id: row
            for row in StudentStoredScore.objects.filter(student_answer_id__in=ids)
        }

    rows = load()

    def missing(found):
        for answer_id in ids:
            block = (found.get(answer_id).by_year if found.get(answer_id) else None) or {}
            if year_key not in block:
                return True
        return False

    if missing(rows):
        refresh_exam_scores(exam)
        rows = load()

    out = {}
    for answer_id in ids:
        row = rows.get(answer_id)
        block = ((row.by_year if row else None) or {}).get(year_key) or {}
        out[answer_id] = block
    return out
