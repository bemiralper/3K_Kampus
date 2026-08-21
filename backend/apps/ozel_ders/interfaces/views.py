from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.ozel_ders.interfaces.context import (
    error_response,
    json_body,
    mandatory_ozel_ders_context,
    ozel_ders_api,
    parse_date_field,
)
from apps.ozel_ders.services import bordro_bridge
from apps.ozel_ders.services import hakedis_service
from apps.ozel_ders.services import materialize_service
from apps.ozel_ders.services import meta_service
from apps.ozel_ders.services import oturum_service
from apps.ozel_ders.services import premium_kota_service
from apps.ozel_ders.services import program_service
from apps.ozel_ders.services import slot_service
from apps.ozel_ders.services import sync_service
from apps.ozel_ders.services import ucret_engine
from apps.ozel_ders.services.conflict_service import list_holidays
from apps.ozel_ders.services import resmi_tatil_karar_service
from apps.ozel_ders.services import ogrenci_ozel_ders_dashboard
from apps.ozel_ders.services import student_lesson_summary
from apps.ozel_ders.services.errors import OzelDersError
from shared.permissions import require_module_permission, user_has_permission


def _int_or_none(value):
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ─── Meta (ders / öğretmen seçenekleri) ─────────────────────

@csrf_exempt
@ozel_ders_api(methods=['GET'])
def meta(request):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    return JsonResponse({
        'success': True,
        'data': meta_service.build_meta(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        ),
    })


# ─── Programs ───────────────────────────────────────────────

@csrf_exempt
@ozel_ders_api(methods=['GET', 'POST'])
def program_list_create(request):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        if request.method == 'GET':
            data = program_service.list_programs(
                kurum_id=ctx['kurum_id'],
                sube_id=ctx['sube_id'],
                egitim_yili_id=_int_or_none(
                    request.GET.get('egitim_yili_id') or ctx.get('egitim_yili_id')
                ),
                ogrenci_id=_int_or_none(request.GET.get('ogrenci_id')),
                durum=request.GET.get('durum'),
            )
            return JsonResponse({'success': True, 'data': data})

        body = json_body(request)
        payload = {
            'kurum_id': ctx['kurum_id'],
            'sube_id': ctx['sube_id'],
            'egitim_yili_id': body.get('egitim_yili_id') or ctx.get('egitim_yili_id'),
            'term_id': body.get('term_id'),
            'ogrenci_id': body.get('ogrenci_id'),
            'ogrenci_egitim_paketi_id': body.get('ogrenci_egitim_paketi_id'),
            'premium_paket_id': body.get('premium_paket_id'),
            'ozel_ders_paket_id': body.get('ozel_ders_paket_id'),
            'baslangic_tarihi': parse_date_field(body.get('baslangic_tarihi')),
            'bitis_tarihi': parse_date_field(body.get('bitis_tarihi')),
            'durum': body.get('durum'),
            'notlar': body.get('notlar'),
        }
        p = program_service.create_program(payload, user=request.user)
        return JsonResponse(
            {'success': True, 'data': program_service.serialize_program(p)},
            status=201,
        )
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@ozel_ders_api(methods=['GET', 'PUT', 'PATCH'])
def program_detail(request, program_id):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        if request.method == 'GET':
            p = program_service.get_program(
                program_id, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'],
            )
            return JsonResponse({'success': True, 'data': program_service.serialize_program(p)})

        body = json_body(request)
        for key in ('baslangic_tarihi', 'bitis_tarihi'):
            if key in body:
                body[key] = parse_date_field(body[key])
        p = program_service.update_program(
            program_id, body, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'],
        )
        return JsonResponse({'success': True, 'data': program_service.serialize_program(p)})
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@ozel_ders_api(methods=['POST'])
def program_sync(request):
    """Aktif özel ders / premium paket kayıtlarından birebir program senkronu."""
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        body = json_body(request)
        egitim_yili_id = _int_or_none(
            body.get('egitim_yili_id') or request.GET.get('egitim_yili_id') or ctx.get('egitim_yili_id')
        )
        summary = sync_service.sync_sube_programs(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            egitim_yili_id=egitim_yili_id,
            user=request.user,
        )
        return JsonResponse({'success': True, 'data': summary})
    except OzelDersError as exc:
        return error_response(exc)


# ─── Slots ──────────────────────────────────────────────────

@csrf_exempt
@ozel_ders_api(methods=['GET', 'POST'])
def slot_list_create(request, program_id):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        if request.method == 'GET':
            data = slot_service.list_slots(
                program_id, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'],
            )
            return JsonResponse({'success': True, 'data': data})

        body = json_body(request)
        for key in ('baslangic_tarihi', 'bitis_tarihi'):
            if key in body:
                body[key] = parse_date_field(body[key])
        s = slot_service.create_slot(
            program_id, body, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'],
        )
        return JsonResponse(
            {'success': True, 'data': slot_service.serialize_slot(s)},
            status=201,
        )
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@ozel_ders_api(methods=['PUT', 'PATCH', 'DELETE'])
def slot_detail(request, slot_id):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        if request.method == 'DELETE':
            slot_service.delete_slot(
                slot_id, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'],
            )
            return JsonResponse({'success': True})

        body = json_body(request)
        for key in ('baslangic_tarihi', 'bitis_tarihi'):
            if key in body:
                body[key] = parse_date_field(body[key])
        s = slot_service.update_slot(
            slot_id, body, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'],
        )
        return JsonResponse({'success': True, 'data': slot_service.serialize_slot(s)})
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@ozel_ders_api(methods=['POST'])
def slot_swap(request):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        body = json_body(request)
        a_id = int(body.get('slot_a_id') or 0)
        b_id = int(body.get('slot_b_id') or 0)
        if not a_id or not b_id:
            raise OzelDersError('slot_a_id ve slot_b_id zorunlu.', 'swap_ids')
        a, b = slot_service.swap_slots(
            a_id, b_id, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'],
        )
        return JsonResponse({
            'success': True,
            'data': [
                slot_service.serialize_slot(a),
                slot_service.serialize_slot(b),
            ],
        })
    except OzelDersError as exc:
        return error_response(exc)


# ─── Tatiller ───────────────────────────────────────────────

@csrf_exempt
@ozel_ders_api(methods=['GET'])
def tatil_list(request):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    start = parse_date_field(request.GET.get('start_date'))
    end = parse_date_field(request.GET.get('end_date'))
    if not start or not end:
        return JsonResponse(
            {'success': False, 'error': 'start_date ve end_date zorunludur.'},
            status=400,
        )
    if end < start:
        return JsonResponse(
            {'success': False, 'error': 'Bitiş tarihi başlangıçtan önce olamaz.'},
            status=400,
        )
    data = list_holidays(
        ctx['kurum_id'],
        ctx['sube_id'],
        start,
        end,
    )
    return JsonResponse({'success': True, 'data': data})


# ─── Öğrenci dashboard ───────────────────────────────────────

@csrf_exempt
@ozel_ders_api(methods=['GET'])
def ogrenci_ozet(request, ogrenci_id: int):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        data = ogrenci_ozel_ders_dashboard.build_dashboard(
            ogrenci_id=ogrenci_id,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            egitim_yili_id=_int_or_none(
                request.GET.get('egitim_yili_id') or ctx.get('egitim_yili_id')
            ),
        )
        return JsonResponse({'success': True, 'data': data})
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@ozel_ders_api(methods=['GET'])
def ogrenci_ozet_donem(request, ogrenci_id: int):
    """Dönem bazlı planlanan / işlenen / kalan özeti (şablon + tatil + oturum)."""
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        start = parse_date_field(request.GET.get('start_date'))
        end = parse_date_field(request.GET.get('end_date'))
        data = student_lesson_summary.calculate_student_private_lesson_summary(
            ogrenci_id=ogrenci_id,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            start_date=start,
            end_date=end,
        )
        return JsonResponse({'success': True, 'data': data})
    except OzelDersError as exc:
        return error_response(exc)


# ─── Resmi tatiller (katalog sync + karar) ───────────────────

@csrf_exempt
@ozel_ders_api(methods=['GET', 'POST'])
def resmi_tatil_list_sync(request):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        if request.method == 'GET':
            from datetime import date as date_cls

            year = _int_or_none(request.GET.get('year')) or date_cls.today().year
            data = resmi_tatil_karar_service.list_resmi_tatiller_for_year(
                kurum_id=ctx['kurum_id'],
                sube_id=ctx['sube_id'],
                year=year,
            )
            return JsonResponse({'success': True, 'data': data})

        body = json_body(request)
        year = _int_or_none(body.get('year'))
        user_id = getattr(request.user, 'id', None) or 0
        result = resmi_tatil_karar_service.sync_resmi_tatiller(
            kurum_id=ctx['kurum_id'],
            year=year,
            user_id=user_id,
        )
        return JsonResponse({'success': True, 'data': result})
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@ozel_ders_api(methods=['PATCH', 'POST'])
def resmi_tatil_karar(request):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        body = json_body(request)
        holiday_key = (body.get('holiday_key') or '').strip()
        day = parse_date_field(body.get('date') or body.get('tarih'))
        if not holiday_key or not day:
            return JsonResponse(
                {'success': False, 'error': 'holiday_key ve date zorunludur.'},
                status=400,
            )
        if 'ozel_ders_aktif' not in body:
            return JsonResponse(
                {'success': False, 'error': 'ozel_ders_aktif zorunludur.'},
                status=400,
            )
        data = resmi_tatil_karar_service.set_karar(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            holiday_key=holiday_key,
            day=day,
            ozel_ders_aktif=bool(body.get('ozel_ders_aktif')),
        )
        return JsonResponse({'success': True, 'data': data})
    except OzelDersError as exc:
        return error_response(exc)


# ─── Materialize ────────────────────────────────────────────

@csrf_exempt
@ozel_ders_api(methods=['POST'])
def materialize(request, program_id):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        body = json_body(request)
        result = materialize_service.materialize_program(
            program_id,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            start_date=body.get('start_date'),
            end_date=body.get('end_date'),
            user=request.user,
        )
        return JsonResponse({'success': True, 'data': result})
    except OzelDersError as exc:
        return error_response(exc)


# ─── Oturumlar ──────────────────────────────────────────────

@csrf_exempt
@ozel_ders_api(methods=['GET', 'POST'])
def oturum_list_create(request):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        if request.method == 'GET':
            start_date = request.GET.get('start_date')
            end_date = request.GET.get('end_date')
            if start_date and end_date:
                try:
                    materialize_service.materialize_active_programs(
                        kurum_id=ctx['kurum_id'],
                        sube_id=ctx['sube_id'],
                        start_date=start_date,
                        end_date=end_date,
                        user=request.user,
                    )
                except OzelDersError:
                    pass
            data = oturum_service.list_oturumlar(
                kurum_id=ctx['kurum_id'],
                sube_id=ctx['sube_id'],
                start_date=start_date,
                end_date=end_date,
                durum=request.GET.get('durum'),
                telafi_durumu=request.GET.get('telafi_durumu'),
                oturum_turu=request.GET.get('oturum_turu'),
                ogretmen_id=_int_or_none(request.GET.get('ogretmen_id')),
                ogrenci_id=_int_or_none(request.GET.get('ogrenci_id')),
                program_id=_int_or_none(request.GET.get('program_id')),
            )
            return JsonResponse({'success': True, 'data': data})

        body = json_body(request)
        if not body.get('egitim_yili_id'):
            body['egitim_yili_id'] = ctx.get('egitim_yili_id')
        o, warnings = oturum_service.create_oturum(
            body, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'], user=request.user,
        )
        return JsonResponse({
            'success': True,
            'data': oturum_service.serialize_oturum(o),
            'warnings': warnings,
        }, status=201)
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@ozel_ders_api(methods=['GET'])
def oturum_detail(request, oturum_id):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        o = oturum_service.get_oturum(
            oturum_id, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'],
        )
        return JsonResponse({'success': True, 'data': oturum_service.serialize_oturum(o)})
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@ozel_ders_api(methods=['POST'])
def oturum_set_durum(request, oturum_id):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        body = json_body(request)
        send_wa = body.get('send_whatsapp')
        if send_wa is not None and not isinstance(send_wa, bool):
            send_wa = str(send_wa).lower() in ('1', 'true', 'yes', 'on')
        o = oturum_service.set_durum(
            oturum_id,
            body.get('durum'),
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            notes=body.get('notes'),
            sebep_kodu=body.get('sebep_kodu'),
            sebep_aciklama=body.get('sebep_aciklama'),
            telafi_durumu=body.get('telafi_durumu'),
            send_whatsapp=send_wa,
            user=request.user,
        )
        return JsonResponse({'success': True, 'data': oturum_service.serialize_oturum(o)})
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@ozel_ders_api(methods=['POST'])
def oturum_telafi(request, oturum_id):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        body = json_body(request)
        o, warnings = oturum_service.create_telafi(
            oturum_id, body,
            kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'], user=request.user,
        )
        return JsonResponse({
            'success': True,
            'data': oturum_service.serialize_oturum(o),
            'warnings': warnings,
        }, status=201)
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@ozel_ders_api(methods=['POST'])
def oturum_change_teacher(request, oturum_id):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        body = json_body(request)
        o, warnings = oturum_service.change_teacher(
            oturum_id,
            body.get('ogretmen_id'),
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        )
        return JsonResponse({
            'success': True,
            'data': oturum_service.serialize_oturum(o),
            'warnings': warnings,
        })
    except OzelDersError as exc:
        return error_response(exc)


# ─── Hakediş ────────────────────────────────────────────────

@csrf_exempt
@ozel_ders_api(methods=['GET'])
def hakedis_list(request):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    yil = request.GET.get('yil')
    ay = request.GET.get('ay')
    data = hakedis_service.list_hakedis(
        kurum_id=ctx['kurum_id'],
        sube_id=ctx['sube_id'],
        durum=request.GET.get('durum'),
        ogretmen_id=request.GET.get('ogretmen_id'),
        yil=int(yil) if yil else None,
        ay=int(ay) if ay else None,
    )
    return JsonResponse({'success': True, 'data': data})


@csrf_exempt
@require_module_permission('ozel_ders')
@require_http_methods(['POST'])
def hakedis_approve(request, hakedis_id):
    if not (
        user_has_permission(request.user, 'ozel_ders.manage')
        or user_has_permission(request.user, 'ozel_ders.hakedis_approve')
    ):
        return JsonResponse({'success': False, 'error': 'Hakediş onay yetkisi yok.'}, status=403)
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        h = hakedis_service.approve_hakedis(
            hakedis_id, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'],
        )
        return JsonResponse({'success': True, 'data': hakedis_service.serialize_hakedis(h)})
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@require_module_permission('ozel_ders')
@require_http_methods(['POST'])
def hakedis_cancel(request, hakedis_id):
    """İptal, onay kadar kritik bir işlem olduğu için aynı yetki barını kullanır."""
    if not (
        user_has_permission(request.user, 'ozel_ders.manage')
        or user_has_permission(request.user, 'ozel_ders.hakedis_approve')
    ):
        return JsonResponse({'success': False, 'error': 'Hakediş iptal yetkisi yok.'}, status=403)
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        h = hakedis_service.cancel_hakedis(
            hakedis_id, kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'],
        )
        return JsonResponse({'success': True, 'data': hakedis_service.serialize_hakedis(h)})
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@require_module_permission('ozel_ders', manage_only=True)
@require_http_methods(['POST'])
def hakedis_bordro_aktar(request):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        body = json_body(request)
        result = bordro_bridge.apply_approved_to_bordro(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            yil=int(body['yil']),
            ay=int(body['ay']),
            ogretmen_id=body.get('ogretmen_id'),
        )
        return JsonResponse({'success': True, 'data': result})
    except (KeyError, ValueError, TypeError):
        return JsonResponse({'success': False, 'error': 'yil ve ay zorunlu.'}, status=400)
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@ozel_ders_api(methods=['GET'])
def hakedis_for_bordro(request, aylik_hakedis_id):
    from apps.personel.domain.sozlesme_models import AylikHakedis

    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    try:
        aylik = AylikHakedis.objects.select_related('sozlesme').get(pk=aylik_hakedis_id)
    except AylikHakedis.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Aylık hakediş bulunamadı.'}, status=404)
    if aylik.sozlesme.kurum_id != ctx['kurum_id'] or aylik.sozlesme.sube_id != ctx['sube_id']:
        return JsonResponse({'success': False, 'error': 'Bu kayda erişim yetkiniz yok.'}, status=403)

    data = bordro_bridge.list_for_bordro(aylik_hakedis_id)
    return JsonResponse({'success': True, 'data': data})


# ─── Premium kota ───────────────────────────────────────────

def _gate_premium_paket(ctx, premium_paket_id):
    """Premium paketin aktif kurum/şube bağlamına ait olduğunu doğrular."""
    from apps.egitim_paketleri.models import PremiumPaket

    try:
        paket = PremiumPaket.objects.get(pk=premium_paket_id)
    except PremiumPaket.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Premium paket bulunamadı.'}, status=404)
    if paket.kurum_id and paket.kurum_id != ctx['kurum_id']:
        return JsonResponse({'success': False, 'error': 'Bu pakete erişim yetkiniz yok.'}, status=403)
    if paket.sube_id and paket.sube_id != ctx['sube_id']:
        return JsonResponse({'success': False, 'error': 'Bu pakete erişim yetkiniz yok.'}, status=403)
    return None


@csrf_exempt
@ozel_ders_api(methods=['GET', 'PUT'])
def premium_kota(request, premium_paket_id):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    gate_err = _gate_premium_paket(ctx, premium_paket_id)
    if gate_err:
        return gate_err
    try:
        if request.method == 'GET':
            return JsonResponse({
                'success': True,
                'data': premium_kota_service.list_kota(premium_paket_id),
            })
        body = json_body(request)
        rows = body.get('kotalar') or body.get('rows') or []
        data = premium_kota_service.set_kota(premium_paket_id, rows)
        return JsonResponse({'success': True, 'data': data})
    except OzelDersError as exc:
        return error_response(exc)


@csrf_exempt
@ozel_ders_api(methods=['GET'])
def premium_kota_suggest(request, premium_paket_id):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    gate_err = _gate_premium_paket(ctx, premium_paket_id)
    if gate_err:
        return gate_err
    return JsonResponse({
        'success': True,
        'data': premium_kota_service.suggest_slots_from_kota(premium_paket_id),
    })


# ─── Ücret kuralları seed ───────────────────────────────────

@csrf_exempt
@require_module_permission('ozel_ders', manage_only=True)
@require_http_methods(['POST'])
def seed_ucret_kurallari(request):
    ctx, err = mandatory_ozel_ders_context(request)
    if err:
        return err
    body = json_body(request)
    scope = body.get('scope', 'global')
    if scope == 'sube':
        created = ucret_engine.seed_default_rules(
            kurum_id=ctx['kurum_id'], sube_id=ctx['sube_id'],
        )
    elif scope == 'kurum':
        created = ucret_engine.seed_default_rules(kurum_id=ctx['kurum_id'], sube_id=None)
    else:
        created = ucret_engine.seed_default_rules()
    return JsonResponse({'success': True, 'data': {'created': created}})
