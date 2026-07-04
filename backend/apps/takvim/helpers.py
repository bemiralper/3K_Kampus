"""
Takvim modülü — Yardımcı fonksiyonlar (serializers, helpers)
"""
from apps.takvim.domain.models import Event, EventType, Reminder, ReminderSetting


def _get_kurum_id(request):
    kurum_id = request.headers.get('X-Kurum-ID') or request.session.get('active_kurum_id')
    if not kurum_id:
        return None
    return int(kurum_id)


def _get_sube_id(request):
    sube_id = request.headers.get('X-Sube-ID') or request.session.get('active_sube_id')
    if not sube_id:
        return None
    return int(sube_id)


def _get_egitim_yili_id(request):
    egitim_yili_id = request.headers.get('X-EgitimYili-ID') or request.session.get('active_egitim_yili_id')
    if not egitim_yili_id:
        return None
    return int(egitim_yili_id)


def _get_donem_id(request):
    donem_id = request.headers.get('X-Donem-ID') or request.GET.get('donem_id')
    if not donem_id:
        return None
    return int(donem_id)


def _get_user_id(request):
    return request.user.id if request.user.is_authenticated else None


# ── Serializers ──

def serialize_event_type(t, include_count=False):
    data = {
        'id': str(t.id),
        'ad': t.ad,
        'kategori': t.kategori,
        'renk': t.renk,
        'ikon': t.ikon,
        'varsayilan_sure_dk': t.varsayilan_sure_dk,
        'is_system': t.is_system,
        'is_active': t.is_active,
        'varsayilan_mi': t.varsayilan_mi,
        'sira': t.sira,
    }
    if include_count and hasattr(t, 'etkinlik_sayisi'):
        data['etkinlik_sayisi'] = t.etkinlik_sayisi
    return data


def serialize_event(e):
    return {
        'id': str(e.id),
        'baslik': e.baslik,
        'aciklama': e.aciklama,
        'durum': e.durum,
        'baslangic': e.baslangic.isoformat() if e.baslangic else None,
        'bitis': e.bitis.isoformat() if e.bitis else None,
        'tum_gun': e.tum_gun,
        'tekrar_tipi': e.tekrar_tipi,
        'tekrar_bitis': e.tekrar_bitis.isoformat() if e.tekrar_bitis else None,
        'parent_event_id': str(e.parent_event_id) if e.parent_event_id else None,
        'salon_id': str(e.salon_id) if e.salon_id else None,
        'salon_adi': e.salon_adi,
        'konum': e.konum,
        'sinif_ids': e.sinif_ids or [],
        'ogretmen_id': e.ogretmen_id,
        'ogrenci_ids': e.ogrenci_ids or [],
        'kaynak_modul': e.kaynak_modul,
        'kaynak_id': e.kaynak_id,
        'renk': e.etkinlik_renk,
        # Context bilgileri
        'sube_id': e.sube_id,
        'egitim_yili_id': e.egitim_yili_id,
        'donem_id': e.donem_id,
        # Event type bilgisi
        'event_type': serialize_event_type(e.event_type) if e.event_type_id else None,
        'event_type_id': str(e.event_type_id) if e.event_type_id else None,
        # Meta
        'created_by': e.created_by,
        'created_at': e.created_at.isoformat() if e.created_at else None,
        'updated_at': e.updated_at.isoformat() if e.updated_at else None,
    }


def serialize_event_compact(e):
    """FullCalendar için minimal event verisi"""
    return {
        'id': str(e.id),
        'title': e.baslik,
        'start': e.baslangic.isoformat() if e.baslangic else None,
        'end': e.bitis.isoformat() if e.bitis else None,
        'allDay': e.tum_gun,
        'color': e.etkinlik_renk,
        'extendedProps': {
            'durum': e.durum,
            'event_type_id': str(e.event_type_id) if e.event_type_id else None,
            'kategori': e.event_type.kategori if e.event_type_id else None,
            'ikon': e.event_type.ikon if e.event_type_id else '',
            'salon_adi': e.salon_adi,
            'ogretmen_id': e.ogretmen_id,
            'kaynak_modul': e.kaynak_modul,
            'kaynak_id': e.kaynak_id,
        },
    }


def serialize_reminder(r):
    return {
        'id': str(r.id),
        'event_id': str(r.event_id),
        'miktar': r.miktar,
        'birim': r.birim,
        'kanal': r.kanal,
        'hatirlatma_zamani': r.hatirlatma_zamani.isoformat() if r.hatirlatma_zamani else None,
        'durum': r.durum,
    }


def serialize_reminder_setting(s):
    return {
        'id': str(s.id),
        'event_type_id': str(s.event_type_id),
        'event_type_ad': s.event_type.ad if s.event_type_id else '',
        'event_type_renk': s.event_type.renk if s.event_type_id else '',
        'event_type_ikon': s.event_type.ikon if s.event_type_id else '',
        'miktar': s.miktar,
        'birim': s.birim,
        'kanallar': s.kanallar if s.kanallar else ['APP'],
        'alici_tipler': s.alici_tipler if s.alici_tipler else [],
        'is_active': s.is_active,
    }
