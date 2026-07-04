"""Görev modülü — yardımcı fonksiyonlar."""
from collections import defaultdict

from django.contrib.auth import get_user_model

from apps.gorev.domain.models import Gorev, GorevAtama, GorevTipi
from apps.personel.domain.models import Personel


def resolve_assignee_names(kurum_id: int, user_ids: list[int]) -> dict[int, str]:
    """user_id → görünen ad."""
    if not user_ids:
        return {}
    personel_map = {
        p.user_id: p.tam_ad
        for p in Personel.objects.filter(kurum_id=kurum_id, user_id__in=user_ids)
    }
    User = get_user_model()
    user_map = {
        u.id: (u.get_full_name() or '').strip() or u.username
        for u in User.objects.filter(id__in=user_ids)
    }
    return {
        uid: personel_map.get(uid) or user_map.get(uid) or f'Kullanıcı #{uid}'
        for uid in user_ids
    }


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
    val = request.headers.get('X-EgitimYili-ID') or request.session.get('active_egitim_yili_id')
    return int(val) if val else None


def _get_donem_id(request):
    val = request.headers.get('X-Donem-ID') or request.GET.get('donem_id')
    return int(val) if val else None


def _get_user_id(request):
    return request.user.id if request.user.is_authenticated else None


def serialize_gorev_tipi(t: GorevTipi):
    return {
        'id': str(t.id),
        'kod': t.kod,
        'ad': t.ad,
        'renk': t.renk,
        'ikon': t.ikon,
        'is_system': t.is_system,
        'is_active': t.is_active,
        'sira': t.sira,
    }


def serialize_atama(a: GorevAtama, include_gorev=False, atanan_ad=None):
    data = {
        'id': str(a.id),
        'gorev_id': str(a.gorev_id),
        'atanan_user_id': a.atanan_user_id,
        'durum': a.durum,
        'ilk_acilma_at': a.ilk_acilma_at.isoformat() if a.ilk_acilma_at else None,
        'baslama_at': a.baslama_at.isoformat() if a.baslama_at else None,
        'tamamlanma_at': a.tamamlanma_at.isoformat() if a.tamamlanma_at else None,
        'notlar': a.notlar,
        'gorusuldu': a.gorusuldu,
        'gecikme_gun': a.gecikme_gun,
        'gecikti_mi': a.gecikti_mi,
        'created_at': a.created_at.isoformat() if a.created_at else None,
    }
    if atanan_ad:
        data['atanan_ad'] = atanan_ad
    if include_gorev:
        data['gorev'] = serialize_gorev(a.gorev)
    return data


def serialize_gorev(g: Gorev, include_atamalar=False):
    data = {
        'id': str(g.id),
        'baslik': g.baslik,
        'aciklama': g.aciklama,
        'oncelik': g.oncelik,
        'son_tarih': g.son_tarih.isoformat() if g.son_tarih else None,
        'tahmini_sure_dk': g.tahmini_sure_dk,
        'tum_gun': g.tum_gun,
        'hedef_tipi': g.hedef_tipi,
        'hedef_rol_kodu': g.hedef_rol_kodu,
        'hedef_user_ids': g.hedef_user_ids or [],
        'kaynak_modul': g.kaynak_modul,
        'kaynak_id': g.kaynak_id,
        'aksiyon_url': g.aksiyon_url,
        'ekran_mesaji': g.ekran_mesaji,
        'renk': g.gorev_renk,
        'sube_id': g.sube_id,
        'egitim_yili_id': g.egitim_yili_id,
        'donem_id': g.donem_id,
        'olusturan_id': g.olusturan_id,
        'gorev_tipi': serialize_gorev_tipi(g.gorev_tipi) if g.gorev_tipi_id else None,
        'gorev_tipi_id': str(g.gorev_tipi_id) if g.gorev_tipi_id else None,
        'created_at': g.created_at.isoformat() if g.created_at else None,
        'updated_at': g.updated_at.isoformat() if g.updated_at else None,
    }
    if include_atamalar:
        atama_list = list(g.atamalar.all())
        name_map = resolve_assignee_names(
            g.kurum_id, [a.atanan_user_id for a in atama_list],
        )
        data['atamalar'] = [
            serialize_atama(a, atanan_ad=name_map.get(a.atanan_user_id))
            for a in atama_list
        ]
    return data


def serialize_gorev_compact_for_calendar(g: Gorev, atama: GorevAtama, atanan_ad=None, atananlar=None):
    """FullCalendar uyumlu format — atama bazlı."""
    bitis = g.son_tarih
    if not g.tum_gun and g.tahmini_sure_dk:
        from datetime import timedelta
        bitis = g.son_tarih + timedelta(minutes=g.tahmini_sure_dk)

    extended = {
        'gorev_id': str(g.id),
        'atama_id': str(atama.id),
        'durum': atama.durum,
        'oncelik': g.oncelik,
        'gorev_tipi_id': str(g.gorev_tipi_id),
        'kod': g.gorev_tipi.kod if g.gorev_tipi_id else '',
        'ikon': g.gorev_tipi.ikon if g.gorev_tipi_id else '📋',
        'gecikti_mi': atama.gecikti_mi,
        'kaynak': 'gorev',
    }
    if atanan_ad:
        extended['atanan_ad'] = atanan_ad
    if atananlar:
        extended['atananlar'] = atananlar

    return {
        'id': str(atama.id),
        'title': g.baslik,
        'start': g.son_tarih.isoformat() if g.son_tarih else None,
        'end': bitis.isoformat() if bitis else None,
        'allDay': g.tum_gun,
        'color': g.gorev_renk,
        'extendedProps': extended,
    }
