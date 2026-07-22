"""
CsvExportService — 3K Kampüs kurumsal CSV dışa aktarma servisi.

UTF-8 BOM, doğru ayırıcı (varsayılan ';' — Türkçe Excel yerel ayarına uygun),
standart tarih biçimi, korunmuş sayısal veri tipleri ve temizlenmiş metin
alanları üretir. Bkz. `ExportStyleManager`, `ExcelExportService`.
"""
from __future__ import annotations

import csv
import io
from typing import Any, Sequence

from django.http import HttpResponse

from shared.export import style_manager as sm
from shared.export.style_manager import ExportColumn, ReportMeta


class CsvExportService:
    @classmethod
    def write_letterhead_rows(cls, writer, meta: ReportMeta | dict[str, Any] | None) -> None:
        """Kurumsal üst bilgi satırlarını verilen `csv.writer`'a yazar.

        Çok bölümlü raporlar (örn. gün sonu) `build_csv_text` yerine kendi
        bölüm yapılarını yazarken de tutarlı bir üst bilgi bloğu kullanabilsin
        diye ayrı bir metod olarak sunulur.
        """
        if meta is None:
            return
        if isinstance(meta, dict):
            meta = ReportMeta(**meta)
        writer.writerow([sm.SOFTWARE_FULL_NAME])
        if meta.kurum_ad:
            writer.writerow([f"Kurum: {meta.kurum_ad}"])
        if meta.sube_ad:
            writer.writerow([f"Şube: {meta.sube_ad}"])
        if meta.egitim_yili:
            writer.writerow([f"Eğitim Yılı: {meta.egitim_yili}"])
        writer.writerow([meta.report_title or ""])
        writer.writerow([f"Oluşturma Tarihi: {sm.format_datetime_display(meta.resolved_generated_at())}"])
        if meta.generated_by:
            writer.writerow([f"Oluşturan: {meta.generated_by}"])
        writer.writerow([])

    @classmethod
    def export(
        cls,
        rows: Sequence[dict[str, Any]],
        columns: Sequence[ExportColumn | dict],
        *,
        meta: ReportMeta | dict[str, Any] | None = None,
        delimiter: str = ";",
        filename: str | None = None,
        include_letterhead: bool = True,
    ) -> HttpResponse:
        content = cls.build_csv_text(
            rows, columns, meta=meta, delimiter=delimiter, include_letterhead=include_letterhead,
        )
        title = filename or (
            meta.report_title if isinstance(meta, ReportMeta) else (meta or {}).get("report_title", "rapor")
        )
        response = HttpResponse(content, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{sm.safe_filename(title)}.csv"'
        return response

    @classmethod
    def build_csv_text(
        cls,
        rows: Sequence[dict[str, Any]],
        columns: Sequence[ExportColumn | dict],
        *,
        meta: ReportMeta | dict[str, Any] | None = None,
        delimiter: str = ";",
        include_letterhead: bool = True,
    ) -> str:
        if isinstance(meta, dict):
            meta = ReportMeta(**meta)
        cols = sm.normalize_columns(columns)
        decimal_comma = delimiter == ";"

        buf = io.StringIO()
        buf.write("\ufeff")  # UTF-8 BOM — Türkçe karakterler Excel'de bozulmasın
        writer = csv.writer(buf, delimiter=delimiter, lineterminator="\r\n")

        if include_letterhead and meta is not None:
            writer.writerow([sm.SOFTWARE_FULL_NAME])
            if meta.kurum_ad:
                writer.writerow([f"Kurum: {meta.kurum_ad}"])
            if meta.sube_ad:
                writer.writerow([f"Şube: {meta.sube_ad}"])
            if meta.egitim_yili:
                writer.writerow([f"Eğitim Yılı: {meta.egitim_yili}"])
            writer.writerow([meta.report_title or ""])
            writer.writerow([f"Oluşturma Tarihi: {sm.format_datetime_display(meta.resolved_generated_at())}"])
            if meta.generated_by:
                writer.writerow([f"Oluşturan: {meta.generated_by}"])
            writer.writerow([])

        writer.writerow([c.label for c in cols])
        for row in rows:
            writer.writerow([cls._csv_cell(row.get(c.key), c, decimal_comma=decimal_comma) for c in cols])

        return buf.getvalue()

    @staticmethod
    def _csv_cell(value: Any, column: ExportColumn, *, decimal_comma: bool) -> str:
        if value is None or value == "":
            return ""
        if column.type == "year":
            num = sm.to_number(value)
            return str(int(num)) if num is not None else str(value).strip()
        if column.type in ("integer", "decimal", "currency", "percent"):
            num = sm.to_number(value)
            if num is None:
                return str(value).strip()
            if column.type == "percent" and abs(num) > 1:
                num = num / 100.0
            decimals = 0 if column.type == "integer" else 2
            if decimal_comma:
                return sm.format_number_display(num, decimals=decimals)
            text = f"{num:.{decimals}f}"
            return text
        if column.type == "date":
            return sm.format_date_display(value)
        if column.type == "datetime":
            return sm.format_datetime_display(value)
        if column.type == "phone":
            return sm.format_phone_display(value)
        if column.type == "bool":
            return "Evet" if value else "Hayır"
        text = str(value).replace("\r", " ").replace("\n", " ")
        return " ".join(text.split())
