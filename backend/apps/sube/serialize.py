"""Şube API serialization helpers."""
from apps.kurum.branding import serialize_sube_branding


def serialize_sube(sube, request=None, *, include_kurum: bool = True) -> dict:
    data = {
        'id': sube.id,
        'kurum_id': sube.kurum_id,
        'ad': sube.ad,
        'kod': sube.kod or '',
        'resmi_ad': sube.resmi_ad or '',
        'web_adresi': sube.web_adresi or '',
        'eposta': sube.eposta or '',
        'adres': sube.adres or '',
        'telefon': sube.telefon or '',
        'ticari_unvan': sube.ticari_unvan or '',
        'vergi_dairesi': sube.vergi_dairesi or '',
        'vergi_no': sube.vergi_no or '',
        'ticaret_sicil_no': sube.ticaret_sicil_no or '',
        'kurs_muduru': sube.kurs_muduru or '',
        'kurs_muduru_telefon': sube.kurs_muduru_telefon or '',
        'aktif_mi': sube.aktif_mi,
        **serialize_sube_branding(sube, request),
    }
    if include_kurum:
        data['kurum'] = {
            'id': sube.kurum_id,
            'ad': sube.kurum.ad if sube.kurum_id and sube.kurum else '',
        }
    if hasattr(sube, 'created_at') and sube.created_at:
        data['created_at'] = sube.created_at.isoformat()
    if hasattr(sube, 'updated_at') and sube.updated_at:
        data['updated_at'] = sube.updated_at.isoformat()
    return data


SUBE_WRITABLE_FIELDS = (
    'ad', 'kod', 'resmi_ad', 'web_adresi', 'eposta', 'adres', 'telefon',
    'ticari_unvan', 'vergi_dairesi', 'vergi_no', 'ticaret_sicil_no',
    'kurs_muduru', 'kurs_muduru_telefon', 'aktif_mi',
    'gorunen_ad', 'slogan',
    'login_arkaplan_rengi', 'login_arkaplan_rengi_2', 'tema_rengi',
)


def apply_sube_fields(sube, data: dict) -> None:
    if 'kurum_id' in data:
        sube.kurum_id = data.get('kurum_id')
    for field in SUBE_WRITABLE_FIELDS:
        if field in data:
            value = data.get(field)
            if field == 'kod':
                setattr(sube, field, value or None)
            elif field == 'aktif_mi':
                setattr(sube, field, bool(value))
            else:
                setattr(sube, field, (value or '').strip() if isinstance(value, str) else (value or ''))
