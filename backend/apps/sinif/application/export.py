"""Sınıf/Şube listesi dışa aktarma — kolon seçimi + kurumsal Excel/CSV çıktısı."""
from __future__ import annotations

MAX_EXPORT_ROWS = 5000

EXPORT_COLUMNS = {
    'ad': 'Sınıf Adı',
    'kod': 'Kod',
    'sinif_seviyesi': 'Seviye',
    'sube': 'Şube',
    'egitim_yili': 'Eğitim Yılı',
    'oda': 'Oda',
    'ogrenci_sayisi': 'Öğrenci Sayısı',
    'kapasite': 'Kapasite',
    'doluluk_orani': 'Doluluk Oranı',
    'aktif': 'Durum',
}

# Kurumsal Excel/CSV dışa aktarma (shared.export.ExportColumn.type) için sütun tipleri.
EXPORT_COLUMN_TYPES = {
    'ogrenci_sayisi': 'integer',
    'kapasite': 'integer',
}

DEFAULT_EXPORT_KEYS = list(EXPORT_COLUMNS.keys())


def sinif_export_cell(sinif, key: str, *, mevcutluk_override: int | None = None) -> object:
    from shared.export.style_manager import format_number_display

    if key == 'ad':
        return sinif.ad or ''
    if key == 'kod':
        return sinif.kod or ''
    if key == 'sinif_seviyesi':
        return sinif.sinif_seviyesi.ad if sinif.sinif_seviyesi else ''
    if key == 'sube':
        return sinif.sube.ad if sinif.sube else ''
    if key == 'egitim_yili':
        return sinif.egitim_yili.yil_str if sinif.egitim_yili else ''
    if key == 'oda':
        return sinif.oda.ad if sinif.oda else ''
    if key == 'ogrenci_sayisi':
        if mevcutluk_override is not None:
            return mevcutluk_override
        return sinif.mevcutluk
    if key == 'kapasite':
        return sinif.kapasite
    if key == 'doluluk_orani':
        mevcut = mevcutluk_override if mevcutluk_override is not None else sinif.mevcutluk
        oran = (mevcut / sinif.kapasite * 100) if sinif.kapasite else 0
        return f'{format_number_display(oran, decimals=1)}%'
    if key == 'aktif':
        return 'Aktif' if sinif.aktif_mi else 'Pasif'
    return ''


def build_export_rows(
    siniflar,
    column_keys: list[str],
    *,
    mevcutluk_map: dict[int, int] | None = None,
) -> list[dict[str, object]]:
    keys = [k for k in column_keys if k in EXPORT_COLUMNS]
    mevcutluk_map = mevcutluk_map or {}
    return [
        {
            k: sinif_export_cell(
                sinif,
                k,
                mevcutluk_override=mevcutluk_map.get(sinif.id),
            )
            for k in keys
        }
        for sinif in siniflar
    ]


def parse_column_keys(raw: str | None) -> list[str]:
    if not raw:
        return list(DEFAULT_EXPORT_KEYS)
    keys = [k.strip() for k in raw.split(',') if k.strip()]
    return [k for k in keys if k in EXPORT_COLUMNS] or list(DEFAULT_EXPORT_KEYS)


def build_export_columns(column_keys):
    from shared.export.style_manager import ExportColumn

    return [
        ExportColumn(key=k, label=EXPORT_COLUMNS[k], type=EXPORT_COLUMN_TYPES.get(k, 'text'))
        for k in column_keys
    ]


def build_export_meta(request, *, kurum_id=None, sube_id=None, egitim_yili=None,
                       report_title='SINIF LİSTESİ'):
    from shared.export.style_manager import ReportMeta

    kurum_ad = ''
    sube_ad = ''
    try:
        if kurum_id:
            from apps.kurum.domain.models import Kurum
            kurum = Kurum.objects.filter(id=kurum_id).first()
            kurum_ad = kurum.ad if kurum else ''
    except Exception:
        kurum_ad = ''
    try:
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

    return ReportMeta(
        report_title=report_title,
        kurum_ad=kurum_ad,
        sube_ad=sube_ad,
        egitim_yili=egitim_yili.yil_str if egitim_yili else '',
        generated_by=generated_by,
    )


def build_export_stats(siniflar, *, mevcutluk_map: dict[int, int] | None = None):
    from shared.export.style_manager import ExportStat, format_number_display

    mevcutluk_map = mevcutluk_map or {}
    toplam_sinif = len(siniflar)
    toplam_ogrenci = sum(mevcutluk_map.get(s.id, s.mevcutluk) for s in siniflar)
    toplam_kapasite = sum(s.kapasite for s in siniflar)
    ortalama_doluluk = (toplam_ogrenci / toplam_kapasite * 100) if toplam_kapasite else 0

    return [
        ExportStat(label='Toplam Sınıf', value=toplam_sinif, type='integer'),
        ExportStat(label='Toplam Öğrenci', value=toplam_ogrenci, type='integer'),
        ExportStat(label='Toplam Kapasite', value=toplam_kapasite, type='integer'),
        ExportStat(label='Ortalama Doluluk', value=f'{format_number_display(ortalama_doluluk, decimals=1)}%', type='text'),
    ]
