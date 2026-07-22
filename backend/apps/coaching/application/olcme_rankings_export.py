"""Ölçme değerlendirme — sıralama listesi dışa aktarma (Excel/CSV) kolonları, meta ve istatistikler."""
from __future__ import annotations

ALAN_LABELS = {
    'SAYISAL': 'Sayısal',
    'SOZEL': 'Sözel',
    'ESIT_AGIRLIK': 'Eşit Ağırlık',
}

EXPORT_COLUMNS = {
    'sira': 'Sıra',
    'student_name': 'Öğrenci Adı',
    'sinif': 'Sınıf/Şube',
    'alan_display': 'Alan',
    'toplam_net': 'Toplam Net',
    'total_correct': 'Doğru',
    'total_wrong': 'Yanlış',
    'total_empty': 'Boş',
    'puan': 'Puan',
    'kurum_ici_yuzdelik': 'Kurum İçi Yüzdelik',
    'tahmini_siralama': 'Tahmini TR Sıralaması',
    'yuzdelik_dilim': 'TR Yüzdelik Dilimi',
}

AYT_PUAN_TURU_COLUMNS = {
    'puan_say': 'SAY Puanı',
    'puan_ea': 'EA Puanı',
    'puan_soz': 'SÖZ Puanı',
}

EXPORT_COLUMN_TYPES = {
    'sira': 'integer',
    'toplam_net': 'decimal',
    'total_correct': 'integer',
    'total_wrong': 'integer',
    'total_empty': 'integer',
    'puan': 'decimal',
    'kurum_ici_yuzdelik': 'percent',
    'tahmini_siralama': 'integer',
    'yuzdelik_dilim': 'percent',
    'puan_say': 'decimal',
    'puan_ea': 'decimal',
    'puan_soz': 'decimal',
}


def build_export_rows(ranking_list: list[dict], *, is_ayt: bool) -> list[dict]:
    rows = []
    for r in ranking_list:
        row = {
            'sira': r.get('kurum_ici_sira'),
            'student_name': r.get('student_name') or '',
            'sinif': r.get('sinif') or '',
            'alan_display': ALAN_LABELS.get(r.get('alan') or '', r.get('alan') or ''),
            'toplam_net': r.get('toplam_net'),
            'total_correct': r.get('total_correct') or 0,
            'total_wrong': r.get('total_wrong') or 0,
            'total_empty': r.get('total_empty') or 0,
            'puan': r.get('puan'),
            'kurum_ici_yuzdelik': r.get('kurum_ici_yuzdelik'),
            'tahmini_siralama': r.get('tahmini_siralama'),
            'yuzdelik_dilim': r.get('yuzdelik_dilim'),
        }
        if is_ayt:
            pt = r.get('puan_turleri') or {}
            row['puan_say'] = (pt.get('SAY') or {}).get('puan')
            row['puan_ea'] = (pt.get('EA') or {}).get('puan')
            row['puan_soz'] = (pt.get('SOZ') or {}).get('puan')
        rows.append(row)
    return rows


def build_export_columns(*, is_ayt: bool):
    from shared.export.style_manager import ExportColumn

    columns = dict(EXPORT_COLUMNS)
    if is_ayt:
        columns.update(AYT_PUAN_TURU_COLUMNS)
    return [
        ExportColumn(key=key, label=label, type=EXPORT_COLUMN_TYPES.get(key, 'text'))
        for key, label in columns.items()
    ]


def build_export_meta(request, exam, *, report_title: str | None = None):
    from shared.export.style_manager import ReportMeta

    kurum_ad = getattr(exam.kurum, 'ad', '') if exam.kurum_id else ''
    sube_ad = getattr(exam.sube, 'ad', '') if exam.sube_id else ''
    egitim_yili = str(exam.egitim_yili) if exam.egitim_yili_id else ''

    user = getattr(request, 'user', None)
    generated_by = ''
    if user and getattr(user, 'is_authenticated', False):
        generated_by = user.get_full_name() or user.get_username()

    title = report_title or f'{exam.name} — Sıralama Sonuçları'
    return ReportMeta(
        report_title=title,
        kurum_ad=kurum_ad,
        sube_ad=sube_ad,
        egitim_yili=egitim_yili,
        generated_by=generated_by,
    )


def build_export_stats(ranking_list: list[dict], *, avg_net: float, avg_score: float):
    from shared.export.style_manager import ExportStat

    toplam = len(ranking_list)
    en_yuksek_puan = max((r.get('puan') or 0 for r in ranking_list), default=0)
    return [
        ExportStat(label='Katılımcı Sayısı', value=toplam, type='integer'),
        ExportStat(label='Ortalama Net', value=avg_net, type='decimal'),
        ExportStat(label='Ortalama Puan', value=avg_score, type='decimal'),
        ExportStat(label='En Yüksek Puan', value=en_yuksek_puan, type='decimal'),
    ]
