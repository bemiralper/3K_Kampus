"""Personel listesi dışa aktarma — kurumsal Excel/CSV (shared.export)."""
from __future__ import annotations

EXPORT_COLUMNS = {
    'tam_ad': 'Ad Soyad',
    'tc_kimlik_no': 'TC Kimlik No',
    'telefon': 'Telefon',
    'email': 'E-posta',
    'rol': 'Rol / Pozisyon',
    'sube_ad': 'Şube',
    'ise_baslama_tarihi': 'İşe Başlama Tarihi',
    'durum': 'Durum',
}

# Kurumsal Excel/CSV dışa aktarma (shared.export.ExportColumn.type) için sütun tipleri.
EXPORT_COLUMN_TYPES = {
    'tc_kimlik_no': 'tc',
    'telefon': 'phone',
    'ise_baslama_tarihi': 'date',
}

EXPORT_KEYS = list(EXPORT_COLUMNS.keys())


def _active_gorevlendirme_map(personeller, *, kurum_id, sube_id, egitim_yili_id=None):
    """Personel ID -> aktif görevlendirme (bu kurum/şube/yıl bağlamında)."""
    from apps.personel.domain.models import PersonelGorevlendirme

    personel_ids = [p.id for p in personeller]
    if not personel_ids:
        return {}

    filt = {
        'personel_id__in': personel_ids,
        'kurum_id': kurum_id,
        'gorev_sube_id': sube_id,
        'aktif_mi': True,
    }
    if egitim_yili_id:
        filt['egitim_yili_id'] = egitim_yili_id

    gorevlendirmeler = (
        PersonelGorevlendirme.objects
        .filter(**filt)
        .select_related('rol')
        .order_by('personel_id', '-egitim_yili_id', 'id')
    )

    result: dict[int, PersonelGorevlendirme] = {}
    for gorev in gorevlendirmeler:
        result.setdefault(gorev.personel_id, gorev)
    return result


def build_export_rows(personeller, *, kurum_id, sube_id, egitim_yili_id=None):
    """Personel kayıtlarını export satırlarına çevirir (görevlendirme rol/tarih bilgisiyle)."""
    gorev_map = _active_gorevlendirme_map(
        personeller, kurum_id=kurum_id, sube_id=sube_id, egitim_yili_id=egitim_yili_id,
    )

    rows = []
    for p in personeller:
        gorev = gorev_map.get(p.id)
        rol_kod = (gorev.rol.code if gorev and gorev.rol else '') or ''
        rol_label = (gorev.rol.name if gorev and gorev.rol else '') or ''
        ise_baslama = (
            gorev.gorev_baslangic if gorev and gorev.gorev_baslangic
            else (p.created_at.date() if p.created_at else None)
        )
        rows.append({
            'tam_ad': p.tam_ad,
            'tc_kimlik_no': p.tc_kimlik_no or '',
            'telefon': p.cep_telefon or p.telefon or '',
            'email': p.email or '',
            'rol': rol_label,
            'sube_ad': p.sube.ad if p.sube else '',
            'ise_baslama_tarihi': ise_baslama,
            'durum': 'Aktif' if p.aktif_mi else 'Pasif',
            '_rol_kod': rol_kod.lower(),
        })
    return rows


def build_export_columns():
    from shared.export.style_manager import ExportColumn

    return [
        ExportColumn(key=k, label=EXPORT_COLUMNS[k], type=EXPORT_COLUMN_TYPES.get(k, 'text'))
        for k in EXPORT_KEYS
    ]


def build_export_meta(request, ctx, *, report_title='PERSONEL LİSTESİ'):
    """Kurumsal başlık bloğu için Kurum/Şube/Eğitim Yılı/Kullanıcı bilgisi."""
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

    egitim_yili = ctx.get('egitim_yili')
    egitim_yili_str = egitim_yili.yil_str if egitim_yili else ''

    user = getattr(request, 'user', None)
    generated_by = ''
    if user and getattr(user, 'is_authenticated', False):
        generated_by = user.get_full_name() or user.get_username()

    return ReportMeta(
        report_title=report_title,
        kurum_ad=kurum_ad,
        sube_ad=sube_ad,
        egitim_yili=egitim_yili_str,
        generated_by=generated_by,
    )


def build_export_stats(rows):
    from shared.export.style_manager import ExportStat

    toplam = len(rows)
    aktif = sum(1 for r in rows if r.get('durum') == 'Aktif')
    pasif = toplam - aktif
    ogretmen = sum(1 for r in rows if r.get('_rol_kod') == 'ogretmen')
    return [
        ExportStat(label='Toplam Personel', value=toplam, type='integer'),
        ExportStat(label='Aktif', value=aktif, type='integer'),
        ExportStat(label='Pasif', value=pasif, type='integer'),
        ExportStat(label='Öğretmen', value=ogretmen, type='integer'),
    ]
