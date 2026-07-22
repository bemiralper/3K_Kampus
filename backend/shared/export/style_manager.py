"""
ExportStyleManager — 3K Kampüs kurumsal dışa aktarma (Excel/CSV) stil ve biçim
standardı. Tüm liste ekranlarının export'ları bu modülü kullanmalıdır.

Bu modül; renkler, fontlar, hücre biçimleri, tarih/para/telefon/TC formatlama,
otomatik sütun genişliği hesaplama ve kurumsal logo çözümlemesi gibi ortak
davranışları tek bir yerden yönetir. `ExcelExportService` ve `CsvExportService`
bu sınıfın üzerine kuruludur.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable, Sequence

from django.conf import settings
from django.utils import timezone

SOFTWARE_NAME = "3K Kampüs"
SOFTWARE_FULL_NAME = "3K Kampüs Eğitim Yönetim Sistemi"
SOFTWARE_URL = "www.3kkampus.com"

# Kurumsal kimlik — istek üzerine tüm export yüzeylerinde standart renk.
BRAND_PRIMARY = "#0061A6"
BRAND_PRIMARY_HEX = "0061A6"
BRAND_PRIMARY_DARK_HEX = "004A80"
BRAND_TEXT_ON_PRIMARY_HEX = "FFFFFF"
ZEBRA_FILL_HEX = "F2F6FA"
STAT_LABEL_FILL_HEX = "FFFFFF"
STAT_VALUE_FILL_HEX = "E8F1FA"
BORDER_COLOR_HEX = "D9D9D9"

FONT_NAME = "Calibri"
FONT_SIZE = 11

MIN_COLUMN_WIDTH = 10
MAX_COLUMN_WIDTH = 40

# Excel tarih/saat biçim kodları (openpyxl number_format)
NUMFMT_DATE = "DD.MM.YYYY"
NUMFMT_DATETIME = "DD.MM.YYYY HH:MM"
NUMFMT_INTEGER = "#,##0"
NUMFMT_DECIMAL = "#,##0.00"
NUMFMT_PERCENT = "0.00%"
NUMFMT_CURRENCY = {
    "TRY": '#,##0.00 "₺"',
    "USD": '"$"#,##0.00',
    "EUR": '#,##0.00 "€"',
}
CURRENCY_SYMBOL = {"TRY": "₺", "USD": "$", "EUR": "€"}

# Metinsel (CSV / ekran) gösterim biçimleri
DISPLAY_DATE_FMT = "%d.%m.%Y"
DISPLAY_DATETIME_FMT = "%d.%m.%Y %H:%M"

_ALIGN_LEFT = "text"
_ALIGN_RIGHT = {"number", "integer", "decimal", "currency", "percent", "year"}
_ALIGN_CENTER = {"date", "datetime", "phone", "tc", "bool"}

ColumnType = str  # "text" | "number" | "integer" | "decimal" | "currency" | "percent" | "date" | "datetime" | "phone" | "tc" | "bool" | "year"


@dataclass
class ExportColumn:
    """Bir dışa aktarma sütununun anlamı, tipi ve görüntüleme kuralları."""

    key: str
    label: str
    type: ColumnType = "text"
    currency: str = "TRY"
    width: int | None = None  # manuel genişlik (karakter); verilmezse otomatik hesaplanır
    wrap: bool | None = None  # None -> otomatik (genişlik sınırına göre)

    def alignment(self) -> str:
        if self.type in _ALIGN_RIGHT:
            return "right"
        if self.type in _ALIGN_CENTER:
            return "center"
        return "left"


@dataclass
class ExportStat:
    """Tablonun üstünde gösterilen küçük özet kutusu (örn. Toplam Öğrenci)."""

    label: str
    value: Any
    type: ColumnType = "text"
    currency: str = "TRY"


@dataclass
class ReportMeta:
    """Kurumsal başlık bloğunda gösterilecek bilgiler."""

    report_title: str
    kurum_ad: str = ""
    sube_ad: str = ""
    egitim_yili: str = ""
    generated_by: str = ""
    generated_at: datetime | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def resolved_generated_at(self) -> datetime:
        return self.generated_at or timezone.localtime(timezone.now())


def normalize_columns(columns: Sequence[ExportColumn | dict]) -> list[ExportColumn]:
    result: list[ExportColumn] = []
    for col in columns:
        if isinstance(col, ExportColumn):
            result.append(col)
        else:
            result.append(ExportColumn(
                key=col["key"],
                label=col.get("label", col["key"]),
                type=col.get("type", "text"),
                currency=col.get("currency", "TRY"),
                width=col.get("width"),
                wrap=col.get("wrap"),
            ))
    return result


def normalize_stats(stats: Sequence[ExportStat | dict] | None) -> list[ExportStat]:
    if not stats:
        return []
    result: list[ExportStat] = []
    for s in stats:
        if isinstance(s, ExportStat):
            result.append(s)
        else:
            result.append(ExportStat(
                label=s["label"],
                value=s.get("value"),
                type=s.get("type", "text"),
                currency=s.get("currency", "TRY"),
            ))
    return result


def to_number(value: Any) -> float | None:
    """Herhangi bir metin/sayı değerini float'a çevirir (TR/EN ondalık toleranslı)."""
    return _to_decimal_number(value)


def _to_decimal_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    text = text.replace(" ", "")
    # "1.234,56" (TR) veya "1234.56" biçimlerini tolere et
    if re.match(r"^-?\d{1,3}(\.\d{3})*(,\d+)?$", text):
        text = text.replace(".", "").replace(",", ".")
    elif "," in text and "." not in text:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _to_date_value(value: Any) -> date | datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d.%m.%Y %H:%M", "%d.%m.%Y"):
        try:
            return datetime.strptime(text[:19] if "T" in text or " " in text else text, fmt)
        except ValueError:
            continue
    return None


def format_number_display(value: Any, *, decimals: int = 2) -> str:
    num = _to_decimal_number(value)
    if num is None:
        return "" if value in (None, "") else str(value)
    text = f"{num:,.{decimals}f}"
    text = text.replace(",", "\ufffd").replace(".", ",").replace("\ufffd", ".")
    return text


def format_currency_display(value: Any, currency: str = "TRY") -> str:
    num = _to_decimal_number(value)
    if num is None:
        return "" if value in (None, "") else str(value)
    symbol = CURRENCY_SYMBOL.get((currency or "TRY").upper(), "₺")
    body = format_number_display(num, decimals=2)
    if symbol == "$":
        return f"{symbol}{body}"
    return f"{body} {symbol}"


def format_date_display(value: Any) -> str:
    dt = _to_date_value(value)
    if dt is None:
        return "" if value in (None, "") else str(value)
    return dt.strftime(DISPLAY_DATE_FMT)


def format_datetime_display(value: Any) -> str:
    dt = _to_date_value(value)
    if dt is None:
        return "" if value in (None, "") else str(value)
    if isinstance(dt, datetime) and (dt.hour or dt.minute):
        return dt.strftime(DISPLAY_DATETIME_FMT)
    if isinstance(dt, datetime):
        return dt.strftime(DISPLAY_DATE_FMT)
    return dt.strftime(DISPLAY_DATE_FMT)


def format_phone_display(value: Any) -> str:
    if value in (None, ""):
        return ""
    digits = re.sub(r"\D", "", str(value))
    if len(digits) == 10:
        return f"0{digits[0:3]} {digits[3:6]} {digits[6:8]} {digits[8:10]}"
    if len(digits) == 11 and digits.startswith("0"):
        return f"{digits[0:4]} {digits[4:7]} {digits[7:9]} {digits[9:11]}"
    return str(value)


def format_cell_display(value: Any, column: ExportColumn) -> str:
    """CSV / metinsel görünüm için hücre biçimlendirmesi (madde 7-8)."""
    if value is None:
        return ""
    if column.type in ("date",):
        return format_date_display(value)
    if column.type == "datetime":
        return format_datetime_display(value)
    if column.type == "currency":
        return format_currency_display(value, column.currency)
    if column.type in ("integer",):
        num = _to_decimal_number(value)
        return format_number_display(num, decimals=0) if num is not None else str(value)
    if column.type == "year":
        num = _to_decimal_number(value)
        return str(int(num)) if num is not None else str(value)
    if column.type == "decimal":
        return format_number_display(value, decimals=2)
    if column.type == "percent":
        num = _to_decimal_number(value)
        if num is None:
            return str(value)
        return f"{format_number_display(num * 100 if abs(num) <= 1 else num, decimals=2)}%"
    if column.type == "phone":
        return format_phone_display(value)
    if column.type == "bool":
        return "Evet" if value else "Hayır"
    text = str(value)
    return re.sub(r"[\r\n]+", " ", text).strip()


def excel_number_format(column: ExportColumn) -> str | None:
    if column.type == "date":
        return NUMFMT_DATE
    if column.type == "datetime":
        return NUMFMT_DATETIME
    if column.type == "currency":
        return NUMFMT_CURRENCY.get((column.currency or "TRY").upper(), NUMFMT_CURRENCY["TRY"])
    if column.type == "integer":
        return NUMFMT_INTEGER
    if column.type == "year":
        return "0"
    if column.type == "decimal":
        return NUMFMT_DECIMAL
    if column.type == "percent":
        return NUMFMT_PERCENT
    return None


def excel_cell_value(value: Any, column: ExportColumn) -> Any:
    """Excel hücresine yazılacak *gerçek* değer (sayı/tarih tipleri korunur)."""
    if value in (None, ""):
        return None
    if column.type in ("date", "datetime"):
        dt = _to_date_value(value)
        return dt if dt is not None else str(value)
    if column.type in ("integer", "decimal", "currency", "percent", "year"):
        num = _to_decimal_number(value)
        if num is None:
            return str(value)
        if column.type == "percent" and abs(num) > 1:
            num = num / 100.0
        if column.type in ("integer", "year"):
            return int(round(num))
        return num
    if column.type == "bool":
        return "Evet" if value else "Hayır"
    text = str(value)
    return re.sub(r"[\r\n]+", " ", text).strip()


def compute_column_width(label: str, display_values: Iterable[str], *, min_width: int = MIN_COLUMN_WIDTH,
                          max_width: int = MAX_COLUMN_WIDTH) -> tuple[int, bool]:
    """(genişlik, wrap_gerekli_mi) döner. Genişlik karakter birimindedir."""
    max_len = len(label or "")
    for v in display_values:
        if v is None:
            continue
        length = max((len(line) for line in str(v).splitlines()), default=0)
        if length > max_len:
            max_len = length
    ideal = max_len + 2
    width = max(min_width, min(max_width, ideal))
    needs_wrap = ideal > max_width
    return width, needs_wrap


def estimate_wrapped_row_height(cell_texts_and_widths: Iterable[tuple[str, int]], *, base_height: float = 18.0,
                                 line_height: float = 14.0) -> float:
    max_lines = 1
    for text, width in cell_texts_and_widths:
        if not text:
            continue
        effective_width = max(width - 2, 1)
        for line in str(text).split("\n"):
            lines = max(1, math.ceil(len(line) / effective_width))
            max_lines = max(max_lines, lines)
    return max(base_height, max_lines * line_height)


_LOGO_CANDIDATES = (
    "static/img/3k-logo.png",
    "../frontend/public/img/3k-logo.png",
)


def resolve_logo_path(kurum=None, sube=None) -> Path | None:
    """Excel gövdesine gömülecek logo dosyasının yolunu döner.

    Öncelik: şube/kurum kurumsal logosu (varsa geçici dosyaya yazılmaz, doğrudan
    statik 3K logosu kullanılır — openpyxl Image dosya yolu ister). Kurumun
    kendi logosunu göstermek istersek ileride bir geçici dosyaya yazılabilir;
    şimdilik marka tutarlılığı için her raporda 3K Kampüs logosu kullanılır.
    """
    base_dir = Path(getattr(settings, "BASE_DIR", "."))
    for rel in _LOGO_CANDIDATES:
        candidate = (base_dir / rel).resolve()
        if candidate.is_file():
            return candidate
    return None


_TR_UPPER_MAP = str.maketrans({"i": "İ", "ı": "I", "ş": "Ş", "ğ": "Ğ", "ü": "Ü", "ö": "Ö", "ç": "Ç"})


def tr_upper(text: str) -> str:
    """Türkçe karakter uyumlu büyük harfe çevirme (İ/I noktalama sorununu önler)."""
    if not text:
        return text or ""
    return text.translate(_TR_UPPER_MAP).upper()


def safe_filename(name: str, *, default: str = "rapor") -> str:
    safe = re.sub(r"[^A-Za-z0-9ığüşöçİĞÜŞÖÇ _-]", "_", name or default)
    safe = safe.strip().replace(" ", "_")
    return safe[:80] or default


def safe_sheet_title(name: str, *, default: str = "Rapor") -> str:
    safe = re.sub(r"[\[\]:*?/\\]", " ", name or default).strip()
    return (safe or default)[:31]
