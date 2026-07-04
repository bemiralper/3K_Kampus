"""Görev modülü — API view'ları."""
import json
from datetime import datetime

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from django.utils import timezone

from apps.gorev.application.service import GorevService, GorevTipiService
from apps.gorev.helpers import (
    _get_kurum_id, _get_sube_id, _get_egitim_yili_id, _get_donem_id, _get_user_id,
    serialize_gorev, serialize_gorev_tipi, serialize_atama, resolve_assignee_names,
)
from apps.gorev.domain.models import GorevAtama, GorevTekrarSablonu
from apps.roller.models import UserRole


def _parse_datetime(val):
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    return datetime.fromisoformat(val.replace('Z', '+00:00'))


def _get_role_code(request):
    user_id = _get_user_id(request)
    if not user_id:
        return None
    try:
        return UserRole.objects.select_related('role').get(user_id=user_id).role.code
    except UserRole.DoesNotExist:
        return None


def _is_admin_role(role_code):
    return role_code in ('super_admin', 'kurum_yoneticisi', 'sube_yoneticisi', 'egitim_yoneticisi')


def _can_view_all_gorevler(request, role_code=None):
    """Kurum genelinde tüm görevleri görebilir mi? (admin rolü veya staff/superuser)"""
    if role_code is None:
        role_code = _get_role_code(request)
    if _is_admin_role(role_code):
        return True
    user = request.user
    return user.is_authenticated and (user.is_staff or user.is_superuser)


@csrf_exempt
def api_gorev_list_create(request):
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    service = GorevService()
    user_id = _get_user_id(request)
    role_code = _get_role_code(request)

    if request.method == 'GET':
        filters = {}
        p = request.GET
        sube_id = _get_sube_id(request)
        if sube_id:
            filters['sube_id'] = sube_id
        if p.get('oncelik'):
            filters['oncelik'] = p['oncelik']
        if p.get('gorev_tipi_id'):
            filters['gorev_tipi_id'] = p['gorev_tipi_id']
        if p.get('durum'):
            filters['durum'] = p['durum']
        if p.get('search'):
            filters['search'] = p['search']
        if p.get('baslangic'):
            filters['baslangic'] = _parse_datetime(p['baslangic'])
        if p.get('bitis'):
            filters['bitis'] = _parse_datetime(p['bitis'])
        if p.get('geciken') == 'true':
            filters['geciken'] = True

        if _can_view_all_gorevler(request, role_code) and p.get('atanan_user_id'):
            filters['atanan_user_id'] = int(p['atanan_user_id'])
        elif not _can_view_all_gorevler(request, role_code):
            filters['atanan_user_id'] = user_id

        gorevler = service.list_gorevler(kurum_id, filters)
        return JsonResponse({
            'success': True,
            'data': [serialize_gorev(g, include_atamalar=True) for g in gorevler[:200]],
        })

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            if not data.get('sube_id'):
                sube_id = _get_sube_id(request)
                if sube_id:
                    data['sube_id'] = sube_id
            if not data.get('egitim_yili_id'):
                ey = _get_egitim_yili_id(request)
                if ey:
                    data['egitim_yili_id'] = ey
            if not data.get('donem_id'):
                d = _get_donem_id(request)
                if d:
                    data['donem_id'] = d
            data['son_tarih'] = _parse_datetime(data.get('son_tarih'))

            from apps.gorev.personal_create import enforce_personal_gorev_create
            data = enforce_personal_gorev_create(data, user_id, role_code, kurum_id)

            gorev = service.create_gorev(kurum_id, data, user_id)
            return JsonResponse({'success': True, 'data': serialize_gorev(gorev, include_atamalar=True)})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_gorev_detail(request, pk):
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    service = GorevService()
    gorev = service.get_gorev(kurum_id, pk)
    if not gorev:
        return JsonResponse({'success': False, 'error': 'Görev bulunamadı'}, status=404)

    user_id = _get_user_id(request)
    role_code = _get_role_code(request)

    if not _can_view_all_gorevler(request, role_code):
        if not gorev.atamalar.filter(atanan_user_id=user_id).exists():
            return JsonResponse({'success': False, 'error': 'Yetkisiz'}, status=403)

    if request.method == 'GET':
        return JsonResponse({'success': True, 'data': serialize_gorev(gorev, include_atamalar=True)})

    if request.method == 'PUT':
        if not _can_view_all_gorevler(request, role_code):
            return JsonResponse({'success': False, 'error': 'Yetkisiz'}, status=403)
        try:
            data = json.loads(request.body)
            if 'son_tarih' in data:
                data['son_tarih'] = _parse_datetime(data['son_tarih'])
            gorev = service.update_gorev(gorev, data, user_id)
            return JsonResponse({'success': True, 'data': serialize_gorev(gorev, include_atamalar=True)})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    if request.method == 'DELETE':
        if not _can_view_all_gorevler(request, role_code):
            return JsonResponse({'success': False, 'error': 'Yetkisiz'}, status=403)
        service.delete_gorev(gorev, user_id)
        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_atama_list(request):
    kurum_id = _get_kurum_id(request)
    user_id = _get_user_id(request)
    if not kurum_id or not user_id:
        return JsonResponse({'success': False, 'error': 'Yetkisiz'}, status=400)

    service = GorevService()
    role_code = _get_role_code(request)
    p = request.GET
    filters = {}

    if p.get('durum'):
        filters['durum'] = p['durum']
    if p.get('oncelik'):
        filters['oncelik'] = p['oncelik']
    search = (p.get('search') or p.get('q') or '').strip()
    if search:
        filters['search'] = search
    if p.get('baslangic'):
        filters['baslangic'] = _parse_datetime(p['baslangic'])
    if p.get('bitis'):
        filters['bitis'] = _parse_datetime(p['bitis'])
    if p.get('geciken') == 'true':
        filters['geciken'] = True

    if _can_view_all_gorevler(request, role_code) and p.get('tum') == 'true':
        atamalar = service.list_atamalar(kurum_id, user_id=None, filters=filters)
    elif _can_view_all_gorevler(request, role_code) and p.get('user_id'):
        atamalar = service.list_atamalar(kurum_id, user_id=int(p['user_id']), filters=filters)
    else:
        atamalar = service.list_atamalar(kurum_id, user_id=user_id, filters=filters)

    name_map = resolve_assignee_names(
        kurum_id, list({a.atanan_user_id for a in atamalar}),
    )

    return JsonResponse({
        'success': True,
        'data': [
            serialize_atama(
                a, include_gorev=True, atanan_ad=name_map.get(a.atanan_user_id),
            )
            for a in atamalar[:200]
        ],
    })


@csrf_exempt
def api_atama_filter_options(request):
    """Admin filtreleri — kurumdaki atanan kişi listesi."""
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    kurum_id = _get_kurum_id(request)
    user_id = _get_user_id(request)
    if not kurum_id or not user_id:
        return JsonResponse({'success': False, 'error': 'Yetkisiz'}, status=400)

    role_code = _get_role_code(request)
    if not _can_view_all_gorevler(request, role_code):
        return JsonResponse({'success': False, 'error': 'Yetkisiz'}, status=403)

    user_ids = GorevAtama.objects.filter(
        gorev__kurum_id=kurum_id,
        gorev__is_deleted=False,
    ).values_list('atanan_user_id', flat=True).distinct()

    name_map = resolve_assignee_names(kurum_id, list(user_ids))
    data = sorted(
        [
            {'user_id': uid, 'ad': name_map.get(uid, f'Kullanıcı #{uid}')}
            for uid in set(user_ids)
        ],
        key=lambda x: x['ad'].lower(),
    )
    return JsonResponse({'success': True, 'data': data})


@csrf_exempt
def api_atama_detail(request, pk):
    kurum_id = _get_kurum_id(request)
    user_id = _get_user_id(request)
    if not kurum_id or not user_id:
        return JsonResponse({'success': False, 'error': 'Yetkisiz'}, status=400)

    try:
        atama = GorevAtama.objects.select_related('gorev', 'gorev__gorev_tipi').get(
            id=pk, gorev__kurum_id=kurum_id, gorev__is_deleted=False,
        )
    except GorevAtama.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Atama bulunamadı'}, status=404)

    role_code = _get_role_code(request)
    if not _can_view_all_gorevler(request, role_code) and atama.atanan_user_id != user_id:
        return JsonResponse({'success': False, 'error': 'Yetkisiz'}, status=403)

    if request.method == 'GET':
        return JsonResponse({'success': True, 'data': serialize_atama(atama, include_gorev=True)})

    if request.method in ('PUT', 'PATCH'):
        try:
            data = json.loads(request.body)
            service = GorevService()
            atama = service.update_atama(atama, data, user_id)
            return JsonResponse({'success': True, 'data': serialize_atama(atama, include_gorev=True)})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_gorev_tipler(request):
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    tip_service = GorevTipiService()

    if request.method == 'GET':
        tipler = tip_service.list_tipler(kurum_id, active_only=request.GET.get('all') != 'true')
        return JsonResponse({
            'success': True,
            'data': [serialize_gorev_tipi(t) for t in tipler],
        })

    if request.method == 'POST':
        from apps.gorev.domain.models import GorevTipi
        try:
            data = json.loads(request.body)
            tip = GorevTipi.objects.create(
                kurum_id=kurum_id,
                kod=data['kod'],
                ad=data['ad'],
                renk=data.get('renk', '#3B82F6'),
                ikon=data.get('ikon', '📋'),
                sira=data.get('sira', 0),
            )
            return JsonResponse({'success': True, 'data': serialize_gorev_tipi(tip)})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_http_methods(['POST'])
def api_gorev_tipler_seed(request):
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)
    GorevTipiService().seed_defaults(kurum_id)
    tipler = GorevTipiService().list_tipler(kurum_id, active_only=False)
    return JsonResponse({
        'success': True,
        'data': [serialize_gorev_tipi(t) for t in tipler],
    })


@csrf_exempt
def api_dashboard_ozet(request):
    kurum_id = _get_kurum_id(request)
    user_id = _get_user_id(request)
    if not kurum_id or not user_id:
        return JsonResponse({'success': False, 'error': 'Yetkisiz'}, status=400)

    role_code = _get_role_code(request)
    view_all = _can_view_all_gorevler(request, role_code)
    ozet = GorevService().get_dashboard_ozet(kurum_id, user_id, role_code, view_all=view_all)
    return JsonResponse({'success': True, 'data': ozet})


@csrf_exempt
def api_analitik(request):
    kurum_id = _get_kurum_id(request)
    user_id = _get_user_id(request)
    if not kurum_id or not user_id:
        return JsonResponse({'success': False, 'error': 'Yetkisiz'}, status=400)

    role_code = _get_role_code(request)
    if not _can_view_all_gorevler(request, role_code):
        return JsonResponse({'success': False, 'error': 'Yetkisiz'}, status=403)

    p = request.GET
    baslangic = _parse_datetime(p.get('baslangic')) if p.get('baslangic') else None
    bitis = _parse_datetime(p.get('bitis')) if p.get('bitis') else None
    rol_kodu = p.get('rol') or ''

    from apps.gorev.application.analytics_service import GorevAnalyticsService
    data = GorevAnalyticsService().get_analitik(
        kurum_id=kurum_id,
        baslangic=baslangic,
        bitis=bitis,
        rol_kodu=rol_kodu,
    )
    return JsonResponse({'success': True, 'data': data})


@csrf_exempt
def api_takvim(request):
    kurum_id = _get_kurum_id(request)
    user_id = _get_user_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    service = GorevService()
    role_code = _get_role_code(request)
    p = request.GET
    filters = {}

    if p.get('baslangic'):
        filters['baslangic'] = _parse_datetime(p['baslangic'])
    if p.get('bitis'):
        filters['bitis'] = _parse_datetime(p['bitis'])
    if p.get('durum'):
        filters['durum'] = p['durum']

    if _can_view_all_gorevler(request, role_code) and p.get('atanan_user_id'):
        filters['atanan_user_id'] = int(p['atanan_user_id'])
    elif p.get('tum') == 'true' and _can_view_all_gorevler(request, role_code):
        filters['include_assignees'] = True
    elif not _can_view_all_gorevler(request, role_code):
        filters['atanan_user_id'] = user_id

    events = service.get_takvim_events(kurum_id, filters)
    return JsonResponse({'success': True, 'data': events})


def serialize_tekrar_sablon(s):
    return {
        'id': str(s.id),
        'baslik': s.baslik,
        'aciklama': s.aciklama,
        'oncelik': s.oncelik,
        'tahmini_sure_dk': s.tahmini_sure_dk,
        'tum_gun': s.tum_gun,
        'hedef_tipi': s.hedef_tipi,
        'hedef_rol_kodu': s.hedef_rol_kodu,
        'hedef_user_ids': s.hedef_user_ids or [],
        'tekrar_tipi': s.tekrar_tipi,
        'tekrar_gun': s.tekrar_gun,
        'sonraki_uretim_tarihi': s.sonraki_uretim_tarihi.isoformat() if s.sonraki_uretim_tarihi else None,
        'aktif': s.aktif,
        'gorev_tipi_id': str(s.gorev_tipi_id),
        'gorev_tipi': serialize_gorev_tipi(s.gorev_tipi) if s.gorev_tipi_id else None,
    }


@csrf_exempt
def api_tekrar_sablonlari(request):
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    if request.method == 'GET':
        qs = GorevTekrarSablonu.objects.filter(
            kurum_id=kurum_id, is_deleted=False,
        ).select_related('gorev_tipi').order_by('baslik')
        return JsonResponse({
            'success': True,
            'data': [serialize_tekrar_sablon(s) for s in qs],
        })

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            from datetime import date as date_cls
            sonraki = data.get('sonraki_uretim_tarihi')
            if sonraki:
                sonraki = date_cls.fromisoformat(sonraki[:10])

            sablon = GorevTekrarSablonu.objects.create(
                kurum_id=kurum_id,
                sube_id=data.get('sube_id') or _get_sube_id(request),
                baslik=data['baslik'],
                aciklama=data.get('aciklama', ''),
                gorev_tipi_id=data['gorev_tipi_id'],
                oncelik=data.get('oncelik', 'NORMAL'),
                tahmini_sure_dk=data.get('tahmini_sure_dk', 30),
                tum_gun=data.get('tum_gun', False),
                hedef_tipi=data.get('hedef_tipi', 'ROL'),
                hedef_rol_kodu=data.get('hedef_rol_kodu', ''),
                hedef_user_ids=data.get('hedef_user_ids', []),
                tekrar_tipi=data.get('tekrar_tipi', 'GUNLUK'),
                tekrar_gun=data.get('tekrar_gun'),
                sonraki_uretim_tarihi=sonraki or timezone.now().date(),
                olusturan_id=_get_user_id(request),
            )
            return JsonResponse({'success': True, 'data': serialize_tekrar_sablon(sablon)})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_tekrar_sablon_detail(request, pk):
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    try:
        sablon = GorevTekrarSablonu.objects.select_related('gorev_tipi').get(
            id=pk, kurum_id=kurum_id, is_deleted=False,
        )
    except GorevTekrarSablonu.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Şablon bulunamadı'}, status=404)

    if request.method == 'GET':
        return JsonResponse({'success': True, 'data': serialize_tekrar_sablon(sablon)})

    if request.method in ('PUT', 'PATCH'):
        try:
            data = json.loads(request.body)
            for field in ('baslik', 'aciklama', 'oncelik', 'tahmini_sure_dk', 'tum_gun',
                          'hedef_tipi', 'hedef_rol_kodu', 'hedef_user_ids', 'tekrar_tipi',
                          'tekrar_gun', 'aktif', 'gorev_tipi_id'):
                if field in data:
                    setattr(sablon, field, data[field])
            if 'sonraki_uretim_tarihi' in data and data['sonraki_uretim_tarihi']:
                from datetime import date as date_cls
                sablon.sonraki_uretim_tarihi = date_cls.fromisoformat(data['sonraki_uretim_tarihi'][:10])
            sablon.save()
            return JsonResponse({'success': True, 'data': serialize_tekrar_sablon(sablon)})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    if request.method == 'DELETE':
        sablon.is_deleted = True
        sablon.save(update_fields=['is_deleted'])
        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
