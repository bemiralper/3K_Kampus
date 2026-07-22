"""
Finans dışa aktarma servisi — CSV, XLSX, PDF (Faz 4).
"""
from __future__ import annotations

from typing import Any

from django.http import HttpResponse


class ExportService:
    """Tablo verisini json/csv/xlsx/pdf formatlarına dönüştürür."""

    SUPPORTED_FORMATS = ('json', 'csv', 'xlsx', 'pdf')

    _DATE_KEY_HINTS = ('tarih', 'vade', 'date')
    _CURRENCY_KEY_HINTS = (
        'tutar', 'borc', 'bakiye', 'tahsilat', 'gelir', 'gider',
        'kalan', 'ucret', 'fiyat', 'amount',
    )

    @classmethod
    def build(
        cls,
        export_format: str,
        rows: list[dict[str, Any]],
        columns: list[dict[str, str]],
        *,
        title: str = 'Rapor',
        filters_meta: dict[str, Any] | None = None,
        orientation: str = 'portrait',
    ):
        fmt = (export_format or 'json').lower()
        if fmt not in cls.SUPPORTED_FORMATS:
            raise ValueError(f'Desteklenmeyen format: {export_format}')

        ori = cls._normalize_orientation(orientation)

        if fmt == 'json':
            return cls._build_json(rows, columns, title=title, filters_meta=filters_meta)
        if fmt == 'csv':
            return cls._build_csv(rows, columns, title=title, filters_meta=filters_meta)
        if fmt == 'xlsx':
            return cls._build_xlsx(rows, columns, title=title, filters_meta=filters_meta, orientation=ori)
        return cls._build_pdf(rows, columns, title=title, filters_meta=filters_meta, orientation=ori)

    @staticmethod
    def _normalize_orientation(value: str | None) -> str:
        v = (value or 'portrait').lower().strip()
        if v in ('landscape', 'yatay', 'horizontal'):
            return 'landscape'
        return 'portrait'

    @classmethod
    def _column_keys(cls, columns: list[dict[str, str]]) -> tuple[list[str], list[str]]:
        keys = [c['key'] for c in columns]
        labels = [c.get('label', c['key']) for c in columns]
        return keys, labels

    @classmethod
    def _row_values(cls, row: dict, keys: list[str]) -> list[Any]:
        return [row.get(k, '') for k in keys]

    @classmethod
    def _build_json(cls, rows, columns, *, title, filters_meta):
        keys, labels = cls._column_keys(columns)
        return {
            'title': title,
            'filters': filters_meta or {},
            'columns': [{'key': k, 'label': l} for k, l in zip(keys, labels)],
            'rows': [{k: row.get(k, '') for k in keys} for row in rows],
            'count': len(rows),
        }

    @classmethod
    def _infer_column_type(cls, key: str, label: str, explicit: str | None = None) -> str:
        if explicit:
            return explicit
        k = (key or '').lower()
        lbl = (label or '').lower()
        if any(h in k or h in lbl for h in cls._DATE_KEY_HINTS):
            return 'date'
        if any(h in k or h in lbl for h in cls._CURRENCY_KEY_HINTS):
            return 'currency'
        if any(h in k for h in ('adet', 'sayi', 'count', 'miktar')):
            return 'integer'
        return 'text'

    @classmethod
    def _to_export_columns(cls, columns: list[dict[str, str]]):
        from shared.export.style_manager import ExportColumn

        result = []
        for col in columns:
            key = col['key']
            label = col.get('label', key)
            col_type = cls._infer_column_type(key, label, col.get('type'))
            result.append(ExportColumn(key=key, label=label, type=col_type))
        return result

    @classmethod
    def _to_report_meta(cls, title: str, filters_meta: dict[str, Any] | None):
        from shared.export.style_manager import ReportMeta

        meta = filters_meta or {}
        generated_by = (
            meta.get('generated_by')
            or meta.get('raporu_olusturan')
            or meta.get('hazirlayan')
            or ''
        )
        return ReportMeta(
            report_title=title or 'RAPOR',
            kurum_ad=str(meta.get('kurum_ad') or ''),
            sube_ad=str(meta.get('sube_ad') or meta.get('sube') or ''),
            egitim_yili=str(meta.get('egitim_yili') or ''),
            generated_by=str(generated_by),
        )

    @classmethod
    def _to_export_stats(cls, filters_meta: dict[str, Any] | None):
        from shared.export.style_manager import ExportStat

        meta = filters_meta or {}
        stats: list[ExportStat] = []

        for chip in meta.get('summary_chips') or []:
            lbl = chip.get('label')
            if lbl:
                stats.append(ExportStat(label=str(lbl), value=chip.get('value'), type='text'))

        for key, label, col_type in (
            ('toplam', 'Toplam', 'integer'),
            ('adet', 'Adet', 'integer'),
            ('count', 'Kayıt', 'integer'),
            ('toplam_tutar', 'Toplam Tutar', 'currency'),
            ('toplam_kalan', 'Toplam Kalan', 'currency'),
        ):
            if key in meta and meta[key] not in (None, ''):
                stats.append(ExportStat(label=label, value=meta[key], type=col_type))

        return stats

    @classmethod
    def _build_csv(cls, rows, columns, *, title, filters_meta=None):
        from shared.export import CsvExportService

        export_columns = cls._to_export_columns(columns)
        meta = cls._to_report_meta(title, filters_meta)
        return CsvExportService.export(
            rows, export_columns, meta=meta, filename=cls._safe_filename(title),
        )

    @classmethod
    def _build_xlsx(cls, rows, columns, *, title, filters_meta, orientation='portrait'):
        from shared.export import ExcelExportService

        export_columns = cls._to_export_columns(columns)
        meta = cls._to_report_meta(title, filters_meta)
        stats = cls._to_export_stats(filters_meta)
        return ExcelExportService.export(
            rows,
            export_columns,
            meta=meta,
            stats=stats or None,
            orientation=orientation,
            filename=cls._safe_filename(title),
        )

    @classmethod
    def _build_pdf(cls, rows, columns, *, title, filters_meta, orientation='portrait'):
        from apps.communication.application.html_to_pdf import render_html_to_pdf

        meta = filters_meta or {}
        report_kind = meta.get('report_kind')
        kurum_ad = str(meta["kurum_ad"]) if meta.get("kurum_ad") else None

        if report_kind in ('cari_bakiye', 'cari_ozet', 'cari_ekstre'):
            from apps.finans.application.export.cari_report_html import (
                build_cari_report_html,
                cari_report_footer_template,
            )

            html_doc = build_cari_report_html(
                title=title or "Cari Hesap Bakiye Raporu",
                columns=columns,
                rows=rows,
                filters_meta=meta,
                kurum_ad=kurum_ad,
                orientation=orientation,
            )
            footer = cari_report_footer_template(meta)
            try:
                pdf_bytes = render_html_to_pdf(
                    html_doc,
                    landscape=(orientation == 'landscape'),
                    footer_template=footer,
                )
            except RuntimeError:
                pdf_bytes = render_html_to_pdf(
                    html_doc,
                    landscape=(orientation == 'landscape'),
                )
        elif report_kind and str(report_kind).startswith('gelir_gider_'):
            from apps.finans.application.export.gg_report_html import (
                build_gg_report_html,
                gg_report_footer_template,
            )

            html_doc = build_gg_report_html(
                title=title or "Gelir & Gider Raporu",
                columns=columns,
                rows=rows,
                filters_meta=meta,
                kurum_ad=kurum_ad,
                orientation=orientation,
            )
            footer = gg_report_footer_template(meta)
            try:
                pdf_bytes = render_html_to_pdf(
                    html_doc,
                    landscape=(orientation == 'landscape'),
                    footer_template=footer,
                )
            except RuntimeError:
                pdf_bytes = render_html_to_pdf(
                    html_doc,
                    landscape=(orientation == 'landscape'),
                )
        else:
            from apps.finans.application.export.report_html_template import (
                build_finans_report_html,
                finans_report_footer_template,
            )

            keys, _ = cls._column_keys(columns)
            summary = {}
            if filters_meta:
                # Önceden hazırlanmış KPI özet kutuları (Gelir/Gider raporları)
                for chip in (filters_meta.get("summary_chips") or []):
                    lbl = chip.get("label")
                    if lbl:
                        summary[lbl] = chip.get("value")
                for k in ("toplam", "toplam_tutar", "adet", "count", "toplam_kalan"):
                    if k in (filters_meta or {}):
                        summary[k] = filters_meta[k]

            html_doc = build_finans_report_html(
                title=title or "Finans Raporu",
                columns=columns,
                rows=rows,
                filters_meta={
                    k: v for k, v in (filters_meta or {}).items()
                    if k not in ("kurum_ad", "summary_chips")
                },
                kurum_ad=kurum_ad,
                summary=summary or None,
                orientation=orientation,
            )
            footer = finans_report_footer_template(meta)
            try:
                pdf_bytes = render_html_to_pdf(
                    html_doc,
                    landscape=(orientation == 'landscape'),
                    footer_template=footer,
                )
            except RuntimeError:
                from apps.communication.application.pdf_render_service import PdfRenderService

                keys, labels = cls._column_keys(columns)
                lines = [title or "Rapor", ""]
                if filters_meta:
                    for fk, fv in filters_meta.items():
                        if fk != "kurum_ad":
                            lines.append(f"{fk}: {fv}")
                    lines.append("")
                header = " | ".join(labels)
                lines.append(header)
                lines.append("-" * min(len(header), 120))
                for row in rows[:500]:
                    lines.append(" | ".join(str(cls._format_cell(row.get(k, ""))) for k in keys))
                pdf_bytes = PdfRenderService.render_simple_text_pdf(title or "Rapor", "\n".join(lines))

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{cls._safe_filename(title)}.pdf"'
        return response

    @staticmethod
    def _format_cell(value: Any) -> str:
        if value is None:
            return ''
        if isinstance(value, float):
            return f'{value:.2f}'
        return str(value)

    @staticmethod
    def _safe_filename(name: str) -> str:
        safe = ''.join(c if c.isalnum() or c in '-_' else '_' for c in (name or 'rapor'))
        return safe[:80] or 'rapor'
