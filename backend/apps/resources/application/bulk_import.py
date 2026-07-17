"""Toplu kaynak kitap içe aktarma — şube kapsamlı."""
from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from typing import BinaryIO

from django.db import transaction

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.resources.models import BookType, ResourceBook
from apps.resources.utils import generate_book_kod, normalize_kod

MAX_AD_LENGTH = 200
BULK_BATCH_SIZE = 200

HEADER_ALIASES = {
    'ad': ('kitap adı', 'kitap adi', 'ad', 'kitap', 'book', 'book name', 'title'),
    'kod': ('kod', 'code', 'kitap kodu'),
    'book_type': ('kitap türü', 'kitap turu', 'tür', 'tur', 'book_type', 'type'),
    'ders': ('ders', 'ders kodu', 'ders adı', 'ders adi', 'subject'),
    'sinif': ('sınıf', 'sinif', 'sınıf seviyesi', 'sinif seviyesi', 'sinif_seviyesi', 'grade'),
    'yayinevi': ('yayınevi', 'yayinevi', 'publisher'),
    'yazar': ('yazar', 'author'),
    'yayin_yili': ('yayın yılı', 'yayin yili', 'yayin_yili', 'yıl', 'yil', 'year'),
    'isbn': ('isbn',),
    'zorluk_min': ('zorluk min', 'zorluk_min', 'min zorluk'),
    'zorluk_max': ('zorluk max', 'zorluk_max', 'max zorluk'),
    'aciklama': ('açıklama', 'aciklama', 'description', 'not'),
}


@dataclass
class BulkImportResult:
    toplam_satir: int = 0
    eklenen: int = 0
    guncellenen: int = 0
    atlanan: int = 0
    hatali: int = 0
    hatalar: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            'toplam_satir': self.toplam_satir,
            'eklenen': self.eklenen,
            'guncellenen': self.guncellenen,
            'atlanan': self.atlanan,
            'hatali': self.hatali,
            'hatalar': self.hatalar,
        }


def _cell_str(value) -> str:
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _cell_at(row: tuple, index: int | None) -> str:
    if index is None or index >= len(row):
        return ''
    return _cell_str(row[index])


def _normalize_header(value: str) -> str:
    return (value or '').strip().casefold()


def _map_columns(headers: list[str]) -> dict[str, int]:
    col_map: dict[str, int] = {}
    normalized = [_normalize_header(h) for h in headers]
    for field_name, aliases in HEADER_ALIASES.items():
        alias_fold = {_normalize_header(a) for a in aliases}
        for idx, header in enumerate(normalized):
            if header in alias_fold or any(alias in header for alias in alias_fold):
                col_map[field_name] = idx
                break
    return col_map


def _chain_first_row(first_row, rows_iter):
    yield first_row
    yield from rows_iter


def _parse_int(raw: str) -> int | None:
    if not raw:
        return None
    try:
        return int(float(str(raw).replace(',', '.')))
    except (TypeError, ValueError):
        return None


class BulkBookImportService:
    def __init__(self, *, kurum_id: int, sube_id: int):
        self.kurum_id = kurum_id
        self.sube_id = sube_id
        self._book_types = {
            normalize_kod(bt.kod): bt
            for bt in BookType.objects.filter(aktif_mi=True)
        }
        self._book_types_by_ad = {
            _normalize_header(bt.ad): bt
            for bt in BookType.objects.filter(aktif_mi=True)
        }
        self._dersler = {
            normalize_kod(d.kod): d
            for d in Ders.objects.filter(aktif_mi=True, sube_id=sube_id)
        }
        self._dersler_by_ad = {
            _normalize_header(d.ad): d
            for d in Ders.objects.filter(aktif_mi=True, sube_id=sube_id)
        }
        self._siniflar = {
            normalize_kod(s.kod): s
            for s in SinifSeviyesi.objects.filter(aktif_mi=True, sube_id=sube_id)
        }
        self._siniflar_by_ad = {
            _normalize_header(s.ad): s
            for s in SinifSeviyesi.objects.filter(aktif_mi=True, sube_id=sube_id)
        }
        self._existing_kods = set(
            ResourceBook.objects.filter(sube_id=sube_id).values_list('kod', flat=True)
        )

    def _resolve_book_type(self, raw: str) -> BookType | None:
        if not raw:
            return None
        keyed = normalize_kod(raw)
        if keyed in self._book_types:
            return self._book_types[keyed]
        return self._book_types_by_ad.get(_normalize_header(raw))

    def _resolve_ders(self, raw: str) -> Ders | None:
        if not raw:
            return None
        keyed = normalize_kod(raw)
        if keyed in self._dersler:
            return self._dersler[keyed]
        return self._dersler_by_ad.get(_normalize_header(raw))

    def _resolve_sinif(self, raw: str) -> SinifSeviyesi | None:
        if not raw:
            return None
        # virgülle birden fazla sınıf — ilkini primary, hepsini M2M
        parts = [p.strip() for p in raw.replace(';', ',').split(',') if p.strip()]
        if not parts:
            return None
        first = parts[0]
        keyed = normalize_kod(first)
        if keyed in self._siniflar:
            return self._siniflar[keyed]
        return self._siniflar_by_ad.get(_normalize_header(first))

    def _resolve_sinif_list(self, raw: str) -> list[SinifSeviyesi]:
        if not raw:
            return []
        parts = [p.strip() for p in raw.replace(';', ',').split(',') if p.strip()]
        found: list[SinifSeviyesi] = []
        for part in parts:
            keyed = normalize_kod(part)
            sinif = self._siniflar.get(keyed) or self._siniflar_by_ad.get(_normalize_header(part))
            if sinif and sinif not in found:
                found.append(sinif)
        return found

    def import_rows(self, rows: list[dict]) -> BulkImportResult:
        result = BulkImportResult()
        seen_kods: set[str] = set()
        to_create: list[tuple[ResourceBook, list[SinifSeviyesi]]] = []

        for idx, raw in enumerate(rows, start=1):
            ad = str(raw.get('ad') or '').strip()
            if not ad:
                if any(str(raw.get(k) or '').strip() for k in ('ders', 'book_type', 'sinif')):
                    result.toplam_satir += 1
                    result.hatali += 1
                    result.hatalar.append({'satir': idx, 'ad': '', 'neden': 'Kitap adı boş'})
                continue

            result.toplam_satir += 1
            if len(ad) > MAX_AD_LENGTH:
                result.hatali += 1
                result.hatalar.append({'satir': idx, 'ad': ad, 'neden': 'Kitap adı çok uzun'})
                continue

            book_type = self._resolve_book_type(str(raw.get('book_type') or ''))
            if not book_type:
                result.hatali += 1
                result.hatalar.append({
                    'satir': idx, 'ad': ad,
                    'neden': 'Kitap türü bulunamadı (kod veya ad yazın)',
                })
                continue

            ders = self._resolve_ders(str(raw.get('ders') or ''))
            if not ders:
                result.hatali += 1
                result.hatalar.append({
                    'satir': idx, 'ad': ad,
                    'neden': 'Ders bulunamadı (bu şubedeki ders kodu/adı)',
                })
                continue

            sinif_raw = str(raw.get('sinif') or '')
            sinif_list = self._resolve_sinif_list(sinif_raw)
            sinif = sinif_list[0] if sinif_list else self._resolve_sinif(sinif_raw)
            if not sinif:
                result.hatali += 1
                result.hatalar.append({
                    'satir': idx, 'ad': ad,
                    'neden': 'Sınıf seviyesi bulunamadı (bu şubedeki sınıf kodu/adı)',
                })
                continue
            if not sinif_list:
                sinif_list = [sinif]

            kod_raw = str(raw.get('kod') or '').strip()
            kod = normalize_kod(kod_raw) if kod_raw else generate_book_kod(
                self.kurum_id, book_type, ders, sube_id=self.sube_id,
            )
            # Aynı batch'te generate_book_kod tekrar aynı kodu üretebilir — benzersizleştir
            if not kod_raw:
                base = kod
                n = 1
                while kod in self._existing_kods or kod in seen_kods:
                    n += 1
                    kod = f'{base.rsplit("_", 1)[0]}_{n:03d}' if '_' in base else f'{base}_{n:03d}'

            if kod in self._existing_kods:
                result.atlanan += 1
                seen_kods.add(kod)
                continue
            if kod in seen_kods:
                result.hatali += 1
                result.hatalar.append({
                    'satir': idx, 'ad': ad,
                    'neden': 'Aynı Excel dosyasında tekrar eden kod',
                })
                continue

            seen_kods.add(kod)
            book = ResourceBook(
                ad=ad,
                kod=kod,
                kurum_id=self.kurum_id,
                sube_id=self.sube_id,
                book_type=book_type,
                ders=ders,
                sinif_seviyesi=sinif,
                yayinevi=str(raw.get('yayinevi') or '').strip()[:200],
                yazar=str(raw.get('yazar') or '').strip()[:200],
                yayin_yili=_parse_int(str(raw.get('yayin_yili') or '')),
                isbn=str(raw.get('isbn') or '').strip()[:20],
                zorluk_min=_parse_int(str(raw.get('zorluk_min') or '')),
                zorluk_max=_parse_int(str(raw.get('zorluk_max') or '')),
                aciklama=str(raw.get('aciklama') or '').strip(),
                aktif_mi=True,
            )
            to_create.append((book, sinif_list))

        if to_create:
            with transaction.atomic():
                books = [b for b, _ in to_create]
                ResourceBook.objects.bulk_create(books, batch_size=BULK_BATCH_SIZE)
                # bulk_create sonrası PK'ler dolu (PostgreSQL)
                for book, sinif_list in to_create:
                    if book.pk:
                        book.sinif_seviyeleri.set(sinif_list)
            result.eklenen = len(to_create)

        return result

    def parse_excel(self, file_obj: BinaryIO) -> list[dict]:
        from openpyxl import load_workbook

        wb = load_workbook(file_obj, read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        first_row = next(rows_iter, None)
        if not first_row:
            return []

        headers = [_cell_str(c) for c in first_row]
        col_map = _map_columns(headers)
        start_iter = rows_iter

        if col_map.get('ad') is None:
            col_map = {
                'ad': 0, 'kod': 1, 'book_type': 2, 'ders': 3, 'sinif': 4,
                'yayinevi': 5, 'yazar': 6, 'yayin_yili': 7,
            }
            start_iter = _chain_first_row(first_row, rows_iter)

        parsed_rows: list[dict] = []
        for row in start_iter:
            if not row or all(_cell_str(c) == '' for c in row):
                continue
            parsed_rows.append({
                'ad': _cell_at(row, col_map.get('ad')),
                'kod': _cell_at(row, col_map.get('kod')),
                'book_type': _cell_at(row, col_map.get('book_type')),
                'ders': _cell_at(row, col_map.get('ders')),
                'sinif': _cell_at(row, col_map.get('sinif')),
                'yayinevi': _cell_at(row, col_map.get('yayinevi')),
                'yazar': _cell_at(row, col_map.get('yazar')),
                'yayin_yili': _cell_at(row, col_map.get('yayin_yili')),
                'isbn': _cell_at(row, col_map.get('isbn')),
                'zorluk_min': _cell_at(row, col_map.get('zorluk_min')),
                'zorluk_max': _cell_at(row, col_map.get('zorluk_max')),
                'aciklama': _cell_at(row, col_map.get('aciklama')),
            })
        wb.close()
        return parsed_rows

    def import_excel(self, file_obj: BinaryIO) -> BulkImportResult:
        return self.import_rows(self.parse_excel(file_obj))


def build_excel_template() -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = 'Kitaplar'
    ws.append([
        'Kitap Adı', 'Kod', 'Kitap Türü', 'Ders', 'Sınıf',
        'Yayınevi', 'Yazar', 'Yayın Yılı', 'ISBN', 'Zorluk Min', 'Zorluk Max', 'Açıklama',
    ])
    ws.append([
        'TYT Matematik Soru Bankası', '', 'SORU_BANKASI', 'MAT', '11',
        'Örnek Yayın', 'Ahmet Yılmaz', '2025', '', '3', '7', 'Örnek satır — silip kendi kitaplarınızı girin',
    ])
    ws.append([
        'AYT Fizik Konu Anlatım', '', 'KONU_ANLATIM', 'FIZ', '12',
        '', '', '2024', '', '', '', '',
    ])
    widths = [36, 18, 16, 12, 14, 16, 16, 12, 14, 12, 12, 40]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[chr(64 + i)].width = w
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
