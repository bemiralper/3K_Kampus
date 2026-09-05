"""Şube oturum grubu ayarları — seviye varsayılanı ve öğrenci override."""
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from shared.context import get_secili_egitim_yili_id

from ..interfaces.sube_context import mandatory_olcme_context
from ..models.roster import OlcmeOgrenciOturumTercihi, OlcmeSeviyeOturumAyar, ScheduleGroup
from ..services.exam_roster import _deneme_ogrenci_ids, _kayit_base, _seviye_ad, _seviye_of
from ..services.exam_schedule_groups import (
    HAFTA_ICI,
    catalog_seviyeler,
    default_preference_for_seviye,
    ensure_seviye_defaults,
    resolve_student_groups,
)
from ..views import CsrfExemptSessionAuthentication


def _ctx_or_error(request):
    ctx, err = mandatory_olcme_context(request)
    if err:
        return None, err
    ctx['egitim_yili_id'] = get_secili_egitim_yili_id(request)
    return ctx, None


def _valid_pref(raw) -> str | None:
    val = (raw or '').strip()
    if val in {ScheduleGroup.HAFTA_ICI, ScheduleGroup.HAFTA_SONU}:
        return val
    return None


@api_view(['GET', 'PUT'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def oturum_ayarlari_seviyeler(request):
    ctx, err = _ctx_or_error(request)
    if err:
        return err
    sube_id = ctx['sube_id']
    ensure_seviye_defaults(sube_id)

    if request.method == 'PUT':
        items = request.data.get('items') or request.data
        if not isinstance(items, list):
            return Response({'error': 'Seviye listesi bekleniyor.'}, status=400)
        for raw in items:
            if not isinstance(raw, dict):
                continue
            try:
                sev_id = int(raw.get('sinif_seviyesi_id'))
            except (TypeError, ValueError):
                continue
            pref = _valid_pref(raw.get('preference'))
            if not pref:
                continue
            catalog_ids = {s.id for s in catalog_seviyeler(sube_id)}
            if sev_id not in catalog_ids:
                continue
            OlcmeSeviyeOturumAyar.objects.update_or_create(
                sube_id=sube_id, sinif_seviyesi_id=sev_id,
                defaults={'preference': pref},
            )

    ayarlar = {
        a.sinif_seviyesi_id: a
        for a in OlcmeSeviyeOturumAyar.objects.filter(sube_id=sube_id)
    }
    items = []
    for sev in catalog_seviyeler(sube_id):
        ayar = ayarlar.get(sev.id)
        items.append({
            'sinif_seviyesi_id': sev.id,
            'sinif_seviyesi': sev.ad,
            'kod': sev.kod,
            'aktif_mi': sev.aktif_mi,
            'preference': ayar.preference if ayar else default_preference_for_seviye(sev),
            'fallback': default_preference_for_seviye(sev),
        })
    return Response({'items': items})


@api_view(['GET', 'PATCH'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def oturum_ayarlari_ogrenciler(request):
    ctx, err = _ctx_or_error(request)
    if err:
        return err
    sube_id = ctx['sube_id']
    yil_id = ctx['egitim_yili_id']
    if not yil_id:
        return Response({'error': 'Eğitim yılı seçin.'}, status=400)

    from apps.egitim_paketleri.models import Deneme

    paketler = list(
        Deneme.objects.filter(
            kurum_id=ctx['kurum_id'], sube_id=sube_id, aktif_mi=True,
        ).filter(models_q_year(yil_id)).order_by('ad')
    )

    if request.method == 'PATCH':
        try:
            ogrenci_id = int(request.data.get('ogrenci_id'))
        except (TypeError, ValueError):
            return Response({'error': 'Öğrenci seçin.'}, status=400)
        raw = request.data.get('preference')
        if raw in (None, '', 'default'):
            OlcmeOgrenciOturumTercihi.objects.filter(
                sube_id=sube_id, egitim_yili_id=yil_id, ogrenci_id=ogrenci_id,
            ).delete()
        else:
            pref = _valid_pref(raw)
            if not pref:
                return Response({'error': 'Hafta içi veya hafta sonu seçin.'}, status=400)
            OlcmeOgrenciOturumTercihi.objects.update_or_create(
                sube_id=sube_id, egitim_yili_id=yil_id, ogrenci_id=ogrenci_id,
                defaults={'preference': pref},
            )

    paket_id = request.query_params.get('paket_id') or request.data.get('paket_id')
    try:
        paket_id = int(paket_id) if paket_id not in (None, '') else None
    except (TypeError, ValueError):
        paket_id = None
    seviye_id = request.query_params.get('seviye_id')
    try:
        seviye_id = int(seviye_id) if seviye_id not in (None, '') else None
    except (TypeError, ValueError):
        seviye_id = None
    group_f = (request.query_params.get('group') or '').strip()
    q = (request.query_params.get('q') or '').strip()

    paket_ids = [paket_id] if paket_id else [d.id for d in paketler]
    holders = _deneme_ogrenci_ids(paket_ids, yil_id)
    kayitlar = [
        k for k in _kayit_base(ctx['kurum_id'], sube_id, yil_id)
        if k.ogrenci_id in holders
    ]
    if q:
        ql = q.casefold()
        kayitlar = [
            k for k in kayitlar
            if ql in f'{k.ogrenci.ad} {k.ogrenci.soyad}'.casefold()
            or ql in (k.ogrenci.tc_kimlik_no or '')
        ]
    seviye_map = {k.ogrenci_id: _seviye_of(k) for k in kayitlar}
    groups = resolve_student_groups(
        sube_id=sube_id, egitim_yili_id=yil_id, student_seviye_ids=seviye_map,
    )
    overrides = set(
        OlcmeOgrenciOturumTercihi.objects.filter(
            sube_id=sube_id, egitim_yili_id=yil_id,
            ogrenci_id__in=list(seviye_map),
        ).values_list('ogrenci_id', flat=True)
    )

    items = []
    for k in kayitlar:
        sev = _seviye_of(k)
        if seviye_id and sev != seviye_id:
            continue
        grp = groups.get(k.ogrenci_id, HAFTA_ICI)
        if group_f and grp != group_f:
            continue
        ogr = k.ogrenci
        items.append({
            'ogrenci_id': ogr.pk,
            'full_name': f'{ogr.ad} {ogr.soyad}'.strip(),
            'tc_kimlik_no': (ogr.tc_kimlik_no or '').strip(),
            'sinif': getattr(k.sinif, 'ad', '') or '',
            'sinif_seviyesi_id': sev,
            'sinif_seviyesi': _seviye_ad(k),
            'preference': grp,
            'is_override': ogr.pk in overrides,
        })
    items.sort(key=lambda r: (r['full_name'].casefold(), r['ogrenci_id']))
    return Response({
        'items': items,
        'paketler': [{'id': d.id, 'ad': d.ad} for d in paketler],
    })


def models_q_year(yil_id):
    from django.db.models import Q
    return Q(egitim_yili_id=yil_id) | Q(egitim_yili_id__isnull=True)
