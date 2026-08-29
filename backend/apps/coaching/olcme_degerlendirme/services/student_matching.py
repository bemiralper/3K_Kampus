"""DAT satırı ↔ sınav öğrencisi eşleştirme.

Skor 0–1 arasıdır (mevcut `StudentAnswer.match_score` ile uyumlu).
Otomatik bağlama yalnızca yüksek güvenli (≥ 0.95) ve çakışmasız adaylarda yapılır.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Iterable

from django.db.models import Q, QuerySet

AUTO_MATCH_MIN = 0.95
SUGGEST_MIN = 0.55


def normalize_name(name: str) -> str:
    """Büyük/küçük harf, Türkçe karakter, fazla boşluk ve noktalama farkını siler."""
    if not name:
        return ''
    s = str(name).replace('\u00a0', ' ').strip()
    s = s.replace('İ', 'i').replace('I', 'i').replace('ı', 'i')
    s = s.lower()
    s = s.translate(str.maketrans({
        'ç': 'c', 'ğ': 'g', 'ö': 'o', 'ş': 's', 'ü': 'u',
        'â': 'a', 'î': 'i', 'û': 'u',
    }))
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    return ' '.join(s.split())


def normalize_id(value: str) -> str:
    return re.sub(r'\s+', '', (value or '').strip())


def normalize_student_no(value: str) -> str:
    """'00002' ve '2' aynı numara sayılsın."""
    s = normalize_id(value)
    if s.isdigit():
        return str(int(s))
    return s


def confidence_label(score_01: float) -> str:
    pct = round(score_01 * 100)
    if pct >= 95:
        return 'high'
    if pct >= 80:
        return 'medium'
    return 'low'


@dataclass
class DatIdentity:
    name: str = ''
    ogrenci_no: str = ''
    tc: str = ''


@dataclass
class StudentRec:
    pk: int
    ad: str
    soyad: str
    tc: str = ''
    okul_no: str = ''
    sinif: str = ''

    @property
    def full_name(self) -> str:
        return f'{self.ad} {self.soyad}'.strip()


@dataclass
class MatchHit:
    student: StudentRec
    score: float
    method: str
    reason: str

    @property
    def confidence(self) -> str:
        return confidence_label(self.score)

    def as_dict(self) -> dict[str, Any]:
        return {
            'id': self.student.pk,
            'ad': self.student.ad,
            'soyad': self.student.soyad,
            'full_name': self.student.full_name,
            'tc_kimlik_no': self.student.tc,
            'okul_no': self.student.okul_no,
            'sinif': self.student.sinif,
            'score': round(self.student_score_pct()),
            'match_score': round(self.score, 2),
            'match_method': self.method,
            'reason': self.reason,
            'confidence': self.confidence,
        }

    def student_score_pct(self) -> float:
        return self.score * 100


def _name_score(dat_name: str, student_name: str) -> tuple[float, str]:
    na = normalize_name(dat_name)
    nb = normalize_name(student_name)
    if not na or not nb:
        return 0.0, ''
    if na == nb:
        return 1.0, 'Tam ad + soyad eşleşmesi'

    ta, tb = na.split(), nb.split()
    sa, sb = set(ta), set(tb)
    if sa == sb:
        return 0.98, 'Ad + soyad (sıra farklı)'

    dat_last = ta[-1]
    stu_last = tb[-1]

    if sa < sb:
        if dat_last == stu_last or dat_last in sb:
            return 0.92, 'Ad-soyad kısmi eşleşmesi'
        return 0.84, 'Ad kısmi eşleşmesi'

    if sb < sa and stu_last in sa:
        return 0.88, 'Ad-soyad kısmi eşleşmesi'

    if len(ta) == 1 and ta[0] in sb:
        return 0.72, 'Ad benzerliği'

    sim = SequenceMatcher(None, na, nb).ratio()
    if len(tb) >= 2:
        rev = ' '.join([tb[-1], *tb[:-1]])
        sim = max(sim, SequenceMatcher(None, na, rev).ratio())
    if len(ta) >= 2:
        rev_a = ' '.join([ta[-1], *ta[:-1]])
        sim = max(sim, SequenceMatcher(None, rev_a, nb).ratio())

    if sim >= 0.92:
        return round(sim, 2), 'Yüksek isim benzerliği'
    if sim >= 0.80:
        return round(sim, 2), 'Küçük yazım farkı'
    if sim >= 0.65:
        return round(sim, 2), 'İsim benzerliği'
    return 0.0, ''


def score_student(dat: DatIdentity, rec: StudentRec) -> MatchHit | None:
    """Tek aday için en güçlü alanı seçer; skorlar birbirini düşürmez."""
    sid = normalize_id(dat.ogrenci_no)
    tc = normalize_id(dat.tc)
    rec_no = normalize_id(rec.okul_no)
    rec_tc = normalize_id(rec.tc)

    sid_n = normalize_student_no(sid)
    rec_no_n = normalize_student_no(rec_no)
    name_score, reason = _name_score(dat.name, rec.full_name)

    def _number_ok() -> bool:
        # DAT no ile LMS no aynı olsa bile isim açıkça başka biriyse bağlama.
        if not normalize_name(dat.name):
            return True
        return name_score >= 0.55

    if sid_n and rec_no_n and sid_n == rec_no_n and _number_ok():
        return MatchHit(rec, 1.0, 'id', 'Öğrenci numarası tam eşleşmesi')
    if tc and rec_tc and tc == rec_tc:
        return MatchHit(rec, 1.0, 'tc', 'TC kimlik tam eşleşmesi')
    # Eski DAT eşlemesinde "öğrenci no" bazen LMS pk'siydi. Yalnızca ad
    # boşsa veya ad da uyuyorsa pk'yi numara say; aksi halde yanlış kişiye
    # %100 bağlanmasın.
    if sid and sid == str(rec.pk):
        if not normalize_name(dat.name) or name_score >= 0.98:
            return MatchHit(rec, 1.0, 'id', 'Öğrenci numarası tam eşleşmesi')

    if name_score <= 0:
        return None
    method = 'name_exact' if name_score >= 0.98 else 'name'
    return MatchHit(rec, name_score, method, reason)


def rank_candidates(
    dat: DatIdentity,
    pool: Iterable[StudentRec],
    *,
    exclude_ids: set[int] | None = None,
    limit: int = 12,
    min_score: float = SUGGEST_MIN,
) -> list[MatchHit]:
    skip = exclude_ids or set()
    hits: list[MatchHit] = []
    for rec in pool:
        if rec.pk in skip:
            continue
        hit = score_student(dat, rec)
        if hit and hit.score >= min_score:
            hits.append(hit)
    hits.sort(key=lambda h: (-h.score, h.student.full_name))
    return hits[:limit]


def pick_auto_match(
    dat: DatIdentity,
    pool: Iterable[StudentRec],
    used_ids: set[int],
) -> MatchHit | None:
    """Yalnızca yüksek güvenli ve tekil adayı otomatik bağlar."""
    hits = rank_candidates(dat, pool, exclude_ids=used_ids, limit=3, min_score=AUTO_MATCH_MIN)
    if not hits:
        return None
    top = hits[0]
    if top.score < AUTO_MATCH_MIN:
        return None
    if len(hits) > 1 and hits[1].score >= AUTO_MATCH_MIN and hits[1].score >= top.score - 0.02:
        return None
    return top


def identity_from_raw(name: str = '', raw_id: str = '', tc: str = '', ogrenci_no: str = '') -> DatIdentity:
    sid = normalize_id(ogrenci_no or raw_id)
    tc_val = normalize_id(tc)
    if not tc_val and sid.isdigit() and len(sid) == 11:
        tc_val = sid
    return DatIdentity(name=name or '', ogrenci_no=sid, tc=tc_val)


def taken_student_ids(exam, *, except_answer_id: int | None = None) -> set[int]:
    from ..models import StudentAnswer

    qs = StudentAnswer.objects.filter(session__exam=exam, student__isnull=False)
    if except_answer_id:
        qs = qs.exclude(pk=except_answer_id)
    return set(qs.values_list('student_id', flat=True))


def exam_student_pool(exam) -> list[StudentRec]:
    """Katılımcı listesi varsa yalnızca onlar; yoksa sınıf + sınıfsız havuz."""
    from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit

    from ..models import ExamParticipant
    participant_ids = list(
        ExamParticipant.objects.filter(exam=exam).values_list('student_id', flat=True)
    )
    if participant_ids:
        students = list(
            Ogrenci.objects.filter(pk__in=participant_ids).only('id', 'ad', 'soyad', 'tc_kimlik_no')
        )
        ids = [o.pk for o in students]
        kayit_qs = OgrenciKayit.objects.filter(ogrenci_id__in=ids, aktif_mi=True)
        if exam.egitim_yili_id:
            kayit_qs = kayit_qs.filter(egitim_yili_id=exam.egitim_yili_id)
        kayit_qs = kayit_qs.select_related('sinif').order_by('-id')
        by_student: dict[int, Any] = {}
        for kayit in kayit_qs:
            by_student.setdefault(kayit.ogrenci_id, kayit)
        recs: list[StudentRec] = []
        for ogr in students:
            kayit = by_student.get(ogr.pk)
            recs.append(StudentRec(
                pk=ogr.pk,
                ad=ogr.ad or '',
                soyad=ogr.soyad or '',
                tc=(ogr.tc_kimlik_no or '').strip(),
                okul_no=(getattr(kayit, 'okul_no', '') or '').strip() if kayit else '',
                sinif=(getattr(getattr(kayit, 'sinif', None), 'ad', '') or '') if kayit else '',
            ))
        return recs

    qs: QuerySet = Ogrenci.objects.filter(
        aktif_mi=True,
        kurum_id=exam.kurum_id,
        sube_id=exam.sube_id,
    )
    sinif_ids = list(exam.siniflar.values_list('id', flat=True)) if getattr(exam, 'siniflar', None) else []
    if sinif_ids and exam.egitim_yili_id:
        # Sınıfı henüz atanmamış kayıtlar da DAT'ta gelir; onları dışarıda
        # bırakmak tam isim eşleşmesini "bulunamadı" yapıyordu.
        qs = qs.filter(
            kayitlar__aktif_mi=True,
            kayitlar__egitim_yili_id=exam.egitim_yili_id,
        ).filter(
            Q(kayitlar__sinif_id__in=sinif_ids) | Q(kayitlar__sinif_id__isnull=True),
        ).distinct()

    students = list(qs.only('id', 'ad', 'soyad', 'tc_kimlik_no'))
    if not students and sinif_ids:
        # Sınıf filtresi boş dönerse şube havuzuna düş — sınıfı eksik
        # etiketli sınavlarda eşleştirme tamamen kapanmasın.
        qs = Ogrenci.objects.filter(
            aktif_mi=True,
            kurum_id=exam.kurum_id,
            sube_id=exam.sube_id,
        )
        students = list(qs.only('id', 'ad', 'soyad', 'tc_kimlik_no'))
    if not students:
        return []

    ids = [o.pk for o in students]
    kayit_qs = OgrenciKayit.objects.filter(ogrenci_id__in=ids, aktif_mi=True)
    if exam.egitim_yili_id:
        kayit_qs = kayit_qs.filter(egitim_yili_id=exam.egitim_yili_id)
    kayit_qs = kayit_qs.select_related('sinif').order_by('-id')

    by_student: dict[int, Any] = {}
    for kayit in kayit_qs:
        by_student.setdefault(kayit.ogrenci_id, kayit)

    recs: list[StudentRec] = []
    for ogr in students:
        kayit = by_student.get(ogr.pk)
        recs.append(StudentRec(
            pk=ogr.pk,
            ad=ogr.ad or '',
            soyad=ogr.soyad or '',
            tc=(ogr.tc_kimlik_no or '').strip(),
            okul_no=(getattr(kayit, 'okul_no', '') or '').strip() if kayit else '',
            sinif=(getattr(getattr(kayit, 'sinif', None), 'ad', '') or '') if kayit else '',
        ))
    return recs


def search_pool(pool: list[StudentRec], query: str) -> list[StudentRec]:
    q = normalize_name(query)
    q_raw = normalize_id(query)
    tokens = [t for t in q.split() if t]
    if len(q) < 2 and len(q_raw) < 2:
        return []
    out: list[StudentRec] = []
    for rec in pool:
        hay = ' '.join(filter(None, [
            normalize_name(rec.full_name),
            normalize_id(rec.okul_no),
            normalize_id(rec.tc),
            str(rec.pk),
        ]))
        if q and q in hay:
            out.append(rec)
            continue
        if tokens and all(t in hay for t in tokens):
            out.append(rec)
            continue
        if q_raw and q_raw in (rec.okul_no, rec.tc, str(rec.pk)):
            out.append(rec)
    return out


def attach_match_hints(results: list[dict], exam) -> None:
    """Liste satırlarına durum, üst öneri ve öneri sayısı ekler (yerinde)."""
    pool = exam_student_pool(exam)
    taken = taken_student_ids(exam)
    for row in results:
        if row.get('matched_student_id'):
            method = row.get('match_method') or ''
            row['match_status'] = 'manual' if method == 'manual' else 'matched'
            row['top_suggestion'] = None
            row['suggestion_count'] = 0
            continue
        dat = DatIdentity(
            name=row.get('student_name') or '',
            ogrenci_no=row.get('ogrenci_no') or row.get('student_id') or '',
            tc=row.get('tc_kimlik') or '',
        )
        hits = rank_candidates(dat, pool, exclude_ids=taken, limit=5)
        high = [h for h in hits if h.score >= AUTO_MATCH_MIN]
        row['top_suggestion'] = hits[0].as_dict() if hits else None
        row['suggestion_count'] = len(hits)
        if len(high) >= 2:
            row['match_status'] = 'conflict'
        elif hits:
            row['match_status'] = 'pending'
        else:
            row['match_status'] = 'not_found'


def refresh_session_counts(session) -> None:
    from ..models import StudentAnswer

    total = StudentAnswer.objects.filter(session=session).count()
    matched = StudentAnswer.objects.filter(session=session, student__isnull=False).count()
    session.matched_count = matched
    session.unmatched_count = total - matched
    session.save(update_fields=['matched_count', 'unmatched_count'])
