"""
Kurum Views
"""
import json
from django.db import IntegrityError
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from apps.kurum.domain.models import Kurum
from apps.kurum.branding import serialize_kurum_branding, serialize_sube_branding, apply_branding_fields
from apps.sube.domain.models import Sube
from apps.sube.serialize import serialize_sube, apply_sube_fields
from apps.egitim_yili.domain.models import EgitimYili


def _kurum_save_error_response(exc: Exception, data: dict | None = None) -> JsonResponse | None:
    """IntegrityError veya benzeri benzersiz kod hatası → Türkçe mesaj."""
    msg = str(exc)
    is_kod_conflict = isinstance(exc, IntegrityError) or (
        'unique constraint' in msg.lower() and '(kod)' in msg.lower()
    )
    if not is_kod_conflict:
        return None
    kod = (data or {}).get('kod', '')
    if 'kurum_kod' in msg or 'unique_kurum' in msg.lower() or '(kod)' in msg:
        if kod:
            return JsonResponse({
                'success': False,
                'error': f'"{kod}" kurum kodu zaten kullanılıyor. Farklı bir kod girin.',
            }, status=400)
        return JsonResponse({
            'success': False,
            'error': 'Bu kurum kodu zaten kullanılıyor. Farklı bir kod girin.',
        }, status=400)
    return JsonResponse({'success': False, 'error': 'Bu kayıt zaten mevcut (benzersiz alan çakışması).'}, status=400)


def _resolve_kurum_id_for_sube(data: dict) -> tuple[int | None, JsonResponse | None]:
    """Şube kaydı için kurum_id doğrula; yoksa Türkçe hata döndür."""
    raw = data.get('kurum_id')
    if raw in (None, ''):
        return None, JsonResponse({'success': False, 'error': 'Kurum seçimi zorunludur.'}, status=400)
    try:
        kurum_id = int(raw)
    except (TypeError, ValueError):
        return None, JsonResponse({'success': False, 'error': 'Geçersiz kurum seçimi.'}, status=400)
    if not Kurum.objects.filter(pk=kurum_id).exists():
        return None, JsonResponse({
            'success': False,
            'error': (
                f'Seçilen kurum (ID {kurum_id}) bulunamadı. '
                'Sayfayı yenileyip geçerli bir kurum seçin.'
            ),
        }, status=400)
    return kurum_id, None


@login_required
def kurum_tanimlar(request):
    """Kurum tanımları ana sayfa"""
    all_kurumlar = Kurum.objects.all().order_by('ad')
    context = {
        'kurumlar': all_kurumlar.order_by('-id'),
        'all_kurumlar': all_kurumlar,  # Drawer'larda kullanmak için
        'subeler': Sube.objects.select_related('kurum').all().order_by('-id'),
        'egitim_yillari': EgitimYili.objects.all().order_by('-baslangic_yil'),
    }
    return render(request, 'kurum/kurum_tanimlar.html', context)


@login_required
def kurum_create(request):
    """Yeni kurum oluştur"""
    if request.method == 'POST':
        kurum = Kurum.objects.create(
            ad=request.POST.get('ad'),
            kod=request.POST.get('kod') or None,
            yetkili_ad_soyad=request.POST.get('yetkili_ad_soyad', ''),
            telefon_sabit=request.POST.get('telefon_sabit', ''),
            telefon_cep=request.POST.get('telefon_cep', ''),
            vergi_no=request.POST.get('vergi_no', ''),
            vergi_dairesi=request.POST.get('vergi_dairesi', ''),
            adres=request.POST.get('adres', ''),
            aktif_mi=request.POST.get('aktif_mi') == 'on'
        )
    tab = request.POST.get('current_tab', 'kurumlar')
    return redirect(f'/kurum-yonetimi/kurumlar/?tab={tab}')


@login_required
def kurum_delete(request, kurum_id):
    """Kurum sil"""
    if request.method == 'POST':
        kurum = get_object_or_404(Kurum, id=kurum_id)
        kurum.delete()
    return redirect('kurum:kurum_tanimlar')


@login_required
def kurum_update(request, kurum_id):
    """Kurum güncelle"""
    if request.method == 'POST':
        kurum = get_object_or_404(Kurum, id=kurum_id)
        kurum.ad = request.POST.get('ad')
        kurum.kod = request.POST.get('kod') or None
        kurum.yetkili_ad_soyad = request.POST.get('yetkili_ad_soyad', '')
        kurum.telefon_sabit = request.POST.get('telefon_sabit', '')
        kurum.telefon_cep = request.POST.get('telefon_cep', '')
        kurum.vergi_no = request.POST.get('vergi_no', '')
        kurum.vergi_dairesi = request.POST.get('vergi_dairesi', '')
        kurum.adres = request.POST.get('adres', '')
        kurum.aktif_mi = request.POST.get('aktif_mi') == 'on'
        kurum.save()
    tab = request.POST.get('current_tab', 'kurumlar')
    return redirect(f'/kurum-yonetimi/kurumlar/?tab={tab}')


@login_required
def sube_create(request):
    """Yeni şube oluştur"""
    if request.method == 'POST':
        sube = Sube.objects.create(
            kurum_id=request.POST.get('kurum'),
            ad=request.POST.get('ad'),
            kod=request.POST.get('kod') or None,
            adres=request.POST.get('adres', ''),
            telefon=request.POST.get('telefon', ''),
            aktif_mi=request.POST.get('aktif_mi') == 'on'
        )
    tab = request.POST.get('current_tab', 'subeler')
    return redirect(f'/kurum-yonetimi/kurumlar/?tab={tab}')


@login_required
def sube_delete(request, sube_id):
    """Şube sil"""
    if request.method == 'POST':
        sube = get_object_or_404(Sube, id=sube_id)
        sube.delete()
    return redirect('kurum:kurum_tanimlar')


@login_required
def sube_update(request, sube_id):
    """Şube güncelle"""
    if request.method == 'POST':
        sube = get_object_or_404(Sube, id=sube_id)
        sube.kurum_id = request.POST.get('kurum')
        sube.ad = request.POST.get('ad')
        sube.kod = request.POST.get('kod') or None
        sube.adres = request.POST.get('adres', '')
        sube.telefon = request.POST.get('telefon', '')
        sube.aktif_mi = request.POST.get('aktif_mi') == 'on'
        sube.save()
    tab = request.POST.get('current_tab', 'subeler')
    return redirect(f'/kurum-yonetimi/kurumlar/?tab={tab}')


@login_required
def egitim_yili_create(request):
    """Yeni eğitim yılı oluştur"""
    if request.method == 'POST':
        egitim_yili = EgitimYili.objects.create(
            baslangic_yil=int(request.POST.get('baslangic_yil')),
            bitis_yil=int(request.POST.get('bitis_yil')),
            aktif_mi=request.POST.get('aktif_mi') == 'on'
        )
    tab = request.POST.get('current_tab', 'egitim_yillari')
    return redirect(f'/kurum-yonetimi/kurumlar/?tab={tab}')


@login_required
def egitim_yili_delete(request, egitim_yili_id):
    """Eğitim yılı sil"""
    if request.method == 'POST':
        egitim_yili = get_object_or_404(EgitimYili, id=egitim_yili_id)
        egitim_yili.delete()
    return redirect('kurum:kurum_tanimlar')


@login_required
def egitim_yili_update(request, egitim_yili_id):
    """Eğitim yılı güncelle"""
    if request.method == 'POST':
        egitim_yili = get_object_or_404(EgitimYili, id=egitim_yili_id)
        egitim_yili.baslangic_yil = int(request.POST.get('baslangic_yil'))
        egitim_yili.bitis_yil = int(request.POST.get('bitis_yil'))
        egitim_yili.aktif_mi = request.POST.get('aktif_mi') == 'on'
        egitim_yili.save()
    tab = request.POST.get('current_tab', 'egitim_yillari')
    return redirect(f'/kurum-yonetimi/kurumlar/?tab={tab}')


# API Endpoints
@csrf_exempt
def api_kurum_list_create(request):
    """Kurum listele veya oluştur"""
    if request.method == 'GET':
        kurumlar = Kurum.objects.all().order_by('-id')
        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': k.id,
                    'ad': k.ad,
                    'kod': k.kod or '',
                    'aktif_mi': k.aktif_mi,
                }
                for k in kurumlar
            ]
        })
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            kurum = Kurum.objects.create(
                ad=data.get('ad'),
                kod=data.get('kod') or None,
                yetkili_ad_soyad=data.get('yetkili_ad_soyad', ''),
                telefon_sabit=data.get('telefon_sabit', ''),
                telefon_cep=data.get('telefon_cep', ''),
                vergi_no=data.get('vergi_no', ''),
                vergi_dairesi=data.get('vergi_dairesi', ''),
                adres=data.get('adres', ''),
                aktif_mi=data.get('aktif_mi', True)
            )
            apply_branding_fields(kurum, data)
            kurum.save()
            return JsonResponse({
                'success': True,
                'data': {'id': kurum.id, 'ad': kurum.ad}
            })
        except IntegrityError as e:
            resp = _kurum_save_error_response(e, data)
            if resp:
                return resp
            raise
        except Exception as e:
            resp = _kurum_save_error_response(e, data)
            if resp:
                return resp
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_kurum_detail(request, pk):
    """Kurum detay API - GET, PUT, DELETE"""
    kurum = get_object_or_404(Kurum, pk=pk)
    
    if request.method == 'GET':
        data = {
            'id': kurum.id,
            'ad': kurum.ad,
            'kod': kurum.kod or '',
            'yetkili_ad_soyad': kurum.yetkili_ad_soyad or '',
            'telefon_sabit': kurum.telefon_sabit or '',
            'telefon_cep': kurum.telefon_cep or '',
            'vergi_no': kurum.vergi_no or '',
            'vergi_dairesi': kurum.vergi_dairesi or '',
            'adres': kurum.adres or '',
            'aktif_mi': kurum.aktif_mi,
            **serialize_kurum_branding(kurum, request),
        }
        return JsonResponse({'success': True, 'data': data})
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            kurum.ad = data.get('ad', kurum.ad)
            kurum.kod = data.get('kod') or None
            kurum.yetkili_ad_soyad = data.get('yetkili_ad_soyad', '')
            kurum.telefon_sabit = data.get('telefon_sabit', '')
            kurum.telefon_cep = data.get('telefon_cep', '')
            kurum.vergi_no = data.get('vergi_no', '')
            kurum.vergi_dairesi = data.get('vergi_dairesi', '')
            kurum.adres = data.get('adres', '')
            kurum.aktif_mi = data.get('aktif_mi', True)
            apply_branding_fields(kurum, data)
            kurum.save()
            return JsonResponse({
                'success': True,
                'data': {'id': kurum.id, 'ad': kurum.ad}
            })
        except IntegrityError as e:
            resp = _kurum_save_error_response(e, data)
            if resp:
                return resp
            raise
        except Exception as e:
            resp = _kurum_save_error_response(e, data)
            if resp:
                return resp
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    elif request.method == 'DELETE':
        try:
            kurum.delete()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def api_kurum_delete_info(request, pk):
    """Kurum silme bilgisi - bağlı şube sayısı"""
    kurum = get_object_or_404(Kurum, pk=pk)
    sube_count = Sube.objects.filter(kurum=kurum).count()
    
    return JsonResponse({
        'success': True,
        'data': {
            'id': kurum.id,
            'ad': kurum.ad,
            'sube_count': sube_count,
            'has_children': sube_count > 0,
        }
    })


@csrf_exempt
def api_sube_list_create(request):
    """Şube listele veya oluştur"""
    if request.method == 'GET':
        subeler = Sube.objects.select_related('kurum').all().order_by('-id')
        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': s.id,
                    'ad': s.ad,
                    'kod': s.kod or '',
                    'aktif_mi': s.aktif_mi,
                    'kurum': {'id': s.kurum_id, 'ad': s.kurum.ad if s.kurum else ''},
                }
                for s in subeler
            ]
        })
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            kurum_id, err = _resolve_kurum_id_for_sube(data)
            if err:
                return err
            sube = Sube.objects.create(
                kurum_id=kurum_id,
                ad=data.get('ad'),
                kod=data.get('kod') or None,
            )
            apply_sube_fields(sube, data)
            sube.save()
            return JsonResponse({
                'success': True,
                'data': {'id': sube.id, 'ad': sube.ad}
            })
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_sube_detail(request, pk):
    """Şube detay API - GET, PUT, DELETE"""
    sube = get_object_or_404(Sube, pk=pk)
    
    if request.method == 'GET':
        return JsonResponse({'success': True, 'data': serialize_sube(sube, request)})
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            if 'kurum_id' in data:
                kurum_id, err = _resolve_kurum_id_for_sube(data)
                if err:
                    return err
            apply_sube_fields(sube, data)
            sube.save()
            return JsonResponse({
                'success': True,
                'data': serialize_sube(sube, request),
            })
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    elif request.method == 'DELETE':
        try:
            sube.delete()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def api_sube_delete_info(request, pk):
    """Şube silme bilgisi - bağlı eğitim yılı sayısı"""
    sube = get_object_or_404(Sube, pk=pk)
    egitim_yili_count = EgitimYili.objects.filter(sube=sube).count()
    
    return JsonResponse({
        'success': True,
        'data': {
            'id': sube.id,
            'ad': sube.ad,
            'egitim_yili_count': egitim_yili_count,
            'has_children': egitim_yili_count > 0,
        }
    })


@csrf_exempt
def api_egitim_yili_list_create(request):
    """Eğitim yılı listele veya oluştur"""
    if request.method == 'GET':
        yillar = EgitimYili.objects.all().order_by('-baslangic_yil')
        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': y.id,
                    'baslangic_yil': y.baslangic_yil,
                    'bitis_yil': y.bitis_yil,
                    'aktif_mi': y.aktif_mi,
                }
                for y in yillar
            ]
        })
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            egitim_yili = EgitimYili.objects.create(
                baslangic_yil=int(data.get('baslangic_yil')),
                bitis_yil=int(data.get('bitis_yil')),
                aktif_mi=data.get('aktif_mi', True)
            )
            return JsonResponse({
                'success': True,
                'data': {'id': egitim_yili.id, 'baslangic_yil': egitim_yili.baslangic_yil}
            })
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_egitim_yili_detail(request, pk):
    """Eğitim yılı detay API - GET, PUT, DELETE"""
    egitim_yili = get_object_or_404(EgitimYili, pk=pk)
    
    if request.method == 'GET':
        data = {
            'id': egitim_yili.id,
            'baslangic_yil': egitim_yili.baslangic_yil,
            'bitis_yil': egitim_yili.bitis_yil,
            'aktif_mi': egitim_yili.aktif_mi,
        }
        return JsonResponse({'success': True, 'data': data})
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            egitim_yili.baslangic_yil = int(data.get('baslangic_yil', egitim_yili.baslangic_yil))
            egitim_yili.bitis_yil = int(data.get('bitis_yil', egitim_yili.bitis_yil))
            egitim_yili.aktif_mi = data.get('aktif_mi', True)
            egitim_yili.save()
            return JsonResponse({
                'success': True,
                'data': {'id': egitim_yili.id}
            })
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    elif request.method == 'DELETE':
        try:
            egitim_yili.delete()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def api_egitim_yili_delete_info(request, pk):
    """Eğitim yılı silme bilgisi"""
    egitim_yili = get_object_or_404(EgitimYili, pk=pk)
    # Burada öğrenci sayısı kontrol edilebilir
    ogrenci_count = 0  # TODO: Öğrenci modeli bağlandığında güncelle
    
    return JsonResponse({
        'success': True,
        'data': {
            'id': egitim_yili.id,
            'ad': f"{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}",
            'ogrenci_count': ogrenci_count,
            'has_children': ogrenci_count > 0,
        }
    })


def api_kurum_subeler(request, kurum_id):
    """Kuruma bağlı şubeler API"""
    subeler = Sube.objects.filter(kurum_id=kurum_id, aktif_mi=True).values('id', 'ad')
    return JsonResponse({'success': True, 'data': list(subeler)})


def legacy_kurum_tanimlar_api(request):
    """Legacy kurum yönetimi sayfası için API"""
    kurumlar = Kurum.objects.all().order_by('-id')
    subeler = Sube.objects.select_related('kurum').all().order_by('-id')
    egitim_yillari = EgitimYili.objects.all().order_by('-baslangic_yil')

    return JsonResponse({
        'success': True,
        'data': {
            'kurumlar': [
                {
                    **serialize_kurum_branding(kurum, request),
                    'yetkili_ad_soyad': kurum.yetkili_ad_soyad or '',
                    'telefon_sabit': kurum.telefon_sabit or '',
                    'telefon_cep': kurum.telefon_cep or '',
                    'vergi_no': kurum.vergi_no or '',
                    'vergi_dairesi': kurum.vergi_dairesi or '',
                    'adres': kurum.adres or '',
                    'aktif_mi': kurum.aktif_mi,
                    'created_at': kurum.created_at.isoformat() if kurum.created_at else '',
                }
                for kurum in kurumlar
            ],
            'all_kurumlar': [
                {
                    'id': kurum.id,
                    'ad': kurum.ad,
                }
                for kurum in kurumlar.order_by('ad')
            ],
            'subeler': [
                {
                    **serialize_sube(sube, request),
                    'created_at': sube.created_at.isoformat() if sube.created_at else '',
                    'updated_at': sube.updated_at.isoformat() if sube.updated_at else '',
                }
                for sube in subeler
            ],
            'egitim_yillari': [
                {
                    'id': egitim_yili.id,
                    'baslangic_yil': egitim_yili.baslangic_yil,
                    'bitis_yil': egitim_yili.bitis_yil,
                    'aktif_mi': egitim_yili.aktif_mi,
                    'created_at': egitim_yili.created_at.isoformat() if egitim_yili.created_at else '',
                }
                for egitim_yili in egitim_yillari
            ],
        }
    })


@csrf_exempt
def api_set_active_context(request):
    """
    Aktif kurum, şube ve eğitim yılını session'a kaydet.
    Frontend Topbar'dan seçim yapıldığında bu endpoint çağrılır.
    Tüm sonraki API istekleri bu context'i kullanır.

    Not: aktif_mi alanı yalnızca askıya alma (durdu) bayrağıdır;
    bağlam seçimi bu alanı değiştirmez.
    """
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
    
    try:
        data = json.loads(request.body)
        
        kurum_id = data.get('kurum_id')
        sube_id = data.get('sube_id')
        egitim_yili_id = data.get('egitim_yili_id')

        kurum = None
        sube = None
        egitim_yili = None

        if kurum_id:
            kurum = get_object_or_404(Kurum, pk=kurum_id)
            if not kurum.aktif_mi:
                return JsonResponse(
                    {'success': False, 'error': 'Kurum askıya alınmış (aktif değil)'},
                    status=400,
                )
            request.session['active_kurum_id'] = kurum.id
            request.session['active_kurum_ad'] = kurum.ad

        if sube_id:
            sube = get_object_or_404(Sube, pk=sube_id)
            if not sube.aktif_mi:
                return JsonResponse(
                    {'success': False, 'error': 'Şube askıya alınmış (aktif değil)'},
                    status=400,
                )
            if kurum and sube.kurum_id != kurum.id:
                return JsonResponse(
                    {'success': False, 'error': 'Şube seçili kuruma ait değil'},
                    status=400,
                )
            request.session['active_sube_id'] = sube.id
            request.session['active_sube_ad'] = sube.ad
            if not kurum_id:
                request.session['active_kurum_id'] = sube.kurum_id
                request.session['active_kurum_ad'] = sube.kurum.ad

        if egitim_yili_id:
            egitim_yili = get_object_or_404(EgitimYili, pk=egitim_yili_id)
            request.session['active_egitim_yili_id'] = egitim_yili.id
            request.session['active_egitim_yili_str'] = (
                f"{egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}"
            )

        if request.user.is_authenticated and sube_id:
            from shared.sube_access import get_allowed_subeler_for_user

            allowed_ids = set(
                get_allowed_subeler_for_user(
                    request.user,
                    kurum_id=request.session.get('active_kurum_id'),
                    egitim_yili_id=egitim_yili_id or request.session.get('active_egitim_yili_id'),
                ).values_list('id', flat=True)
            )
            if allowed_ids and int(sube_id) not in allowed_ids:
                return JsonResponse(
                    {'success': False, 'error': 'Bu şubeye erişim yetkiniz yok'},
                    status=403,
                )
        
        request.session.modified = True
        
        return JsonResponse({
            'success': True,
            'message': 'Aktif context güncellendi',
            'context': {
                'kurum_id': request.session.get('active_kurum_id'),
                'kurum_ad': request.session.get('active_kurum_ad'),
                'sube_id': request.session.get('active_sube_id'),
                'sube_ad': request.session.get('active_sube_ad'),
                'egitim_yili_id': request.session.get('active_egitim_yili_id'),
                'egitim_yili_str': request.session.get('active_egitim_yili_str'),
            }
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
def api_kayit_turleri_list_create(request):
    """Öğrenci kayıt türü lookup seçenekleri — listele / oluştur"""
    from apps.kurum.services.kayit_tanimlari_service import (
        create_registration_type,
        list_registration_types,
        serialize_option,
    )

    if request.method == 'GET':
        include_inactive = request.GET.get('include_inactive') == '1'
        options = list_registration_types(include_inactive=include_inactive)
        return JsonResponse({
            'success': True,
            'data': [serialize_option(o) for o in options],
        })

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            option = create_registration_type(data)
            return JsonResponse({'success': True, 'data': serialize_option(option)})
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)
        except ValueError as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_kayit_turleri_detail(request, pk):
    """Kayıt türü — güncelle / sil"""
    from apps.kurum.services.kayit_tanimlari_service import (
        delete_registration_type,
        serialize_option,
        update_registration_type,
    )
    from apps.ogrenci_kayit.domain.models import LookupOption

    if request.method == 'GET':
        try:
            option = LookupOption.objects.select_related('category').get(
                id=pk,
                category__code='registration_type',
            )
            return JsonResponse({'success': True, 'data': serialize_option(option)})
        except LookupOption.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Kayıt bulunamadı'}, status=404)

    if request.method == 'PUT':
        try:
            data = json.loads(request.body)
            option = update_registration_type(pk, data)
            return JsonResponse({'success': True, 'data': serialize_option(option)})
        except LookupOption.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Kayıt bulunamadı'}, status=404)
        except ValueError as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    if request.method == 'DELETE':
        try:
            delete_registration_type(pk)
            return JsonResponse({'success': True})
        except LookupOption.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Kayıt bulunamadı'}, status=404)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_kayit_turleri_seed(request):
    """Varsayılan kayıt tanımlarını oluştur (kayıt türü + cinsiyet)"""
    from apps.kurum.services.kayit_tanimlari_service import (
        list_registration_types,
        seed_all_default_kayit_tanimlari,
        serialize_option,
    )

    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    created = seed_all_default_kayit_tanimlari()
    options = list_registration_types(include_inactive=True)
    return JsonResponse({
        'success': True,
        'created': created,
        'data': [serialize_option(o) for o in options],
    })


@csrf_exempt  
def api_get_active_context(request):
    """
    Mevcut aktif context'i döndür.
    Frontend sayfa yüklendiğinde bu endpoint'i çağırarak session'daki değerleri alabilir.
    """
    return JsonResponse({
        'success': True,
        'context': {
            'kurum_id': request.session.get('active_kurum_id'),
            'kurum_ad': request.session.get('active_kurum_ad'),
            'sube_id': request.session.get('active_sube_id'),
            'sube_ad': request.session.get('active_sube_ad'),
            'egitim_yili_id': request.session.get('active_egitim_yili_id'),
            'egitim_yili_str': request.session.get('active_egitim_yili_str'),
        }
    })


# ── Kurum Marka (white-label) ──

@csrf_exempt
def api_kurum_branding_public(request, kod):
    """Auth gerekmez — login sayfası için kurum markası."""
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    kurum = Kurum.objects.filter(kod__iexact=kod.strip(), aktif_mi=True).first()
    if not kurum:
        return JsonResponse({'success': False, 'error': 'Kurum bulunamadı'}, status=404)

    return JsonResponse({
        'success': True,
        'data': serialize_kurum_branding(kurum, request),
    })


def _upload_branding_file(request, entity, field_name, file_key, serializer_fn, allowed_types, max_mb=5):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'error': 'Yetkilendirme gerekli'}, status=401)

    if file_key not in request.FILES:
        return JsonResponse({'success': False, 'error': 'Dosya bulunamadı'}, status=400)

    uploaded = request.FILES[file_key]
    if uploaded.size > max_mb * 1024 * 1024:
        return JsonResponse({'success': False, 'error': f'Dosya boyutu {max_mb}MB\'dan küçük olmalıdır'}, status=400)

    content_type = (uploaded.content_type or '').lower()
    filename = (uploaded.name or '').lower()
    if allowed_types:
        ext = filename.rsplit('.', 1)[-1] if '.' in filename else ''
        ext_aliases = {
            'ico': {'image/x-icon', 'image/vnd.microsoft.icon', 'application/octet-stream'},
            'png': {'image/png', 'application/octet-stream'},
            'jpg': {'image/jpeg', 'application/octet-stream'},
            'jpeg': {'image/jpeg', 'application/octet-stream'},
            'webp': {'image/webp', 'application/octet-stream'},
            'svg': {'image/svg+xml', 'application/octet-stream'},
            'gif': {'image/gif', 'application/octet-stream'},
        }
        ext_ok = content_type in ext_aliases.get(ext, set())
        if content_type not in allowed_types and not ext_ok:
            return JsonResponse({'success': False, 'error': 'Geçersiz dosya tipi'}, status=400)

    try:
        old = getattr(entity, field_name)
        if old:
            old.delete(save=False)
        setattr(entity, field_name, uploaded)
        entity.save(update_fields=[field_name, 'updated_at'])
        branding = serializer_fn(entity, request)
        return JsonResponse({
            'success': True,
            'message': 'Dosya yüklendi',
            'data': branding,
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


def _upload_kurum_branding_file(request, kurum, field_name, file_key, allowed_types, max_mb=5):
    return _upload_branding_file(
        request, kurum, field_name, file_key, serialize_kurum_branding, allowed_types, max_mb,
    )


def _upload_sube_branding_file(request, sube, field_name, file_key, allowed_types, max_mb=5):
    return _upload_branding_file(
        request, sube, field_name, file_key, serialize_sube_branding, allowed_types, max_mb,
    )


@csrf_exempt
def api_kurum_branding_login_logo(request, pk):
    kurum = get_object_or_404(Kurum, pk=pk)
    return _upload_kurum_branding_file(
        request, kurum, 'login_logo', 'login_logo',
        allowed_types={'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'},
    )


@csrf_exempt
def api_kurum_branding_app_logo(request, pk):
    kurum = get_object_or_404(Kurum, pk=pk)
    return _upload_kurum_branding_file(
        request, kurum, 'app_logo', 'app_logo',
        allowed_types={'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'},
    )


@csrf_exempt
def api_kurum_branding_favicon(request, pk):
    kurum = get_object_or_404(Kurum, pk=pk)
    return _upload_kurum_branding_file(
        request, kurum, 'favicon', 'favicon',
        allowed_types={
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-icon',
            'image/vnd.microsoft.icon', 'image/svg+xml', 'application/octet-stream',
        },
        max_mb=2,
    )


@csrf_exempt
def api_sube_branding_login_logo(request, pk):
    sube = get_object_or_404(Sube, pk=pk)
    return _upload_sube_branding_file(
        request, sube, 'login_logo', 'login_logo',
        allowed_types={'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'},
    )


@csrf_exempt
def api_sube_branding_app_logo(request, pk):
    sube = get_object_or_404(Sube, pk=pk)
    return _upload_sube_branding_file(
        request, sube, 'app_logo', 'app_logo',
        allowed_types={'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'},
    )


@csrf_exempt
def api_sube_branding_favicon(request, pk):
    sube = get_object_or_404(Sube, pk=pk)
    return _upload_sube_branding_file(
        request, sube, 'favicon', 'favicon',
        allowed_types={
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/x-icon',
            'image/vnd.microsoft.icon', 'image/svg+xml', 'application/octet-stream',
        },
        max_mb=2,
    )
