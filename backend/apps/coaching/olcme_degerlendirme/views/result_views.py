"""
Sonuç Yükleme View'ları

DATUploadViewSet:
  - upload       → DAT dosyasını yükle (multipart/form-data)
  - parse        → Yüklenen dosyayı field_mappings ile oku ve skorla
  - list_results → Sınava ait tüm öğrenci sonuçları
  - delete       → Yükleme oturumunu sil
  - sessions     → Sınava ait DAT yükleme oturumları
"""
import json
import logging
import unicodedata
from collections import Counter
from difflib import SequenceMatcher

from django.db import transaction
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes, parser_classes, authentication_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import (
    Exam, ExamSection, ExamSession,
    AnswerKey, AnswerKeyItem,
    StudentAnswer, StudentSectionScore,
)
from ..serializers.result import (
    ExamSessionListSerializer,
    StudentAnswerSerializer,
)
from ..views import CsrfExemptSessionAuthentication
from ..interfaces.sube_context import get_exam_or_response

logger = logging.getLogger(__name__)


def _normalize_name(name: str) -> str:
    """Türkçe karakter ve büyük/küçük harf normalleştirme."""
    if not name:
        return ''
    # Küçük harfe çevir
    s = name.strip().lower()
    # Türkçe karakterleri ASCII'ye dönüştür
    tr_map = str.maketrans('çğıöşü', 'cgiosu')
    s = s.translate(tr_map)
    # Birden fazla boşluğu teke indir
    return ' '.join(s.split())


def _name_similarity(name_a: str, name_b: str) -> float:
    """İki isim arasındaki benzerlik skoru (0.0 — 1.0).
    Ad+Soyad sırasını da göz önüne alır (ters çevrili).
    """
    na = _normalize_name(name_a)
    nb = _normalize_name(name_b)
    if not na or not nb:
        return 0.0
    # Normal karşılaştırma
    sim = SequenceMatcher(None, na, nb).ratio()
    # Ters çevrilmiş karşılaştırma (ad soyad ↔ soyad ad)
    parts_b = nb.split()
    if len(parts_b) >= 2:
        nb_reversed = ' '.join(parts_b[-1:] + parts_b[:-1])
        sim_rev = SequenceMatcher(None, na, nb_reversed).ratio()
        sim = max(sim, sim_rev)
    return sim


def _match_student(
    tc: str, sid: str, name_raw: str,
    ogrenci_by_tc: dict, ogrenci_by_id: dict,
    ogrenci_list: list, used_student_ids: set,
) -> tuple:
    """
    Öğrenci eşleştirme — öncelik sırası:
      1. TC Kimlik (kesin eşleşme, skor=1.0)
      2. Ad Soyad (tam eşleşme, skor=1.0)
      3. Öğrenci No / PK (kesin eşleşme, skor=1.0)
      4. Ad Soyad benzerliği (fuzzy, skor >= 0.82)

    Returns: (matched_student, match_score, match_method)
    """
    matched_student = None
    match_score = 0.0
    match_method = ''

    # ─ Adım 1: TC kimlik ile kesin eşleştirme
    if tc:
        matched_student = ogrenci_by_tc.get(tc.strip())
        if matched_student:
            match_score = 1.0
            match_method = 'tc'

    # ─ Adım 2: Ad Soyad tam eşleşme (normalize edilmiş)
    if not matched_student and name_raw:
        name_norm = _normalize_name(name_raw)
        if name_norm:
            for ogr in ogrenci_list:
                if ogr.pk in used_student_ids:
                    continue
                ogr_norm = _normalize_name(f'{ogr.ad} {ogr.soyad}')
                if name_norm == ogr_norm:
                    matched_student = ogr
                    match_score = 1.0
                    match_method = 'name_exact'
                    break

    # ─ Adım 3: Öğrenci numarası (PK) ile eşleştirme
    if not matched_student and sid:
        matched_student = ogrenci_by_id.get(sid.strip())
        if matched_student:
            match_score = 1.0
            match_method = 'id'

    # ─ Adım 4: İsim benzerliği (fuzzy) — eşik %82
    if not matched_student and name_raw:
        best_ogr = None
        best_sim = 0.0
        for ogr in ogrenci_list:
            if ogr.pk in used_student_ids:
                continue
            full_name = f'{ogr.ad} {ogr.soyad}'
            sim = _name_similarity(name_raw, full_name)
            if sim > best_sim:
                best_sim = sim
                best_ogr = ogr
        if best_ogr and best_sim >= 0.82:
            matched_student = best_ogr
            match_score = round(best_sim, 2)
            match_method = 'name'

    # ─ Duplicate kontrolü
    if matched_student and matched_student.pk in used_student_ids:
        matched_student = None
        match_score = 0.0
        match_method = ''

    if matched_student:
        used_student_ids.add(matched_student.pk)

    return matched_student, match_score, match_method


def _build_ordered_section_nets(section_scores_data: dict, sections: list, sub_sections: list) -> dict:
    """
    section_scores_data (section_id → {correct, wrong, empty, net}) sözlüğünden
    ÖSYM ders sırasına uygun, sıralı section_nets sözlüğü oluştur.

    Kurallar:
    - Ana bölümler order'a göre sıralı (sections zaten order'lı)
    - Alt bölümleri olan ana bölümler dahil EDİLMEZ (ör: ana 'Matematik' 40q atlanır)
    - Alt bölümler kendi order'larına göre ana bölümlerinin pozisyonunda yer alır
    - Bu sayede:
      1. Ders sıralaması ÖSYM yapısına uygun olur
      2. 'Matematik' isim çakışması olmaz (sadece alt bölüm 30q 'Matematik' + 'Geometri' gösterilir)
    """
    # Alt bölümleri parent_id'ye göre grupla
    subs_by_parent: dict[int, list] = {}
    for sub in sub_sections:
        subs_by_parent.setdefault(sub.parent_section_id, []).append(sub)

    result = {}  # OrderedDict davranışı — Python 3.7+ dict insert-order korur

    for main in sections:
        children = subs_by_parent.get(main.id, [])
        if children:
            # Alt bölümler var → ana bölümü atla, alt bölümleri sıralı ekle
            for child in children:
                if child.id in section_scores_data:
                    result[child.name] = section_scores_data[child.id]['net']
        else:
            # Alt bölüm yok → ana bölümü doğrudan ekle
            if main.id in section_scores_data:
                result[main.name] = section_scores_data[main.id]['net']

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DAT YÜKLEME — dosyayı kaydet
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def upload_dat(request, exam_pk):
    """
    DAT dosyasını yükle.

    POST /exams/{exam_pk}/results/upload/
    multipart/form-data:  dat_file=<File>
    """
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err

    dat_file = request.FILES.get('dat_file')
    if not dat_file:
        return Response({'error': 'dat_file alanı zorunludur.'}, status=400)

    # Oturum oluştur
    session = ExamSession.objects.create(
        exam=exam,
        dat_file=dat_file,
        original_filename=dat_file.name,
        status=ExamSession.Status.PENDING,
        uploaded_by=request.user if request.user.is_authenticated else None,
    )

    # Dosya içeriğini oku ve satırları döndür (önizleme)
    try:
        session.dat_file.seek(0)
        raw = session.dat_file.read()
        # Encoding dene (latin-1 her byte'ı kabul eder, en sona koyulmalı)
        for enc in ['utf-8', 'windows-1254', 'iso-8859-9', 'latin-1']:
            try:
                text = raw.decode(enc)
                break
            except (UnicodeDecodeError, LookupError):
                continue
        else:
            text = raw.decode('latin-1', errors='replace')

        lines = text.strip().splitlines()
    except Exception as e:
        session.status = ExamSession.Status.ERROR
        session.error_message = str(e)
        session.save()
        return Response({'error': f'Dosya okunamadı: {str(e)}'}, status=400)

    return Response({
        'session_id': session.id,
        'filename': session.original_filename,
        'total_lines': len(lines),
        'preview_lines': lines,   # tüm satırlar
    }, status=201)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DAT PARSE — mapping ile oku, cevap anahtarıyla karşılaştır, skorla
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  YARDIMCI — skorlama fonksiyonları
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _score_answers(answers_raw, total_questions, booklet,
                   correct_map_a, b_to_a_map, correct_map_b,
                   sections, wrong_penalty, sub_sections=None):
    """
    Cevap string'ini skorla.

    booklet: 'A' veya 'B'
    sections: ana bölümler (is_sub_section=False) — total hesaplaması bunlardan yapılır
    sub_sections: alt bölümler (is_sub_section=True) — skorlanır ama totale dahil edilmez
    Döndürür: (answers_dict, comparison_dict, section_scores_data, totals)
    totals = (t_correct, t_wrong, t_empty, t_net)
    """
    if sub_sections is None:
        sub_sections = []

    is_b = (booklet == 'B')
    use_b_to_a = is_b and b_to_a_map
    use_b_direct = (
        is_b and not b_to_a_map
        and correct_map_b and len(correct_map_b) >= total_questions
    )

    answers_dict = {}
    comparison_dict = {}

    for q_idx, ch in enumerate(answers_raw):
        q_no = q_idx + 1
        if q_no > total_questions:
            break

        given = ch.upper().strip()
        if given in ('A', 'B', 'C', 'D', 'E'):
            answers_dict[str(q_no)] = given
        elif given in (' ', '', '*', '.', '0'):
            answers_dict[str(q_no)] = ''
        else:
            answers_dict[str(q_no)] = given

        # Doğru cevabı bul
        if use_b_to_a:
            a_q_no = b_to_a_map.get(q_no)
            correct_info = correct_map_a.get(a_q_no) if a_q_no else None
        elif use_b_direct:
            correct_info = correct_map_b.get(q_no)
        else:
            correct_info = correct_map_a.get(q_no)

        if correct_info:
            if correct_info['is_cancelled']:
                result_type = 'cancelled'
            elif not given or given in (' ', '', '*', '.', '0'):
                result_type = 'empty'
            elif given == correct_info['answer']:
                result_type = 'correct'
            else:
                result_type = 'wrong'

            comparison_dict[str(q_no)] = {
                'given': given if given and given not in (' ', '*', '.', '0') else '',
                'correct': correct_info['answer'],
                'result': result_type,
            }

    def _calc_section(sec):
        sc = sw = se = 0
        for q_no in range(sec.question_start, sec.question_end + 1):
            comp = comparison_dict.get(str(q_no), {})
            r = comp.get('result', 'empty')
            if r in ('correct', 'cancelled'):
                sc += 1
            elif r == 'wrong':
                sw += 1
            else:
                se += 1
        net = sc - (sw / wrong_penalty) if wrong_penalty > 0 else sc
        return {'correct': sc, 'wrong': sw, 'empty': se, 'net': round(net, 2)}

    # Ana bölüm skorları (totale dahil)
    section_scores_data = {}
    for sec in sections:
        section_scores_data[sec.id] = _calc_section(sec)

    # Alt bölüm skorları (totale dahil DEĞİL)
    for sec in sub_sections:
        section_scores_data[sec.id] = _calc_section(sec)

    # Toplamlar sadece ana bölümlerden
    main_ids = {sec.id for sec in sections}
    t_correct = sum(v['correct'] for sid, v in section_scores_data.items() if sid in main_ids)
    t_wrong = sum(v['wrong'] for sid, v in section_scores_data.items() if sid in main_ids)
    t_empty = sum(v['empty'] for sid, v in section_scores_data.items() if sid in main_ids)
    t_net = t_correct - (t_wrong / wrong_penalty) if wrong_penalty > 0 else t_correct

    return answers_dict, comparison_dict, section_scores_data, (t_correct, t_wrong, t_empty, round(t_net, 2))


def _normalize_lines(lines):
    """
    DAT satırlarını normalize et.
    Bazı satırlar farklı uzunlukta olabiliyor (başta eksik karakter).
    En yaygın satır uzunluğunu referans al, kısa satırları BAŞA boşluk
    ekleyerek hizala — DAT dosyalarında kısa satırlar genelde dosya
    başında prefix/BOM kaybından dolayı baştan eksik olur.
    Mapping pozisyonları sabit-genişlik olduğundan başa ekleme doğrudur.
    """
    if not lines:
        return lines

    # En yaygın uzunluğu bul (non-empty satırlar)
    lengths = [len(ln) for ln in lines if ln.strip()]
    if not lengths:
        return lines

    # En sık tekrar eden uzunluk = beklenen uzunluk
    length_counter = Counter(lengths)
    expected_len = length_counter.most_common(1)[0][0]

    normalized = []
    for ln in lines:
        if not ln.strip():
            normalized.append(ln)
            continue
        diff = expected_len - len(ln)
        if diff > 0:
            # Kısa satır → BAŞA boşluk ekle (DAT sabit-genişlik formatında
            # kısa satırlar genelde dosya başındaki satırlarda olur ve
            # baştan karakter kaybından kaynaklanır)
            normalized.append(' ' * diff + ln)
        else:
            normalized.append(ln)
    return normalized


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def parse_dat(request, exam_pk, session_pk):
    """
    Yüklenen DAT dosyasını field_mappings ile oku ve skorla.

    POST /exams/{exam_pk}/results/{session_pk}/parse/
    JSON body: {
      field_mappings: [
        { "field": "ogrenci_no", "start": 0, "end": 10 },
        { "field": "tc_kimlik",  "start": 10, "end": 21 },
        { "field": "ad_soyad",   "start": 21, "end": 51 },
        { "field": "cevaplar",   "start": 51, "end": 171 },
      ],
      first_line_is_header: false,
      student_id_field: "ogrenci_no",    // "ogrenci_no" | "tc_kimlik"
    }
    """
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err

    try:
        exam = Exam.objects.prefetch_related('sections').get(pk=exam.pk)
    except Exam.DoesNotExist:
        return Response({'error': 'Sınav bulunamadı.'}, status=404)

    try:
        session = ExamSession.objects.get(pk=session_pk, exam=exam)
    except ExamSession.DoesNotExist:
        return Response({'error': 'Yükleme oturumu bulunamadı.'}, status=404)

    # Cevap anahtarını getir — en çok soruya sahip primary olanı tercih et
    answer_keys = (
        AnswerKey.objects
        .filter(exam=exam)
        .prefetch_related('items')
        .order_by('-is_primary')
    )
    answer_key = None
    max_items = 0
    for ak in answer_keys:
        count = ak.items.count()
        if count > max_items:
            max_items = count
            answer_key = ak
    if not answer_key:
        return Response({'error': 'Cevap anahtarı bulunamadı. Önce cevap anahtarını girin.'}, status=400)

    # ── Cevap anahtarı haritaları ────────────────────────────────────────────
    correct_map_a = {}
    # b_question_number ana bölüm (test) bazlı relative numaradır.
    # Alt bölüm item'ları için parent bölümün offset'ini kullanmalıyız.
    parent_offset = {
        sec.id: sec.question_start
        for sec in exam.sections.filter(is_sub_section=False)
    }
    sub_to_parent = {
        sec.id: sec.parent_section_id
        for sec in exam.sections.filter(is_sub_section=True)
        if sec.parent_section_id
    }
    b_to_a_map = {}
    for item in answer_key.items.select_related('section').all():
        correct_map_a[item.question_number] = {
            'answer': item.correct_answer,
            'is_cancelled': item.is_cancelled,
            'section_id': item.section_id,
        }
        if item.b_question_number is not None:
            # Alt bölümse parent'ın offset'i, değilse kendi offset'i
            sec_id = item.section_id
            if sec_id in sub_to_parent:
                offset = parent_offset.get(sub_to_parent[sec_id])
            else:
                offset = parent_offset.get(sec_id)
            if offset is not None:
                b_global = offset + item.b_question_number - 1
                b_to_a_map[b_global] = item.question_number

    correct_map_b = {}
    b_answer_key = (
        AnswerKey.objects
        .filter(exam=exam, booklet='B')
        .prefetch_related('items')
        .first()
    )
    if b_answer_key:
        for item in b_answer_key.items.all():
            correct_map_b[item.question_number] = {
                'answer': item.correct_answer,
                'is_cancelled': item.is_cancelled,
                'section_id': item.section_id,
            }

    # Geriye dönük uyumluluk: b_to_a_map yoksa section bazlı oluştur
    if not b_to_a_map and correct_map_b:
        a_by_section: dict[int, list] = {}
        b_by_section: dict[int, list] = {}
        for q, info in sorted(correct_map_a.items()):
            a_by_section.setdefault(info['section_id'], []).append(q)
        for q, info in sorted(correct_map_b.items()):
            b_by_section.setdefault(info['section_id'], []).append(q)
        for sec_id, a_qs in a_by_section.items():
            b_qs = b_by_section.get(sec_id, [])
            for i, a_q in enumerate(a_qs):
                if i < len(b_qs):
                    b_to_a_map[b_qs[i]] = a_q

    # B kitapçığı desteği var mı?
    has_b_support = bool(b_to_a_map) or (len(correct_map_b) >= sum(
        sec.question_end - sec.question_start + 1
        for sec in exam.sections.filter(is_sub_section=False)
    ))

    # ── Bölümler & Mapping ───────────────────────────────────────────────────
    sections = list(exam.sections.filter(is_sub_section=False).order_by('order'))
    sub_sections = list(exam.sections.filter(is_sub_section=True).order_by('order'))
    all_sections_map = {sec.id: sec for sec in sections + sub_sections}
    section_map = {sec.id: sec for sec in sections}

    data = request.data
    field_mappings = data.get('field_mappings', [])
    first_line_is_header = data.get('first_line_is_header', False)
    student_id_field = data.get('student_id_field', 'ogrenci_no')

    if not field_mappings:
        return Response({'error': 'field_mappings zorunludur.'}, status=400)

    mapping = {}
    for fm in field_mappings:
        mapping[fm['field']] = (fm['start'], fm['end'])

    has_cevaplar = 'cevaplar' in mapping
    section_fields = {k: v for k, v in mapping.items() if k.startswith('ders_')}
    if not has_cevaplar and not section_fields:
        return Response({'error': 'Cevaplar alanı veya ders bazlı alanlardan en az biri mapping içinde olmalıdır.'}, status=400)

    # ── ders_X ID'leri bu sınava ait mi kontrol et & düzelt ─────────────────
    # Kaydedilmiş şablonlardan yüklenen mappingde eski sınav ID'leri olabiliyor.
    # field_mappings'deki label (bölüm adı) kullanarak doğru ID'lere dönüştürür.
    all_exam_section_ids = {sec.id for sec in sections + sub_sections}
    label_map = {}
    for fm in field_mappings:
        if fm.get('field', '').startswith('ders_'):
            label_map[fm['field']] = fm.get('label', '')

    needs_remap = False
    if section_fields:
        for k in section_fields:
            try:
                sid = int(k.replace('ders_', ''))
                if sid not in all_exam_section_ids:
                    needs_remap = True
                    break
            except ValueError:
                pass

    if needs_remap:
        # Bölüm adına göre ID eşleştirme haritası oluştur
        name_to_section = {}
        for sec in sections + sub_sections:
            name_to_section[sec.name.strip().lower()] = sec

        new_section_fields = {}
        new_mapping = {}
        for k, v in mapping.items():
            if k.startswith('ders_'):
                label = label_map.get(k, '').strip().lower()
                matched_sec = name_to_section.get(label)
                if matched_sec:
                    new_key = f'ders_{matched_sec.id}'
                    new_section_fields[new_key] = v
                    new_mapping[new_key] = v
                else:
                    # İsimle eşleşemedi — orijinali koru
                    new_section_fields[k] = v
                    new_mapping[k] = v
            else:
                new_mapping[k] = v

        section_fields = new_section_fields
        mapping = new_mapping

    # Section field'ların ana mı alt mı olduğunu belirle
    # Alt bölüm ID'leri → parent bölüm ID'leri haritası
    sub_section_to_parent = {sec.id: sec.parent_section_id for sec in sub_sections}
    main_section_ids = {sec.id for sec in sections}

    # section_fields içindeki ID'leri ayıkla
    mapped_section_ids = set()
    for k in section_fields:
        try:
            sid = int(k.replace('ders_', ''))
            mapped_section_ids.add(sid)
        except ValueError:
            pass

    # Alt bölüm bazlı mı yoksa ana bölüm bazlı mı eşleştirilmiş?
    has_sub_section_mapping = any(sid in sub_section_to_parent for sid in mapped_section_ids)

    # ── DAT dosyasını oku ────────────────────────────────────────────────────
    try:
        session.dat_file.seek(0)
        raw = session.dat_file.read()
        for enc in ['utf-8', 'windows-1254', 'iso-8859-9', 'latin-1']:
            try:
                text = raw.decode(enc)
                break
            except (UnicodeDecodeError, LookupError):
                continue
        else:
            text = raw.decode('latin-1', errors='replace')
        lines = text.strip().splitlines()
    except Exception as e:
        return Response({'error': f'Dosya okunamadı: {str(e)}'}, status=400)

    if first_line_is_header and len(lines) > 0:
        lines = lines[1:]

    # ── Satır normalizasyonu ─────────────────────────────────────────────────
    # DAT dosyalarında bazı satırlar kayık olabiliyor (başta eksik boşluk).
    # En yaygın uzunluğa göre kısa satırları başa boşluk ekleyerek hizala.
    lines = _normalize_lines(lines)

    total_questions = sum(
        sec.question_end - sec.question_start + 1 for sec in sections
    )
    wrong_penalty = exam.wrong_answer_count

    # ── Öğrenci eşleştirme hazırlığı ────────────────────────────────────────
    # Kuruma + şubeye ait öğrencileri TC ve ID bazlı sözlüklere doldur
    from apps.ogrenci.domain.models import Ogrenci

    all_students = Ogrenci.objects.filter(
        aktif_mi=True,
        kurum_id=exam.kurum_id,
        sube_id=exam.sube_id,
    )

    ogrenci_by_tc: dict[str, Ogrenci] = {}
    ogrenci_by_id: dict[str, Ogrenci] = {}
    ogrenci_list: list[Ogrenci] = []   # isim benzerliği araması için
    for ogr in all_students.only('id', 'ad', 'soyad', 'tc_kimlik_no'):
        if ogr.tc_kimlik_no:
            ogrenci_by_tc[ogr.tc_kimlik_no.strip()] = ogr
        # pk string olarak da sakla (DAT'tan gelen sid ile eşleşmesi için)
        ogrenci_by_id[str(ogr.pk)] = ogr
        ogrenci_list.append(ogr)

    # ── PARSE & SCORE ────────────────────────────────────────────────────────
    results = []
    row_num = 0
    used_student_ids: set[int] = set()   # aynı öğrenciyi iki kez eşleştirme

    try:
        with transaction.atomic():
            StudentAnswer.objects.filter(session=session).delete()

            for i, line in enumerate(lines):
                row_num = i + 1
                if not line.strip():
                    continue

                # ── Alan extract ─────────────────────────────────────────
                sid = ''
                tc = ''
                name_raw = ''
                answers_raw = ''

                if 'ogrenci_no' in mapping:
                    s, e = mapping['ogrenci_no']
                    sid = line[s:e].strip()
                if 'tc_kimlik' in mapping:
                    s, e = mapping['tc_kimlik']
                    tc = line[s:e].strip()
                if 'ad_soyad' in mapping:
                    s, e = mapping['ad_soyad']
                    name_raw = line[s:e].strip()

                # Kitapçık türü
                booklet_raw = ''
                if 'kitapcik_turu' in mapping:
                    s, e = mapping['kitapcik_turu']
                    booklet_raw = line[s:e].strip().upper()
                    # Sayısal kodlama: 1→A, 2→B
                    if booklet_raw == '1':
                        booklet_raw = 'A'
                    elif booklet_raw == '2':
                        booklet_raw = 'B'
                    if booklet_raw not in ('A', 'B', 'C', 'D'):
                        booklet_raw = ''

                # ── Cevapları oku ────────────────────────────────────────
                if has_cevaplar:
                    s, e = mapping['cevaplar']
                    answers_raw = line[s:e]
                elif section_fields:
                    answers_raw = ''
                    if has_sub_section_mapping:
                        # Alt bölüm bazlı eşleştirme — parent bölümleri
                        # alt bölümlerden birleştirerek oluştur
                        for sec in sections:
                            children = [
                                ss for ss in sub_sections
                                if ss.parent_section_id == sec.id
                            ]
                            if children:
                                # Alt bölümler eşleştirilmiş — sırayla birleştir
                                for child in sorted(children, key=lambda x: x.order):
                                    child_field = f'ders_{child.id}'
                                    if child_field in section_fields:
                                        sf_s, sf_e = section_fields[child_field]
                                        answers_raw += line[sf_s:sf_e]
                                    else:
                                        q_count = child.question_end - child.question_start + 1
                                        answers_raw += ' ' * q_count
                            else:
                                # Alt bölüm yok — ana bölümü kullan
                                sec_field = f'ders_{sec.id}'
                                if sec_field in section_fields:
                                    sf_s, sf_e = section_fields[sec_field]
                                    answers_raw += line[sf_s:sf_e]
                                else:
                                    q_count = sec.question_end - sec.question_start + 1
                                    answers_raw += ' ' * q_count
                    else:
                        # Ana bölüm bazlı eşleştirme (mevcut davranış)
                        for sec in sections:
                            sec_field = f'ders_{sec.id}'
                            if sec_field in section_fields:
                                sf_s, sf_e = section_fields[sec_field]
                                answers_raw += line[sf_s:sf_e]
                            else:
                                q_count = sec.question_end - sec.question_start + 1
                                answers_raw += ' ' * q_count

                raw_id = sid or tc or str(row_num)

                # ── Öğrenci eşleştirme ───────────────────────────────────
                matched_student, match_score, match_method = _match_student(
                    tc, sid, name_raw,
                    ogrenci_by_tc, ogrenci_by_id,
                    ogrenci_list, used_student_ids,
                )

                # ── Kitapçık otomatik tespiti ────────────────────────────
                # Kitapçık bilgisi yoksa ve B desteği varsa → her iki
                # kitapçıkla skorla, net'i en yüksek olanı seç.
                booklet_auto_detected = False

                if not booklet_raw and has_b_support:
                    # Hem A hem B olarak skorla
                    _, _, _, totals_a = _score_answers(
                        answers_raw, total_questions, 'A',
                        correct_map_a, b_to_a_map, correct_map_b,
                        sections, wrong_penalty, sub_sections,
                    )
                    _, _, _, totals_b = _score_answers(
                        answers_raw, total_questions, 'B',
                        correct_map_a, b_to_a_map, correct_map_b,
                        sections, wrong_penalty, sub_sections,
                    )
                    # En yüksek net'e göre kitapçık seç
                    if totals_b[3] > totals_a[3]:
                        booklet_raw = 'B'
                    else:
                        booklet_raw = 'A'
                    booklet_auto_detected = True

                # ── Nihai skorlama ───────────────────────────────────────
                answers_dict, comparison_dict, section_scores_data, totals = _score_answers(
                    answers_raw, total_questions, booklet_raw,
                    correct_map_a, b_to_a_map, correct_map_b,
                    sections, wrong_penalty, sub_sections,
                )
                t_correct, t_wrong, t_empty, t_net = totals

                # StudentAnswer oluştur
                sa = StudentAnswer.objects.create(
                    session=session,
                    student=matched_student,
                    raw_student_id=raw_id,
                    raw_student_name=name_raw,
                    booklet=booklet_raw,
                    booklet_auto_detected=booklet_auto_detected,
                    answers=answers_dict,
                    comparison=comparison_dict,
                    total_correct=t_correct,
                    total_wrong=t_wrong,
                    total_empty=t_empty,
                    total_net=t_net,
                    match_score=match_score,
                    match_method=match_method,
                    is_processed=True,
                )

                for sec_id, scores in section_scores_data.items():
                    StudentSectionScore.objects.create(
                        student_answer=sa,
                        section_id=sec_id,
                        correct=scores['correct'],
                        wrong=scores['wrong'],
                        empty=scores['empty'],
                        net=scores['net'],
                    )

                results.append({
                    'id': sa.id,
                    'row': row_num,
                    'ogrenci_no': sid,
                    'tc_kimlik': tc,
                    'student_id': raw_id,
                    'student_name': name_raw,
                    'booklet': booklet_raw,
                    'booklet_auto_detected': booklet_auto_detected,
                    'matched_student_id': matched_student.pk if matched_student else None,
                    'matched_student_name': f'{matched_student.ad} {matched_student.soyad}' if matched_student else None,
                    'match_score': match_score,
                    'match_method': match_method,
                    'total_correct': t_correct,
                    'total_wrong': t_wrong,
                    'total_empty': t_empty,
                    'total_net': t_net,
                    'section_nets': _build_ordered_section_nets(
                        section_scores_data, sections, sub_sections
                    ),
                })

            mc = sum(1 for r in results if r['matched_student_id'])
            session.status = ExamSession.Status.COMPLETED
            session.total_rows = len(results)
            session.matched_count = mc
            session.unmatched_count = len(results) - mc
            session.field_mappings = field_mappings
            session.student_id_field = student_id_field
            session.first_line_is_header = first_line_is_header
            session.save()

    except Exception as e:
        logger.exception('DAT parse error at row %s', row_num)
        session.status = ExamSession.Status.ERROR
        session.error_message = str(e)
        session.save()
        return Response(
            {'error': f'Satır {row_num}: {str(e)}'},
            status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Otomatik exam status geçişi: → RESULTS_UPLOADED
    if exam.status in ('DRAFT', 'ANSWER_KEY_READY'):
        exam.status = 'RESULTS_UPLOADED'
        exam.save(update_fields=['status'])

    final_matched = sum(1 for r in results if r['matched_student_id'])

    return Response({
        'success': True,
        'total_rows': len(results),
        'matched_count': final_matched,
        'unmatched_count': len(results) - final_matched,
        'results': results,
        'session': ExamSessionListSerializer(session).data,
    })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  KİTAPÇIK DEĞİŞTİR — Tek bir öğrenci cevabının kitapçığını değiştir ve
#                        tekrar skorla
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['PATCH'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def update_student_booklet(request, exam_pk, answer_pk):
    """
    Öğrencinin kitapçık türünü değiştir ve sonuçları tekrar skorla.

    PATCH /exams/{exam_pk}/results/{answer_pk}/booklet/
    { "booklet": "A" }  veya { "booklet": "B" }
    """
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    exam = Exam.objects.prefetch_related('sections').get(pk=exam.pk)

    try:
        sa = StudentAnswer.objects.get(pk=answer_pk, session__exam=exam)
    except StudentAnswer.DoesNotExist:
        return Response({'error': 'Öğrenci cevabı bulunamadı.'}, status=404)

    new_booklet = request.data.get('booklet', '').upper().strip()
    if new_booklet not in ('A', 'B', 'C', 'D'):
        return Response({'error': 'Geçerli bir kitapçık türü girin (A, B, C, D).'}, status=400)

    # Cevap haritalarını yeniden oluştur
    # b_question_number ana bölüm (test) bazlı relative numaradır.
    parent_offset = {
        sec.id: sec.question_start
        for sec in exam.sections.filter(is_sub_section=False)
    }
    sub_to_parent = {
        sec.id: sec.parent_section_id
        for sec in exam.sections.filter(is_sub_section=True)
        if sec.parent_section_id
    }
    a_key = AnswerKey.objects.filter(exam=exam, booklet__in=['', 'A'], is_primary=True).first()
    if not a_key:
        a_key = AnswerKey.objects.filter(exam=exam).order_by('-is_primary').first()
    if not a_key:
        return Response({'error': 'Cevap anahtarı bulunamadı.'}, status=400)

    correct_map_a = {}
    b_to_a_map = {}
    for item in a_key.items.select_related('section').all():
        correct_map_a[item.question_number] = {
            'answer': item.correct_answer,
            'is_cancelled': item.is_cancelled,
            'section_id': item.section_id,
        }
        if item.b_question_number is not None:
            sec_id = item.section_id
            if sec_id in sub_to_parent:
                offset = parent_offset.get(sub_to_parent[sec_id])
            else:
                offset = parent_offset.get(sec_id)
            if offset is not None:
                b_global = offset + item.b_question_number - 1
                b_to_a_map[b_global] = item.question_number

    correct_map_b = {}
    b_key = AnswerKey.objects.filter(exam=exam, booklet='B').prefetch_related('items').first()
    if b_key:
        for item in b_key.items.all():
            correct_map_b[item.question_number] = {
                'answer': item.correct_answer,
                'is_cancelled': item.is_cancelled,
                'section_id': item.section_id,
            }

    sections = list(exam.sections.filter(is_sub_section=False).order_by('order'))
    sub_sections = list(exam.sections.filter(is_sub_section=True).order_by('order'))
    total_questions = sum(sec.question_end - sec.question_start + 1 for sec in sections)
    wrong_penalty = exam.wrong_answer_count

    # Mevcut answers_dict'ten cevap string'i oluştur
    answers_raw = ''
    for q in range(1, total_questions + 1):
        ch = sa.answers.get(str(q), '')
        answers_raw += ch if ch else ' '

    # Yeni kitapçıkla skorla
    answers_dict, comparison_dict, section_scores_data, totals = _score_answers(
        answers_raw, total_questions, new_booklet,
        correct_map_a, b_to_a_map, correct_map_b,
        sections, wrong_penalty, sub_sections,
    )
    t_correct, t_wrong, t_empty, t_net = totals

    # Güncelle
    with transaction.atomic():
        sa.booklet = new_booklet
        sa.booklet_auto_detected = False  # Manuel değişiklik
        sa.comparison = comparison_dict
        sa.total_correct = t_correct
        sa.total_wrong = t_wrong
        sa.total_empty = t_empty
        sa.total_net = t_net
        sa.save()

        # Bölüm skorlarını güncelle
        sa.section_scores.all().delete()
        for sec_id, scores in section_scores_data.items():
            StudentSectionScore.objects.create(
                student_answer=sa,
                section_id=sec_id,
                correct=scores['correct'],
                wrong=scores['wrong'],
                empty=scores['empty'],
                net=scores['net'],
            )

    return Response(StudentAnswerSerializer(sa).data)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SONUÇ LİSTESİ — Sınava ait tüm StudentAnswer
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def list_results(request, exam_pk):
    """
    GET /exams/{exam_pk}/results/
    """
    _, err = get_exam_or_response(request, exam_pk)
    if err:
        return err

    qs = (
        StudentAnswer.objects
        .filter(session__exam_id=exam_pk)
        .select_related('student', 'session')
        .prefetch_related('section_scores__section')
        .order_by('-total_net')
    )
    data = StudentAnswerSerializer(qs, many=True).data
    return Response(data)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  OTURUM LİSTESİ & SİL
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def list_sessions(request, exam_pk):
    _, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    qs = ExamSession.objects.filter(exam_id=exam_pk).order_by('-created_at')
    data = ExamSessionListSerializer(qs, many=True).data
    return Response(data)


@api_view(['DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def delete_session(request, exam_pk, session_pk):
    _, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    try:
        session = ExamSession.objects.get(pk=session_pk, exam_id=exam_pk)
    except ExamSession.DoesNotExist:
        return Response({'error': 'Oturum bulunamadı.'}, status=404)
    session.delete()
    return Response(status=204)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  OTURUM SONUÇLARI — Belirli bir session'ın sonuçlarını getir
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def session_results(request, exam_pk, session_pk):
    """
    GET /exams/{exam_pk}/results/sessions/{session_pk}/results/

    Belirli bir DAT oturumunun sonuçlarını döndürür.
    UploadTab'dan çıkıp geri geldiğinde tekrar DAT yüklemeye gerek kalmaz.
    """
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    exam = Exam.objects.prefetch_related('sections').get(pk=exam.pk)

    try:
        session = ExamSession.objects.get(pk=session_pk, exam=exam)
    except ExamSession.DoesNotExist:
        return Response({'error': 'Oturum bulunamadı.'}, status=404)

    sections = list(exam.sections.filter(is_sub_section=False).order_by('order'))
    sub_sections = list(exam.sections.filter(is_sub_section=True).order_by('order'))
    all_sections_map = {sec.id: sec for sec in sections + sub_sections}

    answers = (
        StudentAnswer.objects
        .filter(session=session)
        .select_related('student')
        .prefetch_related('section_scores__section')
        .order_by('raw_student_id')
    )

    results = []
    for idx, sa in enumerate(answers, 1):
        # section_scores → sıralı section_nets dict
        ss_data = {}
        for ss in sa.section_scores.all():
            if ss.section_id in all_sections_map:
                ss_data[ss.section_id] = {
                    'correct': ss.correct, 'wrong': ss.wrong,
                    'empty': ss.empty, 'net': float(ss.net),
                }
        section_nets = _build_ordered_section_nets(ss_data, sections, sub_sections)

        results.append({
            'id': sa.id,
            'row': idx,
            'ogrenci_no': sa.raw_student_id,
            'tc_kimlik': '',
            'student_id': sa.raw_student_id,
            'student_name': sa.raw_student_name,
            'booklet': sa.booklet,
            'booklet_auto_detected': sa.booklet_auto_detected,
            'matched_student_id': sa.student_id,
            'matched_student_name': f'{sa.student.ad} {sa.student.soyad}' if sa.student else None,
            'match_score': sa.match_score if sa.match_score else (1.0 if sa.student else 0.0),
            'match_method': sa.match_method or ('saved' if sa.student else ''),
            'total_correct': sa.total_correct,
            'total_wrong': sa.total_wrong,
            'total_empty': sa.total_empty,
            'total_net': float(sa.total_net),
            'section_nets': section_nets,
        })

    mc = sum(1 for r in results if r['matched_student_id'])

    return Response({
        'success': True,
        'total_rows': len(results),
        'matched_count': mc,
        'unmatched_count': len(results) - mc,
        'results': results,
        'session': ExamSessionListSerializer(session).data,
    })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MANUEL EŞLEŞTİRME — Öğrenci cevabının eşleşme durumunu değiştir
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['PATCH'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def update_student_match(request, exam_pk, answer_pk):
    """
    Öğrenci cevabının eşleştirildiği öğrenciyi manuel değiştir veya kaldır.

    PATCH /exams/{exam_pk}/results/students/{answer_pk}/match/
    { "student_id": 42 }     → Belirtilen öğrenciyle eşleştir
    { "student_id": null }   → Eşleştirmeyi kaldır
    """
    _, err = get_exam_or_response(request, exam_pk)
    if err:
        return err

    try:
        sa = StudentAnswer.objects.select_related('student').get(
            pk=answer_pk, session__exam_id=exam_pk,
        )
    except StudentAnswer.DoesNotExist:
        return Response({'error': 'Öğrenci cevabı bulunamadı.'}, status=404)

    new_student_id = request.data.get('student_id')

    if new_student_id is None:
        # Eşleştirmeyi kaldır
        sa.student = None
        sa.match_score = 0.0
        sa.match_method = ''
        sa.save(update_fields=['student', 'match_score', 'match_method'])
        return Response({
            'id': sa.id,
            'matched_student_id': None,
            'matched_student_name': None,
            'match_score': 0.0,
            'match_method': '',
        })

    try:
        from apps.ogrenci.domain.models import Ogrenci
        student = Ogrenci.objects.get(pk=new_student_id)
    except Ogrenci.DoesNotExist:
        return Response({'error': 'Öğrenci bulunamadı.'}, status=404)

    # Aynı session'da bu öğrenci zaten başka bir satıra eşleştirilmiş mi?
    existing = (
        StudentAnswer.objects
        .filter(session=sa.session, student=student)
        .exclude(pk=sa.pk)
        .first()
    )
    if existing:
        existing_name = f'{existing.raw_student_name}' if existing.raw_student_name else f'#{existing.pk}'
        return Response(
            {'error': f'Bu öğrenci aynı oturumda "{existing_name}" satırına zaten eşleştirilmiş. Önce o eşleştirmeyi kaldırın.'},
            status=400,
        )

    sa.student = student
    sa.match_score = 1.0
    sa.match_method = 'manual'
    sa.save(update_fields=['student', 'match_score', 'match_method'])

    return Response({
        'id': sa.id,
        'matched_student_id': student.pk,
        'matched_student_name': f'{student.ad} {student.soyad}',
        'match_score': 1.0,
        'match_method': 'manual',
    })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ÖĞRENCİ ARAMA — Eşleştirme için öğrenci arama
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def search_students(request, exam_pk):
    """
    Öğrenci arama (eşleştirme dialog'u için).

    GET /exams/{exam_pk}/results/students/search/?q=ali
    """
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err

    q = request.query_params.get('q', '').strip()
    if len(q) < 2:
        return Response([])

    from apps.ogrenci.domain.models import Ogrenci
    from django.db.models import Q, Value, CharField
    from django.db.models.functions import Concat

    qs = Ogrenci.objects.filter(
        aktif_mi=True,
        kurum_id=exam.kurum_id,
        sube_id=exam.sube_id,
    ).annotate(
        full_name=Concat('ad', Value(' '), 'soyad', output_field=CharField())
    ).filter(
        Q(full_name__icontains=q) |
        Q(tc_kimlik_no__icontains=q) |
        Q(pk__icontains=q)
    )[:20]

    data = [
        {
            'id': ogr.pk,
            'ad': ogr.ad,
            'soyad': ogr.soyad,
            'tc_kimlik_no': ogr.tc_kimlik_no or '',
            'full_name': f'{ogr.ad} {ogr.soyad}',
        }
        for ogr in qs
    ]
    return Response(data)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  YENİDEN EŞLEŞTİRME — Eşleşmemiş sonuçları güncel öğrenci havuzuyla
#                        tekrar eşleştir (sonradan kayıt olan öğrenciler için)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def rematch_unmatched(request, exam_pk):
    """
    Eşleşmemiş (student=NULL) StudentAnswer kayıtlarını güncel öğrenci
    havuzuyla yeniden eşleştir.

    POST /exams/{exam_pk}/results/rematch/

    Kullanım senaryosu: Sınava girmiş ama henüz kuruma kayıtlı olmayan
    öğrenciler, kayıt olduktan sonra bu endpoint ile eşleştirilebilir.

    Response: { matched: [...], total_unmatched: N, newly_matched: M }
    """
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err

    # Sınava ait TÜM StudentAnswer kayıtlarını al
    all_answers = (
        StudentAnswer.objects
        .filter(session__exam=exam)
        .select_related('student')
    )

    # Eşleşmemiş kayıtlar (student=NULL)
    unmatched_answers = list(all_answers.filter(student__isnull=True))
    if not unmatched_answers:
        return Response({
            'success': True,
            'message': 'Eşleşmemiş kayıt yok, tüm öğrenciler zaten eşleştirilmiş.',
            'total_unmatched': 0,
            'newly_matched': 0,
            'matched': [],
        })

    # Zaten eşleşmiş öğrenci ID'lerini topla (duplicate engelleme)
    used_student_ids: set[int] = set()
    for sa in all_answers.filter(student__isnull=False):
        used_student_ids.add(sa.student_id)

    # Güncel öğrenci havuzunu oluştur
    from apps.ogrenci.domain.models import Ogrenci

    all_students = Ogrenci.objects.filter(
        aktif_mi=True,
        kurum_id=exam.kurum_id,
        sube_id=exam.sube_id,
    )

    ogrenci_by_tc: dict[str, Ogrenci] = {}
    ogrenci_by_id: dict[str, Ogrenci] = {}
    ogrenci_list: list[Ogrenci] = []
    for ogr in all_students.only('id', 'ad', 'soyad', 'tc_kimlik_no'):
        if ogr.tc_kimlik_no:
            ogrenci_by_tc[ogr.tc_kimlik_no.strip()] = ogr
        ogrenci_by_id[str(ogr.pk)] = ogr
        ogrenci_list.append(ogr)

    # Eşleşmemiş kayıtları tek tek yeniden eşleştir
    newly_matched = []
    with transaction.atomic():
        for sa in unmatched_answers:
            # raw_student_id'den tc ve sid ayıkla
            # DAT parse sırasında raw_student_id olarak sid veya tc veya row_num saklanmış olabilir
            sid = sa.raw_student_id or ''
            name_raw = sa.raw_student_name or ''

            # TC kimlik bilgisi raw_student_id'de olabilir (11 haneli sayı)
            tc = ''
            if sid and len(sid) == 11 and sid.isdigit():
                tc = sid

            matched_student, match_score, match_method = _match_student(
                tc, sid, name_raw,
                ogrenci_by_tc, ogrenci_by_id,
                ogrenci_list, used_student_ids,
            )

            if matched_student:
                sa.student = matched_student
                sa.match_score = match_score
                sa.match_method = match_method
                sa.save(update_fields=['student', 'match_score', 'match_method'])
                newly_matched.append({
                    'answer_id': sa.id,
                    'raw_student_id': sa.raw_student_id,
                    'raw_student_name': sa.raw_student_name,
                    'matched_student_id': matched_student.pk,
                    'matched_student_name': f'{matched_student.ad} {matched_student.soyad}',
                    'match_score': match_score,
                    'match_method': match_method,
                })

    # Session istatistiklerini güncelle
    for session in ExamSession.objects.filter(exam=exam):
        total = StudentAnswer.objects.filter(session=session).count()
        mc = StudentAnswer.objects.filter(session=session, student__isnull=False).count()
        session.matched_count = mc
        session.unmatched_count = total - mc
        session.save(update_fields=['matched_count', 'unmatched_count'])

    return Response({
        'success': True,
        'total_unmatched': len(unmatched_answers),
        'newly_matched': len(newly_matched),
        'still_unmatched': len(unmatched_answers) - len(newly_matched),
        'matched': newly_matched,
    })


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TOPLU YENİDEN EŞLEŞTİRME — Tüm sınavlardaki eşleşmemiş kayıtları
#                               güncel öğrenci havuzuyla tekrar eşleştir
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def rematch_all_exams(request):
    """
    TÜM sınavlardaki eşleşmemiş (student=NULL) StudentAnswer kayıtlarını
    güncel öğrenci havuzuyla yeniden eşleştir.

    POST /exams/rematch-all/

    Kullanım: Sınav listesi sayfasında tek butonla tüm sınavlardaki
    eşleşmemiş kayıtları toplu olarak eşleştirir.

    Response: {
        success, total_unmatched, newly_matched, still_unmatched,
        exam_results: [{exam_id, exam_name, newly_matched, still_unmatched}, ...]
    }
    """
    from ..interfaces.sube_context import mandatory_olcme_context

    ctx, err = mandatory_olcme_context(request)
    if err:
        return err

    # Eşleşmemiş kayıtları olan sınavları bul (aktif şube kapsamında)
    unmatched_exam_ids = (
        StudentAnswer.objects
        .filter(student__isnull=True, session__exam__kurum_id=ctx['kurum_id'], session__exam__sube_id=ctx['sube_id'])
        .values_list('session__exam_id', flat=True)
        .distinct()
    )
    exams = Exam.objects.filter(pk__in=unmatched_exam_ids, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'])

    if not exams.exists():
        return Response({
            'success': True,
            'message': 'Eşleşmemiş kayıt yok, tüm öğrenciler zaten eşleştirilmiş.',
            'total_unmatched': 0,
            'newly_matched': 0,
            'still_unmatched': 0,
            'exam_results': [],
        })

    # Her sınav için kurum farklı olabilir, kurum bazlı öğrenci havuzunu cache'le
    kurum_pools: dict[int, tuple] = {}  # kurum_id → (by_tc, by_id, ogrenci_list)

    def _get_pool(kurum_id, sube_id):
        from apps.ogrenci.domain.models import Ogrenci

        if (kurum_id, sube_id) in kurum_pools:
            return kurum_pools[(kurum_id, sube_id)]
        qs = Ogrenci.objects.filter(aktif_mi=True, kurum_id=kurum_id, sube_id=sube_id)
        by_tc: dict[str, Ogrenci] = {}
        by_id: dict[str, Ogrenci] = {}
        olist: list[Ogrenci] = []
        for ogr in qs.only('id', 'ad', 'soyad', 'tc_kimlik_no'):
            if ogr.tc_kimlik_no:
                by_tc[ogr.tc_kimlik_no.strip()] = ogr
            by_id[str(ogr.pk)] = ogr
            olist.append(ogr)
        kurum_pools[(kurum_id, sube_id)] = (by_tc, by_id, olist)
        return by_tc, by_id, olist

    total_unmatched = 0
    total_newly_matched = 0
    exam_results = []

    with transaction.atomic():
        for exam in exams:
            all_answers = (
                StudentAnswer.objects
                .filter(session__exam=exam)
                .select_related('student')
            )
            unmatched = list(all_answers.filter(student__isnull=True))
            if not unmatched:
                continue

            # Bu sınavda zaten eşleşmiş ID'ler
            used_ids: set[int] = set()
            for sa in all_answers.filter(student__isnull=False):
                used_ids.add(sa.student_id)

            kurum_id = exam.kurum_id if hasattr(exam, 'kurum_id') else None
            sube_id = exam.sube_id if hasattr(exam, 'sube_id') else None
            by_tc, by_id, olist = _get_pool(kurum_id, sube_id)

            exam_matched = 0
            for sa in unmatched:
                sid = sa.raw_student_id or ''
                name_raw = sa.raw_student_name or ''
                tc = ''
                if sid and len(sid) == 11 and sid.isdigit():
                    tc = sid

                matched_student, match_score, match_method = _match_student(
                    tc, sid, name_raw,
                    by_tc, by_id, olist, used_ids,
                )
                if matched_student:
                    sa.student = matched_student
                    sa.match_score = match_score
                    sa.match_method = match_method
                    sa.save(update_fields=['student', 'match_score', 'match_method'])
                    exam_matched += 1

            total_unmatched += len(unmatched)
            total_newly_matched += exam_matched

            if exam_matched > 0 or len(unmatched) > 0:
                exam_results.append({
                    'exam_id': exam.id,
                    'exam_name': exam.name,
                    'newly_matched': exam_matched,
                    'still_unmatched': len(unmatched) - exam_matched,
                })

            # Session istatistiklerini güncelle
            for session in ExamSession.objects.filter(exam=exam):
                total = StudentAnswer.objects.filter(session=session).count()
                mc = StudentAnswer.objects.filter(session=session, student__isnull=False).count()
                session.matched_count = mc
                session.unmatched_count = total - mc
                session.save(update_fields=['matched_count', 'unmatched_count'])

    return Response({
        'success': True,
        'total_unmatched': total_unmatched,
        'newly_matched': total_newly_matched,
        'still_unmatched': total_unmatched - total_newly_matched,
        'exam_results': exam_results,
    })
