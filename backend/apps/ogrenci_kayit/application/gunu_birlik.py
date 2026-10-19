"""Günü birlik deneme kaydı.

Öğrenci açılır, yıllık kayıt / sözleşme / paket açılmaz.
Katılım yalnız seçilen sınava yazılır.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from io import BytesIO

from django.db import transaction

from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.kimlik.application.enforcement import assert_identity_for_new_record
from apps.kimlik.domain.phone import normalize_phone
from apps.kimlik.exceptions import KimlikConflictError
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.ogrenci.services.kayit_turu import GUNU_BIRLIK_CODE

_HEADER_MAP = {
    'ad': 'ad',
    'soyad': 'soyad',
    'tc': 'tc',
    'tckimlik': 'tc',
    'tckimlikno': 'tc',
    'tcno': 'tc',
    'telefon': 'telefon',
    'tel': 'telefon',
    'gsm': 'telefon',
    'seviye': 'seviye',
    'sinifseviyesi': 'seviye',
    'sinif': 'seviye',
}


def _fold(value: str) -> str:
    table = str.maketrans('Iİıi', 'iiii')
    return (value or '').translate(table).casefold().strip()


def _compact(value: str) -> str:
    return re.sub(r'[^a-z0-9]', '', _fold(value))


def normalize_tc(value) -> str:
    return re.sub(r'\D', '', str(value or ''))


@dataclass
class RowOutcome:
    index: int
    ad: str = ''
    soyad: str = ''
    tc_kimlik_no: str = ''
    telefon: str = ''
    sinif_seviyesi_id: int | None = None
    sinif_seviyesi: str = ''
    status: str = ''
    message: str = ''
    ogrenci_id: int | None = None
    girilen_ad: str = ''
    girilen_soyad: str = ''
    _seviye: object = field(default=None, repr=False)

    def as_dict(self) -> dict:
        return {
            'index': self.index,
            'ad': self.ad,
            'soyad': self.soyad,
            'tc_kimlik_no': self.tc_kimlik_no,
            'telefon': self.telefon,
            'sinif_seviyesi_id': self.sinif_seviyesi_id,
            'sinif_seviyesi': self.sinif_seviyesi,
            'status': self.status,
            'message': self.message,
            'ogrenci_id': self.ogrenci_id,
            'girilen_ad': self.girilen_ad,
            'girilen_soyad': self.girilen_soyad,
        }


def load_seviyeler(kurum_id: int, sube_id: int):
    return list(
        SinifSeviyesi.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, aktif_mi=True,
        ).order_by('sira', 'ad')
    )


def _seviye_index(seviyeler):
    by_id = {s.id: s for s in seviyeler}
    by_key = {}
    for seviye in seviyeler:
        for raw in (seviye.kod, seviye.ad):
            folded = _fold(raw)
            compact = _compact(raw)
            by_key.setdefault(folded, seviye)
            if compact:
                by_key.setdefault(compact, seviye)
    return by_id, by_key


def _resolve_seviye(raw, by_id, by_key):
    if raw in (None, ''):
        return None
    if isinstance(raw, int) or (isinstance(raw, str) and str(raw).strip().isdigit()):
        found = by_id.get(int(raw))
        if found:
            return found
    text = str(raw).strip()
    return by_key.get(_fold(text)) or by_key.get(_compact(text))


def _cell(value) -> str:
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def parse_excel(uploaded) -> list[dict]:
    from openpyxl import load_workbook

    wb = load_workbook(uploaded, read_only=True, data_only=True)
    ws = wb.active
    rows = []
    for values in ws.iter_rows(values_only=True):
        if not values or all(v in (None, '') for v in values):
            continue
        rows.append([_cell(v) for v in values])
    wb.close()
    if not rows:
        return []

    header_keys = [_compact(c) for c in rows[0]]
    mapped = [_HEADER_MAP.get(k) for k in header_keys]
    has_header = 'ad' in mapped and 'soyad' in mapped and 'tc' in mapped
    data_rows = rows[1:] if has_header else rows
    if not has_header:
        mapped = ['ad', 'soyad', 'tc', 'telefon', 'seviye']

    parsed = []
    for raw in data_rows:
        item = {'ad': '', 'soyad': '', 'tc': '', 'telefon': '', 'seviye': ''}
        for idx, key in enumerate(mapped):
            if not key or idx >= len(raw):
                continue
            item[key] = raw[idx]
        if not any(item.values()):
            continue
        parsed.append({
            'ad': item['ad'],
            'soyad': item['soyad'],
            'tc_kimlik_no': item['tc'],
            'telefon': item['telefon'],
            'sinif_seviyesi': item['seviye'],
        })
    return parsed


def excel_template() -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = 'Gunu birlik'
    ws.append(['Ad', 'Soyad', 'TC', 'Telefon', 'Seviye'])
    ws.append(['Ayşe', 'Yılmaz', '12345678901', '05321112233', '12'])
    ws.append([])
    ws.append(['Seviye sütununa sınıf seviyesi kodu veya adı yazılır (ör. 12 veya 12. Sınıf).'])
    for col, width in zip('ABCDE', (18, 18, 16, 16, 18)):
        ws.column_dimensions[col].width = width
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _blank_outcome(index: int, raw: dict) -> RowOutcome:
    return RowOutcome(
        index=index,
        ad=(raw.get('ad') or '').strip(),
        soyad=(raw.get('soyad') or '').strip(),
        tc_kimlik_no=normalize_tc(raw.get('tc_kimlik_no') or raw.get('tc')),
        telefon=normalize_phone(raw.get('telefon') or ''),
        girilen_ad=(raw.get('ad') or '').strip(),
        girilen_soyad=(raw.get('soyad') or '').strip(),
    )


def classify_rows(exam, raw_rows, seviyeler, *, exam_session_id=None) -> list[RowOutcome]:
    from apps.coaching.olcme_degerlendirme.models import ExamParticipant

    by_id, by_key = _seviye_index(seviyeler)
    sessions = list(exam.exam_sessions.order_by('order', 'id'))
    session_error = _session_error(sessions, exam_session_id)

    outcomes: list[RowOutcome] = []
    seen: set[str] = set()
    tcs = []
    for index, raw in enumerate(raw_rows or []):
        if not isinstance(raw, dict):
            raw = {}
        row = _blank_outcome(index, raw)
        seviye_raw = raw.get('sinif_seviyesi_id')
        if seviye_raw in (None, ''):
            seviye_raw = raw.get('sinif_seviyesi') or raw.get('seviye')
        seviye = _resolve_seviye(seviye_raw, by_id, by_key)
        if seviye:
            row.sinif_seviyesi_id = seviye.id
            row.sinif_seviyesi = seviye.ad
            row._seviye = seviye
        errors = []
        if not row.ad:
            errors.append('Ad zorunlu.')
        if not row.soyad:
            errors.append('Soyad zorunlu.')
        if len(row.tc_kimlik_no) != 11:
            errors.append('TC 11 hane olmalı.')
        elif row.tc_kimlik_no in seen:
            errors.append('Bu TC listede tekrar ediyor.')
        else:
            seen.add(row.tc_kimlik_no)
            tcs.append(row.tc_kimlik_no)
        if not seviye:
            errors.append('Sınıf seviyesi bulunamadı.')
        if session_error:
            errors.append(session_error)
        if errors:
            row.status = 'hata'
            row.message = ' '.join(errors)
        outcomes.append(row)

    if not tcs:
        return outcomes

    existing = {
        o.tc_kimlik_no: o
        for o in Ogrenci.objects.filter(kurum_id=exam.kurum_id, tc_kimlik_no__in=tcs)
    }
    session = _target_session(sessions, exam_session_id)
    participant_qs = ExamParticipant.objects.filter(exam=exam, student__tc_kimlik_no__in=tcs)
    if session is not None:
        participant_qs = participant_qs.filter(exam_session=session)
    elif not sessions:
        participant_qs = participant_qs.filter(exam_session__isnull=True)
    on_exam = set(participant_qs.values_list('student__tc_kimlik_no', flat=True))

    for row in outcomes:
        if row.status == 'hata' or not row.tc_kimlik_no:
            continue
        ogrenci = existing.get(row.tc_kimlik_no)
        if ogrenci is None:
            row.status = 'yeni'
            row.message = 'Yeni günü birlik kayıt açılacak.'
            continue
        row.ogrenci_id = ogrenci.id
        row.ad = ogrenci.ad
        row.soyad = ogrenci.soyad
        if ogrenci.sube_id != exam.sube_id:
            row.status = 'hata'
            row.message = 'Bu TC başka şubede kayıtlı.'
            continue
        if not ogrenci.aktif_mi:
            row.status = 'hata'
            row.message = 'Öğrenci pasif.'
            continue
        if row.tc_kimlik_no in on_exam:
            row.status = 'zaten_sinavda'
            row.message = 'Bu öğrenci zaten bu sınavda.'
            continue
        if (ogrenci.kayit_turu or '') == GUNU_BIRLIK_CODE:
            row.status = 'mevcut_misafir'
            row.message = 'Mevcut günü birlik kayıt bu sınava eklenecek.'
        else:
            row.status = 'kayitli_ogrenci'
            row.message = 'Kayıtlı öğrenci, sınava eklenecek.'
    return outcomes


def _session_error(sessions, exam_session_id) -> str:
    if len(sessions) <= 1:
        if exam_session_id and not any(s.pk == exam_session_id for s in sessions):
            return 'Oturum bulunamadı.'
        return ''
    if not exam_session_id:
        return 'Oturum seçin.'
    if not any(s.pk == exam_session_id for s in sessions):
        return 'Oturum bulunamadı.'
    return ''


def _target_session(sessions, exam_session_id):
    if exam_session_id:
        return next((s for s in sessions if s.pk == exam_session_id), None)
    if len(sessions) == 1:
        return sessions[0]
    return None


def _attach(exam, student, seviye_id, exam_session_id):
    from apps.coaching.olcme_degerlendirme.models import ExamParticipant
    from apps.coaching.olcme_degerlendirme.services.exam_roster import add_manual_participant

    sessions = list(exam.exam_sessions.order_by('order', 'id'))
    err = _session_error(sessions, exam_session_id)
    if err:
        return None, err
    target = _target_session(sessions, exam_session_id)
    qs = ExamParticipant.objects.filter(exam=exam, student=student)
    qs = qs.filter(exam_session=target) if target is not None else qs.filter(exam_session__isnull=True)
    current = qs.first()
    if current:
        _stamp_seviye(current, student, seviye_id)
        return current, 'zaten'

    participant, add_err = add_manual_participant(exam, student.id, exam_session=target)
    if add_err and participant is None:
        return None, add_err
    if participant is not None:
        _stamp_seviye(participant, student, seviye_id)
    if add_err and 'zaten' in add_err:
        return participant, 'zaten'
    return participant, None


def _stamp_seviye(participant, student, seviye_id):
    if (student.kayit_turu or '') != GUNU_BIRLIK_CODE or not seviye_id:
        return
    if participant.sinif_seviyesi_id == seviye_id:
        return
    participant.sinif_seviyesi_id = seviye_id
    participant.save(update_fields=['sinif_seviyesi', 'updated_at'])


def commit_rows(exam, raw_rows, seviyeler, *, exam_session_id=None) -> list[RowOutcome]:
    preview = classify_rows(exam, raw_rows, seviyeler, exam_session_id=exam_session_id)
    saved: list[RowOutcome] = []
    for row in preview:
        if row.status == 'hata':
            saved.append(row)
            continue
        try:
            with transaction.atomic():
                _apply_row(exam, row, exam_session_id=exam_session_id)
        except KimlikConflictError as exc:
            row.status = 'hata'
            row.message = exc.message
        except Exception as exc:
            row.status = 'hata'
            row.message = str(exc) or 'Kayıt yazılamadı.'
        saved.append(row)
    return saved


def _apply_row(exam, row: RowOutcome, *, exam_session_id=None):
    ogrenci = None
    if row.ogrenci_id:
        ogrenci = Ogrenci.objects.select_for_update().filter(pk=row.ogrenci_id).first()
    if ogrenci is None and row.tc_kimlik_no:
        ogrenci = (
            Ogrenci.objects.select_for_update()
            .filter(kurum_id=exam.kurum_id, tc_kimlik_no=row.tc_kimlik_no)
            .first()
        )

    if ogrenci is None:
        assert_identity_for_new_record(
            exam.kurum_id,
            tc_kimlik_no=row.tc_kimlik_no,
            telefon='',
            context='ogrenci',
        )
        ogrenci = Ogrenci.objects.create(
            kurum_id=exam.kurum_id,
            sube_id=exam.sube_id,
            tc_kimlik_no=row.tc_kimlik_no,
            ad=row.girilen_ad or row.ad,
            soyad=row.girilen_soyad or row.soyad,
            telefon=row.telefon,
            kayit_turu=GUNU_BIRLIK_CODE,
            aktif_mi=True,
        )
        row.status = 'yeni'
        row.message = 'Günü birlik kayıt açıldı ve sınava eklendi.'
    else:
        if ogrenci.sube_id != exam.sube_id:
            row.status = 'hata'
            row.message = 'Bu TC başka şubede kayıtlı.'
            transaction.set_rollback(True)
            return
        if not ogrenci.aktif_mi:
            row.status = 'hata'
            row.message = 'Öğrenci pasif.'
            transaction.set_rollback(True)
            return
        if (ogrenci.kayit_turu or '') == GUNU_BIRLIK_CODE:
            if row.telefon and ogrenci.telefon != row.telefon:
                ogrenci.telefon = row.telefon
                ogrenci.save(update_fields=['telefon', 'updated_at'])
            row.status = 'mevcut_misafir'
            row.message = 'Mevcut günü birlik kayıt bu sınava eklendi.'
        else:
            row.status = 'kayitli_ogrenci'
            row.message = 'Kayıtlı öğrenci, sınava eklendi.'

    row.ogrenci_id = ogrenci.id
    row.ad = ogrenci.ad
    row.soyad = ogrenci.soyad
    participant, err = _attach(exam, ogrenci, row.sinif_seviyesi_id, exam_session_id)
    if err == 'zaten':
        row.status = 'zaten_sinavda'
        row.message = 'Bu öğrenci zaten bu sınavda.'
        return
    if err:
        row.status = 'hata'
        row.message = err
        transaction.set_rollback(True)
        return
    if participant is None:
        row.status = 'hata'
        row.message = 'Sınav listesine eklenemedi.'
        transaction.set_rollback(True)


def summarize(rows: list[RowOutcome]) -> dict:
    counts = {
        'yeni': 0,
        'mevcut_misafir': 0,
        'kayitli_ogrenci': 0,
        'zaten_sinavda': 0,
        'hata': 0,
    }
    for row in rows:
        counts[row.status] = counts.get(row.status, 0) + 1
    return counts


def assert_no_yearly_enrollment(ogrenci_id: int) -> bool:
    return not OgrenciKayit.objects.filter(ogrenci_id=ogrenci_id).exists()


def list_misafirler(kurum_id: int, sube_id: int, *, q: str = '') -> list[dict]:
    from apps.coaching.olcme_degerlendirme.models import ExamParticipant

    qs = Ogrenci.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        kayit_turu=GUNU_BIRLIK_CODE,
        aktif_mi=True,
    ).order_by('-created_at', 'soyad', 'ad')
    text = (q or '').strip()
    if text:
        from django.db.models import Q
        qs = qs.filter(
            Q(ad__icontains=text)
            | Q(soyad__icontains=text)
            | Q(tc_kimlik_no__icontains=text)
            | Q(telefon__icontains=normalize_tc(text) or text)
        )
    ogrenciler = list(qs[:500])
    ids = [o.id for o in ogrenciler]
    sinavlar: dict[int, list] = {i: [] for i in ids}
    seen_pairs: set[tuple[int, int]] = set()
    parts = (
        ExamParticipant.objects.filter(student_id__in=ids)
        .select_related('exam', 'sinif_seviyesi')
        .order_by('-exam__exam_date', '-exam_id')
    )
    for part in parts:
        key = (part.student_id, part.exam_id)
        if key in seen_pairs or not part.exam_id:
            continue
        seen_pairs.add(key)
        seviye = part.sinif_seviyesi.ad if part.sinif_seviyesi_id else ''
        sinavlar[part.student_id].append({
            'id': part.exam_id,
            'name': part.exam.name,
            'exam_date': part.exam.exam_date.isoformat() if part.exam.exam_date else None,
            'sinif_seviyesi': seviye,
        })
    return [
        {
            'id': ogrenci.id,
            'ad': ogrenci.ad,
            'soyad': ogrenci.soyad,
            'tc_kimlik_no': ogrenci.tc_kimlik_no or '',
            'telefon': ogrenci.telefon or '',
            'created_at': ogrenci.created_at.isoformat() if ogrenci.created_at else None,
            'sinavlar': sinavlar.get(ogrenci.id, []),
        }
        for ogrenci in ogrenciler
    ]


def exam_options(kurum_id: int, sube_id: int, egitim_yili_id: int | None):
    from apps.coaching.olcme_degerlendirme.models import Exam

    qs = Exam.objects.filter(
        kurum_id=kurum_id, sube_id=sube_id, is_active=True,
    )
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    exams = []
    for exam in qs.prefetch_related('exam_sessions').order_by('exam_date', 'name', 'id'):
        exams.append({
            'id': exam.id,
            'name': exam.name,
            'exam_date': exam.exam_date.isoformat() if exam.exam_date else None,
            'exam_type': exam.get_exam_type_display(),
            'status': exam.status,
            'sessions': [
                {
                    'id': session.id,
                    'name': session.name,
                    'session_date': session.session_date.isoformat() if session.session_date else None,
                    'schedule_preference_display': session.get_schedule_preference_display(),
                }
                for session in exam.exam_sessions.all()
            ],
        })
    return exams
