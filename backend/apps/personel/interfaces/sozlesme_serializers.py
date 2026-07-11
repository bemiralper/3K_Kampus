"""Personel sözleşmesi API serialize / parse yardımcıları."""
import hashlib
import hmac

from decimal import Decimal

from django.conf import settings

from apps.personel.application.contract_calc_service import (
    calc_ozet_metrikleri,
    is_ogretmen_sozlesmesi,
    sozlesme_belge_basligi,
)
from apps.personel.domain.sozlesme_models import UcretTipi


def _dogrulama_kodu(sozlesme_no: str, sozlesme_id: int) -> str:
    payload = f'{sozlesme_no}:{sozlesme_id}'
    digest = hmac.new(
        settings.SECRET_KEY.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return digest[:12].upper()


def _time_str(t):
    if not t:
        return None
    return t.strftime('%H:%M')


def _login_logo_url(s) -> str | None:
    for entity in (getattr(s, 'sube', None), getattr(s, 'kurum', None)):
        if not entity:
            continue
        logo = getattr(entity, 'login_logo', None)
        if logo:
            try:
                return logo.url
            except Exception:
                continue
    return None


def serialize_sozlesme(s):
    mesai = list(s.mesai_saatleri.all())
    maas_qs = s.maas_plani.all()
    if hasattr(maas_qs, 'order_by'):
        plan = list(maas_qs.order_by('sira_no'))
    else:
        plan = sorted(list(maas_qs), key=lambda r: getattr(r, 'sira_no', 0))
    ozet = calc_ozet_metrikleri(
        maas_plani=[
            {
                'maas': row.maas,
                'baslangic_tarihi': row.baslangic_tarihi,
                'bitis_tarihi': row.bitis_tarihi,
            }
            for row in plan
        ],
        mesai_saatleri=[
            {
                'baslangic': _time_str(row.baslangic),
                'bitis': _time_str(row.bitis),
                'mola_dakika': row.mola_dakika,
                'aktif': row.aktif,
            }
            for row in mesai
        ],
        ders_birim_ucret=s.ders_birim_ucret,
        ders_ucret_tipi=s.ders_ucret_tipi or '',
        sgk_gun=s.sgk_gun,
        haftalik_calisma_gun=s.haftalik_calisma_gun_sayisi,
        baslangic_tarihi=s.baslangic_tarihi,
        bitis_tarihi=s.bitis_tarihi,
    )
    rol_kodu = ''
    rol_ad = ''
    if s.gorevlendirme_id and getattr(s.gorevlendirme, 'rol', None):
        rol = s.gorevlendirme.rol
        rol_kodu = getattr(rol, 'code', None) or getattr(rol, 'kod', None) or ''
        rol_ad = getattr(rol, 'name', None) or getattr(rol, 'ad', None) or ''
    ogretmen = is_ogretmen_sozlesmesi(
        gorev_snapshot=s.gorev_snapshot or '',
        brans_snapshot=s.brans_snapshot or '',
        rol_kodu=rol_kodu,
        rol_ad=rol_ad,
    )
    belge_basligi = sozlesme_belge_basligi(
        gorev_snapshot=s.gorev_snapshot or '',
        brans_snapshot=s.brans_snapshot or '',
        rol_kodu=rol_kodu,
        rol_ad=rol_ad,
    )
    return {
        'id': s.id,
        'sozlesme_no': s.sozlesme_no or '',
        'dogrulama_kodu': _dogrulama_kodu(s.sozlesme_no or '', s.id),
        'is_ogretmen': ogretmen,
        'belge_basligi': belge_basligi,
        'kurum_id': s.kurum_id,
        'personel_id': s.personel_id,
        'personel_ad': s.personel.tam_ad,
        'personel_tc': s.personel.tc_kimlik_no or '',
        'personel_foto': s.personel.fotograf.url if s.personel.fotograf else None,
        'personel_no_snapshot': s.personel_no_snapshot,
        'brans_snapshot': s.brans_snapshot,
        'gorev_snapshot': s.gorev_snapshot,
        'departman_snapshot': s.departman_snapshot,
        'egitim_yili_id': s.egitim_yili_id,
        'egitim_yili_display': str(s.egitim_yili),
        'sube_id': s.sube_id,
        'sube_ad': s.sube.ad if s.sube_id else None,
        'gorevlendirme_id': s.gorevlendirme_id,
        'rol_kodu': rol_kodu,
        'rol_ad': rol_ad,
        'sozlesme_turu': s.sozlesme_turu,
        'sozlesme_turu_display': s.get_sozlesme_turu_display(),
        'durum': s.durum,
        'durum_display': s.get_durum_display(),
        'duzenlenme_tarihi': s.duzenlenme_tarihi.isoformat() if s.duzenlenme_tarihi else None,
        'baslangic_tarihi': s.baslangic_tarihi.isoformat() if s.baslangic_tarihi else None,
        'bitis_tarihi': s.bitis_tarihi.isoformat() if s.bitis_tarihi else None,
        'brut_maas': float(s.brut_maas),
        'net_maas': float(s.net_maas),
        'sgk_gun': s.sgk_gun,
        'haftalik_calisma_gun_sayisi': s.haftalik_calisma_gun_sayisi,
        'haftalik_izin_gunleri': s.haftalik_izin_gunleri or [],
        'ders_ucreti_aktif': s.ders_ucreti_aktif,
        'ders_ucret_tipi': s.ders_ucret_tipi or '',
        'ders_birim_ucret': float(s.ders_birim_ucret or 0),
        'toplam_calisma_suresi_ay': float(s.toplam_calisma_suresi_ay or 0),
        'toplam_sozlesme_bedeli': float(s.toplam_sozlesme_bedeli or 0),
        'auto_save_rev': s.auto_save_rev,
        'notlar': s.notlar,
        'sozlesme_dosya': s.sozlesme_dosya.url if s.sozlesme_dosya else None,
        'fesih_tarihi': s.fesih_tarihi.isoformat() if s.fesih_tarihi else None,
        'fesih_sebebi': s.fesih_sebebi or '',
        'ders_ucretleri': [
            {
                'id': du.id,
                'brans_id': du.brans_id,
                'brans_ad': du.brans.ad if du.brans else 'Genel',
                'ucret_tipi': du.ucret_tipi,
                'ucret_tipi_display': du.get_ucret_tipi_display(),
                'birim_ucret': float(du.birim_ucret),
                'haftalik_saat': float(du.haftalik_saat),
                'min_saat': float(du.min_saat) if du.min_saat else None,
                'max_saat': float(du.max_saat) if du.max_saat else None,
                'notlar': du.notlar,
            }
            for du in s.ders_ucretleri.all()
        ],
        'ucret_donemleri': [
            {
                'id': ud.id,
                'baslangic_ay': ud.baslangic_ay,
                'bitis_ay': ud.bitis_ay,
                'brut_maas': float(ud.brut_maas),
                'net_maas': float(ud.net_maas),
                'aciklama': ud.aciklama,
            }
            for ud in s.ucret_donemleri.all()
        ],
        'maas_plani': [
            {
                'id': row.id,
                'sira_no': row.sira_no,
                'baslangic_tarihi': row.baslangic_tarihi.isoformat(),
                'bitis_tarihi': row.bitis_tarihi.isoformat(),
                'calisilan_gun': row.calisilan_gun,
                'maas': float(row.maas),
                'aciklama': row.aciklama,
            }
            for row in plan
        ],
        'mesai_saatleri': [
            {
                'id': row.id,
                'gun': row.gun,
                'baslangic': _time_str(row.baslangic),
                'bitis': _time_str(row.bitis),
                'mola_dakika': row.mola_dakika,
                'aktif': row.aktif,
            }
            for row in mesai
        ],
        'maddeler': [
            {'id': m.id, 'sira': m.sira, 'metin': m.metin}
            for m in s.maddeler.all()
        ],
        'ozet': ozet,
        'kurum': {
            'ad': s.kurum.ad if s.kurum_id else None,
            'adres': getattr(s.kurum, 'adres', None) or '',
            'telefon_sabit': getattr(s.kurum, 'telefon_sabit', None) or '',
        } if s.kurum_id else None,
        'login_logo_url': _login_logo_url(s),
        'created_at': s.created_at.isoformat() if s.created_at else None,
    }


def _dec(val, default='0.00'):
    try:
        return Decimal(str(val)) if val not in (None, '') else Decimal(default)
    except Exception:
        return Decimal(default)


def parse_sozlesme_body(body, kurum_id, ey_id, *, taslak=False, partial=False):
    all_data = {}
    if not partial or 'personel_id' in body:
        all_data['personel_id'] = body.get('personel_id')
    if kurum_id is not None:
        all_data['kurum_id'] = kurum_id
    if ey_id is not None:
        all_data['egitim_yili_id'] = ey_id

    scalar_fields = {
        'sozlesme_turu': ('sozlesme_turu', body.get('sozlesme_turu', 'TAM_ZAMANLI')),
        'durum': ('durum', body.get('durum', 'TASLAK' if taslak else body.get('durum', 'TASLAK'))),
        'baslangic_tarihi': ('baslangic_tarihi', body.get('baslangic_tarihi')),
        'bitis_tarihi': ('bitis_tarihi', body.get('bitis_tarihi')),
        'duzenlenme_tarihi': ('duzenlenme_tarihi', body.get('duzenlenme_tarihi')),
        'brut_maas': ('brut_maas', _dec(body.get('brut_maas'))),
        'net_maas': ('net_maas', _dec(body.get('net_maas'))),
        'sgk_gun': ('sgk_gun', int(body.get('sgk_gun', 30))),
        'ders_ucreti_aktif': ('ders_ucreti_aktif', body.get('ders_ucreti_aktif', False)),
        'notlar': ('notlar', body.get('notlar', '')),
        'sube_id': ('sube_id', body.get('sube_id')),
        'gorevlendirme_id': ('gorevlendirme_id', body.get('gorevlendirme_id')),
        'personel_no_snapshot': ('personel_no_snapshot', body.get('personel_no_snapshot', '')),
        'brans_snapshot': ('brans_snapshot', body.get('brans_snapshot', '')),
        'gorev_snapshot': ('gorev_snapshot', body.get('gorev_snapshot', '')),
        'departman_snapshot': ('departman_snapshot', body.get('departman_snapshot', '')),
        'haftalik_calisma_gun_sayisi': ('haftalik_calisma_gun_sayisi', int(body.get('haftalik_calisma_gun_sayisi', 5))),
        'haftalik_izin_gunleri': ('haftalik_izin_gunleri', body.get('haftalik_izin_gunleri', [])),
        'ders_ucret_tipi': ('ders_ucret_tipi', body.get('ders_ucret_tipi', '')),
        'ders_birim_ucret': ('ders_birim_ucret', _dec(body.get('ders_birim_ucret'))),
    }
    for key, (field, val) in scalar_fields.items():
        if not partial or key in body:
            all_data[field] = val

    if not partial or 'ders_ucretleri' in body:
        ders_ucretleri = []
        for du in body.get('ders_ucretleri', []):
            ders_ucretleri.append({
                'brans_id': du.get('brans_id') or None,
                'ucret_tipi': du.get('ucret_tipi', UcretTipi.SAAT_BASI),
                'birim_ucret': _dec(du.get('birim_ucret'), '0.01'),
                'haftalik_saat': _dec(du.get('haftalik_saat'), '0.0'),
                'min_saat': _dec(du.get('min_saat')) if du.get('min_saat') else None,
                'max_saat': _dec(du.get('max_saat')) if du.get('max_saat') else None,
                'notlar': du.get('notlar', ''),
            })
        all_data['ders_ucretleri'] = ders_ucretleri

    if not partial or 'ucret_donemleri' in body:
        ucret_donemleri = []
        for ud in body.get('ucret_donemleri', []):
            ucret_donemleri.append({
                'baslangic_ay': int(ud.get('baslangic_ay', 1)),
                'bitis_ay': int(ud.get('bitis_ay', 0)),
                'brut_maas': _dec(ud.get('brut_maas')),
                'net_maas': _dec(ud.get('net_maas')),
                'aciklama': ud.get('aciklama', ''),
            })
        all_data['ucret_donemleri'] = ucret_donemleri

    if not partial or 'maas_plani' in body:
        maas_plani = []
        for row in body.get('maas_plani', []):
            maas_plani.append({
                'sira_no': int(row.get('sira_no', len(maas_plani) + 1)),
                'baslangic_tarihi': row.get('baslangic_tarihi'),
                'bitis_tarihi': row.get('bitis_tarihi'),
                'calisilan_gun': int(row.get('calisilan_gun', 0)),
                'maas': _dec(row.get('maas')),
                'aciklama': row.get('aciklama', ''),
            })
        all_data['maas_plani'] = maas_plani

    if not partial or 'mesai_saatleri' in body:
        mesai_saatleri = []
        for row in body.get('mesai_saatleri', []):
            mesai_saatleri.append({
                'gun': int(row.get('gun')),
                'baslangic': row.get('baslangic'),
                'bitis': row.get('bitis'),
                'mola_dakika': int(row.get('mola_dakika', 0)),
                'aktif': bool(row.get('aktif', True)),
            })
        all_data['mesai_saatleri'] = mesai_saatleri

    if not partial or 'maddeler' in body:
        maddeler = []
        for i, row in enumerate(body.get('maddeler', []), start=1):
            maddeler.append({
                'sira': int(row.get('sira', i)),
                'metin': row.get('metin', ''),
            })
        all_data['maddeler'] = maddeler

    return all_data
