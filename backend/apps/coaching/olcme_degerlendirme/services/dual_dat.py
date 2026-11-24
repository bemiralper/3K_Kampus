"""LGS optiklerini ders aralıklarına ve öğrenci kayıtlarına göre birleştirir."""
from collections import defaultdict
from dataclasses import dataclass

from .student_matching import (
    DatIdentity,
    normalize_id,
    normalize_name,
    normalize_student_no,
    pick_auto_match,
)

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


def _read_rows(lines, part, sections, config, pool_by_id, overrides):
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
        automatic_student_id = student_id = None
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


def _row_issue(verbal, numeric, *, student_id, student_issue, reference, keyed_booklets):
    active_verbal = [row for row in verbal if not row.excluded]
    active_numeric = [row for row in numeric if not row.excluded]
    if not active_verbal and not active_numeric:
        return None
    if len(active_verbal) > 1 or len(active_numeric) > 1:
        return 'Aynı optikte öğrenci için birden fazla satır var.'
    if not active_verbal or not active_numeric:
        return 'Diğer optikte bu öğrenciye ait satır bulunamadı.'
    left, right = active_verbal[0], active_numeric[0]
    if left.booklet not in BOOKLETS or right.booklet not in BOOKLETS:
        return 'Her iki satırın kitapçık kodunu kontrol edin.'
    if left.booklet != right.booklet:
        return 'İki optikteki kitapçık kodu farklı.'
    if left.booklet in ('C', 'D') and left.booklet not in keyed_booklets and not reference:
        return f'{left.booklet} kitapçığı için sınavda cevap anahtarı ya da Excel karşılığı yok.'
    return student_issue


def _identity_conflict(left, right):
    left_tc = normalize_id(left.tc)
    right_tc = normalize_id(right.tc)
    if left_tc and right_tc and left_tc != right_tc:
        return True
    left_no = normalize_student_no(left.school_no)
    right_no = normalize_student_no(right.school_no)
    if left_no and right_no and left_no != right_no:
        return True
    return False


def prepare_pairs(lines_by_part, sections, config, pool, taken_ids, *, reference=None, keyed_booklets=()):
    validate_layout(sections)
    if not isinstance(config, dict) or not isinstance(config.get('overrides', {}), dict):
        raise ValueError('İki DAT ayarları geçersiz.')
    pool_by_id = {student.pk: student for student in pool}
    keyed = set(keyed_booklets)
    rows = {
        part: _read_rows(
            lines_by_part[part], part, part_sections(sections, part),
            config.get(part), pool_by_id, config.get('overrides', {}).get(part, {}),
        )
        for part in PARTS
    }
    blocked: set[int] = set()
    for part, items in rows.items():
        for row in items:
            if row.excluded or row.student_id:
                continue
            hit = pick_auto_match(DatIdentity(
                name=row.name, tc=row.tc, ogrenci_no=row.school_no,
            ), pool, blocked)
            if hit:
                row.student_id = row.automatic_student_id = hit.student.pk

    by_student = defaultdict(lambda: {part: [] for part in PARTS})
    by_name = defaultdict(lambda: {part: [] for part in PARTS})
    for part, items in rows.items():
        for row in items:
            if row.excluded:
                continue
            if row.student_id:
                by_student[row.student_id][part].append(row)
            key = normalize_name(row.name)
            if key:
                by_name[key][part].append(row)

    for name, part_rows in by_name.items():
        verbal, numeric = part_rows['verbal'], part_rows['numeric']
        if len(verbal) != 1 or len(numeric) != 1:
            continue
        left, right = verbal[0], numeric[0]
        if left.student_id and not right.student_id:
            right.student_id = left.student_id
            by_student[left.student_id]['numeric'].append(right)
        elif right.student_id and not left.student_id:
            left.student_id = right.student_id
            by_student[right.student_id]['verbal'].append(left)

    pairs = []
    row_issue = {}
    for student_id, part_rows in by_student.items():
        student_issue = 'Bu öğrenci için başka bir yüklemede sonuç var.' if student_id in taken_ids else None
        issue = _row_issue(
            part_rows['verbal'], part_rows['numeric'],
            student_id=student_id, student_issue=student_issue,
            reference=reference, keyed_booklets=keyed,
        )
        if issue is None:
            pairs.append((
                student_id,
                next(row for row in part_rows['verbal'] if not row.excluded),
                next(row for row in part_rows['numeric'] if not row.excluded),
            ))
            continue
        for part, items in part_rows.items():
            for row in items:
                if not row.excluded:
                    row_issue[(part, row.number)] = issue

    registered_names = {normalize_name(student.full_name) for student in pool}
    registered_names.discard('')
    guest_rows = set()
    for name, part_rows in by_name.items():
        if name in registered_names:
            continue
        free = {
            part: [row for row in part_rows[part] if not row.student_id]
            for part in PARTS
        }
        if len(free['verbal']) != 1 or len(free['numeric']) != 1:
            continue
        left, right = free['verbal'][0], free['numeric'][0]
        if _identity_conflict(left, right):
            row_issue[('verbal', left.number)] = 'TC veya öğrenci no iki optikte farklı.'
            row_issue[('numeric', right.number)] = 'TC veya öğrenci no iki optikte farklı.'
            continue
        issue = _row_issue(
            [left], [right], student_id=None, student_issue=None,
            reference=reference, keyed_booklets=keyed,
        )
        if issue:
            row_issue[('verbal', left.number)] = issue
            row_issue[('numeric', right.number)] = issue
            continue
        pairs.append((None, left, right))
        guest_rows.add(('verbal', left.number))
        guest_rows.add(('numeric', right.number))

    for part, items in rows.items():
        for row in items:
            if row.excluded or row.student_id or (part, row.number) in row_issue or (part, row.number) in guest_rows:
                continue
            row_issue[(part, row.number)] = 'Öğrenci doğrulanamadı.' if normalize_name(row.name) or row.tc or row.school_no else 'Diğer optikte bu öğrenciye ait satır bulunamadı.'

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
            'unregistered': (part, row.number) in guest_rows,
            'excluded': row.excluded,
            'issue': None if row.excluded else row_issue.get((part, row.number)),
        } for row in items]
    return pairs, preview
