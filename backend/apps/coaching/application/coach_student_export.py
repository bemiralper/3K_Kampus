"""Koç portalı öğrenci listesi dışa aktarma — kolon/istatistik tanımları."""
from __future__ import annotations

EXPORT_COLUMNS = {
    'tam_ad': 'Ad Soyad',
    'sinif': 'Sınıf',
    'okul_no': 'Okul No',
    'risk_display': 'Risk',
    'risk_score': 'Risk Skoru',
    'last_meeting_date': 'Son Görüşme',
    'overdue_homework_count': 'Geciken Ödev',
    'meeting_today_count': 'Bugün Görüşme',
    'needs_meeting_display': 'Görüşme Gerekli',
    'veli_telefon': 'Veli Telefon',
}

EXPORT_COLUMN_TYPES = {
    'risk_score': 'decimal',
    'last_meeting_date': 'date',
    'overdue_homework_count': 'integer',
    'meeting_today_count': 'integer',
    'veli_telefon': 'phone',
}

RISK_LABELS = {'low': 'Düşük', 'medium': 'Orta', 'high': 'Yüksek'}


def build_export_rows(rows: list[dict]) -> list[dict]:
    """`build_coach_student_list()` çıktısını export satırlarına çevir."""
    out = []
    for r in rows:
        out.append({
            'tam_ad': f"{r.get('ad', '')} {r.get('soyad', '')}".strip(),
            'sinif': r.get('sinif') or '',
            'okul_no': r.get('okul_no') or '',
            'risk_display': RISK_LABELS.get(r.get('risk_label'), ''),
            'risk_score': r.get('risk_score'),
            'last_meeting_date': r.get('last_meeting_date'),
            'overdue_homework_count': r.get('overdue_homework_count') or 0,
            'meeting_today_count': r.get('meeting_today_count') or 0,
            'needs_meeting_display': 'Evet' if r.get('needs_meeting') else 'Hayır',
            'veli_telefon': r.get('veli_telefon') or '',
        })
    return out


def build_export_columns():
    from shared.export.style_manager import ExportColumn

    return [
        ExportColumn(key=k, label=EXPORT_COLUMNS[k], type=EXPORT_COLUMN_TYPES.get(k, 'text'))
        for k in EXPORT_COLUMNS
    ]


def build_export_meta(request, *, report_title: str = 'KOÇ ÖĞRENCİ LİSTESİ'):
    from shared.export.style_manager import ReportMeta
    from shared.context import get_secili_kurum_id, get_secili_sube_id

    kurum_ad = ''
    sube_ad = ''
    kurum_id = get_secili_kurum_id(request)
    try:
        if kurum_id:
            from apps.kurum.domain.models import Kurum
            kurum = Kurum.objects.filter(id=kurum_id).first()
            kurum_ad = kurum.ad if kurum else ''
    except Exception:
        kurum_ad = ''
    try:
        sube_id = get_secili_sube_id(request, kurum_id=kurum_id)
        if sube_id:
            from apps.sube.domain.models import Sube
            sube = Sube.objects.filter(id=sube_id).first()
            sube_ad = sube.ad if sube else ''
    except Exception:
        sube_ad = ''

    user = getattr(request, 'user', None)
    generated_by = ''
    if user and getattr(user, 'is_authenticated', False):
        generated_by = user.get_full_name() or user.get_username()

    return ReportMeta(report_title=report_title, kurum_ad=kurum_ad, sube_ad=sube_ad, generated_by=generated_by)


def build_export_stats(rows: list[dict]):
    from shared.export.style_manager import ExportStat

    toplam = len(rows)
    riskli = sum(1 for r in rows if r.get('risk_label') in ('medium', 'high'))
    geciken = sum(1 for r in rows if (r.get('overdue_homework_count') or 0) > 0)
    gorusme_gerekli = sum(1 for r in rows if r.get('needs_meeting'))
    return [
        ExportStat(label='Toplam Öğrenci', value=toplam, type='integer'),
        ExportStat(label='Riskli', value=riskli, type='integer'),
        ExportStat(label='Geciken Ödevi Olan', value=geciken, type='integer'),
        ExportStat(label='Görüşme Gerekli', value=gorusme_gerekli, type='integer'),
    ]
