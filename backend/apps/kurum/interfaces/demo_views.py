"""Demo veri yönetimi API — Ayarlar > Demo Yönetimi."""
import json

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from apps.kurum.domain.models import Kurum
from apps.kurum.services.demo_data_service import DEMO_PRESETS, DemoDataService
from apps.sube.domain.models import Sube
from shared.environment import (
    assert_demo_operations_allowed,
    assert_operational_reset_allowed,
    get_environment_info,
)
from shared.permissions import api_permission_required


def _parse_body(request) -> dict:
    if not request.body:
        return {}
    try:
        return json.loads(request.body)
    except json.JSONDecodeError:
        return {}


def _resolve_kurum_sube(request, data: dict | None = None):
    data = data or {}
    kurum_id = (
        data.get('kurum_id')
        or request.headers.get('X-Kurum-ID')
        or request.session.get('active_kurum_id')
    )
    sube_id = (
        data.get('sube_id')
        or request.headers.get('X-Sube-ID')
        or request.session.get('active_sube_id')
    )
    if kurum_id:
        kurum = Kurum.objects.filter(id=int(kurum_id)).first()
    else:
        kurum = Kurum.objects.filter(aktif_mi=True).first()
    if not kurum:
        return None, None, 'Kurum bulunamadı.'
    if sube_id:
        sube = Sube.objects.filter(id=int(sube_id), kurum=kurum).first()
    else:
        sube = Sube.objects.filter(kurum=kurum, aktif_mi=True).order_by('id').first()
    if not sube:
        return kurum, None, 'Şube bulunamadı.'
    return kurum, sube, None


@require_http_methods(['GET'])
@api_permission_required('demo.read', 'demo.manage', 'sistem.admin')
def demo_status_view(request):
    kurum, sube, err = _resolve_kurum_sube(request)
    if err:
        return JsonResponse({'success': False, 'error': err}, status=400)

    service = DemoDataService()
    status = service.get_status(kurum)
    env = get_environment_info()
    return JsonResponse({
        'success': True,
        'data': {
            **status,
            'kurum': {'id': kurum.id, 'ad': kurum.ad},
            'sube': {'id': sube.id, 'ad': sube.ad},
            'environment': env,
            'presets': {
                key: {k: v for k, v in val.items()}
                for key, val in DEMO_PRESETS.items()
            },
            'isolation': {
                'separate_database': env['is_demo_environment'],
                'demo_db_name': 'lms_demo_db',
                'production_db_name': 'lms_db',
                'description': (
                    'Demo geliştirme ayrı PostgreSQL veritabanında yapılır (DJANGO_ENV=demo). '
                    'Canlı sistem farklı DB kullanır; demo verisi otomatik taşınmaz. '
                    'Kod ve migration\'lar git ile canlıya alınır.'
                ),
            },
        },
    })


@require_http_methods(['GET'])
@api_permission_required('demo.read', 'demo.manage', 'sistem.admin')
def demo_environment_view(request):
    return JsonResponse({'success': True, 'data': get_environment_info()})


@require_http_methods(['POST'])
@api_permission_required('demo.manage', 'sistem.admin')
def demo_seed_view(request):
    blocked = assert_demo_operations_allowed()
    if blocked:
        return JsonResponse({'success': False, 'error': blocked}, status=403)

    data = _parse_body(request)
    kurum, sube, err = _resolve_kurum_sube(request, data)
    if err:
        return JsonResponse({'success': False, 'error': err}, status=400)

    preset = data.get('preset', 'full')
    if preset not in DEMO_PRESETS:
        return JsonResponse({'success': False, 'error': f'Geçersiz preset: {preset}'}, status=400)

    overrides = {}
    for key in ('students', 'mezun', 'teachers', 'classes'):
        if key in data and data[key] is not None:
            overrides[key] = int(data[key])

    service = DemoDataService()
    try:
        result = service.seed(
            kurum,
            sube,
            preset=preset,
            purge_first=bool(data.get('purge_first')),
            **overrides,
        )
    except ValueError as exc:
        return JsonResponse({'success': False, 'error': str(exc)}, status=400)
    except Exception as exc:
        return JsonResponse({'success': False, 'error': str(exc)}, status=500)

    if result.get('skipped'):
        messages = {
            'demo_students_exist': 'DEMO öğrenciler zaten var. Önce temizleyin veya "Önce temizle" seçeneğini işaretleyin.',
            'no_demo_students': 'Finans verisi için önce demo öğrenci oluşturun.',
            'demo_finance_exists': 'DEMO finans kayıtları zaten var. Önce temizleyin.',
        }
        return JsonResponse({
            'success': False,
            'error': messages.get(result.get('reason'), 'İşlem atlandı'),
            'data': result,
        }, status=409)

    return JsonResponse({'success': True, 'data': result})


@require_http_methods(['POST'])
@api_permission_required('demo.manage', 'sistem.admin')
def demo_purge_view(request):
    blocked = assert_demo_operations_allowed()
    if blocked:
        return JsonResponse({'success': False, 'error': blocked}, status=403)

    data = _parse_body(request)
    kurum, _sube, err = _resolve_kurum_sube(request, data)
    if err:
        return JsonResponse({'success': False, 'error': err}, status=400)

    if data.get('confirm') != 'PURGE-DEMO':
        return JsonResponse({
            'success': False,
            'error': 'Onay metni PURGE-DEMO olmalı',
        }, status=400)

    service = DemoDataService()
    deleted = service.purge(kurum)
    status = service.get_status(kurum)
    return JsonResponse({
        'success': True,
        'data': {'deleted': deleted, 'status': status},
    })


@require_http_methods(['POST'])
@api_permission_required('demo.manage', 'sistem.admin')
def demo_reset_view(request):
    """Operasyonel veriyi sıfırla; kurum + finans tanımları korunur."""
    blocked = assert_operational_reset_allowed()
    if blocked:
        return JsonResponse({'success': False, 'error': blocked}, status=403)

    data = _parse_body(request)
    if data.get('confirm') != 'SIFIRLA':
        return JsonResponse({
            'success': False,
            'error': 'Onay metni SIFIRLA olmalı',
        }, status=400)

    if not request.user.is_superuser and not (
        hasattr(request.user, 'user_role')
        and request.user.user_role
        and request.user.user_role.role
        and request.user.user_role.role.has_permission('sistem.admin')
    ):
        return JsonResponse({
            'success': False,
            'error': 'Bu işlem yalnızca süper yönetici tarafından yapılabilir',
        }, status=403)

    from django.core.management import call_command
    from io import StringIO

    out = StringIO()
    try:
        call_command(
            'reset_app_data',
            preserve_finans_tanimlari=True,
            noinput=True,
            create_admin=data.get('create_admin', True),
            stdout=out,
        )
    except Exception as exc:
        return JsonResponse({'success': False, 'error': str(exc)}, status=500)

    admin_hint = ''
    if data.get('create_admin', True):
        admin_hint = ' Giriş: admin / admin123 (ilk girişten sonra şifreyi değiştirin).'

    return JsonResponse({
        'success': True,
        'data': {
            'message': 'Operasyonel veri sıfırlandı (kurum + finans tanımları korundu).' + admin_hint,
            'log': out.getvalue(),
            'admin_created': bool(data.get('create_admin', True)),
            'login_hint': {'username': 'admin', 'password': 'admin123'} if data.get('create_admin', True) else None,
        },
    })
