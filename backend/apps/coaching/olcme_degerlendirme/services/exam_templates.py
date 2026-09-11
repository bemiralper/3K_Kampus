"""
Sınav Türü Şablon Servisi  (services/exam_templates.py)

Her sınav türü için:
  - Alan listesi (isim, soru başlangıç/bitiş, sıra)
  - Ders listesi (parent alan adı ile ilişkilendirilir)
  - Varsayılan süre (dakika)
  - Sınav oluşturulurken otomatik alan/ders oluşturma
"""
from __future__ import annotations

from rest_framework.exceptions import ValidationError

from .curriculum_band import BAND_LGS, resolved_band, subject_allowed_for_exam, subjects_for_band

# ─────────────────────────────────────────────────────────────────────────────
#  ŞABLON VERİSİ
# ─────────────────────────────────────────────────────────────────────────────

# Her alan: (name, question_start, question_end, order)
_TEMPLATES: dict[str, list[tuple]] = {

    'YKS_TYT': [
        ('Türkçe',           1,  40, 0),
        ('Sosyal Bilimler',  41, 60, 1),
        ('Temel Matematik',  61, 100, 2),
        ('Fen Bilimleri',   101, 120, 3),
    ],

    'YKS_AYT': [
        ('TDE-Sosyal Bilimler-1',   1,  40, 0),
        ('Sosyal Bilimler-2',      41,  80, 1),
        ('Matematik',              81, 120, 2),
        ('Fen Bilimleri',         121, 160, 3),
    ],

    'LGS': [
        ('Türkçe',           1,  20, 0),
        ('İnkılap Tarihi',  21,  30, 1),
        ('Din Kültürü',     31,  38, 2),
        ('Yabancı Dil',     39,  46, 3),
        ('Matematik',       47,  66, 4),
        ('Fen Bilimleri',   67,  86, 5),
    ],

    'DENEME': [
        ('Türkçe',           1,  40, 0),
        ('Sosyal Bilimler',  41,  60, 1),
        ('Temel Matematik',  61, 100, 2),
        ('Fen Bilimleri',   101, 120, 3),
    ],

    'KURUM_ICI': [],  # Kullanıcı tanımlar
    'KONU_TARAMA': [],
    'KAZANIM': [],
    'OZEL': [],
}

# Dersler: parent alan adı → [(name, question_start, question_end, order)]
_SUB_SECTIONS: dict[str, dict[str, list[tuple]]] = {

    'YKS_TYT': {
        'Sosyal Bilimler': [
            ('Tarih',        41, 45, 0),
            ('Coğrafya',     46, 50, 1),
            ('Felsefe',      51, 55, 2),
            ('Din Kültürü',  56, 60, 3),
        ],
        'Temel Matematik': [
            ('Matematik',    61, 90, 0),
            ('Geometri',     91, 100, 1),
        ],
        'Fen Bilimleri': [
            ('Fizik',       101, 107, 0),
            ('Kimya',       108, 114, 1),
            ('Biyoloji',    115, 120, 2),
        ],
    },

    'DENEME': {
        'Sosyal Bilimler': [
            ('Tarih',        41, 45, 0),
            ('Coğrafya',     46, 50, 1),
            ('Felsefe',      51, 55, 2),
            ('Din Kültürü',  56, 60, 3),
        ],
        'Temel Matematik': [
            ('Matematik',    61, 90, 0),
            ('Geometri',     91, 100, 1),
        ],
        'Fen Bilimleri': [
            ('Fizik',       101, 107, 0),
            ('Kimya',       108, 114, 1),
            ('Biyoloji',    115, 120, 2),
        ],
    },

    'YKS_AYT': {
        'TDE-Sosyal Bilimler-1': [
            ('Türk Dili ve Edebiyatı',   1,  24, 0),
            ('Tarih-1',                  25,  34, 1),
            ('Coğrafya-1',              35,  40, 2),
        ],
        'Sosyal Bilimler-2': [
            ('Tarih-2',                          41, 51, 0),
            ('Coğrafya-2',                       52, 62, 1),
            ('Felsefe Grubu',                    63, 74, 2),
            ('Din Kültürü ve Ahlak Bilgisi',     75, 80, 3),
        ],
        'Matematik': [
            ('Matematik',              81, 110, 0),
            ('Geometri',              111, 120, 1),
        ],
        'Fen Bilimleri': [
            ('Fizik',                121, 134, 0),
            ('Kimya',               135, 147, 1),
            ('Biyoloji',            148, 160, 2),
        ],
    },
}

OPTIONAL_PHILOSOPHY_NAME = 'Felsefe (Seçmeli)'
OPTIONAL_PHILOSOPHY_COUNT = 5
OPTIONAL_PHILOSOPHY_AFTER = 'Sosyal Bilimler'
OPTIONAL_PHILOSOPHY_EXAM_TYPES = ('YKS_TYT', 'DENEME')
_SHIFT_PARENTS = ('Temel Matematik', 'Fen Bilimleri')


def _rows_to_dicts(rows: list[tuple]) -> list[dict]:
    return [
        {
            'name': name,
            'question_start': qs,
            'question_end': qe,
            'question_count': qe - qs + 1,
            'order': order,
        }
        for name, qs, qe, order in rows
    ]


def _with_optional_philosophy(main_rows: list[tuple], sub_map: dict[str, list[tuple]]):
    """
    Seçmeli felsefe ayrı üst test değildir; Sosyal Bilimler içinde
    Din Kültürü'nün alternatif 5 sorusudur (kitapçıkta 61–65).
    Matematik / Fen numaraları +5 kayar. Sosyal ana blok 20 soruda kalır
    (TYT 4'lü puan formülü bozulmasın).
    """
    mains: list[tuple] = []
    inserted = False
    sosyal_end = None
    for name, qs, qe, order in main_rows:
        if name == OPTIONAL_PHILOSOPHY_AFTER:
            mains.append((name, qs, qe, order))
            sosyal_end = qe
            inserted = True
        elif inserted:
            mains.append((name, qs + OPTIONAL_PHILOSOPHY_COUNT, qe + OPTIONAL_PHILOSOPHY_COUNT, order))
        else:
            mains.append((name, qs, qe, order))

    if not inserted:
        return main_rows, {k: list(v) for k, v in sub_map.items()}

    shifted_subs: dict[str, list[tuple]] = {}
    for parent, rows in sub_map.items():
        if parent == OPTIONAL_PHILOSOPHY_AFTER:
            last_end = rows[-1][2] if rows else (sosyal_end or 60)
            shifted_subs[parent] = list(rows) + [(
                OPTIONAL_PHILOSOPHY_NAME,
                last_end + 1,
                last_end + OPTIONAL_PHILOSOPHY_COUNT,
                len(rows),
            )]
        elif parent in _SHIFT_PARENTS:
            shifted_subs[parent] = [
                (n, s + OPTIONAL_PHILOSOPHY_COUNT, e + OPTIONAL_PHILOSOPHY_COUNT, o)
                for n, s, e, o in rows
            ]
        else:
            shifted_subs[parent] = list(rows)
    return mains, shifted_subs


_DEFAULT_DURATIONS: dict[str, int] = {
    'YKS_TYT':     135,
    'YKS_AYT':     180,
    'LGS':         115,
    'DENEME':      135,
    'KURUM_ICI':    90,
    'KONU_TARAMA':  45,
    'KAZANIM':      30,
    'OZEL':         60,
}


# ─────────────────────────────────────────────────────────────────────────────
#  PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

def get_template_sections(exam_type: str, include_optional_philosophy: bool = True) -> list[dict]:
    """Sınav türüne göre şablon alan listesi döner."""
    rows = list(_TEMPLATES.get(exam_type, []))
    subs = {k: list(v) for k, v in _SUB_SECTIONS.get(exam_type, {}).items()}
    if include_optional_philosophy and exam_type in OPTIONAL_PHILOSOPHY_EXAM_TYPES:
        rows, _ = _with_optional_philosophy(rows, subs)
    return _rows_to_dicts(rows)


def get_template_sub_sections(exam_type: str, include_optional_philosophy: bool = True) -> dict[str, list[dict]]:
    """Sınav türüne göre ders listesi döner. {parent_name: [{...}]}"""
    mains = list(_TEMPLATES.get(exam_type, []))
    subs_def = {k: list(v) for k, v in _SUB_SECTIONS.get(exam_type, {}).items()}
    if include_optional_philosophy and exam_type in OPTIONAL_PHILOSOPHY_EXAM_TYPES:
        _, subs_def = _with_optional_philosophy(mains, subs_def)
    return {parent: _rows_to_dicts(rows) for parent, rows in subs_def.items()}


def get_default_duration(exam_type: str) -> int:
    """Sınav türünün varsayılan süresini döner (dakika)."""
    return _DEFAULT_DURATIONS.get(exam_type, 60)


# ─────────────────────────────────────────────────────────────────────────────
#  BÖLÜM → MÜFREDAT DERSİ (Subject) EŞLEŞTİRME HARİTASI
# ─────────────────────────────────────────────────────────────────────────────
#
# Alt bölüm adı → (subject_code, subject_name, exam_type_filter)
# Sınav oluşturulurken alt bölümlere otomatik Subject bağlanır.
# Subject tablosunda yoksa otomatik oluşturulur.
#
# Kazanım yönetimi için Subject bağlantısı zorunludur.
# Bu harita sayesinde kullanıcının her sınavda elle ders bağlamasına gerek kalmaz.

_SECTION_SUBJECT_MAP: dict[str, dict[str, tuple[str, str, str]]] = {
    'YKS_TYT': {
        # alt bölüm adı → (code, görünen ad, exam_type_filter)
        'Türkçe':         ('TURKCE',     'Türkçe',          'YKS_TYT'),
        'Tarih':          ('TARIH',      'Tarih',           'YKS_TYT'),
        'Coğrafya':       ('COGRAFYA',   'Coğrafya',        'YKS_TYT'),
        'Felsefe':        ('FELSEFE',    'Felsefe',         'YKS_TYT'),
        OPTIONAL_PHILOSOPHY_NAME: ('FELSEFE', 'Felsefe',    'YKS_TYT'),
        'Din Kültürü':    ('DKAB',       'Din Kültürü',     'YKS_TYT'),
        'Matematik':      ('MATEMATIK',  'Matematik',       'YKS_TYT'),
        'Geometri':       ('GEOMETRI',   'Geometri',        'YKS_TYT'),
        'Fizik':          ('FIZIK',      'Fizik',           'YKS_TYT'),
        'Kimya':          ('KIMYA',      'Kimya',           'YKS_TYT'),
        'Biyoloji':       ('BIYOLOJI',   'Biyoloji',        'YKS_TYT'),
    },
    'YKS_AYT': {
        'Türk Dili ve Edebiyatı':          ('TDE',       'Türk Dili ve Edebiyatı', 'YKS_AYT'),
        'Tarih-1':                          ('TARIH',     'Tarih',                  'YKS_AYT'),
        'Coğrafya-1':                       ('COGRAFYA',  'Coğrafya',               'YKS_AYT'),
        'Tarih-2':                          ('TARIH',     'Tarih',                  'YKS_AYT'),
        'Coğrafya-2':                       ('COGRAFYA',  'Coğrafya',               'YKS_AYT'),
        'Felsefe Grubu':                    ('FELSEFE',   'Felsefe',                'YKS_AYT'),
        'Din Kültürü ve Ahlak Bilgisi':     ('DKAB',      'Din Kültürü ve Ahlak Bilgisi', 'YKS_AYT'),
        'Matematik':                        ('MATEMATIK', 'Matematik',              'YKS_AYT'),
        'Geometri':                         ('GEOMETRI',  'Geometri',               'YKS_AYT'),
        'Fizik':                            ('FIZIK',     'Fizik',                  'YKS_AYT'),
        'Kimya':                            ('KIMYA',     'Kimya',                  'YKS_AYT'),
        'Biyoloji':                         ('BIYOLOJI',  'Biyoloji',               'YKS_AYT'),
    },
    'LGS': {
        'Türkçe':          ('TURKCE',    'Türkçe',          'LGS'),
        'İnkılap Tarihi':  ('INKILAP',   'İnkılap Tarihi',  'LGS'),
        'Din Kültürü':     ('DKAB',      'Din Kültürü',     'LGS'),
        'Yabancı Dil':     ('INGILIZCE', 'Yabancı Dil',     'LGS'),
        'Matematik':       ('MATEMATIK', 'Matematik',       'LGS'),
        'Fen Bilimleri':   ('FEN',       'Fen Bilimleri',   'LGS'),
    },
    'DENEME': {
        'Türkçe':         ('TURKCE',     'Türkçe',          'YKS_TYT'),
        'Tarih':          ('TARIH',      'Tarih',           'YKS_TYT'),
        'Coğrafya':       ('COGRAFYA',   'Coğrafya',        'YKS_TYT'),
        'Felsefe':        ('FELSEFE',    'Felsefe',         'YKS_TYT'),
        OPTIONAL_PHILOSOPHY_NAME: ('FELSEFE', 'Felsefe',    'YKS_TYT'),
        'Din Kültürü':    ('DKAB',       'Din Kültürü',     'YKS_TYT'),
        'Matematik':      ('MATEMATIK',  'Matematik',       'YKS_TYT'),
        'Geometri':       ('GEOMETRI',   'Geometri',        'YKS_TYT'),
        'Fizik':          ('FIZIK',      'Fizik',           'YKS_TYT'),
        'Kimya':          ('KIMYA',      'Kimya',           'YKS_TYT'),
        'Biyoloji':       ('BIYOLOJI',   'Biyoloji',        'YKS_TYT'),
    },
}


_SUBJECT_CODE_SUFFIXES = ('_TYT', '_AYT', '_LGS')


def _subject_has_curriculum(subject) -> bool:
    return bool(subject) and subject.topics.exists()


def _alias_codes(code: str) -> list[str]:
    return [
        code[: -len(suffix)]
        for suffix in _SUBJECT_CODE_SUFFIXES
        if code.endswith(suffix)
    ]


def _resolve_curriculum_subject(code: str, display_name: str, exam_type_filter: str):
    """
    Müfredat dersini bul. Şablon kodu (FELSEFE_TYT) ile canlıdaki kısa kod
    (FELSEFE) veya aynı isimli ders varsa onu kullan; yeni boş ders açma.

    Boş TYT/AYT kopyası (0 konu) duruyorsa kazanımlı asıl derse düş.
    """
    from django.db.models import Q

    from ..models.curriculum import Subject

    by_code = Subject.objects.filter(code=code).first()
    aliases = _alias_codes(code)
    by_alias = Subject.objects.filter(code__in=aliases).first() if aliases else None
    if _subject_has_curriculum(by_alias):
        return by_alias
    if _subject_has_curriculum(by_code):
        return by_code
    if by_alias:
        return by_alias

    named = list(
        Subject.objects.filter(
            Q(name__iexact=display_name)
            | (Q(display_name__iexact=display_name) & ~Q(display_name=''))
        )
    )
    named_with = next((s for s in named if _subject_has_curriculum(s)), None)
    if not named_with:
        extra = Subject.objects.filter(name__istartswith=display_name)
        named_with = next((s for s in extra if _subject_has_curriculum(s)), None)
    if named_with:
        return named_with
    if by_code:
        return by_code
    if named:
        return named[0]

    create_code = aliases[0] if aliases else code
    subject, _created = Subject.objects.get_or_create(
        code=create_code,
        defaults={
            'name': display_name,
            'display_name': display_name,
            'exam_type_filter': exam_type_filter,
        },
    )
    return subject


def purge_empty_exam_type_stubs() -> int:
    """Kazanımsız TYT/AYT/LGS kopyalarını sil; bölümleri asıl derse taşı."""
    from django.db.models import Count, Q

    from ..models.curriculum import Subject
    from ..models.exam import ExamSection

    stubs = list(
        Subject.objects.annotate(topic_count=Count('topics')).filter(
            Q(code__endswith='_TYT') | Q(code__endswith='_AYT') | Q(code__endswith='_LGS'),
            topic_count=0,
        )
    )
    deleted = 0
    for stub in stubs:
        replacement = _resolve_curriculum_subject(
            stub.code, stub.name or stub.display_name, stub.exam_type_filter or 'YKS_TYT',
        )
        if replacement.id != stub.id:
            ExamSection.objects.filter(subject=stub).update(subject=replacement)
        if not stub.exam_sections.exists() and not stub.topics.exists():
            stub.delete()
            deleted += 1
    return deleted


def _felsefe_subject_for_exam(exam, sections: list):
    """Felsefe (Seçmeli) ayrı ders değil; TYT Felsefe müfredatını paylaşır."""
    for section in sections:
        if section.name == 'Felsefe' and _subject_has_curriculum(section.subject):
            return section.subject

    from ..models.exam import ExamSection

    sibling = (
        ExamSection.objects
        .filter(exam=exam, name='Felsefe', subject__isnull=False)
        .select_related('subject')
        .first()
    )
    if sibling and _subject_has_curriculum(sibling.subject):
        return sibling.subject

    return _resolve_curriculum_subject('FELSEFE_TYT', 'Felsefe', 'YKS_TYT')


def _auto_link_subjects(exam, sections: list) -> None:
    """
    Oluşturulan bölümlere müfredat derslerini (Subject) otomatik bağlar.

    Mantık:
    - Alt bölümler varsa → alt bölümlere bağla
    - Alt bölüm yoksa (LGS gibi) → ana bölümlere bağla
    - Yalnız sınavın müfredat bandındaki (YKS 9–12 / LGS 5–8) dersler bağlanır
    - Felsefe (Seçmeli) her zaman TYT Felsefe müfredatını paylaşır
    """
    from ..models.curriculum import Subject

    band = resolved_band(exam)
    subject_map = dict(_SECTION_SUBJECT_MAP.get(exam.exam_type, {}))
    if not subject_map:
        wanted = {'LGS'} if band == BAND_LGS else {'YKS_TYT', 'YKS_AYT', 'DENEME'}
        for exam_type, type_map in _SECTION_SUBJECT_MAP.items():
            if exam_type in wanted:
                subject_map.update(type_map)

    def _name_key(value: str) -> str:
        return (value or '').strip().casefold()

    existing_by_name = {}
    for subj in subjects_for_band(band):
        for label in (subj.name, subj.display_name, subj.code):
            key = _name_key(label)
            if key and key not in existing_by_name:
                existing_by_name[key] = subj

    default_filter = 'LGS' if band == BAND_LGS else 'YKS_TYT'

    for section in sections:
        if section.name == OPTIONAL_PHILOSOPHY_NAME:
            subject = _felsefe_subject_for_exam(exam, sections)
            if section.subject_id != subject.id:
                section.subject = subject
                section.save(update_fields=['subject'])
            continue

        if section.subject_id and _subject_has_curriculum(section.subject):
            continue

        section_name = section.name
        mapping = subject_map.get(section_name)

        has_sub = section.is_sub_section is False and any(
            s.parent_section_id == section.id for s in sections if s.is_sub_section
        )
        if has_sub:
            continue

        subject = None
        if mapping:
            code, display_name, _legacy_filter = mapping
            subject = _resolve_curriculum_subject(code, display_name, default_filter)
            if subject and not subject_allowed_for_exam(exam, subject):
                subject = (
                    existing_by_name.get(_name_key(section_name))
                    or existing_by_name.get(_name_key(display_name))
                )
        else:
            subject = existing_by_name.get(_name_key(section_name))

        if not subject or not subject_allowed_for_exam(exam, subject):
            continue

        section.subject = subject
        section.save(update_fields=['subject'])


def create_sections_from_template(exam) -> list:
    """
    Sınav türüne ait şablon bölümleri (ana + alt) veritabanına yazar.
    Mevcut bölümleri silmeden çağrılırsa duplicate oluşabilir;
    genellikle exam.sections.all().delete() ardından çağrılır.

    Ek olarak: Alt bölümlere müfredat derslerini (Subject) otomatik bağlar.
    Eşleşen Subject yoksa otomatik oluşturur.
    """
    from ..models.exam import ExamSection

    include_opt = getattr(exam, 'include_optional_philosophy', True)
    template = get_template_sections(exam.exam_type, include_opt)
    sub_template = get_template_sub_sections(exam.exam_type, include_opt)
    created = []

    # Ana bölümleri oluştur
    parent_map: dict[str, ExamSection] = {}
    for row in template:
        section = ExamSection.objects.create(
            exam=exam,
            name=row['name'],
            question_start=row['question_start'],
            question_end=row['question_end'],
            order=row['order'],
        )
        created.append(section)
        parent_map[row['name']] = section

    # Alt bölümleri oluştur
    for parent_name, subs in sub_template.items():
        parent = parent_map.get(parent_name)
        if not parent:
            continue
        for sub in subs:
            sub_section = ExamSection.objects.create(
                exam=exam,
                name=sub['name'],
                question_start=sub['question_start'],
                question_end=sub['question_end'],
                order=sub['order'],
                is_sub_section=True,
                parent_section=parent,
            )
            created.append(sub_section)

    # ── Müfredat dersi (Subject) otomatik bağlama ─────────────────────
    _auto_link_subjects(exam, created)

    return created


def ensure_sub_sections(exam) -> list:
    """
    Mevcut bir sınavda eksik olan alt bölümleri ekler.
    Ana bölümlere dokunmaz — sadece template'de tanımlı olup
    veritabanında olmayan alt bölümleri oluşturur.

    Ek olarak:
    - Ana bölümdeki subject bağlantısını, aynı isimdeki alt bölüme taşır.
      Örn: "Temel Matematik" ana bölümünde subject=Matematik varsa,
      "Matematik" alt bölümüne taşınır.
    - Cevap anahtarı item'larını alt bölümlere yeniden eşleştirir.
    """
    from ..models.exam import ExamSection

    include_opt = getattr(exam, 'include_optional_philosophy', True)
    sub_template = get_template_sub_sections(exam.exam_type, include_opt)
    if not sub_template:
        return []

    # Mevcut ana bölümleri isme göre indexle
    main_sections = ExamSection.objects.filter(exam=exam, is_sub_section=False)
    parent_map: dict[str, ExamSection] = {s.name: s for s in main_sections}

    # Mevcut alt bölümleri kontrol et
    existing_subs = set(
        ExamSection.objects.filter(exam=exam, is_sub_section=True)
        .values_list('name', 'parent_section_id')
    )

    created = []
    for parent_name, subs in sub_template.items():
        parent = parent_map.get(parent_name)
        if not parent:
            continue
        for sub in subs:
            # Aynı isim + parent zaten varsa atla
            if (sub['name'], parent.id) in existing_subs:
                continue
            sub_section = ExamSection.objects.create(
                exam=exam,
                name=sub['name'],
                question_start=sub['question_start'],
                question_end=sub['question_end'],
                order=sub['order'],
                is_sub_section=True,
                parent_section=parent,
            )
            created.append(sub_section)

    # ── Subject taşıma + item yeniden eşleştirme ─────────────────────────
    _reassign_subjects_and_items(exam)

    sync_optional_philosophy_section(exam)

    # ── Subject bağlı olmayan bölümlere otomatik Subject bağla ────────
    all_sections = list(
        ExamSection.objects.filter(exam=exam)
    )
    _auto_link_subjects(exam, all_sections)

    return created


def _philosophy_layout(exam) -> str:
    """Mevcut sınavın felsefe yerleşimi: after_dkab | trailing | none."""
    from ..models.exam import ExamSection

    phil = ExamSection.objects.filter(exam=exam, name=OPTIONAL_PHILOSOPHY_NAME).first()
    if not phil:
        return 'none'
    if phil.question_start >= 121:
        return 'trailing'
    return 'after_dkab'


def _remap_q_trailing_to_after_dkab(n: int) -> int:
    if n <= 60:
        return n
    if 61 <= n <= 120:
        return n + OPTIONAL_PHILOSOPHY_COUNT
    if 121 <= n <= 125:
        return n - 60
    return n


def _remap_q_insert_after_dkab(n: int) -> int:
    if n <= 60:
        return n
    return n + OPTIONAL_PHILOSOPHY_COUNT


def _remap_q_remove_after_dkab(n: int) -> int:
    if n <= 60:
        return n
    if 61 <= n <= 65:
        return None
    if n >= 66:
        return n - OPTIONAL_PHILOSOPHY_COUNT
    return n


def _remap_exam_question_numbers(exam, mapper) -> None:
    """Cevap anahtarı ve öğrenci cevaplarındaki soru numaralarını dönüştürür."""
    from ..models.answer_key import AnswerKeyItem
    from ..models.result import StudentAnswer

    items = list(AnswerKeyItem.objects.filter(answer_key__exam=exam))
    if items:
        for item in items:
            item.question_number += 10000
            if item.b_question_number and item.b_question_number >= 61:
                item.b_question_number += 10000
        AnswerKeyItem.objects.bulk_update(items, ['question_number', 'b_question_number'])

        keep = []
        drop_ids = []
        for item in items:
            new_q = mapper(item.question_number - 10000)
            if new_q is None:
                drop_ids.append(item.id)
                continue
            item.question_number = new_q
            if item.b_question_number and item.b_question_number >= 10061:
                mapped_b = mapper(item.b_question_number - 10000)
                item.b_question_number = mapped_b
            keep.append(item)
        if drop_ids:
            AnswerKeyItem.objects.filter(id__in=drop_ids).delete()
        if keep:
            AnswerKeyItem.objects.bulk_update(keep, ['question_number', 'b_question_number'])

    answers = list(StudentAnswer.objects.filter(session__exam=exam))
    for ans in answers:
        def _map_json(data):
            if not isinstance(data, dict):
                return data
            out = {}
            for k, v in data.items():
                try:
                    nk = mapper(int(k))
                except (TypeError, ValueError):
                    out[k] = v
                    continue
                if nk is None:
                    continue
                out[str(nk)] = v
            return out
        ans.answers = _map_json(ans.answers)
        ans.comparison = _map_json(ans.comparison)
    if answers:
        StudentAnswer.objects.bulk_update(answers, ['answers', 'comparison'])


def _apply_template_ranges(exam, include: bool) -> None:
    from ..models.exam import ExamSection

    mains_tpl = {r['name']: r for r in get_template_sections(exam.exam_type, include)}
    subs_tpl = get_template_sub_sections(exam.exam_type, include)
    mains = {s.name: s for s in ExamSection.objects.filter(exam=exam, is_sub_section=False)}

    for name, row in mains_tpl.items():
        section = mains.get(name)
        if section:
            section.question_start = row['question_start']
            section.question_end = row['question_end']
            section.order = row['order']
            section.save(update_fields=['question_start', 'question_end', 'order', 'question_count'])

    if not include:
        ExamSection.objects.filter(exam=exam, name=OPTIONAL_PHILOSOPHY_NAME).delete()

    for parent_name, rows in subs_tpl.items():
        parent = mains.get(parent_name)
        if not parent:
            continue
        children = {
            s.name: s
            for s in ExamSection.objects.filter(exam=exam, is_sub_section=True, parent_section=parent)
        }
        for row in rows:
            child = children.get(row['name'])
            if not child and row['name'] == OPTIONAL_PHILOSOPHY_NAME:
                orphan = ExamSection.objects.filter(
                    exam=exam, name=OPTIONAL_PHILOSOPHY_NAME,
                ).first()
                if orphan:
                    orphan.is_sub_section = True
                    orphan.parent_section = parent
                    child = orphan
                else:
                    child = ExamSection.objects.create(
                        exam=exam,
                        name=row['name'],
                        question_start=row['question_start'],
                        question_end=row['question_end'],
                        order=row['order'],
                        is_sub_section=True,
                        parent_section=parent,
                    )
                    _auto_link_subjects(exam, [child])
                children[row['name']] = child
            if not child:
                continue
            child.question_start = row['question_start']
            child.question_end = row['question_end']
            child.order = row['order']
            child.is_sub_section = True
            child.parent_section = parent
            child.save(update_fields=[
                'question_start', 'question_end', 'order', 'question_count',
                'is_sub_section', 'parent_section',
            ])


def sync_optional_philosophy_section(exam) -> None:
    """TYT / Deneme felsefe bloğunu Din Kültürü sonrasına yerleştirir veya kaldırır."""
    if exam.exam_type not in OPTIONAL_PHILOSOPHY_EXAM_TYPES:
        return

    include = getattr(exam, 'include_optional_philosophy', True)
    current = _philosophy_layout(exam)

    if include and current == 'trailing':
        _remap_exam_question_numbers(exam, _remap_q_trailing_to_after_dkab)
    elif include and current == 'none':
        _remap_exam_question_numbers(exam, _remap_q_insert_after_dkab)
    elif not include and current == 'after_dkab':
        _remap_exam_question_numbers(exam, _remap_q_remove_after_dkab)

    _apply_template_ranges(exam, include)
    _reassign_subjects_and_items(exam)


def _reassign_subjects_and_items(exam):
    """
    Ana bölümlerdeki subject bağlantılarını alt bölümlere taşır
    ve cevap anahtarı item'larını doğru alt bölümlere eşleştirir.

    Mantık:
    1) Ana bölümde subject varsa ve alt bölümlerde aynı isimde biri varsa,
       subject o alt bölüme taşınır; ana bölümden kaldırılır.
    2) Cevap anahtarı item'ları, soru numarasına göre uygun alt bölüme atanır.
       Alt bölüm yoksa ana bölümde kalır.
    """
    from ..models.exam import ExamSection
    from ..models.answer_key import AnswerKeyItem

    main_sections = ExamSection.objects.filter(exam=exam, is_sub_section=False)

    for main in main_sections:
        children = list(
            ExamSection.objects.filter(
                exam=exam, is_sub_section=True, parent_section=main,
            ).order_by('question_start')
        )
        if not children:
            continue

        # 1) Subject taşıma: ana bölümde subject varsa, aynı isimli alt bölüme taşı
        if main.subject_id:
            subject_name = main.subject.name if main.subject else ''
            target_child = None
            for child in children:
                # Ders adı alt bölüm adıyla eşleşiyorsa (Matematik → Matematik)
                if child.name.lower() == subject_name.lower():
                    target_child = child
                    break
            # Eşleşme yoksa, ana bölüm aralığını tamamen kapsayan ilk çocuğa ver
            # (genellikle "kalan" alt ders)
            if not target_child:
                for child in children:
                    if child.question_start == main.question_start:
                        target_child = child
                        break

            if target_child and not target_child.subject_id:
                target_child.subject = main.subject
                target_child.save(update_fields=['subject'])
                main.subject = None
                main.save(update_fields=['subject'])

        # 2) Cevap anahtarı item'larını alt bölümlere yeniden eşle
        # Ana bölüme atanmış item'ları bul ve soru numarasına göre alt bölüme taşı
        items = AnswerKeyItem.objects.filter(section=main)
        for item in items:
            for child in children:
                if child.question_start <= item.question_number <= child.question_end:
                    item.section = child
                    item.save(update_fields=['section'])
                    break


def _payload_int(raw, default=None):
    try:
        return int(raw) if raw not in (None, '') else default
    except (TypeError, ValueError):
        return default


def _resolve_payload_subject(exam, raw):
    from ..models.curriculum import Subject

    subject_id = _payload_int(raw.get('subject') if isinstance(raw, dict) else None)
    if subject_id is None and isinstance(raw, dict):
        subject_id = _payload_int(raw.get('subject_id'))
    if subject_id is None:
        return None
    try:
        subject = Subject.objects.get(pk=subject_id)
    except Subject.DoesNotExist as exc:
        raise ValidationError({'sections': f'Müfredat dersi bulunamadı ({subject_id}).'}) from exc
    if not subject_allowed_for_exam(exam, subject):
        raise ValidationError({
            'sections': (
                f'"{subject}" bu sınavın müfredat düzeyine uymaz. '
                'YKS (9–12) ve LGS (5–8) dersleri karışmaz.'
            ),
        })
    return subject


def create_sections_from_payload(exam, rows: list) -> list:
    """Üst ders + isteğe bağlı alt derslerden bölüm oluşturur (TYT/AYT hiyerarşisi)."""
    from ..models.exam import ExamSection

    created = []
    cursor = 1
    seen = set()
    for i, raw in enumerate(rows or []):
        name = str(raw.get('name') or '').strip()
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        order = _payload_int(raw.get('order'), i)
        subs = raw.get('sub_sections') or raw.get('subs') or []
        child_specs = []
        for j, sub in enumerate(subs):
            sub_name = str(sub.get('name') or '').strip()
            if not sub_name:
                continue
            sub_start = _payload_int(sub.get('question_start'))
            sub_end = _payload_int(sub.get('question_end'))
            sub_count = _payload_int(sub.get('question_count'))
            if sub_start is None or sub_end is None:
                n = sub_count if sub_count and sub_count > 0 else 1
                sub_start = cursor
                sub_end = sub_start + n - 1
            if sub_end < sub_start:
                sub_end = sub_start
            child_specs.append((
                sub_name, sub_start, sub_end, _payload_int(sub.get('order'), j),
                _resolve_payload_subject(exam, sub),
            ))
            cursor = sub_end + 1
        if child_specs:
            start = child_specs[0][1]
            end = child_specs[-1][2]
        else:
            start = _payload_int(raw.get('question_start'))
            end = _payload_int(raw.get('question_end'))
            count = _payload_int(raw.get('question_count'))
            if start is None or end is None:
                n = count if count and count > 0 else 1
                start = cursor
                end = start + n - 1
            if end < start:
                end = start
            cursor = end + 1
        parent = ExamSection.objects.create(
            exam=exam,
            name=name,
            question_start=start,
            question_end=end,
            order=order,
            subject=_resolve_payload_subject(exam, raw),
        )
        created.append(parent)
        for sub_name, sub_start, sub_end, sub_order, sub_subject in child_specs:
            created.append(ExamSection.objects.create(
                exam=exam,
                name=sub_name,
                question_start=sub_start,
                question_end=sub_end,
                order=sub_order,
                is_sub_section=True,
                parent_section=parent,
                subject=sub_subject,
            ))
    _auto_link_subjects(exam, created)
    return created
