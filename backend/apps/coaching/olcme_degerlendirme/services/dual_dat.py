"""LGS optiklerini ders aralıklarına ve öğrenci kayıtlarına göre birleştirir."""
from collections import defaultdict
from dataclasses import dataclass

from .student_matching import normalize_id, normalize_name, normalize_student_no

BOOKLETS = ('A', 'B', 'C', 'D')
PARTS = {'verbal': (1, 50), 'numeric': (51, 90)}
IDENTITY_FIELDS = ('tc_kimlik', 'ogrenci_no', 'ad_soyad')
MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 2000
MAX_COLUMNS = 1000


@dataclass
class OpticalRow:
    number: int
    name: str
    tc: str
    school_no: str
    booklet: str
    answers: str
    source_booklet: str
    automatic_student_id: int | None
    student_id: int | None
    excluded: bool


def read_lines(file):
    raw = file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES or b'\0' in raw:
        raise ValueError('DAT dosyası geçersiz veya 2 MB sınırını aşıyor.')
    for encoding in ('utf-8-sig', 'windows-1254', 'iso-8859-9'):
        try:
            lines = raw.decode(encoding).splitlines()
            break
        except UnicodeDecodeError:
            continue
    if not lines or len(lines) > MAX_ROWS or max(map(len, lines)) > MAX_COLUMNS:
        raise ValueError('DAT dosyası boş veya satır/sütun sınırını aşıyor.')
    return lines


def part_sections(sections, part):
    start, end = PARTS[part]
    return [section for section in sections if start <= section.question_start <= section.question_end <= end]


def validate_layout(sections):
    questions = [n for section in sections for n in range(section.question_start, section.question_end + 1)]
    if sorted(questions) != list(range(1, 91)) or sum(
        len(part_sections(sections, part)) for part in PARTS
    ) != len(sections):
        raise ValueError('İki DAT için sınavın sözel 1–50 ve sayısal 51–90 soru aralıkları eksiksiz olmalıdır.')


def _mapping(config, sections):
    if not isinstance(config, dict) or not isinstance(config.get('field_mappings'), list):
        raise ValueError('Her iki optiğin sütun eşleştirmesini girin.')
    widths = {f'ders_{sec.pk}': sec.question_end - sec.question_start + 1 for sec in sections}
    allowed = set(widths) | set(IDENTITY_FIELDS) | {'kitapcik_turu'}
    ranges = {}
    for item in config['field_mappings']:
        if not isinstance(item, dict) or not isinstance(item.get('field'), str):
            raise ValueError('Geçersiz sütun eşleştirmesi.')
        field, start, end = item['field'], item.get('start'), item.get('end')
        if field not in allowed or field in ranges or type(start) is not int or type(end) is not int:
            raise ValueError('Geçersiz veya tekrarlanan sütun eşleştirmesi.')
        if not 0 <= start < end <= MAX_COLUMNS or field in widths and end - start != widths[field]:
            raise ValueError('Her dersin sütun genişliği soru sayısına eşit olmalıdır.')
        ranges[field] = (start, end)
    if not widths.keys() <= ranges.keys() or 'kitapcik_turu' not in ranges or not ranges.keys() & set(IDENTITY_FIELDS):
        raise ValueError('Tüm dersleri, kitapçığı ve en az bir öğrenci alanını eşleyin.')
    ordered = sorted(ranges.values())
    if any(end > next_start for (_, end), (next_start, _) in zip(ordered, ordered[1:])):
        raise ValueError('Eşlenen sütunlar birbiriyle örtüşüyor.')
    return ranges


def _student_indexes(pool):
    indexes = {field: defaultdict(set) for field in IDENTITY_FIELDS}
    for student in pool:
        for field, key in (
            ('tc_kimlik', normalize_id(student.tc)),
            ('ogrenci_no', normalize_student_no(student.okul_no)),
            ('ad_soyad', normalize_name(student.full_name)),
        ):
            if key:
                indexes[field][key].add(student.pk)
    return indexes


def _automatic_student(indexes, tc, school_no, name):
    tc_ids = indexes['tc_kimlik'].get(normalize_id(tc), set())
    school_ids = indexes['ogrenci_no'].get(normalize_student_no(school_no), set())
    name_ids = indexes['ad_soyad'].get(normalize_name(name), set())
    candidates = [ids for ids in (tc_ids, school_ids, name_ids) if ids]
    if not candidates:
        return None
    # Girilmiş ancak doğrulanamayan bir TC numarası manuel inceleme gerektirir.
    if tc and not tc_ids:
        return None
    common = set.intersection(*candidates)
    return next(iter(common)) if len(common) == 1 else None


def _read_rows(lines, part, sections, config, pool_by_id, indexes, overrides):
    mapping = _mapping(config, sections)
    header = config.get('first_line_is_header', False)
    if not isinstance(header, bool) or not isinstance(overrides, dict):
        raise ValueError('Başlık veya öğrenci düzeltmeleri geçersiz.')
    rows = []
    width = max(end for _, end in mapping.values())
    for number, line in enumerate(lines, 1):
        if (number == 1 and header) or not line.strip():
            continue
        if len(line) < width:
            raise ValueError(f'{part_label(part)} {number}. satır eşlenen sütunlardan kısa.')

        def field(key):
            start, end = mapping.get(key, (0, 0))
            return line[start:end]

        tc, school_no, name = (field(key).strip() for key in IDENTITY_FIELDS)
        booklet = field('kitapcik_turu').strip().upper()
        booklet = dict(zip('1234', BOOKLETS)).get(booklet, booklet)
        answers = ''.join(field(f'ders_{sec.pk}') for sec in sections)
        source_booklet = booklet
        automatic_student_id = student_id = _automatic_student(indexes, tc, school_no, name)
        override = overrides.get(str(number), {})
        if not isinstance(override, dict):
            raise ValueError('Satır düzeltmesi geçersiz.')
        if 'student_id' in override:
            student_id = override['student_id']
            if type(student_id) is not int or student_id not in pool_by_id:
                raise ValueError('Seçilen öğrenci sınavın öğrenci havuzunda bulunmuyor.')
        if 'booklet' in override:
            booklet = override['booklet']
            if booklet not in BOOKLETS:
                raise ValueError('Kitapçık A, B, C veya D olmalıdır.')
        excluded = override.get('excluded', False)
        if not isinstance(excluded, bool):
            raise ValueError('Hariç tutma seçimi geçersiz.')
        rows.append(OpticalRow(
            number, name, tc, school_no, booklet, answers, source_booklet, automatic_student_id, student_id, excluded,
        ))
    if not rows:
        raise ValueError(f'{part_label(part)} dosyasında öğrenci satırı yok.')
    if overrides.keys() - {str(row.number) for row in rows}:
        raise ValueError('Düzeltmelerden biri geçersiz satıra ait.')
    return rows


def part_label(part):
    return 'Sözel' if part == 'verbal' else 'Sayısal'


def prepare_pairs(lines_by_part, sections, config, pool, taken_ids, *, reference=None):
    validate_layout(sections)
    if not isinstance(config, dict) or not isinstance(config.get('overrides', {}), dict):
        raise ValueError('İki DAT ayarları geçersiz.')
    pool_by_id = {student.pk: student for student in pool}
    indexes = _student_indexes(pool)
    rows = {
        part: _read_rows(
            lines_by_part[part], part, part_sections(sections, part),
            config.get(part), pool_by_id, indexes, config.get('overrides', {}).get(part, {}),
        )
        for part in PARTS
    }
    by_student = defaultdict(lambda: defaultdict(list))
    for part, items in rows.items():
        for row in items:
            if row.student_id and not row.excluded:
                by_student[row.student_id][part].append(row)

    pairs = []
    issues = {}
    for student_id, parts in by_student.items():
        verbal, numeric = parts['verbal'], parts['numeric']
        if student_id in taken_ids:
            issue = 'Bu öğrenci için başka bir yüklemede sonuç var.'
        elif len(verbal) > 1 or len(numeric) > 1:
            issue = 'Aynı optikte öğrenci için birden fazla satır var.'
        elif not verbal or not numeric:
            issue = 'Diğer optikte bu öğrenciye ait satır bulunamadı.'
        elif verbal[0].booklet not in BOOKLETS or numeric[0].booklet not in BOOKLETS:
            issue = 'Her iki satırın kitapçık kodunu kontrol edin.'
        elif verbal[0].booklet != numeric[0].booklet:
            issue = 'İki optikteki kitapçık kodu farklı.'
        elif verbal[0].booklet in ('C', 'D') and not reference:
            issue = 'C/D soru karşılıklarını içeren sınav Excel dosyası gerekli.'
        else:
            pairs.append((student_id, verbal[0], numeric[0]))
            continue
        issues[student_id] = issue

    preview = {}
    for part, items in rows.items():
        preview[part] = [{
            'row': row.number,
            'name': row.name,
            'school_no': row.school_no,
            'booklet': row.booklet,
            'source_booklet': row.source_booklet,
            'automatic_student_id': row.automatic_student_id,
            'student_id': row.student_id,
            'student_name': pool_by_id[row.student_id].full_name if row.student_id else '',
            'excluded': row.excluded,
            'issue': None if row.excluded else (
                issues.get(row.student_id) if row.student_id else 'Öğrenci doğrulanamadı.'
            ),
        } for row in items]
    return pairs, preview
