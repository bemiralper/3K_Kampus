"""Görüşme listesi dışa aktarma — Excel/CSV kolonları, kurumsal meta ve özet istatistikler."""
from __future__ import annotations

EXPORT_COLUMNS = {
    'ogrenci_adi': 'Öğrenci Adı',
    'koc_adi': 'Koç / Görüşmeci',
    'gorusme_turu_display': 'Görüşme Türü',
    'gorusme_tarihi': 'Görüşme Tarihi',
    'gorusme_saati_display': 'Saat',
    'sure_dakika': 'Süre (dk)',
    'konu': 'Konu',
    'durum_display': 'Durum',
    'oncelik_display': 'Öncelik',
    'notlar': 'Notlar',
}

# Kurumsal Excel/CSV dışa aktarma (shared.export.ExportColumn.type) için sütun tipleri.
EXPORT_COLUMN_TYPES = {
    'gorusme_tarihi': 'date',
    'sure_dakika': 'integer',
}


def _saat_display(gorusme) -> str:
    return gorusme.gorusme_saati.strftime('%H:%M') if gorusme.gorusme_saati else ''


def gorusme_export_row(gorusme) -> dict:
    return {
        'ogrenci_adi': f'{gorusme.ogrenci.ad} {gorusme.ogrenci.soyad}',
        'koc_adi': f'{gorusme.koc.teacher.ad} {gorusme.koc.teacher.soyad}',
        'gorusme_turu_display': gorusme.get_gorusme_turu_display(),
        'gorusme_tarihi': gorusme.gorusme_tarihi,
        'gorusme_saati_display': _saat_display(gorusme),
        'sure_dakika': gorusme.sure_dakika,
        'konu': gorusme.konu or '',
        'durum_display': gorusme.get_durum_display(),
        'oncelik_display': gorusme.get_oncelik_display(),
        'notlar': gorusme.notlar or '',
    }


def build_export_rows(gorusmeler) -> list[dict]:
    return [gorusme_export_row(g) for g in gorusmeler]


def build_export_columns():
    from shared.export.style_manager import ExportColumn

    columns = [
        ExportColumn(key=key, label=label, type=EXPORT_COLUMN_TYPES.get(key, 'text'))
        for key, label in EXPORT_COLUMNS.items()
    ]
    for col in columns:
        if col.key == 'notlar':
            col.wrap = True
    return columns


def build_export_meta(request, ctx, *, report_title: str = 'GÖRÜŞMELER LİSTESİ'):
    from shared.export.style_manager import ReportMeta

    kurum_ad = ''
    sube_ad = ''
    try:
        if ctx.get('kurum_id'):
            from apps.kurum.domain.models import Kurum

            kurum = Kurum.objects.filter(id=ctx['kurum_id']).first()
            kurum_ad = kurum.ad if kurum else ''
    except Exception:
        kurum_ad = ''
    try:
        if ctx.get('sube_id'):
            from apps.sube.domain.models import Sube

            sube = Sube.objects.filter(id=ctx['sube_id']).first()
            sube_ad = sube.ad if sube else ''
    except Exception:
        sube_ad = ''

    user = getattr(request, 'user', None)
    generated_by = ''
    if user and getattr(user, 'is_authenticated', False):
        generated_by = user.get_full_name() or user.get_username()

    return ReportMeta(report_title=report_title, kurum_ad=kurum_ad, sube_ad=sube_ad, generated_by=generated_by)


def build_export_stats(gorusmeler):
    from shared.export.style_manager import ExportStat

    toplam = len(gorusmeler)
    planlandi = sum(1 for g in gorusmeler if g.durum == 'planlandi')
    tamamlandi = sum(1 for g in gorusmeler if g.durum == 'tamamlandi')
    iptal = sum(1 for g in gorusmeler if g.durum == 'iptal')
    ertelendi = sum(1 for g in gorusmeler if g.durum == 'ertelendi')
    return [
        ExportStat(label='Toplam Görüşme', value=toplam, type='integer'),
        ExportStat(label='Planlandı', value=planlandi, type='integer'),
        ExportStat(label='Tamamlandı', value=tamamlandi, type='integer'),
        ExportStat(label='İptal Edildi', value=iptal, type='integer'),
        ExportStat(label='Ertelendi', value=ertelendi, type='integer'),
    ]
