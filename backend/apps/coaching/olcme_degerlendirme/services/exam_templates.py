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

def get_template_sections(exam_type: str) -> list[dict]:
    """Sınav türüne göre şablon alan listesi döner."""
    rows = _TEMPLATES.get(exam_type, [])
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


def get_template_sub_sections(exam_type: str) -> dict[str, list[dict]]:
    """Sınav türüne göre ders listesi döner. {parent_name: [{...}]}"""
    subs_def = _SUB_SECTIONS.get(exam_type, {})
    result: dict[str, list[dict]] = {}
    for parent_name, rows in subs_def.items():
        result[parent_name] = [
            {
                'name': name,
                'question_start': qs,
                'question_end': qe,
                'question_count': qe - qs + 1,
                'order': order,
            }
            for name, qs, qe, order in rows
        ]
    return result


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

    template = get_template_sections(exam.exam_type)
    sub_template = get_template_sub_sections(exam.exam_type)
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

    sub_template = _SUB_SECTIONS.get(exam.exam_type, {})
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
            if (sub[0], parent.id) in existing_subs:
                continue
            sub_section = ExamSection.objects.create(
                exam=exam,
                name=sub[0],
                question_start=sub[1],
                question_end=sub[2],
                order=sub[3],
                is_sub_section=True,
                parent_section=parent,
            )
            created.append(sub_section)

    # ── Subject taşıma + item yeniden eşleştirme ─────────────────────────
    _reassign_subjects_and_items(exam)

    # ── Subject bağlı olmayan bölümlere otomatik Subject bağla ────────
    all_sections = list(
        ExamSection.objects.filter(exam=exam)
    )
    _auto_link_subjects(exam, all_sections)

    return created


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
