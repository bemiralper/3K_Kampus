"""LGS Excel şablonundan kitapçıkların soru karşılıklarını okur."""
from io import BytesIO
from zipfile import BadZipFile, ZipFile

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from .dual_dat import MAX_BYTES
from .student_matching import normalize_name

SUBJECT_NAMES = (
    ('turkce',),
    ('inkilap tarihi', 'tc inkilap tarihi', 't c inkilap tarihi', 'tc inkilap tarihi ve ataturkculuk'),
    ('din kulturu', 'din kulturu ve ahlak bilgisi'),
    ('yabanci dil', 'ingilizce'),
    ('matematik',),
    ('fen bilgisi', 'fen bilimleri'),
)
HEADER = ['soru no', 'cevap', 'b karsiligi', 'c karsiligi', 'd karsiligi', 'iptal']


def _text(value):
    return str(value).strip() if value is not None else ''


def _number(value):
    text = _text(value)
    return int(text) if text.isascii() and text.isdecimal() and len(text) <= 3 else 0


def read_reference(file, sections):
    raw = file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('Kitapçık Excel dosyası 2 MB sınırını aşıyor.')
    try:
        with ZipFile(BytesIO(raw)) as archive:
            if sum(item.file_size for item in archive.infolist()) > 10 * MAX_BYTES:
                raise ValueError('Kitapçık Excel dosyası çok büyük.')
        workbook = load_workbook(BytesIO(raw), read_only=True, data_only=True, keep_links=False)
        try:
            rows = list(workbook.worksheets[0].iter_rows(max_row=500, max_col=6, values_only=True))
        finally:
            workbook.close()
    except (BadZipFile, InvalidFileException, KeyError, IndexError, SyntaxError, OSError, TypeError, ValueError) as exc:
        raise ValueError('Kitapçık karşılıkları için geçerli bir LGS Excel şablonu yükleyin.') from exc

    reference = {'answers': {}, 'C': {}, 'D': {}}
    names = {name: index for index, aliases in enumerate(SUBJECT_NAMES) for name in aliases}
    if len(sections) != len(SUBJECT_NAMES):
        raise ValueError('Kitapçık Excel şablonu altı LGS dersi gerektirir.')
    if any(names.get(normalize_name(section.name)) != index for index, section in enumerate(sections)):
        raise ValueError('Sınavın ders sırası LGS Excel şablonuyla uyuşmuyor.')
    seen = set()
    for index, row in enumerate(rows[1:], 1):
        if [normalize_name(_text(cell)) for cell in row] != HEADER:
            continue
        subject = normalize_name(_text(rows[index - 1][0]))
        if subject not in names or names[subject] in seen:
            raise ValueError('Excel’deki ders başlıkları LGS şablonuyla uyuşmuyor.')
        section_index = names[subject]
        seen.add(section_index)
        section = sections[section_index]
        expected = set(range(1, section.question_end - section.question_start + 2))
        offset = section.question_start - 1
        block = rows[index + 1:index + 1 + len(expected)]
        columns = [[_number(entry[col]) for entry in block] for col in (0, 3, 4)]
        if any(len(col) != len(expected) or set(col) != expected for col in columns):
            raise ValueError(f'{section.name} için Excel’deki A, C ve D soru numaraları eksiksiz ve benzersiz olmalıdır.')
        for entry, a, c, d in zip(block, *columns):
            answer = _text(entry[1]).upper()
            if answer not in ('A', 'B', 'C', 'D'):
                raise ValueError(f'{section.name} {a}. soru için Excel’de geçerli bir cevap bulunamadı.')
            reference['answers'][str(offset + a)] = answer
            reference['C'][str(offset + a)] = offset + c
            reference['D'][str(offset + a)] = offset + d
    if len(seen) != len(SUBJECT_NAMES):
        raise ValueError('Kitapçık Excel dosyasında altı LGS dersi bulunmalıdır.')
    return reference


def canonical_answers(answers, correspondence):
    """Optikteki C/D sırasından sınavın A soru sırasına döndürür."""
    return ''.join(answers[correspondence[str(question)] - 1] for question in range(1, 91))
