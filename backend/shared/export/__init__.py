"""3K Kampüs kurumsal dışa aktarma (Excel/CSV) ortak altyapısı.

Kullanım:

    from shared.export import ExcelExportService, CsvExportService
    from shared.export.style_manager import ExportColumn, ExportStat, ReportMeta

    columns = [
        ExportColumn(key="ad_soyad", label="Ad Soyad", type="text"),
        ExportColumn(key="tc_kimlik", label="TC Kimlik", type="tc"),
        ExportColumn(key="telefon", label="Telefon", type="phone"),
        ExportColumn(key="kayit_tarihi", label="Kayıt Tarihi", type="date"),
        ExportColumn(key="borc", label="Borç", type="currency"),
    ]
    meta = ReportMeta(report_title="ÖĞRENCİ LİSTESİ", kurum_ad=..., sube_ad=..., generated_by=...)
    stats = [ExportStat(label="Toplam Öğrenci", value=120, type="integer")]

    return ExcelExportService.export(rows, columns, meta=meta, stats=stats)
    return CsvExportService.export(rows, columns, meta=meta)
"""
from shared.export.csv_export_service import CsvExportService
from shared.export.excel_export_service import ExcelExportService
from shared.export.style_manager import (
    BRAND_PRIMARY,
    ExportColumn,
    ExportStat,
    ReportMeta,
)

__all__ = [
    "ExcelExportService",
    "CsvExportService",
    "ExportColumn",
    "ExportStat",
    "ReportMeta",
    "BRAND_PRIMARY",
]

# DRF ViewSet action'larında `renderer_classes=[...,  *EXPORT_RENDERER_CLASSES]`
# olarak kullanılır; bkz. shared/export/drf_renderers.py docstring'i.
