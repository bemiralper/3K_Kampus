"""
Sınav Türü Şablon Servisi  (services/exam_templates.py)

Her sınav türü için:
  - Alan listesi (isim, soru başlangıç/bitiş, sıra)
  - Ders listesi (parent alan adı ile ilişkilendirilir)
  - Varsayılan süre (dakika)
  - Sınav oluşturulurken otomatik alan/ders oluşturma
"""
from __future__ import annotations

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
    Seçmeli felsefeyi Din Kültürü'nün hemen ardına yerleştirir (61–65)
    ve sonraki testleri +5 kaydırır. TYT 4'lü formül için ayrı ana bölümdür.
    """
    mains: list[tuple] = []
    inserted = False
    for name, qs, qe, order in main_rows:
        if name == OPTIONAL_PHILOSOPHY_AFTER:
            mains.append((name, qs, qe, order))
            mains.append((
                OPTIONAL_PHILOSOPHY_NAME,
                qe + 1,
                qe + OPTIONAL_PHILOSOPHY_COUNT,
                order + 1,
            ))
            inserted = True
        elif inserted:
            mains.append((name, qs + OPTIONAL_PHILOSOPHY_COUNT, qe + OPTIONAL_PHILOSOPHY_COUNT, order + 1))
        else:
            mains.append((name, qs, qe, order))

    if not inserted:
        return main_rows, {k: list(v) for k, v in sub_map.items()}

    shifted_subs: dict[str, list[tuple]] = {}
    for parent, rows in sub_map.items():
        if parent in _SHIFT_PARENTS:
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
        'Türkçe':         ('TURKCE_TYT',     'Türkçe',          'YKS_TYT'),
        'Tarih':          ('TARIH_TYT',      'Tarih',           'YKS_TYT'),
        'Coğrafya':       ('COGRAFYA_TYT',   'Coğrafya',        'YKS_TYT'),
        'Felsefe':        ('FELSEFE_TYT',    'Felsefe',         'YKS_TYT'),
        OPTIONAL_PHILOSOPHY_NAME: ('FELSEFE_TYT', 'Felsefe',    'YKS_TYT'),
        'Din Kültürü':    ('DINKUL_TYT',     'Din Kültürü',     'YKS_TYT'),
        'Matematik':      ('MAT_TYT',        'Matematik',       'YKS_TYT'),
        'Geometri':       ('GEO_TYT',        'Geometri',        'YKS_TYT'),
        'Fizik':          ('FIZ_TYT',        'Fizik',           'YKS_TYT'),
        'Kimya':          ('KIM_TYT',        'Kimya',           'YKS_TYT'),
        'Biyoloji':       ('BIO_TYT',        'Biyoloji',        'YKS_TYT'),
    },
    'YKS_AYT': {
        'Türk Dili ve Edebiyatı':          ('TDE_AYT',      'Türk Dili ve Edebiyatı', 'YKS_AYT'),
        'Tarih-1':                          ('TARIH1_AYT',   'Tarih-1',                'YKS_AYT'),
        'Coğrafya-1':                       ('COG1_AYT',     'Coğrafya-1',             'YKS_AYT'),
        'Tarih-2':                          ('TARIH2_AYT',   'Tarih-2',                'YKS_AYT'),
        'Coğrafya-2':                       ('COG2_AYT',     'Coğrafya-2',             'YKS_AYT'),
        'Felsefe Grubu':                    ('FELSEFE_AYT',  'Felsefe Grubu',          'YKS_AYT'),
        'Din Kültürü ve Ahlak Bilgisi':     ('DKAB_AYT',     'Din Kültürü ve Ahlak Bilgisi', 'YKS_AYT'),
        'Matematik':                        ('MAT_AYT',      'Matematik',              'YKS_AYT'),
        'Geometri':                         ('GEO_AYT',      'Geometri',               'YKS_AYT'),
        'Fizik':                            ('FIZ_AYT',      'Fizik',                  'YKS_AYT'),
        'Kimya':                            ('KIM_AYT',      'Kimya',                  'YKS_AYT'),
        'Biyoloji':                         ('BIO_AYT',      'Biyoloji',               'YKS_AYT'),
    },
    'LGS': {
        'Türkçe':          ('TURKCE_LGS',    'Türkçe',          'LGS'),
        'İnkılap Tarihi':  ('INKILAP_LGS',   'İnkılap Tarihi',  'LGS'),
        'Din Kültürü':     ('DINKUL_LGS',    'Din Kültürü',     'LGS'),
        'Yabancı Dil':     ('YABDIL_LGS',    'Yabancı Dil',     'LGS'),
        'Matematik':       ('MAT_LGS',       'Matematik',       'LGS'),
        'Fen Bilimleri':   ('FEN_LGS',       'Fen Bilimleri',   'LGS'),
    },
    'DENEME': {
        'Türkçe':         ('TURKCE_TYT',     'Türkçe',          'YKS_TYT'),
        'Tarih':          ('TARIH_TYT',      'Tarih',           'YKS_TYT'),
        'Coğrafya':       ('COGRAFYA_TYT',   'Coğrafya',        'YKS_TYT'),
        'Felsefe':        ('FELSEFE_TYT',    'Felsefe',         'YKS_TYT'),
        OPTIONAL_PHILOSOPHY_NAME: ('FELSEFE_TYT', 'Felsefe',    'YKS_TYT'),
        'Din Kültürü':    ('DINKUL_TYT',     'Din Kültürü',     'YKS_TYT'),
        'Matematik':      ('MAT_TYT',        'Matematik',       'YKS_TYT'),
        'Geometri':       ('GEO_TYT',        'Geometri',        'YKS_TYT'),
        'Fizik':          ('FIZ_TYT',        'Fizik',           'YKS_TYT'),
        'Kimya':          ('KIM_TYT',        'Kimya',           'YKS_TYT'),
        'Biyoloji':       ('BIO_TYT',        'Biyoloji',        'YKS_TYT'),
    },
}


def _auto_link_subjects(exam, sections: list) -> None:
    """
    Oluşturulan bölümlere müfredat derslerini (Subject) otomatik bağlar.

    Mantık:
    - Alt bölümler varsa → alt bölümlere bağla
    - Alt bölüm yoksa (LGS gibi) → ana bölümlere bağla
    - Subject tablosunda eşleşen code varsa → onu kullan
    - Yoksa → otomatik oluştur (get_or_create)
    """
    from ..models.curriculum import Subject

    subject_map = _SECTION_SUBJECT_MAP.get(exam.exam_type, {})
    if not subject_map:
        return

    for section in sections:
        # Zaten subject bağlıysa dokunma
        if section.subject_id:
            continue

        section_name = section.name
        mapping = subject_map.get(section_name)
        if not mapping:
            continue

        code, display_name, exam_type_filter = mapping

        # Alt bölüm varsa sadece alt bölümlere bağla
        # Ana bölümlere bağlama (Temel Matematik ana bölümüne değil,
        # Matematik alt bölümüne bağla)
        has_sub = section.is_sub_section is False and any(
            s.parent_section_id == section.id for s in sections if s.is_sub_section
        )
        if has_sub:
            # Bu ana bölümün alt bölümleri var → ana bölüme subject bağlama
            continue

        # Subject bul veya oluştur
        subject, _created = Subject.objects.get_or_create(
            code=code,
            defaults={
                'name': display_name,
                'display_name': display_name,
                'exam_type_filter': exam_type_filter,
            },
        )

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

    phil = ExamSection.objects.filter(
        exam=exam, name=OPTIONAL_PHILOSOPHY_NAME, is_sub_section=False,
    ).first()
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
        elif name == OPTIONAL_PHILOSOPHY_NAME:
            section = ExamSection.objects.create(
                exam=exam,
                name=row['name'],
                question_start=row['question_start'],
                question_end=row['question_end'],
                order=row['order'],
                is_sub_section=False,
            )
            _auto_link_subjects(exam, [section])
            mains[name] = section

    if not include:
        extra = ExamSection.objects.filter(
            exam=exam, name=OPTIONAL_PHILOSOPHY_NAME, is_sub_section=False,
        )
        extra.delete()

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
            if not child:
                continue
            child.question_start = row['question_start']
            child.question_end = row['question_end']
            child.order = row['order']
            child.save(update_fields=['question_start', 'question_end', 'order', 'question_count'])


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
