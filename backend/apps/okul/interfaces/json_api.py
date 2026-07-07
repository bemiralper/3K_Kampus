"""Okul JSON API — şube kapsamlı CRUD."""
import json

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from apps.ogrenci.interfaces.list_helpers import paginate_queryset
from apps.okul.application.bulk_import import BulkOkulImportService, build_excel_template
from apps.okul.application.service import OkulService
from apps.okul.interfaces.sube_context import (
    assert_okul_record_access,
    mandatory_okul_context,
)

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100


def _tenant_fields(ctx):
    return {'kurum_id': ctx['kurum_id'], 'sube_id': ctx['sube_id']}


def _serialize_okul(okul):
    return {
        'id': okul.id,
        'sube_id': okul.sube_id,
        'kurum_id': okul.kurum_id,
        'ad': okul.ad,
        'okul_turu': okul.okul_turu or '',
        'il': okul.il or '',
        'ilce': okul.ilce or '',
        'not_metni': okul.not_metni or '',
        'aktif_mi': okul.aktif_mi,
        'created_at': okul.created_at.isoformat() if okul.created_at else '',
        'updated_at': okul.updated_at.isoformat() if okul.updated_at else '',
    }


def _gate_record(request, ctx, record):
    if not record:
        return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
    denied = assert_okul_record_access(request, ctx['kurum_id'], record.sube_id)
    if denied:
        return denied
    return None


def _parse_page_params(request):
    try:
        page = max(1, int(request.GET.get('page', 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(MAX_PAGE_SIZE, max(1, int(request.GET.get('page_size', DEFAULT_PAGE_SIZE))))
    except (TypeError, ValueError):
        page_size = DEFAULT_PAGE_SIZE
    return page, page_size


@csrf_exempt
def okul_list_create_api(request):
    ctx, err = mandatory_okul_context(request)
    if err:
        return err

    service = OkulService()
    sube_id = ctx['sube_id']

    if request.method == 'GET':
        qs = service.list_okullar(sube_id, request.GET)
        page, page_size = _parse_page_params(request)
        items, pagination = paginate_queryset(qs, page, page_size)
        return JsonResponse({
            'success': True,
            'data': [_serialize_okul(o) for o in items],
            'pagination': pagination,
        })

    if request.method == 'POST':
        try:
            data = json.loads(request.body or '{}')
            okul = service.create_okul({**_tenant_fields(ctx), **data})
            return JsonResponse({'success': True, 'data': _serialize_okul(okul)}, status=201)
        except ValueError as exc:
            return JsonResponse({'success': False, 'error': str(exc)}, status=400)
        except Exception as exc:
            return JsonResponse({'success': False, 'error': str(exc)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def okul_autocomplete_api(request):
    ctx, err = mandatory_okul_context(request)
    if err:
        return err

    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    service = OkulService()
    q = request.GET.get('q', '')
    try:
        limit = min(50, max(1, int(request.GET.get('limit', 20))))
    except (TypeError, ValueError):
        limit = 20
    aktif_only = request.GET.get('aktif_only', '1') not in ('0', 'false', 'no')

    items = service.autocomplete(ctx['sube_id'], q, limit=limit, aktif_only=aktif_only)
    return JsonResponse({
        'success': True,
        'data': [{'id': o.id, 'ad': o.ad, 'okul_turu': o.okul_turu or ''} for o in items],
    })


@csrf_exempt
def okul_detail_api(request, okul_id):
    ctx, err = mandatory_okul_context(request)
    if err:
        return err

    service = OkulService()
    sube_id = ctx['sube_id']

    if request.method == 'GET':
        okul = service.get_okul(okul_id, sube_id)
        denied = _gate_record(request, ctx, okul)
        if denied:
            return denied
        return JsonResponse({'success': True, 'data': _serialize_okul(okul)})

    if request.method == 'PUT':
        okul = service.get_okul(okul_id, sube_id)
        denied = _gate_record(request, ctx, okul)
        if denied:
            return denied
        try:
            data = json.loads(request.body or '{}')
            updated = service.update_okul(okul_id, data, sube_id)
            return JsonResponse({'success': True, 'data': _serialize_okul(updated)})
        except ValueError as exc:
            return JsonResponse({'success': False, 'error': str(exc)}, status=400)

    if request.method == 'DELETE':
        okul = service.get_okul(okul_id, sube_id)
        denied = _gate_record(request, ctx, okul)
        if denied:
            return denied
        _, delete_err = service.delete_okul(okul_id, sube_id)
        if delete_err == 'in_use':
            return JsonResponse({
                'success': False,
                'error': 'Bu okul öğrenci kayıtlarında kullanılıyor. Silmek yerine pasife alın.',
            }, status=400)
        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def okul_delete_info_api(request, okul_id):
    ctx, err = mandatory_okul_context(request)
    if err:
        return err

    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    service = OkulService()
    okul = service.get_okul(okul_id, ctx['sube_id'])
    denied = _gate_record(request, ctx, okul)
    if denied:
        return denied

    info = service.delete_info(okul_id, ctx['sube_id'])
    return JsonResponse({'success': True, 'data': info})


@csrf_exempt
def okul_bulk_template_api(request):
    ctx, err = mandatory_okul_context(request)
    if err:
        return err

    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    content = build_excel_template()
    response = HttpResponse(
        content,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = 'attachment; filename="okul_sablonu.xlsx"'
    return response


@csrf_exempt
def okul_bulk_excel_api(request):
    ctx, err = mandatory_okul_context(request)
    if err:
        return err

    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    upload = request.FILES.get('file')
    if not upload:
        return JsonResponse({'success': False, 'error': 'Excel dosyası gerekli.'}, status=400)

    if not upload.name.lower().endswith(('.xlsx', '.xlsm')):
        return JsonResponse({'success': False, 'error': 'Yalnızca .xlsx dosyası desteklenir.'}, status=400)

    try:
        service = BulkOkulImportService()
        result = service.import_excel(upload, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'])
        return JsonResponse({'success': True, 'data': result.to_dict()})
    except Exception as exc:
        return JsonResponse({'success': False, 'error': f'Excel okunamadı: {exc}'}, status=400)


@csrf_exempt
def okul_bulk_list_api(request):
    """Hızlı liste girişi — her satır bir okul adı veya satır nesnesi."""
    ctx, err = mandatory_okul_context(request)
    if err:
        return err

    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    service = BulkOkulImportService()

    if 'rows' in data:
        rows = data.get('rows') or []
        if not isinstance(rows, list):
            return JsonResponse({'success': False, 'error': 'rows listesi bekleniyor.'}, status=400)
        result = service.import_rows(rows, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'])
    else:
        adlar = data.get('adlar') or data.get('satirlar') or []
        if not isinstance(adlar, list):
            return JsonResponse({'success': False, 'error': 'adlar listesi bekleniyor.'}, status=400)
        result = service.import_ad_list(adlar, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'])

    return JsonResponse({'success': True, 'data': result.to_dict()})
